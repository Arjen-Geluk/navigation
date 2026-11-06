// Controleert de bronbestanden en dat index.html bij de bron past.   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
// de kern draait in een eigen vm-context; vergelijk daarom via JSON (andere prototypes)
const gelijk = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const MAP = new URL('..', import.meta.url);
const lees = p => readFileSync(new URL(p, MAP), 'utf8');
const kern = { module: { exports: {} } };
vm.runInNewContext(lees('bron/kern/10_editie.js'), kern);
const { controleerEditie, leesStap } = kern.module.exports;

test('leesStap', () => {
  gelijk(leesStap('KG-9 bb'), { punt: 'KG-9', zijde: 'bb' });
  gelijk(leesStap('De Ven'), { punt: 'De Ven', zijde: null });
  gelijk(leesStap('ST1 SB2 sb'), { punt: 'ST1 SB2', zijde: 'sb' });
});

for (const f of readdirSync(new URL('gegevens/wedstrijden/', MAP))) {
  test(`editie ${f} is in orde`, () => {
    const e = JSON.parse(lees('gegevens/wedstrijden/' + f));
    gelijk(controleerEditie(e), []);
    assert.equal(f, `${e.wedstrijd.id}_${e.jaar}.json`, 'bestandsnaam = <wedstrijd>_<jaar>.json');
    for (const b of Object.values(e.banen)) assert.equal(b.routes.length, 6, 'zes routes per baan');
  });
}

test('controleerEditie vindt fouten', () => {
  const e = JSON.parse(lees('gegevens/wedstrijden/3-steden_2026.json'));
  e.banen.K.routes[0].volgorde.push('Bestaat niet');
  e.datum = '2027-01-01';
  const f = controleerEditie(e);
  assert.ok(f.some(x => x.includes('Bestaat niet')));
  assert.ok(f.some(x => x.includes('hoort niet bij jaar')));
});

test('index.html past bij de bron (npm run bouw gedraaid)', () => {
  execFileSync(process.execPath, [new URL('beheer/bouw.mjs', MAP).pathname.replace(/^\/(\w:)/, '$1'), '--controle'], { stdio: 'pipe' });
});

test('bodemraster past bij de beschrijving in het vaargebied', async () => {
  const { existsSync } = await import('node:fs');
  const { gunzipSync } = await import('node:zlib');
  const { createHash } = await import('node:crypto');
  const vg = JSON.parse(lees('gegevens/vaargebied_ijsselmeergebied.json'));
  if (!vg.bodem) return;                                   // nog niet ververst
  const pad = new URL('gegevens/' + vg.bodem.bestand, MAP);
  assert.ok(existsSync(pad), 'bodembestand ontbreekt');
  const codes = gunzipSync(readFileSync(pad));
  assert.equal(codes.length, vg.bodem.nx * vg.bodem.ny);
  assert.equal(createHash('sha256').update(codes).digest('hex'), vg.bodem.sha256);
  assert.ok(codes.every(c => c <= 250 || c === 254 || c === 255), 'alleen codes 0..250, 254 (verboden) en 255');
});

// ---- polar (bron/kern/20_polar.js) met het verzonnen voorbeeldschip ----
const pk = { module: { exports: {} } };
vm.runInNewContext(lees('bron/kern/20_polar.js'), pk);
const PK = pk.module.exports;
const voorbeeld = JSON.parse(readFileSync(new URL('../polartool/voorbeeld/voorbeeldschip_polar_v1_2026-11-05.json', MAP), 'utf8'));

test('voorbeeldpolar wordt geaccepteerd, foute bestanden niet', () => {
  assert.equal(PK.controleerPolar(voorbeeld), null);
  assert.equal(PK.controleerPolar(PK.polarUittreksel(voorbeeld)), null, 'uittreksel blijft geldig');
  assert.match(PK.controleerPolar({ formaat: 'iets/1' }), /geen polarbestand/);
  assert.match(PK.controleerPolar({ ...voorbeeld, formaat: 'polartool/9' }), /onbekende formaatversie/);
  assert.match(PK.controleerPolar({ ...voorbeeld, schip: { ...voorbeeld.schip, id: '' } }), /scheeps-ID/);
  assert.match(PK.controleerPolar({ ...voorbeeld, polair: { ...voorbeeld.polair, snelheid_kn: [[1]] } }), /onvolledig/);
});

test('gebruiksregels polar (FORMAAT.md)', () => {
  const P = PK.polarUittreksel(voorbeeld), p = P.polair, r = 4, k = 3;
  const tws = p.tws_kn[r], twa = p.twa_graden[k];
  assert.equal(PK.polarSnelheid(P, tws, twa), p.snelheid_kn[r][k], 'op een roosterpunt de tabelwaarde');
  const midden = PK.polarSnelheid(P, (tws + p.tws_kn[r + 1]) / 2, twa);
  assert.ok(Math.abs(midden - (p.snelheid_kn[r][k] + p.snelheid_kn[r + 1][k]) / 2) < 1e-9, 'lineair tussen rijen');
  const tussen = PK.polarSnelheid(P, tws, (twa + p.twa_graden[k + 1]) / 2);
  assert.ok(Math.abs(tussen - (p.snelheid_kn[r][k] + p.snelheid_kn[r][k + 1]) / 2) < 1e-9, 'lineair tussen kolommen');
  assert.ok(Math.abs(PK.polarSnelheid(P, p.tws_kn[0] / 2, twa) - p.snelheid_kn[0][k] / 2) < 1e-9, 'onder de eerste rij lineair naar 0');
  assert.equal(PK.polarSnelheid(P, 99, twa), p.snelheid_kn.at(-1)[k], 'boven de laatste rij de laatste rij');
  assert.equal(PK.polarSnelheid(P, tws, p.twa_graden[0] - 1), null, 'onder de kruishoek geen vaart');
  assert.equal(PK.polarSnelheid(P, tws, -twa), PK.polarSnelheid(P, tws, twa), 'bakboord = stuurboord');
  const b = PK.besteKruishoek(P, 12);
  assert.ok(b.twa >= p.twa_graden[0] && b.twa <= 90 && b.vmg > 0);
  for (let a = p.twa_graden[0]; a <= 90; a++) assert.ok(PK.polarSnelheid(P, 12, a) * Math.cos(a * Math.PI / 180) <= b.vmg + 1e-9);
  assert.equal(PK.zwaardBij(P, p.twa_graden[0]), p.zwaardstand[0]);
  assert.equal(PK.diepgangBij({ schip: { diepgang_m: { op: 0.8, half: null, neer: 1.6 } } }, 'half'), 1.6, 'half op null = neer');
});
