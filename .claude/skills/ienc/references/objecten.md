# Objecten en attributen in de RWS-IENC

Wat de objectklassen en attributen betekenen, toegespitst op zeilen en wedstrijdbanen in het
IJsselmeergebied. Aantallen en voorbeelden komen uit de release van 2026-10-05, gebied
4,9–5,95 °O × 52,25–53,1 °N (28 cellen). Officiële definities en alle toegestane waarden:
`codes()` in `scripts/s57.mjs` (bron: IENC Feature Catalogue 2.6).

## Inhoud

1. Lezen van codes en waarden
2. Land en oevers
3. Diepte
4. Verboden, beperkte en waarschuwingsgebieden
5. Vaarwegen en scheepsafmetingen
6. Havens en ligplaatsen
7. Sluizen, bruggen, kabels
8. Betonning, lichten, borden
9. Metaobjecten en verwijzingen
10. Bekende eigenaardigheden van de RWS-data

## 1. Lezen van codes en waarden

- **Objectklasse** (OBJL, getal) → acroniem. 1–159 en 300+ = maritiem S-57 (HOOFDLETTERS), 17000+ =
  Inland ENC (kleine letters), 18000+ = bathymetrische/afmetingen-uitbreiding (`lg_sdm`).
- **Hoofdlettergevoelig**: `SLCONS`/`slcons`, `BOYLAT`/`boylat`, `BCNLAT`/`bcnlat`, `RESARE`/`resare`,
  `HRBARE`/`hrbare`, `CATLAM`/`catlam`, `VERDAT`/`verdat`, `RESTRN`/`restrn` zijn telkens verschillende codes.
  De Inland-variant heeft vaak meer waarden (bijv. `catlam` kent "right-hand side of the channel").
- **Attribuuttypen**: E = één code uit een lijst, L = komma-lijst van codes (wordt een array), F = getal,
  I = geheel getal, A/S = tekst. `betekenis('restrn', 7)` geeft de Engelse omschrijving.
- **Geometrie** (PRIM): 1 punt, 2 lijn, 3 vlak, 255 geen (metaobject).
- **SCAMIN**: kleinste schaal (noemer) waarop het object getoond wordt; handig om te generaliseren
  (bijv. `COALNE` 300000 = altijd, `MORFAC` 4000 = alleen heel ingezoomd).
- **Hoogten en afstanden**: `VERCLR`, `HORCLR`, `HORLEN`, `HORWID` in meters; `hunits` noemt de eenheid
  van `wtwdis` (vaarwegkilometer), niet van de doorvaarthoogte. `verdat` geeft het referentievlak
  (in het IJsselmeergebied vaak 43 "Dutch High Water Reference Level (MHW)" of 32 "Local high water reference level").

## 2. Land en oevers (thema `land`)

| klasse | wat | geometrie | let op |
|---|---|---|---|
| `LNDARE` | land (ook eilanden, dammen, dijklichamen) | vlak | geen attributen; vlakranden op celgrenzen zijn gemaskeerd |
| `COALNE` | kustlijn / land-waterscheiding | lijn | nauwkeurigheid < 5 m (Spec NL) |
| `SLCONS` | oeverconstructie: kade (`CATSLC` 6), helling (12), stootwerk (14), strekdam, golfbreker | lijn/vlak | `WATLEV` 2 = altijd droog; nauwkeurigheid < 0,5 m |
| `slcons` | Inland-oeverconstructie, vooral kribben (`catslc` 2) en strekdammen (7) | lijn | `watlev` 8 = boven gemiddeld water |
| `canbnk`, `rivbnk` | kanaal- en rivieroever | lijn | niet in IJsselmeergebied |
| `DAMCON` | dam/stuw (`CATDAM` 2 = stuw) | vlak | in het IJsselmeergebied alleen 20 stuwen; dijken als de Houtribdijk zijn `LNDARE` |
| `ponton` | ponton, drijvende steiger | vlak | 2629 stuks; obstakel in havens |
| `HULKES` | woonschip/hulk (`CATHLK` accommodation) | vlak | |
| `BUAARE` | bebouwd gebied | vlak | ligt óp land; alleen voor de kaart |
| `FLODOC`, `DRYDOC` | (droog)dok | vlak | |

