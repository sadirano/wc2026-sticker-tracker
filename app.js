"use strict";

/* ============================================================
   Sticker Tracker — Panini FIFA World Cup 2026
   Fully client-side: IndexedDB storage. Quick check & add,
   with an optional note per sticker.
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

   Data is split across profiles so you can keep your own album
   alongside friends' lists (imported from their JSON) and check
   codes against any of them. Each sticker lives in the "items"
   store keyed by "<profileId>::<code>" with a profileId index;
   profiles themselves live in the "profiles" store.

   `DB.profile` selects which collection every read/write targets.
   ============================================================ */
const HOME_PROFILE = "me";

const DB = {
  _db: null,
  profile: HOME_PROFILE, // the active collection for get/put/del/getAll

  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("sticker-tracker", 2);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        const tx = e.target.transaction;
        if (!db.objectStoreNames.contains("profiles")) {
          db.createObjectStore("profiles", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("items")) {
          const items = db.createObjectStore("items", { keyPath: "id" });
          items.createIndex("profileId", "profileId", { unique: false });
        }
        // Always have a home profile.
        tx.objectStore("profiles").put({ id: HOME_PROFILE, name: "My collection", createdAt: Date.now() });
        // Migrate the old single-collection store into the home profile.
        if (db.objectStoreNames.contains("stickers")) {
          const old = tx.objectStore("stickers");
          const items = tx.objectStore("items");
          old.openCursor().onsuccess = (ev) => {
            const cur = ev.target.result;
            if (cur) {
              const s = cur.value;
              items.put({ ...s, id: HOME_PROFILE + "::" + s.code, profileId: HOME_PROFILE });
              cur.continue();
            } else {
              db.deleteObjectStore("stickers");
            }
          };
        }
      };
      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  },

  _items(mode) { return this._db.transaction("items", mode).objectStore("items"); },
  _id(code) { return this.profile + "::" + code; },

  getAll() {
    return new Promise((res, rej) => {
      const r = this._items("readonly").index("profileId").getAll(IDBKeyRange.only(this.profile));
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
  },
  get(code) {
    return new Promise((res, rej) => {
      const r = this._items("readonly").get(this._id(code));
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    });
  },
  put(item) {
    item.profileId = this.profile;
    item.id = this._id(item.code);
    return new Promise((res, rej) => {
      const r = this._items("readwrite").put(item);
      r.onsuccess = () => res(item);
      r.onerror = () => rej(r.error);
    });
  },
  del(code) {
    return new Promise((res, rej) => {
      const r = this._items("readwrite").delete(this._id(code));
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  },
  clear() {
    // Wipe only the active profile's stickers.
    return new Promise((res, rej) => {
      const r = this._items("readwrite").index("profileId").openCursor(IDBKeyRange.only(this.profile));
      r.onsuccess = () => { const c = r.result; if (c) { c.delete(); c.continue(); } else res(); };
      r.onerror = () => rej(r.error);
    });
  },

  /* ---- profiles ---- */
  getProfiles() {
    return new Promise((res, rej) => {
      const r = this._db.transaction("profiles", "readonly").objectStore("profiles").getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
  },
  putProfile(p) {
    return new Promise((res, rej) => {
      const r = this._db.transaction("profiles", "readwrite").objectStore("profiles").put(p);
      r.onsuccess = () => res(p);
      r.onerror = () => rej(r.error);
    });
  },
  delProfile(id) {
    // Remove the profile and every sticker that belongs to it.
    return new Promise((res, rej) => {
      const tx = this._db.transaction(["profiles", "items"], "readwrite");
      tx.objectStore("profiles").delete(id);
      const cur = tx.objectStore("items").index("profileId").openCursor(IDBKeyRange.only(id));
      cur.onsuccess = () => { const c = cur.result; if (c) { c.delete(); c.continue(); } };
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
};

/* ============================================================
   Collection operations
   ============================================================ */
async function addOrIncrement(code, { name = "" } = {}) {
  const existing = await DB.get(code);
  const now = Date.now();
  if (existing) {
    existing.qty = (existing.qty || 1) + 1;
    existing.updatedAt = now;
    if (name) existing.name = name;     // if the user bothered to add it, keep it
    await DB.put(existing);
    return { item: existing, wasNew: false };
  }
  const item = { code, team: teamOf(code), number: numOf(code), qty: 1, name, addedAt: now, updatedAt: now };
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
   Quick check & add — the fast loop: type, see new/double, add,
   stay on screen, repeat. No navigating away.
   ============================================================ */
const recentCodes = []; // codes added this session, most-recent first

// Reflect the new/double state on the input, indicator pill and +1 button.
function setQaState(state, label) {
  const input = $("#qa-code");
  const indicator = $("#qa-indicator");
  const addBtn = $("#qa-add");
  input.classList.toggle("new", state === "new");
  input.classList.toggle("dupe", state === "dupe");
  addBtn.classList.toggle("new", state === "new");
  addBtn.classList.toggle("dupe", state === "dupe");
  if (state) { indicator.className = "qa-indicator " + state; indicator.textContent = label; indicator.hidden = false; }
  else { indicator.hidden = true; indicator.textContent = ""; }
}

async function refreshQaBanner() {
  const banner = $("#qa-banner");
  const addBtn = $("#qa-add");
  const clearBtn = $("#qa-clear");
  const raw = $("#qa-code").value;
  clearBtn.hidden = !raw;
  const code = normalizeCode(raw);
  if (!code) {
    banner.hidden = true;
    addBtn.disabled = true;
    setQaState("", "");
    return;
  }
  addBtn.disabled = false;
  const mine = isHome();
  const who = profileName(activeProfile);
  const existing = await DB.get(code);
  if (existing) {
    const times = existing.qty > 1 ? ` (×${existing.qty})` : "";
    banner.hidden = false; banner.className = "banner dupe";
    banner.textContent = mine
      ? `⚠ DOUBLE — you already have ${code}${times}. It's a swap!`
      : `⚠ ${who} already has ${code}${times}`;
    setQaState("dupe", "!");
  } else {
    banner.hidden = false; banner.className = "banner new";
    banner.textContent = mine
      ? `✅ NEW — ${code} isn't in your collection yet`
      : `✅ ${who} is missing ${code}`;
    setQaState("new", "✓");
  }
}

async function commitQuickAdd() {
  const code = normalizeCode($("#qa-code").value);
  if (!code) { toast("That doesn't look like a valid code"); return; }
  const name = $("#qa-name").value.trim();
  const { wasNew } = await addOrIncrement(code, { name });
  toast(wasNew ? `Added ${code}` : `${code} → double counted`);
  pushRecent(code);
  // Reset for the next card — keep the team prefix so the next number is quick.
  $("#qa-code").value = teamOf(code) + " ";
  $("#qa-name").value = "";
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

async function openEditor(code) {
  const item = await DB.get(code);
  if (!item) return;
  editingCode = code;
  $("#editor-title").textContent = `Edit ${code}`;
  $("#editor-name").value = item.name || "";
  $("#editor").hidden = false;
}

function closeEditor() { $("#editor").hidden = true; editingCode = ""; }

async function saveEditor() {
  if (!editingCode) return;
  const item = await DB.get(editingCode);
  if (!item) { closeEditor(); return; }
  item.name = $("#editor-name").value.trim();
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
    <button class="step minus" data-act="dec" aria-label="Remove one">−</button>
    <div class="meta" data-act="edit">
      <div class="code">${x.code}</div>
      <div class="name">${x.name ? escapeHtml(x.name) : "—"}</div>
    </div>
    ${qty > 1 ? `<span class="badge dupe">${qty - 1} spare</span>` : ""}
    <span class="n">${qty}</span>
    <button class="step plus" data-act="inc" aria-label="Add one">+</button>`;
  row.addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "edit") { openEditor(x.code); return; }
    if (act === "inc") await setQty(x.code, qty + 1);
    else if (act === "dec") {
      // Removing the last copy drops the card entirely — make sure that's intended.
      if (qty <= 1 && !confirm(`Remove ${x.code} from your collection?`)) return;
      await setQty(x.code, qty - 1);
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
// Full backup as copy-pasteable text (includes doubles). Keep it somewhere
// safe — a note to yourself, an email — and paste it back to restore.
async function copyBackup() {
  const items = (await DB.getAll()).map(({ id, profileId, ...rest }) => rest);
  const json = JSON.stringify({ app: "sticker-tracker", version: 1, exported: Date.now(), stickers: items });
  await shareText(json, `Backup copied (${items.length} stickers) — save it somewhere safe`);
}

// Build a plain-text list of the stickers still missing, grouped by team,
// in a friendly form you can paste into a chat to ask friends for swaps.
function buildNeedsList() {
  const lines = [];
  let total = 0;
  for (const t of TEAMS) {
    const owned = ownedForTeam(t.code);
    const missing = slotNumbersFor(t.code).filter((n) => !owned[n]);
    if (!missing.length) continue;
    total += missing.length;
    lines.push(`${t.code} (${t.name}): ${missing.map(slotLabel).join(", ")}`);
  }
  const header = isHome()
    ? "Panini WC 2026 — stickers I still need"
    : `Panini WC 2026 — stickers ${profileName(activeProfile)} still needs`;
  if (!total) return `${header}\n\nNone — the album is complete! 🎉`;
  return `${header}\n\n${lines.join("\n")}\n\nMissing ${total} in total.`;
}

// Hand a piece of text off to the user to paste elsewhere (WhatsApp, etc.).
// Prefer the native share sheet, then the clipboard, and finally drop it into
// the paste box and select it so it can be copied by hand. No files involved.
async function shareText(text, okMsg = "Copied — paste it to a friend") {
  if (navigator.share) {
    try { await navigator.share({ text }); return; }
    catch (err) { if (err && err.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(text); toast(okMsg); return; }
  catch { /* fall through to manual copy */ }
  const box = $("#paste-list");
  if (box) {
    box.value = text;
    box.scrollIntoView({ block: "center" });
    box.focus(); box.select();
    toast("Select all and copy this text");
  }
}

// Share one of the lists the user picks. Missing = what to ask friends for
// (shortest once the album is >50% done); have = a "1 of each" snapshot others
// can import to check against; spares = the doubles you can give away.
function shareList(kind) {
  const text = kind === "missing" ? buildNeedsList()
    : kind === "spares" ? buildSparesText()
    : buildHavesText();
  return shareText(text);
}

// Plain-text "1 of each" list: just the codes you own, grouped by team.
// Doubles/qty are intentionally left out — that stays private to you.
function buildHavesText() {
  const lines = [];
  let total = 0;
  for (const t of TEAMS) {
    const owned = ownedForTeam(t.code);
    const have = slotNumbersFor(t.code).filter((n) => owned[n]);
    if (!have.length) continue;
    total += have.length;
    lines.push(`${t.code}: ${have.map(slotLabel).join(", ")}`);
  }
  const whose = isHome() ? "my" : `${profileName(activeProfile)}'s`;
  const header = `Panini WC 2026 — ${whose} stickers (1 of each)`;
  if (!total) return `${header}\n\n(none yet)`;
  return `${header}\n\n${lines.join("\n")}\n\n${total} different stickers.`;
}

// Plain-text list of the doubles you can give away, grouped by team. A "×n"
// suffix shows how many spares of that sticker you have (when more than one).
function buildSparesText() {
  const lines = [];
  let total = 0;
  for (const t of TEAMS) {
    const owned = ownedForTeam(t.code);
    const spares = slotNumbersFor(t.code)
      .filter((n) => (owned[n] || 0) > 1)
      .map((n) => slotLabel(n) + (owned[n] - 1 > 1 ? `×${owned[n] - 1}` : ""));
    if (!spares.length) continue;
    total += slotNumbersFor(t.code).reduce((s, n) => s + Math.max(0, (owned[n] || 0) - 1), 0);
    lines.push(`${t.code}: ${spares.join(", ")}`);
  }
  const whose = isHome() ? "my" : `${profileName(activeProfile)}'s`;
  const header = `Panini WC 2026 — ${whose} spares to swap`;
  if (!total) return `${header}\n\nNo doubles yet.`;
  return `${header}\n\n${lines.join("\n")}\n\n${total} spares to give away.`;
}

// Parse a plain-text list back into sticker rows (one of each). Accepts the
// "TEAM: 1, 2, 5" grouped format (with or without a team name in parentheses)
// and also any loose full codes like "MEX 11" scattered in the text.
function parsePlainText(text) {
  const codes = new Set();
  for (const line of text.split(/\r?\n/)) {
    const grouped = line.match(/^\s*([A-Za-z]{2,4})\b[^:]*:\s*(.+)$/);
    if (grouped && TEAM_BY_CODE[grouped[1].toUpperCase()]) {
      const team = grouped[1].toUpperCase();
      for (const tok of grouped[2].match(/\d{1,3}/g) || []) {
        const code = normalizeCode(`${team} ${parseInt(tok, 10)}`);
        if (code) codes.add(code);
      }
      continue;
    }
    const re = /([A-Za-z]{2,4})\s*[-·.]?\s*(\d{1,3})/g;
    let m;
    while ((m = re.exec(line))) {
      const code = normalizeCode(`${m[1]} ${m[2]}`);
      if (code) codes.add(code);
    }
  }
  return [...codes].map((code) => ({ code, qty: 1 }));
}

// Every valid sticker code in the whole checklist — used to invert a "missing"
// list back into what someone actually has.
function allSlotCodes() {
  const all = [];
  for (const t of TEAMS) for (const n of slotNumbersFor(t.code)) all.push(`${t.code} ${n}`);
  return all;
}

// Turn pasted text into sticker rows. Accepts a JSON export, a "1 of each"
// have-list, or a "missing" list (auto-inverted to what they have). Returns
// null (with a toast) if nothing usable is found.
function rowsFromText(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) { toast("Paste a list first"); return null; }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let data;
    try { data = JSON.parse(trimmed); } catch { toast("That doesn't look like a list"); return null; }
    const incoming = Array.isArray(data) ? data : data.stickers;
    if (Array.isArray(incoming)) return incoming;
    toast("No stickers found"); return null;
  }
  const mentioned = parsePlainText(trimmed);
  if (!mentioned.length) { toast("No sticker codes found in that text"); return null; }
  // A pasted "missing" list names what they DON'T have — flip it to the haves.
  const header = trimmed.split(/\r?\n/).find((l) => l.trim()) || "";
  if (/missing|need/i.test(header)) {
    const seen = new Set(mentioned.map((r) => r.code));
    return allSlotCodes().filter((c) => !seen.has(c)).map((code) => ({ code, qty: 1 }));
  }
  return mentioned;
}

// Merge raw sticker rows into the ACTIVE profile. Returns how many landed.
async function applyStickers(rows) {
  let n = 0;
  for (const raw of rows) {
    const code = normalizeCode(raw.code);
    if (!code) continue;
    const existing = await DB.get(code);
    if (existing) {
      existing.qty = Math.max(existing.qty || 1, raw.qty || 1);
      existing.name ||= raw.name || "";
      existing.updatedAt = Date.now();
      await DB.put(existing);
    } else {
      await DB.put({
        code, team: teamOf(code), number: numOf(code),
        qty: raw.qty || 1, name: raw.name || "",
        addedAt: raw.addedAt || Date.now(), updatedAt: Date.now(),
      });
    }
    n++;
  }
  return n;
}

// Merge a pasted list into the profile you're currently viewing.
async function importPasteMerge() {
  const rows = rowsFromText($("#paste-list").value);
  if (!rows) return;
  const n = await applyStickers(rows);
  $("#paste-list").value = "";
  await renderStats(); rerenderLists();
  toast(`Added ${n} to "${profileName(activeProfile)}"`);
}

// Load a pasted list as a brand-new profile, then jump to Quick add so you can
// start checking codes against it right away.
async function importPasteAsProfile() {
  const rows = rowsFromText($("#paste-list").value);
  if (!rows) return;
  const name = (prompt("Name this profile (e.g. a friend's name):", "Friend") || "").trim();
  if (!name) return;
  const id = "p" + Date.now().toString(36);
  await DB.putProfile({ id, name, createdAt: Date.now() });
  profiles = await DB.getProfiles();
  const prev = DB.profile;
  DB.profile = id;
  const n = await applyStickers(rows);
  DB.profile = prev;
  $("#paste-list").value = "";
  await switchProfile(id);
  switchView("quickadd");
  toast(`Loaded ${n} into "${name}" — type a code to check it`);
}

/* ============================================================
   Profiles — your own album plus friends' lists you've pasted in.
   `DB.profile` points at whichever one is active; every view reads
   through it, so checking a friend's list uses the exact same UI.
   ============================================================ */
let profiles = [];                 // [{ id, name, createdAt }]
let activeProfile = HOME_PROFILE;

function profileName(id) { return profiles.find((p) => p.id === id)?.name || id; }
function isHome() { return activeProfile === HOME_PROFILE; }

async function loadProfiles() {
  profiles = await DB.getProfiles();
  if (!profiles.length) {
    await DB.putProfile({ id: HOME_PROFILE, name: "My collection", createdAt: Date.now() });
    profiles = await DB.getProfiles();
  }
  const saved = localStorage.getItem("activeProfile");
  activeProfile = profiles.some((p) => p.id === saved) ? saved : HOME_PROFILE;
  DB.profile = activeProfile;
}

function renderProfileUI() {
  // home profile first, then the rest alphabetically
  profiles.sort((a, b) => (a.id === HOME_PROFILE ? -1 : b.id === HOME_PROFILE ? 1 : a.name.localeCompare(b.name)));
  const sel = $("#profile-select");
  if (sel) {
    sel.innerHTML = "";
    profiles.forEach((p) => {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.id === HOME_PROFILE ? p.name : `👤 ${p.name}`;
      o.selected = p.id === activeProfile;
      sel.appendChild(o);
    });
  }
  const del = $("#profile-delete");
  if (del) del.disabled = isHome();
  const viewing = $("#profile-viewing");
  if (viewing) viewing.textContent = profileName(activeProfile);
  const chip = $("#active-profile");
  if (chip) { chip.textContent = profileName(activeProfile); chip.classList.toggle("guest", !isHome()); }
}

async function switchProfile(id) {
  if (!profiles.some((p) => p.id === id)) return;
  activeProfile = id;
  DB.profile = id;
  localStorage.setItem("activeProfile", id);
  recentCodes.length = 0; // "just added" is per session and per profile
  renderProfileUI();
  await renderStats();
  refreshActiveView();
}

// Re-render whatever view is on screen after switching profiles.
function refreshActiveView() {
  if ($("#view-quickadd").classList.contains("active")) { refreshQaBanner(); renderRecent(); }
  if ($("#view-collection").classList.contains("active")) renderCollection();
  if ($("#view-album").classList.contains("active")) {
    if ($("#slots-panel").hidden) renderAlbum(); else renderSlots();
  }
}

async function renameProfile() {
  const p = profiles.find((x) => x.id === activeProfile);
  if (!p) return;
  const name = (prompt("Profile name:", p.name) || "").trim();
  if (!name) return;
  p.name = name;
  await DB.putProfile(p);
  profiles = await DB.getProfiles();
  renderProfileUI();
  toast("Renamed");
}

async function deleteProfile() {
  if (isHome()) { toast("You can't delete your own collection"); return; }
  const p = profiles.find((x) => x.id === activeProfile);
  if (!p) return;
  if (!confirm(`Delete "${p.name}" and its list? Your own collection is untouched.`)) return;
  await DB.delProfile(activeProfile);
  profiles = await DB.getProfiles();
  await switchProfile(HOME_PROFILE);
  toast(`Deleted "${p.name}"`);
}

/* ============================================================
   Navigation
   ============================================================ */
const VIEW_TITLES = { quickadd: "Quick add", album: "Album", collection: "Swaps & doubles", backup: "Share & backup" };

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
  await loadProfiles();
  renderProfileUI();
  await renderStats();

  // Menu navigation
  $("#menu-btn").addEventListener("click", openMenu);
  $("#menu").addEventListener("click", (e) => { if (e.target.id === "menu") closeMenu(); });
  $$(".menu-item").forEach((m) => m.addEventListener("click", () => switchView(m.dataset.view)));

  // Profiles
  $("#profile-select").addEventListener("change", (e) => switchProfile(e.target.value));
  $("#profile-rename").addEventListener("click", renameProfile);
  $("#profile-delete").addEventListener("click", deleteProfile);

  // Quick check & add
  $("#qa-code").addEventListener("input", refreshQaBanner);
  $("#qa-code").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !$("#qa-add").disabled) commitQuickAdd();
  });
  $("#qa-add").addEventListener("click", commitQuickAdd);
  $("#qa-clear").addEventListener("click", () => {
    $("#qa-code").value = "";
    refreshQaBanner();
    $("#qa-code").focus();
  });

  // Editor overlay (existing sticker: note)
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

  // Share lists (copy / share sheet — no files)
  $("#btn-share-missing").addEventListener("click", () => shareList("missing"));
  $("#btn-share-have").addEventListener("click", () => shareList("have"));
  $("#btn-share-spares").addEventListener("click", () => shareList("spares"));

  // Paste a friend's list
  $("#btn-paste-new").addEventListener("click", importPasteAsProfile);
  $("#btn-paste-merge").addEventListener("click", importPasteMerge);

  // Backup (copy/paste, no files)
  $("#btn-copy-backup").addEventListener("click", copyBackup);
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
