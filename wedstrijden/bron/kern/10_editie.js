// Edities lezen en controleren. Pure functies: draaien in de browser én in het bouwscript (Node).

// "KG-9 bb" → { punt: 'KG-9', zijde: 'bb' };  "De Ven" → { punt: 'De Ven', zijde: null }
function leesStap(tekst) {
  const m = String(tekst).trim().match(/^(.*?)\s+(bb|sb)$/);
  return m ? { punt: m[1], zijde: m[2] } : { punt: String(tekst).trim(), zijde: null };
}

// Geeft een lijst met fouten (leeg = in orde).
function controleerEditie(e) {
  const fout = [];
  if (!e || e.formaat !== 'wedstrijdeditie/1') return ['onbekend formaat: ' + (e && e.formaat)];
  for (const v of ['jaar', 'versie', 'regeltype', 'datum', 'start', 'finishlimiet']) if (e[v] == null) fout.push(`veld ${v} ontbreekt`);
  if (!['varianten', 'vrij'].includes(e.regeltype)) fout.push('regeltype moet varianten of vrij zijn');
  if (!e.status || typeof e.status.gecontroleerd !== 'boolean') fout.push('status.gecontroleerd ontbreekt');
  if (e.datum && !String(e.datum).startsWith(String(e.jaar))) fout.push(`datum ${e.datum} hoort niet bij jaar ${e.jaar}`);
  const ids = new Set();
  for (const p of e.punten || []) {
    if (ids.has(p.id)) fout.push(`punt ${p.id} staat dubbel`);
    ids.add(p.id);
    if (!(p.lat > 52 && p.lat < 53.5 && p.lon > 4.5 && p.lon < 6.5)) fout.push(`punt ${p.id} ligt buiten het IJsselmeergebied`);
  }
  for (const z of e.zones || []) if (!z.punten || z.punten.length < 3) fout.push(`zone ${z.id} heeft te weinig punten`);
  for (const [b, baan] of Object.entries(e.banen || {})) for (const r of baan.routes || []) {
    const st = r.volgorde.map(leesStap);
    st.forEach(s => { if (!ids.has(s.punt)) fout.push(`baan ${b}, ${r.naam}: punt "${s.punt}" bestaat niet`); });
    if (st[0]?.punt !== 'Start' && !st[0]?.punt.startsWith('Start')) fout.push(`baan ${b}, ${r.naam}: begint niet bij de start`);
  }
  return fout;
}

if (typeof module !== 'undefined') module.exports = { leesStap, controleerEditie };
