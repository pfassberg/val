// Delas mellan karta.js (och kan återanvändas av andra sidor). Hämtar
// partifärger från /val/api/partier och ger en stabil, genererad färg åt
// partier som inte finns i listan (t.ex. lokala kommunpartier).
const PartyColors = (function () {
  let table = {};
  let loaded = fetch("api/partier")
    .then((r) => r.json())
    .then((data) => {
      table = data.partier || {};
    })
    .catch(() => {
      table = {};
    });

  function hashColor(code) {
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      hash = (hash << 5) - hash + code.charCodeAt(i);
      hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    return "hsl(" + hue + ", 55%, 45%)";
  }

  function color(kod) {
    if (table[kod]) return table[kod].farg;
    return hashColor(kod || "OVR");
  }

  function name(kod) {
    if (table[kod]) return table[kod].namn;
    return kod;
  }

  return { ready: loaded, color, name };
})();
