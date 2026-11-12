# Polarbestand: afspraken voor routemodellen

Dit document is het contract tussen de polartool (`polartool/index.html`) en elk routemodel dat een polar gebruikt,
zoals Wedstrijden IJsselmeergebied (`wedstrijden/`) en de Slag in de Rondte. Een routemodel houdt zich hieraan;
verandert het formaat, dan verandert eerst dit document.

Voorbeeld met een verzonnen schip: [`voorbeeld/voorbeeldschip_polar_v1_2026-11-05.json`](voorbeeld/voorbeeldschip_polar_v1_2026-11-05.json).

## Uitgangspunten

- **Eén bestand per schip** (JSON, UTF-8), gemaakt en bijgewerkt door de polartool. De gebruiker bewaart het zelf.
- **Een routemodel heeft geen eigen invoer voor een polar meer.** De polar komt uitsluitend uit een polarbestand:
  ingeladen als bestand, of doorgegeven met "Openen in wedstrijd" (zie onder).
- **Een routemodel leest alleen wat het nodig heeft** en negeert onbekende velden. Het schrijft het bestand nooit terug.
- **Logica blijft in het routemodel.** Het bestand bevat gegevens (snelheden, diepgang, kielspeling); wat ermee gebeurt,
  zoals de waarschuwing "onvoldoende kielspeling bij deze zeilstand", regelt het routemodel.
- Instellingen die bij een berekening horen (snelheidsfactor, tijdverlies aan/uit, havenmanoeuvres, kielspeling per
  berekening) staan **niet** in het bestand, maar in het routemodel.

## Controles bij het inlezen

1. `formaat` begint met `polartool/`. Ken je het nummer niet (nu alleen `polartool/1`), weiger dan met een duidelijke melding.
2. `schip.id` en `polair.snelheid_kn` zijn aanwezig.
3. Toon na het inlezen welke polar actief is: **scheepsnaam, versie en de eerste 8 tekens van de scheeps-ID**,
   bijvoorbeeld "Polar ontvangen: Voorbeeldschip, versie 1 (ID 00000000)".

## Velden die een routemodel gebruikt

| Veld | Type | Betekenis |
|---|---|---|
| `formaat` | tekst | `polartool/1` |
| `versie` | getal | bestandsversie (v1, v2, …); elke keer opslaan geeft een nieuwe versie |
| `gemaakt_met` | tekst | versie van de polartool, ter informatie |
| `gewijzigd` | datum-tijd (ISO) | moment van opslaan van deze versie; een routemodel toont dit als datum van de polar |
| `schip.id` | tekst | vaste scheeps-ID (UUID); verandert nooit |
| `schip.naam` | tekst | scheepsnaam |
| `schip.tuigage` | `eenmaster` / `tweemaster` | nu alleen informatief |
| `schip.kruishoek` | graden | max kruishoek: kleinste ware windhoek waarop het schip zeilt |
| `schip.diepgang_m.op` | m | diepgang romp (zwaard op); dit is de bevaarbaarheidsgrens |
| `schip.diepgang_m.neer` | m | diepgang met heel zwaard |
| `schip.diepgang_m.half` | m of `null` | diepgang half zwaard; `null` als de stand niet gebruikt wordt |
| `schip.kielspeling_m` | m | standaard minimale kielspeling; het routemodel mag per berekening afwijken |
| `schip.overstagverlies_s` | s of `null` | tijdverlies per overstag (incl. zwaard wisselen); alleen gebruiken als de gebruiker dat aanzet |
| `schip.gijpverlies_s` | s of `null` | tijdverlies per gijp; idem |
| `schip.windhoogtefactor` | getal (0,8–2) | gemeten wind in de mast gedeeld door deze factor = wind op 10 m. Routemodellen rekenen met wind op 10 m en gebruiken het veld niet; een analysepagina gebruikt het om gemeten (VDR-)wind naar 10 m om te rekenen |
| `schip.windmeter_hoogte_m` | m of `null` | hoogte van de windmeter, ter toelichting bij de windhoogtefactor |
| `polair.tws_kn` | lijst | rijen: ware windsnelheid op 10 m in kn, nu 2–40 per 2 |
| `polair.twa_graden` | lijst | kolommen: ware windhoek t.o.v. de koers over de grond, vanaf de kruishoek tot 180; tot 100° per 5°, daarna per 10° |
| `polair.snelheid_kn` | tabel | bootsnelheid in kn, `[rij][kolom]` = `[tws][twa]`; geen gaten |
| `polair.zwaardstand` | lijst | per kolom `neer`, `half` of `op` |
| `polair.herkomst` | tabel | per vakje waar de waarde vandaan komt (zie onder); ter informatie of voor een betrouwbaarheidsindicatie |
| `polair.zeilstanden` | lijst | `{ naam, tot_graden }`: aan de wind, knik in de schoot, halve wind, ruime wind, voor de wind |

