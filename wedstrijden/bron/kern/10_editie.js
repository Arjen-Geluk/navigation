// Edities lezen, controleren en de posities van boeien uit de RWS-betonning invullen.
// Pure functies: draaien in de browser én in het bouwscript en de tests (Node).

// "EZ A bb" → { punt: 'EZ A', zijde: 'bb' };  "Start" → { punt: 'Start', zijde: null }
function leesStap(tekst) {
  const m = String(tekst).trim().match(/^(.*?)\s+(bb|sb)$/);
  return m ? { punt: m[1], zijde: m[2] } : { punt: String(tekst).trim(), zijde: null };
}

// Boeinamen vergelijken zonder spaties en streepjes: "EZ-A", "EZ A" en "eza" zijn dezelfde boei.
const boeiSleutel = s => String(s || '').toUpperCase().replace(/[\s-]+/g, '');
// betonning: [{ naam, lat, lon }] → Map sleutel → [markeringen]
function betonningIndex(betonning) {
  const m = new Map();
  for (const b of betonning) { const k = boeiSleutel(b.naam); (m.get(k) || m.set(k, []).get(k)).push(b); }
  return m;
}
// Eén boei op naam: { boei } of { fout }
function zoekBoei(index, naam) {
  const v = index.get(boeiSleutel(naam)) || [];
  if (!v.length) return { fout: `boei "${naam}" staat niet in de RWS-betonning` };
  if (v.length > 1) return { fout: `er zijn ${v.length} RWS-boeien met de naam "${naam}"; gebruik een wedstrijdton met eigen positie` };
  return { boei: v[0] };
}
// Kopie van de editie met de posities van alle punten met een RWS-naam (ook de hoeken van zones) uit de betonning.
// Geeft { editie, fouten }.
function metPosities(e, index) {
  const fouten = [];
  const vul = p => {
    if (!p.rws) return { ...p, positie: 'editie' };
    const z = zoekBoei(index, p.rws);
    if (z.fout) { fouten.push(`${p.id}: ${z.fout}`); return { ...p, positie: 'onbekend' }; }
    return { ...p, lat: z.boei.lat, lon: z.boei.lon, positie: 'RWS' };
  };
  return { editie: { ...e, punten: e.punten.map(vul), zones: e.zones.map(z => ({ ...z, punten: z.punten.map(vul) })) }, fouten };
}

// Geeft een lijst met fouten (leeg = in orde). Punten zonder RWS-naam moeten zelf een positie hebben.
function controleerEditie(e) {
  const fout = [];
  if (!e || e.formaat !== 'wedstrijdeditie/1') return ['onbekend formaat: ' + (e && e.formaat)];
  for (const v of ['jaar', 'versie', 'regeltype', 'datum', 'start', 'finishlimiet']) if (e[v] == null) fout.push(`veld ${v} ontbreekt`);
  if (!['varianten', 'vrij'].includes(e.regeltype)) fout.push('regeltype moet varianten of vrij zijn');
  if (!e.status || typeof e.status.gecontroleerd !== 'boolean') fout.push('status.gecontroleerd ontbreekt');
  if (e.datum && !String(e.datum).startsWith(String(e.jaar))) fout.push(`datum ${e.datum} hoort niet bij jaar ${e.jaar}`);
  const ids = new Set();
  const positieOk = p => p.rws || (p.lat > 52 && p.lat < 53.5 && p.lon > 4.5 && p.lon < 6.5);
  for (const p of e.punten || []) {
    if (ids.has(p.id)) fout.push(`punt ${p.id} staat dubbel`);
    ids.add(p.id);
    if (!positieOk(p)) fout.push(`punt ${p.id} heeft geen RWS-naam en geen positie in het IJsselmeergebied`);
  }
  for (const z of e.zones || []) {
    if (!z.punten || z.punten.length < 3) fout.push(`zone ${z.id} heeft te weinig punten`);
    else z.punten.forEach(p => { if (!positieOk(p)) fout.push(`zone ${z.id}, punt ${p.id}: geen RWS-naam en geen positie`); });
  }
  for (const [b, baan] of Object.entries(e.banen || {})) for (const r of baan.routes || []) {
    const st = r.volgorde.map(leesStap);
    st.forEach(s => { if (!ids.has(s.punt)) fout.push(`baan ${b}, ${r.naam}: punt "${s.punt}" bestaat niet`); });
    if (st[0]?.punt !== 'Start') fout.push(`baan ${b}, ${r.naam}: begint niet bij de start`);
    if (st[st.length - 1]?.punt !== 'Finish') fout.push(`baan ${b}, ${r.naam}: eindigt niet bij de finish`);
  }
  return fout;
}

if (typeof module !== 'undefined') module.exports = { leesStap, boeiSleutel, betonningIndex, zoekBoei, metPosities, controleerEditie };
