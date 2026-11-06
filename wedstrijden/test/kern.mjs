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

export function laadGegevens() {
  const vaargebied = JSON.parse(lees('gegevens/vaargebied_ijsselmeergebied.json'));
  const codes = new Uint8Array(gunzipSync(readFileSync(new URL('gegevens/' + vaargebied.bodem.bestand, MAP))));
  const edities = Object.fromEntries(readdirSync(new URL('gegevens/wedstrijden/', MAP)).map(f => [f.replace('.json', ''), JSON.parse(lees('gegevens/wedstrijden/' + f))]));
  return { vaargebied, codes, edities };
}

// constante wind (richting, kn) over het hele raster, van t0 tot t0 + uren
export function vasteWind(K, dir, kn, t0, uren = 30) {
  const punten = K.windPunten(), tijden = Array.from({ length: uren + 1 }, (_, i) => t0 + i * 3600e3);
  return { bron: 'test', model: 'vast', raster: K.WINDRASTER, punten, tijden, data: punten.map(() => tijden.map(() => ({ dir, kn, vlaag: null }))) };
}
