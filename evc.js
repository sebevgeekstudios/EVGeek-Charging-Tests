/* =============================================================================
   EV Geek Studios — Charging Curves
   https://evgeekstudios.com/curves

   This ONE file is the whole widget: styles, markup and logic. It mounts itself
   into an empty <div id="evc-mount"> so that everything visible on the page can
   be changed from this repo — you should never have to touch Squarespace again.

   ── UPDATING THE DATA ────────────────────────────────────────────────────────
   Nothing here. Add rows to the "Aggregated Data (Looker)" tab of the Google
   Sheet; the page picks them up on the next load.
     Vehicle | State of Charge | Charge Power (kW) | Time Elapsed | Session Notes
       - State of Charge accepts 45 or "45%"
       - Time Elapsed accepts "16m47s" or "0:16:47", counted from session start
       - Blank power = no reading at that SoC; the row is skipped, not plotted as 0
     For the "range added" figures, also add the vehicle to the "At-a-glance" tab
     with its EPA Range. Names are matched after dropping RWD / Long Range /
     Base / Battery, so they need not be byte-identical — but close.

   ── UPDATING THE CODE ────────────────────────────────────────────────────────
   Edit this file, bump VERSION below, commit. GitHub Pages republishes in about
   a minute; browsers pick it up within ten. The live version is readable in the
   page source as <div id="evc-mount" data-evc-ready="...">.

   Only Google Sheets is fetched at runtime, and the last good load is cached in
   the browser, so a Sheets outage shows yesterday's chart rather than an error.
   ============================================================================= */
