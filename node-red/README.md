# Node-RED – installation

Flödet öppnar sin egen HTTP- och WebSocket-lyssnare (`/val/*` och `/val/ws`)
via kärnnoderna `http in`, `http response`, `websocket in`/`websocket out` –
du behöver **inte** konfigurera någon extern statisk filserver. Function-nodens
sandbox har dock inte tillgång till Node.js kärnmoduler (`fs`, `path`) eller
`require()` som standard, så de noder som behöver dem laddar sina moduler
via Function-nodens egen **"Setup"-flik** – det är redan förifyllt i
`flows-val.json` (nodernas `libs`-fält), du behöver inte fylla i något
manuellt i editorn:

- **Global konfiguration + hjälpfunktioner**: `fs`, `path`, `http`, `https`
  (all hämtning från val.se sker med Node.js inbyggda http/https-moduler,
  inte global `fetch()`, som saknas i vissa Node-RED/Node.js-miljöer),
  `adm-zip` (val.se:s filer 2022+ är zip-arkiv) och `proj4` (konverterar
  kartkoordinater från SWEREF99 TM till WGS84, se steg 5).
- **Servera statisk fil**: `fs`, `path`.
- **Hämta, normalisera och jämför** (i subflowet `HamtaValdata`): `adm-zip`
  och `xlsx` (historik.val.se:s filer för 2018 och tidigare är
  Excel-arbetsböcker, helt annat format än 2022+, se steg 5).

Detta kräver dock **ett engångsflagg i `settings.js`** samt att `adm-zip`,
`proj4` och `xlsx` faktiskt är npm-installerade (steg 0 nedan) –
`fs`/`path`/`http`/`https` är inbyggda i Node.js och kräver ingen
installation, men de tre andra är vanliga npm-paket som måste finnas i
Node-RED:s `node_modules` för att Setup-fliken ska kunna ladda dem.

Fungerar med i princip vilken Node.js-version som helst som Node-RED självt
stödjer (ingen `fetch()`-version krävs).

## 0. Slå på `functionExternalModules` och installera npm-paket (obligatoriskt)

Öppna din Node-RED `settings.js` (vanligen `~/.node-red/settings.js`) och
lägg till:

```js
functionExternalModules: true,
```

Installera sedan `adm-zip`, `proj4` och `xlsx` i samma katalog som
`settings.js` ligger i (Node-RED:s userDir, vanligen `~/.node-red`):

```sh
cd ~/.node-red
npm install adm-zip proj4 xlsx
```

**Starta om Node-RED-processen** (t.ex. `sudo systemctl restart nodered`,
eller motsvarande för hur du kör den) – det räcker **inte** med Deploy i
editorn, `settings.js` läses bara in vid processstart. Utan flaggan vägrar
Node-RED ladda modulerna som noderna begär via sin Setup-flik; utan
`npm install` hittar den inte paketen alls. Bägge ger fel i stil med att
`fs`/`path`/`AdmZip`/`proj4`/`XLSX` inte är definierade.

Om du vill se/ändra det i editorn istället för att lita på det importerade
flödet: öppna någon av noderna → fliken **Setup** → där listas redan de
moduler noden behöver – det är exakt samma sak som ligger i `libs`-fältet i
flows-val.json.

## 1. Kopiera filer till servern

Standardsökvägarna i flödet ligger under `/tmp/val-app/` (funkar på i
princip alla system, inklusive FreeBSD där det inte ens finns något `/opt`).
Kopiera dit:

```
/tmp/val-app/data/     <- innehåll från repots node-red/data/
/tmp/val-app/web/val/  <- innehåll från repots web/val/
```

`/tmp/val-app/cache/` skapas automatiskt av flödet (behöver inte kopieras).

Om du hellre vill lägga filerna på en mer varaktig plats (t.ex. om `/tmp`
töms vid omstart av servern och du inte vill behöva kopiera om dem varje
gång) går det förstås bra – notera då sökvägarna, de anges i steg 3.

## 2. Importera flödet

I Node-RED: menyn ☰ → **Import** → välj `node-red/flows-val.json` → importera
som **nya flikar** (inte i ett befintligt flöde, för att undvika
id-krockar). Du får två nya flikar:

- **Val – webb & API** – statisk filserver + REST-API.
- **Val – realtid (WebSocket)** – global konfiguration, WS-hantering och
  pollning mot val.se.

## 3. Ställ in sökvägarna

Öppna funktionsnoden **"Global konfiguration + hjälpfunktioner"** (flik
*Val – realtid*, längst upp till vänster) och ändra de tre konstanterna
högst upp:

