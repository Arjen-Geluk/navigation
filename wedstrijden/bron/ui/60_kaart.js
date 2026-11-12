// Tabblad 5 Kaart: ondergrond, vaargebied (diepte, bevaarbaarheid, betonning, verboden gebieden), wedstrijd, wind; tijdschuif.
(function () {
  let kaart = null, tijd = null;
  const lagen = {};             // naam → Leaflet-laag
  const ONDERGRONDEN = {
    vast: { naam: 'Vast (IENC, ingebakken, ook offline)' },
    topo: { naam: 'Topografisch', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', attr: 'Esri, HERE, Garmin, © OpenStreetMap' },
    foto: { naam: 'Luchtfoto', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Esri, Maxar, Earthstar Geographics' }
  };
  // kleur per zeilstand (namen uit het polarbestand), plus kruisen
  const STAND_KLEUR = { 'kruisen': '#e0245e', 'aan de wind': '#f08a1c', 'knik in de schoot': '#d4b106', 'halve wind': '#1f9e89', 'ruime wind': '#2f6fd6', 'voor de wind': '#7b3fc4' };
  const standKleur = s => STAND_KLEUR[s] || '#555';
  // Route op de kaart: na een verschuiving van de windverandering direct opnieuw nagevaren (alleen de gekozen route)
  let kaartRoute = null;
  const toonRoute = () => kaartRoute || gekozenRoute();
  op('uitkomst', () => { kaartRoute = null; });
  op('selectie', () => { kaartRoute = null; });
  const LAGEN = [
    ['Vaargebied', [['bodem', 'Diepte bij het peil'], ['bevaarbaar', 'Bevaarbaar voor dit schip'], ['betonning', 'Betonning'], ['zones', 'Verboden gebieden']]],
    ['Wedstrijd', [['route', 'Gekozen route'], ['andere', 'Boeien van de andere banen']]],
    ['Wind', [['wind', 'Wind volgens de tijdschuif']]]
  ];

  function maak() {
    if (kaart) return;
    kaart = L.map('kaart', { zoomSnap: 0.5, preferCanvas: true }).fitBounds([[52.66, 5.10], [52.88, 5.50]]);
    kaart.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    kaart.createPane('kust'); kaart.getPane('kust').style.zIndex = 450;   // boven de diepte- en bevaarbaarheidslagen (overlaypane 400)
    kaart.on('click', klik);
    bouwMenu();
    teken();
  }

  // ---- lagenmenu (onthoudt de keuzes) ----
  function bouwMenu() {
    const m = $('lagenmenu');
    m.replaceChildren(
      el('h4', {}, 'Ondergrond'),
      ...Object.entries(ONDERGRONDEN).map(([k, o]) => el('label', { class: 'vink' }, el('input', { type: 'radio', name: 'ondergrond', value: k, checked: S.kaart.ondergrond === k,
        onchange: () => { S.kaart.ondergrond = k; bewaar(); tekenOndergrond(); } }), ' ' + o.naam)),
      ...LAGEN.flatMap(([kop, l]) => [el('h4', {}, kop), ...l.map(([k, naam]) => el('label', { class: 'vink' }, el('input', { type: 'checkbox', checked: S.kaart.lagen[k],
        onchange: e => { S.kaart.lagen[k] = e.target.checked; bewaar(); teken(); } }), ' ' + naam))]),
      el('div', { id: 'legenda', class: 'legenda' }));
    $('lagenOpen').onclick = () => { m.hidden = !m.hidden; $('lagenOpen').setAttribute('aria-expanded', !m.hidden); };
  }

  // ---- rasters uit de bodem ----
  // vloeiende kleurschaal voor de waterdiepte (m): tussen de ankerpunten lineair gemengd
  const DIEPTE_SCHAAL = [[0, [190, 40, 45]], [1, [225, 110, 50]], [1.75, [240, 190, 80]], [2.5, [205, 225, 160]], [3.25, [160, 210, 225]], [4.5, [95, 160, 215]], [6, [50, 105, 180]], [9, [25, 60, 130]]];
  function diepteKleur(d) {
    const s = DIEPTE_SCHAAL; if (d <= s[0][0]) return s[0][1]; if (d >= s[s.length - 1][0]) return s[s.length - 1][1];
    let i = 1; while (s[i][0] < d) i++;
    const [d0, k0] = s[i - 1], [d1, k1] = s[i], f = (d - d0) / (d1 - d0);
    return k0.map((c, j) => Math.round(c + (k1[j] - c) * f));
  }
  function rasterLaag(kleur) {
    const B = BODEM, c = document.createElement('canvas'); c.width = B.nx; c.height = B.ny;
    const ctx = c.getContext('2d'), img = ctx.createImageData(B.nx, B.ny), d = img.data;
    for (let k = 0; k < B.codes.length; k++) {
      const rgba = kleur(B.codes[k]); if (!rgba) continue;
      d[4 * k] = rgba[0]; d[4 * k + 1] = rgba[1]; d[4 * k + 2] = rgba[2]; d[4 * k + 3] = rgba[3] ?? 255;
    }
    ctx.putImageData(img, 0, 0);
    return L.imageOverlay(c.toDataURL(), [[B.noord - B.ny * B.dlat, B.west], [B.noord, B.west + B.nx * B.dlon]], { className: 'raster', interactive: false });
  }
  const LAND = [233, 230, 222], WATER = [196, 220, 238];
  // vaste ondergrond (land en water uit de IENC): één keer uitpakken en als canvas bewaren
  let top10 = null;
  const top10Klaar = (async () => {
    const b64 = $('ondergrond').textContent.trim(), r = G.watermasker && G.watermasker.raster;
    if (!b64 || !r) return null;
    const gz = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const bits = new Uint8Array(await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    const c = document.createElement('canvas'); c.width = r.nx; c.height = r.ny;
    const ctx = c.getContext('2d'), img = ctx.createImageData(r.nx, r.ny), d = img.data, rij = Math.ceil(r.nx / 8);
    for (let j = 0; j < r.ny; j++) for (let i = 0; i < r.nx; i++) {
      const k = 4 * (j * r.nx + i), w = bits[j * rij + (i >> 3)] & (0x80 >> (i & 7));
      d.set(w ? WATER : LAND, k); d[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // de kustlijn (overgang land/water) als eigen laag, die boven de diepte en bevaarbaarheid blijft liggen
    top10 = { url: c.toDataURL(), kust: kustUrl(r.nx, r.ny, (i, j) => (bits[j * rij + (i >> 3)] & (0x80 >> (i & 7))) !== 0), grenzen: [[r.noord - r.ny * r.dlat, r.west], [r.noord, r.west + r.nx * r.dlon]] };
    return top10;
  })();
  // kustlijn als transparant beeld: alleen de pixels op de overgang land/water, in donkere lijn
  function kustUrl(nx, ny, isWater) {
    const kc = document.createElement('canvas'); kc.width = nx; kc.height = ny;
    const kctx = kc.getContext('2d'), kimg = kctx.createImageData(nx, ny), kd = kimg.data;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const w = isWater(i, j), k = 4 * (j * nx + i);
      if (w === null) continue;   // geen gegevens: geen lijn
      const anders = (a, b) => { const v = isWater(a, b); return v !== null && v !== w; };
      const rand = (i > 0 && anders(i - 1, j)) || (i < nx - 1 && anders(i + 1, j)) || (j > 0 && anders(i, j - 1)) || (j < ny - 1 && anders(i, j + 1));
      if (rand) { kd[k] = 30; kd[k + 1] = 40; kd[k + 2] = 55; kd[k + 3] = 110; }
    }
    kctx.putImageData(kimg, 0, 0);
    return kc.toDataURL();
  }
  function uitsnedeLaag(u) {
    const c = document.createElement('canvas'); c.width = u.nx; c.height = u.ny;
    const ctx = c.getContext('2d'), img = ctx.createImageData(u.nx, u.ny), d = img.data;
    for (let k = 0; k < u.nx * u.ny; k++) { const v = u.water[k]; if (v === 2) continue; d.set(v ? WATER : LAND, 4 * k); d[4 * k + 3] = 255; }   // 2 = buiten de cirkel: transparant
    ctx.putImageData(img, 0, 0);
    return L.imageOverlay(c.toDataURL(), [[u.noord - u.ny * u.dlat, u.west], [u.noord, u.west + u.nx * u.dlon]], { interactive: false });
  }
  // de kustlijn van de havenuitsneden (10 m), op dezelfde manier boven de diepte en bevaarbaarheid
  function uitsnedeKust(u) {
    return L.imageOverlay(kustUrl(u.nx, u.ny, (i, j) => { const v = u.water[j * u.nx + i]; return v === 2 ? null : v === 1; }), [[u.noord - u.ny * u.dlat, u.west], [u.noord, u.west + u.nx * u.dlon]], { pane: 'kust', interactive: false });
  }
  function vastRaster() {
    if (!top10) return rasterLaag(c => c === 255 ? LAND : c === 254 ? [226, 190, 214] : WATER);   // terugval: bodemraster
    const g = L.layerGroup([L.imageOverlay(top10.url, top10.grenzen, { interactive: false, className: 'vloeiend' })]);
    for (const u of (BODEM && BODEM.uitsneden) || []) g.addLayer(uitsnedeLaag(u));
    return g;
  }
  top10Klaar.then(() => { if (kaart && S.kaart.ondergrond === 'vast') tekenOndergrond(); });
  const verbodenRaster = () => rasterLaag(c => c === 254 ? [180, 40, 120, 150] : null);
  const diepteRaster = () => { const p = peil(); return rasterLaag(c => { if (c > 250) return null; const d = p - (c / 10 - 25); return [...diepteKleur(d), 210]; }); };
  function bevaarRaster() {
    const P = SCHIP.actief; if (!P) return null;
    const p = peil(), ks = rekenOpties().kielspeling, dg = P.schip.diepgang_m, half = Number.isFinite(dg.half) ? dg.half : dg.neer;
    return rasterLaag(c => {
      if (c > 250) return null;
      const d = p - (c / 10 - 25) - ks;
      return d >= dg.neer ? null : d >= half ? [240, 200, 60, 150] : d >= dg.op ? [235, 130, 40, 170] : [200, 40, 40, 190];
    });
  }

  function tekenOndergrond() {
    if (lagen.ondergrond) { kaart.removeLayer(lagen.ondergrond); lagen.ondergrond = null; }
    const o = ONDERGRONDEN[S.kaart.ondergrond];
    if (o.url) lagen.ondergrond = L.tileLayer(o.url, { maxZoom: 17, attribution: o.attr }).on('tileerror', () => { $('kaartinfo').textContent = 'De online ondergrond antwoordt niet; kies Vast.'; });
    else if (S.kaart.ondergrond === 'vast' && BODEM) lagen.ondergrond = vastRaster();
    if (lagen.ondergrond) { lagen.ondergrond.addTo(kaart); if (lagen.ondergrond.bringToBack) lagen.ondergrond.bringToBack(); else { const ls = lagen.ondergrond.getLayers(); [...ls.slice(1), ls[0]].forEach(l => l.bringToBack()); } }   // uitsneden boven de grote ondergrond
    if (lagen.kust) { kaart.removeLayer(lagen.kust); lagen.kust = null; }
    if (S.kaart.ondergrond === 'vast' && top10) {
      lagen.kust = L.layerGroup([L.imageOverlay(top10.kust, top10.grenzen, { pane: 'kust', interactive: false }), ...((BODEM && BODEM.uitsneden) || []).map(uitsnedeKust)]).addTo(kaart);
    }
  }

  // ---- alle lagen opnieuw tekenen ----
  let rasterSleutel = '';
  function teken() {
    if (!kaart) return;
    tekenOndergrond();
    // rasters alleen opnieuw als peil, schip of keuze veranderd is (het tekenen kost even)
    const P = SCHIP.actief, sl = [S.kaart.lagen.bodem, S.kaart.lagen.bevaarbaar, peil(), P && P.schip.id + P.versie, P && rekenOpties().kielspeling, !!BODEM].join('|');
    if (sl !== rasterSleutel) {
      for (const k of ['bodem', 'bevaarbaar']) if (lagen[k]) { kaart.removeLayer(lagen[k]); lagen[k] = null; }
      if (BODEM && S.kaart.lagen.bodem) lagen.bodem = diepteRaster()?.addTo(kaart);
      if (BODEM && S.kaart.lagen.bevaarbaar) lagen.bevaarbaar = bevaarRaster()?.addTo(kaart);
      rasterSleutel = sl;
    }
    for (const k of ['betonning', 'zones', 'route', 'wind']) if (lagen[k]) { kaart.removeLayer(lagen[k]); lagen[k] = null; }
    if (S.kaart.lagen.betonning && G.betonning) lagen.betonning = betonningLaag().addTo(kaart);
    if (lagen.verbodenRaster) { kaart.removeLayer(lagen.verbodenRaster); lagen.verbodenRaster = null; }
    if (S.kaart.lagen.zones && BODEM) lagen.verbodenRaster = verbodenRaster().addTo(kaart);
    if (S.kaart.lagen.zones) lagen.zones = zonesLaag().addTo(kaart);
    lagen.boot = null;
    if (S.kaart.lagen.route) lagen.route = routeLaag().addTo(kaart);
    if (S.kaart.lagen.wind) lagen.wind = L.layerGroup().addTo(kaart);
    legenda();
    tijdschuif();
    kaartBalk();
  }

  const KLEUREN = { Rood: '#d22', Groen: '#1a8a3a', Geel: '#e8c21a', Zwart: '#222', Wit: '#fff', Oranje: '#f08a1c' };
  function betonningLaag() {
    const g = L.layerGroup(), r = L.canvas({ padding: 0.2 });
    for (const [naam, lat, lon, kleur, vorm, licht] of G.betonning.rijen) {
      const k = KLEUREN[(kleur || '').split(/[\s/-]/)[0]] || '#777';
      L.circleMarker([lat, lon], { renderer: r, radius: 3.5, weight: 1, color: '#333', fillColor: k, fillOpacity: 1 })
        .bindTooltip(`${naam}${vorm ? ' · ' + vorm : ''}${kleur ? ' · ' + kleur : ''}${licht ? ' · ' + licht : ''}`).addTo(g);
    }
    return g;
  }
  function zonesLaag() {
    const g = L.layerGroup();
    for (const z of huidigeEditie().zones) L.polygon(z.punten.map(p => [p.lat, p.lon]), { color: '#b42318', weight: 1.5, dashArray: z.actief ? null : '4 4', fillOpacity: z.actief ? 0.15 : 0 })
      .bindTooltip(`${z.naam}${z.actief ? '' : ' (niet actief)'}`).addTo(g);
    return g;
  }
  // Kromme pijl om een merkteken: de kant en de draairichting (bb = linksom, sb = rechtsom). Bij ronden loopt de boog
  // van aanloop naar vertrek; bij passeren een korte boog aan de kant waar de boot langs gaat.
  function rondPijl(x) {
    const s = x.zijde === 'bb' ? -1 : 1, R = 18, c = 28;
    let van, boog;
    if (x.wijze === 'ronden') { van = x.aanloop - s * 90; boog = Math.max(60, Math.abs(x.draai_graden)); }
    else { van = x.aanloop + x.draai_graden / 2 - s * 90 - s * 35; boog = 70; }
    const pt = b => [c + R * Math.sin(b * Math.PI / 180), c - R * Math.cos(b * Math.PI / 180)].map(v => v.toFixed(1));
    const [x1, y1] = pt(van), [x2, y2] = pt(van + s * boog), eind = van + s * boog;
    // pijlpunt: twee korte lijnen terug langs de raaklijn
    const raak = eind + s * 90, punt = d => [(+x2 - 7 * Math.sin((raak + d) * Math.PI / 180)).toFixed(1), (+y2 + 7 * Math.cos((raak + d) * Math.PI / 180)).toFixed(1)];
    const [a1, b1] = punt(30), [a2, b2] = punt(-30), kleur = x.zijde === 'bb' ? '#c0262d' : '#1c7c3a';
    return `<svg width="56" height="56" viewBox="0 0 56 56"><title>${x.id}: ${x.zijde === 'bb' ? 'aan bakboord, linksom' : 'aan stuurboord, rechtsom'} (${x.wijze})</title>`
      + `<path d="M${x1} ${y1} A${R} ${R} 0 ${boog > 180 ? 1 : 0} ${s > 0 ? 1 : 0} ${x2} ${y2} M${a1} ${b1} L${x2} ${y2} L${a2} ${b2}" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<path d="M${x1} ${y1} A${R} ${R} 0 ${boog > 180 ? 1 : 0} ${s > 0 ? 1 : 0} ${x2} ${y2} M${a1} ${b1} L${x2} ${y2} L${a2} ${b2}" fill="none" stroke="${kleur}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function routeLaag() {
    const g = L.layerGroup(), E = huidigeEditie(), r = toonRoute();
    const inRoute = new Set(r ? r.punten.map(p => p.id) : E.banen[S.selectie.baan || invoer().baanWL || E.standaard.baan].routes.flatMap(x => x.volgorde.map(s => leesStap(s).punt)));
    const ronding = {};
    if (r) {
      // track in stukken per zeilstand
      const t = r.res.track;
      let stuk = [t[0]], stand = t[1] && t[1].stand;
      for (let i = 1; i < t.length; i++) {
        stuk.push(t[i]);
        const volgende = t[i + 1] && t[i + 1].stand;
        if (volgende !== stand || i === t.length - 1) {
          L.polyline(stuk.map(p => [p.lat, p.lon]), { color: standKleur(stand), weight: 4, opacity: 0.9 }).bindTooltip(stand || '', { sticky: true }).addTo(g);
          stuk = [t[i]]; stand = volgende;
        }
      }
      r.res.rakken.forEach(k => { ronding[k.naar] = k.eind; });
      for (const x of (r.res.rondingen || []).filter(x => x.wijze !== 'om de zone' && x.lat != null && x.lon != null)) L.marker([x.lat, x.lon], { interactive: false, icon: L.divIcon({ className: 'rondpijl', iconSize: [56, 56], html: rondPijl(x) }) }).addTo(g);
    } else {
      const baan = E.banen[S.selectie.baan || invoer().baanWL || E.standaard.baan];
      const pt = Object.fromEntries(E.punten.map(p => [p.id, p]));
      baan.routes.forEach(x => L.polyline(x.volgorde.map(leesStap).filter(s => pt[s.punt]).map(s => [pt[s.punt].lat, pt[s.punt].lon]), { color: '#0b4f8a', weight: 1.5, opacity: 0.5, dashArray: '5 5' }).bindTooltip(x.naam, { sticky: true }).addTo(g));
    }
    const kleur = { start: '#2a9d4b', finish: '#b42318', via: '#0b4f8a', merkteken: '#e8831e' };
    // finishlijn (of andere lijn) tussen twee lichten
    for (const p of E.punten.filter(p => p.lijn && p.lijn.every(q => q.lat != null) && (inRoute.has(p.id) || S.kaart.lagen.andere))) {
      L.polyline(p.lijn.map(q => [q.lat, q.lon]), { color: '#b42318', weight: 3, dashArray: '8 5', opacity: 0.9 }).bindTooltip(`${p.id}: ${p.lijn.map(q => q.id).join(' – ')}`, { sticky: true }).addTo(g);
      for (const q of p.lijn) L.circleMarker([q.lat, q.lon], { radius: 3, color: '#b42318', weight: 1, fillColor: '#fff', fillOpacity: 1 }).bindTooltip(q.id + (q.rws ? ` (RWS ${q.rws})` : '')).addTo(g);
    }
    for (const p of E.punten) {
      const inR = inRoute.has(p.id);
      if (!inR && !S.kaart.lagen.andere) continue;
      L.circleMarker([p.lat, p.lon], { radius: inR ? 6 : 4, color: '#fff', weight: 1.5, fillColor: inR ? kleur[p.soort] : '#999', fillOpacity: 1 })
        .bindPopup(`<b>${p.id}</b>${p.rws ? ` (RWS ${p.rws})` : ''}<br>${p.toelichting || ''}`)
        .bindTooltip(p.id + (ronding[p.id] ? ' ' + kloktijd(ronding[p.id]) : ''), { permanent: inR, direction: 'right', className: 'punt-label', offset: [6, 0] }).addTo(g);
    }
    if (r) lagen.boot = L.circleMarker([r.res.track[0].lat, r.res.track[0].lon], { radius: 7, color: '#0b2545', weight: 2, fillColor: '#ffd23f', fillOpacity: 1 }).addTo(g);
    return g;
  }

  // ---- tijdschuif: boot op de berekende positie, wind op dat moment ----
  function tijdschuif() {
    const r = toonRoute(), vak = $('tijdschuif'), s = $('schuif');
    const van = r ? r.res.start : startMs(), tot = r ? r.res.finish : limietMs();
    vak.hidden = !(r || S.kaart.lagen.wind);
    if (tijd == null || tijd < van || tijd > tot) tijd = van;
    s.min = van; s.max = tot; s.step = 60000; s.value = tijd;
    s.oninput = () => { tijd = +s.value; zetTijd(); };
    zetTijd();
  }
  function zetTijd() {
    const r = toonRoute();
    let tekst = kloktijd(tijd);
    if (r && lagen.boot) {
      const t = r.res.track; let i = t.findIndex(p => p.t >= tijd); if (i < 0) i = t.length - 1;
      const p = t[i]; lagen.boot.setLatLng([p.lat, p.lon]);
      if (p.koers != null) tekst += ` · koers ${koersTekst(p.koers)} · ${getal(p.vaart)} kn · ${p.stand}, zwaard ${p.zwaard} · wind ${getal(p.tws, 0)} kn`;
    }
    $('schuiftijd').textContent = tekst;
    if (lagen.wind) tekenWind();
  }
  function tekenWind() {
    lagen.wind.clearLayers();
    const W = windEffectief(); if (!W) return;
    for (const p of W.punten) {
      const w = windOp(W, p.lat, p.lon, tijd), b = knNaarBft(w.kn);
      const kleur = ['#4a7ea8', '#4a7ea8', '#3b78b0', '#2f8fa8', '#3a9d6a', '#9ccc3c', '#f0c419', '#f08a1c', '#e2491d', '#b3121b', '#7a0b5b', '#4b0a59', '#2b0a3d'][b];
      L.marker([p.lat, p.lon], { interactive: false, icon: L.divIcon({ className: 'windpijl', iconSize: [34, 34],
        html: `<span style="transform:rotate(${Math.round(w.dir + 90)}deg);color:${kleur}">➜</span><b>${Math.round(w.kn)}</b>` }) }).addTo(lagen.wind);
    }
  }

  function legenda() {
    const l = $('legenda'); if (!l) return;
    const blok = (kleur, t) => el('div', {}, el('i', { style: `background:rgb(${kleur.join(',')})` }), ' ' + t);
    const delen = [];
    if (S.kaart.lagen.bodem) delen.push(el('b', {}, `Waterdiepte bij ${getal(peil(), 2)} m NAP`),
      el('div', { class: 'verloop', style: `background:linear-gradient(to right,${DIEPTE_SCHAAL.map(([d, k]) => `rgb(${k.join(',')}) ${(d / 9 * 100).toFixed(0)}%`).join(',')})` }),
      el('div', { class: 'verloopschaal' }, ...[0, 2, 4, 6, 9].map(d => el('span', { style: `left:${d / 9 * 100}%` }, d === 9 ? '9+ m' : d + ''))));
    if (S.kaart.lagen.bevaarbaar) delen.push(el('b', {}, SCHIP.actief ? 'Bevaarbaar (incl. kielspeling)' : 'Bevaarbaar: laad eerst een polar in'),
      blok([240, 200, 60], 'alleen zwaard half of op'), blok([235, 130, 40], 'alleen zwaard op (ruime koersen)'), blok([200, 40, 40], 'romp loopt vast'));
    l.replaceChildren(...delen);
    // zeilstanden onder de kaart, alleen die in de getoonde route voorkomen
    const r = toonRoute(), standen = r && S.kaart.lagen.route ? [...new Set(r.res.track.map(p => p.stand).filter(Boolean))] : [];
    $('standlegenda').replaceChildren(...standen.map(s => el('span', {}, el('i', { style: `background:${standKleur(s)}` }), ' ' + s)));
  }

  // ---- windverandering op de kaart: de gekozen route direct opnieuw navaren ----
  // Na elke windwijziging (verschuiving hier of op Wind & peil, of een aanpassing in de windtabel) de gekozen route
  // opnieuw navaren met de nieuwe wind; het advies zelf wordt pas bij Bereken vernieuwd.
  op('wind', () => {
    const r = gekozenRoute();
    kaartRoute = r && VAARWATER && SCHIP.actief && S.wind.W
      ? { ...r, res: vaarRoute(VAARWATER, windEffectief(), SCHIP.actief, r.punten, startMs(), rekenOpties()), herrekend: true } : null;
  });
  op('invoer', () => { kaartRoute = null; });
  op('polar', () => { kaartRoute = null; });
  $('kaartBereken').onclick = () => meld('bereken');
  function kaartBalk() {
    const r = gekozenRoute();
    $('kaartRouteInfo').textContent = kaartRoute && r
      ? `${r.naam}: zeiltijd ${duur(kaartRoute.res.zeiltijd_ms)}, finish ${kloktijd(kaartRoute.res.finish)} (advies: ${duur(r.res.zeiltijd_ms)}). Klik op Bereken voor een nieuw advies met alle routes.`
      : r ? `${r.naam}: zeiltijd ${duur(r.res.zeiltijd_ms)}, finish ${kloktijd(r.res.finish)}.` : '';
  }

  // ---- klik: bodem, diepte en bevaarbaarheid ----
  function klik(e) {
    if (!BODEM) return;
    const { lat, lng } = e.latlng, b = bodemOp(BODEM, lat, lng);
    let html = `<b>${lat.toFixed(5)}° N, ${lng.toFixed(5)}° O</b><br>`;
    if (inVerbodenVaargebied(BODEM, lat, lng)) html += '<b>Verboden gebied</b> (gele boeien A1, windpark of Marker Wadden).';
    else if (b == null) html += 'Geen water in het vaargebied.';
    else {
      const d = peil() - b;
      html += `Bodem ${getal(b, 1)} m NAP · diepte ${getal(d, 1)} m bij peil ${getal(peil(), 2)}`;
      const P = SCHIP.actief;
      if (P) {
        const ks = rekenOpties().kielspeling, dg = P.schip.diepgang_m;
        html += '<br>' + [['neer', dg.neer], ['half', Number.isFinite(dg.half) ? dg.half : null], ['op', dg.op]].filter(x => x[1] != null)
          .map(([n, g]) => `zwaard ${n}: ${d >= g + ks ? '✓' : '✗'}`).join(' · ');
      }
      const E = huidigeEditie(), z = E.zones.find(z => z.actief && inPolygoon(naarXY(lat, lng), z.punten.map(p => naarXY(p.lat, p.lon))));
      if (z) html += `<br><b>Verboden gebied:</b> ${z.naam}`;
    }
    L.popup().setLatLng(e.latlng).setContent(html).openOn(kaart);
  }

  op('tab', t => { if (t === 'kaart') { maak(); setTimeout(() => kaart.invalidateSize(), 0); } });
  for (const g of ['uitkomst', 'selectie', 'editie', 'polar', 'invoer', 'wind', 'bodem']) op(g, () => teken());
  op('toonOpKaart', p => { toonTab('kaart'); kaart.setView([p.lat, p.lon], 14); L.popup().setLatLng([p.lat, p.lon]).setContent(`<b>${p.id}</b>`).openOn(kaart); });
})();
