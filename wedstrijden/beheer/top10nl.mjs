// Eenmalig: de grens van land en water uit TOP10NL (Kadaster, schaal 1:10.000) via de PDOK-kaartdienst.
// Het RWS-bodemraster is een dieptemeting, geen landkaart; TOP10NL heeft havens, dammen en strekdammen wel goed.
//
//   npm run top10nl        haalt de watervlakken op en schrijft gegevens/water_top10nl_50m.bin (+ .json)
//
// Per cel van het bodemraster (50 m) telt het script hoeveel van de 10 × 10 monsterpunten (elke 5 m) water zijn volgens
// TOP10NL. Het ververs-script gebruikt dit bestand: minder dan driekwart water = land. Opnieuw draaien is alleen nodig als
// het rasterformaat van het vaargebied verandert, of als je een nieuwere TOP10NL wilt.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { leesJson, schrijfJson } from './lib/json.mjs';

const MAP = join(dirname(fileURLToPath(import.meta.url)), '..');
const WMS = 'https://service.pdok.nl/brt/top10nl/wms/v1_0';
const vg = leesJson(join(MAP, 'gegevens', 'vaargebied_ijsselmeergebied.json'));
const g = vg.bodem;                                  // zelfde raster als de bodem
const K = 10;                                        // monsterpunten per cel per richting (elke 5 m bij 50 m; de kaartdienst tekent pas vanaf ca. 6 m per pixel)
const TEGEL = 100;                                   // cellen per tegel per richting → 1000 × 1000 px

// water: blauwe pixels van de laag waterdeel (vlakken lichtblauw, smalle waterlopen als blauwe lijn); niet de zwarte symbolen
const isWater = (r, gr, b, a) => a > 128 && b > 150 && b > r + 20;

if (process.argv.includes('--havens')) { await havens(); process.exit(0); }
const telling = new Uint8Array(g.nx * g.ny);
let n = 0;
const tegels = [];
for (let j0 = 0; j0 < g.ny; j0 += TEGEL) for (let i0 = 0; i0 < g.nx; i0 += TEGEL) tegels.push([i0, j0, Math.min(TEGEL, g.nx - i0), Math.min(TEGEL, g.ny - j0)]);
async function tegel([i0, j0, w, h]) {
  const west = g.west + i0 * g.dlon, oost = west + w * g.dlon, noord = g.noord - j0 * g.dlat, zuid = noord - h * g.dlat;
  const url = `${WMS}?service=WMS&version=1.3.0&request=GetMap&layers=waterdeel&styles=&crs=EPSG:4326`
    + `&bbox=${zuid},${west},${noord},${oost}&width=${w * K}&height=${h * K}&format=image/png&transparent=true`;
  for (let poging = 1; ; poging++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'navigation-wedstrijden-beheer/1' }, signal: AbortSignal.timeout(120000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const png = PNG.sync.read(Buffer.from(await r.arrayBuffer()));
      if (png.width !== w * K || png.height !== h * K) throw new Error(`tegel ${png.width}x${png.height}`);
      for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
        const p = 4 * (y * png.width + x), d = png.data;
        if (isWater(d[p], d[p + 1], d[p + 2], d[p + 3])) telling[(j0 + Math.floor(y / K)) * g.nx + i0 + Math.floor(x / K)]++;
      }
      process.stdout.write(`\r  tegel ${++n}/${tegels.length}   `);
      return;
    } catch (e) {
      if (poging >= 3) throw new Error(`${e.message} bij ${url}`);
      await new Promise(z => setTimeout(z, 3000 * poging));
    }
  }
}
for (let i = 0; i < tegels.length; i += 4) await Promise.all(tegels.slice(i, i + 4).map(tegel));
process.stdout.write('\n');

