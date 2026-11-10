// Bouwt data/ienc_catalogus.json uit de XML-versies van de IENC Feature Catalogue (IEHG).
// Alleen nodig als er een nieuwe editie van de catalogus is; de XML's zelf staan niet in de repo.
//
//   node bouw_catalogus.mjs <IENC_FC_xx.xml> [<bIENC_FC_xx.xml> ...]
//
// Uitvoer per code: acroniem, Engelse naam, primitieven (features), waardetype en enumeraties
// (attributen), en per feature de toegestane attributen met hun waardelijst.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOEL = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'ienc_catalogus.json');
const bestanden = process.argv.slice(2);
if (!bestanden.length) { console.error('Gebruik: node bouw_catalogus.mjs <IENC_FC.xml> [<bIENC_FC.xml>]'); process.exit(1); }

const ontsnap = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&').trim();
const attrs = tag => Object.fromEntries([...tag.matchAll(/(\w+)="([^"]*)"/g)].map(m => [m[1], ontsnap(m[2])]));
const naamVan = blok => { const m = /<Name>([\s\S]*?)<\/Name>/.exec(blok); return m ? ontsnap(m[1]) : ''; };

const uit = { bronnen: [], features: {}, attributen: {} };
for (const pad of bestanden) {
  const xml = readFileSync(pad, 'utf8');
  const kop = attrs(/<Header [^>]*>/.exec(xml)?.[0] || '');
  uit.bronnen.push({ bestand: basename(pad), product: kop.product, editie: kop.edition, datum: kop.date });
  for (const m of xml.matchAll(/<Attribute ([^>]*)>([\s\S]*?)<\/Attribute>/g)) {
    const a = attrs(m[1]);
    const enums = {};
    for (const e of m[2].matchAll(/<Enumeration value="([^"]*)">([\s\S]*?)<\/Enumeration>/g)) enums[e[1]] = naamVan(e[2]);
    uit.attributen[a.code] ??= { acr: a.acronym, naam: naamVan(m[2]), type: a.valueType, gebruik: a.useType, ...(Object.keys(enums).length ? { waarden: enums } : {}) };
  }
  for (const m of xml.matchAll(/<Feature ([^>]*)>([\s\S]*?)<\/Feature>/g)) {
    const f = attrs(m[1]);
    const bindingen = {};
    for (const b of m[2].matchAll(/<AttributeBinding ([^>]*?)\/?>/g)) {
      const x = attrs(b[1]);
      bindingen[x.acronym] = { gebruik: x.usage, ...(x.valueList ? { waarden: x.valueList.split(',').filter(Boolean).map(Number) } : {}) };
    }
    const sleutel = f.code;
    const bestaand = uit.features[sleutel];
    const primitieven = new Set([...(bestaand?.primitieven || []), ...(f.primitive || '').split(/[,; ]+/).filter(Boolean)]);
    uit.features[sleutel] = { acr: f.acronym, naam: naamVan(m[2]), type: f.type, primitieven: [...primitieven], attributen: { ...(bestaand?.attributen || {}), ...bindingen } };
  }
}
writeFileSync(DOEL, JSON.stringify(uit));
console.log(`${Object.keys(uit.features).length} features, ${Object.keys(uit.attributen).length} attributen -> ${DOEL}`);