Lees de rijen en kolommen altijd uit `tws_kn` en `twa_graden`. Ga er niet van uit dat ze vastliggen: de kolommen hangen
af van de kruishoek van het schip, en een latere versie kan meer rijen hebben.

De overige velden (`instellingen`, `zwaard`, `handmatig_bft`, `uitgesloten`, `basis`, `bronnen`) zijn voor de polartool
zelf en bevatten onder andere alle metingen. Een routemodel gebruikt ze niet.

`handmatig_bft` bevat de handmatige schattingen van de schipper per Beaufort (Bft 1–8) en windhoek, als
`{ "B_twa": kn }`. De polartool zet ze om naar de kn-rijen van `polair.snelheid_kn` (herkomst `handmatig`). Bestanden
van vóór Polartool 0.13 hadden in plaats daarvan `handmatig` per kn-rij (`{ "tws_twa": kn }`); de polartool leest die
nog en zet ze bij het inlezen om naar Bft.

## Gebruiksregels voor de polar

Bij ware windsnelheid `tws` (kn, 10 m) en ware windhoek `twa` (graden, 0–180, t.o.v. de koers over de grond):

1. **Interpoleren:** lineair (bilineair) tussen de omringende rijen en kolommen.
2. **TWS onder de eerste rij** (2 kn): lineair naar 0 kn bij 0 kn wind.
3. **TWS boven de laatste rij** (40 kn): de laatste rij gebruiken.
4. **TWA onder de kruishoek** (`schip.kruishoek`): het schip zeilt daar niet. Kruisen op de windhoek met de beste
   snelheid naar de wind toe (VMG = snelheid × cos(twa)), gezocht binnen het raster vanaf de kruishoek.
5. **Minimumsnelheid** in de simulatie: 0,3 kn.
6. **Zwaardstand** bij `twa`: de waarde van de dichtstbijzijnde kolom. De diepgang is dan `schip.diepgang_m[stand]`
   (valt `half` op `null`, gebruik dan `neer`). Het routemodel controleert daarmee de kielspeling: is er minder water dan
   diepgang + kielspeling, dan waarschuwt het (of, voor de romp, is het punt niet bevaarbaar).

## Herkomst per vakje

| Waarde | Betekenis | Betrouwbaarheid |
|---|---|---|
| `data` | gemeten (genoeg metingen) | hoog |
| `glad` | gewogen uit gemeten buurvakjes | redelijk |
| `handmatig` | door de schipper ingevuld | schatting van de schipper |
| `bestaand` | uit een eerder ingelezen polar | als die polar |
| `geïnterpoleerd` | lineair tussen bekende vakjes | redelijk |
| `doorgetrokken` | buiten het bekende gebied, laatste bekende waarde | laag; behandel als schatting |
| `tussenwaarde` | 5°-kolom, lineair tussen de buren | als de buren |

## Openen in wedstrijd (overdracht via `postMessage`)

De polartool opent de wedstrijdpagina in een nieuw tabblad en geeft de polar door, van pagina naar pagina in de browser.
Er wordt niets opgeslagen of geüpload. De polartool stuurt alleen een versie die ook als bestand is opgeslagen.

1. De wedstrijdpagina meldt bij het laden dat ze klaar is:
   ```js
   if (window.opener) window.opener.postMessage({ type: 'polartool:klaar', protocol: 1 }, location.origin);
   ```
