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
 *   - erkennt Kategorie-Überschriften (Text in Spalte A ohne bot. Namen)
 *   - übernimmt Deutscher Name, Familie, Synonyme und ZP-Kennzeichen
 *
 * Ausgabeformat je Zeile (kompaktes Array, wie im Tool erwartet):
 *   [gattung, art, familie, deutscher_name, kategorie, zp(0|1), synonyme]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const XLSX = require(path.join(ROOT, "lib", "xlsx.full.min.js"));

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
const H = {
  botanisch: /(botan|wissensch|lateinisch|bot\.?\s*name|artname)/i,
  deutsch: /(deutsch|trivial|dt\.?\s*name)/i,
  familie: /(familie|family)/i,
  zp: /^zp\.?$|zwischenpr/i,
  synonyme: /synonym/i,
  gattung: /^gattung$|genus/i,
  art: /^art$|epitheton|species/i,
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
  for (let i = hr + 1; i < rows.length; i++) {
    const cells = rows[i].map((x) => (x == null ? "" : x));
    while (cells.length <= maxIdx) cells.push("");
    if (!cells.map(norm).join("")) continue;
    const bot = hasBot ? norm(cells[m.botanisch]) : "";
    const fam = norm(cells[m.familie]);
    const a0 = norm(cells[0]);
    if (!bot && !fam && !(hasGA && norm(cells[m.gattung])) && a0 && !/^nr/i.test(a0)) {
      kat = a0.replace(/^\d+[.)]?\s*/, ""); continue;
    }
    if (/^https?:|^stand:|^quelle/i.test(bot) || /^https?:|^stand:|^quelle/i.test(a0)) continue;
    let g, ar;
    if (hasGA && norm(cells[m.gattung])) { g = norm(cells[m.gattung]); ar = tidy(cells[m.art]); }
    else { if (!bot) continue;[g, ar] = split(bot); }
    if (!g) continue;
    out.push([
      g, ar, fam,
      m.deutsch != null ? norm(cells[m.deutsch]) : "",
      kat,
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
