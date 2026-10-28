#!/usr/bin/env node
/* Bildcheck – findet das Bilder-Quiz für JEDE Art ein Bild?

   Führt die ECHTE Bildsuche des Lern-Tools (wikiPhoto aus dist/pflanzen-lernen.html –
   dieselbe Suchkette, dieselben Filter, dieselbe Profil-Logik wie im Browser) für alle
   Arten aller Profile gegen die Live-APIs von Wikipedia und Wikimedia Commons aus und
   berichtet je Art: Foto · Zeichnung · Herbarbeleg · kein Bild · Netzfehler.
   Ein Nachbau in einer anderen Sprache könnte von der App abweichen – deshalb läuft hier
   der Code der App selbst; nur ihr JSONP-Abruf wird auf einen Node-Abruf umgelegt.

   Aufruf:   python3 build.py && node tools/bildcheck.mjs [Optionen]
     --profil a,b   nur diese Profil-IDs (Standard: alle; auch über BILDCHECK_PROFIL)
     --max n        je Profil nur die ersten n Arten (Schnelltest)
     --art muster   nur Arten, deren botanischer Name das Muster trifft (regulärer Ausdruck, z. B. "Perovskia|vitis-idaea")
     --out dir      Ausgabeordner (Standard: bildcheck/)
     --rate n       Anfragen pro Minute (Standard 180; Wikimedia erlaubt Bots mit User-Agent 200)
     --tries n      Versuche je Anfrage bei 429/5xx/Netzfehler (Standard 6)
     --mock         ohne Netz mit festen Antworten (prüft nur die Mechanik)

   Höflich gegenüber Wikimedia (mediawiki.org/wiki/Wikimedia_APIs/Rate_limits):
   eigener User-Agent mit Kontakt, höchstens 3 Anfragen gleichzeitig, ≤ 180 pro Minute,
   429/503 mit Retry-After bzw. exponentiellem Rückzug; jede URL wird nur einmal geholt
   (dieselbe Art in mehreren Profilen kostet nichts extra).

   Ausgabe (im Ordner --out):
     bildcheck.json     alle Ergebnisse + Diagnose der Arten ohne Foto (welcher Suchweg, welche
                        Dateien, warum verworfen)
     bildcheck.md       Zusammenfassung: Zahlen je Profil, Listen ohne Bild / nur Zeichnung
     kontaktbogen.html  alle Quiz-Bilder als Vorschau zum Durchsehen (lädt die Bilder von Wikimedia)

   In dieser Entwicklungsumgebung antwortet Wikimedia mit HTTP 429 – der Lauf gehört auf einen
   GitHub-Runner: .github/workflows/bildcheck.yml (Actions → bildcheck → Run workflow). */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const HTML = path.join(ROOT, "dist", "pflanzen-lernen.html");

/* ---------- Optionen ---------- */
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf("--" + name); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def; };
const flag = name => argv.includes("--" + name);
const OUT = path.resolve(opt("out", "bildcheck"));
const PROFIL = String(opt("profil", process.env.BILDCHECK_PROFIL || "")).split(/[\s,;]+/).filter(Boolean);
const MAX = parseInt(opt("max", "0"), 10) || 0;
const ART = opt("art", process.env.BILDCHECK_ART || "");
const RATE = Math.min(195, parseInt(opt("rate", "180"), 10) || 180);
const CONC = 3;
const TRIES = parseInt(opt("tries", "6"), 10) || 6;
const MOCK = flag("mock");
const UA = "PflanzeBW-Bildcheck/1.0 (https://pflanze-bw.de/rechtliches.html) Node.js/" + process.versions.node;
const HEADERS = { "User-Agent": UA, "Api-User-Agent": UA, "Accept": "application/json" };

function loadPuppeteer() {
  try { return require("puppeteer"); } catch { }
  try { return require("puppeteer-core"); } catch { }
  throw new Error("Weder puppeteer noch puppeteer-core installiert (npm install --no-save puppeteer@23).");
}
function findChromium() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const stack = ["/opt/pw-browsers"].filter(r => fs.existsSync(r));
  while (stack.length) {
    const d = stack.pop();
    let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) { const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p); else if (e.name === "chrome" || e.name === "headless_shell") return p; }
  }
  return null;
}

