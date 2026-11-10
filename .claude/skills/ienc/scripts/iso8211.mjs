// ISO/IEC 8211-lezer: het bestandsformaat onder S-57 (.000-cellen en CATALOG.031).
// Zonder afhankelijkheden; leest een Buffer en geeft per record de velden met hun subvelden.
//
//   import { leesIso8211 } from './iso8211.mjs';
//   const { velden, records } = leesIso8211(readFileSync('1R7YM001.000'));
//   records[0].velden  -> [{ tag: 'DSID', waarden: [{ RCNM: 10, RCID: 1, ... }] }, ...]
//
// Een veld met herhalende subvelden (array-descriptor begint met '*') geeft meerdere
// elementen in `waarden`, bijv. SG2D -> [{YCOO, XCOO}, {YCOO, XCOO}, ...].

const UT = 0x1f; // unit terminator (einde subveld)
const FT = 0x1e; // field terminator (einde veld)

function leesLeader(buf, pos) {
  const l = buf.toString('latin1', pos, pos + 24);
  return {
    lengte: parseInt(l.slice(0, 5), 10),
    leaderId: l[6],
    basis: parseInt(l.slice(12, 17), 10),
    veldControleLengte: parseInt(l.slice(10, 12), 10) || 0,
    lenLengte: parseInt(l[20], 10),
    posLengte: parseInt(l[21], 10),
    tagLengte: parseInt(l[23], 10)
  };
}

function leesDirectory(buf, pos, leader) {
  const { lenLengte, posLengte, tagLengte, basis } = leader;
  const stap = tagLengte + lenLengte + posLengte;
  const items = [];
  let p = pos + 24;
  while (buf[p] !== FT) {
    const s = buf.toString('latin1', p, p + stap);
    items.push({
      tag: s.slice(0, tagLengte),
      lengte: parseInt(s.slice(tagLengte, tagLengte + lenLengte), 10),
      start: pos + basis + parseInt(s.slice(tagLengte + lenLengte), 10)
    });
    p += stap;
  }
  return items;
}

// "(A(2),I(10),3A,b11,2b24,B(40))" -> [{type:'A',w:2},{type:'I',w:10},{type:'A'},...]
function parseFormaat(f) {
  f = f.trim();
  if (f.startsWith('(') && f.endsWith(')')) f = f.slice(1, -1);
  const delen = [];
  let diepte = 0, huidig = '';
  for (const c of f) {
    if (c === '(') diepte++;
    if (c === ')') diepte--;
    if (c === ',' && diepte === 0) { delen.push(huidig); huidig = ''; } else huidig += c;
  }
  if (huidig) delen.push(huidig);
  const uit = [];
  for (const d of delen) {
    const m = /^(\d*)(.*)$/.exec(d.trim());
    const n = m[1] ? parseInt(m[1], 10) : 1;
    const kern = m[2];
    if (kern.startsWith('(')) {
      const groep = parseFormaat(kern);
      for (let i = 0; i < n; i++) uit.push(...groep);
      continue;
    }
    let el;
    const bin = /^b([12])(\d)$/.exec(kern);
    if (bin) el = { type: 'b', signed: bin[1] === '2', w: parseInt(bin[2], 10) };
    else {
      const m2 = /^([AIRBC@])(?:\((\d+)\))?$/.exec(kern);
      if (!m2) throw new Error(`Onbekend ISO 8211-formaat: ${kern}`);
      el = { type: m2[1], w: m2[2] ? parseInt(m2[2], 10) : 0 };
      if (el.type === 'B') el.w = el.w / 8; // bitveld in bits -> bytes
    }
    for (let i = 0; i < n; i++) uit.push(el);
  }
  return uit;
}

function leesDdr(buf) {
  const leader = leesLeader(buf, 0);
  const velden = {};
  for (const d of leesDirectory(buf, 0, leader)) {
    const ruw = buf.subarray(d.start, d.start + d.lengte);
    if (d.tag === '0000') continue;
    const fcl = leader.veldControleLengte || 9;
    const delen = ruw.subarray(fcl).toString('latin1').replace(/\x1e$/, '').split('\x1f');
    const naam = delen[0], array = delen[1] || '', formaat = delen[2] || '';
    const herhalend = array.startsWith('*');
    const labels = array.replace(/^\*/, '').split('!').filter(Boolean);
    velden[d.tag] = { naam, labels, herhalend, formaten: formaat ? parseFormaat(formaat) : [] };
  }
  return { leader, velden };
}

// Leest één veld (zonder de afsluitende FT) volgens zijn definitie.
function leesVeld(def, ruw, ucs2) {
  const eind = ruw[ruw.length - 1] === FT ? ruw.length - 1 : ruw.length;
  const waarden = [];
  let p = 0;
  const labels = def.labels.length ? def.labels : ['waarde'];
  do {
    const rec = {};
    for (let i = 0; i < labels.length; i++) {
      const f = def.formaten[i] || def.formaten[def.formaten.length - 1] || { type: 'A', w: 0 };
      let v;
      if (f.type === 'b') {
        v = f.w === 1 ? (f.signed ? ruw.readInt8(p) : ruw.readUInt8(p))
          : f.w === 2 ? (f.signed ? ruw.readInt16LE(p) : ruw.readUInt16LE(p))
          : f.signed ? ruw.readInt32LE(p) : ruw.readUInt32LE(p);
        p += f.w;
      } else if (f.type === 'B') {
        v = ruw.subarray(p, p + f.w); p += f.w;
      } else if (f.w) {
        v = ruw.toString('latin1', p, p + f.w); p += f.w;
        if (f.type === 'I') v = v.trim() === '' ? null : parseInt(v, 10);
        else if (f.type === 'R') v = v.trim() === '' ? null : parseFloat(v);
      } else if (ucs2 && f.type === 'A') {
        // lexical level 2: UCS-2 (UTF-16LE), afgesloten met 0x1f 0x00
        let q = p;
        while (q + 1 < eind && !(ruw[q] === UT && ruw[q + 1] === 0)) q += 2;
        v = ruw.toString('utf16le', p, q); p = Math.min(q + 2, eind);
      } else {
        let q = p;
        while (q < eind && ruw[q] !== UT) q++;
        v = ruw.toString('latin1', p, q); p = Math.min(q + 1, eind);
        if (f.type === 'I') v = v === '' ? null : parseInt(v, 10);
        else if (f.type === 'R') v = v === '' ? null : parseFloat(v);
      }
      rec[labels[i]] = v;
    }
    waarden.push(rec);
  } while (def.herhalend && p < eind);
  return waarden;
}

/**
 * Leest een volledig ISO 8211-bestand.
 * @param {Buffer} buf
 * @param {{ucs2Velden?: Set<string>}} opties  velden die in UCS-2 staan (S-57: NATF bij NALL=2)
 */
export function leesIso8211(buf, opties = {}) {
  const ddr = leesDdr(buf);
  const ucs2 = opties.ucs2Velden || new Set();
  const records = [];
  let pos = ddr.leader.lengte;
  while (pos < buf.length) {
    if (buf.length - pos < 24) break;
    const leader = leesLeader(buf, pos);
    if (!leader.lengte) break;
    const velden = [];
    for (const d of leesDirectory(buf, pos, leader)) {
      const def = ddr.velden[d.tag];
      if (!def) continue; // 0001 (record-id) heeft soms geen beschrijving; niet nodig
      velden.push({ tag: d.tag, waarden: leesVeld(def, buf.subarray(d.start, d.start + d.lengte), ucs2.has(d.tag)) });
    }
    records.push({ velden });
    pos += leader.lengte;
  }
  return { velden: ddr.velden, records };
}
