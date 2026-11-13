# Rekenbestand: afspraken

Dit document is het contract voor het **rekenbestand** van de rekenpagina Wedstrijden IJsselmeergebied
(`wedstrijden/index.html`) en voor elke pagina die het leest, zoals de analysepagina. Verandert het formaat, dan verandert
eerst dit document.

## Uitgangspunten

- **Eén bestand per berekening** (JSON, UTF-8), gemaakt door de rekenpagina met **Rekenbestand opslaan**. De schipper
  bewaart het zelf; het is het archief en de manier om een berekening te delen.
- **Inladen geeft precies dezelfde berekening terug**: de pagina toont de uitkomst uit het bestand en rekent niet opnieuw.
  Opnieuw rekenen, bijvoorbeeld met nieuwere wind of een andere polar, is een bewuste keuze van de gebruiker.
- Het bestand bevat **alles om de berekening te herhalen**: de invoer, een kopie van het gebruikte deel van het polarbestand,
  de volledige windtabel en de editie zoals die gebruikt is (met afwijkingen en posities).
- Het bestand bevat de scheepsnaam (uit het polarbestand). Het blijft bij de gebruiker; de pagina stuurt het nergens heen.
- Een lezer gebruikt alleen wat hij nodig heeft en negeert onbekende velden.

**Bestandsnaam:** `<wedstrijd>_<datum>_<scheepsnaam>_<tijd>.json`, bijvoorbeeld `3-steden_2026-10-10_Voorbeeldschip_0815.json`
(datum van de wedstrijd, tijd van opslaan; tekens buiten letters, cijfers en `-` worden `_`).

## Controles bij het inlezen

1. `formaat` begint met `wedstrijdberekening/`. Ken je het nummer niet (nu alleen `wedstrijdberekening/1`), weiger dan.
2. `polar`, `invoer` en `uitkomst.banen` zijn aanwezig.
3. Wijkt de actieve polar af van `polar` (ander `schip.id` of andere `versie`), meld dat dan
   ("Deze berekening is gemaakt met versie 2, nu actief: versie 3") en laat de gebruiker kiezen of er opnieuw gerekend wordt.
4. Hoort de editie (`editie.sleutel`, `editie.versie`) niet bij een editie in de pagina, meld dat; de uitkomst blijft te bekijken.

## Velden

| Veld | Type | Betekenis |
|---|---|---|
| `formaat` | tekst | `wedstrijdberekening/1` |
| `gemaakt` | datum-tijd (ISO) | moment van opslaan |
| `berekend` | datum-tijd (ISO) | moment van de berekening |
| `tool` | `{ naam, versie }` | versie van de rekenpagina |
| `vaargebied` | `{ versie, datum }` | versie van het vaargebied (bodem, betonning, peilen) |
| `editie` | object | `sleutel` (bijv. `3-steden_2026`), `wedstrijd`, `jaar`, `versie`, `status` (gecontroleerd tegen welke bepalingen), `afwijkend` (true als de schipper iets heeft aangepast) |
| `editie_gebruikt` | object | de editie zoals gebruikt: `punten` (met `lat`, `lon` en `positie`: RWS, editie, verlegd of wedstrijdton), `zones`, `banen` |
| `afwijkingen` | object | wat de schipper veranderde: `punten` (verlegd), `zones` (aan/uit), `routes` (`"<baan>\|<route>"` → volgorde), `tonnen` (wedstrijdtonnen) |
| `invoer.datum`, `invoer.start`, `invoer.limiet` | tekst | wedstrijddatum (`YYYY-MM-DD`), start en finishlimiet (`HH:MM`, lokale tijd Europe/Amsterdam) |
| `invoer.baan_wl` | tekst | baan volgens de wedstrijdleiding (`K`, `M`, `L`) of leeg |
| `invoer.eenheden` | `nm` / `km` | weergave van afstanden |
| `invoer.peil` | `{ keuze, waarde_m, meting? }` | `auto`, `zomer`, `winter`, `hand` of `actueel`; waarde in m NAP. Bij `actueel`: `meting` = `{ tijd, meer, meetpunten: [{ code, naam, waarde_m, tijd }] }` (RWS-waterstand) |
| `invoer.schip` | object | `kielspeling_m`, `overstag_s` en `gijp_s` (`null` = uit), `snelheidsfactor` (1 = 100%), `max_slag` (`auto`, `geen` of NM als tekst, standaard `3`) |
| `wind` | object | `bron`, `model`, `opgehaald` (ms), `historisch`, `verschuiving_min` (+ = eerder), `aanpassingen` (per uur en plaats `{ draai, factor }`), `raster`, `punten`, `tijden` (ms, UTC), `data[punt][uur]` = `{ dir, kn, vlaag }` |
| `polar` | object | kopie van het gebruikte deel van het polarbestand (zie `polartool/FORMAAT.md`): `formaat`, `versie`, `gewijzigd`, `schip`, `polair` |
| `uitkomst.limiet` | ms | finishlimiet (UTC) |
| `uitkomst.rekentijd_ms` | getal | duur van de berekening |
| `uitkomst.banen` | object | per baan (`K`, `M`, `L`) zie hieronder |