/* ---------- HTTP: Ratenbremse, Rückzug, Cache ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stat = { netz: 0, wiederholt: 0, http429: 0, http5xx: 0, apiBusy: 0, cacheTreffer: 0 };
// Überlast kommt bei der MediaWiki-API auch als HTTP 200 mit Fehler-JSON (Lauf 3: »cirrussearch-too-busy-error«
// bei Hamamelis mollis → Netzfehler im Bericht, 15 Treffer nur vorläufig). Diese Codes wie 429 behandeln.
const API_BUSY = /^(cirrussearch-too-busy-error|ratelimited|maxlag|readonly|internal_api_error_DBQueryTimeoutError)$/;
let nextSlot = 0, active = 0;
const waiters = [];
async function acquire() {
  while (active >= CONC) await new Promise(r => waiters.push(r));
  active++;
  const now = Date.now(), slot = Math.max(now, nextSlot);
  nextSlot = slot + 60000 / RATE;
  if (slot > now) await sleep(slot - now);
}
function release() { active--; const w = waiters.shift(); if (w) w(); }
function backoff(res, attempt) {
  const h = res && res.headers.get("retry-after");
  let ms = 0;
  if (h) { const s = Number(h); ms = Number.isFinite(s) ? s * 1000 : Math.max(0, Date.parse(h) - Date.now()); }
  return Math.min(180000, Math.max(ms, 5000 * 2 ** attempt));
}
// iNaturalist (Ersatzquelle des Bilder-Quiz) bittet um höchstens eine Anfrage je Sekunde
let inatNext = 0;
async function inatSlot() {
  const now = Date.now(), t = Math.max(now, inatNext);
  inatNext = t + 1100;
  if (t > now) await sleep(t - now);
}
async function fetchJson(url) {
  if (/^https:\/\/api\.inaturalist\.org\//.test(url)) { stat.inat = (stat.inat || 0) + 1; await inatSlot(); }
  let lastErr = "";
  for (let attempt = 0; attempt < TRIES; attempt++) {
    await acquire();
    let wait = 0;
    try {
      stat.netz++;
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
      if (res.status === 429 || res.status >= 500) {
        lastErr = "HTTP " + res.status;
        if (res.status === 429) stat.http429++; else stat.http5xx++;
        wait = backoff(res, attempt);
        nextSlot = Math.max(nextSlot, Date.now() + wait);     // alle anderen warten mit
        await res.arrayBuffer().catch(() => {});
      } else {
        const txt = await res.text();
        if (!res.ok) { lastErr = "HTTP " + res.status; attempt = TRIES; }   // übrige 4xx: nicht wiederholen
        else {
          let j = null;
          try { j = JSON.parse(txt); }
          catch { lastErr = "keine JSON-Antwort"; wait = backoff(null, attempt); }
          const code = j && j.error && j.error.code;
          if (code && API_BUSY.test(code)) {
            lastErr = "api:" + code; stat.apiBusy++;
            wait = backoff(null, attempt);
            nextSlot = Math.max(nextSlot, Date.now() + wait);
          } else if (j) return j;
        }
      }
    } catch (e) {
      lastErr = (e && e.message) || String(e);
      wait = Math.min(60000, 2000 * 2 ** attempt);
    } finally { release(); }
    if (wait && attempt < TRIES - 1) { stat.wiederholt++; await sleep(wait); }
  }
  throw new Error(lastErr || "Netzfehler");
}
function mockAnswer(url) {                                    // --mock: feste Antworten, nur Mechanik
  const u = decodeURIComponent(url);
  if (/api\.inaturalist\.org/.test(u)) return Promise.resolve({ total_results: 0, results: [] });   // Mock: iNaturalist ohne Treffer
  if (/commons\.wikimedia\.org/.test(u) && /titles=File:/.test(u))
    return Promise.resolve({ query: { pages: { "1": { title: "File:x.jpg", imageinfo: [{ mime: "image/jpeg",
      extmetadata: { Categories: { value: "Mock" }, Artist: { value: "Mock" }, LicenseShortName: { value: "CC0" } } }] } } } });
  if (/commons\.wikimedia\.org/.test(u) && /gsrsearch=/.test(u)) {
    const q = (u.match(/gsrsearch=([^&]+)/) || [])[1] || "";
    if (/^incategory:/.test(q)) {
      const name = q.replace(/incategory:|"/g, "");
      return Promise.resolve({ query: { pages: { "1": { index: 1, title: "File:" + name + " mock.jpg",
        imageinfo: [{ thumburl: "https://upload.wikimedia.org/mock/" + encodeURIComponent(name) + ".jpg", mime: "image/jpeg", width: 1000 }] } } } });
    }
    return Promise.resolve({ query: { pages: {} } });
  }
  return Promise.resolve({ query: { pages: { "-1": { title: "x", missing: "" } } } });
}
const cache = new Map();
function get(url) {
  url = String(url).replace(/[?&]callback=[^&]*/, "");
  if (cache.has(url)) { stat.cacheTreffer++; return cache.get(url); }
  const p = MOCK ? mockAnswer(url) : fetchJson(url);
  cache.set(url, p);
  p.catch(() => cache.delete(url));                           // Fehler nicht merken – ein späterer Weg darf neu fragen
  return p;
}

