// Rekenkern: wind, vaarwater, padzoeken en navaren met het verzonnen voorbeeldschip.   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { laadKern, laadGegevens, vasteWind } from './kern.mjs';

const K = laadKern();
const G = laadGegevens(K);
const P = K.polarUittreksel(JSON.parse(readFileSync(new URL('../../polartool/voorbeeld/voorbeeldschip_polar_v1_2026-11-05.json', import.meta.url), 'utf8')));
const B = K.maakBodem(G.vaargebied.bodem, G.codes, G.uitsneden);
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
    // 1,5 %: bij kruisen langs de rand van een ondiepte kan de boot een paar stappen net te ondiep zitten (diepgang plus kielspeling)
    assert.ok(fout.length <= r.res.track.length * 0.015, `${r.naam}: ${fout.length} trackpunten in ondiep/verboden water`);
  }
  const terug = uit.routes.find(r => r.naam === 'Urk – Stavoren');
  assert.ok(terug.res.overstag > 0, 'aan de wind wordt er gekruist');
});

test('merktekens: ronden op 30 m aan de goede kant, passeren zonder lus', () => {
  const W = vasteWind(K, 240, 12, t0);
  const r = K.rekenBaan(V, W, P, E, 'M', { robuustheid: false }).routes.find(x => x.naam === 'Medemblik – Stavoren');
  const per = Object.fromEntries(r.res.rondingen.map(x => [x.id, x]));
  assert.equal(per['De Kreupel'].wijze, 'om de zone', 'De Kreupel: de kortste weg om de zone heen');
  assert.equal(per['LC 11'].wijze, 'ronden');
  // de zone (De Kreupel) ligt aan stuurboord van de boot die het dichtst langs de zone vaart
  const zP = E.zones.find(z => z.id === 'kreupel').punten, cLat = zP.reduce((q, p) => q + p.lat, 0) / zP.length, cLon = zP.reduce((q, p) => q + p.lon, 0) / zP.length;
  const c = { lat: cLat, lon: cLon }, pc = r.res.track.reduce((q, p) => K.afstandM(p, c) < K.afstandM(q, c) ? p : q);
  const kz = ((K.koersNaar(pc, c) - pc.koers) % 360 + 540) % 360 - 180;
  assert.ok(kz > 0, `zone op ${kz.toFixed(0)}° van de koers: stuurboord verwacht`);
  for (const x of r.res.rondingen.filter(x => x.wijze !== 'om de zone')) {
    const dichtst = Math.min(...r.res.track.map(p => K.afstandM(p, x)));
    assert.ok(dichtst > 10 && dichtst < 80, `${x.id}: dichtstbij ${dichtst.toFixed(0)} m`);
    // de boot ligt aan de voorgeschreven kant: het merkteken aan bb = links van de koers van de boot
    const p = r.res.track.reduce((a, q) => K.afstandM(q, x) < K.afstandM(a, x) ? q : a);
    const kant = ((K.koersNaar(p, x) - p.koers) % 360 + 540) % 360 - 180;
    assert.ok(x.zijde === 'bb' ? kant < 0 : kant > 0, `${x.id} ${x.zijde}: merkteken op ${kant.toFixed(0)}° van de koers`);
  }
});

test('finish als lijn: de boot eindigt op de lijn, niet in het midden', () => {
  const f = E.punten.find(p => p.id === 'Finish');
  assert.equal(f.lijn.length, 2);
  assert.ok(f.lijn.every(q => q.lat > 52.70 && q.lat < 52.71), "beide uiteinden ingevuld");
  const W = vasteWind(K, 240, 12, t0);
  for (const r of K.rekenBaan(V, W, P, E, 'K', { robuustheid: false }).routes) {
    const eind = r.res.track[r.res.track.length - 1];
    // afstand van het eindpunt tot de lijn (in m, vlak benaderd)
    const [a, b] = f.lijn, A = { x: a.lon * 67450, y: a.lat * 111200 }, B = { x: b.lon * 67450, y: b.lat * 111200 }, Q = { x: eind.lon * 67450, y: eind.lat * 111200 };
    const d = Math.abs((B.x - A.x) * (A.y - Q.y) - (A.x - Q.x) * (B.y - A.y)) / Math.hypot(B.x - A.x, B.y - A.y);
    assert.ok(d < 25, `${r.naam}: eindpunt ${d.toFixed(0)} m van de finishlijn`);
  }
});

