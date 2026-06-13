"use strict";

/* ============================================================
   Sticker Tracker — Panini FIFA World Cup 2026
   Fully client-side: IndexedDB storage. Quick check & add,
   photos (cropped) and notes per sticker.
   ============================================================ */

/* ---------- tiny helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function toast(msg) {
  let t = $(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 1900);
}

/* ============================================================
   Code parsing — normalize what the user types into "ABC 12"
   ============================================================ */

// Tokens that look like a code but are NOT the identifier.
const NOISE_WORDS = new Set([
  "FIFA", "WORLD", "CUP", "PANINI", "OFFICIAL", "LICENSED", "PRODUCT",
  "USED", "MADE", "IN", "BY", "BRAZIL", "BRASIL", "LTDA", "SPA", "WWW",
  "COM", "AND", "ALL", "THE", "PARA", "POR", "POOL"
]);
const MAX_NUM = 20; // max stickers per team in the album

// Normalize a raw string into "ABC 12" form, or null if it isn't a valid code.
// Numbers must be 1..20 (FWC 00 is the lone exception).
function normalizeCode(raw) {
  if (!raw) return null;
  const m = String(raw).toUpperCase().match(/([A-Z]{2,4})\s*[-·.]?\s*(\d{1,3})/);
  if (!m) return null;
  const letters = m[1];
  const num = parseInt(m[2], 10);
  if (NOISE_WORDS.has(letters)) return null;
  const okZero = letters === "FWC" && num === 0; // the unique "00" stamp
  if (!okZero && !(num >= 1 && num <= MAX_NUM)) return null;
  return `${letters} ${num}`;
}

/* ---------- the full World Cup 2026 sticker checklist ----------
   FWC = FIFA World Cup special set, CC = Coca-Cola special set.
   `iso` is the ISO-3166 alpha-2 used to build the flag emoji; `flag`
   overrides it for specials and the home nations. */
