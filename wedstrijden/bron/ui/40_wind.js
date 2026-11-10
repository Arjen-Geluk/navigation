// Tabblad 3 Wind & peil: windverwachting ophalen, windtabel per plaats aanpassen, windverandering verschuiven, peil.
const isoDatum = ms => new Date(ms).toLocaleDateString('sv-SE', { timeZone: TZ });   // 'YYYY-MM-DD' in lokale tijd

// Plaatsen in de windtabel (van noord naar zuid), met de havens van de beurtveerrace.
// Aanpassingen op een plaats werken door in de omgeving (afstandsgewogen).
const WINDPLAATSEN = [
  { id: 'workum', naam: 'Workum', lat: 52.96, lon: 5.39 },
  { id: 'stavoren', naam: 'Stavoren', lat: 52.87, lon: 5.34 },
  { id: 'lemmer', naam: 'Lemmer', lat: 52.835, lon: 5.68 },
  { id: 'medemblik', naam: 'Medemblik', lat: 52.80, lon: 5.15 },
  { id: 'midden', naam: 'Midden', lat: 52.80, lon: 5.42 },
  { id: 'enkhuizen', naam: 'Enkhuizen', lat: 52.705, lon: 5.30 },
  { id: 'urk', naam: 'Urk', lat: 52.68, lon: 5.52 },
  { id: 'hoorn', naam: 'Hoorn', lat: 52.63, lon: 5.075 },
  { id: 'lelystad', naam: 'Lelystad', lat: 52.53, lon: 5.42 },
  { id: 'markermeer', naam: 'Markermeer', lat: 52.52, lon: 5.20 },
  { id: 'volendam', naam: 'Volendam', lat: 52.49, lon: 5.08 },
  { id: 'blocq', naam: 'Blocq van Kuffeler', lat: 52.42, lon: 5.23 },
  { id: 'durgerdam', naam: 'Durgerdam (Buiten-IJ)', lat: 52.38, lon: 5.01 }
];
// De plaatsen bij de gekozen wedstrijd: binnen 12 km van een punt van de editie, en altijd minstens de drie dichtstbijzijnde.
// Alleen deze plaatsen staan in de tabel en het draaiboek en tellen mee bij het aanpassen van de wind.
function windPlaatsen() {
  const pnt = huidigeEditie().punten.filter(p => p.lat != null);
  if (!pnt.length) return WINDPLAATSEN;
  const d = WINDPLAATSEN.map(q => Math.min(...pnt.map(p => afstandM(p, q))));
  const drie = [...d].sort((a, b) => a - b)[Math.min(2, d.length - 1)];
  return WINDPLAATSEN.filter((q, i) => d[i] <= Math.max(12000, drie));
}

// De wind waarmee gerekend wordt: de verwachting met de aanpassingen uit de windtabel en de verschuiving van de windverandering.
// Aanpassing per uur en plaats { draai (°), factor }; op een windpunt telt elke plaats mee met gewicht 1/d² (d in km, min. 3 km).
function windEffectief() {
  const w = S.wind.W; if (!w) return null;
  const a = S.wind.aanpassingen, sh = (S.wind.verschuiving_min || 0) * 60000;
  const plaatsen = windPlaatsen();
  const gewicht = w.punten.map(p => plaatsen.map(q => 1 / Math.max(3, afstandM(p, q) / 1000) ** 2));
  return { ...w, tijden: w.tijden.map(t => t - sh),
    data: w.data.map((reeks, i) => reeks.map((c, k) => {
      const x = a[w.tijden[k]]; if (!x) return c;
      let sg = 0, sd = 0, sf = 0;
      plaatsen.forEach((q, j) => { const g = gewicht[i][j], v = x[q.id] || { draai: 0, factor: 1 }; sg += g; sd += g * v.draai; sf += g * v.factor; });
      return { ...c, dir: (c.dir + sd / sg + 360) % 360, kn: c.kn * sf / sg };
    })) };
}
// dekt de wind de wedstrijd (start tot finishlimiet)?
function windDekt() {
  const w = S.wind.W; if (!w) return false;
  const sh = (S.wind.verschuiving_min || 0) * 60000;
  return w.tijden[0] - sh <= startMs() && w.tijden[w.tijden.length - 1] - sh >= limietMs() - 3600e3;
}

