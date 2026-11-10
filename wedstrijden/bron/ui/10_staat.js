// Gedeelde basis van de schermen: gegevens uit de pagina, opgeslagen invoer, tabbladen, gebeurtenissen en opmaak.
const $ = id => document.getElementById(id);
const G = JSON.parse($('gegevens').textContent);
const TZ = 'Europe/Amsterdam';

// ---- element maken: el('td', { class: 'x', onclick: f }, 'tekst', kind) ----
function el(tag, attr, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attr || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : String(k));
  return e;
}

// ---- opmaak ----
const getal = (x, d = 1) => x == null || !Number.isFinite(x) ? '–' : x.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
const kloktijd = ms => ms == null ? '–' : new Date(ms).toLocaleTimeString('nl-NL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const dagEnTijd = ms => new Date(ms).toLocaleString('nl-NL', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const duur = ms => { if (ms == null) return '–'; const m = Math.round(ms / 60000); return `${Math.floor(m / 60)} u ${String(m % 60).padStart(2, '0')}`; };
const afstand = m => S.eenheden === 'km' ? `${getal(m / 1000)} km` : `${getal(m / 1852)} NM`;
const koersTekst = k => k == null ? '–' : String(Math.round(k) % 360).padStart(3, '0') + '°';

// ---- edities ----
const EDITIES = Object.fromEntries(G.edities.map((e, i) => [G.bouw.edities[i].bestand.replace('.json', ''), e]));
const editieSleutels = Object.keys(EDITIES).sort((a, b) => EDITIES[b].jaar - EDITIES[a].jaar || a.localeCompare(b));

// ---- opgeslagen invoer (alleen in deze browser) ----
const OPSLAG = 'wedstrijden.invoer.v1';
function standaardStaat() {
  return { v: 1, editie: editieSleutels[0], per: {}, eenheden: 'nm',
    schip: { kielspeling: null, metOverstag: null, overstag_s: null, metGijp: null, gijp_s: null, factor: 100 },
    wind: { model: 'knmi_seamless', W: null, aanpassingen: {}, verschuiving_min: 0 },
    peilKeuze: 'auto', peilHand: null, peilActueel: null,
    kaart: { ondergrond: 'vast', lagen: { bodem: false, bevaarbaar: false, betonning: true, zones: true, route: true, andere: false, wind: false } },
    selectie: { baan: null, route: null } };
}
let S = standaardStaat();
try { const o = JSON.parse(localStorage.getItem(OPSLAG) || 'null'); if (o && o.v === 1) S = { ...S, ...o, kaart: { ...S.kaart, ...o.kaart, lagen: { ...S.kaart.lagen, ...(o.kaart || {}).lagen } } }; } catch (e) { /* geen opslag */ }
if (!EDITIES[S.editie]) S.editie = editieSleutels[0];
if (typeof S.peil === 'number') { S.peilKeuze = 'hand'; S.peilHand = S.peil; } delete S.peil;          // oud formaat (0.5)
if (!['vast', 'topo', 'foto'].includes(S.kaart.ondergrond)) S.kaart.ondergrond = 'vast';
if (S.wind.aanpassingen && Object.values(S.wind.aanpassingen).some(a => 'draai' in a)) S.wind.aanpassingen = {};   // oud formaat: per uur, nu per uur en plaats
function bewaar() { try { localStorage.setItem(OPSLAG, JSON.stringify(S)); } catch (e) { /* vol of geen opslag: werkt gewoon door */ } }

// invoer per editie (datum, tijden, baan van de wedstrijdleiding, afwijkingen van de schipper)
function invoer() {
  const e = EDITIES[S.editie];
  const inv = S.per[S.editie] ||= { datum: e.datum, start: e.start, limiet: e.finishlimiet, baanWL: '' };
  inv.afwijkingen = { punten: {}, zones: {}, routes: {}, tonnen: [], ...(inv.afwijkingen || {}) };
  return inv;
}
// RWS-betonning (ingebakken) om boeien op naam te vinden, bijvoorbeeld een andere boei als referentie in een route
const BETONNING = betonningIndex((G.betonning ? G.betonning.rijen : []).map(([naam, lat, lon]) => ({ naam, lat, lon })));
const routeSleutel = (baan, naam) => baan + '|' + naam;

// De editie zoals de schipper hem gebruikt: met aangepaste routes, wedstrijdtonnen, verlegde punten en aan/uit gezette zones.
// Boeien die alleen in een aangepaste route staan, komen uit de RWS-betonning. Onvindbare punten staan in .fouten.
function huidigeEditie() {
  const e = EDITIES[S.editie], a = invoer().afwijkingen, fouten = [];
  const punten = e.punten.map(p => a.punten[p.id] ? { ...p, ...a.punten[p.id], lijn: undefined, positie: 'verlegd' } : p);
  for (const t of a.tonnen) punten.push({ id: t.id, soort: 'wedstrijdton', lat: t.lat, lon: t.lon, positie: 'wedstrijdton', toelichting: 'wedstrijdton (eigen positie)' });
  const banen = {};
  for (const [b, baan] of Object.entries(e.banen)) banen[b] = { ...baan, routes: baan.routes.map(r => {
    const eigen = a.routes[routeSleutel(b, r.naam)];
    if (!eigen) return r;
    for (const s of eigen.map(leesStap)) if (!punten.some(p => p.id === s.punt)) {
      const z = zoekBoei(BETONNING, s.punt);
      if (z.fout) fouten.push(`${baan.naam}, ${r.naam}: ${z.fout}`);
      else punten.push({ id: s.punt, soort: 'merkteken', rws: z.boei.naam, lat: z.boei.lat, lon: z.boei.lon, positie: 'RWS', toelichting: 'andere RWS-boei (afwijking)' });
    }
    return { ...r, volgorde: eigen, aangepast: true };
  }) };
  return { ...e, datum: invoer().datum, start: invoer().start, finishlimiet: invoer().limiet, punten, banen, fouten,
    zones: e.zones.map(z => z.id in a.zones ? { ...z, actief: a.zones[z.id] } : z) };
}
const heeftAfwijkingen = () => { const a = invoer().afwijkingen; return Object.keys(a.punten).length + Object.keys(a.zones).length + Object.keys(a.routes).length + a.tonnen.length > 0; };
const startMs = () => lokaleTijdNaarMs(invoer().datum, invoer().start, EDITIES[S.editie].tijdzone);
const limietMs = () => { const s = startMs(), l = lokaleTijdNaarMs(invoer().datum, invoer().limiet, EDITIES[S.editie].tijdzone); return l > s ? l : l + 864e5; };
// Peil: streefpeil zomer of winter (standaard volgens de wedstrijddatum), het gemeten peil van RWS, of een eigen waarde.
// Gemeten peil zonder meting: terug naar het streefpeil van het seizoen.
const PEIL = G.vaargebied.peil;
const seizoenBij = datum => { const md = datum.slice(5); return md >= PEIL.zomer.van && md <= PEIL.zomer.tot ? 'zomer' : 'winter'; };
const peilKeuze = () => S.peilKeuze === 'auto' || !S.peilKeuze ? seizoenBij(invoer().datum) : S.peilKeuze;
const peil = () => {
  const k = peilKeuze();
  if (k === 'hand') return S.peilHand ?? PEIL.winter.waarde;
  if (k === 'actueel') return S.peilActueel ? S.peilActueel.waarde : PEIL[seizoenBij(invoer().datum)].waarde;
  return PEIL[k].waarde;
};
const peilBron = () => {
  const k = peilKeuze();
  if (k === 'hand') return 'eigen waarde';
  if (k === 'actueel') return S.peilActueel ? `gemeten door RWS, ${S.peilActueel.meer}, ${dagEnTijd(S.peilActueel.tijd)}` : `streefpeil ${seizoenBij(invoer().datum)} (geen meting)`;
  return 'streefpeil ' + k;
};

// ---- gebeurtenissen tussen de schermen ----
const luisteraars = {};
const op = (naam, f) => (luisteraars[naam] ||= []).push(f);
const meld = (naam, x) => (luisteraars[naam] || []).forEach(f => f(x));

// ---- bodem (uit de pagina, uitpakken met DecompressionStream) ----
let BODEM = null;
const bodemKlaar = (async () => {
  const b64 = $('bodem').textContent.trim();
  if (!b64 || !G.vaargebied.bodem) return null;
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const stroom = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  let uitsneden = [];
  const h64 = $('havens').textContent.trim();
  if (h64 && G.uitsneden.length) {
    const hb = Uint8Array.from(atob(h64), c => c.charCodeAt(0));
    const alles = new Uint8Array(await new Response(new Blob([hb]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    uitsneden = G.uitsneden.map(u => ({ ...u, water: alles.subarray(u.offset, u.offset + u.nx * u.ny) }));
  }
  BODEM = maakBodem(G.vaargebied.bodem, new Uint8Array(await new Response(stroom).arrayBuffer()), uitsneden);
  meld('bodem', BODEM);
  return BODEM;
})();

// ---- tabbladen ----
let huidigTab = null;
function toonTab(naam) {
  huidigTab = naam;
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === naam));
  document.querySelectorAll('section.tab').forEach(s => { s.hidden = s.id !== 'tab-' + naam; });
  try { sessionStorage.setItem('wedstrijden.tab', naam); } catch (e) { /* niets */ }
  meld('tab', naam);
}
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => toonTab(b.dataset.tab)));
// status per tabblad: 'klaar', 'let' of leeg
function tabStatus(naam, status, titel) {
  const b = document.querySelector(`#tabs button[data-tab="${naam}"] .bol`);
  if (b) { b.className = 'bol ' + (status || ''); b.title = titel || ''; }
}
function melding(id, soort, tekst) {
  const m = $(id); if (!m) return;
  m.className = 'melding ' + (soort || ''); m.textContent = tekst || ''; m.hidden = !tekst;
}

$('toolversie').textContent = `versie ${TOOL.versie} · ${TOOL.datum}`;
