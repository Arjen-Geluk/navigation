// Schip: polarbestand inladen (bestandskeuze of "Openen in wedstrijd" vanuit de polartool), tonen en onthouden.
const SCHIP = (function () {
  const $ = id => document.getElementById(id);
  const OPSLAG = 'wedstrijden.polar.v1';
  const VOORBEELD = '../polartool/voorbeeld/voorbeeldschip_polar_v1_2026-11-05.json';
  let actief = null;                       // uittreksel van het polarbestand (zie polarUittreksel)
  const luisteraars = [];

  const nl = (x, d = 1) => x == null || !Number.isFinite(x) ? '–' : x.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
  const datum = iso => iso ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : 'onbekend';

  function melding(soort, tekst) {
    const m = $('polarmelding');
    m.className = 'melding ' + soort; m.textContent = tekst; m.hidden = !tekst;
  }

  function toon() {
    tabStatus('schip', actief ? 'klaar' : 'let', actief ? '' : 'nog geen polar');
    const kop = $('kopPolar'), st = $('polarstatus'), det = $('polardetails');
    if (!actief) {
      kop.textContent = 'Geen polar'; kop.className = 'chip let';
      st.textContent = 'Geen polar ingeladen'; st.className = 'chip let';
      det.innerHTML = `Zonder polar rekent deze pagina niet. Maak je polar met de <a href="../polartool/">polartool</a> en stuur hem hierheen met
        <b>Openen in wedstrijd</b>, of laad het opgeslagen bestand hierboven in. Om te proberen: het
        <a href="${VOORBEELD}" download>voorbeeldbestand</a> van een verzonnen schip.`;
      return;
    }
    const s = actief.schip;
    kop.textContent = 'Polar: ' + polarLabel(actief); kop.className = 'chip';
    st.textContent = `${polarLabel(actief)} · opgeslagen ${datum(actief.gewijzigd)}`; st.className = 'chip';
    const voorbeeld = [8, 12, 16].map(w => { const b = besteKruishoek(actief, w); return `${w} kn: ${b.twa}° met ${nl(b.vaart)} kn`; }).join(' · ');
    det.innerHTML = '';
    const regels = [
      ['Kruishoek', `${s.kruishoek}°`],
      ['Diepgang', `zwaard op ${nl(s.diepgang_m.op, 2)} m · half ${s.diepgang_m.half == null ? '(niet gebruikt)' : nl(s.diepgang_m.half, 2) + ' m'} · neer ${nl(s.diepgang_m.neer, 2)} m`],
      ['Kielspeling', s.kielspeling_m == null ? 'niet ingevuld' : nl(s.kielspeling_m, 2) + ' m'],
      ['Tijdverlies', `overstag ${s.overstagverlies_s == null ? '–' : s.overstagverlies_s + ' s'} · gijp ${s.gijpverlies_s == null ? '–' : s.gijpverlies_s + ' s'}`],
      ['Kruisen (beste VMG)', voorbeeld],
      ['Bestand', `${actief.formaat}, ${actief.gemaakt_met || 'polartool'}`]
    ];
    const dl = document.createElement('dl');
    for (const [k, v] of regels) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; dl.append(dt, dd); }
    det.append(dl);
  }

  // Eén weg voor bestand én postMessage: zelfde controles, zelfde gevolg. Geeft null of de reden van weigeren.
  function laad(o, bron) {
    const fout = controleerPolar(o);
    if (fout) { melding('fout', `Polar niet ingeladen: ${fout}.`); return fout; }
    const vorig = actief;
    actief = polarUittreksel(o);
    try { localStorage.setItem(OPSLAG, JSON.stringify(actief)); } catch (e) { /* opslag niet beschikbaar: werkt gewoon zonder */ }
    let tekst = `Polar ${bron}: ${polarLabel(actief)}.`;
    if (vorig && vorig.schip.id !== actief.schip.id) tekst += ` Dit is een ander schip dan de vorige polar (${polarLabel(vorig)}).`;
    else if (vorig && vorig.versie !== actief.versie) tekst += ` Was versie ${vorig.versie}.`;
    melding('ok', tekst);
    toon();
    meld('polar', actief);
    return null;
  }

  $('polarbestand').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    let o;
    try { o = JSON.parse(await f.text()); } catch (err) { melding('fout', `“${f.name}” is geen leesbaar JSON-bestand.`); return; }
    laad(o, `ingeladen uit “${f.name}”`);
  });

  // "Openen in wedstrijd" (FORMAAT.md, protocol 1)
  window.addEventListener('message', e => {
    if (!window.opener || e.source !== window.opener) return;
    if (e.origin !== location.origin && !(e.origin === 'null' && location.origin === 'null')) return;
    if (!e.data || e.data.type !== 'polartool:polar') return;
    const antwoord = e.origin === 'null' ? '*' : e.origin;
    const o = e.data.bestand, fout = laad(o, 'ontvangen van de polartool');
    if (fout) e.source.postMessage({ type: 'polartool:geweigerd', reden: fout }, antwoord);
    else e.source.postMessage({ type: 'polartool:ontvangen', schip_id: o.schip.id, versie: o.versie }, antwoord);
  });

  // vorige polar uit deze browser
  try {
    const o = JSON.parse(localStorage.getItem(OPSLAG) || 'null');
    if (o && !controleerPolar(o)) actief = o;
  } catch (e) { /* geen of onleesbare opslag */ }
  $('polarvergeten').addEventListener('click', () => {
    actief = null;
    try { localStorage.removeItem(OPSLAG); } catch (e) { /* niets */ }
    melding('', ''); toon(); meld('polar', null);
  });
  toon();

  // "Openen in wedstrijd", tweede weg: de polartool zette de polar klaar in de browseropslag (FORMAAT.md)
  const OVERDRACHT = 'polartool:overdracht';
  let overgedragen = false;
  try {
    const ruw = localStorage.getItem(OVERDRACHT);
    if (ruw) {
      localStorage.removeItem(OVERDRACHT);
      const d = JSON.parse(ruw);
      if (d && d.bestand && Date.now() - d.tijd < 120000) {
        const fout = laad(d.bestand, 'ontvangen van de polartool');
        overgedragen = !fout;
        localStorage.setItem(OVERDRACHT + ':antwoord', JSON.stringify(fout ? { id: d.id, type: 'polartool:geweigerd', reden: fout }
          : { id: d.id, type: 'polartool:ontvangen', schip_id: d.bestand.schip.id, versie: d.bestand.versie }));
      }
    }
  } catch (e) { /* geen opslag: dan alleen postMessage */ }
  if (window.opener && !overgedragen) window.opener.postMessage({ type: 'polartool:klaar', protocol: 1 }, location.origin === 'null' ? '*' : location.origin);

  return { get actief() { return actief; }, bijWijziging: f => luisteraars.push(f) };
})();

