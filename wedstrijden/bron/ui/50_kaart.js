// Minimale pagina (bouwstap 1): edities en banen op de kaart, als controle van bouwscript en bronbestanden.
(function () {
  const G = JSON.parse(document.getElementById('gegevens').textContent);
  const $ = id => document.getElementById(id);
  const kleur = { start: '#2a9d4b', finish: '#b42318', via: '#0b4f8a', merkteken: '#e8831e' };

  $('toolversie').textContent = `versie ${TOOL.versie} · ${TOOL.datum}`;
  const vg = G.vaargebied;
  $('versies').textContent = `Vaargebied ${vg.naam}: versie ${vg.versie} van ${vg.datum}. Gebouwd met ${G.bouw.edities.length} edities.`;

  const kaart = L.map('kaart', { zoomSnap: 0.5 }).fitBounds([[52.66, 5.12], [52.88, 5.52]]);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 16, attribution: 'Esri, HERE, Garmin, © OpenStreetMap'
  }).addTo(kaart);
  const laag = L.layerGroup().addTo(kaart);

  const edities = G.edities.slice().sort((a, b) => b.jaar - a.jaar);
  $('editiekeuze').replaceChildren(...edities.map((e, i) => new Option(`${e.wedstrijd.naam} ${e.jaar} (editie v${e.versie})`, i)));

  function toon() {
    const e = edities[+$('editiekeuze').value];
    const vorigeBaan = $('baankeuze').value;
    $('baankeuze').replaceChildren(...Object.entries(e.banen).map(([k, b]) => new Option(b.naam, k)));
    $('baankeuze').value = e.banen[vorigeBaan] ? vorigeBaan : e.standaard.baan;
    const st = $('editiestatus');
    st.textContent = e.status.gecontroleerd ? `gecontroleerd tegen ${e.status.tegen} (${e.status.datum_bepalingen})` : 'nog niet gecontroleerd tegen de wedstrijdbepalingen';
    st.className = 'chip' + (e.status.gecontroleerd ? '' : ' let');
    tekenBaan(e);
  }

  function tekenBaan(e) {
    laag.clearLayers();
    const pt = Object.fromEntries(e.punten.map(p => [p.id, p]));
    for (const z of e.zones) L.polygon(z.punten.map(p => [p.lat, p.lon]), {
      color: '#b42318', weight: 1.5, dashArray: z.actief ? null : '4 4', fillOpacity: z.actief ? 0.15 : 0
    }).bindTooltip(`${z.naam}${z.actief ? '' : ' (niet actief)'}`).addTo(laag);
    const baan = e.banen[$('baankeuze').value];
    const kleuren = ['#0b4f8a', '#e8831e', '#2a9d4b', '#8338ec', '#b42318', '#2ec4b6'];
    baan.routes.forEach((r, i) => L.polyline(r.volgorde.map(leesStap).map(s => [pt[s.punt].lat, pt[s.punt].lon]), {
      color: kleuren[i % kleuren.length], weight: 2.5, opacity: 0.8
    }).bindTooltip(r.naam, { sticky: true }).addTo(laag));
    for (const p of e.punten) L.circleMarker([p.lat, p.lon], { radius: 5, color: '#fff', weight: 1.5, fillColor: kleur[p.soort], fillOpacity: 1 })
      .bindPopup(`<b>${p.id}</b>${p.rws ? ` (RWS ${p.rws})` : ''}<br>${p.toelichting || ''}`)
      .bindTooltip(p.id, { permanent: true, direction: 'right', className: 'punt-label', offset: [6, 0] }).addTo(laag);
    $('routelijst').replaceChildren(...baan.routes.map(r => {
      const li = document.createElement('li');
      li.innerHTML = `<b>${r.naam}</b><br><span class="volg">${r.volgorde.join(' → ')}</span>`;
      return li;
    }));
  }

  $('editiekeuze').onchange = toon;
  $('baankeuze').onchange = () => tekenBaan(edities[+$('editiekeuze').value]);
  toon();
})();
