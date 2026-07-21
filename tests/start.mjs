#!/usr/bin/env node
/*
 * start.mjs – Smoke-Test für die gemeinsame Startseite (dist/index.html).
 * Prüft: Boot ohne Konsolenfehler · zwei Auswahlkarten mit korrekten Zielen ·
 * beide Zieldateien existieren · Verzweigung »Prüfen« lädt das Prüfungswerkzeug ·
 * Verzweigung »Lernen« lädt das Lern-Tool (jeweils per Klick, echte Navigation).
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIST = path.join(ROOT, "dist");
const FILE = "file://" + path.join(DIST, "index.html");

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
      let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
      for (const e of ents) { const p = path.join(d, e.name);
        if (e.isDirectory()) stack.push(p); else if (e.name === "chrome" || e.name === "headless_shell") return p; }
    }
  }
  return null;
}
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); };

async function main() {
  for (const f of ["index.html", "pflanzenkenntnis.html", "pflanzen-lernen.html"])
    if (!fs.existsSync(path.join(DIST, f)))
      throw new Error("dist/" + f + " fehlt – zuerst 'python3 build.py'.");

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
  assert(errs.length === 0, "Konsolenfehler beim Boot: " + errs.join(" | "));

  // Zwei Auswahlkarten mit den erwarteten Zielen
  const links = await page.evaluate(() =>
    [...document.querySelectorAll("a.choice")].map((a) => ({
      href: (a.getAttribute("href") || ""),
      cls: a.className,
      label: (a.querySelector("h2") || {}).textContent || "",
    })));
  assert(links.length === 2, "Es müssen genau zwei Auswahlkarten sein, waren " + links.length);
  const learn = links.find((l) => l.cls.includes("learn"));
  const exam = links.find((l) => l.cls.includes("exam"));
  assert(learn && learn.href === "pflanzen-lernen.html", "Lernen-Karte zeigt nicht auf pflanzen-lernen.html");
  assert(exam && exam.href === "pflanzenkenntnis.html", "Prüfen-Karte zeigt nicht auf pflanzenkenntnis.html");
  assert(/Lernen/.test(learn.label) && /Prüfen/.test(exam.label), "Kartentitel Lernen/Prüfen fehlen");

  // Verzweigung »Prüfen« lädt das Prüfungswerkzeug (echte Navigation per Klick)
  await Promise.all([
    page.waitForNavigation({ waitUntil: "load" }),
    page.click("a.choice.exam"),
  ]);
  await page.waitForFunction("window.pickExcel!=null", { timeout: 10000 });

  // Zurück zur Startseite, Verzweigung »Lernen« lädt das Lern-Tool
  await page.goto(FILE, { waitUntil: "load" });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "load" }),
    page.click("a.choice.learn"),
  ]);
  await page.waitForFunction("window.startSession!=null", { timeout: 10000 });

  assert(errs.length === 0, "Konsolenfehler im Testverlauf: " + errs.join(" | "));
  await browser.close();
  console.log("Start-Smoke OK – Boot, zwei Auswahlkarten, Verzweigung »Prüfen« → Prüfungswerkzeug, »Lernen« → Lern-Tool.");
}

main().catch((e) => { console.error("Start-Smoke FEHLGESCHLAGEN:\n  " + e.message); process.exit(1); });
