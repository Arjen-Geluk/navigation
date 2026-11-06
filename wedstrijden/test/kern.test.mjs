// Rekenkern: wind, vaarwater, padzoeken en navaren met het verzonnen voorbeeldschip.   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { laadKern, laadGegevens, vasteWind } from './kern.mjs';

const K = laadKern();
const G = laadGegevens();
const P = K.polarUittreksel(JSON.parse(readFileSync(new URL('../../polartool/voorbeeld/voorbeeldschip_polar_v1_2026-11-05.json', import.meta.url), 'utf8')));
const B = K.maakBodem(G.vaargebied.bodem, G.codes);
const E = G.edities['3-steden_2026'];
const V = K.maakVaarwater(B, P, { peil: -0.25, kielspeling: P.schip.kielspeling_m, marge_verboden_m: 50, zones: E.zones });
const t0 = K.lokaleTijdNaarMs(E.datum, E.start, E.tijdzone);

test('lokale tijd → UTC (zomer- en wintertijd)', () => {
  assert.equal(new Date(K.lokaleTijdNaarMs('2026-10-10', '09:00')).toISOString(), '2026-10-10T07:00:00.000Z');
  assert.equal(new Date(K.lokaleTijdNaarMs('2026-11-10', '09:00')).toISOString(), '2026-11-10T08:00:00.000Z');
});

test('wind: bilineair in ruimte, lineair in tijd, varianten', () => {
  const W = vasteWind(K, 350, 10, t0);
  W.data.forEach(p => { p[1] = { dir: 10, kn: 20 }; });
  const w = K.windOp(W, 52.7, 5.3, t0 + 1800e3);
  assert.ok(Math.abs(w.kn - 15) < 1e-9 && Math.abs(w.dir) < 1e-6 || Math.abs(w.dir - 360) < 1e-6, 'halverwege: 15 kn uit het noorden');
  assert.ok(Math.abs(K.windOp(W, 52.7, 5.3, t0, { draai: 15 }).dir - 5) < 1e-6);
  assert.ok(Math.abs(K.windOp(W, 52.7, 5.3, t0, { factor: 1.2 }).kn - 12) < 1e-9);
  assert.ok(Math.abs(K.windOp(W, 52.7, 5.3, t0, { verschuiving_min: 60 }).kn - 20) < 1e-9, '1 uur eerder');
});

test('bodem en bevaarbaarheid', () => {
  assert.equal(K.bodemOp(B, 52.70, 4.0), null, 'buiten het raster');
  assert.equal(K.bodemOp(B, 52.85, 5.80), null, 'land (Noordoostpolder)');
  const d = K.diepteOp(V, 52.80, 5.35);
  assert.ok(d > 3 && d < 8, `midden IJsselmeer ${d} m diep`);
  assert.ok(K.inVerbodenZone(V, 52.797, 5.228), 'De Kreupel is verboden gebied');
  assert.ok(!K.bevaarbaar(V, 52.797, 5.228, P.schip.diepgang_m.op));
});

test('padzoeken gaat om De Kreupel heen', () => {
  const a = { lat: 52.81, lon: 5.20 }, b = { lat: 52.78, lon: 5.26 };
  const pad = K.zoekPad(V, a, b);
  assert.ok(pad && pad.length > 2, 'omweg nodig');
  for (let i = 1; i < pad.length; i++) assert.ok(K.vrijZicht(V, pad[i - 1], pad[i]) || i === 1 || i === pad.length - 1);
});

test('alle routes van de korte baan worden gevaren, buiten land en verboden gebied', () => {
  const W = vasteWind(K, 240, 12, t0);
  const uit = K.rekenBaan(V, W, P, E, 'K', { robuustheid: false });
  for (const r of uit.routes) {
    assert.ok(r.res.klaar, `${r.naam}: ${r.res.waarschuwingen.join('; ')}`);
    const uren = r.res.zeiltijd_ms / 3600e3;
    assert.ok(uren > 2 && uren < 14, `${r.naam}: ${uren.toFixed(2)} u`);
    assert.ok(r.res.zeilweg_m >= r.res.afstand_m * 0.99);
    const fout = r.res.track.filter((p, i) => i > 3 && i < r.res.track.length - 3 && !K.bevaarbaar(V, p.lat, p.lon, P.schip.diepgang_m.op));
    assert.ok(fout.length <= r.res.track.length * 0.01, `${r.naam}: ${fout.length} trackpunten in ondiep/verboden water`);
  }
  const terug = uit.routes.find(r => r.naam === 'Urk – Stavoren');
  assert.ok(terug.res.overstag > 0, 'aan de wind wordt er gekruist');
});

// Regressie: dezelfde invoer moet dezelfde uitkomst geven. Verandert de rekenwijze bewust, maak het bestand dan
// opnieuw met:  node test/kern.test.mjs --vastleggen   (en leg in de commit uit waarom de tijden veranderen)
test('regressie: voorbeeldschip, vaste wind, alle banen 2026', async () => {
  const { existsSync, writeFileSync } = await import('node:fs');
  const pad = new URL('./regressie_kern.json', import.meta.url);
  const uit = {};
  for (const [dir, kn] of [[240, 12], [30, 8]]) for (const b of ['K', 'M', 'L']) {
    const W = vasteWind(K, dir, kn, t0);
    for (const r of K.rekenBaan(V, W, P, E, b, { robuustheid: false }).routes)
      uit[`${dir}/${kn} ${b} ${r.naam}`] = { s: Math.round(r.res.zeiltijd_ms / 1000), overstag: r.res.overstag, gijp: r.res.gijp };
  }
  if (process.argv.includes('--vastleggen') || !existsSync(pad)) { writeFileSync(pad, JSON.stringify(uit, null, 1) + '\n'); return; }
  assert.deepEqual(uit, JSON.parse(readFileSync(pad, 'utf8')));
});
