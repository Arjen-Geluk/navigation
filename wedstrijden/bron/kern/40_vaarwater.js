// Vaarwater: bodem, verboden gebieden, bevaarbaarheid en padzoeken om ondiepten en zones heen.

// ---- lokale vlakke coördinaten in meters (ruim nauwkeurig genoeg voor het IJsselmeergebied) ----
const LAT0 = 52.7, LON0 = 5.3, M_LAT = 111200, M_LON = 111320 * Math.cos(52.7 * Math.PI / 180);
const naarXY = (lat, lon) => ({ x: (lon - LON0) * M_LON, y: (lat - LAT0) * M_LAT });
const naarLL = (x, y) => ({ lat: LAT0 + y / M_LAT, lon: LON0 + x / M_LON });
const afstandM = (a, b) => Math.hypot((a.lon - b.lon) * M_LON, (a.lat - b.lat) * M_LAT);
const NM = 1852;
// koers (graden, 0 = noord) van a naar b
const koersNaar = (a, b) => (Math.atan2((b.lon - a.lon) * M_LON, (b.lat - a.lat) * M_LAT) / Math.PI * 180 + 360) % 360;
// verplaatsing over d meter in koers k
const verplaats = (p, k, d) => ({ lat: p.lat + d * Math.cos(k * Math.PI / 180) / M_LAT, lon: p.lon + d * Math.sin(k * Math.PI / 180) / M_LON });
// kleinste hoek tussen twee richtingen (0–180)
const hoekVerschil = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// ---- bodem ----
// meta = vaargebied.bodem (west, noord, dlon, dlat, nx, ny), codes = Uint8Array (zie vaargebied.bodem.codering)
// uitsneden (optioneel): fijne rasters van 10 m rond havens en sluizen, 1 = water volgens TOP10NL
//   [{ id, west, noord, dlon, dlat, nx, ny, water: Uint8Array }]
// Binnen een uitsnede bepaalt de uitsnede wat water is; de diepte komt uit het grove raster, of is (zonder RWS-meting)
// de aangenomen havenbodem.
const HAVENBODEM_AANNAME = -3.0;          // m NAP; aanname voor havens zonder RWS-meting
function maakBodem(meta, codes, uitsneden = []) {
  if (codes.length !== meta.nx * meta.ny) throw new Error('bodemraster heeft de verkeerde grootte');
  return { ...meta, codes, cw: meta.dlon * M_LON, ch: meta.dlat * M_LAT, uitsneden };
}
function uitsnedeOp(B, lat, lon) {
  for (const u of B.uitsneden || []) {
    const i = Math.floor((lon - u.west) / u.dlon), j = Math.floor((u.noord - lat) / u.dlat);
    if (i >= 0 && j >= 0 && i < u.nx && j < u.ny) return { u, k: j * u.nx + i };
  }
  return null;
}
const celVan = (B, lat, lon) => {
  const i = Math.floor((lon - B.west) / B.dlon), j = Math.floor((B.noord - lat) / B.dlat);
  return i < 0 || j < 0 || i >= B.nx || j >= B.ny ? -1 : j * B.nx + i;
};
// verboden gebied van het vaargebied (gele A1-boeien, windparken, Marker Wadden): code 254 in het raster
const VERBODEN_CODE = 254;
const inVerbodenVaargebied = (B, lat, lon) => { const k = celVan(B, lat, lon); return k >= 0 && B.codes[k] === VERBODEN_CODE; };
const celMidden = (B, k) => ({ lat: B.noord - (Math.floor(k / B.nx) + 0.5) * B.dlat, lon: B.west + (k % B.nx + 0.5) * B.dlon });
// bodemhoogte in m NAP, of null (land, dijk of buiten het vaargebied)
function bodemOp(B, lat, lon) {
  const k = celVan(B, lat, lon);
  if (k < 0) return null;
  const c = B.codes[k];
  const f = uitsnedeOp(B, lat, lon);
  if (f) {
    if (!f.u.water[f.k] || c === 254) return null;                       // land volgens TOP10NL, of verboden gebied
    return c < 250 ? c / 10 - 25 : HAVENBODEM_AANNAME;                   // RWS-diepte, of de aanname in de haven
  }
  return c > 250 ? null : c / 10 - 25;      // 254 = verboden gebied, 255 = geen water
}

