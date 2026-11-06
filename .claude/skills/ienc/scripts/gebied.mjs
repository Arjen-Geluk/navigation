// Haalt voor een gebied de relevante IENC-objecten op als GeoJSON, per thema.
//
//   node gebied.mjs --enc <ENC_ROOT> --bbox 4.9,52.25,5.95,53.1 [--thema land,beperking] [--uit map/] [--klassen DEPARE,resare]
//
//   --enc      map met CATALOG.031 (uitgepakte RWS-zip), bijv. lokaal/ienc/nederland/ENC_ROOT
//   --bbox     west,zuid,oost,noord in graden WGS84
//   --thema    komma-lijst uit THEMA's hieronder (standaard: alle)
//   --klassen  in plaats van thema's: precies deze acroniemen (hoofdlettergevoelig)
//   --uit      map voor <thema>.geojson (standaard: alleen een samenvatting op het scherm)
//
// Als module: import { gebied, THEMA } from './gebied.mjs';
//   const { thema's, cellen } = gebied(encRoot, bbox, { thema: ['land'] });
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { leesCel, naarGeoJSON, cellenVoorGebied } from './s57.mjs';

// Acroniemen zijn hoofdlettergevoelig: HOOFDLETTERS = S-57 (maritiem), kleine letters = Inland ENC.
export const THEMA = {
  // land en alles wat je niet kunt bevaren
  land: ['LNDARE', 'COALNE', 'canbnk', 'rivbnk', 'DAMCON', 'SLCONS', 'slcons', 'ponton', 'PONTON', 'HULKES', 'BUAARE', 'DYKCON', 'FLODOC', 'DRYDOC'],
  // diepte: dieptegebieden en -lijnen, gebaggerde gebieden, losse dieptes, obstakels
  diepte: ['DEPARE', 'depare', 'DEPCNT', 'DRGARE', 'SOUNDG', 'UNSARE', 'OBSTRN', 'WRECKS', 'UWTROC', 'SBDARE'],
  // verboden en waarschuwingsgebieden, vaarwegen, maximale afmetingen
  beperking: ['RESARE', 'resare', 'CTNARE', 'MIPARE', 'ACHARE', 'achare', 'achbrt', 'ACHBRT', 'lg_sdm', 'FAIRWY', 'NAVLNE', 'RECTRC', 'wtwaxs', 'comare', 'TSSLPT', 'feryrt', 'FERYRT', 'MARCUL', 'OSPARE', 'PRCARE'],
  // havens, ligplaatsen, aanlegvoorzieningen
  haven: ['HRBARE', 'hrbare', 'hrbbsn', 'prtare', 'HRBFAC', 'hrbfac', 'BERTHS', 'berths', 'MORFAC', 'termnl', 'bunsta', 'SMCFAC', 'refdmp', 'trnbsn', 'vehtrf'],
  // sluizen, bruggen, kabels en leidingen boven het water
  kunstwerk: ['lokbsn', 'lokare', 'lkbspt', 'GATCON', 'gatcon', 'BRIDGE', 'bridge', 'brgare', 'excnst', 'CBLOHD', 'cblohd', 'PIPOHD', 'pipohd', 'CONVYR'],
  // betonning, lichten, borden, peilschalen
  markering: ['BOYLAT', 'boylat', 'BOYCAR', 'BOYSPP', 'BOYISD', 'BOYSAW', 'boywtw', 'BCNLAT', 'bcnlat', 'BCNCAR', 'BCNSPP', 'BCNISD', 'bcnwtw', 'LIGHTS', 'TOPMAR', 'topmar', 'DAYMAR', 'notmrk', 'dismar', 'wtwgag', 'sistat', 'sistaw', 'rdocal', 'LNDMRK', 'PILPNT']
};

/**
 * @param {string} encRoot
 * @param {number[]} bbox  [w, z, o, n]
 * @param {{thema?: string[], klassen?: string[], beschrijf?: boolean}} opties
 * @returns {{cellen: Array<{naam, editie, uitgifte}>, themas: Record<string, FeatureCollection>}}
 */
export function gebied(encRoot, bbox, opties = {}) {
  const groepen = opties.klassen ? { selectie: opties.klassen } : Object.fromEntries((opties.thema || Object.keys(THEMA)).map(t => {
    if (!THEMA[t]) throw new Error(`Onbekend thema "${t}"; kies uit ${Object.keys(THEMA).join(', ')}`);
    return [t, THEMA[t]];
  }));
  const themas = Object.fromEntries(Object.keys(groepen).map(t => [t, { type: 'FeatureCollection', features: [] }]));
  const cellen = [];
  for (const c of cellenVoorGebied(encRoot, bbox)) {
    const cel = leesCel(c.pad);
    cellen.push({ naam: cel.naam, editie: cel.dsid.EDTN, update: cel.dsid.UPDN, uitgifte: cel.dsid.ISDT, schaal: cel.dspm?.CSCL });
    for (const [t, klassen] of Object.entries(groepen)) {
      themas[t].features.push(...naarGeoJSON(cel, { klassen, bbox, beschrijf: opties.beschrijf !== false }).features);
    }
  }
  return { cellen, themas };
}

const isHoofd = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isHoofd) {
  const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : undefined; };
  const enc = arg('enc'), bboxTekst = arg('bbox');
  if (!enc || !bboxTekst) { console.error('Gebruik: node gebied.mjs --enc <ENC_ROOT> --bbox w,z,o,n [--thema a,b] [--klassen X,y] [--uit map]'); process.exit(1); }
  const bbox = bboxTekst.split(',').map(Number);
  const { cellen, themas } = gebied(enc, bbox, { thema: arg('thema')?.split(','), klassen: arg('klassen')?.split(',') });
  console.log(`${cellen.length} cellen: ${cellen.map(c => `${c.naam} (ed. ${c.editie}, ${c.uitgifte})`).join(', ')}`);
  const uit = arg('uit');
  if (uit) mkdirSync(uit, { recursive: true });
  for (const [t, fc] of Object.entries(themas)) {
    const telling = {};
    for (const f of fc.features) telling[f.properties.klasse] = (telling[f.properties.klasse] || 0) + 1;
    console.log(`${t}: ${fc.features.length} objecten  ${Object.entries(telling).map(([k, n]) => `${k} ${n}`).join(', ')}`);
    if (uit) writeFileSync(join(uit, `${t}.geojson`), JSON.stringify(fc));
  }
}
