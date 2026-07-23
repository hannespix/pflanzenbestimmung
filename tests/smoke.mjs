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

  // 1b) Modul als Modal: Öffnen markiert den Button, ×/Esc/Scrim-Klick schließen
  const active = await page.evaluate(() => {
    const btn = document.querySelector("#btnGrade");
    const wasActive = btn.classList.contains("active");
    openGrader();
    const openState = { open: $("#graderScrim").classList.contains("open"),
      active: btn.classList.contains("active"), pressed: btn.getAttribute("aria-pressed") };
    document.querySelector("#graderScrim .pclose").click(); // ×-Knopf
    const afterClose = { open: $("#graderScrim").classList.contains("open"),
      active: btn.classList.contains("active"), pressed: btn.getAttribute("aria-pressed") };
    openGrader();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); // Esc
    const afterEsc = $("#graderScrim").classList.contains("open");
    return { wasActive, openState, afterClose, afterEsc };
  });
  assert(!active.wasActive && active.openState.open && active.openState.active && active.openState.pressed === "true",
    "Modul-Modal öffnet nicht bzw. Button wird nicht als aktiv markiert");
  assert(!active.afterClose.open && !active.afterClose.active && active.afterClose.pressed === "false",
    "×-Knopf schließt das Modul-Modal nicht (oder Button bleibt aktiv)");
  assert(!active.afterEsc, "Esc schließt das Modul-Modal nicht");

  // 1c) Hilfe-Modal öffnet mit Inhalt und markiert seinen Button; Tooltips vorhanden
  const help = await page.evaluate(() => {
    openHelp();
    const open = { vis: $("#helpScrim").classList.contains("open"), active: $("#btnHelp").classList.contains("active"),
      hasContent: /In fünf Schritten/.test($("#helpPanel").textContent) };
    closePanel("#helpScrim");
    const tips = ["#btnImport", "#btnDraw", "#btnPrint", "#btnHelp", "#btnSchema", "#btnSettings"]
      .every((s) => (document.querySelector(s).getAttribute("title") || "").length > 15);
    const icon = document.querySelector('link[rel="icon"]');
    const favicon = !!icon && /^data:image\/svg\+xml,/.test(icon.getAttribute("href") || "");
    return { open, closedAfter: !$("#helpScrim").classList.contains("open"), tips, favicon };
  });
  assert(help.open.vis && help.open.active && help.open.hasContent, "Hilfe-Modal öffnet nicht korrekt");
  assert(help.closedAfter, "Hilfe-Modal schließt nicht");
  assert(help.tips, "Nicht alle wichtigen Buttons haben einen (aussagekräftigen) Tooltip");
  assert(help.favicon, "Inline-Favicon (data:image/svg+xml) fehlt");

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

  // 6a2) Druck-Dialog speichert die Auswahl als Prüfung; erneutes Drucken
  //      aktualisiert die geladene Prüfung statt ein Duplikat anzulegen
  const printSave = await page.evaluate(() => {
    window.print = () => {}; // im Test wirkungslos halten
    const n0 = exams.length;
    askPrintMode(); // Druck der aktuellen Auswahl (ohne cb)
    const rowVisible = !$("#prSaveRow").hidden && $("#prSaveChk").checked;
    $("#prDate").value = "2026-09-01"; $("#prLabel").value = "Smoke-Druck";
    $("#printBlank").click(); // druckt und speichert
    const first = { count: exams.length, date: exams[0] && exams[0].date,
      label: exams[0] && exams[0].label, loaded: loadedExamId === (exams[0] && exams[0].id) };
    askPrintMode();
    const relabel = $("#prSaveLbl").textContent;
    $("#printSolution").click(); // zweiter Druck → aktualisieren, kein Duplikat
    const second = exams.length;
    // aufräumen, damit spätere Prüfungs-Tests bei 0 starten
    exams = exams.filter((e) => e.id !== loadedExamId); saveExams();
    loadedExamId = null; syncExamControls();
    return { n0, rowVisible, first, relabel, second };
  });
  assert(printSave.rowVisible, "Druck-Dialog: »Als Prüfung speichern« fehlt oder ist nicht vorbelegt");
  assert(printSave.first.count === printSave.n0 + 1 && printSave.first.date === "2026-09-01"
    && printSave.first.label === "Smoke-Druck" && printSave.first.loaded,
    "Drucken speichert die Auswahl nicht als Prüfung: " + JSON.stringify(printSave.first));
  assert(/aktualisieren/.test(printSave.relabel), "Zweiter Druck müsste »aktualisieren« anbieten, war: " + printSave.relabel);
  assert(printSave.second === printSave.n0 + 1, "Zweiter Druck darf kein Duplikat anlegen (exams=" + printSave.second + ")");

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
      heads: [...document.querySelectorAll("#sheet thead th")].map((t) => (t.childNodes[0] || { textContent: "" }).textContent.trim())
    };
  });
  assert(gala.anzahl === 15, "GaLaBau/Fachwerker: 15 Pflanzen erwartet, war " + gala.anzahl);
  assert(gala.order === "deutscher_name,gattung,art", "GaLaBau/Fachwerker: Spaltenreihenfolge falsch: " + gala.order);
  assert(gala.per === 4 && gala.max === 60, "GaLaBau/Fachwerker: 4 P./Pflanze und 60 P. gesamt erwartet, war " + gala.per + "/" + gala.max);
  assert(gala.heads[1] === "Deutscher Name", "GaLaBau/Fachwerker: erste Bewertungsspalte muss Deutscher Name sein, war " + gala.heads[1]);

  // 6c) Spaltenreihenfolge editierbar: erstes Feld nach unten schieben ändert cols-Reihenfolge
  const reordered = await page.evaluate(() => {
    openSchema();
    const before = schema.cols.map((c) => c.key).join(",");
    moveSchemaField(0, "down");
    return { before, after: schema.cols.map((c) => c.key).join(",") };
  });
  assert(reordered.before !== reordered.after && reordered.after.split(",").length === 3,
    "Reorder sollte die Spaltenreihenfolge ändern: " + reordered.before + " -> " + reordered.after);

  // 6d) Schema-Matrix: alle Fachwerker 60 P. (Dt. Name zuerst), GaLaBau-Gärtner 80 P., Produktions-Gärtner 200 P.
  const matrix = await page.evaluate(() => {
    const load = (fr, niv) => {
      $("#frSelect").value = fr; $("#nivSelect").value = niv; applyProfileSelect();
      return { per: ptsPer(), anzahl: schema.anzahl, max: schema.anzahl * ptsPer(),
        order: schema.cols.map((c) => c.key).join(",") };
    };
    return {
      fwGemuese: load("gemuesebau", "fachwerker"),
      fwBaum: load("baumschule", "fachwerker"),
      fwZier: load("zierpflanzenbau", "fachwerker"),
      galaG: load("garten_und_landschaftsbau", "gaertner"),
      prodG: load("baumschule", "gaertner")
    };
  });
  assert(matrix.fwGemuese.max === 60 && matrix.fwGemuese.anzahl === 15 && matrix.fwGemuese.order === "deutscher_name,gattung,art",
    "Gemüsebau/Fachwerker: 60 P. (15) mit Dt. Name zuerst erwartet: " + JSON.stringify(matrix.fwGemuese));
  assert(matrix.fwBaum.max === 60 && matrix.fwZier.max === 60,
    "Baumschule/Zierpflanzenbau Fachwerker: je 60 P. erwartet: " + JSON.stringify([matrix.fwBaum, matrix.fwZier]));
  assert(matrix.galaG.max === 80 && matrix.galaG.per === 4 && matrix.galaG.order === "gattung,art,deutscher_name",
    "GaLaBau/Gärtner: 80 P. (1/1/2) erwartet: " + JSON.stringify(matrix.galaG));
  assert(matrix.prodG.max === 200 && matrix.prodG.per === 10 && matrix.prodG.order === "gattung,art,familie,deutscher_name",
    "Produktions-Gärtner (Baumschule): 200 P. (3/3/1/3) erwartet: " + JSON.stringify(matrix.prodG));

  // 6e) Offizielle Leerbögen: drei Formular-Familien (Produktion / GaLaBau / Fachwerker)
  const forms = await page.evaluate(() => {
    const build = (fr, niv) => {
      $("#frSelect").value = fr; $("#nivSelect").value = niv; applyProfileSelect();
      drawRandom(); buildSheet("blank");
      return { title: document.querySelector("#sheet h1").textContent,
               html: document.querySelector("#sheet").innerHTML };
    };
    const prod = build("obstbau", "gaertner");
    const gala = build("garten_und_landschaftsbau", "gaertner");
    const fw = build("gemuesebau", "fachwerker");
    return {
      prodTitle: prod.title.trim(),
      prodOk: /Gattungsname/.test(prod.html) && /Familienname/.test(prod.html) &&
              /Auszubildende \/ Auszubildender/.test(prod.html) &&
              /Erreichte Punktzahl:/.test(prod.html) && /Datum \/ Unterschrift des Prüfers/.test(prod.html) &&
              !/Schreibfehler/.test(prod.html),
      galaTitle: gala.title.trim(),
      galaOk: /Schreibfehler führen zur Halbierung der Punktezahl/.test(gala.html) && /1 Punkt \(G\)/.test(gala.html),
      fwTitle: fw.title.trim(),
      fwOk: /Gartenbaufachwerker\/in/.test(fw.html) && /Gattung \(botanisch\)/.test(fw.html) &&
            /0,5 Punkte/.test(fw.html) && !/\(G\)/.test(fw.html) &&
            /Gesamtpunkte/.test(fw.html) && /Es wurde folgende Note erzielt:/.test(fw.html) &&
            /Datum \/ Unterschrift Prüfende/.test(fw.html)
    };
  });
  assert(/im Gartenbau$/.test(forms.prodTitle), "Produktions-Bogen: Titel »… im Gartenbau« erwartet, war: " + forms.prodTitle);
  assert(forms.prodOk, "Produktions-Bogen entspricht nicht dem offiziellen Formular");
  assert(/im Gartenbau GALA$/.test(forms.galaTitle), "GaLaBau-Bogen: Titel »… im Gartenbau GALA« erwartet, war: " + forms.galaTitle);
  assert(forms.galaOk, "GaLaBau-Bogen: Schreibfehler-Hinweis/Punktangaben (G) fehlen");
  assert(forms.fwTitle === "Abschlussprüfung Pflanzenbestimmung", "FW-Bogen: Titel ohne Zusatz erwartet, war: " + forms.fwTitle);
  assert(forms.fwOk, "Fachwerker-Bogen entspricht nicht dem offiziellen Formular");

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
  // auf den tatsächlichen Inhalt warten (nicht nur die Existenz des Schlüssels),
  // damit der debounced persist() sicher abgeschlossen ist
  await page.waitForFunction(
    "(localStorage.getItem('pflanzenkenntnis.data.baumschule_gaertner')||'').includes('Smoketestia')", { timeout: 5000 });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.pickExcel!=null", { timeout: 10000 });
  const persisted = await page.evaluate(() =>
    cache.some((p) => p.gattung === "Smoketestia" && p.art === "verificata"));
  assert(persisted, "Hinzugefügte Art überlebte den Reload nicht (localStorage)");

  // 7b) Prüfung nach Datum speichern, laden, aus Snapshot drucken, JSON serialisieren
  const exam = await page.evaluate(() => {
    drawRandom();
    const drawn = selection.length;
    openExams();
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

  // 7c) Einstellungen: zuständige Stelle editierbar und in der Bogen-Fußzeile sichtbar
  const settingsCheck = await page.evaluate(() => {
    openSettings();
    $("#set_stelle1").value = "Landwirtschaftskammer Musterland";
    $("#set_stelle1").onchange();
    drawRandom(); buildSheet("blank");
    return {
      inSheet: /Landwirtschaftskammer Musterland/.test(document.querySelector("#sheet .ffoot").textContent),
      persisted: /Landwirtschaftskammer Musterland/.test(localStorage.getItem("pflanzenkenntnis.settings") || "")
    };
  });
  assert(settingsCheck.inSheet && settingsCheck.persisted, "Einstellungen: zuständige Stelle nicht übernommen");

  // 7d) Vorschau: Reihenfolge ändern, Bearbeiten schreibt in die DB zurück, Entfernen
  const preview = await page.evaluate(() => {
    drawRandom();
    openPreview();
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
    openExams();
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
    if (!exams.length) { drawRandom(); openExams(); $("#exDate").value = "2026-04-01"; saveExam(); }
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

  // 7g) Gerätewechsel: Prüfungs-JSON exportieren, auf »frischem Gerät« importieren.
  //     Früherer Bug: die Prüfungs-JSON wurde als Sicherung interpretiert und
  //     ERSETZTE die Pflanzenliste; die Snapshot-Arten (ohne id) waren danach
  //     nicht auswählbar. Jetzt: Import landet als gespeicherte Prüfung, die
  //     Liste bleibt unberührt, »Laden« ergänzt fehlende Arten automatisch.
  const xdev = await page.evaluate(() => {
    openExams();
    drawRandom(); $("#exDate").value = "2026-07-01"; $("#exLabel").value = "Gerätetest"; saveExam();
    const file = JSON.parse(JSON.stringify(exams[0])); // wie downloadExam (»JSON«)
    return { file, drawn: file.plants.length };
  });
  await page.evaluate(() => { localStorage.removeItem("pflanzenkenntnis.exams"); }); // »Gerät B« ohne Prüfungen
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.pickExcel!=null", { timeout: 10000 });
  const imp = await page.evaluate((file) => {
    const before = cache.length;
    const r1 = importJsonData(file);            // muss als Prüfung erkannt werden
    const untouched = cache.length === before;  // Pflanzenliste NICHT ersetzt
    const r2 = importJsonData(file);            // erneuter Import: kein Duplikat
    // eine Snapshot-Art künstlich »fremd« machen → »Laden« muss sie ergänzen
    const ex = exams.find((e) => e.id === file.id);
    ex.plants[0] = { gattung: "Importia", art: "peregrina", familie: "Testaceae",
      deutscher_name: "Import-Testpflanze", kategorie: ex.plants[0].kategorie, zp: 0 };
    saveExams();
    openExams();
    document.querySelector('#examList .exrow [data-act="load"]').click();
    const added = cache.length === before + 1;
    const neu = cache.find((p) => p.gattung === "Importia");
    return { type1: r1.type, count: r1.count, dupe2: r2.dupe === true, exN: exams.length,
      untouched, added, selOk: selection.length === ex.plants.length,
      selectable: !!(neu && selection.includes(neu.id)) };
  }, xdev.file);
  assert(imp.type1 === "exam", "Prüfungs-JSON wurde nicht als Prüfung erkannt (type=" + imp.type1 + ")");
  assert(imp.untouched, "Prüfungs-Import hat die Pflanzenliste verändert (alter Sicherungs-Bug)");
  assert(imp.exN === 1 && imp.dupe2, "Erneuter Import derselben Prüfung erzeugte ein Duplikat");
  assert(imp.count === xdev.drawn, "Importierte Prüfung hat falsche Pflanzenzahl: " + imp.count + "/" + xdev.drawn);
  assert(imp.added, "Fehlende Snapshot-Art wurde beim Laden nicht in die Liste übernommen");
  assert(imp.selOk && imp.selectable, "Geladene Prüfung ist nicht vollständig ausgewählt/auswählbar");

  // 7h) Sicherung eines anderen Profils laden → Import wechselt zum gesicherten
  //     Profil, statt still die Liste des aktiven Profils zu überschreiben
  const bswitch = await page.evaluate(() => {
    const data = JSON.parse(JSON.stringify(backupData()));
    const other = profileId === "gemuesebau_gaertner" ? "obstbau_gaertner" : "gemuesebau_gaertner";
    switchProfile(other);
    $("#frSelect").value = slug(PROFILE_DEFS[other].fr); $("#nivSelect").value = PROFILE_DEFS[other].niveauKey;
    const r = importJsonData(data);
    return { type: r.type, backTo: profileId === data.profile,
      sel: $("#frSelect").value === slug(PROFILE_DEFS[data.profile].fr) };
  });
  assert(bswitch.type === "backup" && bswitch.backTo, "Sicherung-Import wechselt nicht zum gesicherten Profil");
  assert(bswitch.sel, "Profil-Auswahlfelder nach Sicherung-Import nicht synchron");

  // 8) Testreste im Browser-Speicher aufräumen
  await page.evaluate(() => {
    localStorage.removeItem("pflanzenkenntnis.data.baumschule_gaertner");
    localStorage.removeItem("pflanzenkenntnis.data.garten_und_landschaftsbau_fachwerker");
    localStorage.removeItem("pflanzenkenntnis.exams");
    localStorage.removeItem("pflanzenkenntnis.settings");
  });

  // 9) Mobile-Layout: Status-Pille überlagert die Überschrift nicht (schmale Breite)
  await page.setViewport({ width: 360, height: 720, deviceScaleFactor: 1 });
  const mobile = await page.evaluate(() => {
    const h1 = document.querySelector(".masthead h1").getBoundingClientRect();
    const st = document.querySelector(".dbstatus").getBoundingClientRect();
    const overlap = !(st.right < h1.left || st.left > h1.right || st.bottom < h1.top || st.top > h1.bottom);
    return { overlap, statusBelowTitle: st.top >= h1.bottom - 1 };
  });
  assert(!mobile.overlap && mobile.statusBelowTitle,
    "Mobile: Status-Pille überlagert die Überschrift (overlap=" + mobile.overlap + ")");

  assert(errs.length === 0, "Konsolenfehler im Testverlauf: " + errs.join(" | "));
  await browser.close();
  console.log("Smoke-Test OK – Boot, Modul-Modals (öffnen/×/Esc, aktive Buttons), Hilfe + Tooltips, Profilwechsel (148/248), Schema-Matrix, Ziehen, Bogen (offizielle Formulare), Druck-Dialog speichert/aktualisiert Prüfung, Prüfungen (speichern/laden/kopieren/aktualisieren), Prüfungs-JSON-Import (Gerätewechsel), Sicherung mit Profilwechsel, Einstellungen, Vorschau, Persistenz, Mobile-Kopf.");
}

main().catch((e) => { console.error("Smoke-Test FEHLGESCHLAGEN:\n  " + e.message); process.exit(1); });
