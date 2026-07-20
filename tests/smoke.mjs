#!/usr/bin/env node
/*
 * smoke.mjs – Funktions-Smoke-Test gegen die gebaute Offline-Datei (file://).
 *
 * Prüft: Boot ohne Konsolenfehler · korrekte Zeilenzahl (Seed) · Profilwechsel
 * inkl. richtiger Artenzahl · localStorage-Persistenz über einen Reload ·
 * Ziehen und Aufbau des Druckbogens (Prüfungsbogen + Musterlösung).
 *
 * Nutzt puppeteer (falls installiert) oder puppeteer-core mit einem Chromium
 * aus PUPPETEER_EXECUTABLE_PATH bzw. dem vorinstallierten Playwright-Chromium.
 *
 * Aufruf:  node tests/smoke.mjs   (vorher: python3 build.py)
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FILE = "file://" + path.join(ROOT, "dist", "pflanzenkenntnis.html");

function loadPuppeteer() {
  try { return require("puppeteer"); } catch { }
  try { return require("puppeteer-core"); } catch { }
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
      let ents = [];
      try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
      for (const e of ents) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (e.name === "chrome" || e.name === "headless_shell") return p;
      }
    }
  }
  return null; // puppeteer (nicht -core) bringt eigenes Chromium mit
}

const assert = (cond, msg) => { if (!cond) throw new Error("ASSERT: " + msg); };

async function main() {
  if (!fs.existsSync(path.join(ROOT, "dist", "pflanzenkenntnis.html")))
    throw new Error("dist/pflanzenkenntnis.html fehlt – zuerst 'python3 build.py'.");

  const puppeteer = loadPuppeteer();
  const exe = findChromium();
  const launch = { headless: "new", args: ["--no-sandbox", "--disable-gpu"] };
  if (exe) launch.executablePath = exe;

  const browser = await puppeteer.launch(launch);
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text()); });

  await page.goto(FILE, { waitUntil: "load" });
  await page.waitForFunction("window.pickExcel!=null", { timeout: 10000 });

  // 1) Boot ohne Konsolenfehler
  assert(errs.length === 0, "Konsolenfehler beim Boot: " + errs.join(" | "));

  // 2) Standardprofil gemuesebau_gaertner: 148 Arten in der Liste sichtbar
  await page.select("#frSelect", "gemuesebau");
  await page.select("#nivSelect", "gaertner");
  await page.$eval("#frSelect", (e) => e.dispatchEvent(new Event("change")));
  await page.waitForFunction("document.querySelectorAll('#list .row').length===148", { timeout: 10000 })
    .catch(() => { throw new Error("Gemüsebau/Gärtner: erwartete 148 Zeilen nicht erreicht"); });

  // 3) Profilwechsel: Baumschule/Gärtner → 248 Arten
  await page.select("#frSelect", "baumschule");
  await page.$eval("#frSelect", (e) => e.dispatchEvent(new Event("change")));
  await page.waitForFunction("document.querySelectorAll('#list .row').length===248", { timeout: 10000 })
    .catch(() => { throw new Error("Baumschule/Gärtner: erwartete 248 Zeilen nicht erreicht"); });

  // 4) Ziehen: Zufallsauswahl in Profil-Anzahl (20) und Punktepille aktualisiert
  const drawn = await page.evaluate(() => { drawRandom(); return selection.length; });
  assert(drawn === 20, "drawRandom sollte 20 Arten ziehen, war " + drawn);

  // 5) Druckbogen (Musterlösung) bauen: Kopf + korrekte Zeilenzahl
  const sheet = await page.evaluate(() => {
    buildSheet("solution");
    return {
      rows: document.querySelectorAll("#sheet table.exam tbody tr").length,
      hasSolutionNote: /Nur für Prüfende/.test(document.querySelector("#sheet").innerHTML),
      title: (document.querySelector("#sheet h1") || {}).textContent || ""
    };
  });
  assert(sheet.rows === 20, "Druckbogen sollte 20 Zeilen haben, war " + sheet.rows);
  assert(sheet.hasSolutionNote, "Musterlösung sollte 'Nur für Prüfende' zeigen");
  assert(/Musterlösung/.test(sheet.title), "Musterlösungs-Titel fehlt: " + sheet.title);

  // 6) Prüfungsbogen (leer) baut ohne Fehler und ohne 'Nur für Prüfende'
  const blank = await page.evaluate(() => {
    buildSheet("blank");
    return { rows: document.querySelectorAll("#sheet table.exam tbody tr").length,
             note: /Nur für Prüfende/.test(document.querySelector("#sheet").innerHTML) };
  });
  assert(blank.rows === 20, "Prüfungsbogen sollte 20 Zeilen haben, war " + blank.rows);
  assert(!blank.note, "Leerer Prüfungsbogen darf 'Nur für Prüfende' nicht zeigen");

  // 7) localStorage-Persistenz über Reload: eine Art hinzufügen, neu laden, prüfen
  await page.evaluate(() => {
    cache.push({ id: nextId++, gattung: "Smoketestia", art: "verificata", familie: "Testaceae",
      deutscher_name: "Prüfkraut", kategorie: "", zp: 0, synonyme: "", bemerkungen: "" });
    markDirty();
  });
  await page.waitForFunction(
    "localStorage.getItem('pflanzenkenntnis.data.baumschule_gaertner')!=null", { timeout: 5000 });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.pickExcel!=null", { timeout: 10000 });
  const persisted = await page.evaluate(() =>
    cache.some((p) => p.gattung === "Smoketestia" && p.art === "verificata"));
  assert(persisted, "Hinzugefügte Art überlebte den Reload nicht (localStorage)");

  // 8) Zurücksetzen räumt den Browser-Speicher wieder auf (kein Test-Rest)
  await page.evaluate(() => localStorage.removeItem("pflanzenkenntnis.data.baumschule_gaertner"));

  assert(errs.length === 0, "Konsolenfehler im Testverlauf: " + errs.join(" | "));
  await browser.close();
  console.log("Smoke-Test OK – Boot, Profilwechsel (148/248), Ziehen, Bogen (Leer/Lösung), Persistenz.");
}

main().catch((e) => { console.error("Smoke-Test FEHLGESCHLAGEN:\n  " + e.message); process.exit(1); });
