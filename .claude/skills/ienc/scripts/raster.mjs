// Land en water uit de IENC (Inland ENC van Rijkswaterstaat), voor het vaargebied en de havenuitsneden.
//
// Water = dieptegebieden (DEPARE/depare; in het IJsselmeergebied markeren die alleen "water", zonder diepte), gebaggerde
// gebieden (DRGARE), sluiskolken (lokbsn) en havenbekkens (hrbbsn). Land (LNDARE: ook dammen, leidammen en eilanden)
// gaat altijd voor. De diepte blijft uit de RWS-bodemhoogte komen.
//
// Per cel wordt geteld hoeveel monsterpunten water zijn (even-oneven scanline per object, dus gaten tellen mee).
//
//   node raster.mjs --enc <ENC_ROOT> --bbox w,z,o,n --cel 50 --k 10 [--randen] --uit bestand.bin
//
//   --enc     map met CATALOG.031 (uitgepakte RWS-zip), bijv. lokaal/ienc/nederland/ENC_ROOT
//   --bbox    west,zuid,oost,noord in graden WGS84
//   --cel     celgrootte in meter (standaard 50); dlat = cel/111200, dlon = cel/(111320·cos 52,7°)
//   --k       monsters per cel per richting, k × k per cel (standaard 10, hoogstens 15: 1 byte per cel)
//   --randen  randen van land als doorlopende lijn land tekenen (smalle dammen en leidammen)
//   --uit     gzip met 1 byte per cel: aantal watermonsters, rij voor rij van noord naar zuid, per rij van west
//             naar oost; daarnaast <uit zonder .bin>.json met het raster en de gebruikte cellen
//
// Als module: import { iencVlakken, telWater, maakRaster } from './raster.mjs';
//   const { cellen, vlakken } = iencVlakken(encRoot, { west, zuid, oost, noord });
//   const telling = telWater(vlakken, maakRaster([w, z, o, n], 50), 10);   // Uint8Array, nx × ny
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { gebied as iencGebied } from './gebied.mjs';

const WATER = ['DEPARE', 'depare', 'DRGARE', 'lokbsn', 'hrbbsn'], LAND = ['LNDARE'];

// alle polygonen uit de IENC voor een gebied (eenmaal lezen, voor alle rasters)
export function iencVlakken(encRoot, kader) {
  const { cellen, themas } = iencGebied(encRoot, [kader.west, kader.zuid, kader.oost, kader.noord], { klassen: [...WATER, ...LAND], beschrijf: false });
  const vlakken = [];
  for (const f of themas.selectie.features) {
    const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    const water = WATER.includes(f.properties.klasse);
    for (const p of polys) {
      let w = Infinity, o = -Infinity, z = Infinity, n = -Infinity;
      for (const r of p) for (const [lon, lat] of r) { w = Math.min(w, lon); o = Math.max(o, lon); z = Math.min(z, lat); n = Math.max(n, lat); }
      vlakken.push({ water, ringen: p, w, o, z, n });
    }
  }
  return { cellen, vlakken };
}

