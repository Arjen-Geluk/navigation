// Tabblad 6 Draaiboek & uitvoer: rekenbestand opslaan en inladen (wedstrijden/FORMAAT.md).
(function () {
  function opslaan() {
    if (!UITKOMST) { melding('uitvoermelding', 'let', 'Er is nog geen berekening. Klik eerst op Bereken (tabblad Advies).'); return; }
    if (UITKOMST.verouderd) { melding('uitvoermelding', 'let', 'De berekening is verouderd (er is iets veranderd). Klik eerst opnieuw op Bereken, zodat het bestand klopt.'); return; }
    const P = SCHIP.actief, inv = invoer(), o = rekenOpties();
    const polar = UITKOMST.bronPolar || P;
    const bestand = maakRekenbestand({
      tool: TOOL, vaargebied: G.vaargebied, editieSleutel: S.editie, editie: EDITIES[S.editie], editieGebruikt: huidigeEditie(),
      afwijkingen: inv.afwijkingen,
      invoer: { datum: inv.datum, start: inv.start, limiet: inv.limiet, baan_wl: inv.baanWL, eenheden: S.eenheden,
        peil: { keuze: S.peilKeuze || 'auto', waarde_m: peil(), ...(peilKeuze() === 'actueel' && S.peilActueel ? { meting: { tijd: rwsTijd(S.peilActueel.tijd), meer: S.peilActueel.meer, meetpunten: S.peilActueel.meetpunten } } : {}) },
        schip: { kielspeling_m: o.kielspeling, overstag_s: o.overstag_s, gijp_s: o.gijp_s, snelheidsfactor: o.snelheidsfactor, max_slag: S.schip.maxSlag ?? '3' } },
      wind: { ...S.wind.W, verschuiving_min: S.wind.verschuiving_min || 0, aanpassingen: S.wind.aanpassingen },
      polar, uitkomst: UITKOMST
    });
    const naam = rekenbestandNaam(EDITIES[S.editie].wedstrijd.id, inv.datum, polar.schip.naam);
    const url = URL.createObjectURL(new Blob([JSON.stringify(bestand)], { type: 'application/json' }));
    const a = el('a', { href: url, download: naam }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    melding('uitvoermelding', 'ok', `Rekenbestand opgeslagen als “${naam}”.`);
  }
  $('rekenOpslaan').onclick = opslaan;

  $('rekenInladen').addEventListener('change', async ev => {
    const f = ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    let o;
    try { o = JSON.parse(await f.text()); } catch (e) { melding('uitvoermelding', 'fout', `“${f.name}” is geen leesbaar JSON-bestand.`); return; }
    const r = leesRekenbestand(o);
    if (r.fout) { melding('uitvoermelding', 'fout', `Rekenbestand niet ingeladen: ${r.fout}.`); return; }
    inladen(r, f.name);
  });

  // Zet de invoer van het bestand terug en toont de uitkomst zoals berekend.
  function inladen(r, bestandsnaam) {
    const b = r.bestand, waarschuwing = [];
    if (EDITIES[b.editie.sleutel]) {
      S.editie = b.editie.sleutel;
      if (EDITIES[S.editie].versie !== b.editie.versie) waarschuwing.push(`Het bestand is gemaakt met editie ${b.editie.jaar} versie ${b.editie.versie}; in deze pagina staat versie ${EDITIES[S.editie].versie}.`);
    } else waarschuwing.push(`De editie ${b.editie.sleutel} staat niet in deze pagina; de uitkomst is wel te bekijken.`);
    const inv = invoer();
    Object.assign(inv, { datum: b.invoer.datum, start: b.invoer.start, limiet: b.invoer.limiet, baanWL: b.invoer.baan_wl || '',
      afwijkingen: { punten: {}, zones: {}, routes: {}, tonnen: [], ...(b.afwijkingen || {}) } });
    S.eenheden = b.invoer.eenheden || S.eenheden;
    S.peilKeuze = ['auto', 'zomer', 'winter', 'hand', 'actueel'].includes(b.invoer.peil.keuze) ? b.invoer.peil.keuze : 'auto';
    if (S.peilKeuze === 'actueel') S.peilActueel = b.invoer.peil.meting ? { waarde: b.invoer.peil.waarde_m, tijd: Date.parse(b.invoer.peil.meting.tijd), meer: b.invoer.peil.meting.meer, meetpunten: b.invoer.peil.meting.meetpunten, ontbreekt: [] } : null;
    if (S.peilKeuze === 'hand') S.peilHand = b.invoer.peil.waarde_m;
    const s = b.invoer.schip;
    Object.assign(S.schip, { kielspeling: s.kielspeling_m, metOverstag: s.overstag_s != null, overstag_s: s.overstag_s, metGijp: s.gijp_s != null, gijp_s: s.gijp_s,
      factor: Math.round((s.snelheidsfactor || 1) * 100), maxSlag: s.max_slag ?? '3' });
    const { verschuiving_min, aanpassingen, ...W } = b.wind;
    S.wind.W = W; S.wind.model = W.model || S.wind.model; S.wind.verschuiving_min = verschuiving_min || 0; S.wind.aanpassingen = aanpassingen || {};
    bewaar();

    // polar: zonder actieve polar die uit het bestand gebruiken; anders het verschil melden en laten kiezen
    const P = SCHIP.actief, bp = b.polar;
    const anders = P && (P.schip.id !== bp.schip.id || P.versie !== bp.versie);
    if (!P) SCHIP.laad(bp, 'uit het rekenbestand');
    meld('editie'); meld('invoer'); meld('wind');
    r.uitkomst.bronPolar = bp;
    meld('rekenbestand', r.uitkomst);

    const keuze = $('uitvoerkeuze');
    keuze.replaceChildren();
    if (anders) {
      waarschuwing.push(P.schip.id !== bp.schip.id
        ? `Deze berekening is gemaakt met een ander schip (${polarLabel(bp)}); nu actief: ${polarLabel(P)}.`
        : `Deze berekening is gemaakt met versie ${bp.versie}, nu actief: versie ${P.versie}.`);
      keuze.append(el('div', { class: 'rij' },
        el('button', { type: 'button', class: 'knop', onclick: () => { keuze.replaceChildren(); meld('bereken'); toonTab('advies'); } }, `Opnieuw rekenen met ${polarLabel(P)}`),
        el('button', { type: 'button', class: 'knop stil', onclick: () => { SCHIP.laad(bp, 'uit het rekenbestand'); keuze.replaceChildren(); } }, 'Polar uit het rekenbestand actief maken')));
    }
    melding('uitvoermelding', waarschuwing.length ? 'let' : 'ok',
      `Rekenbestand “${bestandsnaam}” ingeladen: berekening van ${dagEnTijd(Date.parse(b.berekend))} met ${polarLabel(bp)}. ` + waarschuwing.join(' '));
  }
})();
