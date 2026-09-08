(function () {
  "use strict";

  const params = new URLSearchParams(location.search);
  const kommunKod = params.get("kommun");
  const ar = parseInt(params.get("ar"), 10);
  const valtyp = params.get("valtyp");

  const els = {
    pageTitle: document.getElementById("pageTitle"),
    pageSubtitle: document.getElementById("pageSubtitle"),
    liveBadge: document.getElementById("liveBadge"),
    updatedAt: document.getElementById("updatedAt"),
    backLink: document.getElementById("backLink"),
    errorBanner: document.getElementById("errorBanner"),
    listPanel: document.getElementById("listPanel"),
    panelToggle: document.getElementById("panelToggle"),
    listFilter: document.getElementById("listFilter"),
    listBody: document.getElementById("listBody"),
    detail: document.getElementById("detail")
  };

  els.backLink.href = "index.html?" + new URLSearchParams({ kommun: kommunKod || "", ar: ar || "", valtyp: valtyp || "" }).toString();

  if (!kommunKod || !ar || !valtyp) {
    showError("Saknar kommun/år/valtyp i länken. Gå tillbaka och välj igen.");
    return;
  }

  // ---------------------------------------------------------------- state
  const state = {
    meta: null,
    featuresByKod: new Map(), // kod -> { layer, properties }
    listOnlyByKod: new Map(), // kod -> properties
    selectedKod: null,
    sortKey: "namn",
    sortDir: 1,
    filterText: ""
  };

  const map = L.map("map", { zoomControl: true }).setView([62.0, 15.0], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap-bidragsgivare"
  }).addTo(map);
  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "legend");
    div.innerHTML = "Laddar…";
    return div;
  };
  legend.addTo(map);

  let geoLayer = null;

  function showError(text) {
    els.errorBanner.textContent = text;
    els.errorBanner.style.display = "block";
  }
  function clearError() {
    els.errorBanner.style.display = "none";
  }

  // ---------------------------------------------------------------- header
  function updateHeader() {
    const m = state.meta;
    if (!m) return;
    const valtypNamn = { riksdag: "Riksdagsval", region: "Regionval", kommun: "Kommunval" }[m.valtyp] || m.valtyp;
    els.pageTitle.textContent = m.kommun.namn + " — " + valtypNamn + " " + m.ar;
    els.pageSubtitle.textContent = m.jamforAr ? "jämfört med " + m.jamforAr : "ingen jämförelse tillgänglig";
    document.title = m.kommun.namn + " " + m.ar + " – Valresultat";

    els.liveBadge.style.display = "inline-flex";
    if (m.ar_live) {
      els.liveBadge.className = "badge live";
      els.liveBadge.innerHTML = '<span class="dot"></span> LIVE';
    } else {
      els.liveBadge.className = "badge final";
      els.liveBadge.innerHTML = '<span class="dot"></span> Slutresultat';
    }
    if (m.senast_uppdaterad) {
      const d = new Date(m.senast_uppdaterad);
      els.updatedAt.textContent = "Uppdaterad " + d.toLocaleTimeString("sv-SE");
    }
    if (m.varningar && m.varningar.length) {
      showError(
        "Vissa data kunde inte hämtas/tolkas korrekt (kontrollera URL-mallar/fältnamn i Node-RED-konfigurationen): " +
          m.varningar.join(" | ")
      );
    } else {
      clearError();
    }
  }

  // ---------------------------------------------------------------- styling
  function fillOpacityFor() {
    return 0.75;
  }
  function styleForProps(props) {
    return {
      fillColor: PartyColors.color(props.ledandeParti),
      fillOpacity: fillOpacityFor(),
      color: props.partibyte ? "#222" : "#ffffff",
      weight: props.partibyte ? 3 : 1
    };
  }
  function highlightStyle(props) {
    const base = styleForProps(props);
    base.weight = 4;
    base.color = "#0b4f87";
    return base;
  }

  function fmtPct(v) {
    if (v === null || v === undefined || isNaN(v)) return "–";
    return v.toFixed(1).replace(".", ",") + "%";
  }
  function fmtDelta(v) {
    if (v === null || v === undefined || isNaN(v)) return "";
    const sign = v >= 0 ? "▲" : "▼";
    const cls = v >= 0 ? "delta-up" : "delta-down";
    return '<span class="' + cls + '">' + sign + " " + Math.abs(v).toFixed(1).replace(".", ",") + " pp</span>";
  }

  function buildDetailHtml(props) {
    const rows = props.roster
      .slice()
      .sort((a, b) => b.andel - a.andel)
      .map((p) => {
        return (
          "<tr><td><span class=\"chip\" style=\"background:" +
          PartyColors.color(p.parti) +
          '"></span>' +
          PartyColors.name(p.parti) +
          "</td><td>" +
          (p.röster ?? "–") +
          "</td><td>" +
          fmtPct(p.andel) +
          "</td><td>" +
          fmtDelta(p.forandring) +
          "</td><td>" +
          (p.mandat ?? "–") +
          "</td></tr>"
        );
      })
      .join("");

    let warn = "";
    if (!props.jamforbar) {
      warn = '<div style="color:#8a5000">⚠ Ej jämförbart med föregående val (nytt/ändrat distrikt).</div>';
    }
    let noGeo = "";
    if (props.typ === "uppsamling") {
      noGeo = '<div style="color:#777">Uppsamlingsdistrikt – har ingen geografisk utbredning och visas inte på kartan.</div>';
    }

    return (
      "<h3>" +
      props.namn +
      ' <span class="tag-mini">' +
      props.kod +
      "</span></h3>" +
      '<div class="meta-line">Valdeltagande: ' +
      fmtPct(props.valdeltagande) +
      (props.jamforbar && props.valdeltagande_forra !== null
        ? " (föregående val: " + fmtPct(props.valdeltagande_forra) + ")"
        : "") +
      "</div>" +
      warn +
      noGeo +
      '<table><thead><tr><th>Parti</th><th>Röster</th><th>Andel</th><th>Förändring</th><th>Mandat</th></tr></thead><tbody>' +
      rows +
      "</tbody></table>"
    );
  }

  // ---------------------------------------------------------------- map layer
  function onEachFeature(feature, layer) {
    const kod = feature.properties.kod;
    layer.on("click", () => selectDistrict(kod));
  }

  function renderGeoJson(geojson, isFirstLoad) {
    if (geoLayer) map.removeLayer(geoLayer);
    state.featuresByKod.clear();

    geoLayer = L.geoJSON(geojson, {
      style: (f) => styleForProps(f.properties),
      onEachFeature
    }).addTo(map);

    geoLayer.eachLayer((layer) => {
      const kod = layer.feature.properties.kod;
      state.featuresByKod.set(kod, { layer, properties: layer.feature.properties });
      layer.bindPopup(buildDetailHtml(layer.feature.properties));
    });

    if (isFirstLoad && geoLayer.getBounds().isValid()) {
      map.fitBounds(geoLayer.getBounds(), { padding: [20, 20] });
    }
    updateLegend();
  }

  function updateLegend() {
    const seen = new Map();
    for (const { properties } of state.featuresByKod.values()) {
      if (!seen.has(properties.ledandeParti)) seen.set(properties.ledandeParti, 0);
      seen.set(properties.ledandeParti, seen.get(properties.ledandeParti) + 1);
    }
    const container = document.querySelector(".legend");
    if (!container) return;
    if (seen.size === 0) {
      container.innerHTML = "Ingen data ännu.";
      return;
    }
    const items = [...seen.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(
        ([parti, n]) =>
          '<div><span class="chip" style="background:' +
          PartyColors.color(parti) +
          '"></span>' +
          PartyColors.name(parti) +
          " (" +
          n +
          ")</div>"
      )
      .join("");
    container.innerHTML = "<strong>Ledande parti per distrikt</strong>" + items;
  }

  // ---------------------------------------------------------------- list
  function combinedRows() {
    const rows = [];
    for (const { properties } of state.featuresByKod.values()) rows.push(properties);
    for (const properties of state.listOnlyByKod.values()) rows.push(properties);
    return rows;
  }

  function renderList() {
    let rows = combinedRows();
    const q = state.filterText.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.namn.toLowerCase().includes(q) || r.kod.includes(q));

    rows.sort((a, b) => {
      let av = a[state.sortKey];
      let bv = b[state.sortKey];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av === null || av === undefined) av = "";
      if (bv === null || bv === undefined) bv = "";
      if (av < bv) return -1 * state.sortDir;
      if (av > bv) return 1 * state.sortDir;
      return 0;
    });

    els.listBody.innerHTML = "";
    for (const props of rows) {
      const tr = document.createElement("tr");
      tr.className = "district-row" + (props.typ === "uppsamling" ? " no-geo" : "") + (props.kod === state.selectedKod ? " selected" : "");
      tr.dataset.kod = props.kod;

      const flipTag = props.partibyte ? '<span class="tag-mini flip">bytt parti</span>' : "";
      const noGeoTag = props.typ === "uppsamling" ? '<span class="tag-mini nogeo">ingen karta</span>' : "";

      tr.innerHTML =
        "<td>" +
        props.namn +
        flipTag +
        noGeoTag +
        "</td><td><span class=\"chip\" style=\"background:" +
        PartyColors.color(props.ledandeParti) +
        '"></span>' +
        PartyColors.name(props.ledandeParti) +
        "</td><td>" +
        fmtPct(props.valdeltagande) +
        "</td>";
      tr.addEventListener("click", () => selectDistrict(props.kod));
      els.listBody.appendChild(tr);
    }
  }

  document.querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) {
        state.sortDir *= -1;
      } else {
        state.sortKey = key;
        state.sortDir = 1;
      }
      renderList();
    });
  });
  els.listFilter.addEventListener("input", () => {
    state.filterText = els.listFilter.value;
    renderList();
  });
  els.panelToggle.addEventListener("click", () => {
    const body = els.listPanel.querySelector(".panel-body");
    const detail = els.detail;
    const hidden = body.style.display === "none";
    body.style.display = hidden ? "" : "none";
    detail.style.display = hidden ? "" : "none";
    els.panelToggle.textContent = hidden ? "Dölj" : "Visa";
  });

  function selectDistrict(kod) {
    state.selectedKod = kod;
    const entry = state.featuresByKod.get(kod);
    if (entry) {
      entry.layer.setStyle(highlightStyle(entry.properties));
      entry.layer.bringToFront();
      entry.layer.openPopup();
      if (entry.layer.getBounds) {
        map.panTo(entry.layer.getBounds().getCenter());
      }
      els.detail.innerHTML = buildDetailHtml(entry.properties);
    } else {
      const props = state.listOnlyByKod.get(kod);
      if (props) els.detail.innerHTML = buildDetailHtml(props);
    }
    // återställ stil på övriga
    state.featuresByKod.forEach(({ layer, properties }, k) => {
      if (k !== kod) layer.setStyle(styleForProps(properties));
    });
    renderList();
  }

  // ---------------------------------------------------------------- flash
  function flashRow(kod) {
    const row = els.listBody.querySelector('tr[data-kod="' + CSS.escape(kod) + '"]');
    if (!row) return;
    row.classList.remove("flash");
    void row.offsetWidth;
    row.classList.add("flash");
  }

  // ---------------------------------------------------------------- initial load
  function loadInitial() {
    clearError();
    fetch("api/valdistrikt?" + new URLSearchParams({ kommun: kommunKod, ar, valtyp }))
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          showError((data && (data.error + (data.detalj ? ": " + data.detalj : ""))) || "Okänt fel vid hämtning.");
          return;
        }
        state.meta = data.meta;
        for (const props of data.uppsamlingsdistrikt || []) state.listOnlyByKod.set(props.kod, props);
        updateHeader();
        PartyColors.ready.then(() => {
          renderGeoJson(data.geojson, true);
          renderList();
        });
        connectWebSocket();
      })
      .catch((e) => showError("Kunde inte nå servern: " + e.message));
  }

  // ---------------------------------------------------------------- realtime
  function applyUpdate(msg) {
    if (msg.senast_uppdaterad) {
      state.meta.senast_uppdaterad = msg.senast_uppdaterad;
      state.meta.ar_live = msg.ar_live;
      updateHeader();
    }
    let changed = false;
    for (const props of msg.distrikt || []) {
      changed = true;
      const entry = state.featuresByKod.get(props.kod);
      if (entry) {
        entry.properties = props;
        entry.layer.setStyle(styleForProps(props));
        entry.layer.setPopupContent(buildDetailHtml(props));
      } else {
        state.listOnlyByKod.set(props.kod, props);
      }
      flashRow(props.kod);
      if (props.kod === state.selectedKod) els.detail.innerHTML = buildDetailHtml(props);
    }
    for (const props of msg.uppsamlingsdistrikt || []) {
      changed = true;
      state.listOnlyByKod.set(props.kod, props);
      flashRow(props.kod);
      if (props.kod === state.selectedKod) els.detail.innerHTML = buildDetailHtml(props);
    }
    if (changed) {
      renderList();
      updateLegend();
    }
  }

  let ws = null;
  let heartbeatTimer = null;
  let reconnectDelay = 1000;

  function wsUrl() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return proto + "//" + location.host + "/val/ws";
  }

  function sendSubscribe() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "subscribe", kommun: kommunKod, ar, valtyp }));
    }
  }

  function connectWebSocket() {
    ws = new WebSocket(wsUrl());
    ws.onopen = () => {
      reconnectDelay = 1000;
      sendSubscribe();
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(sendSubscribe, 20000);
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "update" || msg.type === "status") applyUpdate(msg);
      } catch (e) {
        console.warn("Ogiltigt WS-meddelande", e);
      }
    };
    ws.onclose = () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      setTimeout(connectWebSocket, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    };
    ws.onerror = () => ws.close();
  }

  loadInitial();
})();
