# Node-RED – installation

Flödet öppnar sin egen HTTP- och WebSocket-lyssnare (`/val/*` och `/val/ws`)
via kärnnoderna `http in`, `http response`, `websocket in`/`websocket out` –
du behöver **inte** konfigurera någon extern statisk filserver. Function-nodens
sandbox har dock inte tillgång till Node.js kärnmoduler (`fs`, `path`) eller
`require()` som standard, så de två noder som behöver filsystemet (`Global
konfiguration + hjälpfunktioner` och `Servera statisk fil`) laddar `fs` och
`path` via Function-nodens egen **"Setup"-flik** – det är redan förifyllt i
`flows-val.json` (nodernas `libs`-fält), du behöver inte fylla i något
manuellt i editorn.

Detta kräver dock **ett engångsflagg i `settings.js`** (steg 0 nedan) – det
är Node-RED:s inbyggda, avsedda mekanism för att en Function-nod ska få
ladda moduler via Setup-fliken, och kräver ingen egen `require()`-kod från
dig, bara att funktionen är påslagen.

Kräver **Node.js 18 eller senare** (för global `fetch()` i funktionsnoderna
– se avsnittet [Om Node.js-versionen är äldre](#om-nodejs-versionen-är-äldre-än-18)
om det inte stämmer på din server).

## 0. Slå på `functionExternalModules` (obligatoriskt)

Öppna din Node-RED `settings.js` (vanligen `~/.node-red/settings.js`) och
lägg till:

```js
functionExternalModules: true,
```

**Starta om Node-RED-processen** (t.ex. `sudo systemctl restart nodered`,
eller motsvarande för hur du kör den) – det räcker **inte** med Deploy i
editorn, `settings.js` läses bara in vid processstart. Utan detta steg
vägrar Node-RED ladda modulerna som noderna "Global konfiguration +
hjälpfunktioner" och "Servera statisk fil" begär via sin Setup-flik, och du
får ett fel i stil med att `fs`/`path` inte är definierade.

Om du vill se/ändra det i editorn istället för att lita på det importerade
flödet: öppna någon av de två noderna → fliken **Setup** → där listas redan
modulen `fs` importerad som `fs` (och `path` som `path`) – det är exakt
samma sak som ligger i `libs`-fältet i flows-val.json.

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

## 5. Verifiera val.se-URL:er

**Detta är det enda steget som inte kunde testas i förväg** (val.se gick
inte att nå från miljön där flödet skrevs). Så här verifierar du på ~5 min:

1. Gå till val.se → *Valresultat och statistik → Statistik och data* och
   öppna sidan för rådata (2002–2022 för historiska val, "Rådata val 2026"
   för valnatten).
2. Ladda ner/öppna en fil för ett valår (t.ex. 2022), en valtyp (riksdag)
   och ett län – notera den **exakta URL:en** samt vilka fältnamn filen
   faktiskt använder (t.ex. heter distriktskoden `"distriktskod"` eller
   något annat?).
   - Alternativ metod: öppna `resultat.val.se` i webbläsaren, tryck F12 →
     fliken *Network*, välj en kommun/distrikt i deras egna gränssnitt och
     titta på vilka JSON-anrop som görs. Det är samma data vi vill åt.
3. Öppna funktionsnoden **"Global konfiguration + hjälpfunktioner"** igen
   och uppdatera:

   ```js
   const urls = {
       geo: "https://www.val.se/.../geodata/{ar}/{lan_kod}.json",
       resultat: "https://www.val.se/.../radata/{ar}/{valtyp}/{lan_kod}.json"
   };
   ```

   `{ar}`, `{lan_kod}` och `{valtyp}` byts automatiskt ut mot rätt värden
   (`valtyp` blir `riksdag`/`region`/`kommun` – justera till val.se:s egna
   beteckningar om de skiljer sig, t.ex. i en liten mappningstabell direkt
   i URL-mallens ifyllnad).

4. Deploya och testa `https://nr.fallberg.se/val/api/valdistrikt?kommun=1281&ar=2022&valtyp=riksdag`
   (byt `1281` mot valfri kommunkod) direkt i webbläsaren.
   - **Om det funkar:** du får ett JSON-svar med `meta`, `geojson` och
     `uppsamlingsdistrikt`.
   - **Om fältnamnen inte stämmer:** du får ett tydligt felmeddelande i
     stil med `Hittade inget av fälten [distriktskod, distrikt_kod, ...].
     Faktiska fält i objektet: [omrKod, ...]`. Öppna då subflowet
     **HamtaValdata** → funktionsnoden **"Hämta, normalisera och jämför"**
     och lägg till det riktiga fältnamnet **först** i respektive
     `pickField(...)`-anrop (sök på `distriktskod`, `partiKod`, `röster`,
     `andel`, `mandat`, `valdeltagande`, `kommunkod` – alla har egna
     kandidatlistor att komplettera).

Den här normaliseringen behöver bara stämma på **ett** ställe (subflowet),
sedan fungerar det för alla kommuner/år/valtyper.

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
