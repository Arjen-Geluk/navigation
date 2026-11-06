// Verboden gebieden voor het hele vaargebied, afgeleid bij het verversen en ingebakken in het bodemraster (code 254).
//
// 1. Gele boeien met topteken A1 (rood-wit-rood): "verboden toegang". Per groep (naam zonder volgnummer, bijv. VF-OW, SB-OW, FR)
//    worden de boeien in volgorde tot een lijn verbonden; de uiteinden worden naar het dichtstbijzijnde land doorgetrokken.
//    Water dat daarna niet meer bereikbaar is vanaf het open water, ligt achter de lijn en is verboden.
// 2. Windparken in het water: windturbines uit OpenStreetMap die in het water staan, gegroepeerd; het gebied binnen de
//    omtrek van een groep plus 150 m is verboden.
// 3. Marker Wadden: omtrek uit OpenStreetMap plus 50 m (de eilanden staan niet in de bodemopname van 2022).
import { afstandM } from './rd.mjs';

export const GEEN_WATER = 255, VERBODEN = 254;
export const OVERPASS = 'https://overpass-api.de/api/interpreter';
const M_LAT = 111200, M_LON = 111320 * Math.cos(52.7 * Math.PI / 180);
const naarXY = (lat, lon) => ({ x: lon * M_LON, y: lat * M_LAT });

export async function haalOsm(gebied, cachePad) {
  const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
  let laatsteFout;
  for (let poging = 1; poging <= 3; poging++) {
    try {
      const el = await haalOsmEenmaal(gebied);
      if (cachePad) writeFileSync(cachePad, JSON.stringify({ opgehaald: new Date().toISOString(), elementen: el }));
      return { elementen: el, uitCache: null };
    } catch (e) { laatsteFout = e; await new Promise(z => setTimeout(z, 5000 * poging)); }
  }
  if (cachePad && existsSync(cachePad)) { const c = JSON.parse(readFileSync(cachePad, 'utf8')); return { elementen: c.elementen, uitCache: c.opgehaald, fout: laatsteFout.message }; }
  throw laatsteFout;
}
async function haalOsmEenmaal(gebied) {
  const bbox = `${gebied.zuid},${gebied.west},${gebied.noord},${gebied.oost}`;
  const q = `[out:json][timeout:120];(node["generator:source"="wind"](${bbox});relation["name"="Marker Wadden"];way["name"="Marker Wadden"];relation["name"~"Marker Wadden"]["place"];);out geom;`;
  const r = await fetch(OVERPASS, { method: 'POST', headers: { 'User-Agent': 'navigation-wedstrijden-ververs/1', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw new Error(`OpenStreetMap (Overpass): HTTP ${r.status}`);
  return (await r.json()).elements;
}

// ---- rasterhulpjes ----
function raster(r) {
  const cel = (lat, lon) => { const i = Math.floor((lon - r.west) / r.dlon), j = Math.floor((r.noord - lat) / r.dlat); return i < 0 || j < 0 || i >= r.nx || j >= r.ny ? -1 : j * r.nx + i; };
  const midden = k => ({ lat: r.noord - (Math.floor(k / r.nx) + 0.5) * r.dlat, lon: r.west + (k % r.nx + 0.5) * r.dlon });
  // alle cellen binnen een kader (graden) doorlopen
  const kader = (zuid, west, noord, oost, f) => {
    const i0 = Math.max(0, Math.floor((west - r.west) / r.dlon)), i1 = Math.min(r.nx - 1, Math.ceil((oost - r.west) / r.dlon));
    const j0 = Math.max(0, Math.floor((r.noord - noord) / r.dlat)), j1 = Math.min(r.ny - 1, Math.ceil((r.noord - zuid) / r.dlat));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(j * r.nx + i);
  };
  return { cel, midden, kader };
}
function inRing(p, ring) {
  let binnen = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) binnen = !binnen;
  }
  return binnen;
}
function afstandTotRing(p, ring) {
  let min = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i], dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
    min = Math.min(min, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return min;
}
// convexe omhullende (monotone chain) van punten in XY
function omhullende(pts) {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y), kruis = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const onder = [], boven = [];
  for (const q of p) { while (onder.length >= 2 && kruis(onder[onder.length - 2], onder[onder.length - 1], q) <= 0) onder.pop(); onder.push(q); }
  for (const q of p.reverse()) { while (boven.length >= 2 && kruis(boven[boven.length - 2], boven[boven.length - 1], q) <= 0) boven.pop(); boven.push(q); }
  return onder.slice(0, -1).concat(boven.slice(0, -1));
}
// cellen in of binnen `marge` m van een ring (XY) op VERBODEN zetten; geeft het aantal nieuwe cellen
function markeerRing(r, R, ring, marge) {
  const lat = ring.map(p => p.y / M_LAT), lon = ring.map(p => p.x / M_LON), dl = marge / M_LAT, dn = marge / M_LON;
  let n = 0;
  R.kader(Math.min(...lat) - dl, Math.min(...lon) - dn, Math.max(...lat) + dl, Math.max(...lon) + dn, k => {
    if (r.codes[k] === GEEN_WATER || r.codes[k] === VERBODEN) return;
    const c = R.midden(k), p = naarXY(c.lat, c.lon);
    if (inRing(p, ring) || afstandTotRing(p, ring) < marge) { r.codes[k] = VERBODEN; n++; }
  });
  return n;
}

