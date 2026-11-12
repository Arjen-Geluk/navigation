// Navaren: een route echt nazeilen in de tijd, door het vaargebied, met kruisen, overstag en gijp.
// Eén rekenwijze voor advies, kaart en draaiboek (ontwerp: Rekenmethode).

const NAVAAR_STANDAARD = { stap_s: 30, snelheidsfactor: 1, overstag_s: null, gijp_s: null, max_slag_nm: 3, krimper_graden: 10, max_uren: 96, track: true, ronding_m: 30 };

// zeilstand bij een ware windhoek, uit de zeilstanden van het polarbestand
function zeilstandBij(P, twa) {
  const z = P.polair.zeilstanden || [];
  const s = z.find(x => twa <= x.tot_graden + 1e-9);
  return s ? s.naam : (z.length ? z[z.length - 1].naam : '');
}
// kant waar de wind vandaan komt t.o.v. de koers: +1 = stuurboord, −1 = bakboord
const windKant = (koers, dir) => { const d = ((dir - koers) % 360 + 540) % 360 - 180; return d >= 0 ? 1 : -1; };
// draairichting van c1 naar c2: − = naar bakboord, + = naar stuurboord
const draai = (c1, c2) => ((c2 - c1) % 360 + 540) % 360 - 180;

// beste kruishoek per 0,25 kn wind, eenmalig per polar
function kruistabel(P) {
  if (P._kruis) return P._kruis;
  const t = [];
  for (let i = 0; i <= 200; i++) t.push(besteKruishoek(P, i / 4));
  Object.defineProperty(P, '_kruis', { value: t, enumerable: false });
  return t;
}
const kruishoekBij = (P, tws) => kruistabel(P)[Math.max(0, Math.min(200, Math.round(tws * 4)))];

