// Tabblad 3 Wind & peil: windverwachting ophalen, windtabel per plaats aanpassen, windverandering verschuiven, peil.
const isoDatum = ms => new Date(ms).toLocaleDateString('sv-SE', { timeZone: TZ });   // 'YYYY-MM-DD' in lokale tijd

// Plaatsen in de windtabel. Aanpassingen op een plaats werken door in de omgeving (afstandsgewogen).
const WINDPLAATSEN = [
  { id: 'enkhuizen', naam: 'Enkhuizen', lat: 52.705, lon: 5.30 },
  { id: 'medemblik', naam: 'Medemblik', lat: 52.80, lon: 5.15 },
  { id: 'stavoren', naam: 'Stavoren', lat: 52.87, lon: 5.34 },
  { id: 'midden', naam: 'Midden', lat: 52.80, lon: 5.42 },
  { id: 'urk', naam: 'Urk', lat: 52.68, lon: 5.52 },
  { id: 'markermeer', naam: 'Markermeer', lat: 52.52, lon: 5.20 }
];

// De wind waarmee gerekend wordt: de verwachting met de aanpassingen uit de windtabel en de verschuiving van de windverandering.
// Aanpassing per uur en plaats { draai (°), factor }; op een windpunt telt elke plaats mee met gewicht 1/d² (d in km, min. 3 km).
function windEffectief() {
  const w = S.wind.W; if (!w) return null;
  const a = S.wind.aanpassingen, sh = (S.wind.verschuiving_min || 0) * 60000;
  const gewicht = w.punten.map(p => WINDPLAATSEN.map(q => 1 / Math.max(3, afstandM(p, q) / 1000) ** 2));
  return { ...w, tijden: w.tijden.map(t => t - sh),
    data: w.data.map((reeks, i) => reeks.map((c, k) => {
      const x = a[w.tijden[k]]; if (!x) return c;
      let sg = 0, sd = 0, sf = 0;
      WINDPLAATSEN.forEach((q, j) => { const g = gewicht[i][j], v = x[q.id] || { draai: 0, factor: 1 }; sg += g; sd += g * v.draai; sf += g * v.factor; });
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

  const schuif = d => { S.wind.verschuiving_min = (S.wind.verschuiving_min || 0) + d; bewaar(); meld('wind'); };
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
    const s = startMs() - 3600e3, l = limietMs() + 3600e3, a = S.wind.aanpassingen;
    const rijen = [];
    W.tijden.forEach(t => {
      const tv = t - sh;                                   // het moment waarop deze verwachting nu geldt
      if (tv < s || tv > l) return;
      const cellen = WINDPLAATSEN.map(q => {
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
    tab.replaceChildren(el('thead', {}, el('tr', {}, el('th', {}, 'Tijd'), ...WINDPLAATSEN.map(q => el('th', {}, q.naam, el('br'), el('span', { class: 'sub' }, '° · kn · Bft'))))), el('tbody', {}, rijen));
    tabStatus('wind', windDekt() ? 'klaar' : 'let', windDekt() ? '' : 'de wind dekt de wedstrijd niet');
    if (!windDekt()) melding('windmelding', 'let', 'De opgehaalde wind dekt niet de hele wedstrijd (start tot finishlimiet). Haal de wind opnieuw op.');
  }

  // ---- peil ----
  function vulPeil() {
    const sz = seizoenBij(invoer().datum);
    $('peilkeuze').replaceChildren(
      el('option', { value: 'auto' }, `Streefpeil volgens de datum (${sz}, ${getal(PEIL[sz].waarde, 2)} m NAP)`),
      el('option', { value: 'zomer' }, `Streefpeil zomer (${getal(PEIL.zomer.waarde, 2)} m NAP)`),
      el('option', { value: 'winter' }, `Streefpeil winter (${getal(PEIL.winter.waarde, 2)} m NAP)`),
      el('option', { value: 'hand' }, 'Eigen waarde'));
    $('peilkeuze').value = S.peilKeuze || 'auto';
    $('peilHandVak').hidden = S.peilKeuze !== 'hand';
    $('peil').value = peil();
    $('peiluitleg').innerHTML = `Waterdiepte = peil − bodemhoogte. Zomer (1 april – 30 september): de band NAP −0,10 tot −0,30 m, gerekend met het midden;
      winter: NAP −0,40 m (<a href="${PEIL.bron}">Rijkswaterstaat</a>). Het werkelijke peil kan afwijken, bijvoorbeeld door wind of afvoer; het actuele peil ophalen volgt.`;
  }
  $('peilkeuze').onchange = () => { S.peilKeuze = $('peilkeuze').value; if (S.peilKeuze === 'hand' && S.peilHand == null) S.peilHand = peil(); bewaar(); vulPeil(); meld('invoer'); };
  $('peil').onchange = () => { S.peilHand = Math.max(-1.5, Math.min(1, +$('peil').value)); bewaar(); vulPeil(); meld('invoer'); };

  op('invoer', () => { vul(); vulPeil(); });
  op('wind', vul);
  vul(); vulPeil();
})();

function verschuivingTekst() {
  const v = S.wind.verschuiving_min || 0;
  return v === 0 ? 'op tijd' : `${getal(Math.abs(v) / 60, Math.abs(v) % 60 ? 1 : 0)} u ${v > 0 ? 'eerder' : 'later'}`;
}
