---
name: ienc
description: Lees en interpreteer de Inland ENC-vaarkaarten (IENC, S-57) van Rijkswaterstaat in Node.js zonder externe programma's, en haal er per gebied land/dammen, dieptegebieden, verboden en waarschuwingsgebieden, havens, sluizen, bruggen en betonning uit als GeoJSON. Gebruik deze skill zodra het gaat om IENC, ENC, S-57, .000-cellen, CATALOG.031, vaarweginformatie.nl-kaarten, objectcodes als LNDARE/DEPARE/RESARE/resare/CTNARE/boylat/restrn, het verversen van een vaargebied uit officiële kaartdata, of de vraag wat een S-57-object of -attribuut betekent — ook als de gebruiker het gewoon "de elektronische vaarkaart van RWS" noemt.
---

# IENC (Inland ENC) van Rijkswaterstaat

Deze skill leest S-57-cellen (ISO 8211) met eigen code in `scripts/` en zet ze om naar GeoJSON.
Geen GDAL, geen Python, geen npm-pakketten: alleen Node.js (≥ 18).

## Waar staat wat

| pad | wat |
|---|---|
| `scripts/s57.mjs` | de lezer: `leesCel`, `geometrie`, `naarGeoJSON`, `leesCatalogus`, `cellenVoorGebied`, `codes`, `betekenis` |
| `scripts/iso8211.mjs` | de laag eronder: ISO 8211-records en -velden |
| `scripts/gebied.mjs` | GeoJSON per thema voor een gebied (CLI én module), met de thema-indeling `THEMA`, en `inDeBuurt` om naamloze vlakken te beschrijven via benoemde objecten eromheen |
| `scripts/controle.mjs` | controle van een nieuwe release: alles leesbaar, codes bekend, ringen dicht |
| `scripts/bouw_catalogus.mjs` | bouwt `data/ienc_catalogus.json` opnieuw uit een nieuwe IENC Feature Catalogue (XML) |
| `data/ienc_catalogus.json` | codes, namen, toegestane waarden (IEHG IENC FC 2.6 corr3 + bIENC FC 1.0) |
| `data/*.csv` | terugval voor maritieme S-57-codes (GDAL 3.10, zie `data/BRON.md`) |
| `references/objecten.md` | **lees dit** bij vragen over betekenis: objectklassen en attributen die er voor zeilen en wedstrijdbanen toe doen, NL-afspraken, valkuilen |
| `references/s57-formaat.md` | hoe een .000-bestand in elkaar zit (records, vectoren, topologie); lees bij fouten in de lezer of vragen over het formaat |
| `references/bronnen.md` | waar de bestanden vandaan komen, hoe je ze downloadt, licenties, documentatie |

## Werkwijze

1. **Data lokaal.** ENC-bestanden horen in `lokaal/ienc/` (staat in `.gitignore`); nooit in de repo.
   Vraag de gebruiker altijd eerst toestemming voor een download en noem bestandsnaam, bron en grootte.
   Hoe je de actuele lijst en de directe downloadlink vindt staat in `references/bronnen.md`.
   Uitgepakt: `lokaal/ienc/nederland/ENC_ROOT/` met `CATALOG.031` en per cel een map.

2. **Release controleren** voordat je hem gebruikt:
   ```bash
   node .claude/skills/ienc/scripts/controle.mjs lokaal/ienc/nederland/ENC_ROOT
   ```
   Exitcode 0 = alles gelezen, geen onbekende codes, geen open ringen. Onbekende codes betekenen
   meestal een nieuwere Feature Catalogue: haal die op (met toestemming) en draai `bouw_catalogus.mjs`.

