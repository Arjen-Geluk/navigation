# Bronnen: waar de IENC vandaan komt

**Vraag altijd eerst toestemming voor een download** en noem bestandsnaam, bron en grootte.
Bestanden horen in `lokaal/ienc/` (niet in de repo).

## De kaarten

Downloadpagina: https://www.vaarweginformatie.nl/frp/main/#/page/infra_enc (Rijkswaterstaat, CC-0,
dataset 55088 op data.overheid.nl). De pagina is een JavaScript-app; de lijst en de links haal je zo op:

1. Lijst met naam, datum en `fileId`:
   `https://www.vaarweginformatie.nl/frp/api/webcontent/downloads?pageId=infra/enc`
2. Downloadlink (uit `https://www.vaarweginformatie.nl/frp/api/settings`: `fddBaseUrl` + `fddDownloadPath`):
   `https://www.vaarweginformatie.nl/fdd/main/wicket/resource/org.apache.wicket.Application/downloadfileResource?fileId=<fileId>`
   Een `HEAD`-verzoek geeft de bestandsnaam (`Content-Disposition`) zonder te downloaden; de grootte staat
   meestal in de naam in de lijst.

Stand 2026-11-06:

| naam in de lijst | wat | grootte | fileId |
|---|---|---|---|
| Nederland (excl Zeeland, Waddenzee) 2026-10-05 | 109 cellen, o.a. IJsselmeer en Markermeer (YM), randmeren (RM), IJ, ARK, rivieren | 42 MB | 4789373346 |
| Waddenzee met Diepte 2026 - Week 44 | Waddenzee incl. gemeten dieptes en het vaarwater langs de Afsluitdijk | 25 MB | 4813483471 |
| Zeeland met Diepte – 2026 – Week 45 | Zeeland incl. gemeten dieptes | 47 MB | 4819484941 |
| Testbestand IENC volgens Encoding Guide versie 2.5 | 2 testcellen (Zeeland) | 1,4 MB | 4769338950 |
| Port of Rotterdam 2026-08-25 | Havenbedrijf Rotterdam (producent 2R) | | 4755324306 |

De `fileId` verandert bij elke nieuwe release: haal hem altijd opnieuw uit de lijst.
De Waddenzee- en Zeeland-releases dragen een weeknummer in de naam en lijken vaker te verschijnen dan de
Nederland-release (die van 2026-10-05 bevat cellen uitgegeven tussen 2026-08-04 en 2026-10-05). Controleer
de uitgiftedatum per cel met `controle.mjs`.

Inhoud van een zip: `ENC_ROOT/CATALOG.031`, per cel een map met `<cel>.000` en de XML-bestanden met
bedieningstijden, en een overzichtskaart (`kaart IENC's Rijkswaterstaat.pdf`).

Per punt kun je ook online kijken (handig om een twijfelgeval te controleren, niet voor een heel gebied):
ArcGIS Maritime Chart Service, identify:
`https://geo.rijkswaterstaat.nl/arcgis/rest/services/ENC/mcs_inland/MapServer/exts/MaritimeChartService/MapServer`
(WMS: `.../MaritimeChartService/WMSServer?request=GetCapabilities`).

## Codetabellen

- **IENC Feature Catalogue** (IEHG), editie 2.6 corr3, XML 740 kB:
  pagina https://editions.openecdis.org/edition-2.6-of-the-product-specification-for-inland-encs/ienc-product-specification-2.6/ienc-feature-catalogue-2.6
  (de downloadlinks staan als `<a>` op de pagina, opslag bij gitbook.io; een Markdown-versie van elke pagina krijg je door `.md`
  achter de URL te zetten, het overzicht staat in https://editions.openecdis.org/llms.txt).
- **bIENC Feature Catalogue** 1.0 (bathymetrische IENC en `lg_sdm`), XML 73 kB, op de pagina
  `edition-2.5/standard-iecdis/standard-2.5/bienc-prodspec-25/bienc-fc-10`.
- Nieuwe editie? Download (met toestemming) naar `lokaal/ienc/` en draai
  `node .claude/skills/ienc/scripts/bouw_catalogus.mjs <IENC_FC.xml> <bIENC_FC.xml>`; daarna `controle.mjs`.
- **GDAL** S-57-tabellen (terugval voor maritieme codes): zie `data/BRON.md`.

## Documentatie

| document | waar | waarvoor |
|---|---|---|
| Specificatie IENC NL v3.0 (9-12-2021), 2,4 MB | https://ienc-kennisportaal.nl/wp-content/uploads/2021/12/Specificatie-IENC-NL-V3.0-9-dec-21.pdf | NL-afspraken: celindeling, usage 7, referentievlakken (OLR, OLW, MHWS), minimale inhoud met Nederlandse termen per object |
| Inland ENC Encoding Guide, Product Specification | https://editions.openecdis.org/ (per editie) | hoe elk object gecodeerd hoort te worden |
| IENC-kennisportaal | https://ienc-kennisportaal.nl/ | toelichting per object, RIS-index (ISRS-codes) |
| RWS data-eisen ENC (set S0013): featureslijst-voor-ENCs-v1 (0,09 MB), IENC Encoding Guide (4,97 MB) | https://standaarden.rws.nl/link/set/S0013 | oudere RWS-handleidingen (2017). De site is een Mendix-app; de downloadknoppen werken niet in een automatische browser, vraag de gebruiker ze zelf op te slaan |
| S-57 editie 3.1 (IHO) | https://iho.int/ (Publications, S-57) | het onderliggende formaat |

Lokaal (na download) staat de specificatie als tekst in `lokaal/ienc/spec.txt` (`pdftotext -layout`).