```js
const DATA_DIR = "/tmp/val-app/data";
const WEB_ROOT = "/tmp/val-app/web/val";
const CACHE_DIR = "/tmp/val-app/cache";
```

Dessa tre matchar redan standardplatserna i steg 1 – bara att låta dem
vara om du inte flyttat filerna någon annanstans. Ändra annars till dina
egna sökvägar. `DATA_DIR`/`WEB_ROOT` behöver bara vara **läsbara**;
`CACHE_DIR` måste vara **skrivbar** (Node-RED laddar ner och cachar
val.se-filer där) – katalogen skapas automatiskt om den saknas. Cachen är
bara en optimering, så det gör inget om `/tmp` töms vid en omstart: den
byggs bara upp på nytt vid nästa hämtning. `DATA_DIR`/`WEB_ROOT` under
`/tmp` däremot måste kopieras dit igen (steg 1) om `/tmp` töms.

## 4. Deploy

Tryck **Deploy**. Noden "Starta vid deploy" (injektionsnod) kör automatiskt
och skriver ut `val-karta: konfiguration och hjälpfunktioner initierade.` i
Node-RED-loggen/debug-fönstret. Om du inte ser det raden, kolla att
sökvägarna i steg 3 faktiskt existerar och är läsbara.

## 5. Resultat- och geometri-URL:erna är verifierade

**Röster, jämförelselogik och karta är alla testade end-to-end mot riktiga
filer** från val.se (kommunval Trollhättan, både 2022 och 2018, plus den
nationella `valdistrikt-riket-2026.zip`). Du bör alltså kunna testa direkt
utan fler ändringar. Så här hänger det ihop:

**Resultat, 2022 och senare** (röster/mandat per parti) – `resultat.val.se`,
zip-arkiv med JSON:

```
https://resultat.val.se/resultatfiler/val{ÅR}/{p|s}/{kf|rf|rd}/
    Val_{ÅÅÅÅMMDD}_{preliminar|slutlig}_{KOD}_{KF|RF|RD}.zip
```

`p`/`s` = preliminär (levande år, pollas) resp. slutlig (facit, 2022+).
`kf` = kommunval (KOD = 4-siffrig kommunkod), `rf` = regionval (KOD =
2-siffrig länskod, en fil täcker alltså flera kommuner), `rd` = riksdagsval
(KOD alltid `"00"`, EN fil för hela landet). Zip:en innehåller
`..._rostfordelning_..._.json` (röster per **valdistrikt**, det vi
använder) och `..._mandatfordelning_..._.json` (mandat per kommun/valkrets,
inte per valdistrikt – används inte i kartan just nu). Inbyggt i
`valHelpers.resultatUrl()` / `electionDateSweden()`.

**Resultat, 2018 och tidigare** (`historikCutoffAr` = 2022) – helt annan
källa och helt annat format: `historik.val.se`, en Excel-arbetsbok per
valtyp och år, inte zip/JSON:

```
https://historik.val.se/val/val{ÅR}/statistik/{ÅR}_{K|L|R}_per_valdistrikt.xlsx
```

`K` = kommunval, `L` = region (hette "landsting" då), `R` = riksdag.
Arbetsboken har flikarna `"{K|L|R} antal"` (röster) och `"{K|L|R} procent"`
(andelar, radordning matchar `antal`-fliken) – en rad per valdistrikt, en
kolumn per parti. **Viktigt:** den här filens `VALDISTRIKTSKOD`-kolumn är
bara ett suffix (t.ex. `106`), inte samma 8-siffriga kod som i 2022+-filerna
(`14880106`) – `hamtaOchNormaliseraHistorik()` i "Hämta, normalisera och
jämför" återskapar samma kod (kommunkod + suffixet nollutfyllt till 4
siffror, verifierat mot både 2022 års resultat och 2026 års karta) så att
jämförelsen (`jamforbar`) fungerar över åren. Inbyggt i
`valHelpers.historikUrl()`.

**Geometri** (valdistriktens kartutbredning): till skillnad från
resultatfilerna ovan är detta INTE en förutsägbar URL-mall – det är en
CMS-genererad nedladdningslänk från val.se (asset-ID + tidsstämpel i
URL:en). Den ligger därför i en enkel lista, en rad per år, i noden
**"Global konfiguration + hjälpfunktioner"**:

```js
const geoUrls = {
    2026: "https://www.val.se/download/18.332cf48819bd61ac1513889/1785491689960/valdistrikt-riket-2026.zip"
};
```

