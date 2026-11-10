// Rekenbestand (wedstrijden/FORMAAT.md): maken en lezen. Pure functies, ook getest in Node.

const REKENFORMAAT = 'wedstrijdberekening/1';
const TRACKVELDEN = ['t', 'lat', 'lon', 'koers', 'vaart', 'twa', 'tws', 'stand', 'zwaard'];

const trackCompact = track => track ? { velden: TRACKVELDEN, rijen: track.map(p => TRACKVELDEN.map(v => p[v] ?? null)) } : null;
const trackUit = c => c && c.rijen ? c.rijen.map(r => Object.fromEntries(c.velden.map((v, i) => [v, r[i]]))) : c;

// d: { tool, vaargebied, editieSleutel, editie (gepubliceerd), editieGebruikt, afwijkingen, invoer, wind, polar, uitkomst, nu }
function maakRekenbestand(d) {
  const e = d.editie, g = d.editieGebruikt;
  return {
    formaat: REKENFORMAAT,
    gemaakt: new Date(d.nu ?? Date.now()).toISOString(),
    berekend: new Date(d.uitkomst.gemaakt).toISOString(),
    tool: { naam: d.tool.naam, versie: d.tool.versie },
    vaargebied: { versie: d.vaargebied.versie, datum: d.vaargebied.datum },
    editie: { sleutel: d.editieSleutel, wedstrijd: e.wedstrijd, jaar: e.jaar, versie: e.versie, status: e.status, afwijkend: !!d.uitkomst.afwijkend },
    editie_gebruikt: { punten: g.punten, zones: g.zones, banen: g.banen },
    afwijkingen: d.afwijkingen,
    invoer: d.invoer,
    wind: d.wind,
    polar: d.polar,
    uitkomst: {
      limiet: d.uitkomst.limiet, rekentijd_ms: Math.round(d.uitkomst.rekentijd_ms || 0),
      banen: Object.fromEntries(Object.entries(d.uitkomst.banen).map(([k, b]) => [k, {
        baan: b.baan, naam: b.naam, start: b.start,
        routes: b.routes.map(r => ({ naam: r.naam, punten: r.punten.map(p => ({ id: p.id, lat: p.lat, lon: p.lon, zijde: p.zijde || null })),
          snelst_in: r.snelst_in, varianten: r.varianten, res: { ...r.res, track: trackCompact(r.res.track) } }))
      }]))
    }
  };
}

// Controleert en zet terug naar de vorm waarmee de pagina rekent. Geeft { bestand, uitkomst } of { fout }.
function leesRekenbestand(o) {
  if (!o || typeof o.formaat !== 'string' || !o.formaat.startsWith('wedstrijdberekening/')) return { fout: 'dit is geen rekenbestand van de wedstrijdpagina' };
  if (o.formaat !== REKENFORMAAT) return { fout: `onbekende formaatversie ${o.formaat}; werk deze pagina bij` };
  if (!o.polar || !o.invoer || !o.uitkomst || !o.uitkomst.banen) return { fout: 'het rekenbestand is onvolledig (polar, invoer of uitkomst ontbreekt)' };
  const banen = Object.fromEntries(Object.entries(o.uitkomst.banen).map(([k, b]) => {
    const routes = b.routes.map(r => ({ ...r, res: { ...r.res, track: trackUit(r.res.track) } }));
    return [k, { ...b, routes, snelste: routes[0] && routes[0].res.klaar ? routes[0] : null }];
  }));
  return { bestand: o, uitkomst: { banen, limiet: o.uitkomst.limiet, gemaakt: Date.parse(o.berekend), rekentijd_ms: o.uitkomst.rekentijd_ms,
    verouderd: false, afwijkend: !!o.editie.afwijkend, factor: Math.round((o.invoer.schip.snelheidsfactor || 1) * 100),
    polar: polarLabel(o.polar), polarId: o.polar.schip.id, polarVersie: o.polar.versie } };
}

// <wedstrijd>_<datum>_<scheepsnaam>_<HHMM>.json (tijd van opslaan, lokale tijd)
function rekenbestandNaam(wedstrijdId, datum, scheepsnaam, nu = Date.now(), tz = 'Europe/Amsterdam') {
  const schoon = s => String(s || 'schip').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'schip';
  const hhmm = new Date(nu).toLocaleTimeString('nl-NL', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).replace(':', '');
  return `${schoon(wedstrijdId)}_${datum}_${schoon(scheepsnaam)}_${hhmm}.json`;
}
