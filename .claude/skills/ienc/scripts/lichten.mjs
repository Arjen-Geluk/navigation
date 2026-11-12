// Lichten in een gebied, met de naam van het baken, de paal of de ton waar ze op staan.
//
//   node lichten.mjs --enc <ENC_ROOT> --bbox 5.405,52.51,5.455,52.55 [--kleur groen|rood|wit|geel] [--json]
//
// In de IENC heeft een LIGHTS-object vrijwel nooit een OBJNAM. De naam staat op de drager op dezelfde plek
// (bcnlat/BCNLAT, boylat, PILPNT, LNDMRK, …), en die naam is gelijk aan de naam in de RWS-betonning
// ("HOUTRIBSLUIZEN KOP N DAM", "FG Houtribhaven"). Zo vind je havenlichten en lichtopstanden voor havenlijnen
// en finishlijnen, en kun je ze in een editie met hun RWS-naam opnemen.
//
// Als module: import { lichten } from './lichten.mjs';
//   const rijen = lichten(encRoot, [w, z, o, n]);   // [{lat, lon, kleur, karakter, periode, groep, drager, drager_klasse, afstand_m, cel}]
import { pathToFileURL } from 'node:url';
import { gebied, THEMA } from './gebied.mjs';

const KLEUR = { 1: 'wit', 3: 'rood', 4: 'groen', 6: 'geel' };
const STRAAL_M = 5;   // drager en licht liggen in de RWS-cellen binnen enkele centimeters van elkaar

export function lichten(encRoot, bbox) {
  const { themas } = gebied(encRoot, bbox, { klassen: THEMA.markering });
  const alles = Object.values(themas).flatMap(fc => fc.features).filter(f => f.geometry?.type === 'Point');
  const dragers = alles.filter(f => f.properties.klasse !== 'LIGHTS' && (f.properties.OBJNAM || f.properties.NOBJNM));
  return alles.filter(f => f.properties.klasse === 'LIGHTS').map(l => {
    const [lon, lat] = l.geometry.coordinates, p = l.properties;
    const m = (a, b) => Math.hypot((a[0] - lon) * 111320 * Math.cos(lat * Math.PI / 180), (a[1] - lat) * 111320);
    let drager = null, d = Infinity;
    for (const k of dragers) { const x = m(k.geometry.coordinates); if (x < d) { d = x; drager = k; } }
    if (d > STRAAL_M) drager = null;
    const kleuren = [].concat(p.COLOUR ?? []).map(c => KLEUR[c] || String(c));
    return {
      lat: +lat.toFixed(6), lon: +lon.toFixed(6),
      kleur: kleuren.join('/') || null,
      karakter: p.LITCHR_tekst ?? p.LITCHR ?? null,   // ontbreekt vaak bij vaste havenlichten (FR/FG in de naam)
      periode: p.SIGPER ?? null, groep: p.SIGGRP ?? null,
      drager: drager ? (drager.properties.OBJNAM || drager.properties.NOBJNM) : null,
      drager_klasse: drager ? drager.properties.klasse : null,
      afstand_m: drager ? Math.round(d * 10) / 10 : null,
      cel: p.cel
    };
  });
}

const isHoofd = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isHoofd) {
  const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : undefined; };
  const enc = arg('enc'), bboxTekst = arg('bbox');
  if (!enc || !bboxTekst) { console.error('Gebruik: node lichten.mjs --enc <ENC_ROOT> --bbox w,z,o,n [--kleur groen] [--json]'); process.exit(1); }
  let rijen = lichten(enc, bboxTekst.split(',').map(Number));
  const kleur = arg('kleur');
  if (kleur) rijen = rijen.filter(r => (r.kleur || '').split('/').includes(kleur));
  rijen.sort((a, b) => b.lat - a.lat);
  if (process.argv.includes('--json')) console.log(JSON.stringify(rijen, null, 1));
  else for (const r of rijen) console.log(`${r.lat.toFixed(6)} N  ${r.lon.toFixed(6)} O  ${(r.kleur || '?').padEnd(6)} ${String(r.karakter ?? '').padEnd(14)} ${r.periode ?? ''}  ${r.drager ? `${r.drager} (${r.drager_klasse})` : '— geen benoemde drager —'}`);
}
