// Uitleg en start van de pagina.
(function () {
  const vg = G.vaargebied;
  const bron = (naam, url, datum) => `<li><a href="${url}">${naam}</a>${datum ? ` (${datum})` : ''}</li>`;
  $('uitleg').innerHTML = `
    <h2>Werkvolgorde</h2>
    <ol>
      <li><b>Wedstrijd</b>: kies de editie, controleer datum, start en finishlimiet, en kies de baan als de wedstrijdleiding die heeft bekendgemaakt.</li>
      <li><b>Schip</b>: laad je polarbestand in, of stuur het vanuit de <a href="../polartool/">polartool</a> met <b>Openen in wedstrijd</b>.</li>
      <li><b>Wind &amp; peil</b>: haal de windverwachting op. Pas de windtabel zo nodig aan en controleer het peil.</li>
      <li><b>Advies</b>: klik op <b>Bereken</b>. Je ziet per baan de snelste route, alle routes en de rakken.</li>
      <li><b>Kaart</b>: bekijk de route met de tijdschuif, de diepte en de bevaarbaarheid voor jouw schip.</li>
    </ol>
    <h2>Rekenmethode</h2>
    <p>Elke route wordt echt nagevaren in stappen van 30 seconden. Bij elke stap bepaalt de pagina de wind op die plek en dat moment,
      de ware windhoek, de vaart uit je polar en de zwaardstand. Ligt het volgende punt binnen de kruishoek, dan kruist het schip op de hoek
      met de beste VMG. Overstag gaat het bij een krimper (meer dan 10°), na 3 zeemijl op dezelfde slag, als het water te ondiep wordt voor
      zwaard neer, bij de rand van een verboden gebied, of zodra het punt bezeild is. Doorsnijdt de rechte lijn een ondiepte of verboden gebied,
      dan zoekt de pagina de kortste bevaarbare weg eromheen.</p>
    <p>Waterdiepte = peil − bodemhoogte. Is het water te ondiep voor de romp (zwaard op) plus de kielspeling, dan is de plek onbevaarbaar.
      De robuustheid rekent elke route ook met zes afwijkingen: wind 15° links- en rechtsom, 20% meer en minder wind, en de windverandering
      een uur eerder en later. Niet in het model: anker op en zeilen hijsen, golven, luwte onder de wal en stroming.</p>
    <h2>Bronnen</h2>
    <ul>
      ${bron(`Bodemhoogte IJsselmeergebied, opname ${vg.bodem?.opname} (Rijkswaterstaat)`, 'https://geo.rijkswaterstaat.nl/services/ogc/gdr/bodemhoogte_ijsselmeergebied/ows?service=WCS&request=GetCapabilities', 'opgehaald ' + vg.bodem?.opgehaald)}
      ${bron('Vaarwegmarkeringen (Rijkswaterstaat, via PDOK)', 'https://www.pdok.nl/introductie/-/article/vaarwegmarkeringen-nederland', 'opgehaald ' + vg.betonning?.opgehaald)}
      ${bron('Windverwachting: Open-Meteo', 'https://open-meteo.com/', null)}
    </ul>
    <p>Vaargebied versie ${vg.versie} van ${vg.datum}. Edities: ${G.bouw.edities.map(e => `${e.wedstrijd} ${e.jaar} v${e.versie}`).join(', ')}. Pagina versie ${TOOL.versie}.</p>
    <h2>Privacy</h2>
    <p>Alles draait in je browser. Je polar, je invoer en de uitkomsten verlaten je computer niet; ze staan alleen in de opslag van deze browser.
      Alleen de windverwachting (Open-Meteo) en de online kaartondergronden worden van internet gehaald.</p>
    <h2>Problemen oplossen</h2>
    <ul>
      <li><b>Wind ophalen mislukt</b>: probeer een ander model; anders valt de pagina terug op "best match". Ver vooruit (meer dan 2 à 3 dagen) heeft HARMONIE geen gegevens.</li>
      <li><b>Openen in wedstrijd geeft niet de goede polar</b>: laad het opgeslagen polarbestand hier zelf in via tabblad Schip.</li>
      <li><b>Alles terug naar standaard</b>: <button type="button" class="knop stil klein" id="alleStandaard">wis de invoer in deze browser</button> (niet de edities of het vaargebied).</li>
    </ul>
    <p class="sub">Geen navigatiemiddel: alleen voor de voorbereiding. De kaart, de betonning en de wedstrijdleiding gaan altijd voor.</p>`;
  $('alleStandaard').onclick = () => {
    if (!confirm('Alle invoer in deze browser wissen (wedstrijd, wind, instellingen, polar)?')) return;
    try { localStorage.removeItem(OPSLAG); localStorage.removeItem('wedstrijden.polar.v1'); } catch (e) { /* niets */ }
    location.reload();
  };

  let tab = null;
  try { tab = sessionStorage.getItem('wedstrijden.tab'); } catch (e) { /* niets */ }
  toonTab(tab && $('tab-' + tab) ? tab : (SCHIP.actief ? (S.wind.W ? 'advies' : 'wind') : 'schip'));
})();
