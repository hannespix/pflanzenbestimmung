#!/usr/bin/env node
/*
 * xlsx_to_seed.mjs – wandelt eine Pflanzenlisten-Excel in eine Seed-JSON um.
 *
 * Aufruf:
 *   node tools/xlsx_to_seed.mjs <excel-datei> <profil-id> [--sheet "Name"]
 *
 * Beispiel:
 *   node tools/xlsx_to_seed.mjs data/Baumschule_Gaertner.xlsx baumschule_gaertner
 *
 * Ergebnis: seeds/<profil-id>.json
 *
 * Der Parser ist identisch zur Import-Logik im Tool (src/app.js):
 *   - findet die Kopfzeile automatisch (Botanischer Name + Familie)
 *   - trennt Gattung (erstes Wort) und Art (Rest, inkl. var./ssp./Gruppen)
 *   - hängt eine separate Sorte-Spalte an die Art an (Gattung/Art/Sorte-Listen)
 *   - erkennt Kategorie-Überschriften (Text in Spalte A ohne bot. Namen), auch
 *     die erste Rubrik oberhalb der Kopfzeile, sowie eine Verwendungs-/Kategorie-Spalte
 *   - übernimmt Deutscher Name, Familie, Synonyme und ZP-Kennzeichen
 *     (ZP-Spalte auch als „P“/„Prüfung“/„FW“/„Fachwerk.“ mit Werten AP/ZP)
 *
 * Ausgabeformat je Zeile (kompaktes Array, wie im Tool erwartet):
 *   [gattung, art, familie, deutscher_name, kategorie, zp(0|1), synonyme]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
// SheetJS ist ein Standalone-Browser-Bundle. Unter aktuellem Node liefert ein
// blankes require() ein leeres Objekt (die Bibliothek exportiert primär über die
// globale Variable XLSX). Deshalb im Funktions-Scope auswerten und dabei
// exports/module/define/window abschirmen, damit der Standalone-Zweig greift –
// so lädt der Konverter dieselbe Datei genauso wie der Browser.
const XLSX = (new Function("exports", "module", "define", "window",
  fs.readFileSync(path.join(ROOT, "lib", "xlsx.full.min.js"), "utf8") + "\n;return XLSX;"
))(undefined, undefined, undefined, undefined);

const norm = (s) => (s == null ? "" : String(s)).replace(/\s+/g, " ").trim();
const tidy = (s) => {
  s = norm(s);
  s = s.replace(/\b(var|subsp|ssp|f|cv|convar)\.(?=\S)/g, "$1. ");
  return norm(s);
};
const split = (b) => {
  b = tidy(b);
  if (!b) return ["", ""];
  const p = b.split(" ");
  return [p.shift(), p.join(" ")];
};
// Titel-/Fuß-/Quellzeilen, die weder Datenzeile noch Kategorie sind
const isNoise = (s) => /^(https?:|stand[:\s]|quelle|pflanzenliste)/i.test(norm(s));
const H = {
  botanisch: /(botan|wissensch|lateinisch|bot\.?\s*name|artname)/i,
  deutsch: /(deutsch|trivial|dt\.?\s*name)/i,
  familie: /(familie|family)/i,
  zp: /^zp\.?$|^p$|^fw$|pr(ü|ue)fung|zwischenpr|fachwerk/i,
  synonyme: /synonym/i,
  gattung: /^gattung$|genus/i,
  art: /^art$|epitheton|species/i,
  sorte: /^sorte$|^sorten|kultivar|cultivar/i,
  kategorie: /^kategorie$|^verwendung$/i,
};

function parseSheet(rows) {
  let hr = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const c = rows[i].map(norm);
    const hasBot = c.some((x) => H.botanisch.test(x)) ||
      (c.some((x) => H.gattung.test(x)) && c.some((x) => H.art.test(x)));
    const hasFam = c.some((x) => H.familie.test(x));
    if (hasBot && hasFam) { hr = i; break; }
  }
  if (hr < 0) return [];
  const m = {};
  rows[hr].forEach((c, i) => {
    const v = norm(c);
    for (const k in H) if (H[k].test(v) && m[k] == null) m[k] = i;
  });
  const hasBot = m.botanisch != null, hasGA = m.gattung != null && m.art != null;
  if ((!hasBot && !hasGA) || m.familie == null) return [];
  const maxIdx = Math.max(...Object.values(m));
  const out = [];
  let kat = "";
  // Anfangs-Kategorie: eine allein stehende Rubrik knapp oberhalb der Kopfzeile
  // (manche Listen setzen die erste Rubrik über die Spaltentitel).
  for (let i = hr - 1; i >= Math.max(0, hr - 4); i--) {
    const c = rows[i].map(norm);
    if (c[0] && !c.slice(1).join("") && !isNoise(c[0]) && !/^nr/i.test(c[0])) {
      kat = c[0].replace(/^\d+[.)]?\s*/, ""); break;
    }
  }
  for (let i = hr + 1; i < rows.length; i++) {
    const cells = rows[i].map((x) => (x == null ? "" : x));
    while (cells.length <= maxIdx) cells.push("");
    if (!cells.map(norm).join("")) continue;
    const bot = hasBot ? norm(cells[m.botanisch]) : "";
    const fam = norm(cells[m.familie]);
    const a0 = norm(cells[0]);
    // Fußzeilen / URLs / Stand-Angaben überspringen (vor der Kategorie-Erkennung)
    if (isNoise(bot) || isNoise(a0)) continue;
    // Kategorie-Überschrift: Text in Spalte A, aber kein bot. Name/Familie
    if (!bot && !fam && !(hasGA && norm(cells[m.gattung])) && a0 && !/^nr/i.test(a0)) {
      kat = a0.replace(/^\d+[.)]?\s*/, ""); continue;
    }
    let g, ar;
    if (hasGA && norm(cells[m.gattung])) {
      g = norm(cells[m.gattung]); ar = tidy(cells[m.art]);
      if (m.sorte != null) { const sv = tidy(cells[m.sorte]); if (sv) ar = norm(ar + " " + sv); }
    } else { if (!bot) continue;[g, ar] = split(bot); }
    if (!g) continue;
    // Kategorie aus einer Verwendungs-/Kategorie-Spalte hat Vorrang vor der Rubrik
    let rowKat = kat;
    if (m.kategorie != null) { const kv = norm(cells[m.kategorie]); if (kv) rowKat = kv; }
    out.push([
      g, ar, fam,
      m.deutsch != null ? norm(cells[m.deutsch]) : "",
      rowKat,
      m.zp != null && /zp|x|ja|1|✓/i.test(norm(cells[m.zp])) ? 1 : 0,
      m.synonyme != null ? norm(cells[m.synonyme]) : "",
    ]);
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const sheetIdx = args.indexOf("--sheet");
  const sheetName = sheetIdx >= 0 ? args[sheetIdx + 1] : null;
  const positional = args.filter((a, i) => a !== "--sheet" && args[i - 1] !== "--sheet");
  const [file, profileId] = positional;
  if (!file || !profileId) {
    console.error("Aufruf: node tools/xlsx_to_seed.mjs <excel-datei> <profil-id> [--sheet \"Name\"]");
    process.exit(1);
  }
  const wb = XLSX.read(fs.readFileSync(file), { type: "buffer" });
  const names = sheetName ? [sheetName] : wb.SheetNames;
  let recs = [];
  for (const nm of names) {
    const ws = wb.Sheets[nm];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    recs = recs.concat(parseSheet(rows));
  }
  if (!recs.length) {
    console.error("Keine Arten erkannt – Spalten prüfen (Botanischer Name + Familie).");
    process.exit(1);
  }
  const outPath = path.join(ROOT, "seeds", profileId + ".json");
  fs.writeFileSync(outPath, JSON.stringify(recs, false, 0), "utf-8");
  const kats = {};
  recs.forEach((r) => (kats[r[4] || "—"] = (kats[r[4] || "—"] || 0) + 1));
  console.log(`OK  seeds/${profileId}.json  ·  ${recs.length} Arten  ·  ${recs.filter((r) => r[5]).length} ZP`);
  console.log("Kategorien: " + Object.entries(kats).map(([k, n]) => `${k} (${n})`).join(" · "));
  console.log("Beispiel:  " + JSON.stringify(recs[0]));
}

main();
