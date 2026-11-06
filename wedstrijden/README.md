# Wedstrijden IJsselmeergebied

Rekenpagina voor platbodemwedstrijden in het IJsselmeergebied: per wedstrijd en baan de snelste route, uit je eigen
polarbestand ([polartool](../polartool/)) en de windverwachting. Eerst de Klipperrace 3 Steden; de beurtveer en de
strontrace volgen. Vervangt op termijn [`3-stedenrace/`](../3-stedenrace/), dat als archief blijft staan.

**In opbouw** (bouwstap 7 van 10: rekenbestand en draaiboek klaar; analysepagina volgt).

Online (na publicatie): https://arjen-geluk.github.io/navigation/wedstrijden/

## Opbouw

- `index.html` — de pagina, **gebouwd** door `beheer/bouw.mjs`; niet met de hand bewerken.
- `bron/` — opmaak en code van de pagina.
- `gegevens/` — vaargebied en wedstrijdedities (JSON), centraal beheerd.
- `beheer/` — bouw-, ververs- en testscripts plus de [werkinstructie](beheer/WERKINSTRUCTIE.md).
- `test/` — `npm test`.
- [`FORMAAT.md`](FORMAAT.md) — het contract voor het rekenbestand.

Geen scheepsnamen of scheepsdata in deze map; echte data alleen lokaal in `lokaal/`.

Licentie: CC BY-NC-ND 4.0, zie [`LICENSE`](../LICENSE).
