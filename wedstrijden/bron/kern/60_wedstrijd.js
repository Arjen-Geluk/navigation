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
  const lijn = l => l.map(q => ({ lat: q.lat, lon: q.lon }));
  return route.volgorde.map(leesStap).map(s => {
    if (s.punt === 'Rust') return { id: 'Rust', soort: 'rust', rust_min_uur: editie.rust_min_uur ?? 0 };
    const p = pt[s.punt];
    return { id: s.punt, lat: p.lat, lon: p.lon, zijde: s.zijde, ...(p.zone ? { zone: p.zone } : {}), ...(p.lijn ? { lijn: lijn(p.lijn) } : {}),
      ...(p.soort === 'haven' ? { soort: 'haven', verblijf_min: p.verblijf_min ?? 0 } : {}),
      ...(p.soort === 'sluis' ? { soort: 'sluis', lijnen: p.lijnen.map(lijn), schuttijd_min: p.schuttijd_min ?? 0 } : {}) };
  });
}

// Een reis met tussenstops (beurtveer): de route wordt geknipt bij elke haven, sluis en rust, en elk stuk wordt apart gevaren.
// - haven: zeilen tot de havenlijn, dan verblijf_min (telt als zeiltijd), verder vanaf het punt op de lijn;
// - sluis: zeilen tot de dichtstbijzijnde van de twee lijnen, dan schuttijd_min (telt niet), verder vanaf het midden van de andere lijn;
// - rust: wachten tot minstens rust_min_uur na aankomst, of later (opties.terug_start_ms); telt niet.
// Opties: verblijf_min en schuttijd_min overschrijven de waarden uit de editie. Zonder tussenstops = vaarRoute.
const midden = l => ({ lat: (l[0].lat + l[1].lat) / 2, lon: (l[0].lon + l[1].lon) / 2 });
function vaarReis(V, W, P, punten, startMs, opties = {}) {
  if (!punten.some(p => p.soort)) return vaarRoute(V, W, P, punten, startMs, opties);
  const res = { klaar: false, start: startMs, finish: null, zeiltijd_ms: null, klok_ms: null, aftrek_ms: 0, zeilweg_m: 0, afstand_m: 0, overstag: 0, gijp: 0,
    rakken: [], rondingen: [], track: opties.track === false ? null : [], waarschuwingen: [], onderdelen: [], max_slag_nm: null, langste_slag_m: 0 };
  let t = startMs, stuk = [punten[0]];
  const wacht = (soort, id, ms, telt) => { res.onderdelen.push({ soort, id, van: t, tot: t + ms, telt }); if (!telt) res.aftrek_ms += ms; t += ms; };
  for (let i = 1; i < punten.length; i++) {
    const p = punten[i];
    if (p.soort === 'rust') {
      const tot = Math.max(t + p.rust_min_uur * 3600e3, opties.terug_start_ms ?? 0);
      wacht('rust', 'Rust', tot - t, false);
      continue;
    }
    const stop = p.soort === 'haven' || p.soort === 'sluis' || i === punten.length - 1 || punten[i + 1].soort === 'rust';
    if (!stop) { stuk.push(p); continue; }
    let doel = p, uit = null;
    if (p.soort === 'sluis') {
      const v = stuk[stuk.length - 1], [a, b] = p.lijnen;
      const [inL, uitL] = afstandM(v, midden(a)) <= afstandM(v, midden(b)) ? [a, b] : [b, a];
      doel = { ...p, lijn: inL }; uit = midden(uitL);
    }
    stuk.push(doel);
    const x = vaarRoute(V, W, P, stuk, t, { ...opties, aftrek_ms: 0 });
    res.rakken.push(...x.rakken); res.rondingen.push(...x.rondingen);
    for (const w of x.waarschuwingen) if (!res.waarschuwingen.includes(w)) res.waarschuwingen.push(w);
    if (res.track && x.track) res.track.push(...(res.track.length ? x.track.slice(1) : x.track));
    for (const k of ['zeilweg_m', 'afstand_m', 'overstag', 'gijp']) res[k] += x[k];
    res.langste_slag_m = Math.max(res.langste_slag_m, x.langste_slag_m || 0);
    res.onderdelen.push({ soort: 'zeilen', id: `${stuk[0].id} – ${p.id}`, van: t, tot: x.klaar ? x.finish : null, telt: true });
    if (!x.klaar) return res;
    t = x.finish;
    const eind = x.track ? x.track[x.track.length - 1] : (x.rakken[x.rakken.length - 1]?.finish || doel);
    if (p.soort === 'haven') wacht('haven', p.id, (opties.verblijf_min ?? p.verblijf_min) * 60000, true);
    if (p.soort === 'sluis') {
      wacht('sluis', p.id, (opties.schuttijd_min ?? p.schuttijd_min) * 60000, false);
      if (res.track) res.track.push({ t, lat: uit.lat, lon: uit.lon, koers: null, vaart: 0, twa: null, tws: null, stand: null, zwaard: null });
    }
    stuk = [{ id: p.id, ...(uit || { lat: eind.lat, lon: eind.lon }) }];
  }
  res.klaar = true; res.finish = t; res.klok_ms = t - startMs; res.zeiltijd_ms = res.klok_ms - res.aftrek_ms;
  return res;
}

// Rekent alle routes van één baan, plus (optioneel) de zes windafwijkingen.
// Geeft { baan, routes: [{ naam, res, varianten: { id: zeiltijd_ms }, snelst_in }], snelste }
function rekenBaan(V, W, P, editie, baanId, opties = {}) {
  const baan = editie.banen[baanId];
  const start = opties.startMs ?? lokaleTijdNaarMs(editie.datum, editie.start, editie.tijdzone);
  const routes = baan.routes.map(r => {
    const punten = routePunten(editie, r);
    return { naam: r.naam, punten, res: vaarReis(V, W, P, punten, start, opties), varianten: {}, snelst_in: 0 };
  });
  if (opties.robuustheid !== false) {
    for (const v of WINDVARIANTEN) {
      let best = null;
      for (const r of routes) {
        const slag = r.res.slag_auto ? { max_slag_nm: r.res.max_slag_nm ?? Infinity } : {};
        const x = vaarReis(V, W, P, r.punten, start, { ...opties, ...slag, variant: v, track: false });
        r.varianten[v.id] = x.klaar ? x.zeiltijd_ms : null;
        if (x.klaar && (!best || x.zeiltijd_ms < best.varianten[v.id])) best = r;
      }
      if (best) best.snelst_in++;
    }
  }
  routes.sort((a, b) => (a.res.klaar ? a.res.zeiltijd_ms : Infinity) - (b.res.klaar ? b.res.zeiltijd_ms : Infinity));
  return { baan: baanId, naam: baan.naam, start, routes, snelste: routes[0] && routes[0].res.klaar ? routes[0] : null };
}