(function boot() {
  "use strict";

  var VERSION = "1.5.0";
  var MOUNT_ID = "evc-mount";
  var STYLE_ID = "evc-style";

  /* With `defer` the DOM is ready, but be tolerant of any load order. */
  var mount = document.getElementById(MOUNT_ID);
  if (!mount) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    return;
  }
  /* Squarespace navigates over AJAX and can re-run this file against a mount it
     has already built. Without the guard, the second run stacks a duplicate set
     of pointer listeners on the same chart. */
  if (mount.getAttribute("data-evc-ready")) return;
  mount.setAttribute("data-evc-ready", VERSION);

  var MARKUP = `
<div class="evc" id="evc">
  <div class="evc-bar">
    <div class="evc-seg" role="group" aria-label="X axis">
      <button type="button" class="evc-segbtn is-on" data-x="soc">By charge level</button>
      <button type="button" class="evc-segbtn" data-x="time">By time</button>
    </div>
    <div class="evc-seg" role="group" aria-label="View">
      <button type="button" class="evc-segbtn is-on" data-view="chart">Chart</button>
      <button type="button" class="evc-segbtn" data-view="table">Table</button>
    </div>
    <div class="evc-bar-end">
      <button type="button" class="evc-link" data-act="all">Show all</button>
      <span class="evc-sep" aria-hidden="true">·</span>
      <button type="button" class="evc-link" data-act="none">Clear</button>
    </div>
  </div>

  <div class="evc-legend" id="evc-legend" role="group" aria-label="Vehicles — click to show or hide"></div>

  <div class="evc-card" id="evc-card">
    <div class="evc-plot" id="evc-plot">
      <svg id="evc-svg" role="img" aria-label="EV charging curves"></svg>
      <!-- No live region: the crosshair updates continuously, so announcing it would
           read all eight rows aloud on every pointer move. The Table view is the
           accessible route to the same numbers. -->
      <div class="evc-tip" id="evc-tip"></div>
      <div class="evc-empty" id="evc-empty" hidden></div>
    </div>
    <table class="evc-table" id="evc-table" hidden></table>
  </div>
  <p class="evc-cap" id="evc-cap"></p>

  <p class="evc-note" id="evc-note"></p>

  <section class="evc-specs" id="evc-specs" hidden>
    <h3 class="evc-h3">At a glance</h3>
    <div class="evc-specgrid" id="evc-specgrid"></div>
  </section>
</div>
`;

  var CSS = `
/* Everything is scoped under .evc so it can't collide with Squarespace's CSS. */
.evc{
  color-scheme: light;
  --surface-1:#fcfcfb;
  --plane:#f2f2f2;
  --ink:#0b0b0b;
  --ink-2:#52514e;
  --muted:#898781;
  --grid:#e1e0d9;
  --axis:#c3c2b7;
  --ring:rgba(11,11,11,.10);
  --s1:#2a78d6; --s2:#eb6834; --s3:#1baf7a; --s4:#eda100;
  --s5:#e87ba4; --s6:#008300; --s7:#4a3aa7; --s8:#e34948;
  --r:10px;
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
  color:var(--ink);
  font-size:15px;
  line-height:1.45;
  max-width:1120px;
  margin:0 auto;
  -webkit-text-size-adjust:100%;
}
.evc *,.evc *::before,.evc *::after{box-sizing:border-box}
/* :where() keeps this reset at (0,1,0) so the component rules below can still
   set their own font-size. As ".evc button" it was (0,1,1) and silently beat
   every .evc-segbtn / .evc-chip font-size, inflating the legend. */
.evc :where(button){font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}

/* ---- control bar ---------------------------------------------------- */
.evc-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 12px}
.evc-seg{display:inline-flex;background:var(--surface-1);border:1px solid var(--ring);border-radius:var(--r);padding:3px;gap:2px}
.evc-segbtn{border:0;background:transparent;border-radius:7px;padding:7px 13px;font-size:13.5px;font-weight:600;color:var(--ink-2);white-space:nowrap;transition:background .13s,color .13s}
.evc-segbtn:hover{background:rgba(11,11,11,.05)}
.evc-segbtn.is-on{background:var(--ink);color:#fff}
.evc-segbtn:focus-visible{outline:2px solid var(--s1);outline-offset:2px}
.evc-bar-end{margin-left:auto;display:flex;align-items:center;gap:8px;color:var(--muted)}
.evc-link{border:0;background:none;padding:2px;font-size:13px;font-weight:600;color:var(--ink-2);text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
.evc-link:hover{color:var(--ink)}
.evc-sep{font-size:13px}

/* ---- legend --------------------------------------------------------- */
.evc-legend{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 12px}
.evc-chip{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--ring);background:var(--surface-1);border-radius:999px;padding:6px 13px 6px 10px;font-size:13px;font-weight:600;color:var(--ink);transition:opacity .13s,border-color .13s,background .13s}
.evc-chip:hover{border-color:rgba(11,11,11,.28)}
.evc-chip:focus-visible{outline:2px solid var(--s1);outline-offset:2px}
.evc-chip[aria-pressed="false"]{opacity:.42;background:transparent}
.evc-chip[aria-pressed="false"] .evc-chip-peak{opacity:0}
.evc-linekey{flex:none;overflow:visible;vertical-align:middle;align-self:center}
.evc-chip-peak{font-weight:500;color:var(--muted);font-variant-numeric:tabular-nums}

/* ---- chart card ----------------------------------------------------- */
.evc-card{position:relative;background:var(--surface-1);border:1px solid var(--ring);border-radius:14px;padding:10px 6px 4px}
.evc-plot{position:relative}
/* scoped to the chart itself: the legend/tooltip keys are SVGs inside this card
   too, and a blanket "svg{width:100%}" would stretch them across the row */
.evc-plot > svg{display:block;width:100%;height:auto;touch-action:pan-y}
.evc-plot > svg:focus-visible{outline:2px solid var(--s1);outline-offset:-2px;border-radius:10px}

.evc-gridline{stroke:var(--grid);stroke-width:1}
.evc-axisline{stroke:var(--axis);stroke-width:1}
.evc-tick{fill:var(--muted);font-size:11.5px;font-variant-numeric:tabular-nums}
.evc-axislabel{fill:var(--ink-2);font-size:12px;font-weight:600}
.evc-line{fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:opacity .13s,stroke-width .13s}
.evc-endlabel{font-size:12px;font-weight:700;paint-order:stroke;stroke:var(--surface-1);stroke-width:3.5;stroke-linejoin:round}
.evc-hair{stroke:var(--ink);stroke-width:1;stroke-dasharray:3 3;opacity:.45}
.evc-dot{stroke:var(--surface-1);stroke-width:2}

/* ---- tooltip -------------------------------------------------------- */
.evc-tip{position:absolute;z-index:5;pointer-events:none;opacity:0;transform:translateY(3px);transition:opacity .1s,transform .1s;
  background:var(--surface-1);border:1px solid var(--ring);border-radius:10px;box-shadow:0 6px 22px rgba(11,11,11,.13);
  padding:9px 11px;min-width:232px;max-width:440px}
.evc-tip.is-on{opacity:1;transform:none}
.evc-tip-head{font-size:11.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--ink-2)}
.evc-tip-cols{font-size:11px;color:var(--muted);margin:1px 0 6px;padding-bottom:5px;border-bottom:1px solid var(--grid)}
.evc-tip-row{display:flex;align-items:baseline;gap:8px;padding:2px 0}
.evc-tip-val{flex:none;font-weight:700;font-variant-numeric:tabular-nums;min-width:52px}
.evc-tip-2nd{flex:none;min-width:50px;color:var(--ink-2);font-size:12px;font-variant-numeric:tabular-nums;text-align:right}
.evc-tip-name{color:var(--muted);font-size:12.5px;line-height:1.25;white-space:nowrap}

/* ---- data table ----------------------------------------------------- */
.evc-table{display:block;overflow:auto;max-height:520px;border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums}
/* An author 'display' beats the browser's own [hidden]{display:none}, so these
   two need it restated or they never actually hide. */
.evc-table[hidden]{display:none}
.evc-table th,.evc-table td{padding:6px 10px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--grid)}
.evc-table th:first-child,.evc-table td:first-child{text-align:left;position:sticky;left:0;background:var(--surface-1)}
.evc-table thead th{position:sticky;top:0;background:var(--surface-1);z-index:2;font-size:12px;color:var(--ink-2);text-align:right;
  border-bottom:1px solid var(--axis)}
.evc-table thead th:first-child{z-index:3}
.evc-table td{color:var(--ink-2)}
.evc-table th .evc-linekey{margin-right:6px}

/* ---- status / empty -------------------------------------------------- */
.evc-cap{margin:10px 2px 0;font-size:13px;color:var(--ink-2)}
.evc-note{margin:4px 2px 0;font-size:12.5px;color:var(--muted)}
.evc-note a{color:var(--ink-2)}
/* Covers the whole plot, so it must not eat pointer events meant for the
   chart underneath — only its button is clickable. */
.evc-empty{position:absolute;inset:0;display:grid;place-content:center;text-align:center;gap:10px;padding:24px;color:var(--ink-2);font-size:14px;pointer-events:none}
.evc-empty[hidden]{display:none}
.evc-empty .evc-retry{pointer-events:auto}
.evc-retry{border:1px solid var(--ring);background:var(--surface-1);border-radius:8px;padding:8px 16px;font-size:13.5px;font-weight:600;justify-self:center}
.evc-retry:hover{background:rgba(11,11,11,.04)}
.evc-loading{opacity:.45;transition:opacity .2s}

/* ---- specs ----------------------------------------------------------- */
.evc-specs{margin-top:28px}
/* pinned: Squarespace styles h1-h6 directly, and a direct rule beats an
   inherited one, so without this the heading silently takes the site font */
.evc-h3{font-family:inherit;font-size:15px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-2);margin:0 0 12px}
.evc-specgrid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(258px,1fr))}
.evc-spec{background:var(--surface-1);border:1px solid var(--ring);border-radius:12px;padding:13px 15px}
.evc-spec-name{font-weight:700;font-size:14px;line-height:1.3;margin-bottom:9px;display:flex;gap:8px;align-items:baseline}
.evc-spec-name .evc-linekey{flex:none}
.evc-spec dl{margin:0;display:grid;grid-template-columns:1fr auto;gap:4px 12px}
.evc-spec dt{color:var(--muted);font-size:12.5px}
.evc-spec dd{margin:0;font-size:12.5px;font-weight:600;text-align:right;font-variant-numeric:tabular-nums}

/* Narrow layout is driven by the WIDTH OF THIS BLOCK, not the viewport.
   Inside a Squarespace code block the two are very different - a 700px window
   leaves the block only ~616px - so a viewport media query put a 616px chart
   into the desktop layout and doubled the height of the legend. The class is
   set from JS off the same measurement the chart itself uses, so CSS and JS can
   never disagree about which layout is active. */
.evc.is-narrow{font-size:14px}
.evc.is-narrow .evc-bar{gap:8px}
.evc.is-narrow .evc-segbtn{padding:7px 11px;font-size:13px}
.evc.is-narrow .evc-bar-end{margin-left:0;width:100%}
/* 8 full-width pills pushed the chart off the first screen — two columns
   with wrapping labels keeps every vehicle visible in a quarter of the space. */
.evc.is-narrow .evc-legend{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.evc.is-narrow .evc-chip{align-items:flex-start;border-radius:9px;padding:6px 9px;font-size:11.5px;line-height:1.25;text-align:left}
.evc.is-narrow .evc-chip .evc-linekey{align-self:flex-start;margin-top:4px}
.evc.is-narrow .evc-chip-peak{display:none}
.evc.is-narrow .evc-card{padding:8px 4px 2px;border-radius:12px}
/* On phones the readout sits under the chart instead of over it, so it can
   never hide the peak it is describing, and the height is reserved so
   nothing jumps as you drag. */
.evc.is-narrow .evc-tip{position:static;opacity:1;transform:none;box-shadow:none;border:0;border-top:1px solid var(--grid);
  border-radius:0;margin:4px 4px 0;padding:8px 4px 2px;max-width:none;min-width:0}
.evc.is-narrow .evc-tip-rows{display:grid;grid-template-columns:minmax(0,1fr)}
.evc.is-narrow .evc-tip-row{align-items:center;overflow:hidden;padding:1px 0}
.evc.is-narrow .evc-tip-val{min-width:48px;font-size:13px}
.evc.is-narrow .evc-tip-2nd{min-width:46px;font-size:11.5px}
/* One full-width line per series — at two columns the names truncated to
   "Hyundai Ioniq…" three times over. Height is reserved in JS from the
   series count so nothing shifts as you drag. */
.evc.is-narrow .evc-tip-name{font-size:11.5px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.evc.is-narrow .evc-tip-hint{color:var(--muted);font-size:12.5px;padding-top:2px}
.evc.is-narrow .evc-specgrid{grid-template-columns:1fr}
@media (prefers-reduced-motion:reduce){
  .evc *{transition:none !important}
}
`;

  if (!document.getElementById(STYLE_ID)) {
    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  mount.innerHTML = MARKUP;   /* static markup authored above — no external data */

  /* ======================= CONFIG ======================= */
  var SHEET = "2PACX-1vQFUGS2wf9kJUK30Rj9S0QEyrRkSZAY46Y-vO14toJcFeJJrNckkJdD-ToJcq9Vry-FMluAl5xbBBJg";
  var CURVE_GID = "1569243736";   // "Aggregated Data (Looker)" tab
  var SPEC_GID  = "35947163";     // "At-a-glance" tab
  var BASE_SOC = 10;              // time axis + range added are measured from here
  var TOP_SOC = 80;               // the time view window ends here
  var CACHE_KEY = "evc-cache-v1";
  var CACHE_MAX_AGE_DAYS = 30;
  var FETCH_TIMEOUT_MS = 9000;

  /* Categorical hues, fixed order — a vehicle keeps its colour no matter
     which others are hidden. Past 8 vehicles the hues repeat with a dash
     pattern, so identity never rests on colour alone. */
  var HUES = ["#2a78d6","#eb6834","#1baf7a","#eda100","#e87ba4","#008300","#4a3aa7","#e34948"];
  /* run patterns within one car, in order: solid, dashed, dotted, dash-dot, fine */
  var DASHES = ["", "7 5", "2 4", "11 4 2 4", "1 3"];

  var NS = "http://www.w3.org/2000/svg";
  var root = document.getElementById("evc");
  root.setAttribute("data-evc-ready", VERSION);

  var els = {
    legend: document.getElementById("evc-legend"),
    card:   document.getElementById("evc-card"),
    plot:   document.getElementById("evc-plot"),
    svg:    document.getElementById("evc-svg"),
    tip:    document.getElementById("evc-tip"),
    empty:  document.getElementById("evc-empty"),
    table:  document.getElementById("evc-table"),
    note:   document.getElementById("evc-note"),
    cap:    document.getElementById("evc-cap"),
    specs:  document.getElementById("evc-specs"),
    specgrid: document.getElementById("evc-specgrid")
  };

  var state = { xMode: "soc", view: "chart", series: [], specs: [], hidden: {}, focus: null, hover: null, source: "" };

  /* ======================= UTIL ======================= */
  function el(tag, attrs, text) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (text != null) n.appendChild(document.createTextNode(text));
    return n;
  }
  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;   // data-derived text is never innerHTML
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  /* Dash now carries meaning (which run of a car), so a key has to draw the
     real pattern. CSS border-style can't: it has no dash-dot, and its dashes
     don't match SVG's. Every key is therefore a tiny SVG using the very same
     stroke-dasharray as the line it stands for. */
  function lineKey(s, w) {
    w = w || 18;
    var svg = el("svg", {
      class: "evc-linekey", width: w, height: 8,
      viewBox: "0 0 " + w + " 8", "aria-hidden": "true"
    });
    svg.appendChild(el("line", {
      x1: 1, y1: 4, x2: w - 1, y2: 4,
      stroke: s.color, "stroke-width": 3, "stroke-linecap": "round",
      "stroke-dasharray": s.dash || null
    }));
    return svg;
  }

  function parseCSV(text) {
    var rows = [], row = [], field = "", q = false, i, c;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') { q = true; }
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c !== "\r") { field += c; }
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  /* Accepts "16m47s", "1h02m03s", "0:16:47", "16:47".
     A doubled unit letter ("18m39ss") is a typo, not a different format, so it
     is collapsed rather than thrown away — otherwise one stray keystroke
     silently drops a reading out of the time view. */
  function parseTime(s) {
    s = (s || "").trim().replace(/([hms])\1+/gi, "$1");
    if (!s) return null;
    var m = s.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
    if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3];
    m = s.match(/^(\d+):(\d+(?:\.\d+)?)$/);
    if (m) return +m[1] * 60 + +m[2];
    m = s.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+(?:\.\d+)?)\s*s)?$/i);
    if (m && (m[1] || m[2] || m[3])) return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
    return null;
  }
  function num(s) {
    if (s == null) return null;
    var t = String(s).replace(/[^0-9.\-]/g, "");
    if (t === "" || t === "-" || t === ".") return null;
    var v = parseFloat(t);
    return isFinite(v) ? v : null;
  }
  function fmtDur(sec) {
    if (sec == null) return "—";
    var m = Math.floor(sec / 60), s = Math.round(sec - m * 60);
    if (s === 60) { m++; s = 0; }
    return m + "m " + (s < 10 ? "0" : "") + s + "s";
  }
  /* compact elapsed time for the tooltip column; "–" before the 10% mark */
  function fmtShort(sec) {
    if (sec == null || sec < 0) return "–";
    var m = Math.floor(sec / 60), s = Math.round(sec - m * 60);
    if (s === 60) { m++; s = 0; }
    return m + "m" + (s < 10 ? "0" : "") + s + "s";
  }
  function csvUrl(gid) {
    return "https://docs.google.com/spreadsheets/d/e/" + SHEET +
           "/pub?gid=" + gid + "&single=true&output=csv&_=" + Date.now();
  }
  function fetchCsv(gid) {
    var ctl = ("AbortController" in window) ? new AbortController() : null;
    var timer = ctl && setTimeout(function () { ctl.abort(); }, FETCH_TIMEOUT_MS);
    return fetch(csvUrl(gid), ctl ? { signal: ctl.signal } : undefined)
      .then(function (r) {
        if (timer) clearTimeout(timer);
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      });
  }

  /* ======================= DATA ======================= */
  function buildSeries(csvText) {
    var rows = parseCSV(csvText);
    if (!rows.length) return [];
    var head = rows[0].map(function (s) { return s.trim().toLowerCase(); });
    function col(re) { for (var i = 0; i < head.length; i++) if (re.test(head[i])) return i; return -1; }
    var iV = col(/vehicle/), iS = col(/state of charge|soc/), iP = col(/power|kw/),
        iT = col(/time/), iN = col(/note/);
    if (iV < 0 || iS < 0 || iP < 0) return [];

    var order = [], byName = {};
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      var name = (row[iV] || "").trim();
      if (!name) continue;
      var soc = num(row[iS]), kw = num(row[iP]);
      if (soc == null || kw == null) continue;
      if (!byName[name]) { byName[name] = { name: name, pts: [], notes: {} }; order.push(name); }
      byName[name].pts.push({ soc: soc, kw: kw, t: iT >= 0 ? parseTime(row[iT]) : null });
      var note = iN >= 0 ? (row[iN] || "").trim() : "";
      if (note) byName[name].notes[note] = 1;
    }

    return assignStyles(order.map(function (name) {
      var s = byName[name];
      s.pts.sort(function (a, b) { return a.soc - b.soc; });
      s.note = Object.keys(s.notes).join(" · ");

      var peak = 0, peakSoc = null, j;
      for (j = 0; j < s.pts.length; j++) if (s.pts[j].kw > peak) { peak = s.pts[j].kw; peakSoc = s.pts[j].soc; }
      s.peak = peak; s.peakSoc = peakSoc;

      /* time relative to 10% SoC, so runs that start at different SoC compare */
      var t10 = interpT(s.pts, BASE_SOC), t80 = interpT(s.pts, TOP_SOC);
      s.t10 = t10;
      s.t1080 = (t10 != null && t80 != null) ? (t80 - t10) : null;
      for (j = 0; j < s.pts.length; j++) {
        s.pts[j].rel = (s.pts[j].t != null && t10 != null) ? (s.pts[j].t - t10) / 60 : null;
      }
      s.socMin = s.pts.length ? s.pts[0].soc : null;
      s.socMax = s.pts.length ? s.pts[s.pts.length - 1].soc : null;
      return s;
    }));
  }

  /* Hue identifies the CAR; dash identifies which run of it.
     Three Ioniq 5 sessions read as one blue family rather than three unrelated
     colours, which is the comparison this page exists to make — and it stretches
     eight validated hues across far more than eight runs, since the palette only
     advances when a genuinely different car appears.

     The car is the name with its trailing "(...)" removed, then normalised the
     same way spec names are, so "2026 Kia EV9" and "2026 Kia EV9 Long Range"
     are recognised as one car rather than two. */
  function carKey(name) {
    return specKey(name.replace(/\s*\([^)]*\)\s*$/, ""));
  }

  function assignStyles(series) {
    var hueOf = {}, runsOf = {}, cars = [];
    series.forEach(function (s) {
      s.car = carKey(s.name);
      if (!(s.car in hueOf)) {
        hueOf[s.car] = HUES[cars.length % HUES.length];
        runsOf[s.car] = 0;
        cars.push(s.car);
      }
      s.color = hueOf[s.car];
      s.dash = DASHES[runsOf[s.car] % DASHES.length];
      s.runIndex = runsOf[s.car]++;
    });
    /* Group runs of the same car together so the shared hue is obvious at a
       glance. Cars keep their first-appearance order, as do runs within a car,
       so this only regroups the list — it never changes which colour a vehicle
       gets. */
    return series.slice().sort(function (a, b) {
      var d = cars.indexOf(a.car) - cars.indexOf(b.car);
      return d !== 0 ? d : a.runIndex - b.runIndex;
    });
  }

  /* linear interpolation of elapsed time at a given SoC */
  function interpT(pts, soc) {
    var prev = null, i, p;
    for (i = 0; i < pts.length; i++) {
      p = pts[i];
      if (p.t == null) { prev = null; continue; }
      if (p.soc === soc) return p.t;
      if (prev && prev.soc < soc && p.soc > soc) {
        return prev.t + (p.t - prev.t) * (soc - prev.soc) / (p.soc - prev.soc);
      }
      prev = p;
    }
    return null;
  }

  function buildSpecs(csvText) {
    var rows = parseCSV(csvText).filter(function (r) { return r.join("").trim() !== ""; });
    if (rows.length < 2) return [];
    var head = rows[0].map(function (s) { return s.trim(); });
    return rows.slice(1).map(function (r) {
      var o = { name: (r[0] || "").trim(), fields: [] };
      for (var i = 1; i < head.length; i++) {
        if (head[i] && (r[i] || "").trim()) o.fields.push([head[i], r[i].trim()]);
      }
      return o;
    }).filter(function (o) { return o.name; });
  }

  /* ======================= SCALES ======================= */
  function visible() {
    return state.series.filter(function (s) { return !state.hidden[s.name] && xs(s).length > 1; });
  }
  /* Points usable in the current x mode.
     Time mode is deliberately the 10–80% window: it's the comparison people
     actually make, and it stops one slow 0–100% session from squashing the
     rest of the chart into the left third. Full range stays in SoC + table. */
  function xs(s) {
    if (state.xMode === "soc") return s.pts;
    return s.pts.filter(function (p) { return p.rel != null && p.rel >= 0 && p.soc <= TOP_SOC; });
  }
  function xOf(p) { return state.xMode === "soc" ? p.soc : p.rel; }

  function domain() {
    var vis = visible(), maxY = 0, maxX = 0, i, pts, j;
    for (i = 0; i < vis.length; i++) {
      pts = xs(vis[i]);
      for (j = 0; j < pts.length; j++) {
        if (pts[j].kw > maxY) maxY = pts[j].kw;
        var x = xOf(pts[j]);
        if (x != null && x > maxX) maxX = x;
      }
    }
    var tight = geom.w < 430;
    var y = axis(maxY, tight ? 4 : 6, 50);
    var x = state.xMode === "soc"
      ? { max: 100, step: tight ? 25 : geom.narrow ? 20 : 10 }
      : axis(maxX, tight ? 4 : 7, 5);
    return { x0: 0, x1: x.max, xStep: x.step, y0: 0, y1: y.max, yStep: y.step };
  }
  function niceStep(v) {
    if (!isFinite(v) || v <= 0) return 0;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  /* round the max up to a whole tick so the plot fills its box */
  function axis(max, count, floor) {
    if (!isFinite(max) || max <= 0) return { max: floor, step: floor / 2 };
    var step = niceStep(max / count);
    var top = Math.ceil(max * 1.04 / step) * step;
    if (top / step < 3) { step = step / 2; top = Math.ceil(max * 1.04 / step) * step; }
    return { max: top, step: step };
  }
  function ticks(max, step) {
    var out = [], v = 0;
    if (!step) return [0];
    for (; v <= max + step * 0.001; v += step) out.push(Math.round(v * 1000) / 1000);
    return out;
  }

  /* ======================= RENDER ======================= */
  var geom = { w: 800, h: 430, pad: { t: 14, r: 18, b: 44, l: 50 } };

  var NARROW_AT = 640;

  /* The single source of truth for "is this thing narrow?". Everything — the
     CSS class, the chart's padding and tick density, and where the readout goes
     — comes from this one measurement of the block itself, so the layout can't
     end up half in one mode and half in the other.

     Toggling the class cannot feed back into this: .evc is a block-level
     element whose width comes from its parent, and none of the narrow rules
     change that, so there is no resize loop. */
  function syncWidth() {
    var rw = root.clientWidth || 0;
    geom.phone = rw > 0 && rw <= NARROW_AT;
    root.classList.toggle("is-narrow", geom.phone);
    return rw;
  }

  function measure() {
    syncWidth();
    var w = els.plot.clientWidth || 800;
    var narrow = w < NARROW_AT;
    geom.w = w;
    geom.h = Math.max(260, Math.min(Math.round(w * (narrow ? 0.82 : 0.50)), 470));
    geom.pad = { t: 16, r: narrow ? 14 : 20, b: narrow ? 44 : 48, l: narrow ? 50 : 56 };
    geom.narrow = narrow;
  }

  function draw() {
    measure();
    var svg = els.svg, g = geom, d = domain();
    clear(svg);
    svg.setAttribute("viewBox", "0 0 " + g.w + " " + g.h);
    svg.setAttribute("width", g.w);
    svg.setAttribute("height", g.h);

    var L = g.pad.l, R = g.w - g.pad.r, T = g.pad.t, B = g.h - g.pad.b;
    var vis = visible();

    /* rebuild the overlay from scratch every draw, so its contents can never
       outlive the state that put them there */
    var showEmpty = !vis.length && state.series.length > 0;
    clear(els.empty);
    els.empty.hidden = !showEmpty;
    if (showEmpty) {
      els.empty.appendChild(h("div", null, "No vehicles selected."));
      var b = h("button", "evc-retry", "Show all");
      b.type = "button";
      b.addEventListener("click", function () { setAll(true); });
      els.empty.appendChild(b);
    }

    function X(v) { return L + (v - d.x0) / (d.x1 - d.x0) * (R - L); }
    function Y(v) { return B - (v - d.y0) / (d.y1 - d.y0) * (B - T); }
    state.X = X; state.Y = Y; state.box = { L: L, R: R, T: T, B: B };

    /* --- grid + y ticks (recessive) --- */
    var yt = ticks(d.y1, d.yStep), i;
    for (i = 0; i < yt.length; i++) {
      svg.appendChild(el("line", { class: "evc-gridline", x1: L, x2: R, y1: Y(yt[i]), y2: Y(yt[i]) }));
      svg.appendChild(el("text", { class: "evc-tick", x: L - 8, y: Y(yt[i]) + 4, "text-anchor": "end" }, String(yt[i])));
    }
    /* --- x ticks --- */
    var xt = ticks(d.x1, d.xStep);
    for (i = 0; i < xt.length; i++) {
      if (xt[i] > d.x1) continue;
      svg.appendChild(el("text", { class: "evc-tick", x: X(xt[i]), y: B + 18, "text-anchor": "middle" },
        state.xMode === "soc" ? xt[i] + "%" : String(xt[i])));
    }
    svg.appendChild(el("line", { class: "evc-axisline", x1: L, x2: R, y1: B, y2: B }));

    svg.appendChild(el("text", { class: "evc-axislabel", x: (L + R) / 2, y: g.h - 6, "text-anchor": "middle" },
      state.xMode === "soc" ? "State of charge" : "Minutes from 10% charge"));
    svg.appendChild(el("text", {
      class: "evc-axislabel", x: 12, y: (T + B) / 2, "text-anchor": "middle",
      transform: "rotate(-90 12 " + ((T + B) / 2) + ")"
    }, "Charge power (kW)"));

    /* --- lines --- */
    var dim = state.focus != null;
    for (i = 0; i < vis.length; i++) {
      var s = vis[i], pts = xs(s), path = "", j, x, y, pen = false;
      for (j = 0; j < pts.length; j++) {
        x = xOf(pts[j]);
        if (x == null) { pen = false; continue; }
        y = pts[j].kw;
        path += (pen ? "L" : "M") + X(x).toFixed(1) + " " + Y(y).toFixed(1) + " ";
        pen = true;
      }
      var isF = state.focus === s.name;
      svg.appendChild(el("path", {
        class: "evc-line", d: path, stroke: s.color,
        "stroke-dasharray": s.dash || null,
        "stroke-width": isF ? 3 : 2,
        opacity: dim ? (isF ? 1 : 0.16) : 1
      }));
    }

    /* --- direct labels when 4 or fewer curves are shown ---
       Anchored at each curve's peak, not its end: every curve converges on
       ~0 kW at 100%, so end-labels pile up in one corner. Peaks sit at
       different powers and different points in the charge, so they separate. */
    if (vis.length <= 4 && !g.narrow) {
      var placed = [];
      var marks = vis.map(function (sl) {
        var p = xs(sl), top = p[0], k;
        for (k = 1; k < p.length; k++) if (p[k].kw > top.kw) top = p[k];
        return { s: sl, x: X(xOf(top)), y: Y(top.kw) };
      }).sort(function (a, z) { return a.y - z.y; });

      for (i = 0; i < marks.length; i++) {
        var m = marks[i], ly = m.y - 9;
        while (placed.some(function (u) { return Math.abs(u.y - ly) < 15 && Math.abs(u.x - m.x) < 150; })) ly += 15;
        var toRight = m.x < R - 150;
        placed.push({ x: m.x, y: ly });
        svg.appendChild(el("text", {
          class: "evc-endlabel", x: m.x + (toRight ? 8 : -8), y: ly,
          "text-anchor": toRight ? "start" : "end", fill: m.s.color,
          opacity: dim ? (state.focus === m.s.name ? 1 : 0.16) : 1
        }, shortName(m.s.name)));
      }
    }

    state.layer = el("g", {});
    svg.appendChild(state.layer);

    var hit = el("rect", { x: L, y: T, width: Math.max(1, R - L), height: Math.max(1, B - T), fill: "transparent" });
    svg.appendChild(hit);
    svg.setAttribute("tabindex", "0");
  }

  function shortName(n) {
    return n.replace(/^(19|20)\d\d\s+/, "").replace(/\s*\(([^)]*)\)\s*$/, " · $1");
  }

  /* ======================= HOVER ======================= */
  function nearestIndex(s, xv) {
    var pts = xs(s), best = null, bd = Infinity, i, x;
    for (i = 0; i < pts.length; i++) {
      x = xOf(pts[i]);
      if (x == null) continue;
      var dd = Math.abs(x - xv);
      if (dd < bd) { bd = dd; best = pts[i]; }
    }
    return { p: best, d: bd };
  }

  function showAt(clientX) {
    var vis = visible();
    if (!vis.length || !state.X) return hideTip();
    var rect = els.svg.getBoundingClientRect();
    var scale = geom.w / rect.width;
    var px = (clientX - rect.left) * scale;
    var b = state.box, d = domain();
    px = Math.max(b.L, Math.min(px, b.R));
    var xv = d.x0 + (px - b.L) / (b.R - b.L) * (d.x1 - d.x0);
    renderHover(xv);
  }

  function renderHover(xv) {
    var vis = visible(), d = domain(), b = state.box;
    clear(state.layer);

    /* snap the crosshair to the nearest actual reading */
    var snapX = null, rows = [], i;
    for (i = 0; i < vis.length; i++) {
      var n = nearestIndex(vis[i], xv);
      if (!n.p) continue;
      var tol = state.xMode === "soc" ? 1.5 : Math.max(0.6, (d.x1 - d.x0) * 0.02);
      if (n.d > tol) continue;
      rows.push({ s: vis[i], p: n.p });
      if (snapX == null || Math.abs(xOf(n.p) - xv) < Math.abs(snapX - xv)) snapX = xOf(n.p);
    }
    if (!rows.length) return hideTip();

    var hx = state.X(snapX != null ? snapX : xv);
    state.layer.appendChild(el("line", { class: "evc-hair", x1: hx, x2: hx, y1: b.T, y2: b.B }));
    rows.sort(function (a, z) { return z.p.kw - a.p.kw; });
    for (i = 0; i < rows.length; i++) {
      state.layer.appendChild(el("circle", {
        class: "evc-dot", cx: state.X(xOf(rows[i].p)), cy: state.Y(rows[i].p.kw), r: 4.5, fill: rows[i].s.color
      }));
    }

    var tip = els.tip;
    clear(tip);
    /* Columns beyond power, chosen per view.
       Range added is the headline of the time view and, unlike a percentage,
       compares fairly across cars — 1% of the EV9's 99.8 kWh pack is not 1% of
       the Model 3's 57.5 kWh. Elapsed time stays single-vehicle only. */
    var rangeCol = {
      label: "range added",
      get: function (s, p) {
        var r = rangeAdded(s, p.soc);
        return r == null ? "—" : "+" + Math.round(r) + " " + s.epaUnit;
      }
    };
    var anyEpa = vis.some(function (s) { return s.epa != null; });
    var cols = [];
    if (state.xMode === "time") {
      /* on a phone the charge-level column is dropped when several cars are on
         screen, so the names stay readable */
      if (!geom.phone || vis.length === 1) {
        cols.push({ label: "charge level", get: function (s, p) { return Math.round(p.soc) + "%"; } });
      }
      if (anyEpa) cols.push(rangeCol);
    } else if (vis.length === 1) {
      cols.push({
        label: "time from " + BASE_SOC + "%",
        get: function (s, p) { return fmtShort(p.rel == null ? null : p.rel * 60); }
      });
      if (anyEpa) cols.push(rangeCol);
    }

    tip.appendChild(h("div", "evc-tip-head", state.xMode === "soc"
      ? "At " + Math.round(snapX) + "% charge"
      : "At " + fmtShort(snapX * 60) + " from " + BASE_SOC + "%"));
    if (cols.length) {
      tip.appendChild(h("div", "evc-tip-cols", "power · " + cols.map(function (c) { return c.label; }).join(" · ")));
    }
    var box = h("div", "evc-tip-rows");
    for (i = 0; i < rows.length; i++) {
      var row = h("div", "evc-tip-row");
      row.appendChild(lineKey(rows[i].s, 14));
      row.appendChild(h("span", "evc-tip-val", Math.round(rows[i].p.kw) + " kW"));
      for (var c = 0; c < cols.length; c++) {
        var cell = h("span", "evc-tip-2nd", cols[c].get(rows[i].s, rows[i].p));
        cell.title = cols[c].label;
        row.appendChild(cell);
      }
      row.appendChild(h("span", "evc-tip-name", shortName(rows[i].s.name)));
      box.appendChild(row);
    }
    tip.appendChild(box);
    reserveReadout();
    tip.classList.add("is-on");

    if (!geom.phone) {
      var tw = tip.offsetWidth || 190;
      var left = hx + 16;
      if (left + tw > geom.w - 4) left = hx - tw - 16;
      tip.style.left = Math.max(4, left) + "px";
      tip.style.top = Math.max(4, Math.min(state.Y(rows[0].p.kw) - 14, geom.h - (tip.offsetHeight || 90) - 8)) + "px";
    }
  }

  function hideTip() {
    if (state.layer) clear(state.layer);
    els.tip.classList.remove("is-on");
    if (geom.phone) {
      clear(els.tip);
      els.tip.appendChild(h("div", "evc-tip-hint", "Drag across the chart to compare power at any point."));
      reserveReadout();
    } else {
      els.tip.style.minHeight = "";
    }
  }
  /* keep the under-chart readout exactly as tall as it will need to be */
  function reserveReadout() {
    els.tip.style.minHeight = geom.phone
      ? (Math.max(1, visible().length) * 22 + 48) + "px"
      : "";
  }

  /* ======================= LEGEND ======================= */
  function renderLegend() {
    clear(els.legend);
    state.series.forEach(function (s) {
      var btn = h("button", "evc-chip");
      btn.type = "button";
      btn.setAttribute("aria-pressed", state.hidden[s.name] ? "false" : "true");
      btn.appendChild(lineKey(s, 18));
      btn.appendChild(h("span", null, s.name));
      /* headline summary: how hard it charges, how long 10–80% took, and what
         that bought you in rated miles */
      var added = rangeAdded(s, TOP_SOC);
      btn.appendChild(h("span", "evc-chip-peak",
        Math.round(s.peak) + " kW" +
        (s.t1080 != null ? " · " + fmtDur(s.t1080) : "") +
        (added != null ? " · +" + Math.round(added) + " " + s.epaUnit : "")));
      btn.addEventListener("click", function () {
        state.hidden[s.name] = !state.hidden[s.name];
        btn.setAttribute("aria-pressed", state.hidden[s.name] ? "false" : "true");
        hideTip(); draw(); renderTable();
      });
      btn.addEventListener("mouseenter", function () { if (!state.hidden[s.name]) { state.focus = s.name; draw(); } });
      btn.addEventListener("mouseleave", function () { state.focus = null; draw(); });
      btn.addEventListener("focus", function () { if (!state.hidden[s.name]) { state.focus = s.name; draw(); } });
      btn.addEventListener("blur", function () { state.focus = null; draw(); });
      els.legend.appendChild(btn);
    });
  }

  function setAll(on) {
    state.series.forEach(function (s) { state.hidden[s.name] = !on; });
    renderLegend(); hideTip(); draw(); renderTable();
  }

  /* ======================= TABLE VIEW ======================= */
  function renderTable() {
    if (state.view !== "table") return;
    var vis = visible();
    clear(els.table);
    var thead = document.createElement("thead"), tr = document.createElement("tr");
    tr.appendChild(h("th", null, state.xMode === "soc" ? "SoC" : "Min"));
    vis.forEach(function (s) {
      var th = h("th");
      th.appendChild(lineKey(s, 14));
      th.appendChild(document.createTextNode(s.name));
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    els.table.appendChild(thead);

    /* one row per whole-number x present in any visible series */
    var keys = {}, i, j, pts, x;
    for (i = 0; i < vis.length; i++) {
      pts = xs(vis[i]);
      for (j = 0; j < pts.length; j++) {
        x = xOf(pts[j]);
        if (x == null) continue;
        keys[state.xMode === "soc" ? x : Math.round(x)] = 1;
      }
    }
    var xsList = Object.keys(keys).map(Number).sort(function (a, b) { return a - b; });
    var tbody = document.createElement("tbody");
    xsList.forEach(function (xv) {
      var row = document.createElement("tr");
      row.appendChild(h("th", null, state.xMode === "soc" ? xv + "%" : String(xv)));
      vis.forEach(function (s) {
        var n = nearestIndex(s, xv);
        var tol = state.xMode === "soc" ? 0.01 : 0.5;
        row.appendChild(h("td", null, (n.p && n.d <= tol) ? Math.round(n.p.kw) + " kW" : "—"));
      });
      tbody.appendChild(row);
    });
    els.table.appendChild(tbody);
  }

  function applyView() {
    var isTable = state.view === "table";
    els.plot.hidden = isTable;
    els.table.hidden = !isTable;
    els.cap.textContent = state.xMode === "soc"
      ? "Charge power against battery level. Hover anywhere to read every car's power at that state of charge — show a single vehicle to also see elapsed time."
      : "Charge power against elapsed time over the 10–80% window. Hover anywhere to read every car's power and the EPA rated range it has gained by that point.";
    if (isTable) { hideTip(); renderTable(); } else { draw(); hideTip(); }
  }

  /* ======================= SPECS ======================= */
  function renderSpecs() {
    if (!state.specs.length) { els.specs.hidden = true; return; }
    els.specs.hidden = false;
    clear(els.specgrid);
    state.specs.forEach(function (sp) {
      var card = h("div", "evc-spec");
      var name = h("div", "evc-spec-name");
      if (sp.series) {
        name.appendChild(lineKey(sp.series, 16));
      }
      name.appendChild(document.createTextNode(sp.name));
      card.appendChild(name);
      var dl = document.createElement("dl");
      sp.fields.forEach(function (f) {
        dl.appendChild(h("dt", null, f[0]));
        dl.appendChild(h("dd", null, f[1]));
      });
      card.appendChild(dl);
      els.specgrid.appendChild(card);
    });
  }

  /* The two sheet tabs spell vehicles slightly differently ("Ioniq 5 RWD (Best
     Run)" vs "Ioniq 5 (Best Run)"), so names are reduced to a sorted set of
     significant words and matched exactly. Exact-on-normalised beats a
     similarity score here: scoring matched "First Run" to "Best Run", which
     would have put one run's EPA range against another run's curve. A miss
     shows "—", which is honest; a wrong match publishes a wrong number. */
  function specKey(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ")
      .filter(function (t) { return t && ["rwd", "base", "long", "range", "battery"].indexOf(t) < 0; })
      .sort().join(" ");
  }

  function linkSpecs(series, specs) {
    var byKey = {};
    specs.forEach(function (sp) { byKey[specKey(sp.name)] = sp; });
    series.forEach(function (s) {
      var sp = byKey[specKey(s.name)] || null;
      s.spec = sp;
      if (sp) sp.series = s;
      /* EPA rated range, used to turn a change in charge into miles */
      var f = sp && (pick(sp.fields, /epa/i) || pick(sp.fields, /^\s*range/i));
      s.epa = f ? num(f[1]) : null;
      s.epaUnit = f && /\bkm\b/i.test(f[1]) ? "km" : "mi";
    });
  }
  function pick(fields, re) {
    for (var i = 0; i < fields.length; i++) if (re.test(fields[i][0])) return fields[i];
    return null;
  }

  /* EPA rated range is defined against the full pack, so the range sitting in
     the battery at a given charge level is simply that fraction of it. This is
     the same arithmetic the car's own range readout does — no assumption about
     charging losses, which the sheet doesn't measure anyway. */
  function rangeAdded(s, soc) {
    if (s.epa == null || soc == null || soc < BASE_SOC) return null;
    return s.epa * (soc - BASE_SOC) / 100;
  }

  /* ======================= LOAD ======================= */
  function note(text, extra) {
    clear(els.note);
    els.note.appendChild(document.createTextNode(text));
    if (extra) els.note.appendChild(extra);
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.curve || !o.at) return null;
      if (Date.now() - o.at > CACHE_MAX_AGE_DAYS * 864e5) return null;
      return o;
    } catch (e) { return null; }
  }
  function writeCache(curve, spec) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), curve: curve, spec: spec })); } catch (e) {}
  }

  /* status: "live" | "checking" (painted from cache, refresh in flight) |
     a timestamp (cache is all we have, Sheets was unreachable) */
  function apply(curveCsv, specCsv, status) {
    var series = buildSeries(curveCsv);
    if (!series.length) throw new Error("no rows");
    state.series = series;
    state.specs = specCsv ? buildSpecs(specCsv) : [];
    linkSpecs(series, state.specs);
    /* state.hidden is deliberately NOT reset: a background refresh must not
       switch vehicles back on that the reader has just switched off. It's keyed
       by name, so a new vehicle still arrives visible. */
    syncWidth();          /* the legend's layout depends on the class, so set it first */
    renderLegend();
    renderSpecs();
    applyView();
    setNote(series.length, status);
  }

  function setNote(count, status) {
    var tail;
    if (status === "live") tail = " · live from Google Sheets";
    else if (status === "checking") tail = " · from your last visit, checking for updates…";
    else tail = " · showing saved data from " + new Date(status).toLocaleDateString() +
               " (couldn't reach Google Sheets)";
    note(count + " charging sessions" + tail);
  }

  function failHard(err) {
    clear(els.empty);
    els.empty.hidden = false;
    els.empty.appendChild(h("div", null, "Couldn't load the charging data."));
    var b = h("button", "evc-retry", "Try again");
    b.type = "button";
    b.addEventListener("click", load);
    els.empty.appendChild(b);
    note("Source: ");
    var a = document.createElement("a");
    a.href = "https://docs.google.com/spreadsheets/d/e/" + SHEET + "/pubhtml";
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "the Google Sheet";
    els.note.appendChild(a);
  }

  /* Stale-while-revalidate: paint the last good copy immediately, then refresh
     in the background. Sheets takes ~0.7-1.4s to answer two tabs on a good
     connection, and that used to be dead time on every single visit. A repeat
     visitor now sees the chart at once and a slow or flaky Sheets response
     becomes invisible instead of a wait. */
  function load() {
    els.empty.hidden = true;

    var cached = readCache();
    var painted = false;
    if (cached) {
      try { apply(cached.curve, cached.spec, "checking"); painted = true; } catch (e) { painted = false; }
    }
    if (!painted) {
      els.card.classList.add("evc-loading");
      note("Loading charging data…");
    }

    Promise.all([
      fetchCsv(CURVE_GID),
      fetchCsv(SPEC_GID).catch(function () { return ""; })
    ]).then(function (res) {
      els.card.classList.remove("evc-loading");
      /* Unchanged data is the common case. Re-rendering it would rebuild the
         legend and steal focus for no reason, so only the status line moves. */
      if (painted && cached && res[0] === cached.curve && res[1] === cached.spec) {
        setNote(state.series.length, "live");
      } else {
        apply(res[0], res[1], "live");
      }
      writeCache(res[0], res[1]);
    }).catch(function (err) {
      els.card.classList.remove("evc-loading");
      if (painted) { setNote(state.series.length, cached.at); return; }
      var c = readCache();
      if (c) { try { apply(c.curve, c.spec, c.at); return; } catch (e) {} }
      failHard(err);
    });
  }

  /* ======================= EVENTS ======================= */
  root.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-x],[data-view],[data-act]") : null;
    if (!b) return;
    if (b.dataset.x) {
      state.xMode = b.dataset.x;
      [].forEach.call(root.querySelectorAll("[data-x]"), function (n) { n.classList.toggle("is-on", n === b); });
      hideTip(); applyView();
    } else if (b.dataset.view) {
      state.view = b.dataset.view;
      [].forEach.call(root.querySelectorAll("[data-view]"), function (n) { n.classList.toggle("is-on", n === b); });
      applyView();
    } else if (b.dataset.act) {
      setAll(b.dataset.act === "all");
    }
  });

  els.svg.addEventListener("pointermove", function (e) { showAt(e.clientX); });
  els.svg.addEventListener("pointerdown", function (e) { showAt(e.clientX); });
  els.svg.addEventListener("pointerleave", hideTip);
  els.svg.addEventListener("blur", hideTip);
  els.svg.addEventListener("keydown", function (e) {
    var d = domain(), step = state.xMode === "soc" ? 1 : (d.x1 - d.x0) / 60;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      state.kx = (state.kx == null ? d.x0 + (d.x1 - d.x0) / 2 : state.kx) + (e.key === "ArrowRight" ? step : -step);
      state.kx = Math.max(d.x0, Math.min(state.kx, d.x1));
      renderHover(state.kx);
    } else if (e.key === "Escape") { hideTip(); }
  });

  var rt;
  function onResize() { clearTimeout(rt); rt = setTimeout(function () { syncWidth(); if (state.view === "chart") { draw(); hideTip(); } }, 120); }
  /* watch the block itself — inside Squarespace it resizes without the window
     ever changing (sidebars, accordions, editor chrome) */
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(root);
  window.addEventListener("resize", onResize);

  load();
})();