// bereikbaar water vanaf de startpunten, zonder door land, verboden cellen of de barrière te gaan
function bereikbaar(r, R, zaden, barriere) {
  const b = new Uint8Array(r.codes.length), rij = [];
  for (const z of zaden) { const k = R.cel(z.lat, z.lon); if (k >= 0 && r.codes[k] < VERBODEN && !barriere[k]) { b[k] = 1; rij.push(k); } }
  while (rij.length) {
    const k = rij.pop(), i = k % r.nx;
    for (const m of [i > 0 ? k - 1 : -1, i < r.nx - 1 ? k + 1 : -1, k - r.nx, k + r.nx]) {
      if (m < 0 || m >= b.length || b[m] || barriere[m] || r.codes[m] >= VERBODEN) continue;
      b[m] = 1; rij.push(m);
    }
  }
  return b;
}
function naasteLand(r, R, p, maxM) {
  const k0 = R.cel(p.lat, p.lon); if (k0 < 0) return null;
  const i0 = k0 % r.nx, j0 = Math.floor(k0 / r.nx), rmax = Math.ceil(maxM / 50);
  let best = null, bestD = Infinity;
  for (let s = 1; s <= rmax && !best; s++) for (let j = j0 - s; j <= j0 + s; j++) for (let i = i0 - s; i <= i0 + s; i++) {
    if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== s || i < 0 || j < 0 || i >= r.nx || j >= r.ny) continue;
    const k = j * r.nx + i; if (r.codes[k] !== GEEN_WATER) continue;
    const c = R.midden(k), d = afstandM(p, c); if (d < bestD) { bestD = d; best = c; }
  }
  return best && bestD <= maxM ? best : null;
}

const groepVan = naam => ((String(naam).toUpperCase().match(/^([A-Z]+(?:-OW)?)/) || [])[1]) || String(naam).toUpperCase();

