# Polartool

Polar (polair diagram) voor een platbodem met zijzwaarden opbouwen, verfijnen en exporteren als invoer voor de
routemodellen. Invoer: handmatig ingevulde waarden, een bestaande polar en VDR-logs uit OpenCPN (NMEA 0183).
Uitvoer: één JSON-polarbestand per schip.

Online: https://arjen-geluk.github.io/navigation/polartool/

- Alles gebeurt in de browser: VDR-bestanden worden lokaal verwerkt en nergens geüpload; de tool bewaart niets.
- Aanname: stilstaand water (snelheid over de grond), geen zeilvoering als variabele.
- Ware wind uit schijnbare wind + kompaskoers, per 10 s, omgerekend naar 10 m met de windhoogtefactor uit het profiel.
- Uitleg over rekenmethode, filters en opnemen met de VDR-plugin: tabblad **Uitleg** in de tool.
- Bestandsformaat en afspraken voor routemodellen: [FORMAAT.md](FORMAAT.md).
- Voorbeeld met een verzonnen schip: [voorbeeld/](voorbeeld/).

Echte VDR-logs en scheepsbestanden horen niet in deze repo. Bewaar ze lokaal, bijvoorbeeld in een map `lokaal/`
(die negeert git).