Voor "waar is land" is `LNDARE` de bron; `COALNE` + `SLCONS`/`slcons` vormen samen de waterkant.
Strekdammen en kribben (`slcons`) zijn smalle lijnen: buffer ze als je ze als obstakel wilt gebruiken.

## 3. Diepte (thema `diepte`)

| klasse | wat | belangrijke attributen |
|---|---|---|
| `DEPARE` | dieptegebied | `DRVAL1` (ondiepste), `DRVAL2` (diepste), t.o.v. het referentievlak van de cel |
| `depare` | Inland-dieptegebied | idem |
| `DRGARE` | gebaggerd gebied / geul met projectdiepte | `DRVAL1` = gegarandeerde diepte (bijv. 5,6 m) |
| `DEPCNT` | dieptelijn | `VALDCO` |
| `SOUNDG` | losse dieptepeilingen | MultiPoint met diepte als 3e coördinaat (z) |
| `OBSTRN`, `WRECKS`, `UWTROC` | obstakel, wrak, onderwatersteen | `VALSOU` = diepte boven het object, `WATLEV` |
| `UNSARE` | niet opgenomen gebied | |

**In het IJsselmeergebied staat geen bathymetrie in de IENC**: 2457 van de 2525 `DEPARE` hebben
`DRVAL1 = 0` en geen `DRVAL2`. Ze geven alleen aan dát er water is. Alleen de releases "Zeeland met
Diepte" en "Waddenzee met Diepte" bevatten gemeten dieptes (contouren 0–7 m per 0,5 m, 8, 9, 10, 15, 20,
25 m, Spec NL hoofdstuk 4.I). Bruikbaar uit de IENC voor diepte zijn hier alleen `DRGARE` (geulen met
projectdiepte) en de obstakels met `VALSOU`.

## 4. Verboden, beperkte en waarschuwingsgebieden (thema `beperking`)

| klasse | wat | belangrijke attributen |
|---|---|---|
| `resare` | gebied met beperking (Inland) | `restrn` (lijst), `CATREA`, `OBJNAM`, `INFORM`, `STATUS` |
| `RESARE` | idem maritiem | `RESTRN`, `CATREA` |
| `CTNARE` | waarschuwingsgebied | `INFORM` (de eigenlijke boodschap), `OBJNAM` |
| `MIPARE` | militair oefengebied | `restrn` |
| `achare`/`ACHARE`, `achbrt` | ankergebied, ankerplaats | `restrn`, `catach` |
| `MARCUL` | viskweek/visserij (`CATMFA` 1 = vis) | vaak fuiken: obstakel |
| `comare` | communicatiegebied (marifoonkanaal) | `COMCHA` (bijv. "20"), `catcom` (sluis, brug, verkeerspost) |

**`restrn`-codes** (Inland; tussen haakjes de Nederlandse betekenis):

| code | Engels | betekenis | voor zeilers |
|---|---|---|---|
| 1 | anchoring prohibited | ankerverbod | |
| 2 | anchoring restricted | ankeren beperkt | |
| 7 | entry prohibited | invaarverbod | **verboden gebied** (bijv. natuur, windpark, zandwinning) |
| 8 | entry restricted | invaren beperkt | alleen met toestemming/onder voorwaarden: lees `INFORM` |
| 13 | no wake | geen hekgolf | |
| 14 | area to be avoided | te vermijden gebied | |
| 27 | speed restricted | snelheidsbeperking | |
| 28–30 | overtaking (…) prohibited | inhaalverboden | |
| 31 | berthing prohibited | ligverbod | |
| 32 | berthing restricted | ligplaats beperkt | meestal wachtplaatsen bij sluizen |
| 33/34 | making fast prohibited/restricted | vastmaakverbod | |
| 35 | turning prohibited | keerverbod | |
| 36/37 | restricted fairway depth/width | beperkte diepte/breedte | |
| 38 | use of spuds prohibited | geen spudpalen | |

In het IJsselmeergebied: 99 `resare`, waarvan 22 met `restrn` 7 (invaarverbod) en 72 met 32
(wachtplaatsen, `CATREA` 19 "waiting area"). Een **verboden gebied voor een wedstrijdbaan** = `resare`/`RESARE`/`MIPARE`
met `restrn` 7 (en eventueel 8 of 14, na lezen van `INFORM`).

