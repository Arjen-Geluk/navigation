// Land en water uit de IENC (Inland ENC van Rijkswaterstaat), voor het vaargebied en de havenuitsneden.
//
// Water = dieptegebieden (DEPARE/depare; in het IJsselmeergebied markeren die alleen "water", zonder diepte), gebaggerde
// gebieden (DRGARE), sluiskolken (lokbsn) en havenbekkens (hrbbsn). Land (LNDARE: ook dammen, leidammen en eilanden)
// gaat altijd voor. De diepte blijft uit de RWS-bodemhoogte komen.
//
// Per cel wordt geteld hoeveel monsterpunten water zijn (even-oneven scanline per object, dus gaten tellen mee).
import { gebied as iencGebied } from '../../../.claude/skills/ienc/scripts/gebied.mjs';

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