// Past r.codes aan (VERBODEN) en geeft een overzicht per gebied.
export function verbodenGebieden(r, betonning, osm, gebied, { uitsluiten = [], gat_m = 1200, land_m = 2000 } = {}) {
  const R = raster(r), celKm2 = (r.dlat * M_LAT) * (r.dlon * M_LON) / 1e6, overzicht = [];
  const zaden = gebied.zaden || [];

  // 1. A1-boeien
  const a1 = betonning.filter(m => m.kleur === 'Geel' && /rood.?wit.?rood/i.test(m.topteken || ''));
  const groepen = {};
  for (const m of a1) (groepen[groepVan(m.naam)] ||= []).push(m);
  for (const [g, boeien] of Object.entries(groepen).sort((a, b) => b[1].length - a[1].length)) {
    if (uitsluiten.includes(g)) { overzicht.push({ soort: 'A1-boeien', id: g, boeien: boeien.length, cellen: 0, opmerking: 'zit al in de editie (wedstrijdbepalingen)' }); continue; }
    boeien.sort((a, b) => a.naam.localeCompare(b.naam, 'nl', { numeric: true }));
    const stukken = [[boeien[0]]];
    for (let i = 1; i < boeien.length; i++) {
      if (afstandM(boeien[i - 1], boeien[i]) > gat_m) stukken.push([]);
      stukken[stukken.length - 1].push(boeien[i]);
    }
    const barriere = new Uint8Array(r.codes.length);
    let lijnen = 0, open = 0;
    for (const s of stukken) {
      if (s.length < 2) continue;
      const lijn = s.map(m => ({ lat: m.lat, lon: m.lon }));
      const a = naasteLand(r, R, lijn[0], land_m), b = naasteLand(r, R, lijn[lijn.length - 1], land_m);
      if (a) lijn.unshift(a); else open++;
      if (b) lijn.push(b); else open++;
      lijnen++;
      for (let i = 1; i < lijn.length; i++) {
        const p = lijn[i - 1], q = lijn[i], n = Math.max(1, Math.ceil(afstandM(p, q) / 10));
        for (let t = 0; t <= n; t++) {
          const k = R.cel(p.lat + (q.lat - p.lat) * t / n, p.lon + (q.lon - p.lon) * t / n); if (k < 0) continue;
          for (const m of [k, k + 1, k + r.nx]) if (m < barriere.length) barriere[m] = 1;      // dik genoeg tegen lekken
        }
      }
    }
    const bereik = bereikbaar(r, R, zaden, barriere);
    let n = 0;
    for (let k = 0; k < r.codes.length; k++) if (r.codes[k] < VERBODEN && (!bereik[k] || barriere[k])) { r.codes[k] = VERBODEN; n++; }
    overzicht.push({ soort: 'A1-boeien', id: g, boeien: boeien.length, vaarwater: [...new Set(boeien.map(m => m.vaarwater))].join(', '), lijnen, open, cellen: n, km2: n * celKm2,
      opmerking: !n ? 'geen gebied' : open ? `${open} uiteinde(n) niet aan land gekoppeld (binnen ${land_m} m geen land)` : '' });
  }

  // 2. windparken: turbines in het water, gegroepeerd (afstand < 1500 m), omtrek + 150 m
  const turbines = osm.filter(e => e.type === 'node' && e.tags && e.tags['generator:source'] === 'wind').map(e => ({ lat: e.lat, lon: e.lon }))
    .filter(t => { const k = R.cel(t.lat, t.lon); return k >= 0 && r.codes[k] !== GEEN_WATER; });
  const ouder = turbines.map((_, i) => i), wortel = i => ouder[i] === i ? i : (ouder[i] = wortel(ouder[i]));
  for (let i = 0; i < turbines.length; i++) for (let j = i + 1; j < turbines.length; j++) if (afstandM(turbines[i], turbines[j]) < 1500) ouder[wortel(i)] = wortel(j);
  const clusters = {};
  turbines.forEach((t, i) => (clusters[wortel(i)] ||= []).push(t));
  for (const c of Object.values(clusters).filter(c => c.length >= 3).sort((a, b) => b.length - a.length)) {
    const ring = omhullende(c.map(t => naarXY(t.lat, t.lon)));
    const n = markeerRing(r, R, ring, 150);
    const m = { lat: c.reduce((s, t) => s + t.lat, 0) / c.length, lon: c.reduce((s, t) => s + t.lon, 0) / c.length };
    overzicht.push({ soort: 'windpark', id: `windpark bij ${m.lat.toFixed(3)} N, ${m.lon.toFixed(3)} O`, turbines: c.length, cellen: n, km2: n * celKm2, opmerking: '' });
  }

  // 3. Marker Wadden: gesloten ringen uit OpenStreetMap, + 50 m
  const ringen = [];
  for (const e of osm.filter(e => e.tags && /Marker Wadden/.test(e.tags.name || ''))) {
    if (e.type === 'way' && e.geometry && e.geometry.length > 3) ringen.push(e.geometry);
    if (e.type === 'relation') for (const m of e.members || []) if (m.type === 'way' && m.role !== 'inner' && m.geometry && m.geometry.length > 3) ringen.push(m.geometry);
  }
  let nMw = 0;
  for (const g of ringen) {
    const eerste = g[0], laatste = g[g.length - 1];
    if (Math.abs(eerste.lat - laatste.lat) > 1e-6 || Math.abs(eerste.lon - laatste.lon) > 1e-6) continue;   // alleen gesloten ringen
    nMw += markeerRing(r, R, g.map(p => naarXY(p.lat, p.lon)), 50);
  }
  overzicht.push({ soort: 'eilanden', id: 'Marker Wadden', ringen: ringen.length, cellen: nMw, km2: nMw * celKm2, opmerking: nMw ? '' : 'geen gesloten omtrek gevonden in OpenStreetMap' });

  return { overzicht, cellen: r.codes.reduce((n, c) => n + (c === VERBODEN), 0) };
}
