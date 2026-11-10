// Wind: windverwachting van Open-Meteo op een raster over IJsselmeer en Markermeer, en de wind op elke plek en elk moment.
// Tijden in ms sinds 1970 (UTC). Snelheid in kn op 10 m, richting in graden waar de wind vandaan komt.

// Regelmatig raster van windpunten: 9 rijen (52,32–52,96° N) × 7 kolommen (4,98–5,70° O).
const WINDRASTER = { zuid: 52.32, west: 4.98, dlat: 0.08, dlon: 0.12, nlat: 9, nlon: 7 };
function windPunten(R = WINDRASTER) {
  const p = [];
  for (let j = 0; j < R.nlat; j++) for (let i = 0; i < R.nlon; i++) p.push({ lat: +(R.zuid + j * R.dlat).toFixed(4), lon: +(R.west + i * R.dlon).toFixed(4) });
  return p;
}

const WINDMODELLEN = [
  { id: 'knmi_seamless', naam: 'KNMI HARMONIE-AROME (aanbevolen)', horizon_dagen: 2.5 },
  { id: 'dmi_seamless', naam: 'DMI HARMONIE', horizon_dagen: 2.5 },
  { id: 'icon_seamless', naam: 'DWD ICON', horizon_dagen: 7 },
  { id: 'ecmwf_ifs025', naam: 'ECMWF IFS', horizon_dagen: 15 },
  { id: 'best_match', naam: 'Best match (Open-Meteo kiest)', horizon_dagen: 16 }
];

// URL voor Open-Meteo. van/tot = 'YYYY-MM-DD'. Verleden (> 2 dagen geleden) via de historische verwachting.
function windUrl(punten, van, tot, model, historisch) {
  const basis = historisch ? 'https://historical-forecast-api.open-meteo.com/v1/forecast' : 'https://api.open-meteo.com/v1/forecast';
  return `${basis}?latitude=${punten.map(p => p.lat).join(',')}&longitude=${punten.map(p => p.lon).join(',')}`
    + `&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kn&timeformat=unixtime&timezone=GMT`
    + `&start_date=${van}&end_date=${tot}&models=${model}`;
}

// Antwoord van Open-Meteo → windobject. Gooit een fout als er geen bruikbare gegevens zijn.
function leesOpenMeteo(json, punten, model, raster = WINDRASTER) {
  if (json && json.error) throw new Error(json.reason || 'fout van Open-Meteo');
  const lijst = Array.isArray(json) ? json : [json];
  if (lijst.length !== punten.length) throw new Error('aantal windpunten klopt niet');
  const tijden = lijst[0].hourly.time.map(s => s * 1000);
  const data = lijst.map(l => tijden.map((_, k) => {
    const kn = l.hourly.wind_speed_10m[k], dir = l.hourly.wind_direction_10m[k];
    return kn == null || dir == null ? null : { dir: Math.round(dir), kn: Math.round(kn * 10) / 10, vlaag: l.hourly.wind_gusts_10m ? l.hourly.wind_gusts_10m[k] : null };
  }));
  // uren waarin geen enkel punt wind heeft vallen weg (bijv. voorbij de horizon van het model)
  const houd = tijden.map((_, k) => data.some(p => p[k])).map((ok, k) => ok ? k : -1).filter(k => k >= 0);
  if (!houd.length) throw new Error('geen windgegevens voor deze periode bij dit model');
  return vulWindGaten({ bron: 'Open-Meteo', model, raster, punten, tijden: houd.map(k => tijden[k]), data: data.map(p => houd.map(k => p[k])) });
}

