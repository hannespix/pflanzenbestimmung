#!/usr/bin/env node
/*
 * pwa.mjs – prüft die PWA-Installierbarkeit und den Offline-Cache.
 * Serviert dist/ über einen lokalen HTTP-Server (http://127.0.0.1 = secure context,
 * damit sich der Service Worker registrieren darf) und prüft:
 *   - Manifest ist verlinkt, valide und enthält die Pflichtfelder + 192/512-Icons.
 *   - Der Service Worker registriert sich, wird aktiv und übernimmt die Seite.
 *   - Alle vier Seiten liegen im Cache.
 *   - Nach Offline-Schalten lädt die Seite weiterhin (aus dem Cache) und bootet.
 */
import fs from "fs";
import http from "http";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIST = path.join(ROOT, "dist");
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); };

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".json": "application/json",
};

function loadPuppeteer() {
  try { return require("puppeteer"); } catch {}
  try { return require("puppeteer-core"); } catch {}
  throw new Error("Weder puppeteer noch puppeteer-core installiert.");
}
function findChromium() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const roots = ["/opt/pw-browsers"];
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    const stack = [r];
    while (stack.length) {
      const d = stack.pop();
      let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
      for (const e of ents) { const p = path.join(d, e.name);
        if (e.isDirectory()) stack.push(p); else if (e.name === "chrome" || e.name === "headless_shell") return p; }
    }
  }
  return null;
}

function startServer() {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split("?")[0]);
    if (rel === "/" || rel === "") rel = "/index.html";
    const file = path.join(DIST, path.normalize(rel));
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end("not found"); return;
    }
    const type = MIME[path.extname(file)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function main() {
  for (const f of ["index.html", "pflanzen-lernen.html", "manifest.webmanifest", "sw.js", "icon-192.png", "icon-512.png"])
    if (!fs.existsSync(path.join(DIST, f))) throw new Error("dist/" + f + " fehlt – zuerst 'python3 build.py'.");

  // Manifest statisch prüfen (Pflichtfelder für Installierbarkeit)
  const man = JSON.parse(fs.readFileSync(path.join(DIST, "manifest.webmanifest"), "utf-8"));
  assert(man.name && man.start_url && ["standalone", "fullscreen", "minimal-ui"].includes(man.display),
    "Manifest: name/start_url/display unvollständig");
  const sizes = (man.icons || []).map((i) => i.sizes);
  assert(sizes.includes("192x192") && sizes.includes("512x512"), "Manifest: 192px- und 512px-Icon nötig, war " + JSON.stringify(sizes));
  assert((man.icons || []).some((i) => (i.purpose || "").includes("maskable")), "Manifest: maskable-Icon fehlt");

  const server = await startServer();
  const base = "http://127.0.0.1:" + server.address().port;
  const puppeteer = loadPuppeteer();
  const exe = findChromium();
  const launch = { headless: "new", args: ["--no-sandbox", "--disable-gpu"] };
  if (exe) launch.executablePath = exe;
  const browser = await puppeteer.launch(launch);
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  try {
    // Erstaufruf (online): Seite lädt, SW registriert sich und übernimmt
    await page.goto(base + "/pflanzen-lernen.html", { waitUntil: "load" });

    const linked = await page.evaluate(() => {
      const l = document.querySelector('link[rel="manifest"]');
      const at = document.querySelector('link[rel="apple-touch-icon"]');
      return { manifest: l ? l.getAttribute("href") : null, apple: !!at, sw: "serviceWorker" in navigator };
    });
    assert(linked.manifest === "manifest.webmanifest", "Seite verlinkt das Manifest nicht");
    assert(linked.apple, "Seite hat kein apple-touch-icon");
    assert(linked.sw, "Service Worker wird nicht unterstützt (Umgebung?)");

    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller != null, { timeout: 10000 });

    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      const k = keys.find((x) => x.startsWith("pflanzenkenntnis-"));
      if (!k) return { ok: false, keys };
      const c = await caches.open(k);
      const reqs = (await c.keys()).map((r) => new URL(r.url).pathname.replace(/^\//, ""));
      return { ok: true, name: k, reqs };
    });
    assert(cached.ok, "Kein PWA-Cache angelegt: " + JSON.stringify(cached.keys));
    for (const need of ["index.html", "pflanzenkenntnis.html", "pflanzen-lernen.html", "rechtliches.html", "manifest.webmanifest"])
      assert(cached.reqs.includes(need), "Cache enthält " + need + " nicht: " + JSON.stringify(cached.reqs));

    // Jetzt OFFLINE: Seite muss weiterhin laden (aus dem Cache) und booten
    await page.setOfflineMode(true);
    const resp = await page.reload({ waitUntil: "load" });
    assert(resp && resp.status() === 200, "Offline-Reload lieferte keinen 200 (Cache griff nicht)");
    await page.waitForFunction("window.startSession!=null", { timeout: 10000 });
    const bootedOffline = await page.evaluate(() => typeof window.startSession === "function" && allCards.length > 0);
    assert(bootedOffline, "Lern-Tool bootet offline nicht aus dem Cache");

    // Auch eine zweite Seite offline erreichbar (Navigation innerhalb der App)
    const other = await page.goto(base + "/pflanzenkenntnis.html", { waitUntil: "load" });
    assert(other && other.status() === 200, "Prüfungswerkzeug ist offline nicht aus dem Cache erreichbar");

    assert(errs.length === 0, "Konsolenfehler: " + errs.join(" | "));
  } finally {
    await browser.close();
    server.close();
  }
  console.log("PWA-Test OK – Manifest valide (192/512/maskable), Service Worker aktiv, vier Seiten im Cache, Offline-Reload + Boot aus dem Cache, zweite Seite offline erreichbar.");
}

main().catch((e) => { console.error("PWA-Test FEHLGESCHLAGEN:\n  " + e.message); process.exit(1); });