// ---- zones ----
function inPolygoon(p, poly) {           // p en poly in XY
  let binnen = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) binnen = !binnen;
  }
  return binnen;
}
function afstandTotLijnstuk(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
// in de zone of binnen marge meter van de rand
function inZone(p, z) {
  if (p.x < z.min.x - z.marge || p.x > z.max.x + z.marge || p.y < z.min.y - z.marge || p.y > z.max.y + z.marge) return false;
  if (inPolygoon(p, z.xy)) return true;
  for (let i = 0, j = z.xy.length - 1; i < z.xy.length; j = i++) if (afstandTotLijnstuk(p, z.xy[j], z.xy[i]) < z.marge) return true;
  return false;
}
function maakZone(z, marge) {
  const xy = z.punten.map(p => naarXY(p.lat, p.lon));
  return { id: z.id, naam: z.naam, regel: z.regel, marge, xy,
    min: { x: Math.min(...xy.map(p => p.x)), y: Math.min(...xy.map(p => p.y)) }, max: { x: Math.max(...xy.map(p => p.x)), y: Math.max(...xy.map(p => p.y)) } };
}

// ---- rekenomgeving ----
// instellingen: { peil (m NAP), kielspeling (m), marge_verboden_m, zones: [editie-zones, met actief] }
function maakVaarwater(B, P, instellingen) {
  const s = instellingen;
  const zones = (s.zones || []).filter(z => z.actief && z.regel === 'verboden').map(z => maakZone(z, s.marge_verboden_m ?? 50));
  const V = { B, P, peil: s.peil, kielspeling: s.kielspeling, zones, maskers: {}, paden: new Map() };
  V.romp = diepgangBij(P, 'op');
  V.grens = s.peil - V.romp - s.kielspeling;          // bodem moet dieper liggen dan dit (romp, zwaard op)
  V.masker = maakMasker(V, V.romp);           // harde grens: de romp (zwaard op) en de verboden gebieden
  return V;
}
// 1 = bevaarbaar voor deze diepgang en buiten de verboden gebieden
function maakMasker(V, diepgang) {
  const B = V.B, m = new Uint8Array(B.nx * B.ny), grens = V.peil - diepgang - V.kielspeling;   // bodem moet dieper liggen dan dit
  for (let k = 0; k < m.length; k++) { const c = B.codes[k]; m[k] = c <= 250 && c / 10 - 25 <= grens + 1e-9 ? 1 : 0; }
  for (const u of B.uitsneden || []) {
    const open = new Map();
    for (let j = 0; j < u.ny; j++) for (let i = 0; i < u.nx; i++) {
      const lat = u.noord - (j + 0.5) * u.dlat, lon = u.west + (i + 0.5) * u.dlon, k = celVan(B, lat, lon);
      if (k < 0) continue;
      if (!open.has(k)) open.set(k, 0);
      const b = u.water[j * u.nx + i] ? bodemOp(B, lat, lon) : null;
      if (b != null && b <= grens + 1e-9) open.set(k, 1);
    }
    for (const [k, v] of open) m[k] = v;
  }
  for (const z of V.zones) {
    const a = naarLL(z.min.x - z.marge, z.max.y + z.marge), b = naarLL(z.max.x + z.marge, z.min.y - z.marge);
    const i0 = Math.max(0, Math.floor((a.lon - B.west) / B.dlon)), i1 = Math.min(B.nx - 1, Math.ceil((b.lon - B.west) / B.dlon));
    const j0 = Math.max(0, Math.floor((B.noord - a.lat) / B.dlat)), j1 = Math.min(B.ny - 1, Math.ceil((B.noord - b.lat) / B.dlat));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * B.nx + i, c = celMidden(B, k);
      if (m[k] && inZone(naarXY(c.lat, c.lon), z)) m[k] = 0;
    }
  }
  return m;
}
// Waterdiepte bij het ingestelde peil (m), of null.
function diepteOp(V, lat, lon) { const b = bodemOp(V.B, lat, lon); return b == null ? null : V.peil - b; }
// Bevaarbaar voor een diepgang: genoeg water (diepgang + kielspeling) en buiten de verboden gebieden.
function bevaarbaar(V, lat, lon, diepgang) {
  const d = diepteOp(V, lat, lon);
  if (d == null || d < diepgang + V.kielspeling) return false;
  const p = naarXY(lat, lon);
  return !V.zones.some(z => inZone(p, z));
}
const inVerbodenZone = (V, lat, lon) => { const p = naarXY(lat, lon); return V.zones.find(z => inZone(p, z)) || null; };