**`CTNARE`** wordt voor twee heel verschillende dingen gebruikt: echte waarschuwingen ("Windpark Fryslân",
"Zandwinning", "Natuurgebied", "Werk in uitvoering, situatie kan afwijken van de kaart",
"Ferry swings from one side to the other") én administratieve disclaimers ("Gegevens van vaarwegen en
havens van klasse Va en hoger … zijn nog niet geverifieerd", "… verantwoordelijkheid van … Havenbedrijf
Amsterdam"). Filter op de tekst in `INFORM` voordat je een CTNARE als gevaar behandelt. De turbines
zelf staan als `LNDMRK` met `CATLMK` "windmotor" in de kaart (79 binnen het vlak van Windpark Fryslân).

## 5. Vaarwegen en scheepsafmetingen

| klasse | wat | belangrijke attributen |
|---|---|---|
| `wtwaxs` | vaarwegas (hartlijn) | `OBJNAM` = vaarwegnaam (bijv. "Amsterdam-Rijnkanaal") |
| `FAIRWY` | vaarwater/geul | |
| `NAVLNE`, `RECTRC` | geleidelijn, aanbevolen koers | `ORIENT` (graden) |
| `FERYRT`/`feryrt` | veerroute | `CATFRY` (vrij varend, kabelpont) |
| `lg_sdm` | maximaal toegestane scheepsafmetingen | `lg_bme` (breedte m), `lg_lgs` (lengte m), `lg_drt` (diepgang m) |
| `wtwprf`, `dismar` | vaarwegprofiel, kilometerraai | `wtwdis` = vaarwegkilometer |

## 6. Havens en ligplaatsen (thema `haven`)

| klasse | wat | belangrijke attributen |
|---|---|---|
| `hrbare` | havengebied (Inland) | `OBJNAM` ("Haven WSV Nigtevecht"), `cathbr` (3 = jachthaven), `unlocd` |
| `HRBARE`, `prtare` | havengebied maritiem, havenbeheergebied | |
| `hrbbsn` | havenbekken | |
| `HRBFAC`/`hrbfac`, `SMCFAC` | havenvoorziening, jachthavenvoorziening | `CATHAF`/`cathaf` (5 = jachthaven) |
| `berths`/`BERTHS` | ligplaats | `OBJNAM`, `STATUS`, `clsdng` (blauwe kegels), `INFORM` (adres) |
| `MORFAC` | afmeervoorziening: bolder, paal, dukdalf (`CATMOR`) | 16000 punten: niet zinvol voor overzicht |
| `termnl`, `bunsta`, `trnbsn` | terminal, bunkerstation, zwaaikom (`HORCLR` = diameter) | |

`unlocd` is de ISRS-locatiecode (bijv. `NLLAV002270169900287`); daarmee koppel je aan de RIS-index en
vaarweginformatie.nl.

## 7. Sluizen, bruggen, kabels (thema `kunstwerk`)

| klasse | wat | belangrijke attributen |
|---|---|---|
| `lokbsn` | sluiskolk | `OBJNAM`, `HORLEN`, `HORWID` (m), `INFORM` |
| `lkbspt`, `lokare` | deel van sluiskolk, sluisgebied | `TXTDSC` verwijst naar een XML-bestand in de celmap |
| `gatcon`/`GATCON` | sluisdeur (`CATGAT` 4), stuw/keersluis (2) | `HORCLR`, `VERCLR` |
| `bridge`/`BRIDGE` | brug | `CATBRG` (1 vast, 3 draai, 4 hef, 5 basculebrug), `VERCLR` (doorvaarthoogte dicht), `HORCLR`, `verdat` |
| `brgare` | brugdeel/brugzone | |
| `cblohd`/`CBLOHD`, `pipohd` | hoogspanningskabel/leiding boven water | `VERCLR` (bijv. 22,4 m): **mast!** |
| `excnst` | bijzonder kunstwerk (`catexs` 2 = aquaduct) | `DRVAL1` |

Een brug bestaat vaak uit meerdere objecten (brug + doorvaartopeningen `gatcon` + `comare`) die via een
`C_AGGR` bij elkaar horen. Bedieningstijden staan in XML-bestanden naast de cel (zie §9).

## 8. Betonning, lichten, borden (thema `markering`)

| klasse | wat | belangrijke attributen |
|---|---|---|
| `boylat`/`BOYLAT` | laterale ton | `OBJNAM` ("AK 9"), `catlam`/`CATLAM`, `COLOUR`, `BOYSHP` |
| `BOYCAR` | kardinale ton | `CATCAM` (1 N, 2 O, 3 Z, 4 W) |
| `BOYSPP` | bijzondere ton (geel, kite-tonnen, kabelton) | `CATSPM`; vaak **zonder** `OBJNAM` |
| `BOYSAW`, `BOYISD` | atonnen/vrij water, gevaarton | |
| `bcnlat`/`BCNLAT`, `BCNCAR`, `BCNSPP` | bakens (stokken, palen) | `BCNSHP` |
| `LIGHTS` | licht | `LITCHR`, `SIGGRP`, `SIGPER`, `COLOUR`, `SECTR1/2` |
| `TOPMAR`, `DAYMAR` | topteken, dagmerk | hoort bij een ton/baken op dezelfde plek |
| `notmrk` | scheepvaartteken (bord) | `catnmk` (bijv. "(A.7) no making fast"), `fnctnm`, `dirimp`, `ORIENT` |
| `wtwgag` | peilschaal/waterstandsmeter | `OBJNAM` ("KETH Ketelhaven") |
| `sistat`, `sistaw` | seinpost verkeer / waarschuwing | |
| `LNDMRK`, `PILPNT` | herkenningspunt (mast, molen, windturbine), paal | `CATLMK` |

**Vergelijking met PDOK-vaarwegmarkeringen** (2026-11-06): van 1674 PDOK-markeringen in het IJsselmeergebied
ligt 1541 binnen 2 m van een IENC-markering (mediaan 0,1 m bij gelijke naam). Namen verschillen soms;
gele tonnen staan in de IENC vaak zonder naam. De tonnen langs de Afsluitdijk (vaarwater "AD") liggen in de
Waddenzee-cellen, niet in de release "Nederland (excl. Zeeland, Waddenzee)".

## 9. Metaobjecten en verwijzingen

- `M_COVR` (`CATCOV` 1 = data, 2 = geen data): het werkelijke dekkingsgebied van een cel. Cellen zijn
  rechthoekig, maar alleen het `CATCOV` 1-deel bevat kaartinformatie; buiten dat deel mogen cellen overlappen.
- `M_NSYS`/`m_nsys`, `m_sdat`, `m_vdat`: markeringssysteem, diepte- en hoogtereferentie van (een deel van) de cel.
- `C_AGGR`, `C_ASSO` (PRIM 255): groeperen objecten die bij elkaar horen (brug + openingen + marifoongebied).
  De leden staan in `ffpt` van de feature uit `leesCel` (`lnam` = AGEN:FIDN:FIDS).
- `TXTDSC`/`NTXTDS` noemen een bestand in de celmap. De `.XML`-bestanden naast de cellen zijn
  bedieningstijden (`facility`, schema `facility_2.0.xsd` van openecdis.org): naam, type (Bridge, Lock),
  omschrijving en perioden met tijdvakken per dag.

## 10. Bekende eigenaardigheden van de RWS-data

- Lijst- en enumattributen bevatten soms tekst in plaats van een code (`catgag` "RECORDING_GAUGE_WITH_REMOTE_ACCESS",
  `CATREA` "swinging area", `cathaf` " "). De lezer bewaart dan de tekst; `_tekst` ontbreekt.
- `catccl` op `wtwaxs` is steeds 0 (geen geldige code).
- Objecten worden op celgrenzen geknipt (USAG 3 = buitenrand op de celgrens).
- `INFORM` is soms Nederlands, soms Engels; `NINFOM`/`NOBJNM` bevatten de nationale tekst (soms Fries).
- Celnaam `1R7YM009`: `1R` = producent Rijkswaterstaat (2R = Havenbedrijf Rotterdam), `7` = usage
  "River" (schaal 1:2000), `YM` = vaarwegcode, daarna een volgnummer of kilometer. Rond het IJsselmeer:
  YM001–017 IJsselmeer én Markermeer, RM001–004 randmeren, KM Ketelmeer, ZM Zwarte Meer, IJ020 het IJ,
  AR Amsterdam-Rijnkanaal (km), YS de IJssel (km), MK een Fries kanaal (km 55–100 tussen Lemmer en Burgum, vermoedelijk het Prinses Margrietkanaal).
  Zoek cellen altijd via `cellenVoorGebied`, niet op naam.
