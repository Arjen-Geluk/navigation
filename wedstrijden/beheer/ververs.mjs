// Ververs-script: haalt bodem en betonning opnieuw op bij RWS, vergelijkt met de vorige versie,
// controleert alle bron-URL's en schrijft een verslag. Zie beheer/WERKINSTRUCTIE.md.
//
//   npm run ververs                     alles verversen (bodem, betonning, URL's) en verslag schrijven
//   npm run ververs -- --meet           idem, en ook de grootte van het andere raster (25 of 50 m) meten
//   npm run ververs -- --alleen-urls    alleen de URL-controle
//   npm run ververs -- --vers           tegels opnieuw downloaden (anders uit de cache in lokaal/ververs/)
//   npm run ververs -- --goedkeuren     na akkoord: versie van het vaargebied ophogen en verslag afsluiten
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fromArrayBuffer } from 'geotiff';
import { leesJson, schrijfJson } from './lib/json.mjs';
import { wgsNaarRd, afstandM } from './lib/rd.mjs';
import { maakPng } from './lib/png.mjs';
import { haalIenc, verbodenGebieden } from './lib/verboden.mjs';

const MAP = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(MAP, '..', 'lokaal', 'ververs');
// IENC (Inland ENC van RWS), uitgepakt in lokaal/; downloaden alleen na akkoord (zie .claude/skills/ienc/references/bronnen.md)
const ENC_ROOT = join(MAP, '..', 'lokaal', 'ienc', 'nederland', 'ENC_ROOT');
const VG_PAD = join(MAP, 'gegevens', 'vaargebied_ijsselmeergebied.json');
const BET_PAD = join(MAP, 'gegevens', 'betonning_ijsselmeergebied.json');
const arg = n => process.argv.includes('--' + n);
const argWaarde = (n, std) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : std; };
const vandaag = new Date().toISOString().slice(0, 10);
const log = (...x) => console.log(...x);

const WCS = 'https://geo.rijkswaterstaat.nl/services/ogc/gdr/bodemhoogte_ijsselmeergebied/ows';
const WFS = 'https://service.pdok.nl/rws/vaarwegmarkeringen-nederland/wfs/v1_0';
const LAGEN = { drijvend: 'vaarwegmarkeringennld:vaarweg_markeringen_drijvend_rd', vast: 'vaarwegmarkeringennld:vaarweg_markeringen_vast_rd' };
// vaarwateren die bij het vaargebied horen; de rest (randmeren, Waddenzee, rivieren) valt erbuiten
const IN_GEBIED = /\((IJSSELMEER|MARKERMEER|IJSSELM\.)\)|^HET IJ \(AMSTERDAM\)$|^VAARWATER LANGS DE AFSLUITDIJK$/;

// Alle URL's waar de pagina of dit script van afhangt. Een URL "antwoordt" als er een HTTP-antwoord onder de 500 komt.
const URLS = [
  ['RWS bodemhoogte (WCS)', `${WCS}?service=WCS&version=1.0.0&request=GetCapabilities`],
  ['PDOK vaarwegmarkeringen (WFS)', `${WFS}?service=WFS&request=GetCapabilities`],
  ['PDOK vaarwegmarkeringen (WMS, kaartlaag)', 'https://service.pdok.nl/rws/vaarwegmarkeringen-nederland/wms/v1_0?service=WMS&request=GetCapabilities'],
  ['Open-Meteo verwachting', 'https://api.open-meteo.com/v1/forecast?latitude=52.8&longitude=5.3&hourly=wind_speed_10m&forecast_days=1&models=knmi_seamless'],
  ['Open-Meteo historische verwachting', 'https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=52.8&longitude=5.3&hourly=wind_speed_10m&start_date=2025-10-11&end_date=2025-10-11'],
  ['RWS waterstanden (actueel peil)', 'https://rwsos.rws.nl/wb-api/dd/2.0/timeseries'],
  ['Ondergrond Esri grijs', 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/10/337/525'],
  ['Ondergrond Esri luchtfoto', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/10/337/525'],
  ['Ondergrond Esri topografisch', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/10/337/525'],
  ['IENC-downloads (vaarweginformatie.nl)', 'https://www.vaarweginformatie.nl/frp/page/infra_enc'],
  ['Ondergrond OpenTopoMap', 'https://a.tile.opentopomap.org/10/525/337.png']
];

async function haal(url, { tekst = false, pogingen = 3 } = {}) {
  for (let p = 1; ; p++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(180000), headers: { 'user-agent': 'navigation-wedstrijden-ververs/1' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return tekst ? await r.text() : Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (p >= pogingen) throw new Error(`${e.message} bij ${url}`);
      await new Promise(z => setTimeout(z, 2000 * p));
    }
  }
}

// ======================= URL-controle =======================
async function controleerUrls() {
  return Promise.all(URLS.map(async ([naam, url]) => {
    const t0 = Date.now();
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'navigation-wedstrijden-ververs/1' } });
      return { naam, url, status: r.status, ok: r.status < 500, ms: Date.now() - t0 };
    } catch (e) { return { naam, url, status: e.name === 'TimeoutError' ? 'time-out' : e.message, ok: false, ms: Date.now() - t0 }; }
  }));
}

// ======================= Bodem =======================
// Codering in het .bin-bestand: 1 byte per cel, rij voor rij van noord naar zuid, west naar oost.
//   0..250 = bodemhoogte −25,0 .. 0,0 m NAP in stappen van 0,1 m (dieper/hoger wordt afgekapt)
//   255    = geen water (land, dijk of geen meting)
const GEEN_WATER = 255;
const WATER_ZONDER_METING = 250;          // water volgens TOP10NL maar zonder RWS-meting (havens): als 0,0 m NAP, dus onbevaarbaar
const codeer = v => Math.max(0, Math.min(250, Math.round((v + 25) * 10)));
const decodeer = c => c === GEEN_WATER ? null : c / 10 - 25;

