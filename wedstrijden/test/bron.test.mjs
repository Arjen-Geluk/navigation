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
  assert.ok(codes.every(c => c <= 250 || c === 255), 'alleen codes 0..250 en 255');
});