Filen är EN geojson för hela riket (samma geometri gäller alla tre
valtyper), i SWEREF99 TM – konverteras automatiskt till WGS84
(`valHelpers.geoIndexForYear()`, med `proj4`). Om du hittar/laddar ner
motsvarande fil för fler år (t.ex. 2022 eller 2018 – sök på val.se:s sida
*Statistik och data* efter valdistriktens gränser/kartor, eller skicka
filen hit), lägg bara till en rad till i `geoUrls`. **Saknas ett år helt
används automatiskt närmaste tillgängliga år istället** (distriktsgränser
ändras sällan mellan val) – det syns då som en varning i `meta.varningar`
i API-svaret, så det är tydligt i gränssnittet att gränserna kan skilja sig
något.

Den nationella geo-filen är ~100 MB och ~6300 distrikt – att läsa in,
omprojicera och gruppera per kommun tar **~15 sekunder första gången**
(loggas som `node.warn` i debug-fönstret). Resultatet cachas sedan i minnet
för hela Node-RED-processens livstid, så alla efterföljande anrop (oavsett
kommun/valtyp) är i praktiken direkt snabba – tills processen startas om.

Testa `https://nr.fassberg.se/val/api/valdistrikt?kommun=1488&ar=2022&valtyp=kommun`
(Trollhättan, samma exempel som verifierades) direkt i webbläsaren.

## 6. Om servern körs bakom en reverse proxy (nginx m.fl.)

`/val/ws` måste proxas som en **WebSocket-uppgradering**, annars kommer
kartan att fungera men aldrig få realtidsuppdateringar. Exempel för nginx:

```nginx
location /val/ws {
    proxy_pass http://127.0.0.1:1880/val/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
location /val/ {
    proxy_pass http://127.0.0.1:1880/val/;
}
```

(Byt `1880` mot den port Node-RED faktiskt lyssnar på.)


## Justera utseendet

- **Partifärger**: redigera `node-red/data/party-styles.json` (hex-koder,
  fritt att ändra). Partier som inte finns listade (t.ex. lokala
  kommunpartier i kommunval) får automatiskt en stabil men slumpmässig
  färg i `web/val/js/partycolors.js`.
- **Vilka år som är "levande"/pollas i realtid**: `liveYears`/`finalYears`
  i "Global konfiguration"-noden.
- **Pollningsintervall**: `pollIntervalMs` i samma nod – ändra även
  injektionsnoden **"Pollningstakt (30s)"** i flödet *Val – realtid* till
  samma värde (i sekunder) om du ändrar det.
- **Kommunlistan**: `node-red/data/kommuner.json` – 290 rader,
  kod/namn/länskod/länsnamn. Genererad från Sveriges officiella
  kommunkoder; stäm gärna av mot SCB om exakthet är kritiskt.

## Flödesöversikt

**Val – webb & API**
- `GET /val`, `/val/`, `/val/*` → statisk filserver (webbappen).
- `GET /val/api/kommuner|valtyper|partier|ar` → referensdata.
- `GET /val/api/valdistrikt?kommun=..&ar=..&valtyp=..` → validerar frågan,
  anropar subflowet `HamtaValdata`, svarar med `{meta, geojson,
  uppsamlingsdistrikt}` eller ett tydligt felmeddelande (HTTP 400/502).

**Val – realtid (WebSocket)**
- `websocket in` på `/val/ws` hanterar `{"type":"subscribe","kommun":"..",
  "ar":..,"valtyp":".."}` från klienten (skickas om var ~20:e sekund som
  heartbeat; prenumerationer utan heartbeat städas bort efter 90 sekunder).
- Var 30:e sekund (justerbart) byggs en lista över unika
  kommun/år/valtyp-kombinationer som någon just nu tittar på **och** vars
  år är markerat som "levande" (`liveYears`). Varje kombination hämtas via
  `HamtaValdata`, jämförs mot senast utskickade version, och bara det som
  ändrats skickas ut till just de klienter som prenumererar på den
  kombinationen.

**Subflow `HamtaValdata`** (återanvänds av båda flikarna)
- Hämtar geometrifil + resultatfil för valt år, samt resultatfil för
  jämförelseåret (år − 4), normaliserar båda till ett gemensamt format,
  slår ihop resultat med geometri per distriktskod, och beräknar
  förändring per parti samt ev. partibyte. Distrikt utan matchande
  geometri (uppsamlingsdistrikt) läggs i en separat lista istället för i
  GeoJSON-featurelistan.
