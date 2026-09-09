# Valresultat på karta – nr.fallberg.se/val

En realtidskarta över valresultat per valdistrikt i en valfri kommun, med
jämförelse mot föregående val. Byggd med **Leaflet** (karta),
**Node-RED** (all logik: hämtning från val.se, jämförelse, API) och
**WebSocket** (push av nya siffror till kartan i den takt de kommer in på
val.se).

```
Webbläsare (Leaflet + lista)
      │  REST: GET /val/api/valdistrikt?kommun=..&ar=..&valtyp=..
      │  WS:   /val/ws  (prenumerera → få uppdateringar push:ade)
      ▼
Node-RED  (flows-val.json)
      │  hämtar & cachar
      ▼
val.se  (rådata: geometri + röster per valdistrikt)
```

Innehåll i detta repo:

| Mapp | Innehåll |
|---|---|
| `web/val/` | Statiska filer för webbappen: `index.html` (välj kommun/år/valtyp), `karta.html` (Leaflet-karta + distriktslista), CSS/JS. |
| `node-red/flows-val.json` | Importerbart Node-RED-flöde: statisk filserver för `/val`, REST-API under `/val/api/*`, samt WebSocket-realtid på `/val/ws`. |
| `node-red/data/` | Referensdata: `kommuner.json` (Sveriges 290 kommuner), `valtyper.json`, `party-styles.json` (partifärger), som Node-RED läser från disk. |

## Snabbstart

1. Läs **[node-red/README.md](node-red/README.md)** – installation, var filerna
   ska ligga på servern, och (viktigast) hur du verifierar/justerar
   URL:erna mot val.se, se nästa avsnitt.
2. Importera `node-red/flows-val.json` i Node-RED, kopiera `web/val/` och
   `node-red/data/` till servern, justera två sökvägar i konfigurationsnoden
   och tryck Deploy.
3. Öppna `https://nr.fallberg.se/val/` och testa med 2022 vs 2018 (riksdag,
   region eller kommunval) för valfri kommun.

## ⚠️ Viktigt att veta innan du testar

**Både röster/mandat och kartgeometrin är verifierade end-to-end mot
riktiga filer från val.se** och fungerar redan – ingen mer gissning:

- Resultat: `Val_20220911_preliminar_1488_KF.zip` (kommunval Trollhättan
  2022) → `valHelpers.resultatUrl()`.
- Karta: `valdistrikt-riket-2026.zip` (hela rikets valdistrikt, SWEREF99 TM
  → WGS84) → `valHelpers.geoIndexForYear()`.

Enda saken att känna till: geometrin är bara inlagd för **2026** just nu
(`geoUrls` i noden "Global konfiguration + hjälpfunktioner" i
`node-red/flows-val.json`) – för andra år (2018, 2022, ...) används
2026-års distriktsgränser som fallback (de ändras sällan mellan val), vilket
flaggas som en varning i gränssnittet. Lägg till fler år i `geoUrls` om du
hittar/laddar ner motsvarande fil. Detaljer i
[node-red/README.md](node-red/README.md#5-resultat--och-geometri-urlerna-är-verifierade).

## Funktioner

- **Valfri kommun / år / valtyp** – väljs på `/val/` (riksdag, region eller
  kommunval; alla Sveriges 290 kommuner).
- **Karta per valdistrikt** – varje distrikt färgas efter ledande parti;
  distrikt som bytt ledande parti sedan förra valet får en mörkare kant.
- **Distriktslista ovanpå kartan** – innehåller *alla* distrikt, inklusive
  **uppsamlingsdistrikt** (som saknar egen utbredning och därför inte kan
  visas på kartan, men listas ändå enligt önskemål).
- **Jämförelse med föregående val** – andel, förändring i procentenheter
  och ev. partibyte visas per parti och distrikt, både i kartans popup och
  i listans detaljvy.
- **Realtid via WebSocket** – för ett pågående val (2026) pollar Node-RED
  val.se i bakgrunden och skickar bara ut det som faktiskt ändrats till de
  klienter som tittar på just den kommunen/valtypen. Slutgiltiga val (2018,
  2022) hämtas en gång och cachas.

## Testa 2022 mot 2018

Välj år **2022** i gränssnittet – appen hämtar då automatiskt 2018 som
jämförelseår (regeln är alltid *valår − 4*, eftersom svenska val hålls vart
fjärde år). Det är exakt detta läge som är tänkt att användas för att öva
och verifiera allt innan valnatten 2026, då du istället väljer år **2026**
(som pollas kontinuerligt) med 2022 som automatiskt jämförelseår.
