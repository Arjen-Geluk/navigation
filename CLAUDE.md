# Navigation — conventies

Topic-repo voor zeilen & navigatie, onderdeel van het portfolio van Arjen
Geluk (zie het overkoepelende `arjen-geluk/arjen-geluk.github.io` voor de
algemene conventies — structuur, licentie, publiceren).

## Inhoud

Elk project/deliverable binnen dit onderwerp krijgt een eigen submap met
een eigen zelfstandige `index.html` (geen externe assets, alles inline):

- `getijkaart/` — Getijkaart Waddenzee (bodemhoogte, waterstand, tijdschuif)
- `3-stedenrace/` — Klipperrace 3 Steden (wedstrijdanalyse Willem Jacob)
- `polartool/` — Polartool: polar voor een platbodem uit handmatige waarden en VDR-logs

## Polar en routemodellen

- De polar van een schip komt uitsluitend uit een **polarbestand** van de polartool. Routemodellen
  (3-stedenrace, Slag in de Rondte) hebben geen eigen invoer voor een polar meer.
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

## Live

- https://arjen-geluk.github.io/navigation/
- GitHub Pages: Deploy from a branch, main, / (root)

## Licentie

CC BY-NC-ND 4.0, zie `LICENSE`.