// Ronden van een merkteken op afstand R aan de voorgeschreven kant: bb = merkteken aan bakboord, de boot draait linksom;
// sb = aan stuurboord, rechtsom. Aanloop- en vertrekrichting komen uit de paden (gemeten op minstens 150 m van het merkteken).
// Draait de koers die kant op, dan rondt de boot over een boog van het instappunt (dwars op de aanloop) naar het
// uitstappunt (dwars op het vertrek). Draait de koers de andere kant op, dan passeert de boot het merkteken op afstand R
// aan de voorgeschreven kant, zonder lus (besluit tijdens de bouw: passeren, nooit een lus).
// Convexe romp (monotone keten), tegen de klok in, in XY.
function convexRomp(pts) {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y), kruis = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && kruis(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (hi.length >= 2 && kruis(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}
// Ronden van een verboden zone aan de voorgeschreven kant: de kortste weg van het instappunt E naar het uitstappunt X,
// met de zone aan die kant (sb = rechtsom om de zone, bb = linksom), op de rand van de zone plus de marge.
// Geeft de punten van de weg (E niet, X wel), of null als er geen weg is.
function rondingOmZone(zone, zijde, E, X, M) {
  const H = convexRomp(zone.xy), n0 = H.length, marge = zone.marge;
  const P = [];                                                          // rand plus marge, per zijde van de romp
  for (let i = 0; i < n0; i++) {
    const a = H[i], b = H[(i + 1) % n0], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = (b.y - a.y) / l * marge, ny = -(b.x - a.x) / l * marge;   // buitenkant van de zijde (romp tegen de klok)
    const k = Math.max(1, Math.ceil(l / 20));
    for (let j = 0; j < k; j++) P.push({ x: a.x + (b.x - a.x) * j / k + nx, y: a.y + (b.y - a.y) * j / k + ny });
  }
  const N = P.length, S = [0];
  for (let i = 1; i < N; i++) S.push(S[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y));
  const L = S[N - 1] + Math.hypot(P[0].x - P[N - 1].x, P[0].y - P[N - 1].y);
  const xE = naarXY(E.lat, E.lon), xX = naarXY(X.lat, X.lon);
  const c = { x: H.reduce((q, p) => q + p.x, 0) / n0, y: H.reduce((q, p) => q + p.y, 0) / n0 };
  const vrij = (p, q) => { for (let j = 1; j < 30; j++) { const t = j / 30; if (inPolygoon({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }, P)) return false; } return true; };
  const d = zijde === 'bb' ? 1 : -1;                                     // sb: rechtsom = dalende index in een romp tegen de klok
  const cruis = (a, b) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);   // < 0: de zone ligt rechts van a→b
  if (vrij(xE, xX) && (zijde === 'bb' ? cruis(xE, xX) > 0 : cruis(xE, xX) < 0))
    return [{ lat: X.lat, lon: X.lon, ronding: false }];
  const loop = (i, j) => d > 0 ? (S[j] - S[i] + L) % L : (S[i] - S[j] + L) % L;
  // noordkardinaal: de weg passeert de zone aan de noordkant van het merkteken (het punt 300 m ten noorden ervan)
  let kN = 0;
  if (M) {
    const mxy = naarXY(M.lat, M.lon), nw = { x: mxy.x, y: mxy.y + 300 };
    for (let k = 1; k < N; k++) if (Math.hypot(P[k].x - nw.x, P[k].y - nw.y) < Math.hypot(P[kN].x - nw.x, P[kN].y - nw.y)) kN = k;
  }
  let beste = null;
  for (let i = 0; i < N; i++) {
    if (!vrij(xE, P[i])) continue;
    const eI = Math.hypot(P[i].x - xE.x, P[i].y - xE.y);
    for (let j = 0; j < N; j++) {
      if (!vrij(P[j], xX)) continue;
      if (M && loop(i, kN) > loop(i, j) + 1e-6) continue;   // de weg moet langs de noordkant
      const tot = eI + loop(i, j) + Math.hypot(xX.x - P[j].x, xX.y - P[j].y);
      if (!beste || tot < beste.tot) beste = { tot, i, j };
    }
  }
  if (!beste) return null;
  const pts = [];
  for (let k = beste.i, teller = 0; ; k = (k + d + N) % N, teller++) {
    pts.push(P[k]);
    if (k === beste.j || teller > N) break;
  }
  const naarLL = p => ({ lat: LAT0 + p.y / M_LAT, lon: LON0 + p.x / M_LON, ronding: true });
  return [...pts.map(naarLL), { lat: X.lat, lon: X.lon, ronding: false }];
}

function rondingBij(M, zijde, padIn, padUit, R) {
  const ver = lijst => lijst.find(p => afstandM(p, M) > 150) || lijst[0];
  const aan = koersNaar(ver(padIn.slice(0, -1).reverse()), M), af = koersNaar(M, ver(padUit.slice(1)));
  const s = zijde === 'bb' ? -1 : 1;                                   // draairichting: −1 = linksom, +1 = rechtsom
  const d = draai(aan, af);                                            // koerswijziging: − = naar bakboord, + = naar stuurboord
  const ronden = s * d >= 0, boog = ronden ? Math.abs(d) : 0;
  const naast = kp => { const p = verplaats(M, (kp - s * 90 + 360) % 360, R); return { lat: p.lat, lon: p.lon }; };  // boot aan de andere kant dan het merkteken
  const punten = [];
  if (!ronden) punten.push({ ...naast(aan + d / 2), ronding: false });
  else {
    const n = Math.max(1, Math.ceil(boog / 45));
    for (let i = 0; i <= n; i++) punten.push({ ...naast(aan + s * boog * i / n), ronding: i > 0 });
  }
  return { id: M.id, zijde, lat: M.lat, lon: M.lon, aanloop: Math.round(aan), vertrek: Math.round(af),
    wijze: ronden ? 'ronden' : 'passeren', draai_graden: Math.round(d), punten };
}

// Dichtstbijzijnde punt op een lijn (finishlijn), binnen het middelste deel: minstens 10 % en 30 m van elk uiteinde
// (niet vlak langs een licht of over de kop van een dam).
function puntOpLijn(p, lijn) {
  const a = lijn[0], b = lijn[1], A = naarXY(a.lat, a.lon), B = naarXY(b.lat, b.lon), Q = naarXY(p.lat, p.lon);
  const dx = B.x - A.x, dy = B.y - A.y, l = dx * dx + dy * dy;
  const rand = l ? Math.min(0.5, Math.max(0.1, 30 / Math.sqrt(l))) : 0.5;
  const t = l ? Math.max(rand, Math.min(1 - rand, ((Q.x - A.x) * dx + (Q.y - A.y) * dy) / l)) : 0.5;
  return { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) };
}