(function () {
  $('windmodel').replaceChildren(...WINDMODELLEN.map(m => el('option', { value: m.id }, m.naam)));
  $('windmodel').value = S.wind.model;
  $('windmodel').onchange = () => { S.wind.model = $('windmodel').value; bewaar(); };

  async function haal() {
    const van = isoDatum(startMs()), tot = isoDatum(limietMs());
    const vandaag = isoDatum(Date.now()), historisch = (Date.parse(vandaag) - Date.parse(van)) / 864e5 > 2;
    const modellen = [S.wind.model, ...(S.wind.model !== 'best_match' ? ['best_match'] : [])];
    const punten = windPunten();
    $('windOphalen').disabled = true;
    melding('windmelding', '', 'Wind ophalen…');
    let laatsteFout = '';
    for (const m of modellen) {
      try {
        const r = await fetch(windUrl(punten, van, tot, m, historisch));
        const W = leesOpenMeteo(await r.json(), punten, m);
        W.opgehaald = Date.now(); W.historisch = historisch;
        S.wind.W = W; S.wind.aanpassingen = {}; bewaar();
        const naam = (WINDMODELLEN.find(x => x.id === m) || { naam: m }).naam;
        melding('windmelding', m === S.wind.model ? 'ok' : 'let', m === S.wind.model ? `Wind opgehaald: ${naam}.` : `${laatsteFout} Teruggevallen op ${naam}.`);
        $('windOphalen').disabled = false;
        meld('wind');
        return;
      } catch (e) { laatsteFout = `Wind ophalen mislukt (model ${m}): ${e.message}.`; }
    }
    $('windOphalen').disabled = false;
    melding('windmelding', 'fout', `${laatsteFout} Probeer een ander model of vul de windtabel in.`);
  }
  $('windOphalen').onclick = haal;

  const schuif = verschuifWind;
  $('windEerder').onclick = () => schuif(30);
  $('windLater').onclick = () => schuif(-30);
  $('windHerstel').onclick = () => { S.wind.aanpassingen = {}; S.wind.verschuiving_min = 0; bewaar(); meld('wind'); };

  function vul() {
    $('windVerschuiving').textContent = verschuivingTekst();
    const W = S.wind.W, tab = $('windtabel');
    if (!W) {
      $('windbron').textContent = 'Nog geen wind. Kies een model en klik op Wind ophalen.';
      tab.replaceChildren(); tabStatus('wind', 'let', 'nog geen wind'); return;
    }
    const naam = (WINDMODELLEN.find(x => x.id === W.model) || { naam: W.model }).naam;
    $('windbron').textContent = `${W.bron}, ${naam}${W.historisch ? ' (historische verwachting)' : ''}, opgehaald ${dagEnTijd(W.opgehaald)}. `
      + `Uren ${dagEnTijd(W.tijden[0])} tot ${dagEnTijd(W.tijden[W.tijden.length - 1])}.`;
    const E = windEffectief(), basis = { ...W, tijden: E.tijden }, sh = (S.wind.verschuiving_min || 0) * 60000;
    const s = startMs() - 3600e3, l = limietMs() + 3600e3, a = S.wind.aanpassingen, plaatsen = windPlaatsen();
    const rijen = [];
    W.tijden.forEach(t => {
      const tv = t - sh;                                   // het moment waarop deze verwachting nu geldt
      if (tv < s || tv > l) return;
      const cellen = plaatsen.map(q => {
        const g = windOp(basis, q.lat, q.lon, tv), e = windOp(E, q.lat, q.lon, tv);
        const ri = el('input', { type: 'number', min: 0, max: 360, step: 5, value: Math.round(e.dir), class: 'mini', title: `${q.naam}: richting (°)` });
        const kr = el('input', { type: 'number', min: 0, max: 60, step: 1, value: Math.round(e.kn), class: 'mini', title: `${q.naam}: kracht (kn)` });
        const zet = () => {
          const x = a[t] ||= {};
          const draai = ((+ri.value - g.dir) % 360 + 540) % 360 - 180, factor = g.kn > 0.1 ? +kr.value / g.kn : 1;
          if (Math.abs(draai) < 1 && Math.abs(factor - 1) < 0.03) delete x[q.id]; else x[q.id] = { draai, factor };
          if (!Object.keys(x).length) delete a[t];
          bewaar(); meld('wind');
        };
        ri.onchange = zet; kr.onchange = zet;
        return el('td', { class: a[t] && a[t][q.id] ? 'afwijkend' : null }, ri, kr, el('span', { class: 'sub' }, ` ${knNaarBft(e.kn)}`));
      });
      rijen.push(el('tr', {}, el('td', {}, kloktijd(tv)), ...cellen));
    });
    tab.replaceChildren(el('thead', {}, el('tr', {}, el('th', {}, 'Tijd'), ...plaatsen.map(q => el('th', {}, q.naam, el('br'), el('span', { class: 'sub' }, '° · kn · Bft'))))), el('tbody', {}, rijen));
    tabStatus('wind', windDekt() ? 'klaar' : 'let', windDekt() ? '' : 'de wind dekt de wedstrijd niet');
    if (!windDekt()) melding('windmelding', 'let', 'De opgehaalde wind dekt niet de hele wedstrijd (start tot finishlimiet). Haal de wind opnieuw op.');
  }

  // ---- peil ----
  async function haalPeil() {
    $('peilOphalen').disabled = true;
    melding('peilmelding', '', 'Peil ophalen bij Rijkswaterstaat…');
    try {
      const r = await haalRwsPeil(huidigeEditie(), startMs());
      S.peilActueel = r; S.peilKeuze = 'actueel'; bewaar();
      const ontbreekt = r.ontbreekt.length ? ` Geen meting van ${r.ontbreekt.join(', ')}.` : '';
      melding('peilmelding', ontbreekt ? 'let' : 'ok', `Peil ${r.meer}: ${getal(r.waarde, 2)} m NAP, gemeten ${dagEnTijd(r.tijd)}.${ontbreekt}`);
    } catch (e) {
      S.peilActueel = null; bewaar();
      const sz = seizoenBij(invoer().datum);
      melding('peilmelding', 'fout', `Gemeten peil niet beschikbaar (${e.message}); gerekend met streefpeil ${sz} (${getal(PEIL[sz].waarde, 2)} m NAP).`);
    }
    $('peilOphalen').disabled = false;
    vulPeil(); meld('invoer');
  }
  $('peilOphalen').onclick = haalPeil;

  function vulPeil() {
    const sz = seizoenBij(invoer().datum);
    $('peilkeuze').replaceChildren(
      el('option', { value: 'auto' }, `Streefpeil volgens de datum (${sz}, ${getal(PEIL[sz].waarde, 2)} m NAP)`),
      el('option', { value: 'zomer' }, `Streefpeil zomer (${getal(PEIL.zomer.waarde, 2)} m NAP)`),
      el('option', { value: 'winter' }, `Streefpeil winter (${getal(PEIL.winter.waarde, 2)} m NAP)`),
      el('option', { value: 'actueel' }, S.peilActueel ? `Gemeten door RWS (${getal(S.peilActueel.waarde, 2)} m NAP)` : 'Gemeten door RWS (nog niet opgehaald)'),
      el('option', { value: 'hand' }, 'Eigen waarde'));
    $('peilkeuze').value = S.peilKeuze || 'auto';
    $('peilHandVak').hidden = S.peilKeuze !== 'hand';
    $('peil').value = peil();
    $('peiluitleg').innerHTML = `Waterdiepte = peil − bodemhoogte. Zomer (1 april – 30 september): de band NAP −0,10 tot −0,30 m, gerekend met het midden;
      winter: NAP −0,40 m (<a href="${PEIL.bron}">Rijkswaterstaat</a>). Het werkelijke peil kan afwijken, bijvoorbeeld door wind of afvoer.
      Gemeten peil: de meting van Rijkswaterstaat op de starttijd, of de laatste meting als de start nog moet komen. IJsselmeer: het gemiddelde van
      Kornwerderzand binnen, Lemmer, Krabbersgat Noord en Houtrib Noord; Markermeer: Markermeer Midden. Een opwaaiing aan één kant van het meer middelt zo uit.
      RWS bewaart de metingen ongeveer een jaar.`;
    $('peilOphalen').textContent = S.peilActueel ? 'Opnieuw ophalen' : 'Peil ophalen bij RWS';
  }
  $('peilkeuze').onchange = () => {
    S.peilKeuze = $('peilkeuze').value; if (S.peilKeuze === 'hand' && S.peilHand == null) S.peilHand = peil();
    bewaar(); if (S.peilKeuze === 'actueel' && !S.peilActueel) { haalPeil(); return; } vulPeil(); meld('invoer');
  };
  $('peil').onchange = () => { S.peilHand = Math.max(-1.5, Math.min(1, +$('peil').value)); bewaar(); vulPeil(); meld('invoer'); };

  op('invoer', () => { vul(); vulPeil(); });
  op('wind', vul);
  vul(); vulPeil();
})();