// Telt per cel van een raster { west, noord, dlon, dlat, nx, ny } het aantal watermonsters (k × k per cel).
// Werkt in banden van rijen zodat het geheugen klein blijft.
// randen: ook de randen van land als land tekenen (doorlopend, 4-verbonden), zodat smalle dammen en leidammen
// een gesloten lijn worden in plaats van losse stippen; voor de fijne havenuitsneden.
export function telWater(vlakken, raster, k, { randen = false } = {}) {
  const { west, noord, dlon, dlat, nx, ny } = raster, NX = nx * k, dx = dlon / k, dy = dlat / k;
  const telling = new Uint8Array(nx * ny), BAND = 64 * k;                       // monsterrijen per band
  const masker = new Uint8Array(NX * BAND);
  const vul = (v, j0, j1, waarde) => {
    const ringen = v.ringen.map(r => r.map(([lon, lat]) => [(lon - west) / dx, (noord - lat) / dy]));
    const ya = Math.max(j0, Math.floor((noord - v.n) / dy)), yb = Math.min(j1 - 1, Math.ceil((noord - v.z) / dy));
    for (let j = ya; j <= yb; j++) {
      const y = j + 0.5, xs = [];
      for (const r of ringen) for (let i = 0, q = r.length - 1; i < r.length; q = i++) {
        const [xa, yA] = r[q], [xb, yB] = r[i];
        if ((yA > y) !== (yB > y)) xs.push(xa + (y - yA) * (xb - xa) / (yB - yA));
      }
      xs.sort((a, b) => a - b);
      for (let s = 0; s + 1 < xs.length; s += 2) {
        const a = Math.max(0, Math.ceil(xs[s] - 0.5)), e = Math.min(NX - 1, Math.floor(xs[s + 1] - 0.5));
        if (a <= e) masker.fill(waarde, (j - j0) * NX + a, (j - j0) * NX + e + 1);
      }
    }
  };
  const zet = (x, y, j0, j1) => { if (y >= j0 && y < j1 && x >= 0 && x < NX) masker[(y - j0) * NX + x] = 0; };
  const rand = (v, j0, j1) => {
    for (const r of v.ringen) for (let i = 1; i < r.length; i++) {
      const xa = (r[i - 1][0] - west) / dx, ya = (noord - r[i - 1][1]) / dy, xb = (r[i][0] - west) / dx, yb = (noord - r[i][1]) / dy;
      if (Math.max(ya, yb) < j0 - 1 || Math.min(ya, yb) > j1 + 1) continue;
      const n = Math.ceil(Math.max(Math.abs(xb - xa), Math.abs(yb - ya)) * 2) + 1;
      for (let s = 0; s <= n; s++) {
        const x = Math.floor(xa + (xb - xa) * s / n), y = Math.floor(ya + (yb - ya) * s / n);
        zet(x, y, j0, j1); zet(x + 1, y, j0, j1);                      // dubbel breed: geen diagonale lekken
      }
    }
  };
  for (let j0 = 0; j0 < ny * k; j0 += BAND) {
    const j1 = Math.min(ny * k, j0 + BAND), latN = noord - j0 * dy, latZ = noord - j1 * dy;
    masker.fill(0);
    for (const v of vlakken) if (v.water && v.n >= latZ && v.z <= latN && v.o >= west && v.w <= west + nx * dlon) vul(v, j0, j1, 1);
    for (const v of vlakken) if (!v.water && v.n >= latZ && v.z <= latN && v.o >= west && v.w <= west + nx * dlon) { vul(v, j0, j1, 0); if (randen) rand(v, j0, j1); }
    for (let j = j0; j < j1; j++) {
      const rij = (j - j0) * NX, cj = Math.floor(j / k) * nx;
      for (let i = 0; i < NX; i++) if (masker[rij + i]) telling[cj + Math.floor(i / k)]++;
    }
  }
  return telling;
}

// raster { west, noord, dlon, dlat, nx, ny } voor een kader [w, z, o, n] en een celgrootte in meter
export function maakRaster([w, z, o, n], cel) {
  const dlat = cel / 111200, dlon = cel / (111320 * Math.cos(52.7 * Math.PI / 180));
  return { west: w, noord: n, dlon, dlat, nx: Math.ceil((o - w) / dlon - 1e-9), ny: Math.ceil((n - z) / dlat - 1e-9) };
}

const isHoofd = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isHoofd) {
  const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : undefined; };
  const enc = arg('enc'), bboxTekst = arg('bbox'), uit = arg('uit');
  const cel = Number(arg('cel') ?? 50), k = Number(arg('k') ?? 10), randen = process.argv.includes('--randen');
  if (!enc || !bboxTekst || !uit) { console.error('Gebruik: node raster.mjs --enc <ENC_ROOT> --bbox w,z,o,n [--cel 50] [--k 10] [--randen] --uit bestand.bin'); process.exit(1); }
  if (!(Number.isInteger(k) && k >= 1 && k <= 15)) { console.error('--k moet een geheel getal van 1 t/m 15 zijn (k × k moet in 1 byte passen)'); process.exit(1); }
  if (!(cel > 0)) { console.error('--cel moet een positief aantal meter zijn'); process.exit(1); }
  const bbox = bboxTekst.split(',').map(Number);
  if (bbox.length !== 4 || bbox.some(Number.isNaN)) { console.error('--bbox: west,zuid,oost,noord'); process.exit(1); }
  const t0 = Date.now();
  const raster = maakRaster(bbox, cel);
  const { cellen, vlakken } = iencVlakken(enc, { west: bbox[0], zuid: bbox[1], oost: bbox[2], noord: bbox[3] });
  const telling = telWater(vlakken, raster, k, { randen });
  mkdirSync(dirname(uit), { recursive: true });
  writeFileSync(uit, gzipSync(telling));
  const metaPad = uit.replace(/\.bin$/i, '') + '.json';
  const meta = { ...raster, k, cel_m: cel, randen, bbox, cellen: cellen.map(c => ({ naam: c.naam, editie: c.editie, uitgifte: c.uitgifte })) };
  writeFileSync(metaPad, JSON.stringify(meta, null, 1));
  let water = 0, deels = 0;
  for (const t of telling) { if (t === k * k) water++; else if (t) deels++; }
  console.log(`${cellen.length} cellen: ${cellen.map(c => `${c.naam} (ed. ${c.editie}, ${c.uitgifte})`).join(', ')}`);
  console.log(`raster ${raster.nx} × ${raster.ny} van ${cel} m, k ${k}${randen ? ', randen' : ''}: ${water} water, ${deels} deels, ${telling.length - water - deels} land (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  console.log(`${uit}\n${metaPad}`);
}
