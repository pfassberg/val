(function () {
  "use strict";

  const params = new URLSearchParams(location.search);

  const kommunInput = document.getElementById("kommunInput");
  const kommunKodField = document.getElementById("kommunKod");
  const kommunList = document.getElementById("kommunList");
  const kommunHint = document.getElementById("kommunHint");
  const arSelect = document.getElementById("arSelect");
  const segmented = document.getElementById("valtypSegmented");
  const form = document.getElementById("valForm");
  const formError = document.getElementById("formError");

  let kommuner = [];
  let valtyp = params.get("valtyp") || "riksdag";

  setActiveValtyp(valtyp);
  segmented.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-val]");
    if (!btn) return;
    setActiveValtyp(btn.dataset.val);
  });
  function setActiveValtyp(v) {
    valtyp = v;
    [...segmented.querySelectorAll("button")].forEach((b) => {
      b.classList.toggle("active", b.dataset.val === v);
    });
  }

  // ------------------------------------------------------------- kommuner
  fetch("api/kommuner")
    .then((r) => r.json())
    .then((data) => {
      kommuner = data;
      const forvaltKod = params.get("kommun");
      if (forvaltKod) {
        const k = kommuner.find((x) => x.kod === forvaltKod);
        if (k) selectKommun(k);
      }
    })
    .catch(() => {
      kommunHint.textContent = "Kunde inte hämta kommunlistan från servern.";
    });

  function renderKommunList(query) {
    const q = query.trim().toLowerCase();
    let matches = kommuner;
    if (q) {
      matches = kommuner.filter((k) => k.namn.toLowerCase().includes(q));
    }
    matches = matches.slice(0, 30);
    kommunList.innerHTML = "";
    if (matches.length === 0) {
      kommunList.classList.remove("open");
      return;
    }
    for (const k of matches) {
      const div = document.createElement("div");
      div.innerHTML = k.namn + '<span class="lan-namn"> — ' + k.lan_namn + "</span>";
      div.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectKommun(k);
      });
      kommunList.appendChild(div);
    }
    kommunList.classList.add("open");
  }

  function selectKommun(k) {
    kommunInput.value = k.namn;
    kommunKodField.value = k.kod;
    kommunList.classList.remove("open");
    kommunHint.textContent = "Kommunkod " + k.kod + ", " + k.lan_namn + ".";
  }

  kommunInput.addEventListener("input", () => {
    kommunKodField.value = "";
    renderKommunList(kommunInput.value);
  });
  kommunInput.addEventListener("focus", () => renderKommunList(kommunInput.value));
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".field")) kommunList.classList.remove("open");
  });

  // ------------------------------------------------------------- år
  fetch("api/ar")
    .then((r) => r.json())
    .then((data) => {
      arSelect.innerHTML = "";
      for (const a of data) {
        const opt = document.createElement("option");
        opt.value = a.ar;
        opt.textContent = a.namn + (a.status === "live" ? "" : "  (facit)");
        arSelect.appendChild(opt);
      }
      const forvaltAr = params.get("ar");
      if (forvaltAr && [...arSelect.options].some((o) => o.value === forvaltAr)) {
        arSelect.value = forvaltAr;
      } else {
        // Förvälj senaste slutgiltiga valet (bra för att testa 2022 vs 2018).
        const final = data.find((a) => a.status === "final");
        if (final) arSelect.value = final.ar;
      }
    })
    .catch(() => {
      arSelect.innerHTML = '<option value="">Kunde inte hämta årslistan</option>';
    });

  // ------------------------------------------------------------- submit
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    formError.style.display = "none";
    if (!kommunKodField.value) {
      formError.textContent = "Välj en kommun ur listan.";
      formError.style.display = "block";
      kommunInput.focus();
      return;
    }
    if (!arSelect.value) {
      formError.textContent = "Välj ett valår.";
      formError.style.display = "block";
      return;
    }
    const qs = new URLSearchParams({
      kommun: kommunKodField.value,
      ar: arSelect.value,
      valtyp: valtyp
    });
    location.href = "karta.html?" + qs.toString();
  });
})();
