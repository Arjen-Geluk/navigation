// S-57-lezer (ENC en Inland ENC) bovenop iso8211.mjs. Zonder afhankelijkheden.
//
//   import { leesCel, naarGeoJSON, leesCatalogus, codes } from './s57.mjs';
//   const cel = leesCel('pad/1R7YM001.000');
//   const fc = naarGeoJSON(cel, { klassen: ['LNDARE', 'DEPARE', 'resare'] });
//
// Werkt met basiscellen (.000). Updatebestanden (.001 e.v.) worden niet toegepast: RWS levert
// bij elke release complete basiscellen, dus haal liever een nieuwe release op.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesIso8211 } from './iso8211.mjs';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

// ---------- codetabellen (GDAL-CSV's, zie data/BRON.md) ----------

function leesCsv(pad) {
  const regels = readFileSync(pad, 'utf8').split(/\r?\n/).filter(Boolean);
  const splits = r => {
    const uit = []; let v = '', q = false;
    for (let i = 0; i < r.length; i++) {
      const c = r[i];
      if (q) { if (c === '"' && r[i + 1] === '"') { v += '"'; i++; } else if (c === '"') q = false; else v += c; }
      else if (c === '"') q = true; else if (c === ',') { uit.push(v); v = ''; } else v += c;
    }
    uit.push(v); return uit;
  };
  const kop = splits(regels[0]);
  return regels.slice(1).map(r => Object.fromEntries(splits(r).map((v, i) => [kop[i], v])));
}

let _codes;
/**
 * Codetabellen: objectklassen en attributen op code én acroniem, plus toegestane waarden.
 * Eerst de IENC Feature Catalogue (data/ienc_catalogus.json, IEHG 2.6 + bIENC 1.0), daarna GDAL
 * (data/*.csv) voor maritieme codes die de IENC-catalogus niet noemt.
 * Let op: acroniemen zijn hoofdlettergevoelig. SLCONS (122, S-57) en slcons (17032, Inland) zijn
 * verschillende klassen, net als BOYLAT/boylat, BCNLAT/bcnlat, RESTRN/restrn.
 */
export function codes() {
  if (_codes) return _codes;
  const klassen = new Map(), klasseOpAcr = new Map(), attr = new Map(), attrOpAcr = new Map(), waarden = new Map();
  const zetKlasse = k => { if (!klassen.has(k.code)) { klassen.set(k.code, k); klasseOpAcr.set(k.acr, k); } };
  const zetAttr = a => { if (!attr.has(a.code)) { attr.set(a.code, a); attrOpAcr.set(a.acr, a); } };
  const ienc = JSON.parse(readFileSync(join(DATA, 'ienc_catalogus.json'), 'utf8'));
  for (const [code, f] of Object.entries(ienc.features)) zetKlasse({ code: +code, naam: f.naam, acr: f.acr, primitieven: f.primitieven, attributen: f.attributen, bron: 'IENC' });
  for (const [code, a] of Object.entries(ienc.attributen)) {
    zetAttr({ code: +code, naam: a.naam, acr: a.acr, type: a.type, bron: 'IENC' });
    if (a.waarden) waarden.set(+code, new Map(Object.entries(a.waarden).map(([k, v]) => [+k, v])));
  }
  for (const r of leesCsv(join(DATA, 's57objectclasses.csv')))
    zetKlasse({ code: +r.Code, naam: r.ObjectClass, acr: r.Acronym, primitieven: (r.Primitives || '').split(';').filter(Boolean), bron: 'GDAL' });
  for (const r of leesCsv(join(DATA, 's57attributes.csv')))
    zetAttr({ code: +r.Code, naam: r.Attribute, acr: r.Acronym, type: r.Attributetype, bron: 'GDAL' });
  for (const r of leesCsv(join(DATA, 's57expectedinput.csv'))) {
    const code = +r.Code;
    if (!waarden.has(code)) waarden.set(code, new Map());
    const t = waarden.get(code);
    if (!t.has(+r.ID)) t.set(+r.ID, r.Meaning);
  }
  return (_codes = { klassen, klasseOpAcr, attr, attrOpAcr, waarden, bronnen: ienc.bronnen });
}