// Ontbrekende waarden (null) aanvullen met het gemiddelde van de punten die op dat uur wel wind hebben.
function vulWindGaten(W) {
  for (let k = 0; k < W.tijden.length; k++) {
    const ok = W.data.map(p => p[k]).filter(Boolean);
    if (ok.length === W.data.length) continue;
    const u = ok.reduce((s, c) => s + Math.sin(c.dir * D2R), 0), v = ok.reduce((s, c) => s + Math.cos(c.dir * D2R), 0);
    const g = { dir: Math.round((Math.atan2(u, v) / D2R + 360) % 360), kn: ok.reduce((s, c) => s + c.kn, 0) / ok.length, vlaag: null };
    W.data.forEach(p => { if (!p[k]) p[k] = g; });
  }
  return W;
}

const D2R = Math.PI / 180;

// Wind op plek en tijdstip. Ruimtelijk bilineair tussen de vier omringende windpunten, in de tijd lineair tussen de uren.
// Richting via eenheidsvectoren (geen sprong bij 360°), snelheid als gemiddelde van de snelheden.
// variant: { draai: graden (+ = rechtsom), factor, verschuiving_min (+ = veranderingen komen eerder) }
function windOp(W, lat, lon, t, variant) {
  const v = variant || {}, R = W.raster;
  const tt = t + (v.verschuiving_min || 0) * 60000, T = W.tijden, n = T.length;
  let k = 0, ft = 0;
  if (tt >= T[n - 1]) { k = n - 1; ft = 0; }
  else if (tt > T[0]) { k = Math.min(n - 2, Math.floor((tt - T[0]) / (T[1] - T[0]))); while (k > 0 && T[k] > tt) k--; while (k < n - 2 && T[k + 1] <= tt) k++; ft = (tt - T[k]) / (T[k + 1] - T[k]); }
  const x = Math.max(0, Math.min(R.nlon - 1 - 1e-9, (lon - R.west) / R.dlon)), y = Math.max(0, Math.min(R.nlat - 1 - 1e-9, (lat - R.zuid) / R.dlat));
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  let su = 0, sv = 0, sk = 0;
  const neem = (p, w) => {
    if (w <= 0) return;
    const a = W.data[p][k], b = ft > 0 ? W.data[p][k + 1] : a;
    su += w * ((1 - ft) * Math.sin(a.dir * D2R) + ft * Math.sin(b.dir * D2R));
    sv += w * ((1 - ft) * Math.cos(a.dir * D2R) + ft * Math.cos(b.dir * D2R));
    sk += w * ((1 - ft) * a.kn + ft * b.kn);
  };
  const p00 = j * R.nlon + i;
  neem(p00, (1 - fx) * (1 - fy));
  if (i + 1 < R.nlon) neem(p00 + 1, fx * (1 - fy));
  if (j + 1 < R.nlat) neem(p00 + R.nlon, (1 - fx) * fy);
  if (i + 1 < R.nlon && j + 1 < R.nlat) neem(p00 + R.nlon + 1, fx * fy);
  return { dir: ((Math.atan2(su, sv) / D2R + (v.draai || 0)) % 360 + 360) % 360, kn: sk * (v.factor || 1) };
}

// De zes afwijkingen voor de robuustheid (ontwerp: Rekenmethode).
const WINDVARIANTEN = [
  { id: 'links', draai: -15, tekst: 'wind 15° linksom' }, { id: 'rechts', draai: 15, tekst: 'wind 15° rechtsom' },
  { id: 'minder', factor: 0.8, tekst: '20% minder wind' }, { id: 'meer', factor: 1.2, tekst: '20% meer wind' },
  { id: 'later', verschuiving_min: -60, tekst: 'windverandering 1 uur later' }, { id: 'eerder', verschuiving_min: 60, tekst: 'windverandering 1 uur eerder' }
];

// Bft-schaal (voor de weerregel en de kaart): bovengrens per Bft in kn
const BFT_TOT_KN = [1, 3, 6, 10, 16, 21, 27, 33, 40, 47, 55, 63];
const knNaarBft = kn => { const b = BFT_TOT_KN.findIndex(g => kn < g); return b < 0 ? 12 : b; };