async function nieuwsteOpname() {
  const caps = await haal(`${WCS}?service=WCS&version=1.0.0&request=GetCapabilities`, { tekst: true });
  const lagen = [...caps.matchAll(/<wcs:name>(bodemhoogte_ijsselmeergebied:bodemhoogte_ijg_(\d{4}))<\/wcs:name>/g)].map(m => ({ laag: m[1], jaar: +m[2] }));
  if (!lagen.length) throw new Error('geen bodemopnames gevonden in GetCapabilities');
  return { nieuwste: lagen.sort((a, b) => b.jaar - a.jaar)[0], alle: lagen.map(l => l.jaar).sort() };
}

async function haalBodemRd(laag, gebied) {
  const desc = await haal(`${WCS}?service=WCS&version=1.0.0&request=DescribeCoverage&coverage=${laag}`, { tekst: true });
  const env = desc.match(/<gml:Envelope srsName="EPSG:28992">\s*<gml:pos>([\d.]+) ([\d.]+)<\/gml:pos>\s*<gml:pos>([\d.]+) ([\d.]+)<\/gml:pos>/);
  const cel = +desc.match(/<gml:offsetVector>([\d.]+) 0\.0<\/gml:offsetVector>/)[1];
  if (!env || !cel) throw new Error('DescribeCoverage niet te lezen');
  const [cx0, cy0, cx1, cy1] = env.slice(1).map(Number);
  // benodigde RD-grenzen: rand van het gebied in WGS84 omgerekend
  const rand = [];
  for (let f = 0; f <= 1; f += 0.05) rand.push([gebied.west + f * (gebied.oost - gebied.west), gebied.zuid], [gebied.west + f * (gebied.oost - gebied.west), gebied.noord],
    [gebied.west, gebied.zuid + f * (gebied.noord - gebied.zuid)], [gebied.oost, gebied.zuid + f * (gebied.noord - gebied.zuid)]);
  const rd = rand.map(([lo, la]) => wgsNaarRd(lo, la));
  const x0 = Math.max(cx0, cx0 + Math.floor((Math.min(...rd.map(p => p[0])) - cx0) / cel) * cel);
  const x1 = Math.min(cx1, cx0 + Math.ceil((Math.max(...rd.map(p => p[0])) - cx0) / cel) * cel);
  const y0 = Math.max(cy0, cy0 + Math.floor((Math.min(...rd.map(p => p[1])) - cy0) / cel) * cel);
  const y1 = Math.min(cy1, cy0 + Math.ceil((Math.max(...rd.map(p => p[1])) - cy0) / cel) * cel);
  const nx = Math.round((x1 - x0) / cel), ny = Math.round((y1 - y0) / cel);
  const z = new Float32Array(nx * ny).fill(NaN);
  const T = 1024, tegels = [];
  for (let ty = 0; ty < ny; ty += T) for (let tx = 0; tx < nx; tx += T) tegels.push([tx, ty, Math.min(T, nx - tx), Math.min(T, ny - ty)]);
  const cacheMap = join(CACHE, 'cache', laag.split(':')[1]);
  mkdirSync(cacheMap, { recursive: true });
  let klaar = 0;
  const werk = async ([tx, ty, w, h]) => {
    // ty telt vanaf het noorden
    const bx0 = x0 + tx * cel, bx1 = bx0 + w * cel, by1 = y1 - ty * cel, by0 = by1 - h * cel;
    const cachePad = join(cacheMap, `${bx0}_${by0}_${w}x${h}.tif`);
    let buf;
    if (!arg('vers') && existsSync(cachePad)) buf = readFileSync(cachePad);
    else {
      buf = await haal(`${WCS}?service=WCS&version=1.0.0&request=GetCoverage&coverage=${laag}&crs=EPSG:28992&bbox=${bx0},${by0},${bx1},${by1}&width=${w}&height=${h}&format=GeoTIFF`);
      writeFileSync(cachePad, buf);
    }
    const tif = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const im = await tif.getImage();
    if (im.getWidth() !== w || im.getHeight() !== h) throw new Error(`tegel ${w}x${h} kwam terug als ${im.getWidth()}x${im.getHeight()}`);
    const nodata = im.getGDALNoData();
    const [d] = await im.readRasters();
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const v = d[j * w + i];
      if (v !== nodata && Math.abs(v) < 1000) z[(ty + j) * nx + tx + i] = v;
    }
    process.stdout.write(`\r  bodem: tegel ${++klaar}/${tegels.length}   `);
  };
  for (let i = 0; i < tegels.length; i += 4) await Promise.all(tegels.slice(i, i + 4).map(werk));
  process.stdout.write('\n');
  return { x0, y1, cel, nx, ny, z };
}

