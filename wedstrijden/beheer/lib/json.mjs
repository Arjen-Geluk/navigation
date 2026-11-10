// Gedeelde hulpjes voor de beheerscripts: JSON leesbaar wegschrijven en inlezen.
import { readFileSync, writeFileSync } from 'node:fs';

// Zoals JSON.stringify(o, null, 2), maar korte objecten en lijsten (bijv. een punt of een routestap)
// blijven op één regel. Zo blijven de bronbestanden goed te lezen en geven wijzigingen kleine diffs.
export function netjes(waarde, breedte = 150) {
  // één regel, met spaties na komma en dubbele punt (alleen buiten teksten)
  const regel = v => v === null || typeof v !== 'object' ? JSON.stringify(v)
    : Array.isArray(v) ? '[' + v.map(regel).join(', ') + ']'
    : '{ ' + Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => JSON.stringify(k) + ': ' + regel(x)).join(', ') + ' }';
  const schrijf = (v, insprong) => {
    const kort = regel(v);
    if (v === null || typeof v !== 'object' || kort.length + insprong.length <= breedte) return kort;
    const dieper = insprong + '  ';
    if (Array.isArray(v)) return '[\n' + v.map(x => dieper + schrijf(x, dieper)).join(',\n') + '\n' + insprong + ']';
    return '{\n' + Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => dieper + JSON.stringify(k) + ': ' + schrijf(x, dieper)).join(',\n') + '\n' + insprong + '}';
  };
  return schrijf(waarde, '') + '\n';
}

export const leesJson = pad => JSON.parse(readFileSync(pad, 'utf8'));
export const schrijfJson = (pad, waarde) => writeFileSync(pad, netjes(waarde));