/** Omschrijving van een enum-/lijstwaarde, bijv. betekenis('restrn', 7) -> "entry prohibited". */
export function betekenis(attrAcr, waarde) {
  const c = codes(), a = c.attrOpAcr.get(attrAcr);
  if (!a) return undefined;
  const tabel = c.waarden.get(a.code);
  if (!tabel || typeof waarde === 'string') return undefined;
  if (Array.isArray(waarde)) return waarde.map(w => tabel.get(w) ?? String(w));
  return tabel.get(waarde);
}

// ---------- cel lezen ----------

const naamSleutel = b => `${b[0]}:${b.readUInt32LE(1)}`; // NAME B(40): RCNM (1 byte) + RCID (4 bytes)
const lnamSleutel = b => `${b.readUInt16LE(0)}:${b.readUInt32LE(2)}:${b.readUInt16LE(6)}`; // AGEN:FIDN:FIDS

// Zet ATVL om naar een getal of lijst. Klopt de waarde niet met het type (komt voor in RWS-data:
// "RECORDING_GAUGE_WITH_REMOTE_ACCESS" of "swinging area" waar een code hoort), dan blijft de tekst staan.
function attribuutWaarde(type, ruw) {
  if (ruw == null || ruw.trim() === '') return null;
  const getal = /^\s*-?\d+(\.\d+)?\s*$/;
  if (type === 'E' || type === 'I') return getal.test(ruw) ? parseInt(ruw, 10) : ruw.trim();
  if (type === 'F') return getal.test(ruw) ? parseFloat(ruw) : ruw.trim();
  if (type === 'L') {
    const delen = ruw.split(',').map(x => x.trim()).filter(Boolean);
    return delen.every(x => getal.test(x)) ? delen.map(x => parseInt(x, 10)) : ruw.trim();
  }
  return ruw;
}

/**
 * Leest een S-57-cel.
 * @param {string|Buffer} bron  pad naar .000 of de inhoud
 * @returns {{naam, dsid, dssi, dspm, comf, somf, vectoren: Map, features: Array}}
 */
export function leesCel(bron) {
  const buf = typeof bron === 'string' ? readFileSync(bron) : bron;
  let iso = leesIso8211(buf);
  const veld = (rec, tag) => rec.velden.find(v => v.tag === tag);
  const dssi = iso.records[0] && veld(iso.records[0], 'DSSI')?.waarden[0];
  if (dssi?.NALL === 2) iso = leesIso8211(buf, { ucs2Velden: new Set(['NATF']) });

  const c = codes();
  let dsid, dspm;
  const vectoren = new Map(), features = [];
  for (const rec of iso.records) {
    const tags = Object.fromEntries(rec.velden.map(v => [v.tag, v.waarden]));
    if (tags.DSID) dsid = tags.DSID[0];
    if (tags.DSPM) dspm = tags.DSPM[0];
    if (tags.VRID) {
      const id = tags.VRID[0];
      if (id.RUIN !== 1) throw new Error('Updaterecord gevonden: deze lezer verwerkt alleen basiscellen (.000)');
      vectoren.set(`${id.RCNM}:${id.RCID}`, {
        rcnm: id.RCNM, rcid: id.RCID,
        sg2d: tags.SG2D || null, sg3d: tags.SG3D || null,
        vrpt: (tags.VRPT || []).map(p => ({ sleutel: naamSleutel(p.NAME), ornt: p.ORNT, usag: p.USAG, topi: p.TOPI, mask: p.MASK })),
        attv: tags.ATTV || []
      });
    }
    if (tags.FRID) {
      const f = tags.FRID[0], foid = tags.FOID?.[0];
      const k = c.klassen.get(f.OBJL);
      const attributen = {};
      for (const a of [...(tags.ATTF || []), ...(tags.NATF || [])]) {
        const def = c.attr.get(a.ATTL);
        attributen[def ? def.acr : `ATTL${a.ATTL}`] = attribuutWaarde(def?.type, a.ATVL);
      }
      features.push({
        rcid: f.RCID, prim: f.PRIM, grup: f.GRUP, objl: f.OBJL,
        klasse: k ? k.acr : `OBJL${f.OBJL}`,
        lnam: foid ? `${foid.AGEN}:${foid.FIDN}:${foid.FIDS}` : null,
        attributen,
        fspt: (tags.FSPT || []).map(p => ({ sleutel: naamSleutel(p.NAME), ornt: p.ORNT, usag: p.USAG, mask: p.MASK })),
        ffpt: (tags.FFPT || []).map(p => ({ lnam: lnamSleutel(p.LNAM), rind: p.RIND, comt: p.COMT }))
      });
    }
  }
  if (!dsid) throw new Error('Geen DSID-record: is dit een S-57-cel?');
  return {
    naam: dsid.DSNM, dsid, dssi, dspm,
    comf: dspm?.COMF || 10000000, somf: dspm?.SOMF || 10,
    vectoren, features
  };
}