const TEAMS = [
  { code: "FWC", name: "FIFA World Cup", flag: "🏆" },
  { code: "MEX", name: "Mexico", iso: "MX" },
  { code: "RSA", name: "South Africa", iso: "ZA" },
  { code: "KOR", name: "South Korea", iso: "KR" },
  { code: "CZE", name: "Czechia", iso: "CZ" },
  { code: "CAN", name: "Canada", iso: "CA" },
  { code: "BIH", name: "Bosnia & Herzegovina", iso: "BA" },
  { code: "QAT", name: "Qatar", iso: "QA" },
  { code: "SUI", name: "Switzerland", iso: "CH" },
  { code: "BRA", name: "Brazil", iso: "BR" },
  { code: "MAR", name: "Morocco", iso: "MA" },
  { code: "HAI", name: "Haiti", iso: "HT" },
  { code: "SCO", name: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
  { code: "USA", name: "United States", iso: "US" },
  { code: "PAR", name: "Paraguay", iso: "PY" },
  { code: "AUS", name: "Australia", iso: "AU" },
  { code: "TUR", name: "Türkiye", iso: "TR" },
  { code: "GER", name: "Germany", iso: "DE" },
  { code: "CUW", name: "Curaçao", iso: "CW" },
  { code: "CIV", name: "Ivory Coast", iso: "CI" },
  { code: "ECU", name: "Ecuador", iso: "EC" },
  { code: "NED", name: "Netherlands", iso: "NL" },
  { code: "JPN", name: "Japan", iso: "JP" },
  { code: "SWE", name: "Sweden", iso: "SE" },
  { code: "TUN", name: "Tunisia", iso: "TN" },
  { code: "BEL", name: "Belgium", iso: "BE" },
  { code: "EGY", name: "Egypt", iso: "EG" },
  { code: "IRN", name: "Iran", iso: "IR" },
  { code: "NZL", name: "New Zealand", iso: "NZ" },
  { code: "ESP", name: "Spain", iso: "ES" },
  { code: "CPV", name: "Cape Verde", iso: "CV" },
  { code: "KSA", name: "Saudi Arabia", iso: "SA" },
  { code: "URU", name: "Uruguay", iso: "UY" },
  { code: "FRA", name: "France", iso: "FR" },
  { code: "SEN", name: "Senegal", iso: "SN" },
  { code: "IRQ", name: "Iraq", iso: "IQ" },
  { code: "NOR", name: "Norway", iso: "NO" },
  { code: "ARG", name: "Argentina", iso: "AR" },
  { code: "ALG", name: "Algeria", iso: "DZ" },
  { code: "AUT", name: "Austria", iso: "AT" },
  { code: "JOR", name: "Jordan", iso: "JO" },
  { code: "POR", name: "Portugal", iso: "PT" },
  { code: "COD", name: "DR Congo", iso: "CD" },
  { code: "UZB", name: "Uzbekistan", iso: "UZ" },
  { code: "COL", name: "Colombia", iso: "CO" },
  { code: "ENG", name: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { code: "CRO", name: "Croatia", iso: "HR" },
  { code: "GHA", name: "Ghana", iso: "GH" },
  { code: "PAN", name: "Panama", iso: "PA" },
  { code: "CC", name: "Coca-Cola", flag: "🥤", slots: 14 },
];
const TEAM_BY_CODE = Object.fromEntries(TEAMS.map((t) => [t.code, t]));
const DEFAULT_SLOTS = 20;
// The sticker numbers on a team's page. FWC is special: 1–19 plus the unique
// prefix-less "00" stamp (number 0) in the 20th spot.
function slotNumbersFor(code) {
  if (code === "FWC") return [...Array(19)].map((_, i) => i + 1).concat([0]);
  const n = TEAM_BY_CODE[code]?.slots || DEFAULT_SLOTS;
  return [...Array(n)].map((_, i) => i + 1);
}
function slotsFor(code) { return slotNumbersFor(code).length; }
function slotLabel(n) { return n === 0 ? "00" : String(n); }

function flagFor(code) {
  const t = TEAM_BY_CODE[code];
  if (!t) return "🏳️";
  if (t.flag) return t.flag;
  if (t.iso) return t.iso.replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
  return "🏳️";
}

function teamOf(code) { return code.split(" ")[0]; }
function numOf(code) { return parseInt(code.split(" ")[1], 10) || 0; }

/* ============================================================
   Storage — IndexedDB
   ============================================================ */
const DB = {
  _db: null,
  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("sticker-tracker", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("stickers")) {
          db.createObjectStore("stickers", { keyPath: "code" });
        }
      };
      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  },
  _tx(mode) { return this._db.transaction("stickers", mode).objectStore("stickers"); },
  getAll() {
    return new Promise((res, rej) => {
      const r = this._tx("readonly").getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
  },
  get(code) {
    return new Promise((res, rej) => {
      const r = this._tx("readonly").get(code);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    });
  },
  put(item) {
    return new Promise((res, rej) => {
      const r = this._tx("readwrite").put(item);
      r.onsuccess = () => res(item);
      r.onerror = () => rej(r.error);
    });
  },
  del(code) {
    return new Promise((res, rej) => {
      const r = this._tx("readwrite").delete(code);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  },
  clear() {
    return new Promise((res, rej) => {
      const r = this._tx("readwrite").clear();
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  },
};

/* ============================================================
   Collection operations
   ============================================================ */
async function addOrIncrement(code, { name = "", photo = "" } = {}) {
  const existing = await DB.get(code);
  const now = Date.now();
  if (existing) {
    existing.qty = (existing.qty || 1) + 1;
    existing.updatedAt = now;
    if (name) existing.name = name;     // if the user bothered to add it, keep it
    if (photo) existing.photo = photo;
    await DB.put(existing);
    return { item: existing, wasNew: false };
  }
  const item = { code, team: teamOf(code), number: numOf(code), qty: 1, name, photo, addedAt: now, updatedAt: now };
  await DB.put(item);
  return { item, wasNew: true };
}

async function setQty(code, qty) {
  const item = await DB.get(code);
  if (!item) return;
  if (qty <= 0) { await DB.del(code); return null; }
  item.qty = qty; item.updatedAt = Date.now();
  await DB.put(item);
  return item;
}

/* ============================================================
   Image helpers — load a photo, crop it, store a small JPEG
   ============================================================ */
function cropRegion(src, x, y, w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  c.getContext("2d").drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
  return c;
}

function canvasToDataUrl(canvas, max = 640) {
  const scale = Math.min(1, max / Math.max(canvas.width, canvas.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(canvas.width * scale));
  c.height = Math.max(1, Math.round(canvas.height * scale));
  c.getContext("2d").drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.72);
}

function loadImageToCanvas(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      const max = 1600;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/* ============================================================
   Cropper — modal overlay to keep only the important part
   ============================================================ */
const Cropper = {
  source: null, scale: 1, sel: null, onDone: null, _bound: false,

  open(sourceCanvas, onDone) {
    this.source = sourceCanvas;
    this.onDone = onDone;
    const box = $("#cropper");
    box.hidden = false;

    const stage = $("#crop-stage");
    const canvas = $("#crop-canvas");
    const maxW = stage.clientWidth || Math.min(window.innerWidth - 60, 480);
    const maxH = Math.round(Math.min(window.innerHeight * 0.55, 520));
    let dispW = maxW;
    let dispH = Math.round((sourceCanvas.height / sourceCanvas.width) * dispW);
    if (dispH > maxH) { dispH = maxH; dispW = Math.round((sourceCanvas.width / sourceCanvas.height) * dispH); }
    canvas.width = dispW; canvas.height = dispH;
    canvas.getContext("2d").drawImage(sourceCanvas, 0, 0, dispW, dispH);
    this.scale = sourceCanvas.width / dispW;

    // default selection: centered box covering most of the photo
    this.sel = { x: Math.round(dispW * 0.12), y: Math.round(dispH * 0.12), w: Math.round(dispW * 0.76), h: Math.round(dispH * 0.76) };
    this._drawSel();
    this._bind();
  },

  close() { $("#cropper").hidden = true; this.source = null; this.onDone = null; },

  _drawSel() {
    const s = this.sel, el = $("#crop-sel");
    el.style.left = s.x + "px"; el.style.top = s.y + "px";
    el.style.width = s.w + "px"; el.style.height = s.h + "px";
  },

  _bind() {
    if (this._bound) return;
    this._bound = true;
    const stage = $("#crop-stage");
    const canvas = $("#crop-canvas");
    let start = null;
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(canvas.width, e.clientX - r.left)),
        y: Math.max(0, Math.min(canvas.height, e.clientY - r.top)),
      };
    };
    stage.addEventListener("pointerdown", (e) => {
      start = pos(e); stage.setPointerCapture(e.pointerId);
      this.sel = { x: start.x, y: start.y, w: 0, h: 0 }; this._drawSel();
    });
    stage.addEventListener("pointermove", (e) => {
      if (!start) return;
      const p = pos(e);
      this.sel = {
        x: Math.min(start.x, p.x), y: Math.min(start.y, p.y),
        w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y),
      };
      this._drawSel();
    });
    stage.addEventListener("pointerup", () => {
      // ignore tiny accidental selections — keep a sensible default
      if (this.sel.w < 16 || this.sel.h < 16) {
        this.sel = { x: Math.round(canvas.width * 0.12), y: Math.round(canvas.height * 0.12), w: Math.round(canvas.width * 0.76), h: Math.round(canvas.height * 0.76) };
        this._drawSel();
      }
      start = null;
    });
  },

  useSelection() {
    if (!this.source) return;
    const s = this.sel;
    const crop = cropRegion(this.source, s.x * this.scale, s.y * this.scale, s.w * this.scale, s.h * this.scale);
    this._finish(canvasToDataUrl(crop));
  },

  useWhole() {
    if (!this.source) return;
    this._finish(canvasToDataUrl(this.source));
  },

  _finish(dataUrl) {
    const cb = this.onDone;
    this.close();
    cb && cb(dataUrl);
  },
};

// Shared entry point: load a picked file and hand it to the cropper.
async function pickPhoto(file, onDone) {
  if (!file) return;
  try {
    const canvas = await loadImageToCanvas(file);
    Cropper.open(canvas, onDone);
  } catch {
    toast("Couldn't load that image");
  }
}

/* ============================================================
   Quick check & add — the fast loop: type, see new/double, add,
   stay on screen, repeat. No navigating away.
   ============================================================ */
let qaPhoto = "";
const recentCodes = []; // codes added this session, most-recent first

function setQaPhoto(dataUrl) {
  qaPhoto = dataUrl || "";
  const thumb = $("#qa-thumb"), clear = $("#qa-photo-clear");
  if (qaPhoto) { thumb.src = qaPhoto; thumb.hidden = false; clear.hidden = false; }
  else { thumb.hidden = true; clear.hidden = true; }
}

async function refreshQaBanner() {
  const banner = $("#qa-banner");
  const addBtn = $("#qa-add");
  const dupeBtn = $("#qa-dupe");
  const code = normalizeCode($("#qa-code").value);
  if (!code) {
    banner.hidden = true; dupeBtn.hidden = true;
    addBtn.disabled = true; addBtn.textContent = "Enter a code";
    return;
  }
  addBtn.disabled = false;
  const existing = await DB.get(code);
  if (existing) {
    banner.hidden = false; banner.className = "banner dupe";
    banner.textContent = `⚠ DOUBLE — you already have ${code}` + (existing.qty > 1 ? ` (×${existing.qty})` : "") + ". It's a swap!";
    dupeBtn.hidden = false;
    addBtn.textContent = "Add anyway (+1)";
  } else {
    banner.hidden = false; banner.className = "banner new";
    banner.textContent = `✅ NEW — ${code} isn't in your collection yet`;
    dupeBtn.hidden = true;
    addBtn.textContent = "Add to collection";
  }
}

async function commitQuickAdd() {
  const code = normalizeCode($("#qa-code").value);
  if (!code) { toast("That doesn't look like a valid code"); return; }
  const name = $("#qa-name").value.trim();
  const { wasNew } = await addOrIncrement(code, { name, photo: qaPhoto });
  toast(wasNew ? `Added ${code}` : `${code} → double counted`);
  pushRecent(code);
  // Reset for the next card — but stay right here.
  $("#qa-code").value = ""; $("#qa-name").value = ""; setQaPhoto("");
  await renderStats();
  await refreshQaBanner();
  rerenderLists();
  $("#qa-code").focus();
}

function pushRecent(code) {
  const i = recentCodes.indexOf(code);
  if (i >= 0) recentCodes.splice(i, 1);
  recentCodes.unshift(code);
  if (recentCodes.length > 12) recentCodes.length = 12;
}

function renderRecent() {
  const box = $("#qa-recent");
  const head = $("#qa-recent-head");
  box.innerHTML = "";
  const items = recentCodes.map((c) => _cache.find((x) => x.code === c)).filter(Boolean);
  head.hidden = items.length === 0;
  items.forEach((x) => box.appendChild(rowEl(x)));
}

/* ============================================================
   Editor — add/replace a photo and edit the note on any sticker
   ============================================================ */
let editingCode = "";
let editorPhoto = "";

function setEditorPhoto(dataUrl) {
  editorPhoto = dataUrl || "";
  const thumb = $("#editor-thumb"), clear = $("#editor-photo-clear");
  if (editorPhoto) { thumb.src = editorPhoto; thumb.hidden = false; clear.hidden = false; }
  else { thumb.hidden = true; clear.hidden = true; }
}

async function openEditor(code) {
  const item = await DB.get(code);
  if (!item) return;
  editingCode = code;
  $("#editor-title").textContent = `Edit ${code}`;
  $("#editor-name").value = item.name || "";
  setEditorPhoto(item.photo || "");
  $("#editor").hidden = false;
}

function closeEditor() { $("#editor").hidden = true; editingCode = ""; editorPhoto = ""; }

async function saveEditor() {
  if (!editingCode) return;
  const item = await DB.get(editingCode);
  if (!item) { closeEditor(); return; }
  item.name = $("#editor-name").value.trim();
  item.photo = editorPhoto;
  item.updatedAt = Date.now();
  await DB.put(item);
  closeEditor();
  await renderStats();
  rerenderLists();
  toast("Saved");
}

/* ============================================================
   Collection rendering
   ============================================================ */
let _cache = [];

async function renderStats() {
  _cache = await DB.getAll();
  const unique = _cache.length;
  const total = _cache.reduce((s, x) => s + (x.qty || 1), 0);
  const doubles = _cache.reduce((s, x) => s + Math.max(0, (x.qty || 1) - 1), 0);
  $("#stats").innerHTML = `<b>${unique}</b> unique · <b>${total}</b> total${doubles ? ` · <b>${doubles}</b> doubles` : ""}`;
}

// Re-render any list currently showing rows (the recents on Quick add, the
// Swaps list, the Album slots) after a change, without switching views.
function rerenderLists() {
  if ($("#view-collection").classList.contains("active")) renderCollection();
  if ($("#view-quickadd").classList.contains("active")) renderRecent();
  if ($("#view-album").classList.contains("active") && !$("#slots-panel").hidden) renderSlots();
}

function renderCollection() {
  const q = $("#search").value.trim().toUpperCase();
  const onlyDupes = $("#only-dupes").checked;
  const sort = $("#sort").value;

  let items = _cache.filter((x) => (x.qty || 1) > 0);
  if (onlyDupes) items = items.filter((x) => (x.qty || 1) > 1);
  if (q) items = items.filter((x) =>
    x.code.includes(q) || (x.name || "").toUpperCase().includes(q) || x.team.includes(q));

  const list = $("#collection-list");
  const empty = $("#collection-empty");
  list.innerHTML = "";

  if (!items.length) {
    empty.classList.add("on");
    empty.textContent = _cache.length ? "No stickers match your filters." : "Nothing yet. Add stickers in Quick add or fill the Album.";
    return;
  }
  empty.classList.remove("on");

  if (sort === "recent") items.sort((a, b) => b.updatedAt - a.updatedAt);
  else if (sort === "dupes") items.sort((a, b) => (b.qty || 1) - (a.qty || 1) || cmpCode(a, b));
  else items.sort(cmpCode);

  if (sort === "code") {
    // group by team
    const groups = {};
    items.forEach((x) => (groups[x.team] ||= []).push(x));
    Object.keys(groups).sort().forEach((team) => {
      const head = document.createElement("div");
      head.className = "team-head";
      head.textContent = team;
      list.appendChild(head);
      groups[team].forEach((x) => list.appendChild(rowEl(x)));
    });
  } else {
    items.forEach((x) => list.appendChild(rowEl(x)));
  }
}

function cmpCode(a, b) {
  return a.team < b.team ? -1 : a.team > b.team ? 1 : (a.number - b.number);
}

function rowEl(x) {
  const row = document.createElement("div");
  row.className = "row";
  const qty = x.qty || 1;
  row.innerHTML = `
    <div class="thumb" data-act="edit" title="Edit photo / note">${x.photo ? `<img src="${x.photo}" alt="">` : "🏷️"}</div>
    <div class="meta" data-act="edit">
      <div class="code">${x.code}</div>
      <div class="name">${x.name ? escapeHtml(x.name) : "—"}</div>
    </div>
    <div class="qty">
      ${qty > 1 ? `<span class="badge dupe">${qty - 1} spare</span>` : ""}
      <div class="stepper">
        <button data-act="dec">−</button>
        <span class="n">${qty}</span>
        <button data-act="inc">+</button>
      </div>
      <button class="del" data-act="del" title="Remove">🗑</button>
    </div>`;
  row.addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "edit") { openEditor(x.code); return; }
    if (act === "inc") await setQty(x.code, qty + 1);
    else if (act === "dec") await setQty(x.code, qty - 1);
    else if (act === "del") {
      if (!confirm(`Remove ${x.code} from your collection?`)) return;
      await DB.del(x.code);
    }
    await renderStats();
    rerenderLists();
  });
  return row;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ============================================================
   Album — browse/fill by country, see have vs missing per team
   ============================================================ */
let _slotsTeam = null;

// number -> qty for a team's owned stickers
function ownedForTeam(team) {
  const map = {};
  for (const x of _cache) if (x.team === team && (x.qty || 1) > 0) map[x.number] = x.qty || 1;
  return map;
}
function haveCount(team) {
  const owned = ownedForTeam(team);
  return slotNumbersFor(team).filter((n) => owned[n]).length;
}

function renderAlbum() {
  const q = $("#album-search").value.trim().toLowerCase();
  const grid = $("#album-grid");
  grid.innerHTML = "";
  for (const t of TEAMS) {
    if (q && !(t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))) continue;
    const total = slotsFor(t.code);
    const have = haveCount(t.code);
    const tile = document.createElement("button");
    tile.className = "album-tile" + (have === total ? " complete" : "");
    tile.innerHTML = `
      <span class="flag">${flagFor(t.code)}</span>
      <span class="t-code">${t.code}</span>
      <span class="t-name">${escapeHtml(t.name)}</span>
      <span class="t-bar"><i style="width:${Math.round((have / total) * 100)}%"></i></span>
      <span class="t-prog">${have}/${total}</span>`;
    tile.addEventListener("click", () => openSlots(t.code));
    grid.appendChild(tile);
  }
}

