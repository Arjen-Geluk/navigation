// Navaren: een route echt nazeilen in de tijd, door het vaargebied, met kruisen, overstag en gijp.
// Eén rekenwijze voor advies, kaart en draaiboek (ontwerp: Rekenmethode).

const NAVAAR_STANDAARD = { stap_s: 30, snelheidsfactor: 1, overstag_s: null, gijp_s: null, max_slag_nm: 3, krimper_graden: 10, max_uren: 96, track: true };

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

// punten: [{ id, lat, lon, zijde: 'bb' | 'sb' | null }]; startMs in ms (UTC).
function vaarRoute(V, W, P, punten, startMs, opties) {
  const o = { ...NAVAAR_STANDAARD, ...opties }, variant = o.variant || null;
  const neer = diepgangBij(P, 'neer'), stap = o.stap_s, eindeMs = startMs + o.max_uren * 3600e3;
  const res = { klaar: false, start: startMs, finish: null, zeiltijd_ms: null, klok_ms: null, zeilweg_m: 0, afstand_m: 0,
    overstag: 0, gijp: 0, rakken: [], track: o.track ? [] : null, waarschuwingen: [] };
  const waarschuw = t => { if (!res.waarschuwingen.includes(t)) res.waarschuwingen.push(t); };
  let pos = { lat: punten[0].lat, lon: punten[0].lon }, t = startMs, kant = 0;
  if (res.track) res.track.push({ t, lat: pos.lat, lon: pos.lon, koers: null, vaart: 0, twa: null, tws: null, stand: null, zwaard: null });

  for (let r = 1; r < punten.length; r++) {
    const A = punten[r - 1], Bp = punten[r];
    const pad = zoekPad(V, A, Bp);
    const rak = { van: A.id, naar: Bp.id, start: t, eind: null, afstand_m: afstandM(A, Bp), zeilweg_m: 0, overstag: 0, gijp: 0,
      stand_s: {}, zwaard_s: {}, wind: { u: 0, v: 0, kn: 0, n: 0 }, ondiep: {}, schatting: false, omweg: !!pad && pad.length > 2 };
    res.afstand_m += rak.afstand_m;
    if (!pad) { waarschuw(`Geen bevaarbare weg gevonden van ${A.id} naar ${Bp.id}.`); res.rakken.push(rak); return res; }
    let w = 1, slag = 0, slagStart = null, slagAfwijking = 0, slagLengte = 0;
    let vastgelopen = 0;
    while (w < pad.length) {
      const doel = pad[w], isMerk = w === pad.length - 1;
      const dist = afstandM(pos, doel);
      if (dist < (isMerk ? 20 : 60)) { if (isMerk) pos = { lat: doel.lat, lon: doel.lon }; w++; slag = 0; continue; }
      if (t > eindeMs) { waarschuw(`Berekening gestopt na ${o.max_uren} uur: de finish is niet gehaald.`); res.rakken.push(rak); return res; }

      const wind = windOp(W, pos.lat, pos.lon, t, variant), tws = wind.kn, dir = wind.dir;
      const brg = koersNaar(pos, doel), twaDirect = hoekVerschil(brg, dir), kh = kruishoekBij(P, tws);
      let koers, kruisen = false;
      if (twaDirect >= kh.twa - 0.5) { koers = brg; slag = 0; }
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
      const vaart = Math.max(MIN_VAART_KN, (polarSnelheid(P, tws, Math.max(twa, P.polair.twa_graden[0])) || 0) * o.snelheidsfactor);
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
      rak.zeilweg_m += d; res.zeilweg_m += d; if (kruisen) slagLengte += d;
      pos = nieuw; t += dt * 1000;
      if (res.track) res.track.push({ t, lat: +pos.lat.toFixed(6), lon: +pos.lon.toFixed(6), koers: Math.round(koers), vaart: +vaart.toFixed(2),
        twa: Math.round(twa), tws: +tws.toFixed(1), stand, zwaard });
    }
    // rondingszijde: bij bb rondt de boot het merkteken aan bakboord, dus draait hij naar bakboord
    if (Bp.zijde && r < punten.length - 1) {
      const volgende = zoekPad(V, Bp, punten[r + 1]);
      if (volgende) {
        // richting van aanloop en vertrek gemeten op minstens 150 m van het merkteken (kleine sprongetjes van het pad tellen niet)
        const ver = lijst => lijst.find(p => afstandM(p, Bp) > 150) || lijst[0];
        const dr = draai(koersNaar(ver(pad.slice(0, -1).reverse()), Bp), koersNaar(Bp, ver(volgende.slice(1))));
        if (Math.abs(dr) > 100 && (dr < 0) !== (Bp.zijde === 'bb')) waarschuw(`${Bp.id} ${Bp.zijde}: de route draait daar de andere kant op; controleer de rondingszijde.`);
      }
    }
    rak.eind = t;
    rak.wind = rak.wind.n ? { dir: Math.round((Math.atan2(rak.wind.u, rak.wind.v) / D2R + 360) % 360), kn: +(rak.wind.kn / rak.wind.n).toFixed(1) } : null;
    res.rakken.push(rak);
  }
  res.klaar = true; res.finish = t; res.klok_ms = t - startMs;
  res.zeiltijd_ms = res.klok_ms - (o.aftrek_ms || 0);       // rust, sluizen, havengebieden: nog niet bij de 3-stedenrace
  return res;
}