// Van het RD-raster (20 m) naar een raster in graden; per cel k x k monsterpunten, gemiddelde van de waterpunten.
// Een cel is land zodra een kwart van de monsterpunten land is (geen meting of boven NAP): zo blijven smalle dammen
// en strekdammen (20 à 30 m breed) in het raster staan; langs de kust is dat iets voorzichtiger.
function herbemonster(rdr, gebied, celM, water = null) {
  const dlat = +(celM / 111200).toFixed(6), dlon = +(celM / (111320 * Math.cos(52.7 * Math.PI / 180))).toFixed(6);
  const nx = Math.round((gebied.oost - gebied.west) / dlon), ny = Math.round((gebied.noord - gebied.zuid) / dlat);
  const k = Math.max(2, Math.round(celM / 10)), kwart = Math.ceil(k * k / 4);
  const codes = new Uint8Array(nx * ny).fill(GEEN_WATER);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let som = 0, n = 0, land = 0;
    for (let b = 0; b < k; b++) for (let a = 0; a < k; a++) {
      const lon = gebied.west + (i + (a + 0.5) / k) * dlon, lat = gebied.noord - (j + (b + 0.5) / k) * dlat;
      const [X, Y] = wgsNaarRd(lon, lat);
      const ci = Math.floor((X - rdr.x0) / rdr.cel), cj = Math.floor((rdr.y1 - Y) / rdr.cel);
      if (ci < 0 || cj < 0 || ci >= rdr.nx || cj >= rdr.ny) { land++; continue; }
      const v = rdr.z[cj * rdr.nx + ci];
      if (v === v && v <= 0) { som += v; n++; } else land++;
    }
    if (water) {
      // land of water volgens TOP10NL (eenmalig ingebouwd, beheer/top10nl.mjs); diepte uit RWS
      if (water.telling[j * nx + i] >= water.drempel) codes[j * nx + i] = n ? codeer(som / n) : WATER_ZONDER_METING;
    } else if (land < kwart && n) codes[j * nx + i] = codeer(som / n);
  }
  return { cel_m: celM, west: gebied.west, noord: gebied.noord, dlon, dlat, nx, ny, codes };
}

// Alleen het water dat vanuit de startpunten (gebied.zaden) bereikbaar is, zonder een afsluitlijn
// (gebied.afsluitingen) te kruisen. Zo vallen de randmeren en het Ketelmeer eruit.
function afbakenen(r, gebied) {
  const dicht = new Uint8Array(r.nx * r.ny);
  const cel = (lat, lon) => [Math.floor((lon - r.west) / r.dlon), Math.floor((r.noord - lat) / r.dlat)];
  for (const a of gebied.afsluitingen || []) {
    const [i0, j0] = cel(...a.van), [i1, j1] = cel(...a.tot), n = 2 * Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0), 1);
    for (let s = 0; s <= n; s++) {
      const i = Math.round(i0 + (i1 - i0) * s / n), j = Math.round(j0 + (j1 - j0) * s / n);
      for (const [di, dj] of [[0, 0], [1, 0], [0, 1]]) if (i + di < r.nx && j + dj < r.ny) dicht[(j + dj) * r.nx + i + di] = 1;   // dik genoeg tegen lekken
    }
  }
  const bereikt = new Uint8Array(r.nx * r.ny), rij = [];
  for (const z of gebied.zaden || []) {
    const [i, j] = cel(z.lat, z.lon), k = j * r.nx + i;
    if (r.codes[k] === GEEN_WATER) throw new Error(`startpunt ${z.naam} ligt niet in het water`);
    bereikt[k] = 1; rij.push(k);
  }
  while (rij.length) {
    const k = rij.pop(), i = k % r.nx;
    for (const m of [i > 0 ? k - 1 : -1, i < r.nx - 1 ? k + 1 : -1, k - r.nx, k + r.nx]) {
      if (m < 0 || m >= bereikt.length || bereikt[m] || dicht[m] || r.codes[m] === GEEN_WATER) continue;
      bereikt[m] = 1; rij.push(m);
    }
  }
  let weg = 0;
  for (let k = 0; k < bereikt.length; k++) if (!bereikt[k] && r.codes[k] !== GEEN_WATER) { r.codes[k] = GEEN_WATER; weg++; }
  return weg;
}

// deelgebieden voor de vergelijking: Houtribdijk (Enkhuizen–Lelystad) scheidt IJsselmeer en Markermeer
function deelgebied(lat, lon) {
  const [a, b] = [[52.705, 5.29], [52.52, 5.44]];
  const kant = (b[1] - a[1]) * (lat - a[0]) - (b[0] - a[0]) * (lon - a[1]);
  if (kant < 0) return 'Markermeer en IJmeer';
  return lat >= 52.8 ? 'IJsselmeer noord' : 'IJsselmeer zuid';
}

function bodemStatistiek(r, vorige) {
  const per = {};
  for (let j = 0; j < r.ny; j++) for (let i = 0; i < r.nx; i++) {
    const c = r.codes[j * r.nx + i];
    const lat = r.noord - (j + 0.5) * r.dlat, lon = r.west + (i + 0.5) * r.dlon;
    const g = per[deelgebied(lat, lon)] ||= { water: 0, diep: [], verschil: 0, nVerschil: 0, groot: 0, nieuwWater: 0, wegWater: 0 };
    if (c <= 250) { g.water++; if ((i + j) % 7 === 0) g.diep.push(decodeer(c)); }
    if (vorige) {
      const p = vorige[j * r.nx + i];
      if (c <= 250 && p <= 250) { const d = Math.abs(c - p) / 10; g.verschil += d; g.nVerschil++; if (d >= 0.3) g.groot++; }
      else if (c <= 250) g.nieuwWater++;
      else if (p <= 250) g.wegWater++;
    }
  }
  for (const g of Object.values(per)) { g.diep.sort((x, y) => x - y); }
  return per;
}

// controleplaatje: diepte bij een peil van −0,20 m NAP
const KLEUR = [[0.0, [200, 70, 60]], [1.0, [230, 140, 60]], [1.5, [240, 200, 90]], [2.0, [200, 225, 170]], [3.0, [150, 200, 230]], [4.0, [90, 150, 210]], [99, [40, 90, 160]]];
function kleurBij(c) {
  if (c === GEEN_WATER) return [235, 232, 225];
  if (c === 254) return [190, 60, 140];
  const d = -0.2 - decodeer(c);
  return KLEUR.find(([g]) => d < g)[1];
}
function plaatje(r, { west = r.west, oost = r.west + r.nx * r.dlon, noord = r.noord, zuid = r.noord - r.ny * r.dlat, schaal = 1 } = {}) {
  const i0 = Math.floor((west - r.west) / r.dlon), i1 = Math.ceil((oost - r.west) / r.dlon);
  const j0 = Math.floor((r.noord - noord) / r.dlat), j1 = Math.ceil((r.noord - zuid) / r.dlat);
  const w = Math.round((i1 - i0) * schaal), h = Math.round((j1 - j0) * schaal), rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = Math.min(r.nx - 1, i0 + Math.floor(x / schaal)), j = Math.min(r.ny - 1, j0 + Math.floor(y / schaal));
    rgb.set(kleurBij(r.codes[j * r.nx + i]), (y * w + x) * 3);
  }
  return maakPng(w, h, rgb);
}

