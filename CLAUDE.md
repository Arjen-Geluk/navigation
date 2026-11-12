# Navigation — conventies

Topic-repo voor zeilen & navigatie, onderdeel van het portfolio van Arjen
Geluk (zie het overkoepelende `arjen-geluk/arjen-geluk.github.io` voor de
algemene conventies — structuur, licentie, publiceren).

## Inhoud

Elk project/deliverable binnen dit onderwerp krijgt een eigen submap met
een eigen zelfstandige `index.html` (geen externe assets, alles inline):

- `polartool/` — Polartool: polar voor een platbodem uit handmatige waarden en VDR-logs
- `wedstrijden/` — Wedstrijden IJsselmeergebied (snelste route per wedstrijd en baan)
- `getijkaart/` — Getijkaart Waddenzee (bodemhoogte, waterstand, tijdschuif)

De landingspagina toont ze in deze volgorde. De oude `3-stedenrace/` is verwijderd (staat nog in de
git-geschiedenis); de 3-stedenrace wordt gerekend in `wedstrijden/`.

## Polar en routemodellen

- De polar van een schip komt uitsluitend uit een **polarbestand** van de polartool. Routemodellen
  (Wedstrijden, Slag in de Rondte) hebben geen eigen invoer voor een polar meer.
- Het formaat, de gebruiksregels en het overdrachtsprotocol ("Openen in wedstrijd", `postMessage`)
  staan in [`polartool/FORMAAT.md`](polartool/FORMAAT.md). Dat is het contract: houd je eraan en werk
  het eerst bij als het formaat verandert.
- Testen kan met `polartool/voorbeeld/voorbeeldschip_polar_v1_2026-11-05.json` (verzonnen schip).
- Publieke repo: geen echte scheepsdata (VDR-logs, scheepsbestanden) in code, voorbeelden of tests.
  Echte data alleen lokaal, bijvoorbeeld in `lokaal/` (staat in `.gitignore`).
- De polartool draagt een eigen versienummer (`TOOL` in `polartool/index.html`); verhoog het bij
  elke wijziging die gebruikers merken.

De root `index.html` is de landingspagina van dit topic (alléén zeilen/
navigatie-projecten, geen andere rubrieken — die horen in de overkoepelende
portfoliosite).

## Huisstijl (design system)

- De huisstijl staat in het design system **Navigation**:
  https://claude.ai/artifact/6F27EjgQKsX2xBuRW7kX1i — lees daar eerst `project/README.md`
  (Artifact-tool, `read` met `path`), en voor waarden `project/tokens.json` en
  `project/components/bundle.css`.
- Nieuwe pagina's en nieuwe onderdelen volgen die tokens (`bg`, `panel`, `ink`, `muted`, `line`,
  `navy`, `accent`, …, met licht- en donkerthema) en componenten (Kopbalk, Paneel, Knop, Chip,
  Melding, Veld, Lijsttabel, Polartabel). Start vanaf het skelet van `wedstrijden/bron/pagina.html`.
- Waarden worden **inline** in de pagina gezet (geen link naar het design system of andere externe
  assets); het design system is de bron om uit over te nemen, niet om te laden.
- Wijkt de code bewust af of komt er een nieuwe kleur of nieuw component bij: werk dan ook het design
  system bij, zodat de code en het design system gelijk blijven.
- De huisstijl wordt van boven naar beneden ingezet: de landingspagina (root `index.html`) volgt hem
  al.
- Elke pagina heeft in de kopbalk een terugknop (`<a class="terug">`) naar de pagina één niveau
  hoger: een tool naar de landingspagina (`href="../"`, "← Navigatie"), de landingspagina naar de
  portfoliosite (`https://arjen-geluk.github.io/`, "← Arjen Geluk").

## Favicon

Elke pagina zet direct onder `<title>` het favicon-blok uit de `CLAUDE.md` van
`arjen-geluk.github.io` (iconen in de root van het domein), met het SVG-icoon als data-URI
in plaats van `/favicon.svg`, zodat een pagina ook los geopend een icoon heeft.

## Live

- https://arjen-geluk.github.io/navigation/
- GitHub Pages: Deploy from a branch, main, / (root)

## Licentie

CC BY-NC-ND 4.0, zie `LICENSE`.