// punten: [{ id, lat, lon, zijde: 'bb' | 'sb' | null, lijn?: [{ lat, lon }, { lat, lon }] }]; startMs in ms (UTC).
// Een punt met lijn (de finish) is gehaald zodra de boot de lijn bereikt; hij vaart naar het dichtstbijzijnde deel ervan.
// Maximale slaglengte 'auto': het model probeert deze lengtes (NM) en neemt de snelste. Slagen die nooit langer worden
// dan een keuze geven dezelfde uitkomst; die worden overgeslagen.
const SLAG_KEUZES = [1, 2, 3, 5];
function vaarRoute(V, W, P, punten, startMs, opties) {
  if (opties && opties.max_slag_nm === 'auto') {
    let best = vaarRouteVast(V, W, P, punten, startMs, { ...opties, max_slag_nm: Infinity });
    best.max_slag_nm = null;
    const langste = best.langste_slag_m;
    for (const nm of SLAG_KEUZES) {
      if (nm * NM >= langste) break;
      const x = vaarRouteVast(V, W, P, punten, startMs, { ...opties, max_slag_nm: nm });
      x.max_slag_nm = nm;
      if (x.klaar && (!best.klaar || x.zeiltijd_ms < best.zeiltijd_ms)) best = x;
    }
    best.slag_auto = true;
    return best;
  }
  const res = vaarRouteVast(V, W, P, punten, startMs, opties);
  res.max_slag_nm = Number.isFinite(res.max_slag_nm) ? res.max_slag_nm : null;
  return res;
}
function vaarRouteVast(V, W, P, punten, startMs, opties) {
  const o = { ...NAVAAR_STANDAARD, ...opties }, variant = o.variant || null;
  const neer = diepgangBij(P, 'neer'), stap = o.stap_s, eindeMs = startMs + o.max_uren * 3600e3;
  const res = { klaar: false, start: startMs, finish: null, zeiltijd_ms: null, klok_ms: null, zeilweg_m: 0, afstand_m: 0,
    overstag: 0, gijp: 0, rakken: [], rondingen: [], track: o.track ? [] : null, waarschuwingen: [], max_slag_nm: o.max_slag_nm, langste_slag_m: 0 };
  const waarschuw = t => { if (!res.waarschuwingen.includes(t)) res.waarschuwingen.push(t); };
  let pos = { lat: punten[0].lat, lon: punten[0].lon }, t = startMs, kant = 0;
  if (res.track) res.track.push({ t, lat: pos.lat, lon: pos.lon, koers: null, vaart: 0, twa: null, tws: null, stand: null, zwaard: null });

  // paden tussen de merktekens vooraf: het vertrek bij een merkteken is de aanloop van het volgende rak
  const doelVan = (Bp, van) => Bp.lijn ? { ...Bp, ...puntOpLijn(van, Bp.lijn) } : Bp;
  const paden = punten.slice(1).map((Bp, i) => zoekPad(V, punten[i], doelVan(Bp, punten[i])));
  for (let r = 1; r < punten.length; r++) {
    const A = punten[r - 1], Bp = punten[r];
    let pad = paden[r - 1];
    const rak = { van: A.id, naar: Bp.id, start: t, eind: null, afstand_m: afstandM(A, doelVan(Bp, A)), zeilweg_m: 0, overstag: 0, gijp: 0,
      stand_s: {}, zwaard_s: {}, wind: { u: 0, v: 0, kn: 0, n: 0 }, ondiep: {}, schatting: false, omweg: !!pad && pad.length > 2 };
    res.afstand_m += rak.afstand_m;
    if (Bp.lijn) rak.finish = puntOpLijn(A, Bp.lijn);
    if (!pad) { waarschuw(`Geen bevaarbare weg gevonden van ${A.id} naar ${Bp.id}.`); res.rakken.push(rak); return res; }
    // merkteken met rondingszijde (niet de finish): in plaats van het midden de boog eromheen
    const zone = Bp.zone ? V.zones.find(z => z.id === Bp.zone) : null;
    // het uitstappunt X: het eerste punt van de volgende weg dat ver genoeg van het merkteken ligt, maar niet het volgende merkteken zelf
    const xKand = zone && Bp.zijde && r < punten.length - 1 && paden[r] ? paden[r].slice(1).find(p => afstandM(p, Bp) > 150) : null;
    if (zone && Bp.zijde && r < punten.length - 1 && paden[r] && xKand) {
      // een zone met kant: de kortste weg om de zone heen, de zone aan die kant (geen boog van 30 m om het punt)
      const X = xKand;
      const E = [...pad].reverse().find(p => afstandM(p, Bp) > 150) || pad[0];
      const wag = rondingOmZone(zone, Bp.zijde, E, X, Bp);
      if (wag) {
        const iX = paden[r].indexOf(X);
        pad = [...pad.slice(0, pad.indexOf(E) + 1), ...wag];
        paden[r] = [X, ...paden[r].slice(iX + 1)];
        if (paden[r].length < 2) paden[r].push(X);   // het uitstappunt is het volgende merkteken zelf
        res.rondingen.push({ id: Bp.id, zijde: Bp.zijde, lat: Bp.lat, lon: Bp.lon, zone: zone.id, wijze: 'om de zone', punten: wag.length });
      } else waarschuw(`Geen weg om ${Bp.id} heen gevonden.`);
    } else if (Bp.zijde && r < punten.length - 1 && paden[r] && o.ronding_m > 0) {
      const rd = rondingBij(Bp, Bp.zijde, pad, paden[r], o.ronding_m);
      const { punten: _boog, ...ronding } = rd; res.rondingen.push(ronding);
      pad = [...pad.slice(0, -1), ...rd.punten];
    }
    const laatsteGewoon = pad.findIndex(p => p.ronding) < 0 ? pad.length - 1 : pad.findIndex(p => p.ronding) - 1;
    let w = 1, slag = 0, slagStart = null, slagLengte = 0;
    let vastgelopen = 0;
    while (w < pad.length) {
      const laatste = w === pad.length - 1;
      // finishlijn: het dichtstbijzijnde deel van de lijn, maar alleen als de weg ernaartoe vrij is (niet over een dam)
      const opLijn = laatste && Bp.lijn ? puntOpLijn(pos, Bp.lijn) : null;
      const doel = opLijn && vrijZicht(V, pos, opLijn) ? opLijn : pad[w], isMerk = w >= laatsteGewoon, inBoog = !!doel.ronding;
      const dist = afstandM(pos, doel);
      // een tussenpunt mag vanaf 60 m worden afgesneden, maar alleen als de weg naar het volgende punt vrij is;
      // anders vaart de boot door tot op 10 m en zet hij zich op het punt zelf
      const afsnijden = !isMerk && !inBoog && dist < 60 && vrijZicht(V, pos, pad[w + 1]);
      if (afsnijden || dist < (inBoog ? 15 : isMerk ? 20 : 10)) { if (isMerk || !afsnijden) pos = { lat: doel.lat, lon: doel.lon }; w++; slag = 0; continue; }
      if (t > eindeMs) { waarschuw(`Berekening gestopt na ${o.max_uren} uur: de finish is niet gehaald.`); res.rakken.push(rak); return res; }

      const wind = windOp(W, pos.lat, pos.lon, t, variant), tws = wind.kn, dir = wind.dir;
      const brg = koersNaar(pos, doel), twaDirect = hoekVerschil(brg, dir), kh = kruishoekBij(P, tws);
      let koers, kruisen = false;
      if (inBoog || twaDirect >= kh.twa - 0.5) { koers = brg; slag = 0; }
      else {
        kruisen = true;
        const k = s => (dir - s * kh.twa + 360) % 360;      // s = +1: wind van stuurboord
        const afw = s => hoekVerschil(k(s), brg);
        if (!slag) { slag = afw(1) <= afw(-1) ? 1 : -1; slagStart = afw(slag); slagLengte = 0; }
        // overstag bij: krimper, maximale slaglengte, te ondiep voor zwaard neer of rand van verboden gebied/land vooruit
        const vooruit = verplaats(pos, k(slag), Math.max(60, polarSnelheid(P, tws, kh.twa) * NM / 3600 * stap));
        const ondiepVooruit = !bevaarbaar(V, vooruit.lat, vooruit.lon, neer);
        const krimper = afw(slag) - slagStart > o.krimper_graden && afw(-slag) < afw(slag);
        const telang = slagLengte > o.max_slag_nm * NM;
        if ((krimper || telang || ondiepVooruit) && slagLengte > 100) {
          const ander = verplaats(pos, k(-slag), 60);
          if (!ondiepVooruit || bevaarbaar(V, ander.lat, ander.lon, neer)) { slag = -slag; slagStart = afw(slag); slagLengte = 0; }
        } else if (ondiepVooruit && slagLengte <= 100) {
          const ander = verplaats(pos, k(-slag), 60);
          if (bevaarbaar(V, ander.lat, ander.lon, neer)) { slag = -slag; slagStart = afw(slag); slagLengte = 0; }
          else if (++vastgelopen > 20) { waarschuw(`Kruisen naar ${Bp.id}: te ondiep voor zwaard neer op beide slagen; benadering.`); koers = brg; }
        }
        if (koers == null) koers = k(slag);
      }

      const twa = hoekVerschil(koers, dir);
      const vaart = Math.max(MIN_VAART_KN, (polarSnelheid(P, tws, Math.max(twa, inBoog ? kh.twa : P.polair.twa_graden[0])) || 0) * o.snelheidsfactor);
      const ms = vaart * NM / 3600;
      let d = ms * stap, dt = stap;
      if (!kruisen && d >= dist) { d = dist; dt = dist / ms; }
      const nieuw = verplaats(pos, koers, d);

      // overstag of gijp: de wind komt van de andere kant
      const nk = windKant(koers, dir);
      if (kant && nk !== kant) {
        if (twa < 90) { res.overstag++; rak.overstag++; if (o.overstag_s) t += o.overstag_s * 1000; }
        else { res.gijp++; rak.gijp++; if (o.gijp_s) t += o.gijp_s * 1000; }
      }
      kant = nk;

      const stand = kruisen ? 'kruisen' : zeilstandBij(P, twa), zwaard = zwaardBij(P, twa);
      if (!kruisen && !bevaarbaar(V, nieuw.lat, nieuw.lon, diepgangBij(P, zwaard))) rak.ondiep[zwaard] = (rak.ondiep[zwaard] || 0) + dt;
      if (isSchatting(herkomstBij(P, tws, twa))) rak.schatting = true;
      rak.stand_s[stand] = (rak.stand_s[stand] || 0) + dt;
      rak.zwaard_s[zwaard] = (rak.zwaard_s[zwaard] || 0) + dt;
      rak.wind.u += Math.sin(dir * D2R) * dt; rak.wind.v += Math.cos(dir * D2R) * dt; rak.wind.kn += tws * dt; rak.wind.n += dt;
      rak.zeilweg_m += d; res.zeilweg_m += d; if (kruisen) { slagLengte += d; if (slagLengte > res.langste_slag_m) res.langste_slag_m = slagLengte; }
      pos = nieuw; t += dt * 1000;
      if (res.track) res.track.push({ t, lat: +pos.lat.toFixed(6), lon: +pos.lon.toFixed(6), koers: Math.round(koers), vaart: +vaart.toFixed(2),
        twa: Math.round(twa), tws: +tws.toFixed(1), stand, zwaard });
    }
    rak.eind = t;
    rak.wind = rak.wind.n ? { dir: Math.round((Math.atan2(rak.wind.u, rak.wind.v) / D2R + 360) % 360), kn: +(rak.wind.kn / rak.wind.n).toFixed(1) } : null;
    res.rakken.push(rak);
  }
  res.klaar = true; res.finish = t; res.klok_ms = t - startMs;
  res.zeiltijd_ms = res.klok_ms - (o.aftrek_ms || 0);       // rust, sluizen, havengebieden: nog niet bij de 3-stedenrace
  return res;
}
