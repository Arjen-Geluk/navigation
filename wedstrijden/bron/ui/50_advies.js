// Tabblad 4 Advies: rekenen (met voortgang), advies per baan met robuustheid, alle routes, rakkentabel.
let UITKOMST = null;          // { banen: { K: rekenBaan-uitkomst, … }, limiet, gemaakt, verouderd, opmerkingen }
let VAARWATER = null;

function gekozenRoute() {
  if (!UITKOMST) return null;
  const b = UITKOMST.banen[S.selectie.baan]; if (!b) return null;
  return b.routes.find(r => r.naam === S.selectie.route) || b.routes[0];
}

(function () {
  function kanRekenen() {
    const ef = huidigeEditie().fouten;
    if (ef.length) return 'Een aangepaste route verwijst naar een onbekende boei (tabblad Wedstrijd): ' + ef.join(' ');
    if (!SCHIP.actief) return 'Laad eerst een polar in (tabblad Schip).';
    if (!S.wind.W) return 'Haal eerst de wind op (tabblad Wind & peil).';
    if (!windDekt()) return 'De wind dekt de wedstrijd niet; haal de wind opnieuw op.';
    return null;
  }

  async function bereken() {
    const fout = kanRekenen();
    if (fout) { melding('adviesmelding', 'let', fout); return; }
    await bodemKlaar;
    if (!BODEM) { melding('adviesmelding', 'fout', 'Het bodemraster ontbreekt in deze pagina.'); return; }
    const E = huidigeEditie(), P = SCHIP.actief, o = rekenOpties(), W = windEffectief();
    VAARWATER = maakVaarwater(BODEM, P, { peil: peil(), kielspeling: o.kielspeling, marge_verboden_m: E.standaard.marge_verboden_m ?? 50, zones: E.zones });
    const wl = invoer().baanWL, volgorde = Object.keys(E.banen).sort((a, b) => (b === wl) - (a === wl));
    const balk = $('voortgang'); balk.hidden = false; $('bereken').disabled = true;
    melding('adviesmelding', '', 'Rekenen…');
    const banen = {}, t0 = performance.now();
    for (let i = 0; i < volgorde.length; i++) {
      balk.firstChild.style.width = `${Math.round(100 * i / volgorde.length)}%`;
      await new Promise(r => setTimeout(r, 30));
      banen[volgorde[i]] = rekenBaan(VAARWATER, W, P, E, volgorde[i], { ...o, ...reisOpties(), startMs: startMs() });
    }
    balk.firstChild.style.width = '100%';
    setTimeout(() => { balk.hidden = true; }, 300);
    $('bereken').disabled = false;
    UITKOMST = { banen, limiet: limietMs(), gemaakt: Date.now(), verouderd: false, rekentijd_ms: performance.now() - t0,
      afwijkend: heeftAfwijkingen(), factor: S.schip.factor, polar: polarLabel(P), polarId: P.schip.id, polarVersie: P.versie };
    if (!S.selectie.baan || !banen[S.selectie.baan]) S.selectie.baan = wl || volgorde[0];
    S.selectie.route = banen[S.selectie.baan].snelste?.naam || null;
    bewaar();
    melding('adviesmelding', '', '');
    toon(); meld('uitkomst', UITKOMST);
  }
  $('bereken').onclick = bereken;
  op('bereken', bereken);

  const verouderd = () => { if (UITKOMST && !UITKOMST.verouderd) { UITKOMST.verouderd = true; toon(); } else toonStatus(); };
  op('invoer', verouderd); op('wind', verouderd); op('polar', p => { if (UITKOMST && p && UITKOMST.polarId === p.schip.id && UITKOMST.polarVersie === p.versie) return; verouderd(); }); op('editie', () => { UITKOMST = null; toon(); meld('uitkomst', null); });

  function toonStatus() {
    const fout = kanRekenen();
    tabStatus('advies', UITKOMST && !UITKOMST.verouderd ? 'klaar' : 'let', UITKOMST ? (UITKOMST.verouderd ? 'opnieuw rekenen' : '') : 'nog niet berekend');
    tabStatus('kaart', UITKOMST && !UITKOMST.verouderd ? 'klaar' : '');
    if (!UITKOMST) melding('adviesmelding', fout ? 'let' : '', fout || 'Klaar om te rekenen: klik op Bereken.');
    else if (UITKOMST.verouderd) melding('adviesmelding', 'let', 'Er is iets veranderd sinds de berekening. Klik op Bereken voor een nieuw advies.');
  }

  const tijdRood = ms => ms != null && UITKOMST && ms > UITKOMST.limiet;

  function toon() {
    toonStatus();
    const kaartjes = $('baankaartjes');
    if (!UITKOMST) { kaartjes.replaceChildren(); $('routesPaneel').hidden = $('rakkenPaneel').hidden = true; $('kopRoute').hidden = true; return; }
    const E = EDITIES[S.editie], wl = invoer().baanWL;
    const extra = [];
    if (UITKOMST.factor !== 100) extra.push(`Snelheidsfactor ${UITKOMST.factor}% (wat-als).`);
    if (UITKOMST.afwijkend) extra.push('Afwijkend van de gepubliceerde editie.');
    kaartjes.replaceChildren(
      ...(extra.length ? [el('div', { class: 'melding let breed' }, extra.join(' '))] : []),
      ...Object.entries(UITKOMST.banen).map(([k, b]) => {
        const s = b.snelste, twee = b.routes[1];
        return el('button', { type: 'button', class: 'baankaart' + (k === S.selectie.baan ? ' gekozen' : ''), onclick: () => { S.selectie.baan = k; S.selectie.route = s?.naam; bewaar(); toon(); meld('selectie'); } },
          el('div', { class: 'sub' }, Object.keys(UITKOMST.banen).length > 1 ? b.naam + ' baan' : 'Snelste route', k === wl ? el('span', { class: 'chip klein' }, 'wedstrijdleiding') : ''),
          s ? [el('div', { class: 'groot' }, s.naam),
            el('div', {}, `Zeiltijd ${duur(s.res.zeiltijd_ms)} · finish `, el('b', { class: tijdRood(s.res.finish) ? 'rood' : null }, finishTijd(s.res))),
            el('div', { class: 'sub' }, twee?.res.klaar ? `${duur(twee.res.zeiltijd_ms - s.res.zeiltijd_ms)} sneller dan ${twee.naam}` : ''),
            el('div', { class: 'sub' }, `Snelst in ${s.snelst_in} van de 6 windafwijkingen`)]
            : el('div', {}, 'Geen route haalt de finish.'));
      }));
    toonRoutes(); toonRakken();
  }

  function toonRoutes() {
    const b = UITKOMST.banen[S.selectie.baan], E = EDITIES[S.editie];
    $('routesPaneel').hidden = false;
    $('adviesBaan').replaceChildren(...Object.keys(UITKOMST.banen).map(k => el('option', { value: k }, E.banen[k].naam)));
    $('adviesBaan').value = S.selectie.baan;
    $('adviesBaan').onchange = () => { S.selectie.baan = $('adviesBaan').value; S.selectie.route = UITKOMST.banen[S.selectie.baan].snelste?.naam; bewaar(); toon(); meld('selectie'); };
    $('routesTitel').textContent = `Alle routes, ${b.naam.toLowerCase()} baan`;
    const best = b.routes[0].res.zeiltijd_ms;
    $('routetabel').replaceChildren(
      el('thead', {}, el('tr', {}, ['#', 'Route', 'Zeiltijd', 'Finish', 'Verschil', 'Zeilweg', 'Rechte lijn', 'Overstag / gijp', 'Robuust', 'Let op'].map(t => el('th', {}, t)))),
      el('tbody', {}, b.routes.map((r, i) => {
        const x = r.res;
        return el('tr', { class: r.naam === gekozenRoute()?.naam ? 'gekozen' : null, onclick: () => { S.selectie.route = r.naam; bewaar(); toon(); meld('selectie'); } },
          el('td', {}, i + 1), el('td', {}, el('b', {}, r.naam)),
          el('td', {}, x.klaar ? duur(x.zeiltijd_ms) : 'niet gehaald'),
          el('td', { class: tijdRood(x.finish) ? 'rood' : null }, x.klaar ? kloktijd(x.finish) : '–'),
          el('td', {}, i && x.klaar ? '+ ' + duur(x.zeiltijd_ms - best) : ''),
          el('td', {}, afstand(x.zeilweg_m)), el('td', {}, afstand(x.afstand_m)),
          el('td', {}, `${x.overstag} / ${x.gijp}`), el('td', {}, `${r.snelst_in}/6`),
          el('td', { class: 'sub' }, x.waarschuwingen.length ? '⚠ ' + x.waarschuwingen.length : ''));
      })));
  }

  const hoofd = obj => Object.entries(obj || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || '–';
  function toonRakken() {
    const r = gekozenRoute(); if (!r) { $('rakkenPaneel').hidden = true; return; }
    const x = r.res, P = SCHIP.actief;
    $('rakkenPaneel').hidden = false;
    $('rakkenTitel').textContent = `Rakken: ${r.naam}`;
    $('kopRoute').hidden = false;
    $('kopRoute').textContent = `${r.naam} · ${duur(x.zeiltijd_ms)} · finish ${finishTijd(x)}`;
    $('reisonderdelen').hidden = !x.onderdelen;
    if (x.onderdelen) $('reisonderdelen').replaceChildren(el('b', {}, 'Reis'), el('ol', {}, onderdelenTekst(x).map(t => el('li', {}, t))));
    const pt = Object.fromEntries(r.punten.map(p => [p.id, p]));
    $('rakkentabel').replaceChildren(
      el('thead', {}, el('tr', {}, ['Rak', 'Koers', 'Afstand', 'Zeilweg', 'Zeilstand', 'Zwaard', 'Ronding', 'Wind', 'Overstag', 'Opmerking'].map(t => el('th', {}, t)))),
      el('tbody', {}, x.rakken.map(k => {
        const opm = [];
        if (k.omweg) opm.push('om ondiepte of gebied heen');
        if (k.schatting) opm.push('polar hier een schatting');
        for (const [z, s] of Object.entries(k.ondiep || {})) opm.push(`${Math.round(s / 60)} min te ondiep voor zwaard ${z}`);
        return el('tr', {}, el('td', {}, `${k.van} → ${k.naar}`), el('td', {}, koersTekst(koersNaar(pt[k.van], pt[k.naar]))),
          el('td', {}, afstand(k.afstand_m)), el('td', {}, afstand(k.zeilweg_m)), el('td', {}, hoofd(k.stand_s)), el('td', {}, hoofd(k.zwaard_s)),
          el('td', { class: tijdRood(k.eind) ? 'rood' : null }, k.eind ? kloktijd(k.eind) : '–'),
          el('td', {}, k.wind ? `${koersTekst(k.wind.dir)} ${getal(k.wind.kn, 0)} kn (${knNaarBft(k.wind.kn)} Bft)` : '–'),
          el('td', {}, k.overstag || ''), el('td', { class: 'sub' }, opm.join('; ')));
      })));
    $('routewaarschuwingen').replaceChildren(...x.waarschuwingen.map(w => el('div', { class: 'melding let' }, w)));
  }
  // uitkomst uit een rekenbestand: tonen zoals berekend, zonder opnieuw te rekenen
  op('rekenbestand', u => {
    UITKOMST = u;
    const wl = invoer().baanWL, banen = Object.keys(u.banen);
    S.selectie.baan = banen.includes(wl) ? wl : banen[0];
    S.selectie.route = u.banen[S.selectie.baan].snelste?.naam || null;
    VAARWATER = BODEM && SCHIP.actief ? maakVaarwater(BODEM, SCHIP.actief, { peil: peil(), kielspeling: rekenOpties().kielspeling, marge_verboden_m: huidigeEditie().standaard.marge_verboden_m ?? 50, zones: huidigeEditie().zones }) : null;
    bewaar(); toon(); meld('uitkomst', u);
  });
  op('selectie', () => { if (UITKOMST) { toonRoutes(); toonRakken(); } });
  toon();
})();