// ---------- geometrie ----------

const kaal = n => n.map(p => [p.XCOO, p.YCOO]);

function knoopCoord(cel, sleutel) {
  const v = cel.vectoren.get(sleutel);
  if (!v || !v.sg2d) return null;
  return [v.sg2d[0].XCOO / cel.comf, v.sg2d[0].YCOO / cel.comf];
}

/** Coördinaten van een rand (edge) inclusief begin- en eindknoop, in de opgegeven richting. */
function randCoords(cel, sleutel, ornt) {
  const e = cel.vectoren.get(sleutel);
  if (!e) return null;
  const begin = e.vrpt.find(p => p.topi === 1), eind = e.vrpt.find(p => p.topi === 2);
  const midden = e.sg2d ? kaal(e.sg2d).map(([x, y]) => [x / cel.comf, y / cel.comf]) : [];
  const pts = [knoopCoord(cel, begin?.sleutel), ...midden, knoopCoord(cel, eind?.sleutel)].filter(Boolean);
  const r = { pts, van: begin?.sleutel, naar: eind?.sleutel };
  if (ornt === 2) return { pts: pts.reverse(), van: r.naar, naar: r.van };
  return r;
}

// Rijgt randen aan elkaar tot zo lang mogelijke ketens (op knoop-id's, niet op coördinaten).
function rijg(randen) {
  const rest = randen.slice(), ketens = [];
  while (rest.length) {
    const k = rest.shift();
    const keten = { pts: k.pts.slice(), van: k.van, naar: k.naar };
    let gevonden = true;
    while (gevonden && keten.naar !== keten.van) {
      gevonden = false;
      for (let i = 0; i < rest.length; i++) {
        if (rest[i].van === keten.naar) {
          keten.pts.push(...rest[i].pts.slice(1)); keten.naar = rest[i].naar;
          rest.splice(i, 1); gevonden = true; break;
        }
      }
    }
    ketens.push(keten);
  }
  return ketens;
}

const ringOppervlak = r => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return s / 2; };
function sluit(r) { const a = r[0], b = r[r.length - 1]; if (a[0] !== b[0] || a[1] !== b[1]) r.push(a.slice()); return r; }
function puntInRing([x, y], r) {
  let in_ = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > y) !== (r[j][1] > y) && x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) in_ = !in_;
  }
  return in_;
}

/**
 * GeoJSON-geometrie van een feature (lon/lat, WGS84), of null bij een metafeature zonder geometrie.
 * Vlakken volgen RFC 7946: buitenring tegen de klok in, gaten met de klok mee.
 * Randen met MASK=1 tellen wel mee voor de ring (anders breekt die), maar worden in
 * `randenGemaskeerd` gemeld zodat je ze bij het tekenen van kustlijnen kunt weglaten.
 */
export function geometrie(cel, f, diag) {
  if (f.prim === 1) {
    const pts = [];
    for (const p of f.fspt) {
      const v = cel.vectoren.get(p.sleutel);
      if (v?.sg3d) for (const s of v.sg3d) pts.push([s.XCOO / cel.comf, s.YCOO / cel.comf, s.VE3D / cel.somf]);
      else if (v?.sg2d) for (const s of v.sg2d) pts.push([s.XCOO / cel.comf, s.YCOO / cel.comf]);
    }
    if (!pts.length) return null;
    return pts.length === 1 ? { type: 'Point', coordinates: pts[0] } : { type: 'MultiPoint', coordinates: pts };
  }
  if (f.prim === 2) {
    const ketens = rijg(f.fspt.map(p => randCoords(cel, p.sleutel, p.ornt)).filter(Boolean));
    if (!ketens.length) return null;
    return ketens.length === 1 ? { type: 'LineString', coordinates: ketens[0].pts } : { type: 'MultiLineString', coordinates: ketens.map(k => k.pts) };
  }
  if (f.prim === 3) {
    const buiten = [], binnen = [];
    // USAG 1 = buitenrand, 3 = buitenrand op de celgrens (afgesneden), 2 = binnenrand (gat).
    // 1 en 3 vormen samen dezelfde buitenring en moeten dus samen geregen worden.
    for (const gat of [false, true]) {
      const randen = f.fspt.filter(p => (p.usag === 2) === gat).map(p => randCoords(cel, p.sleutel, p.ornt)).filter(Boolean);
      for (const k of rijg(randen)) {
        if (k.van !== k.naar && diag) diag.openRingen = (diag.openRingen || 0) + 1;
        if (k.pts.length >= 3) (gat ? binnen : buiten).push(sluit(k.pts));
      }
    }
    if (!buiten.length) return null;
    for (const r of buiten) if (ringOppervlak(r) < 0) r.reverse();
    for (const r of binnen) if (ringOppervlak(r) > 0) r.reverse();
    const polygonen = buiten.map(r => [r]);
    for (const g of binnen) {
      const doel = polygonen.find(p => puntInRing(g[0], p[0])) || polygonen[0];
      doel.push(g);
    }
    return polygonen.length === 1 ? { type: 'Polygon', coordinates: polygonen[0] } : { type: 'MultiPolygon', coordinates: polygonen };
  }
  return null;
}

