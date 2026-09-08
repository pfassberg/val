# Node-RED – installation

Flödet öppnar sin egen HTTP- och WebSocket-lyssnare (`/val/*` och `/val/ws`)
via kärnnoderna `http in`, `http response`, `websocket in`/`websocket out` –
du behöver **inte** konfigurera någon extern statisk filserver. Function-nodens
sandbox har dock inte tillgång till Node.js kärnmoduler (`fs`, `path`) eller
`require()` som standard, så de noder som behöver dem (`Global konfiguration
+ hjälpfunktioner`, `Servera statisk fil`, och `Hämta, normalisera och
jämför` i subflowet `HamtaValdata`, som även laddar zip-biblioteket
`adm-zip` – val.se:s resultatfiler är zip-arkiv) laddar sina moduler via
Function-nodens egen **"Setup"-flik** – det är redan förifyllt i
`flows-val.json` (nodernas `libs`-fält), du behöver inte fylla i något
manuellt i editorn.

Detta kräver dock **ett engångsflagg i `settings.js`** samt att `adm-zip`
faktiskt är npm-installerat (steg 0 nedan) – `fs`/`path` är inbyggda i
Node.js och kräver ingen installation, men `adm-zip` är ett vanligt
npm-paket som måste finnas i Node-RED:s `node_modules` för att Setup-fliken
ska kunna ladda det.

Kräver **Node.js 18 eller senare** (för global `fetch()` i funktionsnoderna
– se avsnittet [Om Node.js-versionen är äldre](#om-nodejs-versionen-är-äldre-än-18)
om det inte stämmer på din server).

## 0. Slå på `functionExternalModules` och installera `adm-zip` (obligatoriskt)

Öppna din Node-RED `settings.js` (vanligen `~/.node-red/settings.js`) och
lägg till:

```js
functionExternalModules: true,
```

Installera sedan `adm-zip` i samma katalog som `settings.js` ligger i
(Node-RED:s userDir, vanligen `~/.node-red`):

```sh
cd ~/.node-red
npm install adm-zip
```

**Starta om Node-RED-processen** (t.ex. `sudo systemctl restart nodered`,
eller motsvarande för hur du kör den) – det räcker **inte** med Deploy i
editorn, `settings.js` läses bara in vid processstart. Utan flaggan vägrar
Node-RED ladda modulerna som noderna begär via sin Setup-flik; utan
`npm install adm-zip` hittar den inte paketet alls. Bägge ger fel i stil
med att `fs`/`path`/`AdmZip` inte är definierade.

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

## 5. Resultat-URL:erna är verifierade – geometrin (kartan) återstår

**Röster/mandat är klart och testat mot en riktig fil** (kommunval
Trollhättan 2022). URL-strukturen är:

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
inte per valdistrikt – används inte i kartan just nu). Allt detta ligger
redan i `valHelpers.resultatUrl()` / `electionDateSweden()` i noden
**"Global konfiguration + hjälpfunktioner"**, och tolkningen i subflowet
**HamtaValdata** → funktionsnoden **"Hämta, normalisera och jämför"**.

**Det som fortfarande saknas är geometrin** – valdistriktens
kartutbredning (polygoner) ligger inte i resultatfilerna ovan. `urls.geo` i
"Global konfiguration + hjälpfunktioner" är fortfarande en placeholder:

```js
const urls = {
    geo: "https://www.val.se/PLACEHOLDER-VERIFIERA/geodata/{ar}/{lan_kod}.json"
};
```

Så här hittar du den (samma teknik som gav oss resultat-URL:erna ovan):
sök på val.se:s sida *Statistik och data* efter valdistriktens
gränser/kartor (nämns där som GeoJSON i SWEREF99 TM, en fil per
län/region), eller leta efter en `index.md5`-liknande fil under
`resultat.val.se` eller en annan del av val.se. Uppdatera sedan `urls.geo`
(`{ar}`/`{lan_kod}` byts ut automatiskt) och, om fältnamnen i den filen
inte matchar, `pickField`-kandidaterna för geometrin i "Hämta, normalisera
och jämför" (sök på `distriktskod` i den funktionen – felmeddelandet
listar de faktiska fältnamnen om det inte hittar rätt).

Fram tills dess svarar `/val/api/valdistrikt` med en tydlig varning
(`meta.varningar`) och en tom karta, men **listan och alla siffror fungerar
redan** eftersom uppsamlingsdistrikt (och i praktiken alla distrikt, tills
geometrin finns) hamnar i `uppsamlingsdistrikt`-listan när ingen matchande
geometri hittas.

Testa `https://nr.fallberg.se/val/api/valdistrikt?kommun=1488&ar=2022&valtyp=kommun`
(Trollhättan, samma exempel som verifierades) direkt i webbläsaren för att se
resultatet redan nu.

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
