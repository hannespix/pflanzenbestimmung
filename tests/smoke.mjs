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

  // 1b) Aktiver Zustand: geöffnetes Modul-Panel markiert seinen Button
  const active = await page.evaluate(() => {
    const btn = document.querySelector("#btnGrade");
    const wasActive = btn.classList.contains("active");
    toggleGrader();
    const openState = { active: btn.classList.contains("active"), pressed: btn.getAttribute("aria-pressed") };
    toggleGrader();
    const closedState = { active: btn.classList.contains("active"), pressed: btn.getAttribute("aria-pressed") };
    return { wasActive, openState, closedState };
  });
  assert(!active.wasActive && active.openState.active && active.openState.pressed === "true",
    "Modul-Button wird beim Öffnen nicht als aktiv markiert");
  assert(!active.closedState.active && active.closedState.pressed === "false",
    "Modul-Button bleibt nach dem Schließen aktiv");

  // 1c) Hilfe-Panel öffnet mit Inhalt und markiert seinen Button; Tooltips vorhanden
  const help = await page.evaluate(() => {
    toggleHelp();
    const open = { vis: !$("#helpPanel").hasAttribute("hidden"), active: $("#btnHelp").classList.contains("active"),
      hasContent: /In fünf Schritten/.test($("#helpPanel").textContent) };
    toggleHelp();
    const tips = ["#btnImport", "#btnDraw", "#btnPrint", "#btnHelp", "#btnSchema", "#btnSettings"]
      .every((s) => (document.querySelector(s).getAttribute("title") || "").length > 15);
    return { open, hiddenAfter: $("#helpPanel").hasAttribute("hidden"), tips };
  });
  assert(help.open.vis && help.open.active && help.open.hasContent, "Hilfe-Panel öffnet nicht korrekt");
  assert(help.hiddenAfter, "Hilfe-Panel schließt nicht");
  assert(help.tips, "Nicht alle wichtigen Buttons haben einen (aussagekräftigen) Tooltip");

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

  // 6a) Druck-Dialog (ersetzt window.prompt): öffnet, wählt Variante, schließt
  const printDlg = await page.evaluate(() => {
    let picked = null;
    askPrintMode((m) => { picked = m; });
    const opened = $("#printScrim").classList.contains("open");
    $("#printSolution").click();
    return { opened, closed: !$("#printScrim").classList.contains("open"), picked };
  });
  assert(printDlg.opened, "Druck-Dialog öffnet nicht");
  assert(printDlg.closed && printDlg.picked === "solution", "Druck-Dialog liefert die gewählte Variante nicht");

  // 6b) GaLaBau-Schema-Overrides: Fachwerker Deutscher Name (3) zuerst, Gattung/Art je 0,5
  await page.select("#frSelect", "garten_und_landschaftsbau");
  await page.select("#nivSelect", "fachwerker");
  await page.$eval("#nivSelect", (e) => e.dispatchEvent(new Event("change")));
  const gala = await page.evaluate(() => {
    drawRandom(); buildSheet("solution");
    return {
      anzahl: schema.anzahl,
      order: schema.cols.map((c) => c.key).join(","),
      per: ptsPer(),
      max: selection.length * ptsPer(),
      heads: [...document.querySelectorAll("#sheet thead th")].map((t) => t.childNodes[0].textContent.trim())
    };
  });
  assert(gala.anzahl === 15, "GaLaBau/Fachwerker: 15 Pflanzen erwartet, war " + gala.anzahl);
  assert(gala.order === "deutscher_name,gattung,art", "GaLaBau/Fachwerker: Spaltenreihenfolge falsch: " + gala.order);
  assert(gala.per === 4 && gala.max === 60, "GaLaBau/Fachwerker: 4 P./Pflanze und 60 P. gesamt erwartet, war " + gala.per + "/" + gala.max);
  assert(gala.heads[1] === "Deutscher Name", "GaLaBau/Fachwerker: erste Bewertungsspalte muss Deutscher Name sein, war " + gala.heads[1]);

  // 6c) Spaltenreihenfolge editierbar: erstes Feld nach unten schieben ändert cols-Reihenfolge
  const reordered = await page.evaluate(() => {
    if ($("#schemaPanel").hasAttribute("hidden")) toggleSchema();
    const before = schema.cols.map((c) => c.key).join(",");
    moveSchemaField(0, "down");
    return { before, after: schema.cols.map((c) => c.key).join(",") };
  });
  assert(reordered.before !== reordered.after && reordered.after.split(",").length === 3,
    "Reorder sollte die Spaltenreihenfolge ändern: " + reordered.before + " -> " + reordered.after);

  // zurück auf Baumschule/Gärtner für den Persistenz-Test
  await page.select("#frSelect", "baumschule");
  await page.select("#nivSelect", "gaertner");
  await page.$eval("#nivSelect", (e) => e.dispatchEvent(new Event("change")));

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

  // 7b) Prüfung nach Datum speichern, laden, aus Snapshot drucken, JSON serialisieren
  const exam = await page.evaluate(() => {
    drawRandom();
    const drawn = selection.length;
    if ($("#examsPanel").hasAttribute("hidden")) toggleExams();
    $("#exDate").value = "2026-06-15";
    $("#exLabel").value = "Smoke";
    saveExam();
    const saved = exams.length;
    // Laden stellt die Auswahl wieder her
    selection = [];
    loadExam(exams[0].id);
    const loaded = selection.length;
    // Druck aus Snapshot
    const ex = exams[0];
    buildSheet("solution", { plants: ex.plants, schema: ex.schema, def: { fr: ex.fr, niveau: ex.niveau }, date: ex.date });
    const rows = document.querySelectorAll("#sheet table.exam tbody tr").length;
    const dateShown = /15\.06\.2026/.test(document.querySelector("#sheet .sheet-meta").textContent);
    const json = JSON.stringify(ex);
    return { drawn, saved, loaded, rows, dateShown, jsonOk: json.includes("2026-06-15") && json.includes("\"plants\"") };
  });
  assert(exam.saved === 1, "Prüfung speichern schlug fehl (exams=" + exam.saved + ")");
  assert(exam.loaded === exam.drawn && exam.loaded > 0, "Prüfung laden stellte die Auswahl nicht her: " + exam.loaded + "/" + exam.drawn);
  assert(exam.rows === exam.drawn, "Snapshot-Druck: Zeilenzahl " + exam.rows + " != " + exam.drawn);
  assert(exam.dateShown, "Snapshot-Druck zeigt das Prüfungsdatum nicht");
  assert(exam.jsonOk, "Prüfungs-JSON unvollständig");
  // Persistenz der Prüfungen über einen Reload
  await page.waitForFunction("localStorage.getItem('pflanzenkenntnis.exams')!=null", { timeout: 5000 });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.pickExcel!=null", { timeout: 10000 });
  const examsAfter = await page.evaluate(() => exams.length);
  assert(examsAfter === 1, "Gespeicherte Prüfung überlebte den Reload nicht: " + examsAfter);

  // 7c) Einstellungen: zuständige Stelle editierbar und auf dem Bogen sichtbar
  const settingsCheck = await page.evaluate(() => {
    if ($("#settingsPanel").hasAttribute("hidden")) toggleSettings();
    $("#set_stelle1").value = "Landwirtschaftskammer Musterland";
    $("#set_stelle1").onchange();
    drawRandom(); buildSheet("blank");
    return {
      inSheet: /Landwirtschaftskammer Musterland/.test(document.querySelector("#sheet .brand").textContent),
      persisted: /Landwirtschaftskammer Musterland/.test(localStorage.getItem("pflanzenkenntnis.settings") || "")
    };
  });
  assert(settingsCheck.inSheet && settingsCheck.persisted, "Einstellungen: zuständige Stelle nicht übernommen");

  // 7d) Vorschau: Reihenfolge ändern, Bearbeiten schreibt in die DB zurück, Entfernen
  const preview = await page.evaluate(() => {
    drawRandom();
    if ($("#previewPanel").hasAttribute("hidden")) togglePreview();
    const before = selection.slice(0, 2).join(",");
    movePreview(0, 1);
    const reordered = selection.slice(0, 2).join(",") !== before;
    const fid = selection[0];
    openEdit(fid); $("#fBem").value = "Smoke-Notiz"; saveEdit();
    const writeback = cache.find((x) => x.id === fid).bemerkungen === "Smoke-Notiz";
    const n0 = selection.length; pvRemove(selection[selection.length - 1]);
    return { reordered, writeback, removed: n0 - selection.length };
  });
  assert(preview.reordered, "Vorschau: Reorder wirkt nicht");
  assert(preview.writeback, "Vorschau: Bearbeiten schreibt nicht in die DB zurück");
  assert(preview.removed === 1, "Vorschau: Entfernen wirkt nicht");

  // 7e) Prüfung kopieren + geladene Prüfung nach Änderung aktualisieren
  const copyUpd = await page.evaluate(() => {
    drawRandom();
    if ($("#examsPanel").hasAttribute("hidden")) toggleExams();
    $("#exDate").value = "2026-05-02"; saveExam();
    const base = exams.length;
    copyExam(exams.find((e) => e.date === "2026-05-02").id);
    const copied = exams.length === base + 1;
    const lid = exams[0].id; loadExam(lid);
    const beforeN = exams.find((e) => e.id === lid).plants.length;
    pvRemove(selection[0]); updateLoadedExam();
    const afterN = exams.find((e) => e.id === lid).plants.length;
    return { copied, updated: afterN === beforeN - 1 };
  });
  assert(copyUpd.copied, "Prüfung kopieren erzeugt keine neue Prüfung");
  assert(copyUpd.updated, "Geladene Prüfung aktualisieren wirkt nicht");

  // 7f) Sicherung enthält Prüfungen und Einstellungen und stellt sie wieder her
  const backup = await page.evaluate(() => {
    // Ausgangszustand: mind. eine Prüfung und eine angepasste zuständige Stelle
    if (!exams.length) { drawRandom(); if ($("#examsPanel").hasAttribute("hidden")) toggleExams(); $("#exDate").value = "2026-04-01"; saveExam(); }
    settings.stelle1 = "Prüfstelle Backup"; saveSettings();
    const data = JSON.parse(JSON.stringify(backupData()));
    const inBackup = { exams: Array.isArray(data.exams) ? data.exams.length : -1, stelle1: data.settings && data.settings.stelle1 };
    // Zustand zerstören, dann aus der Sicherung wiederherstellen
    exams = []; saveExams(); settings = defaultSettings(); saveSettings();
    const r = applyBackup(data);
    return { inBackup, restoredExams: exams.length, restoredStelle: settings.stelle1, r };
  });
  assert(backup.inBackup.exams >= 1, "Sicherung enthält keine Prüfungen");
  assert(backup.inBackup.stelle1 === "Prüfstelle Backup", "Sicherung enthält die Einstellungen nicht");
  assert(backup.restoredExams === backup.inBackup.exams, "Prüfungen wurden aus der Sicherung nicht wiederhergestellt");
  assert(backup.restoredStelle === "Prüfstelle Backup", "Einstellungen wurden aus der Sicherung nicht wiederhergestellt");

  // 8) Testreste im Browser-Speicher aufräumen
  await page.evaluate(() => {
    localStorage.removeItem("pflanzenkenntnis.data.baumschule_gaertner");
    localStorage.removeItem("pflanzenkenntnis.data.garten_und_landschaftsbau_fachwerker");
    localStorage.removeItem("pflanzenkenntnis.exams");
    localStorage.removeItem("pflanzenkenntnis.settings");
  });

  assert(errs.length === 0, "Konsolenfehler im Testverlauf: " + errs.join(" | "));
  await browser.close();
  console.log("Smoke-Test OK – Boot, aktiver Panel-Zustand, Hilfe + Tooltips, Profilwechsel (148/248), GaLaBau-Schema, Ziehen, Bogen, Prüfung speichern/laden/kopieren/aktualisieren, Einstellungen, Vorschau, Sicherung, Persistenz.");
}

main().catch((e) => { console.error("Smoke-Test FEHLGESCHLAGEN:\n  " + e.message); process.exit(1); });
