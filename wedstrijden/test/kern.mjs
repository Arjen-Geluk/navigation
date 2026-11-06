// Testhulp: laadt alle bron/kern/*.js samen in één context, net als in de pagina, plus vaargebied, bodem en edities.
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import vm from 'node:vm';

const MAP = new URL('..', import.meta.url);
export const lees = p => readFileSync(new URL(p, MAP), 'utf8');

export function laadKern() {
  const code = readdirSync(new URL('bron/kern/', MAP)).filter(f => f.endsWith('.js')).sort().map(f => lees('bron/kern/' + f)).join('\n;\n');
  const namen = [...code.matchAll(/^(?:function|const|let)\s+([A-Za-z_]\w*)/gm)].map(m => m[1]);
  const ctx = { Intl, console };
  vm.createContext(ctx);
  vm.runInContext(code + `\n;globalThis.__kern = { ${[...new Set(namen)].join(', ')} };`, ctx);
  return ctx.__kern;
}

export function laadGegevens(K = laadKern()) {
  const vaargebied = JSON.parse(lees('gegevens/vaargebied_ijsselmeergebied.json'));
  const codes = new Uint8Array(gunzipSync(readFileSync(new URL('gegevens/' + vaargebied.bodem.bestand, MAP))));
  // edities met de posities van de boeien uit de RWS-betonning, net als in het bouwscript
  const index = K.betonningIndex(JSON.parse(lees('gegevens/' + vaargebied.betonning.bestand)).markeringen);
  const edities = Object.fromEntries(readdirSync(new URL('gegevens/wedstrijden/', MAP)).map(f => [f.replace('.json', ''), K.metPosities(JSON.parse(lees('gegevens/wedstrijden/' + f)), index).editie]));
  // fijne uitsneden van 10 m rond havens en sluizen (TOP10NL)
  let uitsneden = [];
  try {
    const m = JSON.parse(lees('gegevens/water_top10nl.json')).havens;
    if (m) { const alles = new Uint8Array(gunzipSync(readFileSync(new URL('gegevens/' + m.bestand, MAP))));
      uitsneden = m.uitsneden.filter(u => (m.actief || []).includes(u.id)).map(u => ({ ...u, water: alles.subarray(u.offset, u.offset + u.nx * u.ny) })); }
  } catch (e) { /* geen uitsneden */ }
  return { vaargebied, codes, edities, uitsneden };
}

// constante wind (richting, kn) over het hele raster, van t0 tot t0 + uren
export function vasteWind(K, dir, kn, t0, uren = 30) {
  const punten = K.windPunten(), tijden = Array.from({ length: uren + 1 }, (_, i) => t0 + i * 3600e3);
  return { bron: 'test', model: 'vast', raster: K.WINDRASTER, punten, tijden, data: punten.map(() => tijden.map(() => ({ dir, kn, vlaag: null }))) };
}