3. **Gebied ophalen** als GeoJSON:
   ```bash
   node .claude/skills/ienc/scripts/gebied.mjs --enc lokaal/ienc/nederland/ENC_ROOT --bbox 4.9,52.25,5.95,53.1 --uit lokaal/ienc/uit
   ```
   Thema's: `land`, `diepte`, `beperking`, `haven`, `kunstwerk`, `markering` (zie `THEMA` in `gebied.mjs`
   voor de klassen per thema), of precies `--klassen LNDARE,resare`. Uitvoer: één FeatureCollection per thema,
   coördinaten lon/lat WGS84, vlakken volgens RFC 7946. Elke feature krijgt `klasse`, `objl`, `lnam`, `cel`,
   alle attributen op acroniem, en bij enum-/lijstwaarden ook `<ACR>_tekst` (bijv. `restrn: [7]`, `restrn_tekst: "entry prohibited"`).

4. **Als module** (bijv. vanuit `wedstrijden/beheer/ververs.mjs`):
   ```js
   import { gebied } from '../../.claude/skills/ienc/scripts/gebied.mjs';
   const { cellen, themas } = gebied(encRoot, [4.9, 52.25, 5.95, 53.1], { thema: ['land', 'beperking'] });
   ```
   Leg `cellen` (naam, editie, uitgiftedatum) vast in het verslag of het gegevensbestand, zodat te zien is
   op welke kaartversie een vaargebied is gebaseerd.

5. **Uitleggen.** Voor "wat betekent X" eerst `references/objecten.md`; voor de officiële naam en alle
   toegestane waarden: `codes().klasseOpAcr.get('resare')`, `codes().attrOpAcr.get('restrn')`,
   `betekenis('restrn', 7)`. Bij twijfel over NL-gebruik: de Specificatie IENC NL v3.0 (`references/bronnen.md`).

## Dingen die je moet weten (anders gaat het mis)

- **Acroniemen zijn hoofdlettergevoelig.** HOOFDLETTERS = maritiem S-57, kleine letters = Inland-uitbreiding.
  `SLCONS` (122) en `slcons` (17032), `BOYLAT`/`boylat`, `RESARE`/`resare` zijn verschillende klassen die
  allebei voorkomen. Filter dus altijd op beide als je "alle boeien" of "alle verboden gebieden" wilt.
- **IJsselmeergebied heeft geen bathymetrie in de IENC.** `DEPARE` is daar vrijwel overal `DRVAL1 = 0` zonder
  `DRVAL2`: het markeert alleen "water". Alleen de releases "Zeeland met Diepte" en "Waddenzee met Diepte"
  bevatten gemeten dieptes. Gebruik voor diepte in het IJsselmeergebied de RWS-bodemhoogte.
- **Referentievlak is het plaatselijke peil, niet NAP** (`VDAT`/`SDAT` 33 in alle cellen). Reken om met het
  streefpeil voordat je IENC-diepten of -hoogten met NAP-gegevens combineert; zie `references/objecten.md` §1.
- **Verboden gebieden hebben vaak geen naam.** Gebruik `inDeBuurt()` uit `gebied.mjs` om ze te beschrijven
  ("bij de spuisluizen van de Lorentzsluizen") in plaats van zelf een zoekroutine te schrijven.
- **Objecten zijn per cel geknipt.** Eén windpark of verboden gebied over een celgrens wordt twee features
  (bijv. Windpark Fryslân op 53°N). Voeg samen op `klasse` + naam/attributen als je één vlak nodig hebt;
  `lnam` is per stuk verschillend.
- **Alleen basiscellen.** De lezer past geen updatebestanden (.001…) toe; RWS levert per release complete
  `.000`-cellen. `controle.mjs` waarschuwt als er toch updates in een map staan.
- **Randen met `MASK`** (celgrens-randen) tellen mee voor de vlakvorming. Teken een kustlijn liever met `COALNE`
  of `SLCONS`/`slcons` dan met de rand van `LNDARE`, anders krijg je lijnen langs de celgrenzen.
- **Teksten** (`INFORM`, `OBJNAM`) zijn Nederlands of Engels door elkaar; `NOBJNM`/`NINFOM` (nationale taal)
  kan Fries bevatten. `CTNARE` wordt ook gebruikt voor disclaimers ("nog niet geverifieerd"), niet alleen voor gevaren.
- **Geen echte scheepsdata** in de repo (zie `CLAUDE.md`); IENC-data is open (CC-0) maar hoort wegens omvang in `lokaal/`.