// ======================= Betonning =======================
async function haalLaag(laag) {
  const alle = [];
  for (let start = 0; ; start += 1000) {
    const gml = await haal(`${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${LAGEN[laag]}&count=1000&startIndex=${start}`
      + `&bbox=52.2,4.85,53.15,6.0,urn:ogc:def:crs:EPSG::4326`, { tekst: true });
    const leden = gml.split('<wfs:member>').slice(1);
    for (const lid of leden) {
      const v = {};
      for (const m of lid.matchAll(/<vaarwegmarkeringennld:(\w+)>([^<]*)<\/vaarwegmarkeringennld:\1>/g)) (v[m[1]] ||= []).push(m[2].trim());
      v.rd = lid.match(/<gml:pos>([\d.]+) ([\d.]+)<\/gml:pos>/)?.slice(1).map(Number);
      alle.push(v);
    }
    process.stdout.write(`\r  betonning ${laag}: ${alle.length}   `);
    if (leden.length < 1000) break;
  }
  process.stdout.write('\n');
  return alle;
}

const LEEG = new Set(['#', 'L', 'X', '', 'Niet toegewezen']);
// laatste betekenisvolle waarde van een of meer velden (RWS geeft vaak eerst een code en dan de tekst)
const veld = (v, ...namen) => { for (const n of namen) { const w = (v[n] || []).filter(x => !LEEG.has(x)); if (w.length) return w[w.length - 1]; } return null; };
const graden = s => { const m = String(s || '').match(/^(\d+)\.(\d+\.\d+)$/); return m ? +m[1] + +m[2] / 60 : null; };

function maakMarkering(v, laag) {
  const lat = graden(veld(v, 'nWgsGm')), lon = graden(veld(v, 'eWgsGm'));
  const lichtKleur = veld(v, 'lichtKlr', 'lichtKl');
  const kar = veld(v, 'signKar');
  return {
    id: veld(v, 'benamCod'), naam: veld(v, 'benaming'), vaarwater: veld(v, 'vaarwater'), drijvend: laag === 'drijvend',
    lat: lat && +lat.toFixed(6), lon: lon && +lon.toFixed(6),
    vorm: veld(v, 'objVorm', 'objectVormO'), kleur: veld(v, 'objKleur'), kleurpatroon: veld(v, 'kleurpatr'),
    topteken: veld(v, 'ttKleur', 'vToptek'), iala: veld(v, 'ialaCategorie', 'ialaCat'),
    licht: lichtKleur || kar ? { kleur: lichtKleur, karakter: kar ? kar.split(' ')[0] : null, groep: veld(v, 'signGroep'), periode_s: +(veld(v, 'signPerio') || 0) || null } : null,
    opgeheven: veld(v, 'opgeheven'), inbedrijf: veld(v, 'inbedrijf')
  };
}

const normNaam = s => String(s || '').toUpperCase().replace(/[\s-]+/g, '');

function vergelijkBetonning(nieuw, oud) {
  const o = new Map((oud || []).map(m => [m.id, m])), n = new Map(nieuw.map(m => [m.id, m]));
  const erbij = nieuw.filter(m => !o.has(m.id)), weg = (oud || []).filter(m => !n.has(m.id));
  const verschoven = nieuw.filter(m => o.has(m.id)).map(m => ({ m, d: afstandM(m, o.get(m.id)) })).filter(x => x.d > 10).sort((a, b) => b.d - a.d);
  const anders = nieuw.filter(m => o.has(m.id) && JSON.stringify({ ...m, lat: 0, lon: 0 }) !== JSON.stringify({ ...o.get(m.id), lat: 0, lon: 0 }));
  return { erbij, weg, verschoven, anders };
}

function controleerEdities(betonning, oud) {
  const oudPerId = oud ? new Map(oud.map(m => [m.id, m])) : null;
  const perNaam = new Map();
  betonning.forEach(m => { const k = normNaam(m.naam); (perNaam.get(k) || perNaam.set(k, []).get(k)).push(m); });
  const regels = [];
  for (const f of readdirSync(join(MAP, 'gegevens', 'wedstrijden')).filter(f => f.endsWith('.json')).sort()) {
    const e = leesJson(join(MAP, 'gegevens', 'wedstrijden', f));
    const punten = [...e.punten, ...e.zones.flatMap(z => z.punten)].filter(p => p.rws);
    // De editie neemt de positie van deze boeien uit de betonning (bouwscript): de naam moet er precies één keer in staan.
    // Verschuiving = afstand tot de positie in de vorige betonning.
    for (const p of punten) {
      const kand = perNaam.get(normNaam(p.rws)) || [];
      if (!kand.length) { regels.push({ editie: f, punt: p.id, rws: p.rws, melding: 'niet gevonden in de RWS-betonning: de bouw zal weigeren' }); continue; }
      if (kand.length > 1) { regels.push({ editie: f, punt: p.id, rws: p.rws, melding: `${kand.length} RWS-boeien met deze naam: de bouw zal weigeren` }); continue; }
      const vorig = oudPerId?.get(kand[0].id), d = vorig ? afstandM(kand[0], vorig) : null;
      regels.push({ editie: f, punt: p.id, rws: p.rws, d, melding: d != null && d > 10 ? `RWS heeft deze boei ${d.toFixed(0)} m verlegd sinds de vorige versie` : null });
    }
    // punten zonder RWS-naam: is er een RWS-markering met dezelfde naam?
    for (const p of [...e.punten, ...e.zones.flatMap(z => z.punten)].filter(p => !p.rws)) {
      const kand = perNaam.get(normNaam(p.id));
      if (kand) regels.push({ editie: f, punt: p.id, rws: null, d: afstandM(p, kand[0]), melding: `heeft geen RWS-naam, maar RWS kent "${kand[0].naam}" op ${afstandM(p, kand[0]).toFixed(0)} m` });
    }
  }
  // hetzelfde punt staat vaak in meerdere edities en zones: één regel per punt en positie
  const uniek = new Map();
  for (const x of regels) {
    const k = `${x.punt}|${x.rws}|${x.d?.toFixed(0)}|${x.melding}`;
    if (uniek.has(k)) { const u = uniek.get(k); if (!u.edities.includes(x.editie)) u.edities.push(x.editie); }
    else uniek.set(k, { ...x, edities: [x.editie] });
  }
  return [...uniek.values()];
}

