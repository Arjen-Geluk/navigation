// Polarbestand lezen en gebruiken, volgens polartool/FORMAAT.md (het contract).
// Pure functies: draaien in de browser en in de tests (Node).

const POLAR_FORMATEN = ['polartool/1'];
const MIN_VAART_KN = 0.3;                      // minimumsnelheid in de simulatie (gebruiksregel 5)

// Controles bij het inlezen. Geeft null als het bestand bruikbaar is, anders een korte uitleg voor de gebruiker.
function controleerPolar(o) {
  if (!o || typeof o !== 'object') return 'geen geldig polarbestand';
  if (typeof o.formaat !== 'string' || !o.formaat.startsWith('polartool/')) return 'dit is geen polarbestand van de polartool';
  if (!POLAR_FORMATEN.includes(o.formaat)) return `onbekende formaatversie ${o.formaat}; werk deze pagina bij of sla de polar op met een oudere polartool`;
  if (!o.schip || !o.schip.id) return 'scheeps-ID ontbreekt';
  const p = o.polair;
  if (!p || !Array.isArray(p.snelheid_kn)) return 'de polartabel (polair.snelheid_kn) ontbreekt';
  if (!Array.isArray(p.tws_kn) || !Array.isArray(p.twa_graden) || p.snelheid_kn.length !== p.tws_kn.length
    || p.snelheid_kn.some(r => !Array.isArray(r) || r.length !== p.twa_graden.length || r.some(v => !Number.isFinite(v))))
    return 'de polartabel is onvolledig (rijen en kolommen kloppen niet met tws_kn en twa_graden)';
  if (!Number.isFinite(o.schip.kruishoek)) return 'kruishoek ontbreekt';
  if (!o.schip.diepgang_m || !Number.isFinite(o.schip.diepgang_m.op) || !Number.isFinite(o.schip.diepgang_m.neer)) return 'diepgang (zwaard op en neer) ontbreekt';
  return null;
}

// Alleen wat de rekenpagina nodig heeft (FORMAAT: "leest alleen wat het nodig heeft"). Dit deel gaat ook mee
// in de browseropslag en later in het rekenbestand, zodat een berekening te herhalen is.
function polarUittreksel(o) {
  const s = o.schip, p = o.polair;
  return {
    formaat: o.formaat, versie: o.versie, gewijzigd: o.gewijzigd || null, gemaakt_met: o.gemaakt_met || null,
    schip: { id: s.id, naam: s.naam, tuigage: s.tuigage, kruishoek: s.kruishoek, diepgang_m: s.diepgang_m, kielspeling_m: s.kielspeling_m,
      overstagverlies_s: s.overstagverlies_s ?? null, gijpverlies_s: s.gijpverlies_s ?? null, windhoogtefactor: s.windhoogtefactor ?? null },
    polair: { tws_kn: p.tws_kn, twa_graden: p.twa_graden, snelheid_kn: p.snelheid_kn, zwaardstand: p.zwaardstand || null,
      herkomst: p.herkomst || null, zeilstanden: p.zeilstanden || null }
  };
}

// "Voorbeeldschip, versie 3 (ID 1a2b3c4d)"
const polarLabel = o => `${o.schip.naam || 'naamloos schip'}, versie ${o.versie} (ID ${String(o.schip.id).slice(0, 8)})`;

// index en fractie van x in een oplopende lijst (afgekapt op de randen)
function zoekInterval(lijst, x) {
  if (x <= lijst[0]) return [0, 0];
  const n = lijst.length - 1;
  if (x >= lijst[n]) return [n - 1 < 0 ? 0 : n - 1, n - 1 < 0 ? 0 : 1];
  let i = 0;
  while (lijst[i + 1] < x) i++;
  return [i, (x - lijst[i]) / (lijst[i + 1] - lijst[i])];
}

