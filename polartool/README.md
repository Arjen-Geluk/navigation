# Polartool

Polair diagram voor een platbodem met zijzwaarden opbouwen, verfijnen en exporteren als invoer voor de routemodellen.
Invoer: handmatig ingevulde waarden en VDR-logs uit OpenCPN (NMEA 0183). Uitvoer: één JSON-polarbestand per schip.

Online: https://arjen-geluk.github.io/navigation/polartool/

- Alles gebeurt in de browser: VDR-bestanden worden lokaal verwerkt en nergens geüpload; de tool bewaart niets.
- Aanname: stilstaand water (snelheid over de grond), geen zeilvoering als variabele.
- Ware wind wordt omgerekend naar 10 m hoogte met de windhoogtefactor uit het scheepsprofiel.

Echte VDR-logs en scheepsbestanden horen niet in deze repo. Bewaar ze lokaal, bijvoorbeeld in een map `lokaal/`
(die negeert git).