// ---- padzoeken ----
// Vrij zicht: de rechte lijn van a naar b gaat alleen door open cellen van het masker.
function vrijZicht(V, a, b, m = V.masker) {
  const d = afstandM(a, b), n = Math.max(1, Math.ceil(d / 20));
  const fijn = m === V.masker && (V.B.uitsneden || []).length, stap = fijn ? Math.max(n, Math.ceil(d / 5)) : n;
  for (let s = 0; s <= stap; s++) {
    const lat = a.lat + (b.lat - a.lat) * s / stap, lon = a.lon + (b.lon - a.lon) * s / stap;
    if (fijn && uitsnedeOp(V.B, lat, lon)) {
      const bo = bodemOp(V.B, lat, lon);
      if (bo == null || bo > V.grens + 1e-9 || inVerbodenZone(V, lat, lon)) return false;
      continue;
    }
    const k = celVan(V.B, lat, lon);
    if (k < 0 || !m[k]) return false;
  }
  return true;
}
// dichtstbijzijnde open cel (binnen maxM meter), of -1
function naasteOpen(V, p, maxM = 1500) {
  const B = V.B, k0 = celVan(B, p.lat, p.lon);
  if (k0 >= 0 && V.masker[k0]) return k0;
  const i0 = Math.floor((p.lon - B.west) / B.dlon), j0 = Math.floor((B.noord - p.lat) / B.dlat), rmax = Math.ceil(maxM / Math.min(B.cw, B.ch));
  let best = -1, bestD = Infinity;
  for (let r = 1; r <= rmax && best < 0; r++) for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
    if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r || i < 0 || j < 0 || i >= B.nx || j >= B.ny) continue;
    const k = j * B.nx + i;
    if (!V.masker[k]) continue;
    const d = afstandM(p, celMidden(B, k));
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}
// A* over het raster (8 buren), daarna de bocht eruit trekken (zichtlijnen). Geeft [a, …tussenpunten, b] of null.
function zoekPad(V, a, b) {
  const sleutel = `${a.lat.toFixed(6)},${a.lon.toFixed(6)}>${b.lat.toFixed(6)},${b.lon.toFixed(6)}`;
  if (V.paden.has(sleutel)) return V.paden.get(sleutel);
  let pad = null;
  if (vrijZicht(V, a, b)) pad = [a, b];
  else {
    const B = V.B, start = naasteOpen(V, a), doel = naasteOpen(V, b);
    if (start >= 0 && doel >= 0) {
      const cel = rasterAster(V, start, doel);
      if (cel) {
        const punten = [a, ...cel.map(k => celMidden(B, k)), b];
        pad = [a];
        let i = 0;
        while (i < punten.length - 1) {
          let j = punten.length - 1;
          while (j > i + 1 && !vrijZicht(V, punten[i], punten[j])) j--;
          pad.push(punten[j]); i = j;
        }
      }
    }
  }
  V.paden.set(sleutel, pad);
  return pad;
}
function rasterAster(V, start, doel) {
  const B = V.B, nx = B.nx, cw = B.cw, ch = B.ch, cd = Math.hypot(cw, ch), m = V.masker;
  const g = new Float32Array(B.nx * B.ny).fill(Infinity), vorige = new Int32Array(B.nx * B.ny).fill(-1), klaar = new Uint8Array(B.nx * B.ny);
  const di = doel % nx, dj = Math.floor(doel / nx);
  const h = k => { const ax = Math.abs(k % nx - di) * cw, ay = Math.abs(Math.floor(k / nx) - dj) * ch; return Math.max(ax, ay) + (Math.SQRT2 - 1) * Math.min(ax, ay) * 0.999; };
  const hoop = [], f = [];                       // binaire hoop op f
  const duw = (k, fk) => { hoop.push(k); f.push(fk); let i = hoop.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (f[p] <= f[i]) break; [hoop[p], hoop[i]] = [hoop[i], hoop[p]]; [f[p], f[i]] = [f[i], f[p]]; i = p; } };
  const pak = () => { const k = hoop[0], lk = hoop.pop(), lf = f.pop(); if (hoop.length) { hoop[0] = lk; f[0] = lf; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < hoop.length && f[l] < f[s]) s = l; if (r < hoop.length && f[r] < f[s]) s = r; if (s === i) break; [hoop[s], hoop[i]] = [hoop[i], hoop[s]]; [f[s], f[i]] = [f[i], f[s]]; i = s; } } return k; };
  g[start] = 0; duw(start, h(start));
  const buren = [[1, 0, cw], [-1, 0, cw], [0, 1, ch], [0, -1, ch], [1, 1, cd], [1, -1, cd], [-1, 1, cd], [-1, -1, cd]];
  while (hoop.length) {
    const k = pak();
    if (klaar[k]) continue;
    if (k === doel) break;
    klaar[k] = 1;
    const i = k % nx, j = Math.floor(k / nx);
    for (const [ddi, ddj, c] of buren) {
      const ii = i + ddi, jj = j + ddj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= B.ny) continue;
      const n = jj * nx + ii;
      if (!m[n] || klaar[n]) continue;
      if (ddi && ddj && (!m[j * nx + ii] || !m[jj * nx + i])) continue;   // niet schuin langs een hoek
      const gn = g[k] + c;
      if (gn < g[n]) { g[n] = gn; vorige[n] = k; duw(n, gn + h(n)); }
    }
  }
  if (g[doel] === Infinity) return null;
  const pad = [];
  for (let k = doel; k >= 0; k = vorige[k]) pad.push(k);
  return pad.reverse();
}
