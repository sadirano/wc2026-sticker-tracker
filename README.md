# Sticker Tracker — Panini FIFA World Cup 2026

A fully client-side web app to track which stickers you own, quickly check any
card for **new vs. double**, and attach a photo and note to each one. No backend,
no account — everything is stored in your browser.

## What it does

- **Quick check & add** — the fast loop for going through a stack of cards. Type
  a code (e.g. `USA 11`, `GHA 2`, `FWC 19`) and it instantly tells you **✅ NEW**
  or **⚠️ DOUBLE** (a swap). Tap **Add to collection** or **It's a double (+1)** —
  and you **stay on the same screen**, ready for the next card. No bouncing
  between views.
- **Photos & notes** — attach a photo to any sticker (take one with your phone or
  pick from the library) and add a name/note. A built-in cropper lets you **keep
  only the important part** of the photo. You can add or edit a photo/note later
  from the Swaps list too — just tap a sticker.
- **Album** view: every country as a flag tile with a have/total progress bar.
  Tap one to see its numbered slots (1–N); green = owned, dim = missing. Tap a
  slot to toggle it — the fast way to fill in stickers you already have. Doubles
  show a small `×n` badge.
- **Swaps** view: a flat, searchable list focused on your doubles (with +/–
  counters) — what you can trade away.
- **Backup**: export/import your whole collection (including photos) as a JSON
  file, or export a CSV.

### Built-in checklist
The full World Cup 2026 code list is baked in (48 countries + `FWC` FIFA World
Cup and `CC` Coca-Cola specials), so the **Album** shows exactly what you own vs.
what's missing per country. Numbers are validated against each team's slot count
(20 per country, **14 for Coca-Cola**, and the unique `FWC 00` stamp).

## Running it

### Live (GitHub Pages)
Hosted at **https://sadirano.github.io/wc2026-sticker-tracker/** — open it on your
phone and **Add to Home Screen** for a full-screen, offline experience.

### On a computer or your phone over the local network — `serve.mjs`
This folder ships with a tiny HTTPS server (and a self-signed certificate, so the
camera/photo picker behaves well on mobile).

1. **Start it** (from this folder):
   ```
   node serve.mjs
   ```
   It prints URLs like `https://192.168.0.240:8443`.

2. **Open the firewall once** (so other devices can reach it). In an
   **Administrator** PowerShell (Win+X → *Terminal (Admin)*):
   ```powershell
   New-NetFirewallRule -DisplayName "Sticker Tracker LAN" -Direction Inbound `
     -Action Allow -Protocol TCP -LocalPort 8443,8080 -Profile Private
   ```

3. On your phone (same Wi-Fi), open the **https://<your-ip>:8443** URL. You'll see
   a "connection not private" warning — that's expected for a self-signed cert on
   your own machine: tap **Advanced → Proceed**. Then **Add to Home Screen**.

Ports: `8443` = HTTPS, `8080` = HTTP. The HTTPS cert (`key.pem` / `cert.pem`) is
generated locally and git-ignored — `serve.mjs` falls back to HTTP-only if it's
missing. To regenerate for your own IPs:
```
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem \
  -days 825 -subj "/CN=Sticker Tracker LAN" \
  -addext "subjectAltName=IP:<your-lan-ip>,IP:127.0.0.1,DNS:localhost"
```

### On a computer (just open it)
Open `index.html` directly, or serve the folder:
```
npx serve .      # or: python -m http.server
```

## Notes / limitations

- Data lives in this browser's IndexedDB. Clearing site data wipes it, so
  **export a backup** before switching devices or clearing your browser. Photos
  are included in the JSON backup.
- The full checklist is built in, so the **Album** shows exactly what you own vs.
  what's missing per country.

## Files
| File | Purpose |
|------|---------|
| `index.html` | Markup |
| `styles.css` | Styles (mobile-first) |
| `app.js` | All logic: IndexedDB, quick add, photos/crop, Album, UI |
| `sw.js` | Offline cache (PWA) |
| `manifest.webmanifest` | Install metadata |
