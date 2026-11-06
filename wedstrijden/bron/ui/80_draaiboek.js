// Draaiboek voor aan boord (stap 7): opgebouwd als printversie in de pagina; de browser maakt er een PDF van (Afdrukken).
// Staand A4, zwart-wit leesbaar: kaarten met grijstinten en arcering in plaats van kleur.
(function () {
  const db = $('draaiboek');

  function vulKeuze() {
    const E = EDITIES[S.editie], wl = invoer().baanWL, oud = $('dbBanen').value;
    $('dbBanen').replaceChildren(
      ...(wl ? [el('option', { value: wl }, `${E.banen[wl].naam} baan (wedstrijdleiding)`)] : []),
      el('option', { value: 'alle' }, 'Alle banen'),
      ...Object.entries(E.banen).filter(([k]) => k !== wl).map(([k, b]) => el('option', { value: k }, `${b.naam} baan`)));
    if ([...$('dbBanen').options].some(o => o.value === oud)) $('dbBanen').value = oud;
  }
  op('invoer', vulKeuze); op('editie', vulKeuze); vulKeuze();

  function kanMaken() {
    if (!UITKOMST) return 'Er is nog geen berekening. Klik eerst op Bereken.';
    if (UITKOMST.verouderd) return 'De berekening is verouderd. Klik eerst opnieuw op Bereken, zodat het draaiboek klopt.';
    return null;
  }

  // ---------- kaart per route: canvas in grijstinten ----------
  function routeKaart(r, P, B) {
    const E = huidigeEditie(), ks = rekenOpties().kielspeling, p = peil(), dg = P.schip.diepgang_m;
    const pts = [...r.res.track, ...r.punten];
    let zuid = Math.min(...pts.map(x => x.lat)), noord = Math.max(...pts.map(x => x.lat)), west = Math.min(...pts.map(x => x.lon)), oost = Math.max(...pts.map(x => x.lon));
    const marge = 0.012; zuid -= marge; noord += marge; west -= marge * 1.6; oost += marge * 1.6;
    const kx = Math.cos((zuid + noord) / 2 * Math.PI / 180);
    // verhouding van de kaart: breedte 1600 px, hoogte volgens het gebied (max 1500)
    // schaal zo dat het hele gebied past in maximaal 1600 × 1500 px
    const schaal = Math.min(1600 / ((oost - west) * kx), 1500 / (noord - zuid));
    const W = Math.round((oost - west) * kx * schaal), H = Math.round((noord - zuid) * schaal);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
    const naarPx = (lat, lon) => [(lon - west) * kx * schaal, (noord - lat) * schaal];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const lat = noord - y / schaal, lon = west + x / (kx * schaal), b = bodemOp(B, lat, lon), i = 4 * (y * W + x);
      let g = 255;
      if (inVerbodenVaargebied(B, lat, lon)) g = (x + y) % 8 < 2 || (x - y + 8000) % 8 < 2 ? 40 : 235;   // verboden gebied: kruisarcering
      else if (b == null) g = 205;                                                // land
      else {
        const diep = p - b - ks;
        if (diep < dg.op) g = (x + y) % 6 < 2 ? 70 : 225;                          // romp loopt vast: dichte arcering
        else if (diep < dg.neer) g = (x % 6 === 0 && y % 6 === 0) ? 90 : 245;     // te ondiep voor zwaard neer: stippels
      }
      d[i] = d[i + 1] = d[i + 2] = g; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // verboden gebieden
    ctx.setLineDash([12, 8]); ctx.lineWidth = 3; ctx.strokeStyle = '#000';
    for (const z of E.zones.filter(z => z.actief)) { ctx.beginPath(); z.punten.forEach((q, i) => { const [x, y] = naarPx(q.lat, q.lon); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke(); }
    ctx.setLineDash([]);
    // track
    ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round'; ctx.beginPath();
    r.res.track.forEach((q, i) => { const [x, y] = naarPx(q.lat, q.lon); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    // punten met naam en rondingstijd
    const tijd = Object.fromEntries(r.res.rakken.map(k => [k.naar, k.eind]));
    ctx.font = 'bold 28px Segoe UI, Arial, sans-serif'; ctx.textBaseline = 'middle';
    for (const q of r.punten) {
      const [x, y] = naarPx(q.lat, q.lon);
      ctx.beginPath(); ctx.arc(x, y, 10, 0, 2 * Math.PI); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 4; ctx.stroke();
      const t = `${q.id}${q.zijde ? ' ' + q.zijde : ''}${tijd[q.id] ? '  ' + kloktijd(tijd[q.id]) : ''}`;
      const bw = ctx.measureText(t).width, tx = x + 18 + bw > W - 8 ? x - 18 - bw : x + 18, ty = Math.max(20, Math.min(H - 20, y));
      ctx.lineWidth = 7; ctx.strokeStyle = '#fff'; ctx.strokeText(t, tx, ty); ctx.fillStyle = '#000'; ctx.fillText(t, tx, ty); ctx.strokeStyle = '#000';
    }
    // schaalbalk (1 NM) en noordpijl
    const nm = 1852 / 111200 * schaal;
    ctx.fillStyle = '#000'; ctx.fillRect(30, H - 40, nm, 8); ctx.font = '24px Segoe UI, Arial, sans-serif'; ctx.fillText('1 NM', 30, H - 60);
    ctx.beginPath(); ctx.moveTo(W - 50, 30); ctx.lineTo(W - 64, 70); ctx.lineTo(W - 36, 70); ctx.closePath(); ctx.fill(); ctx.fillText('N', W - 59, 90);
    return c.toDataURL('image/png');
  }

  // ---------- opbouw ----------
  const tabel = (koppen, rijen, klasse) => el('table', { class: 'db-tabel ' + (klasse || '') }, el('thead', {}, el('tr', {}, koppen.map(k => el('th', {}, k)))), el('tbody', {}, rijen));
  const hoofd = obj => Object.entries(obj || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || '–';
  const windTekst = w => w ? `${koersTekst(w.dir)} ${getal(w.kn, 0)} kn (${knNaarBft(w.kn)})` : '–';

  async function maak() {
    const fout = kanMaken();
    if (fout) { melding('dbmelding', 'let', fout); return false; }
    await bodemKlaar;
    const E = EDITIES[S.editie], HE = huidigeEditie(), inv = invoer(), P = UITKOMST.bronPolar || SCHIP.actief, o = rekenOpties();
    const W = S.wind.W, keuze = $('dbBanen').value;
    const banen = keuze === 'alle' ? Object.keys(UITKOMST.banen) : [keuze];
    const kop = (titel) => el('div', { class: 'db-kop' }, el('span', {}, `${E.wedstrijd.naam} ${E.jaar} · ${new Date(inv.datum + 'T12:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}`), el('b', {}, titel));
    const bladen = [];

    // 1. voorblad
    const regels = [
      ['Wedstrijd', `${E.wedstrijd.naam}, editie ${E.jaar} (v${E.versie})`],
      ['Wedstrijdbepalingen', E.status.gecontroleerd ? `gecontroleerd tegen ${E.status.tegen} (${E.status.datum_bepalingen})` : 'editie nog niet gecontroleerd tegen de wedstrijdbepalingen'],
      ['Datum en tijden', `${inv.datum} · start ${inv.start} · finishlimiet ${inv.limiet}`],
      ['Baan wedstrijdleiding', inv.baanWL ? E.banen[inv.baanWL].naam : 'nog onbekend'],
      ['Schip en polar', `${polarLabel(P)} · opgeslagen ${P.gewijzigd ? new Date(P.gewijzigd).toLocaleDateString('nl-NL') : 'onbekend'}`],
      ['Wind', `${(WINDMODELLEN.find(m => m.id === W.model) || { naam: W.model }).naam}, opgehaald ${dagEnTijd(W.opgehaald)}${S.wind.verschuiving_min ? ` · windverandering ${verschuivingTekst()}` : ''}${Object.keys(S.wind.aanpassingen).length ? ' · windtabel met de hand aangepast' : ''}`],
      ['Peil', `${getal(peil(), 2)} m NAP (${peilKeuze() === 'hand' ? 'eigen waarde' : 'streefpeil ' + peilKeuze()})`],
      ['Instellingen', `kielspeling ${getal(o.kielspeling, 2)} m · overstag ${o.overstag_s == null ? 'zonder tijdverlies' : o.overstag_s + ' s'} · gijp ${o.gijp_s == null ? 'zonder tijdverlies' : o.gijp_s + ' s'}${o.snelheidsfactor !== 1 ? ` · SNELHEIDSFACTOR ${Math.round(o.snelheidsfactor * 100)}% (wat-als)` : ''}`],
      ['Berekend', `${dagEnTijd(UITKOMST.gemaakt)} · pagina versie ${TOOL.versie} · vaargebied v${G.vaargebied.versie}`]
    ];
    const afw = [];
    const a = inv.afwijkingen;
    Object.entries(a.routes).forEach(([k, v]) => afw.push(`route ${k.replace('|', ', ')}: ${v.join(' – ')}`));
    Object.entries(a.punten).forEach(([k, v]) => afw.push(`${k} verlegd naar ${v.lat.toFixed(5)}, ${v.lon.toFixed(5)}`));
    a.tonnen.forEach(t => afw.push(`wedstrijdton ${t.id} op ${t.lat.toFixed(5)}, ${t.lon.toFixed(5)}`));
    Object.entries(a.zones).forEach(([k, v]) => afw.push(`gebied ${k} ${v ? 'aan' : 'uit'}`));
    bladen.push(el('section', { class: 'db-blad' },
      el('h1', {}, 'Draaiboek'), el('div', { class: 'db-sub' }, `${E.wedstrijd.naam} ${E.jaar}`),
      el('dl', { class: 'db-gegevens' }, regels.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])),
      afw.length ? [el('h2', {}, 'Afwijkend van de gepubliceerde editie'), el('ul', {}, afw.map(x => el('li', {}, x)))] : '',
      el('h2', {}, 'Advies per baan'),
      tabel(['Baan', 'Snelste route', 'Zeiltijd', 'Finish', 'Voorsprong op nr. 2', 'Robuust'], Object.values(UITKOMST.banen).map(b => {
        const s = b.snelste, twee = b.routes[1];
        return el('tr', {}, el('td', {}, b.naam), el('td', {}, s ? el('b', {}, s.naam) : '–'), el('td', {}, s ? duur(s.res.zeiltijd_ms) : '–'),
          el('td', {}, s ? kloktijd(s.res.finish) + (s.res.finish > UITKOMST.limiet ? ' (na limiet)' : '') : '–'),
          el('td', {}, s && twee?.res.klaar ? `${duur(twee.res.zeiltijd_ms - s.res.zeiltijd_ms)} op ${twee.naam}` : '–'), el('td', {}, s ? `snelst in ${s.snelst_in} van 6` : ''));
      })),
      el('p', { class: 'db-klein' }, 'Robuust: hoe vaak de route ook het snelst is als de wind 15° links- of rechtsom draait, 20% meer of minder waait, of de windverandering een uur eerder of later komt. Alleen voor de voorbereiding; de kaart, de betonning en de wedstrijdleiding gaan voor.')));

    // 2. per baan: alle routes op een rij, dan per route de rakken (en kaart)
    const B = BODEM, metKaart = $('dbKaarten').checked;
    for (const bk of banen) {
      const b = UITKOMST.banen[bk], best = b.routes[0].res.zeiltijd_ms;
      bladen.push(el('section', { class: 'db-blad' }, kop(`${b.naam} baan: alle routes`),
        tabel(['#', 'Route', 'Zeiltijd', 'Finish', 'Verschil', 'Zeilweg', 'Overstag/gijp', 'Robuust'], b.routes.map((r, i) => el('tr', {},
          el('td', {}, i + 1), el('td', {}, r.naam), el('td', {}, r.res.klaar ? duur(r.res.zeiltijd_ms) : 'niet gehaald'), el('td', {}, r.res.klaar ? kloktijd(r.res.finish) : '–'),
          el('td', {}, i && r.res.klaar ? '+ ' + duur(r.res.zeiltijd_ms - best) : ''), el('td', {}, afstand(r.res.zeilweg_m)), el('td', {}, `${r.res.overstag}/${r.res.gijp}`), el('td', {}, `${r.snelst_in}/6`))))));
      for (const r of b.routes) {
        if (!r.res.klaar) continue;
        const pt = Object.fromEntries(r.punten.map(q => [q.id, q]));
        const opm = k => {
          const x = [];
          if (k.omweg) x.push('om ondiepte/gebied');
          if (k.schatting) x.push('polar hier een schatting');
          for (const [z, s] of Object.entries(k.ondiep || {})) x.push(`${Math.round(s / 60)} min ondiep voor zwaard ${z}`);
          return x.join('; ');
        };
        bladen.push(el('section', { class: 'db-blad' }, kop(`${b.naam} baan · ${r.naam}`),
          el('p', {}, el('b', {}, `Zeiltijd ${duur(r.res.zeiltijd_ms)} · finish ${kloktijd(r.res.finish)}`), ` · zeilweg ${afstand(r.res.zeilweg_m)} (rechte lijnen ${afstand(r.res.afstand_m)}) · ${r.res.overstag} keer overstag, ${r.res.gijp} keer gijpen`),
          tabel(['Rak', 'Ware koers', 'Afstand', 'Zeilstand', 'Zwaard', 'Ronding', 'Wind (Bft)', 'Slagen', 'Let op'], r.res.rakken.map(k => el('tr', {},
            el('td', {}, `${k.van} → ${k.naar}${pt[k.naar]?.zijde ? ' ' + pt[k.naar].zijde : ''}`), el('td', {}, koersTekst(koersNaar(pt[k.van], pt[k.naar]))),
            el('td', {}, afstand(k.afstand_m)), el('td', {}, hoofd(k.stand_s)), el('td', {}, hoofd(k.zwaard_s)), el('td', {}, el('b', {}, kloktijd(k.eind))),
            el('td', {}, windTekst(k.wind)), el('td', {}, k.overstag ? String(k.overstag + 1) : '1'), el('td', { class: 'db-klein' }, opm(k)))), 'rakken'),
          r.res.waarschuwingen.length ? el('ul', { class: 'db-klein' }, r.res.waarschuwingen.map(w => el('li', {}, w))) : '',
          metKaart && B ? [el('img', { class: 'db-kaart', src: routeKaart(r, P, B), alt: `Kaart ${r.naam}` }),
            el('p', { class: 'db-klein' }, 'Kaart: zwarte lijn = berekende route met kruisslagen; grijs = land; stippels = te ondiep voor zwaard neer; dichte arcering = romp loopt vast; kruisarcering of streeplijn = verboden gebied. Tijden = verwachte rondingstijd.')] : ''));
      }
    }

    // 3. windtabel en waarschuwingen
    const WE = windEffectief(), s0 = startMs() - 3600e3, l0 = limietMs() + 3600e3;
    const uren = WE.tijden.filter(t => t >= s0 && t <= l0);
    const waarsch = [];
    const dagen = iso => (Date.now() - Date.parse(iso)) / 864e5;
    if (G.vaargebied.betonning?.opgehaald && dagen(G.vaargebied.betonning.opgehaald) > 365) waarsch.push(`De betonning is opgehaald op ${G.vaargebied.betonning.opgehaald}; mogelijk is er iets verlegd.`);
    if (UITKOMST.gemaakt - W.opgehaald > 12 * 3600e3) waarsch.push(`De wind is opgehaald op ${dagEnTijd(W.opgehaald)}; haal hem kort voor de start opnieuw op.`);
    if (!E.status.gecontroleerd) waarsch.push('Deze editie is nog niet gecontroleerd tegen de wedstrijdbepalingen.');
    if (o.snelheidsfactor !== 1) waarsch.push(`Gerekend met snelheidsfactor ${Math.round(o.snelheidsfactor * 100)}% (wat-als).`);
    const schatting = banen.some(bk => UITKOMST.banen[bk].routes.some(r => r.res.rakken.some(k => k.schatting)));
    if (schatting) waarsch.push('Op sommige rakken is de polar een schatting (doorgetrokken buiten de metingen).');
    const ondiep = banen.some(bk => UITKOMST.banen[bk].routes.some(r => r.res.rakken.some(k => Object.keys(k.ondiep || {}).length)));
    if (ondiep) waarsch.push(`Op sommige rakken is het water te ondiep voor de zwaardstand bij die koers (peil ${getal(peil(), 2)} m NAP, kielspeling ${getal(o.kielspeling, 2)} m).`);
    bladen.push(el('section', { class: 'db-blad' }, kop('Windtabel en waarschuwingen'),
      el('h2', {}, 'Windverwachting (ware wind op 10 m: richting · kracht in kn)'),
      tabel(['Tijd', ...WINDPLAATSEN.map(q => q.naam)], uren.map(t => el('tr', {}, el('td', {}, kloktijd(t)),
        ...WINDPLAATSEN.map(q => { const w = windOp(WE, q.lat, q.lon, t); return el('td', {}, `${koersTekst(w.dir)} · ${getal(w.kn, 0)} (${knNaarBft(w.kn)})`); }))), 'wind'),
      el('h2', {}, 'Waarschuwingen'),
      waarsch.length ? el('ul', {}, waarsch.map(w => el('li', {}, w))) : el('p', {}, 'Geen bijzonderheden.'),
      el('p', { class: 'db-klein' }, `Gemaakt met Wedstrijden IJsselmeergebied ${TOOL.versie} (arjen-geluk.github.io/navigation/wedstrijden). Geen navigatiemiddel. Bronnen: bodem RWS opname ${G.vaargebied.bodem?.opname}, betonning RWS ${G.vaargebied.betonning?.opgehaald}, wind Open-Meteo.`)));

    db.replaceChildren(...bladen);
    db.hidden = false;
    melding('dbmelding', '', '');
    return true;
  }

  $('dbVoorbeeld').onclick = async () => { if (await maak()) db.scrollIntoView({ behavior: 'smooth' }); };
  $('dbAfdrukken').onclick = async () => {
    if (!(await maak())) return;
    melding('dbmelding', 'ok', 'Kies in het afdrukvenster "Opslaan als PDF" (of een printer). Papier: A4, staand.');
    setTimeout(() => window.print(), 150);
  };
  op('uitkomst', () => { db.hidden = true; db.replaceChildren(); });
})();
