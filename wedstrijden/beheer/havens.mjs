// Havens, sluizen en lijnen van het vaargebied (uit de reglementen van beurtveer, strontrace en 3-stedenrace).
// Eenmalig ingevuld en daarna met de hand bijgehouden; dit script schrijft ze in het vaargebiedbestand.
//   node beheer/havens.mjs
// Lichten: RWS-betonning of IENC (naam), OpenStreetMap (positie), of "gebruiker (kaart)": door de gebruiker op een IENC-kaartje gekozen. Status per lijn:
//   bevestigd = staat zo in een reglement en het licht is gevonden; kandidaat = waarschijnlijk, graag nakijken; open = nog niet gevonden.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesJson, schrijfJson } from './lib/json.mjs';

const MAP = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = (naam, lat, lon, bron) => ({ naam, lat, lon, bron });
const HAVENS = [
  { id: 'buiten-ij', naam: 'Buiten-IJ (Amsterdam, Durgerdam)', soort: 'lijn', kader: [52.355, 4.960, 52.400, 5.045], reglement: 'beurtveer 2.2.7, 2.9.7-8; strontrace 2.8.1',
    lijnen: [{ id: 'buiten-ij', rol: 'finish heenreis / start terugreis / havengebied Amsterdam', status: 'bevestigd',
      punten: [P('vuurtoren Buiten-IJ (toren met wit-rood sectorlicht)', 52.371811, 5.01402, 'IENC'), P('dam tegenover de vuurtoren', 52.367966, 5.014437, 'gebruiker (kaart)')],
      toelichting: 'reglement: "de vuurtoren van het buiten-IJ en het rode havenlicht op de dam daar tegenover"; dat licht staat niet in de IENC, punt op de dam gekozen door de gebruiker (2026-11-12)' }] },
  { id: 'workum', naam: 'Workum', soort: 'haven', kader: [52.950, 5.385, 52.985, 5.450], reglement: 'beurtveer 2.2.5, 2.2.11, 2.9.16-17; strontrace 2.2, 2.3',
    lijnen: [
      { id: 'workum-start', rol: 'startlijn heenreis beurtveer', status: 'bevestigd', punten: [P('H 4', 52.955383, 5.394367, 'RWS'), P('H 2-W 1', 52.958383, 5.391217, 'RWS')] },
      { id: 'workum-haven', rol: 'havengebied (sluis tot deze lijn)', status: 'bevestigd', punten: [P('Groene HL Workum', 52.959617, 5.403013, 'RWS'), P('W 2', 52.960575, 5.39944, 'RWS')] },
      { id: 'workum-finish', rol: 'finish terugreis beurtveer (groene lichtopstand It Soal – dijk)', status: 'bevestigd',
        punten: [P('groene lichtopstand haveningang It Soal', 52.962678, 5.414196, 'gebruiker (kaart)'), P('dijk', 52.962318, 5.414712, 'gebruiker (kaart)')],
        toelichting: 'reglement 2.2.12; punten gekozen door de gebruiker op de IENC-kaart (2026-11-12)' }] },
  { id: 'enkhuizen', naam: 'Enkhuizen, Krabbersgat en Naviduct', soort: 'sluis', kader: [52.678, 5.265, 52.712, 5.320], reglement: 'beurtveer 2.9.9; strontrace 2.8; 3-stedenrace art. 13.1',
    lijnen: [
      { id: 'enkhuizen-noord', rol: 'havengebied noord / finish 3-stedenrace', status: 'bevestigd',
        punten: [P('groen havenlicht Compagniehaven', 52.69961, 5.29376, 'OpenStreetMap'), P('HL N EINDE E LEIDAM PAAL 46', 52.704015, 5.3077, 'RWS')] },
      { id: 'enkhuizen-zuid', rol: 'havengebied zuid (groen licht quick op de punt van de dam – hoek van de dam)', status: 'bevestigd',
        punten: [P('SCHEIDINGSLICHT ZZ', 52.684211, 5.275908, 'RWS'), P('hoek van de dam', 52.684418, 5.281635, 'gebruiker (kaart)')] },
      { id: 'naviduct-noord', rol: 'verplicht motorgebied noord (dwars van de eerste losse palen van het remmingswerk)', status: 'bevestigd',
        punten: [P('remmingwerk noord, west', 52.693144, 5.295144, 'gebruiker (kaart)'), P('remmingwerk noord, oost', 52.693202, 5.296899, 'gebruiker (kaart)')] },
      { id: 'naviduct-zuid', rol: 'verplicht motorgebied zuid (ND_5 – 3e rode staak op de dam)', status: 'bevestigd',
        punten: [P('KG 21', 52.686616, 5.287843, 'RWS'), P('3e rode staak op de dam', 52.684669, 5.290457, 'gebruiker (kaart)')],
        toelichting: 'ND 5 staat niet in de RWS-betonning of de IENC; de gebruiker koos KG 21 (2026-11-12)' }] },
  { id: 'lelystad', naam: 'Lelystad, Houtribsluizen', soort: 'sluis', kader: [52.495, 5.400, 52.550, 5.455], reglement: 'beurtveer 2.9.12; strontrace 2.8',
    lijnen: [
      { id: 'lelystad-noord', rol: 'havengebied / motorgebied noord', status: 'bevestigd',
        punten: [P('HOUTRIBSLUIZEN KOP N DAM', 52.537685, 5.43674, 'RWS'), P('FR Deko Marine', 52.533886, 5.440895, 'IENC')] },
      { id: 'lelystad-zuid', rol: 'havengebied / motorgebied zuid (groene en rode vaste havenlichten)', status: 'bevestigd',
        punten: [P('RODE HL GELEIDEDAM', 52.511712, 5.41715, 'RWS'), P('GROENE HL GELEIDEDAM', 52.509676, 5.418215, 'RWS')],
        toelichting: 'keuze van de gebruiker (2026-11-12): de havenlichten van de geleidedam, niet die van de Bataviahaven' }] },
  { id: 'medemblik', naam: 'Medemblik', soort: 'haven', kader: [52.762, 5.098, 52.782, 5.128], reglement: 'beurtveer 2.9.13',
    lijnen: [{ id: 'medemblik', rol: 'havengebied', status: 'bevestigd', punten: [P('Medemblik rd', 52.77436, 5.11376, 'OpenStreetMap'), P('Medemblik gn', 52.77462, 5.11319, 'OpenStreetMap')],
      toelichting: 'er is ook een lichtenpaar bij het Regatta Center (52,7714 N, 5,1185 O)' }] },
  { id: 'lemmer', naam: 'Lemmer', soort: 'haven', kader: [52.828, 5.685, 52.852, 5.730], reglement: 'beurtveer 2.9.11',
    lijnen: [{ id: 'lemmer', rol: 'havengebied (groen havenlicht – eerste hoek jachthaven De Friese Hoek)', status: 'bevestigd',
      punten: [P('hoek jachthaven De Friese Hoek', 52.837808, 5.703362, 'gebruiker (kaart)'), P('OL KOPDWARSDAM NOORDERMEERDIJK', 52.835975, 5.703392, 'RWS')],
      toelichting: 'keuze van de gebruiker (2026-11-12): het groene licht op de kopdwarsdam, westelijker dan de buitenhaven' }] },
  { id: 'stavoren', naam: 'Stavoren', soort: 'haven', kader: [52.878, 5.340, 52.898, 5.372], reglement: 'niet in de reglementen als haven; wel 3-stedenrace (boeien)',
    lijnen: [{ id: 'stavoren', rol: 'haveningang', status: 'bevestigd', punten: [P('FR Buitenhaven kop W', 52.886397, 5.352469, 'IENC'), P('FG Buitenhaven kop E', 52.885993, 5.353846, 'IENC')] }] },
  { id: 'urk', naam: 'Urk', soort: 'haven', kader: [52.650, 5.580, 52.670, 5.615], reglement: 'beurtveer 2.9.14',
    lijnen: [{ id: 'urk', rol: 'havengebied (rood havenlicht – tank op de Zuidermeerdijk)', status: 'bevestigd',
      punten: [P('FR Urk kop W havenhoofd', 52.6565, 5.597858, 'IENC'), P('tank op de Zuidermeerdijk', 52.657021, 5.601484, 'gebruiker (kaart)')] }] },
  { id: 'hoorn', naam: 'Hoorn', soort: 'haven', kader: [52.625, 5.045, 52.648, 5.085], reglement: 'beurtveer 2.9.10',
    lijnen: [{ id: 'hoorn', rol: 'havengebied (havenlichten van de Buitenhaven)', status: 'bevestigd', punten: [P('FR havenhoofd Hoorn', 52.632745, 5.06416, 'IENC'), P('FG havendam Hoorn', 52.63319, 5.064993, 'IENC')],
      toelichting: 'reglement spreekt van de havenlichten van de beide haveningangen; de IENC heeft één paar' }] },
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
