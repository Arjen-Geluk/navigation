// Tabblad 1 Wedstrijd: editie, datum en tijden, baan van de wedstrijdleiding; beheerweergave met afwijkingen.
(function () {
  const sel = $('editiekeuze');
  sel.replaceChildren(...editieSleutels.map(k => el('option', { value: k }, `${EDITIES[k].wedstrijd.naam} ${EDITIES[k].jaar}`)));

  function vul() {
    const e = EDITIES[S.editie], inv = invoer();
    sel.value = S.editie;
    $('datum').value = inv.datum; $('start').value = inv.start; $('limiet').value = inv.limiet;
    $('baanWL').replaceChildren(el('option', { value: '' }, 'nog onbekend'), ...Object.entries(e.banen).map(([k, b]) => el('option', { value: k }, b.naam)));
    $('baanWL').value = inv.baanWL;
    $('eenheden').value = S.eenheden;
    const st = $('editiestatus');
    st.textContent = e.status.gecontroleerd ? `Editie v${e.versie}, gecontroleerd tegen ${e.status.tegen} (${e.status.datum_bepalingen})`
      : `Editie v${e.versie}, nog niet gecontroleerd tegen de wedstrijdbepalingen`;
    st.className = 'chip' + (e.status.gecontroleerd ? '' : ' let');
    const jaar = +inv.datum.slice(0, 4);
    melding('jaarmelding', 'let', jaar !== e.jaar ? `Let op: de datum ligt in ${jaar}, maar dit is de editie van ${e.jaar}. Kies de editie van ${jaar} als die er is.` : '');
    melding('afwijkmelding', 'let', heeftAfwijkingen() ? `Afwijkend van de gepubliceerde editie ${e.jaar}: je hebt boeien verlegd of gebieden aan- of uitgezet (zie hieronder). Dat staat ook op het advies.` : '');
    $('kopWedstrijd').textContent = `${e.wedstrijd.naam} ${e.jaar} · ${new Date(inv.datum + 'T12:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} ${inv.start}`;
    tabStatus('wedstrijd', jaar !== e.jaar ? 'let' : 'klaar', jaar !== e.jaar ? 'datum past niet bij de editie' : '');
    if (!$('beheer').hidden) toonBeheer();
  }
  const gewijzigd = () => { bewaar(); vul(); meld('invoer'); };
  sel.onchange = () => { S.editie = sel.value; S.selectie = { baan: null, route: null }; gewijzigd(); meld('editie'); };
  for (const [id, veld] of [['datum', 'datum'], ['start', 'start'], ['limiet', 'limiet'], ['baanWL', 'baanWL']])
    $(id).onchange = () => { if ($(id).value || id === 'baanWL') invoer()[veld] = $(id).value; gewijzigd(); };
  $('eenheden').onchange = () => { S.eenheden = $('eenheden').value; gewijzigd(); };
  $('editieStandaard').onclick = () => { const e = EDITIES[S.editie]; Object.assign(invoer(), { datum: e.datum, start: e.start, limiet: e.finishlimiet }); gewijzigd(); };

  // ---- beheerweergave: punten, banen en gebieden; punten verleggen en gebieden aan/uit = afwijking ----
  $('beheerKnop').onclick = () => { const b = $('beheer'); b.hidden = !b.hidden; $('beheerKnop').textContent = b.hidden ? 'Toon' : 'Verberg'; if (!b.hidden) toonBeheer(); };
  function toonBeheer() {
    const e = huidigeEditie(), a = invoer().afwijkingen, orig = Object.fromEntries(EDITIES[S.editie].punten.map(p => [p.id, p]));
    const rijen = e.punten.map(p => {
      const lat = el('input', { type: 'number', step: '0.00001', value: p.lat, class: 'coord' }), lon = el('input', { type: 'number', step: '0.00001', value: p.lon, class: 'coord' });
      const zet = () => { const o = orig[p.id]; if (+lat.value === o.lat && +lon.value === o.lon) delete a.punten[p.id]; else a.punten[p.id] = { lat: +lat.value, lon: +lon.value }; gewijzigd(); meld('editie'); };
      lat.onchange = zet; lon.onchange = zet;
      return el('tr', { class: a.punten[p.id] ? 'afwijkend' : null },
        el('td', {}, el('b', {}, p.id), p.rws ? el('span', { class: 'sub' }, ` RWS ${p.rws}`) : ''),
        el('td', {}, p.soort, p.passeerzijde ? ` (${p.passeerzijde}zijde)` : ''),
        el('td', {}, lat), el('td', {}, lon),
        el('td', {}, el('button', { type: 'button', class: 'knop stil klein', onclick: () => meld('toonOpKaart', p) }, 'op kaart'),
          a.punten[p.id] ? el('button', { type: 'button', class: 'knop stil klein', onclick: () => { delete a.punten[p.id]; gewijzigd(); meld('editie'); } }, 'terug') : ''));
    });
    const zones = e.zones.map(z => el('label', { class: 'vink' + (z.id in a.zones ? ' afwijkend' : '') },
      el('input', { type: 'checkbox', checked: z.actief, onchange: ev => { const o = EDITIES[S.editie].zones.find(x => x.id === z.id).actief; if (ev.target.checked === o) delete a.zones[z.id]; else a.zones[z.id] = ev.target.checked; gewijzigd(); meld('editie'); } }),
      ` ${z.naam} (${z.regel}${z.id in a.zones ? ', afwijkend' : ''})`));
    const banen = Object.entries(e.banen).map(([k, b]) => el('details', {}, el('summary', {}, `${b.naam} (${b.routes.length} routes)`),
      el('ol', {}, b.routes.map(r => el('li', {}, el('b', {}, r.naam), el('br'), el('span', { class: 'sub' }, r.volgorde.join(' → ')))))));
    $('beheer').replaceChildren(
      el('p', { class: 'sub' }, 'Verleg je hier een boei (bijvoorbeeld zoals de wedstrijdleiding op de dag meldt), dan rekent de pagina daarmee en staat op het advies dat je afwijkt van de gepubliceerde editie. De editie zelf verandert alleen via het beheer in de repo.'),
      el('h3', {}, 'Boeien en via-punten'), el('div', { class: 'tabelvak' }, el('table', { class: 'tabel' },
        el('thead', {}, el('tr', {}, ['Punt', 'Soort', 'Breedte (°N)', 'Lengte (°O)', ''].map(t => el('th', {}, t)))), el('tbody', {}, rijen))),
      el('h3', {}, 'Gebieden'), el('div', {}, zones),
      el('h3', {}, 'Banen'), el('div', {}, banen));
  }
  op('polar', vul);
  vul();
})();
