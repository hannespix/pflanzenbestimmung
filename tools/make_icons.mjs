#!/usr/bin/env node
/*
 * make_icons.mjs – erzeugt die PWA-Icons (einmalig, Ergebnis wird committet).
 * Rendert ein Blatt-Motiv (Herbarium-Look, wie das Favicon) über Chromium zu PNG.
 *
 *   node tools/make_icons.mjs
 *
 * Ausgabe: icons/icon-192.png, icons/icon-512.png, icons/icon-maskable.png,
 *          icons/apple-touch-icon.png
 * Findet Chromium über PUPPETEER_EXECUTABLE_PATH bzw. ein Playwright-Chromium.
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "icons");

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

// Blatt-Motiv (deep green Grund, sage Blatt mit Mittelrippe + Seitenadern).
// scale < 1 rückt das Motiv in die maskable-Sicherheitszone (zentriert).
function svg(scale) {
  const g = `
    <g transform="translate(256,256) scale(${scale}) translate(-256,-256)">
      <path d="M144 368 C144 192 256 112 368 144 C368 320 256 400 144 368 Z" fill="#a8c9ac"/>
      <g fill="none" stroke="#2b4f38" stroke-linecap="round">
        <path d="M176 336 C240 256 304 192 352 160" stroke-width="13"/>
        <path d="M226 274 L262 306" stroke-width="8"/>
        <path d="M226 274 L196 244" stroke-width="8"/>
        <path d="M282 222 L316 252" stroke-width="8"/>
        <path d="M282 222 L252 194" stroke-width="8"/>
        <path d="M326 186 L352 210" stroke-width="8"/>
        <path d="M326 186 L302 164" stroke-width="8"/>
      </g>
    </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <rect width="512" height="512" fill="#2b4f38"/>${g}</svg>`;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const puppeteer = loadPuppeteer();
  const exe = findChromium();
  const launch = { headless: "new", args: ["--no-sandbox", "--force-device-scale-factor=1"] };
  if (exe) launch.executablePath = exe;
  const browser = await puppeteer.launch(launch);
  const page = await browser.newPage();

  // { Dateiname: [Kantenlänge, Motiv-Skalierung] }
  const jobs = {
    "icon-192.png": [192, 0.98],
    "icon-512.png": [512, 0.98],
    "apple-touch-icon.png": [180, 0.98],
    "icon-maskable.png": [512, 0.72],   // Motiv in der 80%-Sicherheitszone
  };
  for (const [name, [size, scale]] of Object.entries(jobs)) {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    const markup = svg(scale).replace('width="512" height="512"', `width="${size}" height="${size}"`);
    await page.setContent(
      `<!doctype html><meta charset="utf-8"><style>*{margin:0;padding:0}</style>${markup}`,
      { waitUntil: "load" });
    const el = await page.$("svg");
    await el.screenshot({ path: path.join(OUT, name), omitBackground: false });
    console.log("OK  icons/" + name + "  (" + size + "px)");
  }
  await browser.close();
}
main().catch((e) => { console.error("Icon-Erzeugung fehlgeschlagen:\n  " + e.message); process.exit(1); });