// ======================= Verslag =======================
const nl = (x, d = 0) => x == null ? '–' : Number(x).toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
const kB = n => nl(n / 1024) + ' kB';

function schrijfVerslag(v) {
  const r = [];
  r.push(`# Verslag verversen vaargebied — ${vandaag}`, '');
  r.push(`**Status: wacht op goedkeuring.** Na akkoord: \`npm run ververs -- --goedkeuren\` (vaargebied wordt versie ${v.versieNa}), daarna bouwen en committen.`, '');
  r.push('## Bron-URL\'s', '', '| Bron | Antwoord | Tijd |', '|---|---|---|');
  for (const u of v.urls) r.push(`| ${u.ok ? '✓' : '**✗**'} [${u.naam}](${u.url}) | ${u.status} | ${nl(u.ms)} ms |`);
  const kapot = v.urls.filter(u => !u.ok);
  r.push('', kapot.length ? `**${kapot.length} URL('s) antwoorden niet.**` : 'Alle URL\'s antwoorden.', '');
  if (v.bodem) {
    const b = v.bodem;
    r.push('## Bodem', '');
    r.push(`- Opname: **${b.jaar}** (laag \`${b.laag}\`); beschikbaar bij RWS: ${b.alle.join(', ')}.` + (b.vorigJaar && b.jaar > b.vorigJaar ? ` **Nieuwer dan de vorige versie (${b.vorigJaar}).**` : ''));
    r.push(`- RWS-origineel: ${nl(b.rd.nx)} × ${nl(b.rd.ny)} cellen van ${b.rd.cel} m (RD); waterpunten: ${nl(b.rd.water)}.`);
    r.push(`- Raster in de pagina: cellen van ${b.r.cel_m} m (${b.r.dlon}° × ${b.r.dlat}°), ${nl(b.r.nx)} × ${nl(b.r.ny)} = ${nl(b.r.nx * b.r.ny)} cellen, `
      + `waarvan ${nl(b.water)} water. ${b.top10 ? `Land en water uit TOP10NL (${b.top10}): een cel is water als minstens driekwart van 10 × 10 monsterpunten water is; diepte = gemiddelde van de RWS-metingen in de cel. Water zonder RWS-meting (havens): ${nl(b.zonderMeting)} cellen, behandeld als 0,0 m NAP.` : `Per cel het gemiddelde van ${b.k} × ${b.k} monsterpunten; een kwart of meer land (geen meting of boven NAP) = land.`}`);
    r.push(`- Afgebakend: ${nl(b.buitenGebied)} watercellen buiten het vaargebied weggelaten (niet bereikbaar zonder ${(b.afsluitingen || []).map(a => a.naam).join(' of ')} te kruisen).`);
    r.push(`- Bestand \`${b.bestand}\`: ${kB(b.gzip)} (gzip); in de pagina als base64 ca. ${kB(b.gzip * 4 / 3)}.`);
    if (b.meting) r.push(`- Ter vergelijking ${b.meting.cel_m} m: ${nl(b.meting.water)} watercellen, ${kB(b.meting.gzip)} (gzip), als base64 ca. ${kB(b.meting.gzip * 4 / 3)}.`);
    r.push('', '| Deelgebied | Watercellen | Bodem p10 / mediaan / p90 (m NAP) |' + (b.vorig ? ' Gem. verschil | Cellen ≥ 0,3 m anders | Water erbij / weg |' : ''),
      '|---|---|---|' + (b.vorig ? '---|---|---|' : ''));
    for (const [n, g] of Object.entries(b.stat).sort()) {
      const q = p => g.diep.length ? nl(g.diep[Math.floor(g.diep.length * p)], 1) : '–';
      r.push(`| ${n} | ${nl(g.water)} | ${q(0.1)} / ${q(0.5)} / ${q(0.9)} |` + (b.vorig ? ` ${nl(g.nVerschil ? g.verschil / g.nVerschil : 0, 2)} m | ${nl(g.groot)} | ${nl(g.nieuwWater)} / ${nl(g.wegWater)} |` : ''));
    }
    r.push('', b.vorig ? '' : 'Geen vorige bodem om mee te vergelijken (eerste verversing).', '');
    r.push(`Controleplaatjes (lokaal, niet in git): ${b.plaatjes.map(p => '`' + p + '`').join(', ')}.`, '');
  }
  if (v.verboden) {
    r.push('## Verboden gebieden', '');
    r.push('Water dat in de pagina onbevaarbaar is (code 254 in het bodemraster), voor alle wedstrijden. Op het controleplaatje paars-rood.', '');
    r.push('- **A1-boeien**: gele boeien met topteken A1 (rood-wit-rood, verboden toegang). Per groep zijn de boeien in volgorde verbonden en de uiteinden naar het land doorgetrokken; het water achter de lijn is verboden. De Kreupel (NK-OW) staat al in de editie.');
    r.push('- **Windparken** (IENC): windturbines (LNDMRK windmotor) in het water, per groep de omtrek plus 150 m; en de vlakken "Windpark …" (CTNARE).');
    r.push('- **Natuurgebieden** (IENC CTNARE "Natuurgebied"), behalve gebieden die al in de editie staan.');
    r.push('- **Marker Wadden** (IENC LNDARE binnen het kader van de Marker Wadden; de eilanden staan niet in de bodemopname): omtrek plus 50 m.');
    r.push('- **Invaarverbod** (IENC resare met restrn 7 "entry prohibited"). Vlakken zonder naam zijn beschreven met de benoemde objecten eromheen.', '');
    if (v.ienc) r.push(`IENC-cellen gebruikt (${v.ienc.length}): ${v.ienc.map(c => `${c.naam.replace('.000', '')} ed. ${c.editie} (${c.uitgifte})`).join(', ')}.`, '');
    r.push('| Soort | Gebied | Boeien / turbines / vlakken | Oppervlak | Opmerking |', '|---|---|---|---|---|');
    for (const x of v.verboden.overzicht.filter(x => x.cellen > 0 || x.opmerking)) r.push(`| ${x.soort} | ${x.id}${x.vaarwater ? ' (' + x.vaarwater + ')' : ''} | ${x.boeien ?? x.turbines ?? x.ringen ?? ''} | ${x.km2 ? nl(x.km2, 2) + ' km²' : '–'} | ${x.opmerking || ''} |`);
    r.push('', `Totaal ${nl(v.verboden.cellen)} cellen (${nl(v.verboden.cellen * 0.0025, 1)} km²).`, '');
    if (v.verboden.smal?.length) {
      const s = v.verboden.smal;
      r.push(`**Niet verwerkt: ${s.length} andere stukken IENC-land op plekken die in het raster water zijn** (dammen, kribben, oevers; samen ${nl(s.reduce((t, x) => t + x.cellen, 0))} watercellen). `
        + 'Grootste: ' + [...s].sort((a, b) => b.cellen - a.cellen).slice(0, 10).map(x => `${x.plek} (${x.cellen} water, ${Math.round(x.rondom * 100)}% land rondom)`).join('; ') + '.', '');
    }
    if (v.verboden.naamloos?.length) r.push('**Waarschuwingen in de IENC, niet verwerkt**: ' + v.verboden.naamloos.map(x => `${x.id} (${x.plek})`).join('; ') + '.', '');
  }
  if (v.betonning) {
    const t = v.betonning;
    r.push('## Betonning', '');
    r.push(`- Opgehaald: ${nl(t.totaal)} markeringen in het kader (${nl(t.perLaag.drijvend)} drijvend, ${nl(t.perLaag.vast)} vast); `
      + `in het vaargebied: **${nl(t.lijst.length)}** (${nl(t.lijst.filter(m => m.drijvend).length)} drijvend, ${nl(t.lijst.filter(m => !m.drijvend).length)} vast).`);
    r.push(`- Buiten het vaargebied gelaten (vaarwater): ${Object.entries(t.buiten).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} (${c})`).join(', ')}.`);
    const opg = Object.entries(t.opgeheven).filter(([k]) => k !== "leeg");
    if (opg.length) r.push(`- Veld "opgeheven" ingevuld (betekenis RWS-code nog na te gaan): ${opg.map(([k, c]) => `${k}: ${c}`).join(", ")}.`);
    r.push(`- Zonder positie overgeslagen: ${t.zonderPositie}.`, '');
    if (t.verg) {
      const { erbij, weg, verschoven, anders } = t.verg;
      r.push(`Vergeleken met de vorige versie: ${erbij.length} erbij, ${weg.length} weg, ${verschoven.length} meer dan 10 m verschoven, ${anders.length} met andere eigenschappen.`, '');
      const rij = (m, x = '') => `| ${m.naam} | ${m.vaarwater} | ${m.lat}, ${m.lon} | ${x} |`;
      if (verschoven.length) r.push('**Verschoven**', '', '| Naam | Vaarwater | Positie | Verschuiving |', '|---|---|---|---|', ...verschoven.slice(0, 50).map(x => rij(x.m, nl(x.d) + ' m')), '');
      if (erbij.length) r.push('**Erbij**', '', '| Naam | Vaarwater | Positie | |', '|---|---|---|---|', ...erbij.slice(0, 50).map(m => rij(m)), '');
      if (weg.length) r.push('**Weg**', '', '| Naam | Vaarwater | Positie | |', '|---|---|---|---|', ...weg.slice(0, 50).map(m => rij(m)), '');
    } else r.push('Geen vorige betonning om mee te vergelijken (eerste verversing).', '');
    const fout = t.edities.filter(x => x.melding), goed = t.edities.filter(x => !x.melding);
    r.push('### Wedstrijdboeien en via-punten in de edities', '');
    r.push(`${goed.length} RWS-boeien uit de edities gevonden en niet (meer dan 10 m) verlegd: ${goed.map(x => x.punt).join(', ')}.`, '');
    if (fout.length) {
      r.push('**Let op:**', '', '| Punt | RWS-naam | Verlegd | Melding | Edities |', '|---|---|---|---|---|');
      for (const x of fout) r.push(`| ${x.punt} | ${x.rws || '–'} | ${x.d == null ? '–' : nl(x.d) + ' m'} | ${x.melding} | ${x.edities.join(', ')} |`);
    } else r.push('Geen afwijkingen.');
    r.push('');
    r.push('');
  }
  // nooit een eerder verslag overschrijven: tweede run op dezelfde dag wordt ververs_<datum>_2.md
  const pad = join(MAP, 'beheer', 'verslagen', (v.naam || `urls_${vandaag}`) + '.md');
  writeFileSync(pad, r.join('\n'));
  return pad;
}

// ======================= Hoofdlijn =======================
const vg = leesJson(VG_PAD);

if (arg('goedkeuren')) {
  if (!vg.concept) { console.error('Er is geen ververste versie die op goedkeuring wacht.'); process.exit(1); }
  const verslag = join(MAP, 'beheer', 'verslagen', `${vg.concept.verslag}.md`);
  vg.versie += 1; vg.datum = vandaag; delete vg.concept;
  schrijfJson(VG_PAD, vg);
  writeFileSync(verslag, readFileSync(verslag, 'utf8').replace(/\*\*Status: wacht op goedkeuring\.\*\*[^\n]*/, `**Status: goedgekeurd op ${vandaag}; vaargebied versie ${vg.versie}.**`));
  log(`✓ Vaargebied versie ${vg.versie} (${vandaag}). Volgende: npm run bouw, npm test, commit.`);
  process.exit(0);
}

log('URL-controle…');
const urls = await controleerUrls();
urls.forEach(u => log(`  ${u.ok ? '✓' : '✗'} ${u.naam}: ${u.status}`));
const verslag = { urls, versieNa: vg.versie + 1 };

if (!arg('alleen-urls')) {
  mkdirSync(CACHE, { recursive: true });
  const celM = +argWaarde('resolutie', 50);

  // ---- bodem ----
  log('Bodem…');
  const { nieuwste, alle } = await nieuwsteOpname();
  const rd = await haalBodemRd(nieuwste.laag, vg.gebied);
  rd.water = rd.z.reduce((n, v) => n + (v === v), 0);
  // land en water uit TOP10NL als dat bestand bij dit raster past (anders alleen RWS)
  const W10 = join(MAP, 'gegevens', 'water_top10nl.json');
  let top10 = null;
  if (existsSync(W10)) {
    const m = leesJson(W10), dl = +(celM / 111200).toFixed(6);
    if (m.raster.cel_m === celM && Math.abs(m.raster.dlat - dl) < 1e-9) {
      top10 = { telling: gunzipSync(readFileSync(join(MAP, 'gegevens', 'water_top10nl_50m.bin'))), drempel: Math.ceil(0.75 * m.monsterpunten), bron: m.bron, opgehaald: m.opgehaald };
      log(`  land en water uit TOP10NL (${m.opgehaald})`);
    } else log('  TOP10NL-bestand past niet bij dit raster: land en water alleen uit RWS (draai npm run top10nl)');
  }
  const r = herbemonster(rd, vg.gebied, celM, top10);
  if (top10) {
    const afstand = new Uint8Array(r.codes.length).fill(255), rij = [];
    for (let k = 0; k < r.codes.length; k++) if (r.codes[k] < WATER_ZONDER_METING) { afstand[k] = 0; rij.push(k); }
    for (let q = 0; q < rij.length; q++) {
      const k = rij[q], i = k % r.nx, d = afstand[k];
      if (d >= 6) continue;
      for (const m of [i > 0 ? k - 1 : -1, i < r.nx - 1 ? k + 1 : -1, k - r.nx, k + r.nx])
        if (m >= 0 && m < r.codes.length && r.codes[m] === WATER_ZONDER_METING && afstand[m] === 255) { afstand[m] = d + 1; rij.push(m); }
    }
    for (let k = 0; k < r.codes.length; k++) if (r.codes[k] === WATER_ZONDER_METING && afstand[k] === 255) r.codes[k] = GEEN_WATER;
  }
  const zonderMeting = top10 ? r.codes.reduce((t, c) => t + (c === WATER_ZONDER_METING), 0) : 0;
  const buitenGebied = afbakenen(r, vg.gebied);   // (na TOP10NL en het inkorten van water zonder meting)

  // ---- betonning ----
  log('Betonning…');
  const ruw = { drijvend: await haalLaag('drijvend'), vast: await haalLaag('vast') };
  const buiten = {}, opgeheven = {};
  let zonderPositie = 0;
  const lijst = [];
  for (const laag of ['drijvend', 'vast']) for (const v of ruw[laag]) {
    const m = maakMarkering(v, laag);
    if (!IN_GEBIED.test(m.vaarwater || '')) { buiten[m.vaarwater] = (buiten[m.vaarwater] || 0) + 1; continue; }
    if (m.lat == null || m.lon == null) { zonderPositie++; continue; }
    opgeheven[m.opgeheven ?? 'leeg'] = (opgeheven[m.opgeheven ?? 'leeg'] || 0) + 1;
    lijst.push(m);
  }
  lijst.sort((a, b) => (a.id || '').localeCompare(b.id || '') || a.lat - b.lat);
  const oud = existsSync(BET_PAD) ? leesJson(BET_PAD).markeringen : null;
  schrijfJson(BET_PAD, { formaat: 'betonning/1', bron: `${WFS} (lagen drijvend en vast)`, opgehaald: vandaag, markeringen: lijst });
  vg.betonning = { bestand: 'betonning_ijsselmeergebied.json', opgehaald: vandaag, aantal: lijst.length, bron: `${WFS}` };
  verslag.betonning = { totaal: ruw.drijvend.length + ruw.vast.length, perLaag: { drijvend: ruw.drijvend.length, vast: ruw.vast.length }, lijst, buiten, opgeheven, zonderPositie,
    verg: oud ? vergelijkBetonning(lijst, oud) : null, edities: controleerEdities(lijst, oud) };
  log(`  ${lijst.length} markeringen in het vaargebied`);

  // ---- verboden gebieden (A1-boeien en IENC: windparken, natuur, eilanden, invaarverbod) in het raster: code 254 ----
  log('Verboden gebieden…');
  if (!existsSync(join(ENC_ROOT, 'CATALOG.031'))) { console.error(`\n✗ Geen IENC in ${ENC_ROOT}. Zie .claude/skills/ienc/references/bronnen.md (downloaden alleen na akkoord).`); process.exit(1); }
  const ienc = haalIenc(ENC_ROOT, vg.gebied);
  log(`  IENC: ${ienc.cellen.length} cellen, ${ienc.features.length} objecten`);
  const verboden = verbodenGebieden(r, lijst, ienc, vg.gebied, { uitsluiten: ['NK-OW'] });
  verslag.verboden = verboden;
  verslag.ienc = ienc.cellen;
  vg.verboden = verboden.overzicht.filter(x => x.cellen > 0).map(x => ({ soort: x.soort, id: x.id, km2: +x.km2.toFixed(2), boeien: x.boeien, turbines: x.turbines }));
  const uitgifte = ienc.cellen.map(c => c.uitgifte).sort();
  vg.ienc = { release: 'Nederland (excl. Zeeland, Waddenzee)', cellen: ienc.cellen.length, uitgifte_van: uitgifte[0], uitgifte_tot: uitgifte[uitgifte.length - 1] };
  log(`  ${verboden.cellen} cellen verboden in ${vg.verboden.length} gebieden`);

  const bestand = `bodem_ijsselmeergebied_${celM}m.bin`;
  const binPad = join(MAP, 'gegevens', bestand);
  const vorig = vg.bodem && vg.bodem.cel_m === celM && existsSync(binPad) ? gunzipSync(readFileSync(binPad)) : null;
  const gz = gzipSync(r.codes, { level: 9 });
  gz[4] = gz[5] = gz[6] = gz[7] = 0;     // tijdstempel in de gzip-kop leeg: zelfde inhoud = zelfde bestand
  writeFileSync(binPad, gz);
  const water = r.codes.reduce((n, c) => n + (c !== GEEN_WATER), 0);
  const plaatjes = [`bodem_${vandaag}_${celM}m.png`, `bodem_${vandaag}_${celM}m_krabbersgat.png`];
  writeFileSync(join(CACHE, plaatjes[0]), plaatje(r, { schaal: celM >= 50 ? 0.5 : 0.25 }));
  const KRAB = { west: 5.25, oost: 5.36, noord: 52.76, zuid: 52.68 };
  writeFileSync(join(CACHE, plaatjes[1]), plaatje(r, { ...KRAB, schaal: 250 / celM }));
  let meting = null;
  if (arg('meet')) {
    const ander = celM === 50 ? 25 : 50;
    const m = herbemonster(rd, vg.gebied, ander);
    meting = { cel_m: ander, water: m.codes.reduce((n, c) => n + (c !== GEEN_WATER), 0), gzip: gzipSync(m.codes, { level: 9 }).length };
    plaatjes.push(`bodem_${vandaag}_${ander}m_krabbersgat.png`);
    writeFileSync(join(CACHE, plaatjes[2]), plaatje(m, { ...KRAB, schaal: 250 / ander }));
  }
  verslag.bodem = { laag: nieuwste.laag, jaar: nieuwste.jaar, alle, vorigJaar: vg.bodem?.opname, rd, r, water, bestand, gzip: gz.length, k: Math.max(2, Math.round(celM / 10)),
    stat: bodemStatistiek(r, vorig), vorig: !!vorig, top10: top10 ? top10.opgehaald : null, zonderMeting, buitenGebied, afsluitingen: vg.gebied.afsluitingen, meting, plaatjes: plaatjes.map(p => 'lokaal/ververs/' + p) };
  vg.bodem = {
    bestand, opname: nieuwste.jaar, bron: `${WCS} (laag ${nieuwste.laag})`, opgehaald: vandaag,
    cel_m: celM, west: r.west, noord: r.noord, dlon: r.dlon, dlat: r.dlat, nx: r.nx, ny: r.ny,
    codering: '1 byte per cel, rij voor rij van noord naar zuid; 0..250 = bodem −25,0..0,0 m NAP per 0,1 m; 254 = verboden gebied (water); 255 = geen water',
    sha256: createHash('sha256').update(r.codes).digest('hex')
  };
  log(`  ${r.nx} x ${r.ny} cellen van ${celM} m, ${water} water, ${(gz.length / 1024).toFixed(0)} kB gzip`);

  vg.bronnen = [
    { onderdeel: 'bodem', url: WCS, opgehaald: vandaag },
    { onderdeel: 'betonning', url: WFS, opgehaald: vandaag },
    ...(top10 ? [{ onderdeel: 'land en water (TOP10NL, eenmalig)', url: top10.bron, opgehaald: top10.opgehaald }] : []),
    { onderdeel: 'verboden gebieden, windturbines, eilanden (IENC van RWS, lokaal)', url: 'https://www.vaarweginformatie.nl/frp/page/infra_enc', opgehaald: vg.ienc.uitgifte_tot }
  ];
  // nooit een eerder verslag overschrijven: een tweede run op dezelfde dag wordt ververs_<datum>_2.md
  verslag.naam = `ververs_${vandaag}`;
  for (let n = 2; existsSync(join(MAP, 'beheer', 'verslagen', verslag.naam + '.md')); n++) verslag.naam = `ververs_${vandaag}_${n}`;
  vg.concept = { verslag: verslag.naam, toelichting: 'Ververst, wacht op goedkeuring (npm run ververs -- --goedkeuren)' };
  schrijfJson(VG_PAD, vg);
}

const pad = schrijfVerslag(verslag);
log(`\nVerslag: ${pad}`);
