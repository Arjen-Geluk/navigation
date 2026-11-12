---
name: wedstrijd-inbouwen
description: Bouw een nieuwe zeilwedstrijd of een nieuwe editie in de rekenpagina Wedstrijden IJsselmeergebied (navigation/wedstrijden), zoals de beurtveer, de strontrace of een nieuw jaar van de Klipperrace 3 Steden. Gebruik deze skill zodra het gaat om een reglement of wedstrijdbepalingen omzetten naar een editiebestand, start-, finish- of havenlijnen vastleggen, banen, routes en rondingszijden, havenuitsneden, verboden gebieden in het vaargebied, of een uitbreiding van het rekenmodel voor een nieuwe wedstrijd (sluizen, motorgebieden, meerdaagse wedstrijden) — ook als de gebruiker alleen zegt "zet de beurtveer erin" of "maak editie 2027".
---

# Een wedstrijd inbouwen in Wedstrijden IJsselmeergebied

De pagina `wedstrijden/` berekent per baan en route de vaartijd van een platbodem met een polar
(polartool), de windverwachting en het vaargebied uit de IENC en de RWS-bodem. De code is algemeen; een
wedstrijd is vooral **gegevens**. Deze skill is de werkwijze en de les uit de bouw van de 3-stedenrace
(versies 0.1–0.27, oktober–november 2026). Hij herhaalt de documenten niet, maar wijst ze aan.

## Lees eerst (en alleen wat je nodig hebt)

| bestand | waarvoor |
|---|---|
| `CLAUDE.md` (root) | conventies, huisstijl, polar alleen uit een polarbestand, geen scheepsdata |
| `wedstrijden/beheer/WERKINSTRUCTIE.md` | ververs, goedkeuren, editie maken, bouwen, publiceren — de stappen voor de gebruiker |
| `wedstrijden/FORMAAT.md` | rekenbestand (invoer, uitkomst); werk het eerst bij als het formaat verandert |
| `wedstrijden/gegevens/wedstrijden/3-steden_2026.json` | voorbeeld van een complete editie (punten, zones, banen, routes, finishlijn) |
| `wedstrijden/beheer/havens.mjs` | havens, sluizen en lijnen uit de reglementen, met status bevestigd/kandidaat/open |
| ontwerpdocument (Claude Doc `VE285RbMDSDVTdTUgCHurJ`, tabel "Besluiten tijdens de bouw") | waarom het model werkt zoals het werkt; nieuwe besluiten daar bijschrijven |
| IENC-skill (`.claude/skills/ienc/`) | land/water, verboden gebieden, havenlichten (`scripts/lichten.mjs`) |

## Afspraken met de gebruiker (vast)

- Werk op branch `wedstrijden`, niet op `main`. Kleine stappen, zelf committen; **pushen/live alleen na akkoord**.
- `3-stedenrace/` (oud) blijft ongewijzigd als archief.
- Geen scheepsnaam of herleidbare scheepsdata in code, gegevens of tests; echte data alleen in `lokaal/`.
  Testen met `polartool/voorbeeld/voorbeeldschip_polar_v1_2026-11-05.json`.
- Niets downloaden zonder akkoord (bestandsnaam, bron, grootte noemen).
- Een stap is pas klaar na een controle met echte data (lokaal) en een vergelijking met een werkelijke uitslag.
- Wat niet in het reglement staat, vraag je; elke keuze of afwijking van het ontwerp komt in "Besluiten tijdens de bouw".
- Versie verhogen in `bron/kern/00_versie.js` bij elke wijziging die de gebruiker merkt; commitbericht
  "Wedstrijden 0.xx: …".

## Stappen

1. **Reglement lezen.** Haal eruit: datum en starttijd, start- en finishlijn (per reis bij heen/terug), banen en routes,
   rondingszijden, verplichte doorgangen, havengebieden, motor- of sluisgedeelten, verboden gebieden, tijdslimiet.
   Zet open punten in een lijst en vraag ze in één keer (`AskUserQuestion`; maak het visueel als het om de kaart gaat).
2. **Punten en lijnen vastleggen.**
   - RWS-ton of -baken: alleen `"rws": "<naam>"`; de bouw haalt de positie uit de betonning en weigert onbekende of dubbele namen.
   - Licht of lichtopstand: zoek met `node .claude/skills/ienc/scripts/lichten.mjs --enc lokaal/ienc/nederland/ENC_ROOT --bbox …`;
     de naam van de drager is de RWS-naam. OpenStreetMap alleen als laatste, met `bron`.
   - Eigen punt (wedstrijdton, tank, dijkhoek): `lat`/`lon` + `bron`.
   - Lijn: `"lijn": [uiteinde, uiteinde]`. Havenlijnen in `beheer/havens.mjs`; zet `status` op `bevestigd` pas als de
     gebruiker of het reglement het bevestigt.
3. **Vaargebied.** Ligt de route door een haven, sluis of smalle geul: zet de haven in `havens.actief`
   (`gegevens/water_ienc.json`) zodat er een uitsnede van 5 m komt, en draai `npm run ververs`. Laat het verslag zien en wacht op
   akkoord vóór `--goedkeuren`.
4. **Editie** `gegevens/wedstrijden/<wedstrijd>_<jaar>.json` (zie WERKINSTRUCTIE "Nieuwe editie maken"); `gecontroleerd` pas
   op true na nalopen met de gebruiker.
