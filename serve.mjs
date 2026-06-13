// Tiny zero-dependency static server for the Sticker Tracker.
// Serves the current folder over HTTPS (so the phone camera works on your LAN)
// and HTTP (upload-only fallback). Run:  node serve.mjs
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HTTPS_PORT = 8443;
const HTTP_PORT = 8080;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webp": "image/webp",
};

// Never serve these (keys, certs, server source, configs).
const BLOCKED = new Set(["key.pem", "cert.pem", "serve.mjs", "_san.cnf"]);

function handler(req, res) {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (urlPath === "/") urlPath = "/index.html";
    const rel = path.normalize(urlPath).replace(/^([/\\])+/, "");
    const filePath = path.join(ROOT, rel);

    // prevent path traversal and block sensitive files
    if (!filePath.startsWith(ROOT) || BLOCKED.has(path.basename(filePath))) {
      res.writeHead(403); res.end("Forbidden"); return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end("Not found"); return; }
      res.writeHead(200, { "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
      res.end(data);
    });
  } catch {
    res.writeHead(400); res.end("Bad request");
  }
}

function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === "IPv4" && !i.internal) out.push(i.address);
    }
  }
  return out;
}

// HTTPS (camera-capable)
let creds = null;
try {
  creds = { key: fs.readFileSync(path.join(ROOT, "key.pem")), cert: fs.readFileSync(path.join(ROOT, "cert.pem")) };
} catch {
  console.log("⚠  cert.pem/key.pem not found — starting HTTP only (no phone camera).");
}

const ips = lanIPs();
if (creds) {
  https.createServer(creds, handler).listen(HTTPS_PORT, "0.0.0.0", () => {
    console.log("\n📷  HTTPS (camera works) — open on your phone:");
    ips.forEach((ip) => console.log(`      https://${ip}:${HTTPS_PORT}`));
    console.log(`      https://localhost:${HTTPS_PORT}  (this computer)`);
    console.log("    First visit shows a “not private” warning (self-signed cert) —");
    console.log("    tap Advanced → Proceed. Safe: it's your own machine.\n");
  });
}

http.createServer(handler).listen(HTTP_PORT, "0.0.0.0", () => {
  console.log("🌐  HTTP (upload only, no camera):");
  ips.forEach((ip) => console.log(`      http://${ip}:${HTTP_PORT}`));
  console.log("\nPress Ctrl+C to stop.\n");
});
