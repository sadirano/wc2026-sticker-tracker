# Sticker Tracker — Panini FIFA World Cup 2026

A fully client-side web app to track which stickers you own, scan codes off the
back with your phone camera, and instantly spot duplicates (swaps). No backend,
no account — everything is stored in your browser.

## What it does

- **Scan** a sticker back with the camera (or upload a photo). It reads the code
  in the dark pill — e.g. `USA 11`, `GHA 2`, `FWC 19` — using in-browser OCR and
  offers its best guesses as tappable chips. You confirm or fix it, then save.
- Tells you **✅ NEW** or **⚠️ DUPLICATE** (a swap) the moment it reads the code.
- **Album** view: every country as a flag tile with a have/total progress bar.
  Tap one to see its numbered slots (1–N); green = owned, dim = missing. Tap a
  slot to toggle it — the fast way to fill in stickers you already have. Doubles
  show a small `×n` badge.
- **Swaps** view: a flat, searchable list focused on your doubles (with +/–
  counters) — what you can trade away.
- **Backup**: export/import your whole collection as a JSON file (or CSV).

### Built-in checklist & accuracy
The full World Cup 2026 code list is baked in (48 countries + `FWC` FIFA World
Cup and `CC` Coca-Cola specials), so there's nothing to configure. This also
makes scanning accurate:

- Numbers above each team's slot count are discarded (20 per country, **14 for
  Coca-Cola**), and
- A scanned prefix is matched to the known list, auto-correcting a single
  misread letter (e.g. OCR reads `FWG` → corrected to `FWC`).

Noise like the print code `005460`, `FIFA WORLD CUP 2026`, and `PANINI` is
ignored automatically.

## Running it

### Live (GitHub Pages)
Hosted at **https://sadirano.github.io/wc2026-sticker-tracker/** — open it on your
phone and **Add to Home Screen**. The first scan downloads the recognizer
(~a few MB), after which it works offline.

### On your phone over the local network — `serve.mjs`
The camera only works over **https** (or `localhost`), so this folder ships with
a tiny HTTPS server and a self-signed certificate.

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
   a “connection not private” warning — that's expected for a self-signed cert on
   your own machine: tap **Advanced → Proceed**. Then **Add to Home Screen**.

4. First scan downloads the recognizer (~a few MB); after that it works offline.

Ports: `8443` = HTTPS (camera works), `8080` = HTTP (upload only). The HTTPS cert
(`key.pem` / `cert.pem`) is generated locally and git-ignored — `serve.mjs` falls
back to HTTP-only if it's missing. To regenerate for your own IPs:
```
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem \
  -days 825 -subj "/CN=Sticker Tracker LAN" \
  -addext "subjectAltName=IP:<your-lan-ip>,IP:127.0.0.1,DNS:localhost"
```

### On a computer (upload photos)
Just open `index.html`, or serve the folder:
```
npx serve .      # or: python -m http.server
```
Then use **Upload photo** (the camera button needs https). If a read is wrong,
tap **“Crop the code yourself”** to draw a box around just the code and rotate it
upright (the code is printed sideways on the sticker).

## Notes / limitations

- OCR is good but not perfect on small/blurry text — always glance at the code
  before saving, and edit it if needed. Manual entry is available everywhere.
- Data lives in this browser's IndexedDB. Clearing site data wipes it, so
  **export a backup** before switching devices or clearing your browser.
- The full checklist is built in, so the **Album** shows exactly what you own vs.
  what's missing per country.

## Files
| File | Purpose |
|------|---------|
| `index.html` | Markup |
| `styles.css` | Styles (mobile-first) |
| `app.js` | All logic: OCR, IndexedDB, UI |
| `sw.js` | Offline cache (PWA) |
| `manifest.webmanifest` | Install metadata |