5. **Model uitbreiden** alleen als de gegevens het niet kunnen uitdrukken (bijv. motorgebied, sluistijd, meerdere reizen).
   Leg eerst de keuze voor (met een plaatje), bouw dan in `bron/kern`, met een test in `test/kern.test.mjs`,
   en werk FORMAAT.md bij als het rekenbestand verandert.
6. **Controleren.** `npm run bouw`, `npm test` (regressie opnieuw vastleggen met `node test/kern.test.mjs --vastleggen`
   alleen als de verandering bedoeld is, en zeg wat er verschoof), pagina bekijken met `npm run toon`, dan de echte-data-test.
7. **Bijwerken:** WERKINSTRUCTIE als de gebruiker iets anders moet doen, de besluitentabel in het ontwerpdocument,
   en deze skill als je een nieuwe valkuil tegenkomt.

## Valkuilen (uit de bouw van de 3-stedenrace)

- **Dunne dammen.** Leidammen zijn smaller dan een rastercel. Zonder havenuitsnede (5 m, `randen`, water alleen als alle
  monsters water zijn) vaart de route er dwars doorheen. Het padzoeken toetst stappen in een uitsnede op de fijne kaart
  (`vrijZicht`), en hoeken afsnijden of naar een lijn sturen mag alleen bij vrij zicht.
- **LNDARE is niet altijd verboden.** De regel "elk eiland is verboden" sloot het Krabbersgat af. Verboden zijn alleen
  wat `beheer/lib/verboden.mjs` noemt: A1-tonnen, windparken, natuurgebieden, Marker Wadden (vak), `resare` met `restrn` 7.
- **Ronden:** boog op 30 m alleen als de koers de voorgeschreven kant op draait; anders passeren op 30 m. **Nooit een lus**
  (besluit van de gebruiker). Een punt bij een verboden zone (De Kreupel) krijgt `zone`: om de zone heen, niet om het punt.
- **Finishlijn:** naar het dichtstbijzijnde deel, minstens 10 % en 30 m van elk uiteinde, en alleen bij vrij zicht.
- **Peil:** IJsselmeer en Markermeer apart (`inMarkermeer` is begrensd op 52,70 N, anders telt het Krabbersgat mee). De
  RWS-waterstand-API bewaart ongeveer een jaar; een oudere wedstrijd valt terug op het streefpeil.
- **IENC-diepte bestaat hier niet** (alleen "water"); diepte komt uit de RWS-bodem. IENC-referentievlak is het plaatselijke peil.
- **Wind:** alleen meetplaatsen binnen 12 km van de editiepunten (minstens 3), uit `WINDPLAATSEN` in `bron/ui/40_wind.js`
  (13 plaatsen, van Workum tot Durgerdam); voeg er een toe als een wedstrijd buiten dat gebied komt.
- **Slaglengte:** "auto" probeert eerst onbeperkt en dan kortere slagen onder de langste rak; vergelijk niet met één vaste waarde.
- **Bekende restpunten:** een raakpunt bij de kop van de leidam (Enkhuizen) en langs De Kreupel; niet als nieuwe fout melden.
- **Browsercontrole:** schermafdrukken blijven hangen onder viewport-emulatie — terug naar de desktopinstelling.

## Valkuilen bij havenlijnen (uit de beurtveer, november 2026)

- **Reglement als pdf:** WebFetch levert alleen ruwe bytes. Lees het opgeslagen bestand met `pdftotext -layout` (staat in
  Git Bash) en lees daarna alleen de artikelen die je nodig hebt.
- **Het reglement noemt lichten die niet in de IENC staan** (bijv. "rood havenlicht op de dam" bij het Buiten-IJ,
  ND 5 bij het Naviduct, de tank in Urk). Gok niet: laat de gebruiker de punten kiezen op een IENC-kaartje met
  sleepbare punten die vastklikken op lichten (voorbeeld: `lokaal/havenlijnen_beurtveer.html`, niet in git). Punten
  zonder licht krijgen bron `gebruiker (kaart)`.
- **Kader van een haven:** de uitsnede is een cirkel van 1,5 km rond het midden van elke lijn, maar wordt afgekapt op
  het `kader` in `havens.mjs`. Ligt een lijn bij de rand, maak het kader groter en bekijk de uitsnede als plaatje
  (`beheer/lib/png.mjs`) voordat je goedkeurt.
- **Wedstrijdregels horen in de editie, niet in het vaargebied:** een verbod dat maar voor één wedstrijd geldt (het
  Oostvaardersdiep bij de beurtveer) wordt een zone in die editie; `verboden.mjs` is voor alle wedstrijden.

## Wat de beurtveer extra vraagt (stand 2026-11-12)

- Heen- en terugreis met verschillende start en finish (Workum ↔ Buiten-IJ), havengebieden onderweg (Lelystad, Enkhuizen).
- Havenlijnen: alle lijnen in `havens.mjs` zijn bevestigd (12-11-2026), inclusief Naviduct noord/zuid.
- Uitsneden van 5 m voor Workum, Lelystad en het Buiten-IJ staan aan (vaargebied versie 5). Het Oostvaardersdiep
  (verboden in 2.9.12) wordt een zone in de editie, niet in `verboden.mjs`.
- Reglement 2026: https://zeilvracht.nl/wp-content/uploads/2026/09/Reglement_Beurtveer_2026-aangepast.pdf (2.2 start/finish,
  2.4 routes ME en LE, 2.9 havens, 2.10 sluizen, 2.13 zeiltijd, 2.14 motorgebruik).
- Modelkeuze vooraf: hoe tellen motor- en sluisgedeelten (vaste tijd, ingevulde tijd, of uit de rekening).