function openSlots(code) {
  _slotsTeam = code;
  $("#album-browse").hidden = true;
  $("#slots-panel").hidden = false;
  $("#slots-flag").textContent = flagFor(code);
  $("#slots-name").textContent = `${TEAM_BY_CODE[code].name} (${code})`;
  // prev/next labels (wrap around the checklist order)
  const i = TEAMS.findIndex((t) => t.code === code);
  const prev = TEAMS[(i - 1 + TEAMS.length) % TEAMS.length];
  const next = TEAMS[(i + 1) % TEAMS.length];
  $("#slots-prev").innerHTML = `‹ ${flagFor(prev.code)} ${prev.code}`;
  $("#slots-next").innerHTML = `${flagFor(next.code)} ${next.code} ›`;
  $("#slots-panel").scrollIntoView({ block: "start" });
  renderSlots();
}

function stepCountry(dir) {
  const i = TEAMS.findIndex((t) => t.code === _slotsTeam);
  openSlots(TEAMS[(i + dir + TEAMS.length) % TEAMS.length].code);
}

function renderSlots() {
  const code = _slotsTeam;
  const total = slotsFor(code);
  const owned = ownedForTeam(code);
  const grid = $("#slots-grid");
  grid.innerHTML = "";
  for (const n of slotNumbersFor(code)) {
    const qty = owned[n] || 0;
    const b = document.createElement("button");
    b.className = "slot" + (qty ? " have" : "") + (n === 0 ? " stamp" : "");
    b.innerHTML = `${slotLabel(n)}${qty > 1 ? `<span class="dbl">×${qty}</span>` : ""}`;
    b.addEventListener("click", () => toggleSlot(code, n));
    grid.appendChild(b);
  }
  const have = haveCount(code);
  $("#slots-progress").textContent = have === total
    ? `Complete! ${total}/${total} ✅`
    : `${have} of ${total} collected · ${total - have} missing`;
}

