# Bron van de codetabellen

De CSV-bestanden in deze map komen ongewijzigd uit GDAL, tag `v3.10.0`, map
`ogr/ogrsf_frmts/s57/data/` (https://github.com/OSGeo/gdal). GDAL valt onder de MIT-licentie;
deze bestanden vallen niet onder de CC BY-NC-ND-licentie van de rest van de repo.

| bestand | inhoud |
|---|---|
| `s57objectclasses.csv` | objectklassen: code (OBJL), naam, acroniem, attributen per klasse, primitieven. Codes 1–159 en 300+ uit S-57 (IHO), 17000+ uit de Inland ENC-uitbreiding (kleine letters, bijv. `wtwaxs`, `resare`) |
| `s57attributes.csv` | attributen: code (ATTL), naam, acroniem, type (E enum, L lijst, F float, I integer, A/S tekst), klasse |
| `s57expectedinput.csv` | toegestane waarden per enum-/lijstattribuut met omschrijving (bijv. RESTRN 7 = "entry prohibited") |
| `s57agencies.csv` | producentcodes (AGEN) |

Ophalen opnieuw (alleen na akkoord): `https://raw.githubusercontent.com/OSGeo/gdal/v3.10.0/ogr/ogrsf_frmts/s57/data/<bestand>`.
