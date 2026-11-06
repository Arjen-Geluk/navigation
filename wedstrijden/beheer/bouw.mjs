// Bouwscript: zet bron/, gegevens/ en Leaflet samen in één zelfstandige index.html.
//
//   npm run bouw               bouwt wedstrijden/index.html
//   npm run bouw -- --controle controleert alleen of index.html bij de bron past (bouwt niets)
//
// De uitvoer is deterministisch: dezelfde bron geeft byte voor byte dezelfde index.html.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const MAP = join(dirname(fileURLToPath(import.meta.url)), '..');      // wedstrijden/
const LOKAAL = join(MAP, '..', 'lokaal');                               // echte data, niet in git
const lees = p => readFileSync(join(MAP, p), 'utf8');
const require = createRequire(import.meta.url);
const leafletMap = dirname(require.resolve('leaflet/dist/leaflet.js'));
const controle = process.argv.includes('--controle');

const stop = melding => { console.error('\n✗ ' + melding); process.exit(1); };

// ---- bronbestanden ----
const scripts = ['bron/kern', 'bron/ui'].flatMap(m => readdirSync(join(MAP, m)).filter(f => f.endsWith('.js')).sort().map(f => `${m}/${f}`));

// ---- gegevens lezen en controleren ----
// dezelfde controle als de pagina zelf gebruikt (bron/kern/10_editie.js)
const kern = { module: { exports: {} } };
vm.runInNewContext(lees('bron/kern/10_editie.js'), kern);
const { controleerEditie } = kern.module.exports;

const vaargebied = JSON.parse(lees('gegevens/vaargebied_ijsselmeergebied.json'));
if (vaargebied.formaat !== 'vaargebied/1') stop('vaargebied: onbekend formaat ' + vaargebied.formaat);

const editieBestanden = readdirSync(join(MAP, 'gegevens/wedstrijden')).filter(f => f.endsWith('.json')).sort();
const edities = editieBestanden.map(f => {
  const e = JSON.parse(lees('gegevens/wedstrijden/' + f));
  const fouten = controleerEditie(e);
  if (fouten.length) stop(`editie ${f}:\n  - ` + fouten.join('\n  - '));
  return e;
});

const tool = vm.runInNewContext(lees('bron/kern/00_versie.js') + ';TOOL');
const bouw = {
  tool: tool.versie,
  vaargebied: { versie: vaargebied.versie, datum: vaargebied.datum },
  edities: edities.map((e, i) => ({ bestand: editieBestanden[i], wedstrijd: e.wedstrijd.id, jaar: e.jaar, versie: e.versie }))
};

// ---- samenstellen ----
// Leaflet-css: plaatjes (laagknop) als data-URI, zodat de pagina geen losse bestanden nodig heeft
const leafletCss = readFileSync(join(leafletMap, 'leaflet.css'), 'utf8').replace(/url\(images\/([\w-]+\.png)\)/g,
  (_, f) => `url(data:image/png;base64,${readFileSync(join(leafletMap, 'images', f)).toString('base64')})`);
const leafletJs = readFileSync(join(leafletMap, 'leaflet.js'), 'utf8').replace(/\/\/# sourceMappingURL=.*$/m, '');
const veiligJs = s => s.replace(/<\/script/gi, '<\\/script');
// Betonning compact voor de kaart: per markering [naam, lat, lon, kleur, vorm, licht, drijvend]
let betonning = null;
if (vaargebied.betonning?.bestand) {
  const b = JSON.parse(lees('gegevens/' + vaargebied.betonning.bestand));
  const licht = l => l ? [l.karakter, l.groep && l.groep !== '(1)' ? l.groep : '', ' ', (l.kleur || '').slice(0, 1), l.periode_s ? ' ' + l.periode_s + 's' : ''].join('').trim() : '';
  betonning = { opgehaald: b.opgehaald, velden: ['naam', 'lat', 'lon', 'kleur', 'vorm', 'licht', 'drijvend'],
    rijen: b.markeringen.map(m => [m.naam, m.lat, m.lon, m.kleur || '', m.vorm || '', licht(m.licht), m.drijvend ? 1 : 0]) };
}
const gegevensJson = JSON.stringify({ bouw, vaargebied, edities, betonning }).replace(/<\//g, '<\\/');
// Bodemraster: het gzip-bestand als base64; de pagina pakt het uit met DecompressionStream
const bodemB64 = vaargebied.bodem ? readFileSync(join(MAP, 'gegevens', vaargebied.bodem.bestand)).toString('base64') : '';

const vervang = { LEAFLET_CSS: leafletCss, STIJL: lees('bron/stijl.css'), GEGEVENS: gegevensJson, BODEM: bodemB64,
  LEAFLET_JS: veiligJs(leafletJs), SCRIPTS: scripts.map(f => `// ---- ${f} ----\n` + veiligJs(lees(f))).join('\n') };
let html = lees('bron/pagina.html');
for (const [k, v] of Object.entries(vervang)) {
  const plek = `/*@@${k}@@*/`;
  if (html.split(plek).length !== 2) stop(`pagina.html: plaatshouder ${plek} moet precies één keer voorkomen`);
  html = html.split(plek).join(v);
}
html = html.replace(/\r\n/g, '\n');

// ---- privacy: geen scheepsnamen uit lokaal/ in de pagina ----
const verboden = new Set();
if (existsSync(LOKAAL)) {
  for (const f of readdirSync(LOKAAL)) {
    if (f.endsWith('.json')) try {
      const o = JSON.parse(readFileSync(join(LOKAAL, f), 'utf8'));
      [o?.schip?.naam, o?.naam].forEach(n => typeof n === 'string' && verboden.add(n));
    } catch { /* geen JSON: overslaan */ }
    if (f === 'verboden_woorden.txt') readFileSync(join(LOKAAL, f), 'utf8').split(/\r?\n/).forEach(w => w.trim() && verboden.add(w.trim()));
  }
}
const klein = html.toLowerCase();
const gevonden = [...verboden].filter(w => w.length >= 4 && klein.includes(w.toLowerCase()));
if (gevonden.length) stop(`de pagina bevat ${gevonden.length} naam/namen uit lokaal/ (scheepsdata). Haal die eerst uit de bron.`);

// ---- schrijven of controleren ----
const doel = join(MAP, 'index.html');
const kB = n => (n / 1024).toFixed(0) + ' kB';
if (controle) {
  const huidig = existsSync(doel) ? readFileSync(doel, 'utf8').replace(/\r\n/g, '\n') : '';
  if (huidig !== html) stop('index.html past niet bij de bron: draai npm run bouw');
  console.log('✓ index.html is actueel');
} else {
  writeFileSync(doel, html);
  console.log(`✓ index.html gebouwd: ${kB(Buffer.byteLength(html))}`);
}
console.log(`  tool ${bouw.tool} · vaargebied v${bouw.vaargebied.versie} (${bouw.vaargebied.datum}) · edities: ${bouw.edities.map(e => `${e.wedstrijd} ${e.jaar} v${e.versie}`).join(', ')}`);
console.log(`  privacycontrole: ${verboden.size} namen uit lokaal/ gezocht, niets gevonden`);