async function toggleSlot(code, n) {
  const full = `${code} ${n}`;
  const existing = await DB.get(full);
  if (existing) await DB.del(full);
  else await addOrIncrement(full);
  await renderStats();
  renderSlots();
}

function closeSlots() {
  $("#slots-panel").hidden = true;
  $("#album-browse").hidden = false;
  renderAlbum();
}

async function markAllSlots(have) {
  const code = _slotsTeam;
  if (!have && !confirm(`Clear all of ${TEAM_BY_CODE[code].name}? This also removes any doubles.`)) return;
  for (const n of slotNumbersFor(code)) {
    const full = `${code} ${n}`;
    const existing = await DB.get(full);
    if (have && !existing) await addOrIncrement(full);
    else if (!have && existing) await DB.del(full);
  }
  await renderStats();
  renderSlots();
}

/* ============================================================
   Backup
   ============================================================ */
function download(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportJSON() {
  const items = await DB.getAll();
  download(`stickers-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ app: "sticker-tracker", version: 1, exported: Date.now(), stickers: items }, null, 2));
  toast(`Exported ${items.length} stickers`);
}

async function exportCSV() {
  const items = (await DB.getAll()).sort(cmpCode);
  const rows = [["code", "team", "number", "qty", "name"]];
  items.forEach((x) => rows.push([x.code, x.team, x.number, x.qty || 1, (x.name || "").replace(/"/g, '""')]));
  const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  download(`stickers-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
  toast("Exported CSV");
}

async function importJSON(file) {
  const text = await file.text();
  let data;
  try { data = JSON.parse(text); } catch { toast("Not a valid JSON file"); return; }
  const incoming = Array.isArray(data) ? data : data.stickers;
  if (!Array.isArray(incoming)) { toast("No stickers found in file"); return; }
  let added = 0, merged = 0;
  for (const raw of incoming) {
    const code = normalizeCode(raw.code);
    if (!code) continue;
    const existing = await DB.get(code);
    if (existing) {
      existing.qty = Math.max(existing.qty || 1, raw.qty || 1);
      existing.name ||= raw.name || "";
      existing.photo ||= raw.photo || "";
      existing.updatedAt = Date.now();
      await DB.put(existing); merged++;
    } else {
      await DB.put({
        code, team: teamOf(code), number: numOf(code),
        qty: raw.qty || 1, name: raw.name || "", photo: raw.photo || "",
        addedAt: raw.addedAt || Date.now(), updatedAt: Date.now(),
      });
      added++;
    }
  }
  await renderStats(); rerenderLists();
  toast(`Imported — ${added} new, ${merged} merged`);
}

/* ============================================================
   Navigation
   ============================================================ */
const VIEW_TITLES = { quickadd: "Quick add", album: "Album", collection: "Swaps & doubles", backup: "Backup" };

function switchView(name) {
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
  $$(".menu-item").forEach((m) => m.classList.toggle("active", m.dataset.view === name));
  $("#view-title").textContent = VIEW_TITLES[name] || "Sticker Tracker";
  closeMenu();
  if (name === "collection") renderCollection();
  if (name === "album") { $("#slots-panel").hidden = true; $("#album-browse").hidden = false; renderAlbum(); }
  if (name === "quickadd") {
    refreshQaBanner();
    renderRecent();
    setTimeout(() => $("#qa-code").focus(), 50);
  }
}

function openMenu() { $("#menu").hidden = false; }
function closeMenu() { $("#menu").hidden = true; }

/* ============================================================
   Wire-up
   ============================================================ */
async function main() {
  await DB.open();
  await renderStats();

  // Menu navigation
  $("#menu-btn").addEventListener("click", openMenu);
  $("#menu").addEventListener("click", (e) => { if (e.target.id === "menu") closeMenu(); });
  $$(".menu-item").forEach((m) => m.addEventListener("click", () => switchView(m.dataset.view)));

  // Quick check & add
  $("#qa-code").addEventListener("input", refreshQaBanner);
  $("#qa-code").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !$("#qa-add").disabled) commitQuickAdd();
  });
  $("#qa-add").addEventListener("click", commitQuickAdd);
  $("#qa-dupe").addEventListener("click", commitQuickAdd);
  $("#qa-photo").addEventListener("change", (e) => {
    const f = e.target.files[0]; e.target.value = "";
    pickPhoto(f, setQaPhoto);
  });
  $("#qa-photo-clear").addEventListener("click", () => setQaPhoto(""));

  // Cropper overlay
  $("#crop-use").addEventListener("click", () => Cropper.useSelection());
  $("#crop-full").addEventListener("click", () => Cropper.useWhole());
  $("#crop-cancel").addEventListener("click", () => Cropper.close());
  $("#cropper").addEventListener("click", (e) => { if (e.target.id === "cropper") Cropper.close(); });

  // Editor overlay (existing sticker: photo + note)
  $("#editor-photo").addEventListener("change", (e) => {
    const f = e.target.files[0]; e.target.value = "";
    pickPhoto(f, setEditorPhoto);
  });
  $("#editor-photo-clear").addEventListener("click", () => setEditorPhoto(""));
  $("#editor-save").addEventListener("click", saveEditor);
  $("#editor-close").addEventListener("click", closeEditor);
  $("#editor").addEventListener("click", (e) => { if (e.target.id === "editor") closeEditor(); });

  // Album
  $("#album-search").addEventListener("input", renderAlbum);
  $("#slots-back").addEventListener("click", closeSlots);
  $("#slots-prev").addEventListener("click", () => stepCountry(-1));
  $("#slots-next").addEventListener("click", () => stepCountry(1));
  $("#slots-all").addEventListener("click", () => markAllSlots(true));
  $("#slots-none").addEventListener("click", () => markAllSlots(false));

  // Collection (swaps)
  $("#search").addEventListener("input", renderCollection);
  $("#sort").addEventListener("change", renderCollection);
  $("#only-dupes").addEventListener("change", renderCollection);

  // Backup
  $("#btn-export").addEventListener("click", exportJSON);
  $("#btn-export-csv").addEventListener("click", exportCSV);
  $("#import-file").addEventListener("change", (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (f) importJSON(f);
  });
  $("#btn-wipe").addEventListener("click", async () => {
    if (!confirm("Erase your ENTIRE collection? This cannot be undone (export a backup first).")) return;
    await DB.clear();
    await renderStats(); rerenderLists();
    toast("Collection erased");
  });

  // Service worker (offline) — optional, ignored if unsupported / file://
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  // Land on the Album (home).
  switchView("album");
}

main();
