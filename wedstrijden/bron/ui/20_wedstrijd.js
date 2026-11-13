// Tabblad 1 Wedstrijd: editie, datum en tijden, baan van de wedstrijdleiding; beheerweergave met afwijkingen.
(function () {
  const sel = $('editiekeuze');
  sel.replaceChildren(...editieSleutels.map(k => el('option', { value: k }, `${EDITIES[k].wedstrijd.naam}, editie ${EDITIES[k].jaar}`)));

  function vul() {
    const e = EDITIES[S.editie], inv = invoer();
    sel.value = S.editie;
    $('datum').value = inv.datum; $('start').value = inv.start; $('limiet').value = inv.limiet;
    $('baanWL').replaceChildren(el('option', { value: '' }, 'nog onbekend'), ...Object.entries(e.banen).map(([k, b]) => el('option', { value: k }, b.naam)));
    $('baanWL').value = inv.baanWL;
    $('eenheden').value = S.eenheden;
    $('reisvelden').hidden = !isReis(e);
    if (isReis(e)) {
      inv.stoptijden ||= {};
      $('stopvelden').replaceChildren(...e.punten.filter(p => p.soort === 'haven' || p.soort === 'sluis').map(p => {
        const v = el('input', { type: 'number', min: 0, max: 240, step: 5, value: inv.stoptijden[p.id] ?? '', placeholder: p.soort === 'sluis' ? p.schuttijd_min : p.verblijf_min });
        v.onchange = () => { inv.stoptijden[p.id] = v.value; gewijzigd(); };
        return el('label', {}, `${p.soort === 'sluis' ? 'Schutten' : 'Haven'} ${p.id} (min)`, v);
      }));
      $('terugStart').value = inv.terugStart || '';
      $('reisuitleg').textContent = `Tijden per haven en sluis; leeg = de waarde uit de editie (grijs). Schutten en rust tellen niet als zeiltijd, een haven wel. De terugreis start ${e.rust_min_uur ?? 0} uur na de finish van de heenreis, of later als je hier een tijd invult.`;
    }
    const st = $('editiestatus');
    st.textContent = e.status.gecontroleerd ? `Editie ${e.jaar} (v${e.versie}), gecontroleerd tegen ${e.status.tegen} (${e.status.datum_bepalingen})`
      : `Editie ${e.jaar} (v${e.versie}), nog niet gecontroleerd tegen de wedstrijdbepalingen`;
    st.className = 'chip' + (e.status.gecontroleerd ? '' : ' let');
    const jaar = +inv.datum.slice(0, 4);
    melding('jaarmelding', 'let', jaar !== e.jaar ? `Let op: de datum ligt in ${jaar}, maar dit is editie ${e.jaar}. Kies editie ${jaar} als die er is.` : '');
    melding('afwijkmelding', 'let', heeftAfwijkingen() ? `Afwijkend van de gepubliceerde editie ${e.jaar}: je hebt banen, boeien of gebieden aangepast (zie hieronder). Dat staat ook op het advies.` : '');
    $('kopWedstrijd').textContent = `${e.wedstrijd.naam} ${e.jaar} · ${new Date(inv.datum + 'T12:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} ${inv.start}`;
    tabStatus('wedstrijd', jaar !== e.jaar || huidigeEditie().fouten.length ? 'let' : 'klaar', jaar !== e.jaar ? 'datum past niet bij de editie' : '');
    if (!$('beheer').hidden) toonBeheer();
  }
  const gewijzigd = () => { bewaar(); vul(); meld('invoer'); };
  sel.onchange = () => { S.editie = sel.value; S.selectie = { baan: null, route: null }; gewijzigd(); meld('editie'); };
  for (const [id, veld] of [['datum', 'datum'], ['start', 'start'], ['limiet', 'limiet'], ['baanWL', 'baanWL']])
    $(id).onchange = () => { if ($(id).value || id === 'baanWL') invoer()[veld] = $(id).value; gewijzigd(); };
  $('eenheden').onchange = () => { S.eenheden = $('eenheden').value; gewijzigd(); };
  $('terugStart').onchange = () => { invoer().terugStart = $('terugStart').value; gewijzigd(); };
  $('editieStandaard').onclick = () => { const e = EDITIES[S.editie]; Object.assign(invoer(), { datum: e.datum, start: e.start, limiet: e.finishlimiet, stoptijden: {}, terugStart: '' }); gewijzigd(); };

  // Afwijkingen van de schipper (alleen in deze browser; de editie zelf verandert alleen via het beheer in de repo):
  // routes aanpassen (andere RWS-boei of wedstrijdton), wedstrijdtonnen toevoegen, punten verleggen, gebieden aan/uit.
  $('beheerKnop').onclick = () => { const b = $('beheer'); b.hidden = !b.hidden; $('beheerKnop').textContent = b.hidden ? 'Toon' : 'Verberg'; if (!b.hidden) toonBeheer(); };
  const opnieuw = () => { gewijzigd(); meld('editie'); };

  function toonBeheer() {
    const e = huidigeEditie(), a = invoer().afwijkingen, orig = EDITIES[S.editie];

    // ---- 1. banen ----
    const banen = Object.entries(e.banen).map(([b, baan]) => el('details', { open: b === (invoer().baanWL || S.selectie.baan) },
      el('summary', {}, `${baan.naam} (${baan.routes.length} routes)`),
      el('div', { class: 'tabelvak' }, el('table', { class: 'tabel' }, el('tbody', {}, baan.routes.map(r => {
        const veld = el('input', { type: 'text', value: r.volgorde.slice(1, -1).join(', '), class: 'route',
          title: 'Merktekens met rondingszijde, gescheiden door komma\'s, bijv. "LC 11 bb, De Kreupel bb"' });
        const fout = el('span', { class: 'rood klein' });
        veld.onchange = () => {
          const stappen = veld.value.split(',').map(x => x.trim()).filter(Boolean);
          const bekend = new Set(e.punten.map(p => p.id)), slecht = [];
          for (const s of stappen.map(leesStap)) {
            const stop = s.punt === 'Rust' || ['haven', 'sluis'].includes(e.punten.find(p => p.id === s.punt)?.soort);
            if (!s.zijde && !stop) slecht.push(`${s.punt}: rondingszijde (bb of sb) ontbreekt`);
            else if (stop) continue;
            else if (!bekend.has(s.punt)) { const z = zoekBoei(BETONNING, s.punt); if (z.fout) slecht.push(z.fout); }
          }
          if (slecht.length) { fout.textContent = slecht.join('; '); return; }
          const nieuw = ['Start', ...stappen, 'Finish'], ed = orig.banen[b].routes.find(x => x.naam === r.naam).volgorde;
          if (nieuw.join('|') === ed.join('|')) delete a.routes[routeSleutel(b, r.naam)]; else a.routes[routeSleutel(b, r.naam)] = nieuw;
          opnieuw();
        };
        return el('tr', { class: r.aangepast ? 'afwijkend' : null }, el('td', {}, el('b', {}, r.naam)),
          el('td', {}, el('span', { class: 'sub' }, 'Start – '), veld, el('span', { class: 'sub' }, ' – Finish'), el('br'), fout),
          el('td', {}, r.aangepast ? el('button', { type: 'button', class: 'knop stil klein', onclick: () => { delete a.routes[routeSleutel(b, r.naam)]; opnieuw(); } }, 'terug naar editie') : ''));
      }))))));

    // ---- 2. posities: automatisch uit de RWS-betonning, of uit de editie, of eigen (verlegd / wedstrijdton) ----
    const gebruikt = new Set(Object.values(e.banen).flatMap(b => b.routes.flatMap(r => r.volgorde.map(s => leesStap(s).punt))));
    const bronTekst = { RWS: `RWS-betonning (${G.vaargebied.betonning?.opgehaald || '?'})`, editie: 'editie', verlegd: 'verlegd door jou', wedstrijdton: 'wedstrijdton' };
    const posities = e.punten.filter(p => gebruikt.has(p.id) || p.soort === 'wedstrijdton').map(p => {
      const kan = p.soort === 'wedstrijdton' || p.positie === 'verlegd' || p.positie === 'editie';
      const lat = el('input', { type: 'number', step: '0.00001', value: p.lat, class: 'coord', disabled: !kan });
      const lon = el('input', { type: 'number', step: '0.00001', value: p.lon, class: 'coord', disabled: !kan });
      const zet = () => {
        const ton = a.tonnen.find(t => t.id === p.id);
        if (ton) { ton.lat = +lat.value; ton.lon = +lon.value; }
        else {
          const o = orig.punten.find(x => x.id === p.id);
          if (o && +lat.value === o.lat && +lon.value === o.lon) delete a.punten[p.id]; else a.punten[p.id] = { lat: +lat.value, lon: +lon.value };
        }
        opnieuw();
      };
      lat.onchange = zet; lon.onchange = zet;
      const knoppen = [el('button', { type: 'button', class: 'knop stil klein', onclick: () => meld('toonOpKaart', p) }, 'op kaart')];
      if (p.positie === 'RWS' && orig.punten.some(x => x.id === p.id)) knoppen.push(el('button', { type: 'button', class: 'knop stil klein',
        title: 'Eigen positie gebruiken, bijvoorbeeld als de wedstrijdleiding de boei elders legt', onclick: () => { a.punten[p.id] = { lat: p.lat, lon: p.lon }; opnieuw(); } }, 'verleggen'));
      if (a.punten[p.id]) knoppen.push(el('button', { type: 'button', class: 'knop stil klein', onclick: () => { delete a.punten[p.id]; opnieuw(); } }, 'terug'));
      if (p.soort === 'wedstrijdton') knoppen.push(el('button', { type: 'button', class: 'knop stil klein', onclick: () => { a.tonnen = a.tonnen.filter(t => t.id !== p.id); opnieuw(); } }, 'verwijderen'));
      const afwijkend = p.positie === 'verlegd' || p.soort === 'wedstrijdton' || p.toelichting === 'andere RWS-boei (afwijking)';
      return el('tr', { class: afwijkend ? 'afwijkend' : null },
        el('td', {}, el('b', {}, p.id), p.rws && p.rws !== p.id ? el('span', { class: 'sub' }, ` (${p.rws})`) : ''),
        el('td', {}, bronTekst[p.positie] || p.positie || ''), el('td', {}, lat), el('td', {}, lon), el('td', {}, knoppen));
    });

    // ---- 3. wedstrijdton toevoegen ----
    const tn = el('input', { type: 'text', placeholder: 'naam, bijv. Ton 1', class: 'route kort' });
    const tla = el('input', { type: 'number', step: '0.00001', placeholder: '52.75000', class: 'coord' });
    const tlo = el('input', { type: 'number', step: '0.00001', placeholder: '5.30000', class: 'coord' });
    const tfout = el('span', { class: 'rood klein' });
    const voegToe = el('button', { type: 'button', class: 'knop klein', onclick: () => {
      const id = tn.value.trim();
      if (!id || e.punten.some(p => p.id === id)) { tfout.textContent = 'Kies een naam die nog niet bestaat.'; return; }
      if (!(+tla.value > 52 && +tla.value < 53.5 && +tlo.value > 4.5 && +tlo.value < 6.5)) { tfout.textContent = 'De positie ligt niet in het IJsselmeergebied.'; return; }
      a.tonnen.push({ id, lat: +tla.value, lon: +tlo.value }); opnieuw();
    } }, 'Toevoegen');

    // ---- 4. gebieden ----
    const zones = e.zones.map(z => el('label', { class: 'vink' + (z.id in a.zones ? ' afwijkend' : '') },
      el('input', { type: 'checkbox', checked: z.actief, onchange: ev => {
        const o = orig.zones.find(x => x.id === z.id).actief;
        if (ev.target.checked === o) delete a.zones[z.id]; else a.zones[z.id] = ev.target.checked;
        opnieuw();
      } }), ` ${z.naam} (${z.regel}${z.id in a.zones ? ', afwijkend' : ''})`));

    $('beheer').replaceChildren(
      el('p', { class: 'sub' }, 'Wijzig je hier iets (bijvoorbeeld zoals de wedstrijdleiding op het palaver meldt), dan rekent de pagina daarmee en staat op het advies dat je afwijkt van de gepubliceerde editie. Dit geldt alleen in deze browser; de editie zelf verandert alleen via het beheer in de repo.'),
      e.fouten.length ? el('div', { class: 'melding fout' }, e.fouten.join(' ')) : '',
      el('h3', {}, 'Banen'),
      el('p', { class: 'sub' }, 'Per route de merktekens met rondingszijde. Je kunt een andere RWS-boei gebruiken (typ de naam zoals op de kaart, bijv. "KG 9 bb") of een wedstrijdton die je hieronder toevoegt.'),
      ...banen,
      el('h3', {}, 'Posities'),
      el('p', { class: 'sub' }, 'Boeien met een RWS-naam krijgen automatisch hun positie uit de RWS-betonning. Legt de wedstrijdleiding een boei elders, gebruik dan "verleggen".'),
      el('div', { class: 'tabelvak' }, el('table', { class: 'tabel' },
        el('thead', {}, el('tr', {}, ['Punt', 'Positie uit', 'Breedte (°N)', 'Lengte (°O)', ''].map(t => el('th', {}, t)))), el('tbody', {}, posities))),
      el('h3', {}, 'Wedstrijdton toevoegen'),
      el('div', { class: 'velden' }, tn, tla, tlo, voegToe, tfout),
      el('h3', {}, 'Gebieden'), el('div', {}, zones));
  }
  op('polar', vul);
  op('editie', () => { if (!$('beheer').hidden) toonBeheer(); });
  vul();
})();