// Bootsnelheid (kn) bij ware windsnelheid tws (kn, 10 m) en ware windhoek twa (0–180°, t.o.v. de koers over de grond).
// Gebruiksregels 1–4: bilineair; onder de eerste rij lineair naar 0; boven de laatste rij de laatste rij;
// onder de kruishoek null (daar zeilt het schip niet: kruisen, zie besteKruishoek).
function polarSnelheid(P, tws, twa) {
  const p = P.polair, a = Math.abs(twa) > 180 ? 360 - Math.abs(twa) % 360 : Math.abs(twa);
  if (a < p.twa_graden[0] - 1e-9) return null;
  const [k, fk] = zoekInterval(p.twa_graden, a);
  const rij = r => p.snelheid_kn[r][k] * (1 - fk) + (fk ? p.snelheid_kn[r][k + 1] * fk : 0);
  if (tws <= 0) return 0;
  if (tws < p.tws_kn[0]) return rij(0) * tws / p.tws_kn[0];
  const [r, fr] = zoekInterval(p.tws_kn, tws);
  return rij(r) * (1 - fr) + (fr ? rij(r + 1) * fr : 0);
}

// Beste hoek om te kruisen (gebruiksregel 4): de windhoek met de hoogste VMG = snelheid × cos(twa),
// gezocht vanaf de kruishoek tot 90° in stappen van 1°. Geeft { twa, vaart, vmg }.
function besteKruishoek(P, tws) {
  let best = null;
  for (let a = Math.ceil(P.polair.twa_graden[0]); a <= 90; a++) {
    const v = polarSnelheid(P, tws, a), vmg = v * Math.cos(a * Math.PI / 180);
    if (!best || vmg > best.vmg + 1e-12) best = { twa: a, vaart: v, vmg };
  }
  return best;
}

// Beste hoek voor de wind (VMG van de wind af), van 90° tot 180°. Voor later: kruisen voor de wind (tweemaster).
function besteVoordewindhoek(P, tws) {
  let best = null;
  for (let a = 90; a <= 180; a++) {
    const v = polarSnelheid(P, tws, a), vmg = -v * Math.cos(a * Math.PI / 180);
    if (!best || vmg > best.vmg + 1e-12) best = { twa: a, vaart: v, vmg };
  }
  return best;
}

// index van de dichtstbijzijnde kolom
function naasteKolom(P, twa) {
  const t = P.polair.twa_graden;
  let k = 0;
  for (let i = 1; i < t.length; i++) if (Math.abs(t[i] - twa) < Math.abs(t[k] - twa)) k = i;
  return k;
}

// Zwaardstand bij twa (gebruiksregel 6): de waarde van de dichtstbijzijnde kolom; zonder lijst: neer.
const zwaardBij = (P, twa) => (P.polair.zwaardstand && P.polair.zwaardstand[naasteKolom(P, Math.max(twa, P.polair.twa_graden[0]))]) || 'neer';

// Diepgang bij een zwaardstand; half op null = neer.
function diepgangBij(P, stand) {
  const d = P.schip.diepgang_m;
  return stand === 'op' ? d.op : stand === 'half' && Number.isFinite(d.half) ? d.half : d.neer;
}

// Herkomst van het dichtstbijzijnde vakje; 'doorgetrokken' = schatting (zacht teken in de rakkentabel).
function herkomstBij(P, tws, twa) {
  const h = P.polair.herkomst; if (!h) return null;
  const t = P.polair.tws_kn;
  let r = 0;
  for (let i = 1; i < t.length; i++) if (Math.abs(t[i] - tws) < Math.abs(t[r] - tws)) r = i;
  return (h[r] || [])[naasteKolom(P, twa)] || null;
}
const isSchatting = herkomst => herkomst === 'doorgetrokken';

if (typeof module !== 'undefined') module.exports = { controleerPolar, polarUittreksel, polarLabel, polarSnelheid, besteKruishoek,
  besteVoordewindhoek, zwaardBij, diepgangBij, herkomstBij, isSchatting, MIN_VAART_KN };