### Per baan: `uitkomst.banen.<baan>`

`{ baan, naam, start (ms), routes: [ … ] }`, routes gesorteerd van snel naar langzaam (zeiltijd). Per route:

| Veld | Betekenis |
|---|---|
| `naam` | bijv. `Medemblik – Stavoren` |
| `punten` | `[{ id, lat, lon, zijde }]` zoals gevaren |
| `snelst_in` | in hoeveel van de zes windafwijkingen deze route het snelst was |
| `varianten` | zeiltijd (ms) per windafwijking: `links`, `rechts`, `minder`, `meer`, `later`, `eerder` |
| `res.klaar` | finish gehaald binnen de rekengrens |
| `res.start`, `res.finish` | ms (UTC) |
| `res.zeiltijd_ms`, `res.klok_ms` | zeiltijd (kloktijd min wat niet als zeiltijd telt) en kloktijd |
| `res.zeilweg_m`, `res.afstand_m` | gevaren weg en afstand in rechte lijnen tussen de punten, in m |
| `res.overstag`, `res.gijp` | aantallen |
| `res.waarschuwingen` | teksten |
| `res.rakken` | per rak: `van`, `naar`, `start`, `eind` (ms), `afstand_m`, `zeilweg_m`, `overstag`, `gijp`, `stand_s` en `zwaard_s` (seconden per zeilstand / zwaardstand), `wind` `{ dir, kn }`, `ondiep` (s per zwaardstand), `schatting`, `omweg` |
| `res.rondingen` | per merkteken met rondingszijde: `id`, `zijde`, `lat`, `lon`, `aanloop` en `vertrek` (graden), `wijze` (`ronden` of `passeren`), `draai_graden` (koerswijziging, − = bakboord). Bij een zone: `wijze` `om de zone` en `zone` (de zone-id), zonder `lat`/`lon` |
| `res.max_slag_nm` | gebruikte maximale slaglengte (`null` = geen grens); `res.slag_auto` = gekozen door het model |
| `res.onderdelen`, `res.aftrek_ms` | alleen bij een reis met tussenstops (beurtveer): per onderdeel `soort` (`zeilen`, `haven`, `sluis`, `rust`), `id`, `van`, `tot` (ms) en `telt` (telt als zeiltijd); `aftrek_ms` = de som van wat niet telt. Bij een sluis staat het eerste trackpunt na het schutten op het midden van de uitgaande lijn |
| `res.track` | geplande track, compact: `{ velden: ['t','lat','lon','koers','vaart','twa','tws','stand','zwaard'], rijen: [[…], …] }`; `t` in ms (UTC), `vaart` en `tws` in kn |

## Wijzigingen

- `wedstrijdberekening/1` (Wedstrijden 0.9, november 2026): eerste versie.