/* ---------- Lauf ---------- */
async function main() {
  if (!fs.existsSync(HTML)) throw new Error("dist/pflanzen-lernen.html fehlt – zuerst 'python3 build.py'.");
  fs.mkdirSync(OUT, { recursive: true });
  const stamp = (fs.readFileSync(HTML, "utf8").match(/Stand [0-9.]+ · Version [0-9a-f]{7}/) || [""])[0];
  const puppeteer = loadPuppeteer(), exe = findChromium();
  const browser = await puppeteer.launch(Object.assign({ headless: "new", args: ["--no-sandbox", "--disable-gpu"],
    protocolTimeout: 30 * 60000 }, exe ? { executablePath: exe } : {}));   // eine Art kann bei 429-Rückzug Minuten brauchen
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(e.message));
  await page.evaluateOnNewDocument(() => {
    window.__noVT = true;
    try { localStorage.setItem("pflanzenlernen.introSeen", "1"); localStorage.setItem("pflanzenlernen.profilechosen", "1"); } catch (e) {}
  });
  await page.exposeFunction("__bcGet", url => get(url));
  await page.goto("file://" + HTML, { waitUntil: "load" });
  await page.waitForFunction("window.startSession!=null && typeof wikiPhoto==='function'", { timeout: 60000 });
  await page.evaluate(() => { __setJsonp(url => window.__bcGet(url)); });

  const alle = await page.evaluate(() => Object.keys(SEEDS));
  const ids = PROFIL.length ? alle.filter(id => PROFIL.includes(id)) : alle;
  if (!ids.length) throw new Error("Kein passendes Profil: " + PROFIL.join(", "));
  const t0 = Date.now(), results = [];
  console.log(`Bildcheck ${stamp || "(ohne Versionsstempel)"} · ${ids.length} Profile · ${MOCK ? "MOCK" : RATE + " Anfragen/min"} · UA: ${UA}`);

  for (const id of ids) {
    let idx = await page.evaluate((id, art) => {
      loadProfile(id);
      const re = art ? new RegExp(art, "i") : null;
      return allCards.map((c, i) => i).filter(i => !re || re.test(allCards[i].g + " " + allCards[i].a));
    }, id, ART);
    if (MAX) idx = idx.slice(0, MAX);
    if (!idx.length) continue;
    const count = idx.length, res = new Array(count);
    let next = 0, fertig = 0;
    const worker = async () => {
      while (next < count) {
        const j = next++, i = idx[j];
        res[j] = await page.evaluate(async i => {
          const c = allCards[i];
          const base = { g: c.g, a: c.a, de: c.de, syn: c.syn, thema: c.thema, key: c.key, kind: cultivarKind(c.a), artOk: artLevelOk(c), sammel: sammelCard(c) };
          try {
            const p = await wikiPhoto(c);
            if (!p) return Object.assign(base, { status: "kein" });
            return Object.assign(base, { status: p.art || "foto", src: p.src, file: p.file || "", thumb: p.thumb || "",
              titel: p.title || "", tmp: !!p.tmp, ansichten: (p.gal || []).length || 1,
              w: (p.galInfo && p.galInfo[0] && p.galInfo[0].w) || 0, urheber: p.artist || "", lizenz: p.license || "", rueckfall: p.rf || "" });
          } catch (e) { return Object.assign(base, { status: "netz", fehler: String((e && e.message) || e) }); }
        }, i);
        res[j].profil = id; res[j].i = i;
        if (++fertig % 50 === 0) console.log(`  ${id}: ${fertig}/${count} · ${stat.netz} Anfragen · ${Math.round((Date.now() - t0) / 1000)} s`);
      }
    };
    await Promise.all(Array.from({ length: CONC }, worker));
    // Diagnose für alles ohne Foto: jeder Suchweg, jede Datei, warum verworfen (alles aus dem Cache – kein Netz)
    for (const r of res) {
      if (r.status === "foto") continue;
      r.diagnose = await page.evaluate(async i => {
        const c = allCards[i], out = [];
        for (const st of photoSteps(c)) {
          const rec = { k: st.k, q: st.q };
          try {
            if (st.k === "cm") {
              const d = await commonsQuery(st.q), pg = (d && d.query && d.query.pages) || {};
              rec.dateien = Object.values(pg).sort((a, b) => (a.index || 0) - (b.index || 0)).map(p => {
                const f = String(p.title || "").replace(/^(File|Datei):/i, "");
                const ii = (p.imageinfo || [])[0] || {}, meta = ii.extmetadata || null, warum = [];
                if (ii.mime && (!/^image\//i.test(ii.mime) || /djvu/i.test(ii.mime))) warum.push("mime " + ii.mime);
                if (!usablePhoto(f)) warum.push("Karte/Scan/Deckel");
                if (looksDamage(f)) warum.push("Schadbild");
                if (fileMentionsOther(f, c)) warum.push("andere Art");
                if (looksIllustration(f) || looksArtwork(meta)) warum.push("Kunst:" + (artKind(f, meta) || "nie"));
                return { f, warum };
              });
            } else {
              const p = wikiPage(await wikiArticleQuery(st.q));
              rec.artikel = !p ? null : { titel: p.title, bild: p.pageimage || "", passt: pageFitsCard(p, c),
                zeichnung: p.pageimage ? looksIllustration(p.pageimage) : null };
            }
          } catch (e) { rec.fehler = String((e && e.message) || e); }
          out.push(rec);
        }
        return out;
      }, r.i);
    }
    results.push(...res);
    const z = zaehle(res);
    console.log(`${id}: ${count} Arten · Foto ${z.foto} · Zeichnung ${z.zeichnung} · Herbarbeleg ${z.herbar} · kein Bild ${z.kein} · Netzfehler ${z.netz}`);
  }
  await browser.close();

  const dauer = Math.round((Date.now() - t0) / 1000);
  const bericht = { stand: new Date().toISOString(), version: stamp, ua: UA, rate: RATE, mock: MOCK, dauer_s: dauer,
    anfragen: stat, seitenfehler: pageErrors, profile: ids, ergebnisse: results };
  fs.writeFileSync(path.join(OUT, "bildcheck.json"), JSON.stringify(bericht, null, 1));
  const md = markdown(bericht);
  fs.writeFileSync(path.join(OUT, "bildcheck.md"), md);
  fs.writeFileSync(path.join(OUT, "kontaktbogen.html"), kontaktbogen(bericht));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log("\n" + md);
  // Ohne Foto: eine kompakte Zeile je Art (Gründe aus der Diagnose gezählt) – lesbar im Job-Log
  console.log("\n--- Arten ohne Foto (kompakt) ---");
  for (const r of results.filter(r => r.status !== "foto")) {
    const gruende = {};
    (r.diagnose || []).forEach(s => (s.dateien || []).forEach(d => (d.warum.length ? d.warum : ["angenommen?"]).forEach(w => { gruende[w] = (gruende[w] || 0) + 1; })));
    const wp = (r.diagnose || []).filter(s => s.k === "wp").map(s => s.artikel ? `${s.q}→${s.artikel.titel}${s.artikel.bild ? "" : "(ohne Bild)"}${s.artikel.passt ? "" : "(passt nicht)"}` : `${s.q}→–`).join("; ");
    console.log(`${r.status.toUpperCase()} | ${r.profil} | ${r.g} ${r.a} | ${r.de} | ${r.file || ""} | Dateien: ${JSON.stringify(gruende)} | Artikel: ${wp}${r.fehler ? " | " + r.fehler : ""}`);
  }
  if (pageErrors.length) console.log("\nSeitenfehler:\n" + pageErrors.join("\n"));
  const z = zaehle(results);
  if (!MOCK && z.netz > results.length * 0.1) { console.error(`\nUnzuverlässig: ${z.netz} von ${results.length} Arten mit Netzfehler.`); process.exit(2); }
}

function zaehle(list) {
  const z = { foto: 0, zeichnung: 0, herbar: 0, kein: 0, netz: 0, tmp: 0 };
  list.forEach(r => { z[r.status] = (z[r.status] || 0) + 1; if (r.tmp) z.tmp++; });
  return z;
}
const bot = r => `*${(r.g + " " + r.a).replace(/\s+/g, " ").trim()}*`;
function markdown(b) {
  const L = [];
  L.push(`# Bildcheck Bilder-Quiz`, ``, `${b.version || ""} · geprüft ${b.stand.slice(0, 16).replace("T", " ")} UTC · ${b.dauer_s} s · ` +
    `${b.anfragen.netz} Anfragen (${b.anfragen.cacheTreffer} aus dem Cache, ${b.anfragen.wiederholt} wiederholt, 429: ${b.anfragen.http429}, API-Überlast: ${b.anfragen.apiBusy || 0}, davon iNaturalist: ${b.anfragen.inat || 0})${b.mock ? " · **MOCK – keine echten Daten**" : ""}`, ``);
  L.push(`| Profil | Arten | Foto | Zeichnung | Herbarbeleg | kein Bild | Netzfehler | vorläufig |`, `|---|---:|---:|---:|---:|---:|---:|---:|`);
  for (const id of b.profile) {
    const z = zaehle(b.ergebnisse.filter(r => r.profil === id)), n = b.ergebnisse.filter(r => r.profil === id).length;
    L.push(`| ${id} | ${n} | ${z.foto} | ${z.zeichnung} | ${z.herbar} | ${z.kein} | ${z.netz} | ${z.tmp} |`);
  }
  const z = zaehle(b.ergebnisse);
  L.push(`| **gesamt** | **${b.ergebnisse.length}** | **${z.foto}** | **${z.zeichnung}** | **${z.herbar}** | **${z.kein}** | **${z.netz}** | **${z.tmp}** |`, ``);
  // je Taxon zusammenfassen (dieselbe Art steht oft in mehreren Listen)
  const gruppe = status => {
    const m = new Map();
    b.ergebnisse.filter(r => status.includes(r.status)).forEach(r => {
      const k = (r.g + " " + r.a + " | " + r.de).toLowerCase();
      if (!m.has(k)) m.set(k, Object.assign({}, r, { profile: [] }));
      m.get(k).profile.push(r.profil);
    });
    return [...m.values()].sort((x, y) => (x.g + x.a).localeCompare(y.g + y.a));
  };
  const abschnitt = (titel, list, extra) => {
    L.push(`## ${titel} (${list.length})`, ``);
    if (!list.length) L.push(`keine`, ``);
    list.forEach(r => L.push(`- ${bot(r)} · ${r.de}${extra ? extra(r) : ""} — ${r.profile.join(", ")}`));
    L.push(``);
  };
  abschnitt("Foto von iNaturalist (Ersatzquelle)", gruppe(["foto"]).filter(r => r.src === "inat"), r => ` · ${r.lizenz || ""} · ${r.urheber || ""}`);
  // Sammeleinträge (»Fuchsia Cultivars«): Der Bildcheck zählt nur, ob ein Bild kommt – ob es die Gartenform
  // zeigt, sieht man nur am Dateinamen. Deshalb alle gewählten Dateien, die Rückfälle eigens.
  abschnitt("Sammeleinträge: nur eine Wildart gefunden (keine Gartenform)", gruppe(["foto"]).filter(r => r.rueckfall === "wild"), r => ` · ${r.file}`);
  abschnitt("Gruppen-Sammeleinträge: Gruppe nicht gefunden, andere Gartenform", gruppe(["foto"]).filter(r => r.rueckfall === "form"), r => ` · ${r.file}`);
  abschnitt("Sammeleinträge – gewähltes Bild", gruppe(["foto", "zeichnung", "herbar", "kein"]).filter(r => r.sammel), r => ` · ${r.file || "–"}${r.src === "wp" ? " (Artikel " + r.titel + ")" : ""}`);
  abschnitt("Kein Bild", gruppe(["kein"]));
  abschnitt("Nur Zeichnung", gruppe(["zeichnung"]), r => ` · ${r.file}`);
  abschnitt("Nur Herbarbeleg", gruppe(["herbar"]), r => ` · ${r.file}`);
  abschnitt("Netzfehler (Prüfung nicht aussagekräftig)", gruppe(["netz"]), r => ` · ${r.fehler || ""}`);
  return L.join("\n");
}
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function klein(u, w) {                                         // Vorschau in einer Commons-Standardgröße (250 px), nie größer als das Original
  const m = /\/(\d+)px-[^/]+$/.exec(u || "");
  if (!m || +m[1] <= 250 || (w && w < 250)) return u;
  return u.replace(/\/\d+px-([^/]+)$/, "/250px-$1");
}
function kontaktbogen(b) {
  const lab = { foto: "Foto", zeichnung: "Zeichnung", herbar: "Herbarbeleg", kein: "kein Bild", netz: "Netzfehler" };
  const teile = b.profile.map(id => {
    const list = b.ergebnisse.filter(r => r.profil === id);
    const kacheln = list.map(r => {
      const commons = r.file ? "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(r.file) : "";
      const bild = r.thumb ? `<img loading="lazy" referrerpolicy="no-referrer" src="${esc(klein(r.thumb, r.w))}" data-orig="${esc(r.thumb)}" alt="" onerror="if(this.dataset.orig&&this.src!==this.dataset.orig){this.src=this.dataset.orig}">` : `<div class="leer">${esc(lab[r.status])}</div>`;
      return `<figure class="k ${esc(r.status)}${r.tmp ? " tmp" : ""}">${commons ? `<a href="${esc(commons)}" target="_blank" rel="noopener">${bild}</a>` : bild}` +
        `<figcaption><i>${esc((r.g + " " + r.a).trim())}</i><br>${esc(r.de)}<br><span class="s">${esc(lab[r.status])}${r.src ? " · " + esc(r.src === "wp" ? "Artikel " + r.titel : r.src === "inat" ? "iNaturalist" : "Commons") : ""}${r.tmp ? " · vorläufig" : ""}</span></figcaption></figure>`;
    }).join("");
    const z = zaehle(list);
    return `<section><h2>${esc(id)} <small>${list.length} Arten · Foto ${z.foto} · Zeichnung ${z.zeichnung} · Beleg ${z.herbar} · kein Bild ${z.kein}${z.netz ? " · Netzfehler " + z.netz : ""}</small></h2><div class="raster">${kacheln}</div></section>`;
  }).join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bildcheck Kontaktbogen</title><style>
body{font:14px/1.4 system-ui,sans-serif;margin:16px;background:#f6f4ee;color:#222}
h1{font-size:20px}h2{font-size:16px;margin:28px 0 8px}h2 small{font-weight:400;color:#555}
.raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.k{margin:0;background:#fff;border:1px solid #ddd;border-radius:8px;overflow:hidden}
.k img,.leer{display:block;width:100%;height:130px;object-fit:cover;background:#eee}
.leer{display:flex;align-items:center;justify-content:center;color:#a33;font-weight:600}
figcaption{padding:6px 8px;font-size:12px}.s{color:#666}
.zeichnung,.herbar{border-color:#b8873a;border-width:2px}.kein,.netz{border-color:#c33;border-width:2px}.tmp{outline:2px dashed #888}
</style></head><body><h1>Bildcheck Bilder-Quiz – Kontaktbogen</h1>
<p>${esc(b.version)} · geprüft ${esc(b.stand.slice(0, 16).replace("T", " "))} UTC. Jede Kachel zeigt das erste Quiz-Bild der Art
(Klick öffnet die Datei auf Wikimedia Commons). Rahmen: <b style="color:#b8873a">gold</b> = Zeichnung/Herbarbeleg,
<b style="color:#c33">rot</b> = kein Bild, gestrichelt = vorläufig (ein genauerer Suchweg kam nicht durch).</p>${teile}</body></html>`;
}

main().catch(e => { console.error("Bildcheck abgebrochen:", (e && e.stack) || e); process.exit(1); });