// Instellingen per berekening (horen bij de pagina, niet in het polarbestand)
(function () {
  const s = S.schip;
  function vul() {
    const P = SCHIP.actief, p = P ? P.schip : {};
    $('kielspeling').value = s.kielspeling ?? ''; $('kielspeling').placeholder = p.kielspeling_m ?? '';
    $('metOverstag').checked = s.metOverstag; $('overstagS').value = s.overstag_s ?? ''; $('overstagS').placeholder = p.overstagverlies_s ?? '';
    $('metGijp').checked = s.metGijp; $('gijpS').value = s.gijp_s ?? ''; $('gijpS').placeholder = p.gijpverlies_s ?? '';
    $('factor').value = s.factor;
  }
  const getalOfNull = v => v === '' ? null : +v;
  $('kielspeling').onchange = () => { s.kielspeling = getalOfNull($('kielspeling').value); bewaar(); meld('invoer'); };
  $('metOverstag').onchange = () => { s.metOverstag = $('metOverstag').checked; bewaar(); meld('invoer'); };
  $('overstagS').onchange = () => { s.overstag_s = getalOfNull($('overstagS').value); bewaar(); meld('invoer'); };
  $('metGijp').onchange = () => { s.metGijp = $('metGijp').checked; bewaar(); meld('invoer'); };
  $('gijpS').onchange = () => { s.gijp_s = getalOfNull($('gijpS').value); bewaar(); meld('invoer'); };
  $('factor').onchange = () => { s.factor = Math.max(50, Math.min(150, +$('factor').value || 100)); bewaar(); vul(); meld('invoer'); };
  op('polar', vul);
  vul();
})();

// Rekeninstellingen voor de kern, uit polar en invoer
function rekenOpties() {
  const P = SCHIP.actief, s = S.schip;
  return {
    kielspeling: s.kielspeling ?? P.schip.kielspeling_m ?? 0.3,
    overstag_s: s.metOverstag ? (s.overstag_s ?? P.schip.overstagverlies_s ?? 0) : null,
    gijp_s: s.metGijp ? (s.gijp_s ?? P.schip.gijpverlies_s ?? 0) : null,
    snelheidsfactor: (s.factor || 100) / 100
  };
}
