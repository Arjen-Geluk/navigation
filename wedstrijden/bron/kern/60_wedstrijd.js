// Wedstrijd doorrekenen: alle routes van een baan, met robuustheid.

// lokale kloktijd (bijv. Europe/Amsterdam) → ms sinds 1970 (UTC), ook rond de zomertijdwissel
function lokaleTijdNaarMs(datum, hhmm, tz = 'Europe/Amsterdam') {
  const [y, mo, d] = datum.split('-').map(Number), [h, mi] = hhmm.split(':').map(Number);
  let gok = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(gok)).map(x => [x.type, x.value]));
    gok += Date.UTC(y, mo - 1, d, h, mi) - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  }
  return gok;
}

// routepunten van een route uit de editie (met eventuele afwijkingen van de schipper al verwerkt in editie.punten)
function routePunten(editie, route) {
  const pt = Object.fromEntries(editie.punten.map(p => [p.id, p]));
  return route.volgorde.map(leesStap).map(s => ({ id: s.punt, lat: pt[s.punt].lat, lon: pt[s.punt].lon, zijde: s.zijde,
    ...(pt[s.punt].lijn ? { lijn: pt[s.punt].lijn.map(q => ({ lat: q.lat, lon: q.lon })) } : {}) }));
}

// Rekent alle routes van één baan, plus (optioneel) de zes windafwijkingen.
// Geeft { baan, routes: [{ naam, res, varianten: { id: zeiltijd_ms }, snelst_in }], snelste }
function rekenBaan(V, W, P, editie, baanId, opties = {}) {
  const baan = editie.banen[baanId];
  const start = opties.startMs ?? lokaleTijdNaarMs(editie.datum, editie.start, editie.tijdzone);
  const routes = baan.routes.map(r => {
    const punten = routePunten(editie, r);
    return { naam: r.naam, punten, res: vaarRoute(V, W, P, punten, start, opties), varianten: {}, snelst_in: 0 };
  });
  if (opties.robuustheid !== false) {
    for (const v of WINDVARIANTEN) {
      let best = null;
      for (const r of routes) {
        const slag = r.res.slag_auto ? { max_slag_nm: r.res.max_slag_nm ?? Infinity } : {};
        const x = vaarRoute(V, W, P, r.punten, start, { ...opties, ...slag, variant: v, track: false });
        r.varianten[v.id] = x.klaar ? x.zeiltijd_ms : null;
        if (x.klaar && (!best || x.zeiltijd_ms < best.varianten[v.id])) best = r;
      }
      if (best) best.snelst_in++;
    }
  }
  routes.sort((a, b) => (a.res.klaar ? a.res.zeiltijd_ms : Infinity) - (b.res.klaar ? b.res.zeiltijd_ms : Infinity));
  return { baan: baanId, naam: baan.naam, start, routes, snelste: routes[0] && routes[0].res.klaar ? routes[0] : null };
}
