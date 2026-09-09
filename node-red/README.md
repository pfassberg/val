# Node-RED – installation

Flödet öppnar sin egen HTTP- och WebSocket-lyssnare (`/val/*` och `/val/ws`)
via kärnnoderna `http in`, `http response`, `websocket in`/`websocket out` –
du behöver **inte** konfigurera någon extern statisk filserver. Function-nodens
sandbox har dock inte tillgång till Node.js kärnmoduler (`fs`, `path`) eller
`require()` som standard, så de noder som behöver dem laddar sina moduler
via Function-nodens egen **"Setup"-flik** – det är redan förifyllt i
`flows-val.json` (nodernas `libs`-fält), du behöver inte fylla i något
manuellt i editorn:

- **Global konfiguration + hjälpfunktioner**: `fs`, `path`, `adm-zip`
  (val.se:s filer är zip-arkiv) och `proj4` (konverterar kartkoordinater
  från SWEREF99 TM till WGS84, se steg 5).
- **Servera statisk fil**: `fs`, `path`.
- **Hämta, normalisera och jämför** (i subflowet `HamtaValdata`): `adm-zip`.

Detta kräver dock **ett engångsflagg i `settings.js`** samt att `adm-zip`
och `proj4` faktiskt är npm-installerade (steg 0 nedan) – `fs`/`path` är
inbyggda i Node.js och kräver ingen installation, men de andra två är
vanliga npm-paket som måste finnas i Node-RED:s `node_modules` för att
Setup-fliken ska kunna ladda dem.

Kräver **Node.js 18 eller senare** (för global `fetch()` i funktionsnoderna
– se avsnittet [Om Node.js-versionen är äldre](#om-nodejs-versionen-är-äldre-än-18)
om det inte stämmer på din server).

## 0. Slå på `functionExternalModules` och installera npm-paket (obligatoriskt)

Öppna din Node-RED `settings.js` (vanligen `~/.node-red/settings.js`) och
lägg till:

```js
functionExternalModules: true,
```

Installera sedan `adm-zip` och `proj4` i samma katalog som `settings.js`
ligger i (Node-RED:s userDir, vanligen `~/.node-red`):

```sh
cd ~/.node-red
npm install adm-zip proj4
```

**Starta om Node-RED-processen** (t.ex. `sudo systemctl restart nodered`,
eller motsvarande för hur du kör den) – det räcker **inte** med Deploy i
editorn, `settings.js` läses bara in vid processstart. Utan flaggan vägrar
Node-RED ladda modulerna som noderna begär via sin Setup-flik; utan
`npm install` hittar den inte paketen alls. Bägge ger fel i stil med att
`fs`/`path`/`AdmZip`/`proj4` inte är definierade.

Om du vill se/ändra det i editorn istället för att lita på det importerade
flödet: öppna någon av noderna → fliken **Setup** → där listas redan de
moduler noden behöver – det är exakt samma sak som ligger i `libs`-fältet i
flows-val.json.

## 1. Kopiera filer till servern

Lägg de två mapparna någonstans Node-RED-processen kan läsa (och skriva en
cache-undermapp i), t.ex.:

```
/opt/nodered/val/data/     <- innehåll från repots node-red/data/
/opt/nodered/val/web/val/  <- innehåll från repots web/val/
```

(Vilka sökvägar du än väljer, notera dem – de anges i steg 3.)

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
const DATA_DIR = "/opt/nodered/val/data";
const WEB_ROOT = "/opt/nodered/val/web/val";
const CACHE_DIR = "/tmp/val-cache";
```

`DATA_DIR` och `WEB_ROOT` ska peka på sökvägarna du valde i steg 1 – de
behöver bara vara **läsbara** för Node-RED-processen. `CACHE_DIR` måste
däremot vara **skrivbar** (Node-RED laddar ner och cachar val.se-filer där);
`/tmp/val-cache` funkar i de flesta miljöer, men om din server/container
begränsar var processen får skriva (t.ex. nekar `/opt`), byt till en
sökväg du vet är skrivbar. Cachen är bara en optimering – om katalogen
töms vid omstart byggs den bara upp på nytt vid nästa hämtning, så det gör
inget om den ligger under `/tmp`.

## 4. Deploy

Tryck **Deploy**. Noden "Starta vid deploy" (injektionsnod) kör automatiskt
och skriver ut `val-karta: konfiguration och hjälpfunktioner initierade.` i
Node-RED-loggen/debug-fönstret. Om du inte ser det raden, kolla att
sökvägarna i steg 3 faktiskt existerar och är läsbara.

## 5. Resultat- och geometri-URL:erna är verifierade

**Både röster och karta är testade end-to-end mot riktiga filer** från
val.se (kommunval Trollhättan 2022, plus den nationella
`valdistrikt-riket-2026.zip`) – se `node-red/README.md`-historiken/committarna
om du vill se exakt vilka exempel. Du bör alltså kunna testa direkt utan
fler ändringar. Så här hänger det ihop:

**Resultat** (röster/mandat per parti):

```
https://resultat.val.se/resultatfiler/val{ÅR}/{p|s}/{kf|rf|rd}/
    Val_{ÅÅÅÅMMDD}_{preliminar|slutlig}_{KOD}_{KF|RF|RD}.zip
```

`p`/`s` = preliminär (levande år, pollas) resp. slutlig (facit, 2018/2022).
`kf` = kommunval (KOD = 4-siffrig kommunkod), `rf` = regionval (KOD =
2-siffrig länskod, en fil täcker alltså flera kommuner), `rd` = riksdagsval
(KOD alltid `"00"`, EN fil för hela landet). Zip:en innehåller
`..._rostfordelning_..._.json` (röster per **valdistrikt**, det vi
använder) och `..._mandatfordelning_..._.json` (mandat per kommun/valkrets,
inte per valdistrikt – används inte i kartan just nu). Inbyggt i
`valHelpers.resultatUrl()` / `electionDateSweden()`.

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

Testa `https://nr.fallberg.se/val/api/valdistrikt?kommun=1488&ar=2022&valtyp=kommun`
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

## Om Node.js-versionen är äldre än 18

Funktionsnoderna använder global `fetch()`. Om `node -v` på servern visar
under 18 finns två alternativ:

- Enklast: uppgradera Node.js (Node-RED stödjer och rekommenderar aktiva
  LTS-versioner).
- Alternativt: byt ut `H.fetchJson(...)`-anropen i subflowet mot vanliga
  `http request`-noder (dra in noden, sätt `url` till `msg.url`, `Return`
  till *a parsed JSON object*, koppla in/ut runt anropen) – lite fler noder
  men samma resultat.

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