// ---------- GeoJSON ----------

/**
 * Zet (een deel van) een cel om naar een GeoJSON FeatureCollection.
 * @param {object} cel  uit leesCel
 * @param {{klassen?: string[], bbox?: number[], beschrijf?: boolean}} opties
 *   klassen  acroniemen om te houden (hoofdlettergevoelig: S-57 in hoofdletters, Inland in kleine letters)
 *   bbox     [west, zuid, oost, noord]: alleen features waarvan de omhullende dit vak raakt
 *   beschrijf  enum-/lijstwaarden ook als tekst toevoegen (attribuut `<ACR>_tekst`)
 */
export function naarGeoJSON(cel, opties = {}) {
  const houd = opties.klassen ? new Set(opties.klassen) : null;
  const uit = [];
  for (const f of cel.features) {
    if (houd && !houd.has(f.klasse)) continue;
    const g = geometrie(cel, f);
    if (!g) continue;
    if (opties.bbox && !raakt(omhullende(g), opties.bbox)) continue;
    const props = { klasse: f.klasse, objl: f.objl, lnam: f.lnam, cel: cel.naam, ...f.attributen };
    if (opties.beschrijf) {
      for (const [k, v] of Object.entries(f.attributen)) {
        const t = v == null ? undefined : betekenis(k, v);
        if (t !== undefined) props[`${k}_tekst`] = Array.isArray(t) ? t.join('; ') : t;
      }
    }
    uit.push({ type: 'Feature', geometry: g, properties: props });
  }
  return { type: 'FeatureCollection', features: uit };
}

export function omhullende(g) {
  let w = Infinity, z = Infinity, o = -Infinity, n = -Infinity;
  const loop = c => { if (typeof c[0] === 'number') { w = Math.min(w, c[0]); o = Math.max(o, c[0]); z = Math.min(z, c[1]); n = Math.max(n, c[1]); } else c.forEach(loop); };
  loop(g.coordinates);
  return [w, z, o, n];
}
const raakt = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

// ---------- catalogus ----------

/**
 * Leest CATALOG.031 van een ENC_ROOT en geeft de cellen met hun omhullende.
 * @returns {Array<{bestand, pad, bbox:[w,z,o,n]}>}
 */
export function leesCatalogus(encRoot) {
  const kandidaten = ['CATALOG.031', 'catalog.031'].map(n => join(encRoot, n));
  const pad = kandidaten.find(existsSync);
  if (!pad) throw new Error(`Geen CATALOG.031 in ${encRoot}`);
  const iso = leesIso8211(readFileSync(pad));
  const uit = [];
  for (const rec of iso.records) {
    const c = rec.velden.find(v => v.tag === 'CATD')?.waarden[0];
    if (!c || !/\.000$/i.test(c.FILE)) continue;
    const rel = c.FILE.replace(/\\/g, '/');
    uit.push({ bestand: basename(rel), pad: join(encRoot, rel), bbox: [c.WLON, c.SLAT, c.ELON, c.NLAT] });
  }
  return uit;
}

/** Cellen uit de catalogus die een gebied [w,z,o,n] raken. */
export function cellenVoorGebied(encRoot, bbox) {
  return leesCatalogus(encRoot).filter(c => c.bbox.every(Number.isFinite) && raakt(c.bbox, bbox));
}
