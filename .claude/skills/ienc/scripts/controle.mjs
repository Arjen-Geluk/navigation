// Controleert een (nieuwe) IENC-release voordat je hem gebruikt:
// leest alle cellen, meldt onbekende objectklassen/attributen, open ringen, updatebestanden
// en de uitgiftedatum per cel. Draai dit na elke nieuwe download.
//
//   node controle.mjs <ENC_ROOT> [--bbox w,z,o,n]
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { leesCel, leesCatalogus, geometrie, codes } from './s57.mjs';

const root = process.argv[2];
if (!root) { console.error('Gebruik: node controle.mjs <ENC_ROOT> [--bbox w,z,o,n]'); process.exit(1); }
const i = process.argv.indexOf('--bbox');
const bbox = i > 0 ? process.argv[i + 1].split(',').map(Number) : null;

// updatebestanden (.001 e.v.) worden door de lezer niet toegepast
const updates = [];
(function zoek(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) zoek(p); else if (/\.(00[1-9]|0[1-9]\d|[1-9]\d\d)$/i.test(n) && !/^catalog\./i.test(n)) updates.push(n); } })(root);

const raakt = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const cat = leesCatalogus(root).filter(c => !bbox || raakt(c.bbox, bbox));
const onbekendeKlassen = {}, onbekendeAttr = {}, fouten = [];
const diag = {};
let n = 0, objecten = 0, oudste = '99999999', nieuwste = '00000000';
const t0 = Date.now();
for (const c of cat) {
  let cel;
  try { cel = leesCel(c.pad); } catch (e) { fouten.push(`${c.bestand}: ${e.message}`); continue; }
  n++;
  if (cel.dsid.ISDT < oudste) oudste = cel.dsid.ISDT;
  if (cel.dsid.ISDT > nieuwste) nieuwste = cel.dsid.ISDT;
  for (const f of cel.features) {
    objecten++;
    if (f.klasse.startsWith('OBJL')) onbekendeKlassen[f.klasse] = (onbekendeKlassen[f.klasse] || 0) + 1;
    for (const k of Object.keys(f.attributen)) if (k.startsWith('ATTL')) onbekendeAttr[k] = (onbekendeAttr[k] || 0) + 1;
    geometrie(cel, f, diag);
  }
}
console.log(`IENC-codetabel: ${codes().bronnen.map(b => `${b.product} ${b.editie}`).join(', ')}`);
console.log(`${n} van ${cat.length} cellen gelezen, ${objecten} objecten, uitgifte ${oudste}..${nieuwste}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`open ringen: ${diag.openRingen || 0}`);
console.log(`onbekende objectklassen: ${JSON.stringify(onbekendeKlassen)}`);
console.log(`onbekende attributen: ${JSON.stringify(onbekendeAttr)}`);
if (updates.length) console.log(`LET OP: ${updates.length} updatebestanden gevonden (${updates.slice(0, 5).join(', ')}); die worden niet toegepast`);
for (const f of fouten) console.log('FOUT', f);
process.exitCode = fouten.length || Object.keys(onbekendeKlassen).length || diag.openRingen ? 1 : 0;