2. De polartool antwoordt met het hele polarbestand:
   `{ type: 'polartool:polar', protocol: 1, bestand: <polarbestand> }`
3. De wedstrijdpagina controleert het bestand (zie "Controles bij het inlezen") en antwoordt:
   - goed: `{ type: 'polartool:ontvangen', schip_id: bestand.schip.id, versie: bestand.versie }`
   - fout: `{ type: 'polartool:geweigerd', reden: '<korte uitleg>' }`

Beide kanten accepteren alleen berichten van het eigen tabblad (`event.source` is `window.opener`, of het door de
polartool geopende tabblad) en van dezelfde site (`event.origin === location.origin`). Bij een lokaal geopend bestand
(`file://`) is de origin `'null'`; dan wordt met `'*'` geantwoord, en alleen na de controle op `event.source`.

Voorbeeld van de ontvangende kant:

```js
window.addEventListener('message', e => {
  if (e.source !== window.opener || e.origin !== location.origin) return;
  if (!e.data || e.data.type !== 'polartool:polar') return;
  const o = e.data.bestand;
  if (!o || typeof o.formaat !== 'string' || !o.formaat.startsWith('polartool/') || !o.schip?.id || !o.polair?.snelheid_kn) {
    e.source.postMessage({ type: 'polartool:geweigerd', reden: 'geen geldig polarbestand' }, e.origin);
    return;
  }
  laadPolar(o);   // eigen functie van het routemodel; dezelfde als bij het inladen van een bestand
  toonMelding(`Polar ontvangen: ${o.schip.naam}, versie ${o.versie} (ID ${o.schip.id.slice(0, 8)})`);
  e.source.postMessage({ type: 'polartool:ontvangen', schip_id: o.schip.id, versie: o.versie }, e.origin);
});
if (window.opener) window.opener.postMessage({ type: 'polartool:klaar', protocol: 1 }, location.origin);
```

### Tweede weg: via de browseropslag (sinds Polartool 0.12)

Niet elke browser geeft het nieuwe tabblad een verbinding terug (`window.opener`); sommige openen de pagina zelfs in
hetzelfde tabblad. Daarom zet de polartool de polar vóór het openen ook klaar in de browseropslag van de site
(`localStorage`, alleen voor pagina's van dezelfde site):

- sleutel `polartool:overdracht`, waarde `{ protocol: 1, id, tijd, bestand }` (`tijd` in ms, `id` een willekeurige tekst).

De wedstrijdpagina leest die sleutel bij het laden:

1. Is de waarde jonger dan 2 minuten: controleren en inladen zoals hierboven, en de sleutel **verwijderen**.
2. Antwoorden onder de sleutel `polartool:overdracht:antwoord` met `{ id, type: 'polartool:ontvangen', schip_id, versie }`
   of `{ id, type: 'polartool:geweigerd', reden }`. De polartool hoort dat via het `storage`-event (alleen als hij nog openstaat).
3. Is de polar zo ingeladen, dan stuurt de pagina geen `polartool:klaar` meer; anders gaat het verder via `postMessage`.

Een oudere waarde (> 2 minuten) negeert de pagina en verwijdert ze.

Reageert een wedstrijdpagina niet binnen 15 s, dan meldt de polartool dat de pagina de polar nog niet kan ontvangen en
dat de gebruiker het bestand daar zelf moet inladen. Elke wedstrijdpagina moet daarom **ook** een polarbestand kunnen
inladen via een bestandskeuze.

Een nieuwe wedstrijdpagina aanmelden: voeg haar toe aan de lijst `WEDSTRIJDEN` in `polartool/index.html`.

## Overgang vanaf het oude scheepsbestand

Het oudere scheepsbestand (velden `naam`, `diepgang_m`, `kielspeling_m`, `zwaard`, `polair.snelheid_kn`, `keuzeknoppen`)
leest de polartool eenmalig in als startpunt. Daarna werkt een routemodel alleen nog met het polarbestand. Het oude
formaat hoeft een routemodel niet meer te ondersteunen.