test('maximale slaglengte: automatisch is nooit trager dan een vaste keuze', () => {
  const W = vasteWind(K, 30, 8, t0);
  const auto = K.rekenBaan(V, W, P, E, 'K', { robuustheid: false, max_slag_nm: 'auto' }).routes;
  for (const nm of [1, 3, Infinity]) {
    const vast = K.rekenBaan(V, W, P, E, 'K', { robuustheid: false, max_slag_nm: nm }).routes;
    for (const r of vast) {
      const a = auto.find(x => x.naam === r.naam);
      assert.ok(a.res.zeiltijd_ms <= r.res.zeiltijd_ms + 1000, `${r.naam}: auto ${a.res.zeiltijd_ms} > ${nm} NM ${r.res.zeiltijd_ms}`);
    }
  }
  assert.ok(auto.every(a => a.res.slag_auto));
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

test('rekenbestand: heen en terug geeft dezelfde uitkomst', () => {
  const W = vasteWind(K, 240, 12, t0);
  const uit = { banen: { K: K.rekenBaan(V, W, P, E, 'K', { robuustheid: true }) }, limiet: t0 + 9 * 3600e3, gemaakt: t0 - 3600e3, rekentijd_ms: 123, afwijkend: false };
  const b = K.maakRekenbestand({ tool: { naam: 'test', versie: '0' }, vaargebied: G.vaargebied, editieSleutel: '3-steden_2026', editie: G.edities['3-steden_2026'], editieGebruikt: E,
    afwijkingen: {}, invoer: { datum: E.datum, start: E.start, limiet: E.finishlimiet, baan_wl: '', eenheden: 'nm', peil: { keuze: 'auto', waarde_m: -0.4 }, schip: { kielspeling_m: 0.3, overstag_s: null, gijp_s: null, snelheidsfactor: 1 } },
    wind: { ...W, verschuiving_min: 0, aanpassingen: {} }, polar: P, uitkomst: uit, nu: t0 });
  const r = K.leesRekenbestand(JSON.parse(JSON.stringify(b)));
  assert.equal(r.fout, undefined);
  const a = uit.banen.K.routes, c = r.uitkomst.banen.K.routes;
  assert.equal(c.length, a.length);
  a.forEach((x, i) => { assert.equal(c[i].res.zeiltijd_ms, x.res.zeiltijd_ms); assert.equal(c[i].res.track.length, x.res.track.length); assert.deepEqual(JSON.parse(JSON.stringify(c[i].res.track[5])), JSON.parse(JSON.stringify(x.res.track[5]))); assert.equal(c[i].snelst_in, x.snelst_in); });
  assert.equal(r.uitkomst.polarId, P.schip.id);
  assert.ok(JSON.stringify(b).length < 2e6, 'bestand blijft onder 2 MB voor één baan');
});

test('rekenbestand: controles en bestandsnaam', () => {
  assert.match(K.leesRekenbestand({ formaat: 'polartool/1' }).fout, /geen rekenbestand/);
  assert.match(K.leesRekenbestand({ formaat: 'wedstrijdberekening/9' }).fout, /onbekende formaatversie/);
  assert.match(K.leesRekenbestand({ formaat: 'wedstrijdberekening/1' }).fout, /onvolledig/);
  assert.equal(K.rekenbestandNaam('3-steden', '2026-10-10', 'Zeeën & Co', Date.parse('2026-10-10T06:15:00Z')), '3-steden_2026-10-10_Zeeen_Co_0815.json');
});

test('uitsneden: haven Enkhuizen op 5 m', () => {
  const u = G.uitsneden.find(x => x.id === 'enkhuizen');
  assert.ok(u, 'uitsnede Enkhuizen aanwezig');
  // ergens in de uitsnede ligt water dat in het grove raster land is (havens, smalle geulen)
  let fijnWater = 0;
  for (let j = 0; j < u.ny; j += 3) for (let i = 0; i < u.nx; i += 3) {
    const lat = u.noord - (j + 0.5) * u.dlat, lon = u.west + (i + 0.5) * u.dlon, k = K.celVan(B, lat, lon);
    if (u.water[j * u.nx + i] && B.codes[k] === 255 && K.bodemOp(B, lat, lon) != null) fijnWater++;
  }
  assert.ok(fijnWater > 10, `${fijnWater} fijne watercellen waar het grove raster land is`);
  assert.equal(K.bodemOp(B, 52.705, 5.25), null, 'Enkhuizen (land) blijft land');
});

test('reis met sluis, haven en rust (beurtveer): sluistijd en rust tellen niet, haventijd wel', () => {
  const lijn = id => G.vaargebied.havens.flatMap(h => h.lijnen).find(l => l.id === id).punten.map(q => ({ lat: q.lat, lon: q.lon }));
  const sluis = { id: 'Naviduct', soort: 'sluis', lijnen: [lijn('naviduct-noord'), lijn('naviduct-zuid')], schuttijd_min: 45 };
  const noord = { id: 'IJsselmeer', lat: 52.74, lon: 5.27 };
  const punten = [noord, sluis, { id: 'Hoorn', soort: 'haven', lijn: lijn('hoorn'), verblijf_min: 20 }, { id: 'Rust', soort: 'rust', rust_min_uur: 2 }, sluis, { ...noord, id: 'Finish' }];
  const W = vasteWind(K, 240, 12, t0, 48);
  const r = K.vaarReis(V, W, P, punten, t0, { max_slag_nm: Infinity, robuustheid: false });
  assert.ok(r.klaar, r.waarschuwingen.join('; '));
  assert.deepEqual(Array.from(r.onderdelen, o => o.soort), ['zeilen', 'sluis', 'zeilen', 'haven', 'rust', 'zeilen', 'sluis', 'zeilen']);
  const rust = r.onderdelen.find(o => o.soort === 'rust');
  assert.equal(rust.tot - rust.van, 2 * 3600e3, 'rust precies 2 uur');
  assert.equal(r.aftrek_ms, 2 * 45 * 60e3 + 2 * 3600e3, 'twee keer schutten en de rust tellen niet');
  assert.equal(r.zeiltijd_ms, r.klok_ms - r.aftrek_ms);
  // heen naar binnen bij de noordlijn, terug bij de zuidlijn
  const m = l => ({ lat: (l[0].lat + l[1].lat) / 2, lon: (l[0].lon + l[1].lon) / 2 });
  const naSluis = r.track.filter(p => p.vaart === 0 && p.koers === null).slice(1);
  assert.ok(K.afstandM(naSluis[0], m(sluis.lijnen[1])) < 1 && K.afstandM(naSluis[1], m(sluis.lijnen[0])) < 1, 'uit aan de andere kant van de sluis');
  // een latere terugstart schuift de rust op, niet de zeiltijd
  const r2 = K.vaarReis(V, W, P, punten, t0, { max_slag_nm: Infinity, robuustheid: false, terug_start_ms: rust.tot + 3600e3 });
  assert.equal(r2.onderdelen.find(o => o.soort === 'rust').tot, rust.tot + 3600e3);
  assert.ok(Math.abs(r2.zeiltijd_ms - r.zeiltijd_ms) < 15 * 60e3, 'zeiltijd bijna gelijk (alleen de wind op een ander uur)');
  // controle van de editie: sluis zonder tweede lijn, rust zonder rust_min_uur
  const e = { ...JSON.parse(JSON.stringify(G.edities['3-steden_2026'])) };
  e.punten.push({ id: 'S', soort: 'sluis', lijnen: [lijn('naviduct-noord')] });
  e.banen.K.routes[0].volgorde.splice(1, 0, 'Rust');
  const f = K.controleerEditie(e).join(' | ');
  assert.match(f, /sluis S: twee lijnen/); assert.match(f, /rust_min_uur/);
});
