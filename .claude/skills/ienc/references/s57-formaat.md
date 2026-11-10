# Hoe een S-57-cel in elkaar zit

Achtergrond bij `scripts/iso8211.mjs` en `scripts/s57.mjs`: lees dit bij een fout in de lezer, een
nieuw soort bestand, of de vraag "waarom zelf lezen en niet GDAL".

## Waarom een eigen lezer

- De cellen zijn klein (≤ 5 MB per cel volgens de standaard) en het formaat ligt sinds 2000 vast (S-57 editie 3.1).
- De hele lezer (`iso8211.mjs` + `s57.mjs`) is ±470 regels zonder afhankelijkheden; de 109 cellen van een release lezen kost 3 s.
- GDAL/ogr2ogr zou werken (`ogr2ogr -f GeoJSON uit.json 1R7YM001.000 LNDARE`), maar vraagt een installatie
  buiten Node, kent niet alle IENC-2.6-codes (17021 `ponton`, 17029 `boylat`, 18001 `lg_sdm` ontbreken in
  GDAL 3.10) en past niet in het ververs-script dat alleen Node gebruikt.
- De ArcGIS Maritime Chart Service van RWS geeft objecten per punt (identify), niet per gebied.

## Laag 1: ISO/IEC 8211

Een bestand is een reeks records. Het eerste record is de **DDR** (data descriptive record): de beschrijving
van alle velden. Daarna volgen de **DR's** (data records) met de waarden.

Elk record: `leader` (24 bytes) + `directory` + `field area`.

| leader-positie | betekenis |
|---|---|
| 0–4 | recordlengte |
| 6 | `L` = DDR, `D`/`R` = data record |
| 12–16 | begin van de field area |
| 20, 21, 23 | aantal cijfers voor veldlengte, veldpositie, tag |

De directory is een reeks `tag + lengte + positie`, afgesloten met `0x1e`. Velden eindigen op `0x1e`,
subvelden zonder vaste breedte op `0x1f`.

In de DDR heeft elk veld: veldcontroles (9 tekens), naam, `0x1f`, **array-descriptor** (labels gescheiden door `!`,
beginnend met `*` als de groep herhaalt), `0x1f`, **formaat** zoals `(b11,b14,2b24,A,R(4),B(40))`:

| formaat | betekenis |
|---|---|
| `A`, `I`, `R` | tekst, geheel getal, reëel getal als tekst; zonder breedte afgesloten met `0x1f` |
| `A(8)` | vaste breedte |
| `b1w` / `b2w` | binair geheel getal, unsigned/signed, `w` bytes, little-endian |
| `B(40)` | bitveld van 40 bits (5 bytes) |
| `2b24` | twee keer `b24` |

## Laag 2: S-57-records

| veld | record | inhoud |
|---|---|---|
| `DSID`, `DSSI` | 1e record | celnaam, editie (`EDTN`), update (`UPDN`), uitgiftedatum (`ISDT`), S-57-editie, producent (`AGEN` 7979 = Rijkswaterstaat, code 1R); `NALL` = lexicaal niveau nationale tekst (2 = UCS-2) |
| `DSPM` | 2e record | `HDAT` 2 = WGS84, `CSCL` compilatieschaal (2000), `COMF` vermenigvuldiger coördinaten (10⁷), `SOMF` diepten (10) |
| `VRID` (+ `SG2D`/`SG3D`, `VRPT`, `ATTV`) | vectorrecord | RCNM 110 losse knoop, 120 verbonden knoop, 130 rand (edge), 140 vlak (niet gebruikt bij chain-node) |
| `FRID` (+ `FOID`, `ATTF`, `NATF`, `FFPT`, `FSPT`) | featurerecord | `PRIM`, `OBJL`, attributen, verwijzingen naar vectoren (`FSPT`) en andere features (`FFPT`) |

- Coördinaten: `SG2D` = paren `YCOO, XCOO` (let op: eerst y!), delen door `COMF`.
  `SG3D` (dieptepeilingen) heeft een derde waarde `VE3D`, delen door `SOMF`.
- `NAME` (B(40)) = 1 byte RCNM + 4 bytes RCID: de sleutel van een vectorrecord.
- `LNAM` (B(64)) = AGEN (2) + FIDN (4) + FIDS (2): de wereldwijd unieke sleutel van een feature.
- `ATTF` = attributen als tekst (`ATTL` code + `ATVL` waarde); `NATF` idem in de nationale tekenset.

## Topologie: van randen naar lijnen en vlakken

De RWS-cellen gebruiken **chain-node**-topologie (`DSSI.DSTR` = 2):

- Een **rand** (RCNM 130) heeft via `VRPT` een beginknoop (`TOPI` 1) en eindknoop (`TOPI` 2), allebei
  verbonden knopen (120), en daartussen de tussenpunten in `SG2D`.
- Een **lijnfeature** (PRIM 2) verwijst met `FSPT` naar randen met `ORNT` 1 (vooruit) of 2 (achteruit).
- Een **vlakfeature** (PRIM 3) verwijst naar randen met `ORNT` en `USAG`: 1 = buitenrand, 2 = binnenrand (gat),
  3 = buitenrand die op de celgrens is afgesneden. `MASK` 1 = rand niet tekenen (celgrens).

`geometrie()` in `s57.mjs` rijgt randen aan elkaar **op knoop-id** (niet op coördinaten), houdt USAG 1 en 3
samen als buitenring, sluit ringen en draait ze naar RFC 7946 (buiten tegen de klok in). Gaten worden
toegewezen aan de buitenring waar hun eerste punt in ligt. `controle.mjs` telt ringen die niet via de
knopen sluiten; in de release van 2026-10-05 zijn dat er 0 van 74.337.

## Catalogus

`CATALOG.031` is zelf een ISO 8211-bestand met per bestand een `CATD`-veld: `FILE` (relatief pad met `\`),
`IMPL` (BIN/ASC/TXT), en voor cellen `SLAT`, `WLON`, `NLAT`, `ELON` (omhullende). `leesCatalogus()` geeft
alleen de `.000`-cellen terug.

## Wat de lezer (nog) niet doet

- **Updates** (`.001`, `.002`, …): records met `RUIN` 2/3 en de veldinstructies `SGCC`, `VRPC`, `FSPC`, `FFPC`.
  Niet nodig zolang RWS complete releases levert; `leesCel` stopt met een duidelijke fout als het een
  updaterecord tegenkomt. Bouw het pas als een bron alleen updates levert.
- **Vlakrecords** (RCNM 140, full topology) en **ASCII-implementatie**: komen in de IENC niet voor.
- **Samenvoegen over celgrenzen**: doe dat in de gebruiker (bijv. ververs-script), per klasse.