const gz = gzipSync(telling, { level: 9 }); gz[4] = gz[5] = gz[6] = gz[7] = 0;
writeFileSync(join(MAP, 'gegevens', 'water_top10nl_50m.bin'), gz);
const vandaag = new Date().toISOString().slice(0, 10);
schrijfJson(join(MAP, 'gegevens', 'water_top10nl.json'), {
  formaat: 'watermasker/1', bron: `TOP10NL (Kadaster) via PDOK, laag waterdeel: ${WMS}`, licentie: 'CC BY 4.0 (Kadaster)', opgehaald: vandaag,
  raster: { west: g.west, noord: g.noord, dlon: g.dlon, dlat: g.dlat, nx: g.nx, ny: g.ny, cel_m: g.cel_m },
  codering: `1 byte per cel (zelfde raster als het bodembestand): aantal van de ${K} × ${K} monsterpunten dat water is (0..${K * K})`,
  monsterpunten: K * K, sha256: createHash('sha256').update(telling).digest('hex')
});
const water = telling.reduce((s, c) => s + (c >= Math.ceil(0.75 * K * K)), 0);
console.log(`✓ gegevens/water_top10nl_50m.bin: ${(gz.length / 1024).toFixed(0)} kB, ${water} cellen voor driekwart of meer water`);

// ---- --havens: fijne uitsneden van 10 m rond havens en sluizen (kaders uit vaargebied.havens) ----
async function havens() {
  const metaPad = join(MAP, 'gegevens', 'water_top10nl.json'), meta = leesJson(metaPad);
  const dlat = +(10 / 111200).toFixed(7), dlon = +(10 / (111320 * Math.cos(52.7 * Math.PI / 180))).toFixed(7), S = 2;   // 2 × 2 pixels van 5 m per cel
  const delen = [], index = [];
  let offset = 0;
  for (const h of vg.havens || []) {
    const k = h.kader, nx = Math.ceil((k.oost - k.west) / dlon), ny = Math.ceil((k.noord - k.zuid) / dlat);
    const water = new Uint8Array(nx * ny);
    for (let j0 = 0; j0 < ny; j0 += 500) for (let i0 = 0; i0 < nx; i0 += 500) {
      const w = Math.min(500, nx - i0), hh = Math.min(500, ny - j0);
      const west = k.west + i0 * dlon, noord = k.noord - j0 * dlat;
      const url = `${WMS}?service=WMS&version=1.3.0&request=GetMap&layers=waterdeel&styles=&crs=EPSG:4326`
        + `&bbox=${noord - hh * dlat},${west},${noord},${west + w * dlon}&width=${w * S}&height=${hh * S}&format=image/png&transparent=true`;
      const r = await fetch(url, { headers: { 'User-Agent': 'navigation-wedstrijden-beheer/1' }, signal: AbortSignal.timeout(120000) });
      if (!r.ok) throw new Error(`HTTP ${r.status} bij ${url}`);
      const png = PNG.sync.read(Buffer.from(await r.arrayBuffer())), d = png.data, tel = new Uint8Array(w * hh);
      for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
        const p = 4 * (y * png.width + x);
        if (isWater(d[p], d[p + 1], d[p + 2], d[p + 3])) tel[Math.floor(y / S) * w + Math.floor(x / S)]++;
      }
      for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) water[(j0 + j) * nx + i0 + i] = tel[j * w + i] >= 2 ? 1 : 0;
    }
    delen.push(water);
    index.push({ id: h.id, west: k.west, noord: k.noord, dlon, dlat, nx, ny, offset });
    offset += water.length;
    console.log(`  ${h.id}: ${nx} × ${ny} cellen van 10 m, ${water.reduce((s, v) => s + v, 0)} water`);
  }
  const alles = new Uint8Array(offset); delen.forEach((d, i) => alles.set(d, index[i].offset));
  const gz = gzipSync(alles, { level: 9 }); gz[4] = gz[5] = gz[6] = gz[7] = 0;
  writeFileSync(join(MAP, 'gegevens', 'havens_top10nl_10m.bin'), gz);
  meta.havens = { bestand: 'havens_top10nl_10m.bin', cel_m: 10, opgehaald: new Date().toISOString().slice(0, 10),
    codering: '1 byte per cel van 10 m, per uitsnede rij voor rij van noord naar zuid: 1 = water volgens TOP10NL, 0 = land',
    uitsneden: index, sha256: createHash('sha256').update(alles).digest('hex') };
  schrijfJson(metaPad, meta);
  console.log(`✓ gegevens/havens_top10nl_10m.bin: ${(gz.length / 1024).toFixed(0)} kB voor ${index.length} uitsneden`);
}