// ---- gemeten peil van Rijkswaterstaat (waterstand in cm NAP, meting elke 10 minuten) ----
const PEIL_MEETPUNTEN = {
  ijsselmeer: { naam: 'IJsselmeer', codes: { KOBI: 'Kornwerderzand binnen', LEMM: 'Lemmer', KRAN: 'Krabbersgat Noord', HOUN: 'Houtrib Noord' } },
  markermeer: { naam: 'Markermeer', codes: { FL42: 'Markermeer Midden' } }
};
const rwsTijd = ms => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const rwsPeilUrl = (code, van, tot) => `https://rwsos.rws.nl/wb-api/dd/2.0/timeseries?locationCode=${code}&sourceName=S_1&observationTypeId=WT&startTime=${rwsTijd(van)}&endTime=${rwsTijd(tot)}`;
// Markermeer of IJsselmeer: ten zuiden van Enkhuizen en aan de zuidwestkant van de Houtribdijk (Enkhuizen – Lelystad)?
const inMarkermeer = p => p.lat < 52.70 && (5.425 - 5.285) * (p.lat - 52.695) - (52.535 - 52.695) * (p.lon - 5.285) < 0;
// Het peil op tijdstip t (of nu, als t nog moet komen). Ligt de baan in beide meren, dan het gemiddelde naar het aantal punten.
async function haalRwsPeil(E, t) {
  const op = Math.min(t, Date.now()), van = op - 3 * 3600e3;
  const pnt = E.punten.filter(p => p.lat != null);
  const nMm = pnt.filter(inMarkermeer).length, aandeel = { ijsselmeer: 1 - nMm / pnt.length, markermeer: nMm / pnt.length };
  const meren = Object.keys(aandeel).filter(m => aandeel[m] > 0), ontbreekt = [], meetpunten = [];
  let som = 0, gewicht = 0, tijd = 0;
  for (const m of meren) {
    const waarden = [];
    for (const [code, naam] of Object.entries(PEIL_MEETPUNTEN[m].codes)) {
      try {
        const r = await fetch(rwsPeilUrl(code, van, op + 600e3));
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const ev = (((await r.json()).results || [])[0] || {}).events || [];
        const geldig = ev.filter(e => e.value != null && Date.parse(e.timeStamp) <= op + 600e3);
        if (!geldig.length) { ontbreekt.push(naam); continue; }
        const e = geldig[geldig.length - 1];
        waarden.push(e.value / 100); tijd = Math.max(tijd, Date.parse(e.timeStamp));
        meetpunten.push({ code, naam, waarde_m: e.value / 100, tijd: e.timeStamp });
      } catch (e) { ontbreekt.push(naam); }
    }
    if (!waarden.length) throw new Error(`geen meting voor het ${PEIL_MEETPUNTEN[m].naam} rond ${dagEnTijd(op)}`);
    som += aandeel[m] * waarden.reduce((a, b) => a + b, 0) / waarden.length; gewicht += aandeel[m];
  }
  return { waarde: Math.round(som / gewicht * 100) / 100, tijd, meer: meren.map(m => PEIL_MEETPUNTEN[m].naam).join(' en '), meetpunten, ontbreekt };
}

function verschuivingTekst() {
  const v = S.wind.verschuiving_min || 0;
  return v === 0 ? 'op tijd' : `${getal(Math.abs(v) / 60, Math.abs(v) % 60 ? 1 : 0)} u ${v > 0 ? 'eerder' : 'later'}`;
}

// windverandering eerder (+) of later (−), in minuten; gebruikt op Wind & peil, Advies en Kaart
function verschuifWind(d) { S.wind.verschuiving_min = (S.wind.verschuiving_min || 0) + d; bewaar(); meld('wind'); }
// knoppen voor de windverandering op Advies en Kaart, en de tekst ernaast
document.querySelectorAll('[data-schuif]').forEach(b => { b.onclick = () => verschuifWind(+b.dataset.schuif); });
const toonVerschuiving = () => document.querySelectorAll('.windverschuiving').forEach(x => { x.textContent = verschuivingTekst(); });
op('wind', toonVerschuiving); toonVerschuiving();
