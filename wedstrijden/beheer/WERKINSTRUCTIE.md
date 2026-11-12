# Werkinstructie beheer — Wedstrijden IJsselmeergebied

Voor Arjen: zo ververs je het vaargebied, maak je een nieuwe editie en zet je de pagina live.
Alles gaat in Claude Code in de map `navigation`. De zin tussen aanhalingstekens kun je zo intypen.

## Eenmalig: voorbereiden

- Node.js LTS staat op deze computer (`node --version`).
- In `navigation/wedstrijden`: `npm install` (haalt Leaflet en de GeoTIFF-lezer op; komt niet in git).
- De IENC van Rijkswaterstaat uitgepakt in `lokaal/ienc/nederland/ENC_ROOT` (release "Nederland excl. Zeeland en
  Waddenzee"; niet in git). Downloaden alleen na akkoord; zie de IENC-skill (`.claude/skills/ienc/references/bronnen.md`).
  Een nieuwe release eerst controleren: `node ../.claude/skills/ienc/scripts/controle.mjs ../lokaal/ienc/nederland/ENC_ROOT`.

## Hoe het in elkaar zit

| Wat | Waar | Wie past het aan |
|---|---|---|
| Vaargebied (bodem, betonning, havens, doorgangen, peilen) | `gegevens/vaargebied_ijsselmeergebied.json` (+ `gegevens/bodem_*.bin`) | ververs-script, daarna Arjen |
| Een wedstrijdeditie | `gegevens/wedstrijden/<wedstrijd>_<jaar>.json` | Arjen, met Claude Code |
| De pagina zelf (opmaak, rekenkern) | `bron/` | Claude Code |
| De gepubliceerde pagina | `index.html` | **alleen het bouwscript** |

`index.html` is gebouwd: bewerk hem nooit met de hand. Na elke wijziging in `bron/` of `gegevens/` volgt `npm run bouw`.

## Vaargebied verversen

Wanneer: vóór elk wedstrijdseizoen, en als RWS een nieuwe bodemopname of betonning publiceert.

> "ververs het vaargebied"

1. Claude Code draait `npm run ververs`. Het script haalt bodem en betonning opnieuw op bij RWS en controleert alle
   bron-URL's (RWS, Open-Meteo, kaartondergronden). Land en water (50 m-raster, vaste ondergrond, havenuitsneden van
   5 m) en de verboden gebieden (windparken, natuur, Marker Wadden, invaarverbod) komen uit de lokale IENC; de
   A1-tonnen uit de betonning. Welke havenuitsneden in de pagina komen, staat in `havens.actief` in `gegevens/water_ienc.json`.
2. Het schrijft een verslag in `beheer/verslagen/`: aantal tonnen, nieuwe, verdwenen en verschoven tonnen
   (wedstrijdboeien apart), verschil in bodem per deelgebied, nieuwere bodemopname beschikbaar, URL's die niet antwoorden.
   Controleplaatjes van de bodem (heel het gebied en het Krabbersgat) komen in `lokaal/ververs/` (niet in git).
3. **Jij leest het verslag en keurt goed.** Let vooral op verschoven wedstrijdboeien, een nieuwere bodemopname en
   kapotte URL's. Niet akkoord: `git checkout` op de gegevens zet alles terug.
4. Na je akkoord: `npm run ververs -- --goedkeuren` (versie van het vaargebied +1, verslag gemarkeerd als goedgekeurd),
   `npm run bouw`, `npm test`, commit van gegevens én verslag.

Opties: `--meet` meet ook de grootte van het andere raster (25 of 50 m), `--resolutie 25` kiest 25 m,
`--vers` downloadt de bodemtegels opnieuw (anders uit de cache in `lokaal/ververs/cache/`), `--alleen-urls` doet alleen
de URL-controle. Het bodemraster: 1 byte per cel, zie `codering` in het vaargebiedbestand.

## Nieuwe editie maken (nieuw jaar of nieuwe wedstrijd)

Wanneer: als de wedstrijdbepalingen of het reglement van het nieuwe jaar verschijnen.

> "maak editie 2027 van de 3-stedenrace, op basis van 2026; hier zijn de wedstrijdbepalingen: …"

1. Kopieer de editie van vorig jaar naar `gegevens/wedstrijden/<wedstrijd>_<nieuw jaar>.json`; zet `jaar` en `versie: 1`.
2. Loop de wedstrijdbepalingen na: datum (de Klipperrace is terugkerend op de tweede zaterdag van oktober; 2026: 10 oktober), starttijd (eerste attentiesein + 10 min), finishlimiet, banen en routes met
   rondingszijden, verboden gebieden. Neem alleen op wat in de bepalingen staat (geen eigen via-punten).
   - Een RWS-boei krijgt alleen een naam (`"rws": "EZ-A"`); de positie komt bij het bouwen uit de RWS-betonning.
     De bouw weigert als de naam niet (of meer dan eens) in de betonning staat.
   - Een wedstrijdton of eigen punt (Start, De Kreupel) krijgt `lat` en `lon` en geen `rws`.
   - Een punt dat bij een verboden zone hoort (De Kreupel) krijgt `"zone": "<zone-id>"` naast de kant (`sb` of `bb`). De pagina
     vaart dan de kortste weg om de zone heen, met de zone aan die kant; geen boog om het punt zelf.
   - Een finishlijn: `"lijn": [uiteinde, uiteinde]`, elk uiteinde met `rws` of met `lat`/`lon` (en `bron`). De bouw zet het punt in
     het midden; de rekenkern vaart naar het dichtstbijzijnde deel van de lijn (minstens 10 % en 30 m van elk uiteinde).
3. Zet de status:
   - nog niet nagelopen: `"gecontroleerd": false`;
   - nagelopen: `"gecontroleerd": true`, `"tegen"` (naam en versie van de bepalingen), `"datum_bepalingen"` en `"bronbestand"`.
4. `npm run bouw` en `npm test`. De bouw weigert een editie met fouten (onbekend punt in een route, datum in een ander jaar…).
5. Bekijk de pagina lokaal (zie onder) en commit.

Een fout in een gepubliceerde editie herstellen: pas het bestand aan en verhoog `versie` met 1. Een berekening onthoudt met
welke editieversie ze gemaakt is.

## Bouwen, bekijken en publiceren

```
npm run bouw              # bouwt index.html uit bron/ en gegevens/
npm test                  # controleert de bron en of index.html actueel is
npm run toon              # lokaal bekijken: http://localhost:8642/navigation/wedstrijden/
```

- De bouw controleert ook de privacy: namen uit de polar- en scheepsbestanden in `lokaal/` (en uit
  `lokaal/verboden_woorden.txt`, één woord per regel) mogen niet in de pagina staan.
- Publiceren = pushen naar `main`; GitHub Pages zet het binnen enkele minuten live op
  https://arjen-geluk.github.io/navigation/wedstrijden/. **Pushen alleen na Arjens akkoord.**

## Afspraken

- Geen scheepsnaam of herleidbare scheepsdata in `bron/`, `gegevens/` of `test/`. Echte data alleen in `lokaal/`.
- Versies: de tool (`bron/kern/00_versie.js`), het vaargebied en elke editie hebben elk een eigen versienummer;
  alle drie komen in het rekenbestand.
