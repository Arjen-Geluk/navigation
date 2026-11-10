// Havens, sluizen en lijnen van het vaargebied (uit de reglementen van beurtveer, strontrace en 3-stedenrace).
// Eenmalig ingevuld en daarna met de hand bijgehouden; dit script schrijft ze in het vaargebiedbestand.
//   node beheer/havens.mjs
// Lichten: RWS-betonning (naam) of OpenStreetMap-zeekaartgegevens (positie). Status per lijn:
//   bevestigd = staat zo in een reglement en het licht is gevonden; kandidaat = waarschijnlijk, graag nakijken; open = nog niet gevonden.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesJson, schrijfJson } from './lib/json.mjs';

const MAP = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = (naam, lat, lon, bron) => ({ naam, lat, lon, bron });
const HAVENS = [
  { id: 'buiten-ij', naam: 'Buiten-IJ (Amsterdam, Durgerdam)', soort: 'lijn', kader: [52.362, 4.960, 52.400, 5.030], reglement: 'beurtveer 2.2.7, 2.9.7-8; strontrace 2.8.1',
    lijnen: [{ id: 'buiten-ij', rol: 'finish heenreis / start terugreis / havengebied Amsterdam', status: 'kandidaat',
      punten: [P('vuurtoren Buiten-IJ (toren met wit-rood sectorlicht)', 52.371814, 5.014017, 'IENC'), P('rood licht Iso 6s op de dam', 52.369694, 5.015644, 'IENC')], toelichting: 'uit de IENC: toren met lichtfunctie en het rode licht ten zuiden ervan; graag nakijken' }] },
  { id: 'workum', naam: 'Workum', soort: 'haven', kader: [52.950, 5.385, 52.985, 5.450], reglement: 'beurtveer 2.2.5, 2.2.11, 2.9.16-17; strontrace 2.2, 2.3',
    lijnen: [
      { id: 'workum-start', rol: 'startlijn heenreis beurtveer', status: 'bevestigd', punten: [P('H 4', 52.955383, 5.394367, 'RWS'), P('H 2-W 1', 52.958383, 5.391217, 'RWS')] },
      { id: 'workum-haven', rol: 'havengebied (sluis tot deze lijn)', status: 'bevestigd', punten: [P('Groene HL Workum', 52.959617, 5.403013, 'RWS'), P('W 2', 52.960575, 5.39944, 'RWS')] },
      { id: 'workum-finish', rol: 'finish terugreis beurtveer (groene lichtopstand It Soal – dijk)', status: 'open', punten: [], toelichting: 'groene lichtopstand van de jachthaven It Soal niet gevonden' }] },
  { id: 'enkhuizen', naam: 'Enkhuizen, Krabbersgat en Naviduct', soort: 'sluis', kader: [52.678, 5.265, 52.712, 5.320], reglement: 'beurtveer 2.9.9; strontrace 2.8; 3-stedenrace art. 13.1',
    lijnen: [
      { id: 'enkhuizen-noord', rol: 'havengebied noord / finish 3-stedenrace', status: 'bevestigd',
        punten: [P('groen havenlicht Compagniehaven', 52.69961, 5.29376, 'OpenStreetMap'), P('HL N EINDE E LEIDAM PAAL 46', 52.704015, 5.3077, 'RWS')] },
      { id: 'enkhuizen-zuid', rol: 'havengebied zuid (groen licht quick op de punt van de dam – hoek van de dam)', status: 'kandidaat',
        punten: [P('SCHEIDINGSLICHT ZZ (groen Q)', 52.684212, 5.275907, 'RWS')], toelichting: 'tweede punt (hoek van de dam) nog vast te stellen' },
      { id: 'naviduct-motor', rol: 'verplicht motorgebied (remmingwerk noord – ND_5 en 3e rode staak zuid)', status: 'open', punten: [] }] },
  { id: 'lelystad', naam: 'Lelystad, Houtribsluizen', soort: 'sluis', kader: [52.510, 5.405, 52.550, 5.455], reglement: 'beurtveer 2.9.12; strontrace 2.8',
    lijnen: [
      { id: 'lelystad-noord', rol: 'havengebied / motorgebied noord', status: 'kandidaat', punten: [P('HOUTRIBSLUIZEN KOP N DAM (groen ISO 4)', 52.53768, 5.436747, 'RWS'), P('rood havenlicht Houtribhaven', 52.533886, 5.440894, 'IENC')],
        toelichting: 'rode licht uit de IENC, tegenover de groene ISO 4; graag nakijken' },
      { id: 'lelystad-zuid', rol: 'havengebied zuid (groene en rode vaste havenlichten)', status: 'kandidaat',
        punten: [P('Bataviahaven gn', 52.51579, 5.43866, 'OpenStreetMap'), P('Bataviahaven rd', 52.51608, 5.43793, 'OpenStreetMap')], toelichting: 'zijn dit de bedoelde lichten?' }] },
  { id: 'medemblik', naam: 'Medemblik', soort: 'haven', kader: [52.762, 5.098, 52.782, 5.128], reglement: 'beurtveer 2.9.13',
    lijnen: [{ id: 'medemblik', rol: 'havengebied', status: 'bevestigd', punten: [P('Medemblik rd', 52.77436, 5.11376, 'OpenStreetMap'), P('Medemblik gn', 52.77462, 5.11319, 'OpenStreetMap')],
      toelichting: 'er is ook een lichtenpaar bij het Regatta Center (52,7714 N, 5,1185 O)' }] },
  { id: 'lemmer', naam: 'Lemmer', soort: 'haven', kader: [52.828, 5.685, 52.852, 5.730], reglement: 'beurtveer 2.9.11',
    lijnen: [{ id: 'lemmer', rol: 'havengebied (groen havenlicht – eerste hoek jachthaven De Friese Hoek)', status: 'kandidaat',
      punten: [P('groen havenlicht', 52.838591, 5.708971, 'IENC')], toelichting: 'groen licht van de haveningang uit de IENC (rood ertegenover op 52,8366 N, 5,7086 O); hoek van De Friese Hoek nog vast te stellen' }] },
  { id: 'stavoren', naam: 'Stavoren', soort: 'haven', kader: [52.878, 5.340, 52.898, 5.372], reglement: 'niet in de reglementen als haven; wel 3-stedenrace (boeien)',
    lijnen: [{ id: 'stavoren', rol: 'haveningang', status: 'kandidaat', punten: [P('Stavoren rd', 52.88638, 5.35247, 'OpenStreetMap'), P('Stavoren gn', 52.88598, 5.35383, 'OpenStreetMap')] }] },
  { id: 'urk', naam: 'Urk', soort: 'haven', kader: [52.650, 5.580, 52.670, 5.615], reglement: 'beurtveer 2.9.14',
    lijnen: [{ id: 'urk', rol: 'havengebied (rood havenlicht – tank op de Zuidermeerdijk)', status: 'kandidaat', punten: [P('rood havenlicht', 52.65651, 5.59786, 'OpenStreetMap')],
      toelichting: 'positie van de tank nog vast te stellen' }] },
  { id: 'hoorn', naam: 'Hoorn', soort: 'haven', kader: [52.625, 5.045, 52.648, 5.085], reglement: 'beurtveer 2.9.10',
    lijnen: [{ id: 'hoorn', rol: 'havengebied (havenlichten van de Buitenhaven)', status: 'kandidaat', punten: [P('Hoorn red', 52.63275, 5.06406, 'OpenStreetMap'), P('Hoorn green', 52.63319, 5.065, 'OpenStreetMap')],
      toelichting: 'reglement spreekt van de havenlichten van de beide haveningangen' }] },
  { id: 'volendam', naam: 'Volendam', soort: 'haven', kader: [52.485, 5.055, 52.505, 5.085], reglement: 'beurtveer 2.9.15',
    lijnen: [{ id: 'volendam', rol: 'havengebied', status: 'bevestigd', punten: [P('rood havenlicht', 52.49261, 5.07637, 'OpenStreetMap'), P('groen havenlicht', 52.49262, 5.0769, 'OpenStreetMap')] }] },
  { id: 'blocq', naam: 'Blocq van Kuffeler', soort: 'haven', kader: [52.412, 5.210, 52.432, 5.245], reglement: 'beurtveer 2.9.6',
    lijnen: [{ id: 'blocq', rol: 'havengebied', status: 'bevestigd', punten: [P('RODE HL BLOCQ VAN KUFFELER', 52.424592, 5.229993, 'RWS'), P('GROENE HL BLOCQ VAN KUFFELER', 52.4235, 5.22698, 'RWS')] }] }
];

const pad = join(MAP, 'gegevens', 'vaargebied_ijsselmeergebied.json');
const vg = leesJson(pad);
vg.havens = HAVENS.map(h => ({ ...h, kader: { zuid: h.kader[0], west: h.kader[1], noord: h.kader[2], oost: h.kader[3] } }));
schrijfJson(pad, vg);
const tel = s => HAVENS.flatMap(h => h.lijnen).filter(l => l.status === s).length;
console.log(`✓ ${HAVENS.length} havens/sluizen, lijnen: ${tel('bevestigd')} bevestigd, ${tel('kandidaat')} kandidaat, ${tel('open')} open`);
