// Tabblad 3 Wind & peil: windverwachting ophalen, windtabel met de hand aanpassen, windverandering verschuiven, peil.
const isoDatum = ms => new Date(ms).toLocaleDateString('sv-SE', { timeZone: TZ });   // 'YYYY-MM-DD' in lokale tijd

// Gemiddelde wind over alle punten op uur k: { dir, kn, vlaag }
function gemiddeldeWind(W, k) {
  let u = 0, v = 0, kn = 0, vl = 0, nv = 0;
  for (const p of W.data) { const c = p[k]; u += Math.sin(c.dir * D2R); v += Math.cos(c.dir * D2R); kn += c.kn; if (c.vlaag != null) { vl += c.vlaag; nv++; } }
  return { dir: (Math.atan2(u, v) / D2R + 360) % 360, kn: kn / W.data.length, vlaag: nv ? vl / nv : null };
}
// De wind waarmee gerekend wordt: met de aanpassingen uit de windtabel en de verschuiving van de windverandering.
function windEffectief() {
  const w = S.wind.W; if (!w) return null;
  const a = S.wind.aanpassingen, sh = (S.wind.verschuiving_min || 0) * 60000;
  return { ...w, tijden: w.tijden.map(t => t - sh),
    data: w.data.map(p => p.map((c, k) => { const x = a[w.tijden[k]]; return x ? { ...c, dir: (c.dir + x.draai + 360) % 360, kn: c.kn * x.factor } : c; })) };
}
// dekt de wind de wedstrijd (start tot finishlimiet)?
function windDekt() {
  const w = windEffectief(); if (!w) return false;
  return w.tijden[0] <= startMs() && w.tijden[w.tijden.length - 1] >= limietMs() - 3600e3;
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
        melding('windmelding', m === S.wind.model ? 'ok' : 'let', m === S.wind.model ? `Wind opgehaald: ${naam}.`
          : `${laatsteFout} Teruggevallen op ${naam}.`);
        $('windOphalen').disabled = false;
        vul(); meld('wind');
        return;
      } catch (e) { laatsteFout = `Wind ophalen mislukt (model ${m}): ${e.message}.`; }
    }
    $('windOphalen').disabled = false;
    melding('windmelding', 'fout', `${laatsteFout} Probeer een ander model of vul de windtabel in.`);
  }
  $('windOphalen').onclick = haal;

  const schuif = d => { S.wind.verschuiving_min = (S.wind.verschuiving_min || 0) + d; bewaar(); vul(); meld('wind'); };
  $('windEerder').onclick = () => schuif(30);
  $('windLater').onclick = () => schuif(-30);
  $('windHerstel').onclick = () => { S.wind.aanpassingen = {}; S.wind.verschuiving_min = 0; bewaar(); vul(); meld('wind'); };

  function vul() {
    const v = S.wind.verschuiving_min || 0;
    $('windVerschuiving').textContent = v === 0 ? 'op tijd' : `${Math.abs(v) / 60} u ${v > 0 ? 'eerder' : 'later'}`;
    const W = S.wind.W, tab = $('windtabel');
    if (!W) {
      $('windbron').textContent = 'Nog geen wind. Kies een model en klik op Wind ophalen.';
      tab.replaceChildren(); tabStatus('wind', 'let', 'nog geen wind'); return;
    }
    const naam = (WINDMODELLEN.find(x => x.id === W.model) || { naam: W.model }).naam;
    $('windbron').textContent = `${W.bron}, ${naam}${W.historisch ? ' (historische verwachting)' : ''}, opgehaald ${dagEnTijd(W.opgehaald)}. `
      + `Uren ${dagEnTijd(W.tijden[0])} tot ${dagEnTijd(W.tijden[W.tijden.length - 1])}.`;
    const s = startMs() - 3600e3, l = limietMs() + 3600e3, a = S.wind.aanpassingen;
    const rijen = [];
    W.tijden.forEach((t, k) => {
      if (t < s || t > l) return;
      const g = gemiddeldeWind(W, k), x = a[t] || { draai: 0, factor: 1 };
      const dir = Math.round((g.dir + x.draai + 360) % 360), kn = Math.round(g.kn * x.factor * 10) / 10;
      const ri = el('input', { type: 'number', min: 0, max: 360, step: 5, value: dir, class: 'kort' });
      const kr = el('input', { type: 'number', min: 0, max: 60, step: 0.5, value: kn, class: 'kort' });
      const zet = () => {
        const nd = +ri.value, nk = +kr.value;
        const draai = ((nd - g.dir) % 360 + 540) % 360 - 180, factor = g.kn > 0.1 ? nk / g.kn : 1;
        if (Math.abs(draai) < 0.5 && Math.abs(factor - 1) < 0.01) delete a[t]; else a[t] = { draai, factor };
        bewaar(); vul(); meld('wind');
      };
      ri.onchange = zet; kr.onchange = zet;
      const tVerschoven = t - (S.wind.verschuiving_min || 0) * 60000;
      rijen.push(el('tr', { class: a[t] ? 'afwijkend' : null }, el('td', {}, kloktijd(tVerschoven)), el('td', {}, ri), el('td', {}, kr),
        el('td', {}, knNaarBft(kn)), el('td', {}, g.vlaag == null ? '–' : getal(g.vlaag * x.factor, 0))));
    });
    tab.replaceChildren(el('thead', {}, el('tr', {}, ['Tijd', 'Richting (°)', 'Kracht (kn)', 'Bft', 'Vlagen (kn)'].map(t => el('th', {}, t)))), el('tbody', {}, rijen));
    tabStatus('wind', windDekt() ? 'klaar' : 'let', windDekt() ? '' : 'de wind dekt de wedstrijd niet');
    if (!windDekt()) melding('windmelding', 'let', 'De opgehaalde wind dekt niet de hele wedstrijd (start tot finishlimiet). Haal de wind opnieuw op.');
  }

  // ---- peil ----
  function vulPeil() {
    $('peil').value = peil();
    $('peiluitleg').textContent = S.peil == null
      ? `Standaardpeil ${getal(STANDAARD_PEIL, 2)} m NAP (voorlopig; de streefpeilen per meer en het actuele peil van RWS volgen). Waterdiepte = peil − bodemhoogte.`
      : `Met de hand ingesteld. Waterdiepte = peil − bodemhoogte.`;
  }
  $('peil').onchange = () => { const v = $('peil').value; S.peil = v === '' ? null : Math.max(-1.5, Math.min(1, +v)); bewaar(); vulPeil(); meld('invoer'); };
  $('peilStandaard').onclick = () => { S.peil = null; bewaar(); vulPeil(); meld('invoer'); };

  op('invoer', vul);
  vul(); vulPeil();
})();
