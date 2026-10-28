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
  // View-Transitions deaktivieren: sie rendern asynchron und würden die
  // synchronen Assertions des Tests unzuverlässig machen (vt()-Fallback).
  await page.evaluateOnNewDocument(() => { window.__noVT = 1; });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text()); });

  await page.goto(FILE, { waitUntil: "load" });
  await page.waitForFunction("window.pickExcel!=null", { timeout: 10000 });

  // 1) Boot ohne Konsolenfehler
  assert(errs.length === 0, "Konsolenfehler beim Boot: " + errs.join(" | "));

  // 1a) Entschlackt: Filter (Suche/Kategorie/ZP) steckt in einer standardmäßig zugeklappten
  //     »Filter«-Klappe; ein aktiver Filter bleibt in der Zusammenfassung sichtbar (nicht unbemerkt aktiv)
  const filt = await page.evaluate(() => {
    const d = document.querySelector("#filterOpts");
    const search = document.querySelector("#q");
    const searchAlwaysVisible = !!search && !search.closest("details");   // Suche NICHT im eingeklappten Akkordeon
    const holds = d ? ["#cat", "#onlyzp"].every((s) => d.querySelector(s)) : false;
    const closed = d && !d.open;
    const z = document.querySelector("#onlyzp"); z.checked = true; z.dispatchEvent(new Event("change"));
    const sub = (document.querySelector("#filterOpts .fb-sub") || {}).textContent || "";
    const flagged = document.querySelector("#filterOpts").classList.contains("filter-on");
    z.checked = false; z.dispatchEvent(new Event("change"));
    const subReset = (document.querySelector("#filterOpts .fb-sub") || {}).textContent || "";
    return { isDetails: d && d.tagName === "DETAILS", closed, holds, searchAlwaysVisible, sub, flagged, subReset };
  });
  assert(filt.isDetails && filt.closed, "Filter (Kategorie/ZP) sollte in einer standardmäßig zugeklappten Klappe stecken");
  assert(filt.searchAlwaysVisible, "Die Suche muss immer sichtbar sein (nicht im eingeklappten Filter-Akkordeon)");
  assert(filt.holds, "Die Filter-Klappe muss Kategorie und ZP-Schalter enthalten");
  assert(/nur ZP/.test(filt.sub) && filt.flagged, "Aktiver Filter muss in der Zusammenfassung sichtbar/markiert sein: " + filt.sub);
  assert(/Kategorie · nur ZP/.test(filt.subReset), "Nach Rücknahme muss die Zusammenfassung zurückgesetzt werden: " + filt.subReset);

  // 1e) Zwei Modi + dauerhaftes »Aktuelle Prüfung«-Panel: Ziehen füllt das Panel nummeriert;
  //     »Liste verwalten« blendet Ziehen-Leiste + Panel aus, die Suche bleibt immer sichtbar.
  const modes = await page.evaluate(() => {
    setMode("exam");
    drawRandom();
    const panelRows = document.querySelectorAll("#currentSelList .pvrow").length;
    const cnt = +document.querySelector("#curselCount").textContent;
    const selVisExam = getComputedStyle(document.querySelector(".selbar")).display;
    const curVisExam = getComputedStyle(document.querySelector("#currentSel")).display;
    setMode("manage");
    const selVisManage = getComputedStyle(document.querySelector(".selbar")).display;
    const curVisManage = getComputedStyle(document.querySelector("#currentSel")).display;
    const q = document.querySelector("#q");
    const searchVisManage = getComputedStyle(q).display !== "none" && q.offsetParent !== null;
    setMode("exam"); clearSel();
    return { panelRows, cnt, selVisExam, curVisExam, selVisManage, curVisManage, searchVisManage };
  });
  assert(modes.panelRows > 0 && modes.cnt === modes.panelRows,
    "»Aktuelle Prüfung«-Panel muss die gezogene Auswahl nummeriert zeigen: " + JSON.stringify(modes));
  assert(modes.selVisExam !== "none" && modes.curVisExam !== "none",
    "Im Modus »Prüfung erstellen« müssen Ziehen-Leiste und Panel sichtbar sein: " + JSON.stringify(modes));
  assert(modes.selVisManage === "none" && modes.curVisManage === "none",
    "Im Modus »Liste verwalten« müssen Ziehen-Leiste und Panel ausgeblendet sein: " + JSON.stringify(modes));
  assert(modes.searchVisManage, "Die Suche muss auch im Modus »Liste verwalten« sichtbar bleiben: " + JSON.stringify(modes));
  const findbarSticky = await page.evaluate(() => getComputedStyle(document.querySelector(".findbar")).position);
  assert(findbarSticky === "sticky", "Die Suchleiste muss beim Scrollen oben kleben (position:sticky), war: " + findbarSticky);

  // 1b) Modul als Modal: Öffnen markiert den Button, ×/Esc/Scrim-Klick schließen
  const active = await page.evaluate(() => {
    const btn = document.querySelector("#btnGrade");
    const wasActive = btn.classList.contains("active");
    openGrader();
    const openState = { open: $("#graderScrim").classList.contains("open"),
      active: btn.classList.contains("active"), pressed: btn.getAttribute("aria-pressed"),
      gSync: (document.querySelector("#gSync")||{}).textContent };
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
  assert(/^aus Auswahl:/.test(active.openState.gSync || ""),
    "Notenrechner: »Höchstpunktzahl aus Auswahl«-Knopf muss verständlich beschriftet sein (»aus Auswahl: … P.«), war: " + JSON.stringify(active.openState.gSync));

  // 1b2) IHK-Notenschlüssel entfernt: kein Modus-Umschalter, keine »IHK«-Option; immer linear.
  //      Diskriminator: bei 50 % gibt linear Note 3 (Grenze 50), IHK gäbe Note 4.
  const noIhk = await page.evaluate(() => {
    openGrader();
    const g = document.querySelector("#graderScrim");
    const hasToggle = !!document.querySelector("#gMode") || /IHK/i.test(g.textContent);
    const at50 = computeGrade(100, 200).stufe;   // 50 % → linear = Note 3
    document.querySelector("#graderScrim .pclose").click();
    return { hasToggle, at50 };
  });
  assert(!noIhk.hasToggle, "Notenrechner darf keinen IHK-Umschalter/keine IHK-Option mehr haben: " + JSON.stringify(noIhk));
  assert(noIhk.at50 === 3, "Notenskala muss linear sein (50 % → Note 3, nicht IHK-Note 4): " + JSON.stringify(noIhk));

  // 1b3) Flag-Leck: »Neue Art anlegen« (setzt selectNewAfterSave) per Esc abbrechen darf
  // nicht dazu führen, dass eine SPÄTER regulär angelegte Art ungewollt in der Auswahl landet.
  const flagLeak = await page.evaluate(() => {
    drawRandom();
    const before = selection.length;
    // Normalfall: pvAddNew → speichern → neue Art landet in der Auswahl
    openPreview(); pvAddNew();
    $("#fGattung").value = "Smoketestus"; $("#fArt").value = "selectus"; saveEdit();
    const addedSel = cache.find(x => x.gattung === "Smoketestus" && x.art === "selectus");
    const normalInSel = addedSel ? selection.includes(addedSel.id) : null;
    // Leck-Fall: pvAddNew → mit Esc abbrechen → danach regulär eine neue Art anlegen
    pvAddNew();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); // bricht ab, Flag muss zurückgesetzt werden
    openEdit(null);
    $("#fGattung").value = "Smoketestus"; $("#fArt").value = "leakus"; saveEdit();
    const addedLeak = cache.find(x => x.gattung === "Smoketestus" && x.art === "leakus");
    const leakInSel = addedLeak ? selection.includes(addedLeak.id) : null;
    // Aufräumen: Testarten entfernen, Auswahl leeren, Vorschau-Modal schließen – damit die
    // folgende 148-Zählung und weitere Tests unberührt bleiben.
    [addedSel, addedLeak].forEach(a => { if (a) { const i = cache.indexOf(a); if (i >= 0) cache.splice(i, 1); } });
    selection.length = 0;
    $("#previewScrim").classList.remove("open");
    markDirty(); renderList(); syncSelUI();
    return { before, normalInSel, leakInSel, cleaned: !cache.some(x => x.gattung === "Smoketestus") };
  });
  assert(flagLeak.normalInSel === true,
    "»Neue Art anlegen« → Speichern muss die Art in die Auswahl übernehmen: " + JSON.stringify(flagLeak));
  assert(flagLeak.leakInSel === false,
    "Nach abgebrochenem »Neue Art anlegen« (Esc) darf eine später angelegte Art NICHT automatisch in der Auswahl landen: " + JSON.stringify(flagLeak));
  assert(flagLeak.cleaned === true, "Flag-Test-Aufräumen fehlgeschlagen: " + JSON.stringify(flagLeak));

  // 1b2) Barrierefreiheit der Modale: role=dialog/aria-modal/aria-labelledby, Fokus wandert
  // beim Öffnen ins Modal (zentral über wireModalA11y), Toast ist Live-Region.
  const modalA11y = await page.evaluate(async () => {
    const scrim = document.querySelector("#helpScrim");
    const dlg = scrim.querySelector(".grader,.modal,[id$=Panel]") || scrim.firstElementChild;
    openHelp();
    await new Promise((r) => setTimeout(r, 50));
    const role = dlg.getAttribute("role"), modal = dlg.getAttribute("aria-modal"), lab = dlg.getAttribute("aria-labelledby");
    const focusInside = scrim.contains(document.activeElement);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    return { role, modal, hasLabel: !!(lab && document.getElementById(lab)), focusInside,
      toastLive: document.querySelector("#toast").getAttribute("aria-live") };
  });
  assert(modalA11y.role === "dialog" && modalA11y.modal === "true" && modalA11y.hasLabel,
    "Modal muss role=dialog, aria-modal=true und aria-labelledby haben: " + JSON.stringify(modalA11y));
  assert(modalA11y.focusInside, "Beim Öffnen muss der Fokus ins Modal wandern: " + JSON.stringify(modalA11y));
  assert(modalA11y.toastLive === "polite", "Toast muss eine aria-live-Region sein: " + JSON.stringify(modalA11y));

  // Hell/Dunkel-Umschalter setzt data-theme und merkt die Wahl. Sitzt als runder Knopf im
  // Kopf (ein Ort auf allen drei Seiten – Audit) – Delegation auf .themetoggle.
  const themeT = await page.evaluate(() => {
    const b = document.querySelector(".themetoggle");
    if (!b) return { has: false };
    b.click();
    const afterOne = document.documentElement.dataset.theme, saved = localStorage.getItem("pbw.theme");
    b.click();
    const afterTwo = document.documentElement.dataset.theme;
    // Kopf: Link zur Lernversion (es gibt keine Startseite mehr), Hilfe dezent, kein Theme-Knopf im Kopf
    const home = document.querySelector(".mast-right .homelink");
    return {
      has: true, afterOne, saved, afterTwo,
      homeHref: home ? home.getAttribute("href") : null,
      lernHref: (document.querySelector('.mast-right a[href="pflanzen-lernen.html"]') || {}).textContent || null,
      helpDezent: !!document.querySelector(".mast-right .helplink#btnHelp"),
      toggleInHead: !!document.querySelector(".mast-right .themetoggle, .mast-right #btnTheme")
    };
  });
  assert(themeT.has && themeT.afterOne === "dark" && themeT.saved === "dark" && themeT.afterTwo === "light",
    "Theme-Umschalter muss dunkel/hell wechseln und die Wahl speichern: " + JSON.stringify(themeT));
  assert(themeT.homeHref === "pflanzen-lernen.html" && /Lernversion/.test(themeT.lernHref || ""),
    "Kopf muss zur Lernversion verlinken (pflanzen-lernen.html): " + JSON.stringify(themeT));
  assert(themeT.helpDezent && themeT.toggleInHead,
    "»Hilfe« dezent im Kopf, Design-Umschalter als runder Knopf im Kopf (ein Ort auf allen Seiten – Audit): " + JSON.stringify(themeT));

  // 1c) Hilfe-Modal öffnet mit Inhalt und markiert seinen Button; Tooltips vorhanden
  const help = await page.evaluate(() => {
    openHelp();
    const ht = $("#helpPanel").textContent.replace(/\s+/g, " ");
    const open = { vis: $("#helpScrim").classList.contains("open"), active: $("#btnHelp").classList.contains("active"),
      hasContent: /In fünf Schritten/.test(ht),
      // Datenherkunft: amtliche Liste vs. automatisch erzeugt, und der Bogen bleibt davon frei
      quelle: /unverändert aus den amtlichen\s*Prüfungslisten/.test(ht) && /Chimonanthus/.test(ht) && /Philadelphus coronarius/.test(ht) && /Anführungszeichen um/.test(ht) &&
        /Fünf Eingriffe/.test(ht) && /Rechtschreibfehler/.test(ht) && /Antirrhinum/.test(ht),
      erzeugt: /generativer KI/.test(ht) && /Mehr zur Pflanze/.test(ht),
      bogenFrei: /Notenberechnung enthalten davon nichts/.test(ht),
      mehr: !!$('#helpPanel a[href="rechtliches.html#datenquellen"]') };
    closePanel("#helpScrim");
    const tips = ["#btnImport", "#btnDraw", "#btnPrint", "#btnHelp", "#btnSchema", "#btnSettings"]
      .every((s) => (document.querySelector(s).getAttribute("title") || "").length > 15);
    const icon = document.querySelector('link[rel="icon"]');
    const favicon = !!icon && /^data:image\/svg\+xml,/.test(icon.getAttribute("href") || "");
    return { open, closedAfter: !$("#helpScrim").classList.contains("open"), tips, favicon };
  });
  assert(help.open.vis && help.open.active && help.open.hasContent, "Hilfe-Modal öffnet nicht korrekt");
  assert(help.open.quelle,
    "Hilfe muss die Herkunft der Listen benennen (amtlich, unverändert) und die Ergänzungen offenlegen: " +
    JSON.stringify(help.open));
  assert(help.open.erzeugt && help.open.bogenFrei,
    "Hilfe muss das automatisch Erzeugte auf die Info-Karte eingrenzen und den Bogen davon freisprechen: " +
    JSON.stringify(help.open));
  assert(help.open.mehr, "Hilfe muss auf rechtliches.html#datenquellen verweisen");
  assert(help.closedAfter, "Hilfe-Modal schließt nicht");
  assert(help.tips, "Nicht alle wichtigen Buttons haben einen (aussagekräftigen) Tooltip");
  assert(help.favicon, "Inline-Favicon (data:image/svg+xml) fehlt");

  // 1d) Aufgeräumter Kopf: nur Prüfungen/Notenrechner/Verwaltung sichtbar,
  //     die selteneren Funktionen liegen im aufklappbaren »Verwaltung«-Bereich
  const adminUI = await page.evaluate(() => {
    const bar = $("#adminBar"), btn = $("#btnAdmin");
    const hiddenFirst = bar.hasAttribute("hidden");
    btn.click();
    const openState = { shown: !bar.hasAttribute("hidden"), active: btn.classList.contains("active"),
      expanded: btn.getAttribute("aria-expanded"),
      hasAll: ["#btnImport", "#btnAdd", "#btnSchema", "#btnSettings", "#btnOpen", "#btnSave", "#btnReset"]
        .every((s) => bar.contains(document.querySelector(s))) };
    btn.click();
    const closedAgain = bar.hasAttribute("hidden");
    return { hiddenFirst, openState, closedAgain };
  });
  assert(adminUI.hiddenFirst, "Verwaltungs-Bereich sollte anfangs eingeklappt sein");
  assert(adminUI.openState.shown && adminUI.openState.active && adminUI.openState.expanded === "true",
    "»Verwaltung« klappt nicht auf bzw. markiert den Button nicht");
  assert(adminUI.openState.hasAll, "Verwaltungs-Bereich enthält nicht alle selteneren Funktionen");
  assert(adminUI.closedAgain, "»Verwaltung« klappt nicht wieder zu");

  // 2) Standardprofil gemuesebau_gaertner: 148 Arten in der Liste sichtbar
  await page.select("#frSelect", "gemuesebau");
  await page.select("#nivSelect", "gaertner");
  await page.$eval("#frSelect", (e) => e.dispatchEvent(new Event("change")));
  await page.waitForFunction("document.querySelectorAll('#list .row').length===148", { timeout: 10000 })
    .catch(() => { throw new Error("Gemüsebau/Gärtner: erwartete 148 Zeilen nicht erreicht"); });

  // 2b) ZP-Legende erklärt »ZP« über der Liste (Gemüsebau enthält ZP-Arten)
  const zpLeg = await page.evaluate(() => (document.querySelector("#list .zpnote") || {}).textContent || "");
  assert(/ZP.*Zwischenprüfung relevant/.test(zpLeg), "Prüfliste: ZP-Legende fehlt: " + zpLeg);

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
      title: (document.querySelector("#sheet h1") || {}).textContent || "",
      solLook: document.querySelector("#sheet").classList.contains("sol-look"),
      botItalic: document.querySelectorAll("#sheet table.exam td.bot").length > 0
    };
  });
  assert(sheet.rows === 20, "Druckbogen sollte 20 Zeilen haben, war " + sheet.rows);
  assert(sheet.hasSolutionNote, "Musterlösung sollte 'Nur für Prüfende' zeigen");
  assert(/Musterlösung/.test(sheet.title), "Musterlösungs-Titel fehlt: " + sheet.title);
  assert(sheet.solLook && sheet.botItalic, "Musterlösung sollte das schöne Layout (sol-look, kursive Botanik) tragen");

  // 6) Prüfungsbogen (leer) baut ohne Fehler, ohne 'Nur für Prüfende' und im
  //    offiziellen Arial-Look (KEIN sol-look – der amtliche Bogen bleibt unverändert)
  const blank = await page.evaluate(() => {
    buildSheet("blank");
    return { rows: document.querySelectorAll("#sheet table.exam tbody tr").length,
             note: /Nur für Prüfende/.test(document.querySelector("#sheet").innerHTML),
             solLook: document.querySelector("#sheet").classList.contains("sol-look") };
  });
  assert(blank.rows === 20, "Prüfungsbogen sollte 20 Zeilen haben, war " + blank.rows);
  assert(!blank.note, "Leerer Prüfungsbogen darf 'Nur für Prüfende' nicht zeigen");
  assert(!blank.solLook, "Leerer Prüfungsbogen muss im amtlichen Arial-Look bleiben (kein sol-look)");

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

  // 8i) Pflanzen-Info-Modal (aus dem Lern-Tool portiert): ℹ in der Auswahl-Liste und
  //     in der »Aktuellen Prüfung« öffnet die Info-Karte (Namensherleitung + neutrale
  //     Deep-Links + opt-in Wikipedia-Knopf); eigener Namensraum .infoscrim/.infobox,
  //     die bestehenden .scrim/.modal-Panels bleiben unberührt.
  await page.setViewport({ width: 1000, height: 900, deviceScaleFactor: 1 });
  await page.waitForFunction("document.querySelectorAll('#list .row').length>0", { timeout: 10000 });
  const info = await page.evaluate(() => {
    const openBtn = [...document.querySelectorAll("#list .row .rowacts .iconbtn")]
      .find(b => /Mehr zur Pflanze/.test(b.title));
    if (!openBtn) return { ok: false, why: "kein ℹ-Knopf in der Auswahl-Liste" };
    // ℹ muss OHNE Hover sichtbar sein (auffindbar); Bearbeiten/Löschen bleiben hover-gated
    const row = openBtn.closest(".row");
    const editBtn = [...row.querySelectorAll(".rowacts .iconbtn")].find(b => !b.classList.contains("info"));
    const infoOpacity = getComputedStyle(openBtn).opacity;
    const editOpacity = editBtn ? getComputedStyle(editBtn).opacity : "1";
    const touchMedia = matchMedia("(hover:none),(pointer:coarse)").matches;   // Headless meldet oft hover:none → dann dauerhaft sichtbar (gewollt)
    openBtn.click();
    const box = document.querySelector(".infoscrim .infobox");
    const links = [...document.querySelectorAll(".infoscrim .srcgrid a")].map(a => a.textContent.replace(/[↗\s]+$/, ""));
    const res = {
      ok: !!box,
      role: box && box.getAttribute("role"),
      hasHead: !!document.querySelector(".infoscrim .mh-bot"),
      links,
      hasWpBtn: !!document.querySelector(".infoscrim #wpLoad"),
      etyPresent: !!document.querySelector(".infoscrim details.etym"),
      leakedScrimOpen: document.querySelectorAll(".scrim.open").length,   // Info-Modal darf kein Panel öffnen
      infoOpacity, editOpacity, touchMedia
    };
    const x = document.querySelector(".infoscrim .infobox-x"); if (x) x.click();
    res.closedByX = !document.querySelector(".infoscrim");
    // aus der »Aktuellen Prüfung« heraus
    if (window.drawRandom) window.drawRandom();
    const cur = document.querySelector('#currentSelList .pvrow [data-a="info"]');
    if (cur) { cur.click(); res.fromCurrent = !!document.querySelector(".infoscrim .infobox"); }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    res.closedByEsc = !document.querySelector(".infoscrim");
    return res;
  });
  assert(info.ok && info.role === "dialog" && info.hasHead,
    "Info-Modal öffnet nicht korrekt aus der Auswahl-Liste: " + JSON.stringify(info));
  assert(info.infoOpacity === "1" && info.editOpacity === (info.touchMedia ? "1" : "0"),
    "ℹ muss ohne Hover sichtbar sein (opacity 1); Bearbeiten/Löschen hover-gated (opacity 0) – außer auf Touch (hover:none), dort dauerhaft sichtbar: " + JSON.stringify(info));
  assert(JSON.stringify(info.links) === JSON.stringify(["Wikipedia", "NaturaDB", "iNaturalist"]),
    "Info-Modal muss die neutralen Deep-Links (Wikipedia/NaturaDB/iNaturalist) zeigen: " + JSON.stringify(info.links));
  assert(info.hasWpBtn, "Info-Modal muss den opt-in »Online-Infos laden«-Knopf (Wikipedia) haben: " + JSON.stringify(info));
  assert(info.etyPresent, "Info-Modal muss die Namensherleitung (Merkhilfe) enthalten: " + JSON.stringify(info));

  // Online-Infos einer Varietät (Kirschtomate): die Kette findet nur den Artikel der Art
  // (»Tomate«) – das Bild bleibt (keine Bildsuche im Prüfungswerkzeug), aber die Karte
  // sagt klar, dass Text und Bild die Art zeigen, nicht die Varietät.
  const prevProfile = await page.evaluate(() => [document.querySelector("#frSelect").value, document.querySelector("#nivSelect").value]);
  await page.select("#frSelect", "gemuesebau"); await page.select("#nivSelect", "gaertner");
  await page.$eval("#nivSelect", (e) => e.dispatchEvent(new Event("change")));
  await page.evaluate(() => { const q = document.querySelector("#q"); if (q && q.value) { q.value = ""; q.dispatchEvent(new Event("input")); } });
  await page.waitForFunction("[...document.querySelectorAll('#list .row')].some((r) => /cerasiforme/.test(r.textContent))", { timeout: 10000 });
  const taxon = await page.evaluate(async () => {
    const PX = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";
    const wp = (title, extract) => ({ query: { pages: { "1": { title, extract, thumbnail: { source: PX } } } } });
    window.__setJsonp((url) => {
      if (/generator=images/.test(url)) return Promise.resolve({ query: { pages: {} } });
      const t = decodeURIComponent((url.match(/titles=([^&]+)/) || [])[1] || "");
      if (t === "Solanum lycopersicum" || t === "Tomate") return Promise.resolve(wp("Tomate", "Die Tomate (Solanum lycopersicum) ist eine Pflanzenart."));
      return Promise.resolve({ query: { pages: { "-1": { title: t, missing: "" } } } });
    });
    const row = [...document.querySelectorAll("#list .row")].find((r) => /cerasiforme/.test(r.textContent));
    const btn = row && [...row.querySelectorAll(".rowacts .iconbtn")].find((b) => /Mehr zur Pflanze/.test(b.title));
    if (!btn) return { ok: false };
    btn.click();
    document.querySelector(".infoscrim #wpLoad").click();
    for (let i = 0; i < 60 && !document.querySelector(".infoscrim .wphost .wp-text"); i++) await new Promise((r) => setTimeout(r, 25));
    const h = document.querySelector(".infoscrim .wphost");
    const res = { ok: true, note: (h.querySelector(".wp-taxon") || {}).textContent || "", img: !!h.querySelector("img"),
      text: (h.querySelector(".wp-text") || {}).textContent || "" };
    const x = document.querySelector(".infoscrim .infobox-x"); if (x) x.click();
    window.__setJsonp(null);
    return res;
  });
  assert(taxon.ok && /Artikel zur Art Solanum lycopersicum/.test(taxon.note) && /Varietät »var\. cerasiforme«/.test(taxon.note) && taxon.img && /Tomate/.test(taxon.text),
    "Prüfungswerkzeug-Info-Karte: Varietät mit Art-Artikel muss den Hinweis tragen (Bild bleibt): " + JSON.stringify(taxon));

  // Gattungs-Notnagel (wie im Lern-Tool): »Syringa x chinensis« hat keinen Artikel – weder als
  // Hybride (x/×) noch als Binom noch unter »Chinesischer Flieder«. Statt der Sackgasse zeigt
  // die Karte den Artikel zur Gattung (»Syringa« → »Flieder«), deutlich gekennzeichnet.
  await page.select("#frSelect", "garten_und_landschaftsbau"); await page.select("#nivSelect", "gaertner");
  await page.$eval("#nivSelect", (e) => e.dispatchEvent(new Event("change")));
  await page.waitForFunction("[...document.querySelectorAll('#list .row')].some((r) => /Syringa/.test(r.textContent) && /chinensis/.test(r.textContent))", { timeout: 10000 });
  const gatt = await page.evaluate(async () => {
    const PX = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";
    const wp = (title, extract, props) => ({ query: { pages: { "1": Object.assign({ title, extract, thumbnail: { source: PX } }, props || {}) } } });
    const titles = [];
    window.__setJsonp((url) => {
      if (/generator=images/.test(url)) return Promise.resolve({ query: { pages: {} } });
      const t = decodeURIComponent((url.match(/titles=([^&]+)/) || [])[1] || ""); titles.push(t);
      if (t === "Syringa" || t === "Flieder") return Promise.resolve(wp("Flieder", "Flieder (Syringa) ist eine Pflanzengattung aus der Familie der Ölbaumgewächse (Oleaceae)."));
      return Promise.resolve({ query: { pages: { "-1": { title: t, missing: "" } } } });
    });
    const row = [...document.querySelectorAll("#list .row")].find((r) => /Syringa/.test(r.textContent) && /chinensis/.test(r.textContent));
    const btn = row && [...row.querySelectorAll(".rowacts .iconbtn")].find((b) => /Mehr zur Pflanze/.test(b.title));
    if (!btn) return { ok: false };
    btn.click();
    document.querySelector(".infoscrim #wpLoad").click();
    for (let i = 0; i < 80 && !document.querySelector(".infoscrim .wphost .wp-text, .infoscrim .wphost .wp-note"); i++) await new Promise((r) => setTimeout(r, 25));
    const h = document.querySelector(".infoscrim .wphost");
    const res = { ok: true, note: (h.querySelector(".wp-taxon") || {}).textContent || "", img: !!h.querySelector("img"),
      text: (h.querySelector(".wp-text") || {}).textContent || "", reihe: titles.slice(),
      bkl: genusArticleOk({ title: "Iris", extract: "Iris steht für: Schwertlilien (Iris), eine Pflanzengattung", pageprops: { disambiguation: "" } }, { g: "Iris", a: "sibirica" }),
      cands: wikiCandidates({ g: "Syringa", a: "x chinensis", de: "Chinesischer Flieder" }),
      gcands: wikiGenusCandidates({ g: "Syringa", a: "x chinensis", de: "Chinesischer Flieder" }),
      taxon: taxonName({ g: "Taraxacum", a: "sect. Ruderalia" }), epi: binomEpithet("sect. Ruderalia"), epi2: binomEpithet("vulgaris, A. Cultivars") };
    const x = document.querySelector(".infoscrim .infobox-x"); if (x) x.click();
    window.__setJsonp(null);
    return res;
  });
  assert(gatt.ok && /Kein eigener Wikipedia-Artikel/.test(gatt.note) && /Gattung/.test(gatt.note) && /Flieder/.test(gatt.note) && gatt.img && /Flieder \(Syringa\)/.test(gatt.text),
    "Prüfungswerkzeug-Info-Karte: ohne eigenen Artikel erscheint der Gattungsartikel mit Hinweis (Bild = Gattung): " + JSON.stringify(gatt));
  assert(JSON.stringify(gatt.reihe) === JSON.stringify(["Syringa x chinensis", "Syringa × chinensis", "Syringa chinensis", "Chinesischer Flieder", "Syringa oblata subsp. oblata", "Syringa"]) &&
    JSON.stringify(gatt.gcands) === JSON.stringify(["Syringa", "Flieder"]) && !gatt.cands.some((t) => /^syringa$/i.test(t)) && gatt.bkl === false,
    "Kandidaten-Reihenfolge (Hybrid-Zeichen ×, Gattung zuletzt, Begriffsklärung abgelehnt): " + JSON.stringify({ reihe: gatt.reihe, cands: gatt.cands, gcands: gatt.gcands, bkl: gatt.bkl }));
  assert(gatt.taxon === "Taraxacum sect. Ruderalia" && gatt.epi === "" && gatt.epi2 === "vulgaris",
    "Rang-Kürzel »sect.« ist kein Epitheton (Deep-Links auf die Gattung), Komma wird gestrichen: " + JSON.stringify({ taxon: gatt.taxon, epi: gatt.epi, epi2: gatt.epi2 }));

  // Synonyme der Liste als Kandidatinnen + Ausfall ≠ »nicht gefunden« (wie im Lern-Tool)
  const synFail = await page.evaluate(async () => {
    const cands = wikiCandidates({ g: "Berberis", a: "aquifolium", de: "Gewöhnliche Mahonie", syn: "Mahonia aquifolium" });
    window.__setJsonp((url) => {
      if (/generator=images/.test(url)) return Promise.resolve({ query: { pages: {} } });
      const t = decodeURIComponent((url.match(/titles=([^&]+)/) || [])[1] || "");
      if (t === "Syringa" || t === "Flieder") return Promise.reject(new Error("timeout"));
      return Promise.resolve({ query: { pages: { "-1": { title: t, missing: "" } } } });
    });
    wikiCache.delete("Syringa x chinensis");
    const row = [...document.querySelectorAll("#list .row")].find((r) => /Syringa/.test(r.textContent) && /chinensis/.test(r.textContent));
    const btn = row && [...row.querySelectorAll(".rowacts .iconbtn")].find((b) => /Mehr zur Pflanze/.test(b.title));
    if (!btn) return { ok: false };
    btn.click();
    document.querySelector(".infoscrim #wpLoad").click();
    for (let i = 0; i < 80 && !document.querySelector(".infoscrim .wphost .wp-text, .infoscrim .wphost .wp-note"); i++) await new Promise((r) => setTimeout(r, 25));
    const h = document.querySelector(".infoscrim .wphost");
    const res = { ok: true, cands, note: (h.querySelector(".wp-note") || {}).textContent || "",
      btn: ((document.querySelector(".infoscrim #wpLoad") || {}).textContent || "").trim(), cached: wikiCache.has("Syringa x chinensis") };
    const x = document.querySelector(".infoscrim .infobox-x"); if (x) x.click();
    window.__setJsonp(null);
    return res;
  });
  assert(synFail.ok && synFail.cands.indexOf("Mahonia aquifolium") > synFail.cands.indexOf("Gewöhnliche Mahonie") && /konnten nicht geladen/.test(synFail.note) &&
    /2 von 7 Anfragen/.test(synFail.note) && /Erneut versuchen/.test(synFail.btn) && synFail.cached === false,
    "Prüfungswerkzeug-Info-Karte: Synonym der Liste als Kandidatin; abgebrochene Anfragen = Verbindungsproblem mit »Erneut versuchen«, nichts gecacht: " + JSON.stringify(synFail));
  await page.select("#frSelect", prevProfile[0]); await page.select("#nivSelect", prevProfile[1]);
  await page.$eval("#nivSelect", (e) => e.dispatchEvent(new Event("change")));
  await page.waitForFunction("document.querySelectorAll('#list .row').length>0", { timeout: 10000 });
  assert(info.leakedScrimOpen === 0, "Info-Modal darf kein .scrim-Panel öffnen (Namensraum-Trennung): " + JSON.stringify(info));
  assert(info.closedByX, "Info-Modal schließt nicht über ×: " + JSON.stringify(info));
  assert(info.fromCurrent, "ℹ in der »Aktuellen Prüfung« öffnet die Info-Karte nicht: " + JSON.stringify(info));
  assert(info.closedByEsc, "Info-Modal schließt nicht über Esc: " + JSON.stringify(info));

  // 8x) Bild-Lightbox (Info-Karte): eigener Namensraum (.lbscrim, kein .scrim-Panel),
  //     Fokus auf ×, Esc schließt und gibt den Fokus zurück; lbBig leitet das größere Derivat ab.
  const lb = await page.evaluate(() => {
    const before = document.querySelectorAll(".scrim.open").length;
    const anchor = document.querySelector("#btnDraw"); anchor.focus();
    openLightbox("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>", "Test");
    const sc = document.querySelector(".lbscrim");
    const open = !!sc && sc.getAttribute("role") === "dialog" && !!sc.querySelector(".lb-img");
    const xFocused = document.activeElement === (sc && sc.querySelector(".lb-x"));
    const noPanel = document.querySelectorAll(".scrim.open").length === before;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    const closed = !document.querySelector(".lbscrim");
    const focusBack = document.activeElement === anchor;

    // Galerie mit mehreren Bildern: Pfeile, Zähler und Wischen (dieselbe Logik wie im Lern-Tool)
    const px = (f) => "data:image/svg+xml," + encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'><title>" + f + "</title></svg>");
    openLightbox(px("A"), "A", [{ src: px("A"), file: "A.jpg" }, { src: px("B"), file: "B.jpg" }], 0);
    const g = document.querySelector(".lbscrim");
    const zahl = () => (g.querySelector(".lb-count") || {}).textContent || "";
    const galStart = zahl();
    const t = g.querySelector(".lb-img");
    const f = (x, y) => new Touch({ identifier: 1, target: t, clientX: x, clientY: y });
    const ev = (typ, pts, chg) => t.dispatchEvent(new TouchEvent(typ,
      { bubbles: true, touches: pts, targetTouches: pts, changedTouches: chg }));
    ev("touchstart", [f(300, 300)], [f(300, 300)]);
    ev("touchmove",  [f(120, 306)], [f(120, 306)]);
    ev("touchend",   [],            [f(120, 306)]);
    const nachWisch = zahl();
    g.click();                                       // Klick direkt nach dem Wisch schließt nicht
    const offenNachWisch = !!document.querySelector(".lbscrim");
    closeLightbox();
    return { open, xFocused, noPanel, closed, focusBack, galStart, nachWisch, offenNachWisch,
      derive: lbBig("https://u/commons/thumb/x/Foo.jpg/640px-Foo.jpg"),
      klein: lbBig("https://u/commons/thumb/x/Foo.jpg/640px-Foo.jpg", 1500) };   // Original 1500 px → 1280, nie darüber
  });
  assert(lb.open && lb.xFocused && lb.noPanel,
    "Lightbox muss als eigener Dialog öffnen (Fokus auf ×, kein .scrim-Panel): " + JSON.stringify(lb));
  assert(lb.closed && lb.focusBack, "Esc muss die Lightbox schließen und den Fokus zurückgeben: " + JSON.stringify(lb));
  assert(/\/1920px-Foo\.jpg$/.test(lb.derive) && /\/1280px-Foo\.jpg$/.test(lb.klein),
    "lbBig muss auf eine Commons-Standardstufe ableiten (1920; bei 1500 px Original 1280): " + JSON.stringify({ d: lb.derive, k: lb.klein }));
  assert(lb.galStart === "1 / 2" && lb.nachWisch === "2 / 2" && lb.offenNachWisch,
    "Galerie: Zähler und Wischen müssen auch hier greifen, ohne beim Wisch zu schließen: " + JSON.stringify(lb));

  // Versionskennung + »Neue Version« (Prüfwerkzeug): im Leerlauf neu laden, bei gezogener Prüfung Hinweis mit Knopf
  const swu = await page.evaluate(() => {
    const stamp = (document.querySelector("#buildStamp") || {}).textContent || "";
    let reloads = 0; __swReloadHook(() => { reloads++; });
    clearSel(); __swUpdate(); const sofort = reloads;
    drawRandom(); __swUpdate();
    const note = document.querySelector("#swNote"); const hinweis = note ? note.textContent : "";
    document.querySelector("#swGo").click(); const perKnopf = reloads;
    note.remove(); clearSel(); __swReloadHook(null);
    return { stamp, sofort, hinweis, perKnopf };
  });
  assert(/Version [0-9a-f]{7}/.test(swu.stamp), "Fußzeile muss die Versionskennung nennen: " + swu.stamp);
  assert(swu.sofort === 1 && /Neue Version/.test(swu.hinweis) && swu.perKnopf === 2,
    "Neue Version: Leerlauf → neu laden, gezogene Prüfung → Hinweis mit Knopf: " + JSON.stringify(swu));

  // 8y) Verwaltungs-Menü als Popover (wo die Plattform es kann): Top-Layer, am Knopf
  //     verankert, Light-Dismiss/Esc schließen – der »hidden«-Zustand bleibt in beiden
  //     Fällen die Wahrheit, damit alles Bestehende weiter stimmt.
  const admin = await page.evaluate(async () => {
    const bar = document.querySelector("#adminBar"), btn = document.querySelector("#btnAdmin");
    const kann = ("popover" in HTMLElement.prototype) && CSS.supports("anchor-name: --a");
    btn.click();
    const auf = { hidden: bar.hidden, aria: btn.getAttribute("aria-expanded"), active: btn.classList.contains("active"),
      pop: bar.matches(":popover-open") };
    btn.click();
    const zu = { hidden: bar.hidden, aria: btn.getAttribute("aria-expanded") };
    let dismiss = null;
    if (kann) {                                  // Light-Dismiss/Esc muss den Zustand mitziehen
      btn.click(); await new Promise((r) => setTimeout(r, 20));
      bar.hidePopover(); await new Promise((r) => setTimeout(r, 30));
      dismiss = { hidden: bar.hidden, aria: btn.getAttribute("aria-expanded") };
    }
    return { kann, istPopover: bar.hasAttribute("popover"), auf, zu, dismiss };
  });
  assert(!admin.auf.hidden && admin.auf.aria === "true" && admin.auf.active,
    "Verwaltung: Öffnen muss Zustand + ARIA sofort setzen: " + JSON.stringify(admin));
  assert(admin.zu.hidden && admin.zu.aria === "false",
    "Verwaltung: Schließen muss Zustand + ARIA zurücksetzen: " + JSON.stringify(admin));
  assert(admin.istPopover === admin.kann,
    "Verwaltung: Popover-Modus nur wo Popover+Anchor können (sonst unveränderte Inline-Leiste): " + JSON.stringify(admin));
  if (admin.kann) {
    assert(admin.auf.pop, "Verwaltung: im Popover-Modus muss die Leiste im Top-Layer offen sein: " + JSON.stringify(admin));
    assert(admin.dismiss && admin.dismiss.hidden && admin.dismiss.aria === "false",
      "Verwaltung: Light-Dismiss/Esc muss Zustand + ARIA mitziehen: " + JSON.stringify(admin));
  }

  // 8y2) Audit: Ein Klick auf einen Menüpunkt schließt das Verwaltungs-Menü – im Popover-Modus
  //      lag es sonst im Top-Layer ÜBER dem geöffneten Dialog »Neue Art« und verdeckte die Felder.
  const admClick = await page.evaluate(async () => {
    const bar = document.querySelector("#adminBar"), btn = document.querySelector("#btnAdmin");
    btn.click(); await new Promise((r) => setTimeout(r, 20));
    const offen = !bar.hidden;
    document.querySelector("#btnAdd").click(); await new Promise((r) => setTimeout(r, 80));
    const dlg = document.querySelector("#editScrim").classList.contains("open");
    const zu = bar.hidden && !bar.matches(":popover-open") && btn.getAttribute("aria-expanded") === "false";
    const f = document.querySelector("#fGattung"); f.scrollIntoView({ block: "center" });
    const r = f.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const frei = !!top && !top.closest("#adminBar");
    document.querySelector("#editCancel").click();
    return { offen, dlg, zu, frei, treffer: top && (top.id || top.className) };
  });
  assert(admClick.offen && admClick.dlg && admClick.zu && admClick.frei,
    "Verwaltung: Menüpunkt-Klick muss das Menü schließen, der Dialog muss frei liegen: " + JSON.stringify(admClick));

  // 8y3) Audit: [hidden] gilt auch gegen .btn{display:flex} – »Aktualisieren« darf ohne
  //      geladene Prüfung nicht sichtbar sein.
  const hiddenOk = await page.evaluate(() => {
    clearSel();
    const b = document.querySelector("#exUpdate");
    return { hidden: b.hidden, display: getComputedStyle(b).display };
  });
  assert(hiddenOk.hidden && hiddenOk.display === "none",
    "[hidden] muss wirklich ausblenden (#exUpdate): " + JSON.stringify(hiddenOk));

  // 8y4) Audit: »Mischen« muss die neue Reihenfolge sofort zeigen (Aktuelle Prüfung), nicht nur drucken.
  const misch = await page.evaluate(() => {
    drawRandom();
    const lesen = () => [...document.querySelectorAll("#currentSelList .pvrow .binom")].map((e) => e.textContent.replace(/\s+/g, " ").trim());
    const vorher = lesen();
    shuffleSel();
    const nachher = lesen();
    const soll = selectedPlants().map((p) => (p.gattung + " " + p.art).replace(/\s+/g, " ").trim());
    return { n: nachher.length, passt: JSON.stringify(nachher) === JSON.stringify(soll), anders: JSON.stringify(vorher) !== JSON.stringify(nachher) };
  });
  assert(misch.n === 20 && misch.passt && misch.anders,
    "Mischen: »Aktuelle Prüfung« muss die gemischte Reihenfolge zeigen: " + JSON.stringify(misch));

  // 8y5) Audit: Excel-Import »Liste ersetzen« setzt Auswahl und geladene Prüfung zurück – die alte
  //      Auswahl verwies sonst auf die neu vergebenen IDs (fremde Arten im Bogen).
  const ersetzt = await page.evaluate(() => {
    drawRandom();
    const vorher = selection.length;
    pendingImport = [
      { gattung: "Testus", art: "primus", familie: "Testaceae", deutscher_name: "Erste Testpflanze", kategorie: "Test", zp: 1, synonyme: "", bemerkungen: "" },
      { gattung: "Testus", art: "secundus", familie: "Testaceae", deutscher_name: "Zweite Testpflanze", kategorie: "Test", zp: 0, synonyme: "", bemerkungen: "" }
    ];
    const r = document.querySelector('input[name="impmode"][value="replace"]'); if (r) r.checked = true;
    doImport();
    const out = { vorher, sel: selection.length, loaded: loadedExamId, n: cache.length,
      panel: document.querySelectorAll("#currentSelList .pvrow").length,
      update: getComputedStyle(document.querySelector("#exUpdate")).display };
    const alt = window.confirm; window.confirm = () => true;
    try { resetToDefault(); } finally { window.confirm = alt; }
    out.zurueck = cache.length;
    return out;
  });
  assert(ersetzt.vorher === 20 && ersetzt.sel === 0 && ersetzt.loaded === null && ersetzt.n === 2 && ersetzt.panel === 0 && ersetzt.update === "none",
    "Import (ersetzen): Auswahl/geladene Prüfung müssen zurückgesetzt sein: " + JSON.stringify(ersetzt));
  assert(ersetzt.zurueck > 2, "Standardliste nach dem Import-Test nicht wiederhergestellt: " + JSON.stringify(ersetzt));

  // 8y6) Audit: Druck bleibt weiß – Punktraster/Lichtkegel (Stufe 2) dürfen den amtlichen
  //      Leerbogen nicht bedrucken; die Musterlösung behält Kopf/Zebra (print-color-adjust).
  await page.emulateMediaType("print");
  const druck = await page.evaluate(() => {
    drawRandom(); buildSheet("solution");
    const cs = getComputedStyle(document.body), sh = getComputedStyle(document.querySelector("#sheet"));
    const th = document.querySelector("#sheet table.exam thead th"), tcs = th ? getComputedStyle(th) : {};
    return { bodyImg: cs.backgroundImage, bodyBg: cs.backgroundColor, sheetBg: sh.backgroundColor,
      adjust: tcs.printColorAdjust || tcs.webkitPrintColorAdjust || "", thBg: tcs.backgroundColor };
  });
  await page.emulateMediaType("screen");
  assert(druck.bodyImg === "none" && druck.bodyBg === "rgb(255, 255, 255)" && druck.sheetBg === "rgb(255, 255, 255)",
    "Druck: Hintergrund muss weiß und ohne Punktraster/Lichtkegel sein: " + JSON.stringify(druck));
  assert(druck.adjust === "exact", "Musterlösung: Tabellenkopf braucht print-color-adjust:exact: " + JSON.stringify(druck));
  await page.evaluate(() => clearSel());

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

  // 9b) Barrierefreie Touch-Bedienung (schmale/Touch-Viewports): ≥44-px-Ziele für
  // Buttons, Modus-Tabs und Profil-Auswahl, Listenzeilen ≥48 px – und die ganze
  // Zeile wählt an/ab (nicht nur die Checkbox); Aktions-Knöpfe bleiben unberührt.
  const touch = await page.evaluate(() => {
    document.querySelector("#tabExam").click();
    const h = sel => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect().height : -1; };
    const row = document.querySelector("#list .row");
    const n0 = selection.length;
    row.querySelector(".namecell").click();
    const rowToggles = selection.length !== n0;
    document.querySelector("#list .row .namecell").click();   // Zeile neu gerendert -> frisch greifen
    const backAgain = selection.length === n0;
    const inf = document.querySelector("#list .row .iconbtn.info"); if (inf) inf.click();
    const btnNoToggle = selection.length === n0;              // ℹ öffnet nur das Modal
    const sc = document.querySelector(".infoscrim"); if (sc) sc.remove();
    openGrader();
    const gmax = document.querySelector("#gMax").getBoundingClientRect().width;
    document.querySelector("#graderScrim .pclose").click();
    return { btn: h("#btnDraw"), seg: h("#tabExam"), fr: h("#frSelect"),
      row: h("#list .row"), rowToggles, backAgain, btnNoToggle, gmax: Math.round(gmax) };
  });
  for (const k of ["btn", "seg", "fr"])
    assert(touch[k] >= 43.5, "Touch-Ziel zu klein (" + k + ": " + Math.round(touch[k]) + "px, mindestens 44px erwartet)");
  assert(touch.row >= 47.5, "Listenzeile zu niedrig für Touch (" + Math.round(touch.row) + "px, mindestens 48px erwartet)");
  assert(touch.rowToggles && touch.backAgain,
    "Zeilen-Klick muss die Auswahl an-/abwählen (ganze Zeile als Trefferfläche): " + JSON.stringify(touch));
  assert(touch.btnNoToggle, "Klick auf den ℹ-Knopf darf die Auswahl nicht ändern: " + JSON.stringify(touch));
  assert(touch.gmax >= 80, "Höchstpunktzahl-Feld (#gMax) mobil zu schmal: " + touch.gmax + "px (mindestens 80px)");

  // 9c) Audit (Handy, 360 px): »Aktuelle Prüfung« zweizeilig – Name in voller Breite, ℹ nicht über
  //     dem Familiennamen, Zeilen kompakt; Listenzeilen mit Aktionen RECHTS statt dritter Zeile;
  //     Notenrechner »ab 90 %« in einer Zeile; ZP-Marker und Zähler hell UND dunkel ≥ 4,5:1.
  await page.select("#frSelect", "gemuesebau");
  await page.select("#nivSelect", "gaertner");
  await page.$eval("#frSelect", (e) => e.dispatchEvent(new Event("change")));
  await page.waitForFunction("document.querySelectorAll('#list .row').length===148", { timeout: 10000 });
  const handy = await page.evaluate(() => {
    document.querySelector("#tabExam").click();
    drawRandom();
    const rows = [...document.querySelectorAll("#currentSelList .pvrow")];
    const hoch = Math.max(...rows.map((r) => r.getBoundingClientRect().height));
    const r0 = rows[0], name = r0.querySelector(".pvname").getBoundingClientRect();
    const info = r0.querySelector(".pvacts .info").getBoundingClientRect(), fam = r0.querySelector(".fam").getBoundingClientRect();
    const overlap = !(info.right <= fam.left || info.left >= fam.right || info.bottom <= fam.top || info.top >= fam.bottom);
    const lrow = document.querySelector("#list .row");
    const lh = lrow.getBoundingClientRect().height;
    const acts = lrow.querySelector(".rowacts").getBoundingClientRect(), bin = lrow.querySelector(".binom").getBoundingClientRect();
    const actsRight = acts.left >= bin.right - 1 && acts.top < bin.bottom + 40;
    const ed = lrow.querySelector(".rowacts .iconbtn:not(.info)");
    const edExam = getComputedStyle(ed).display;                       // »Prüfung erstellen«: nur ℹ
    document.querySelector("#tabManage").click();
    const edManage = { display: getComputedStyle(ed).display, opacity: getComputedStyle(ed).opacity };
    document.querySelector("#tabExam").click();
    openGrader();
    const pct = document.querySelector("#gTable td.pct");
    const pctRow = pct.closest("tr").getBoundingClientRect().height, nowrap = getComputedStyle(pct).whiteSpace === "nowrap";
    document.querySelector("#graderScrim .pclose").click();
    const lum = c => { const m = (c.match(/\d+(\.\d+)?/g) || [255, 255, 255]).map(Number);
      const f = v => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
      return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
    const bgOf = el => { for (let p = el; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor;
      if (c && !/rgba?\(0, 0, 0, 0\)/.test(c) && c !== "transparent") return c; } return "rgb(255,255,255)"; };
    const ratio = el => { if (!el) return -1; const a = lum(getComputedStyle(el).color), b = lum(bgOf(el));
      return Math.round((Math.max(a, b) + .05) / (Math.min(a, b) + .05) * 100) / 100; };
    const zp = document.querySelector("#list .tag.zp"), cnt = document.querySelector("#list .cathead .cnt");
    const hell = { zp: ratio(zp), cnt: ratio(cnt) };
    const prev = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = "dark";
    const dunkel = { zp: ratio(zp), cnt: ratio(cnt) };
    if (prev) document.documentElement.dataset.theme = prev; else delete document.documentElement.dataset.theme;
    clearSel();
    return { hoch, nameW: Math.round(name.width), overlap, lh, actsRight, edExam, edManage, pctRow, nowrap, hell, dunkel };
  });
  assert(handy.edExam === "none" && handy.edManage.display !== "none" && handy.edManage.opacity === "1",
    "Handy: Bearbeiten/Löschen nur in »Liste verwalten« – dort aber sichtbar (nicht opacity 0): " + JSON.stringify(handy));
  assert(!handy.overlap && handy.nameW >= 200 && handy.hoch <= 190,   // 360 px: längster Name 3 Zeilen + Aktionszeile (vorher 200–300 px bei 390 px)
    "Handy: »Aktuelle Prüfung« muss zweizeilig und ohne Überlappung sein: " + JSON.stringify(handy));
  assert(handy.actsRight && handy.lh <= 110,
    "Handy: Listenzeile – Aktionen rechts neben dem Namen, Zeile kompakt: " + JSON.stringify(handy));
  assert(handy.nowrap && handy.pctRow <= 64,
    "Handy: Notenrechner »ab … %« muss in einer Zeile bleiben: " + JSON.stringify(handy));
  assert(handy.hell.zp >= 4.5 && handy.dunkel.zp >= 4.5 && handy.hell.cnt >= 4.5 && handy.dunkel.cnt >= 4.5,
    "ZP-Marker/Zähler müssen hell und dunkel ≥4,5:1 haben: " + JSON.stringify(handy));

  // 9d) Audit (Barrierefreiheit): jedes Formularfeld hat einen zugänglichen Namen (label[for]/aria-label),
  //     die Notengrenzen tragen aria-label, Dialog-Köpfe/-Füße sind keine Landmarken (kein header/footer
  //     im Modal), Hilfe-Überschriften ohne Sprung (h3 statt h4), Suche/Liste/Prüfung liegen in <main>.
  const a11y = await page.evaluate(() => {
    openGrader();
    const named = el => !!(el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")
      || (el.id && document.querySelector('label[for="' + el.id + '"]')) || el.closest("label"));
    const fields = [...document.querySelectorAll('#q, #graderScrim input, #schemaScrim input, #schemaScrim select, #editScrim input, #editScrim select, #editScrim textarea, #settingsScrim input, #settingsScrim textarea')];
    const unnamed = fields.filter(el => !named(el)).map(el => el.id || el.className);
    const gedge = [...document.querySelectorAll("#gTable .gedge")];
    const gedgeNamed = gedge.length === 5 && gedge.every(i => /Note \d/.test(i.getAttribute("aria-label") || ""));
    document.querySelector("#graderScrim .pclose").click();
    return { unnamed, gedgeNamed,
      landmarksInModals: document.querySelectorAll(".modal header, .modal footer").length,
      h4: document.querySelectorAll("#helpPanel h4").length, h3: document.querySelectorAll("#helpPanel h3").length,
      mains: document.querySelectorAll("main").length,
      inMain: !!document.querySelector("main #q") && !!document.querySelector("main #list") && !!document.querySelector("main #currentSel") };
  });
  assert(a11y.unnamed.length === 0 && a11y.gedgeNamed, "Felder ohne zugänglichen Namen: " + JSON.stringify(a11y));
  assert(a11y.landmarksInModals === 0 && a11y.h4 === 0 && a11y.h3 >= 5 && a11y.mains === 1 && a11y.inMain,
    "Struktur: keine Landmarken in Dialogen, h3 in der Hilfe, genau ein <main> mit Suche/Liste/Prüfung: " + JSON.stringify(a11y));

  // 9e) Audit-Paket 4 (Prüfungswerkzeug): Anzahl-Feld, Notengrenzen editieren, echter Excel-Import mit
  //     Konverter-Normalisierung (SheetJS erst beim Import geladen), Sicherung mit defektem Schema,
  //     Quota-Fallback, flushPersist vor Profilwechsel, »(Kopie)« nur einmal, esc('), Kopf-Umschalter, <h1>, CSP.
  const p4 = await page.evaluate(async () => {
    const out = {}, stub = fn => { const alt = window.confirm; window.confirm = () => true; try { fn(); } finally { window.confirm = alt; } };
    const dc = document.querySelector("#drawCount");
    dc.value = "-5"; drawRandom(); out.neg = selection.length;
    dc.value = "0"; drawRandom(); out.nul = selection.length;
    dc.value = "3"; drawRandom(); out.drei = selection.length;
    dc.value = ""; clearSel(); out.soll = drawTarget();
    openGrader();
    const g = document.querySelector('#gTable .gedge[data-i="0"]');
    g.value = "95"; g.dispatchEvent(new Event("change"));
    out.lin0 = scaleCfg.lin[0];
    flushPersist();                                                    // das Speichern ist um 300 ms verzögert
    const stored = JSON.parse(store.get("pflanzenkenntnis.data." + profileId) || "{}");
    out.linSaved = !!(stored.schema && stored.schema.scale && stored.schema.scale.lin && stored.schema.scale.lin[0] === 95);
    g.value = "90"; g.dispatchEvent(new Event("change"));
    document.querySelector("#graderScrim .pclose").click();
    out.xlsxBefore = typeof XLSX; out.ensure = ensureXLSX(); out.xlsxAfter = typeof XLSX;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Nr.", "Botanischer Name", "Familie", "Deutscher Name", "ZP"],
      ["1", "Prunus cerasifera `Nigra´", "Rosaceae", "Blutpflaume", ""],
      ["Bei-, Wild- oder Unkräuter", "", "", "", ""],                 // Rubrik-Zeile wie in den amtlichen Listen (nur Spalte A)
      ["2", "Taraxacum officinale", "Asteraceae", "Löwenzahn", "ZP"]]), "Liste");
    const recs = parseWorkbook(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    out.recs = recs.map(r => [r.gattung, r.art, r.kategorie, r.zp]);
    let err = null;
    try {
      applyBackup({ v: 2, profile: profileId, plants: [{ id: 1, gattung: "Testus", art: "unus", familie: "Testaceae", deutscher_name: "Test" }],
        schema: { cols: [{ key: "foo", pts: "x" }], anzahl: -3, scale: { mode: "ihk", lin: [1, 2, 3] } },
        exams: [{ id: "dup1", date: "2026-01-01", label: "A", plants: [], schema: {} }, { id: "dup1", date: "2026-01-02", label: "B", plants: [], schema: {} }] });
    } catch (e) { err = String(e); }
    out.backupErr = err; out.schemaCols = schema.cols.map(c => c.key).join(","); out.schemaAnzahl = schema.anzahl; out.lin = scaleCfg.lin.join(",");
    out.examsDedup = exams.length; exams = []; saveExams();
    stub(resetToDefault); out.restored = cache.length > 2;
    const origSet = Storage.prototype.setItem; let fails = 1;
    Storage.prototype.setItem = function (k, v) { if (fails-- > 0) { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; } return origSet.call(this, k, v); };
    out.q1 = store.set("pflanzenkenntnis.__q", "a"); out.q2 = store.set("pflanzenkenntnis.__q", "b");
    Storage.prototype.setItem = origSet;
    out.qPersistent = store.persistent; out.qValue = localStorage.getItem("pflanzenkenntnis.__q"); localStorage.removeItem("pflanzenkenntnis.__q");
    const oldId = profileId, otherId = oldId === "gemuesebau_gaertner" ? "baumschule_gaertner" : "gemuesebau_gaertner";
    cache.push({ id: nextId++, gattung: "Flushus", art: "testus", familie: "F", deutscher_name: "", kategorie: "", zp: 0, synonyme: "", bemerkungen: "" }); markDirty();
    switchProfile(otherId);
    out.flushed = /Flushus/.test(store.get("pflanzenkenntnis.data." + oldId) || "");
    switchProfile(oldId); stub(resetToDefault); localStorage.removeItem("pflanzenkenntnis.data." + otherId);
    exams.unshift({ id: "kop1", date: "2026-01-01", label: "Test (Kopie)", plants: [], schema: {}, fr: "", niveau: "" });
    copyExam("kop1"); out.kopie = exams[0].label; exams = []; saveExams();
    out.esc = esc("a'b\"c");
    out.toggleHead = !!document.querySelector(".mast-right .themetoggle"); out.toggleAdmin = !!document.querySelector("#adminBar .themetoggle");
    out.h1 = /\u00a0·/.test(document.querySelector(".masthead h1").textContent);
    out.csp = !!document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return out;
  });
  assert(p4.neg === p4.soll && p4.nul === p4.soll && p4.drei === 3, "Anzahl-Feld: negativ/0 → Profil-Soll, 3 → 3: " + JSON.stringify(p4));
  assert(p4.lin0 === 95 && p4.linSaved, "Notengrenzen editieren muss übernehmen und speichern: " + JSON.stringify(p4));
  assert(p4.xlsxBefore === "undefined" && p4.ensure && p4.xlsxAfter !== "undefined", "SheetJS darf erst beim Import ausgewertet werden: " + JSON.stringify(p4));
  assert(JSON.stringify(p4.recs) === JSON.stringify([["Prunus", "cerasifera 'Nigra'", "", 0], ["Taraxacum", "officinale", "Wild- & Beikräuter", 1]]),
    "Excel-Import muss wie der Konverter normalisieren (Apostrophe, Beikraut-Kategorie): " + JSON.stringify(p4.recs));
  assert(p4.backupErr === null && p4.schemaCols === "gattung,art,familie,deutscher_name" && p4.schemaAnzahl === 20 && p4.lin === "90,70,50,30,10" && p4.examsDedup === 1 && p4.restored,
    "Sicherung mit defektem Schema: kein Fehler, Standard greift, doppelte Prüfungen raus: " + JSON.stringify(p4));
  assert(p4.q1 === false && p4.q2 === true && p4.qPersistent && p4.qValue === "b", "Quota-Fallback: ein voller Speicher darf localStorage nicht dauerhaft abschalten: " + JSON.stringify(p4));
  assert(p4.flushed, "flushPersist: Änderung vor dem Profilwechsel muss gespeichert sein: " + JSON.stringify(p4));
  assert(p4.kopie === "Test (Kopie)" && p4.esc === "a&#39;b&quot;c", "Kopie-Suffix nur einmal, esc maskiert ': " + JSON.stringify(p4));
  assert(p4.toggleHead && !p4.toggleAdmin && p4.h1 && p4.csp, "Kopf-Umschalter, <h1> mit geschütztem Leerzeichen, CSP-Meta: " + JSON.stringify(p4));

  // 9f) CSP wirkt: fremde Skripte/Bilder werden geblockt, Wikipedia/Commons (JSONP + Bilder) nicht.
  const cp = await browser.newPage();                 // eigene Seite: die erwarteten CSP-/Netz-Meldungen gehören nicht in die Konsolenfehler des Hauptlaufs
  await cp.goto(FILE, { waitUntil: "load" });
  await cp.waitForFunction("window.pickExcel!=null");
  const csp = await cp.evaluate(() => new Promise((resolve) => {
    window.__cspProbe = window.__cspProbe2 = () => {};
    const viol = [];
    document.addEventListener("securitypolicyviolation", (e) => viol.push(e.blockedURI + " [" + e.effectiveDirective + "]"));
    const add = (tag, src) => { const el = document.createElement(tag); el.onerror = () => {}; el.src = src; document.head.appendChild(el); };
    add("script", "https://de.wikipedia.org/w/api.php?action=query&format=json&callback=__cspProbe");
    add("script", "https://commons.wikimedia.org/w/api.php?action=query&format=json&callback=__cspProbe2");
    add("img", "https://upload.wikimedia.org/wikipedia/commons/thumb/x/y/Z.jpg/960px-Z.jpg");
    add("img", "https://thumb.wikimedia.org/wikipedia/commons/thumb/x/y/Z.jpg/960px-Z.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail");   // neuer Thumbnail-Host (Wikimedia 2026)
    add("img", "https://neu.wikimedia.org/x.jpg");                                             // ein künftiger Host unter wikimedia.org darf nicht brechen
    add("script", "https://example.com/fremd.js");
    add("img", "https://example.com/fremd.png");
    const meta = (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || "";
    setTimeout(() => resolve({ viol, meta }), 500);
  }));
  await cp.close();
  assert(csp.viol.some(v => /example\.com.*script/.test(v)) && csp.viol.some(v => /example\.com.*img/.test(v)), "CSP muss fremde Skripte/Bilder blocken: " + JSON.stringify(csp.viol));
  assert(!csp.viol.some(v => /wikipedia|wikimedia/.test(v)), "CSP darf Wikipedia/Commons (JSONP + Bilder, auch thumb.wikimedia.org) nicht blocken: " + JSON.stringify(csp.viol));
  assert(/img-src[^;]*https:\/\/\*\.wikimedia\.org/.test(csp.meta) && /img-src[^;]*https:\/\/\*\.wikipedia\.org/.test(csp.meta),
    "CSP img-src muss *.wikimedia.org/*.wikipedia.org pauschal erlauben (Host-Umzug upload → thumb): " + csp.meta);

  // 10) Rechtliches (Audit): <main>, kein Link auf die eingestellte ODR-Plattform, keine »Startseite«,
  //     Datenschutz nennt pbw.theme, den gespeicherten Duell-Namen und WhatsApp/wa.me;
  //     Design-Knopf und »zurück« sind ≥44 px (Handy).
  const rp = await browser.newPage();
  const rerrs = []; rp.on("pageerror", (e) => rerrs.push(e.message));
  await rp.setViewport({ width: 360, height: 720, deviceScaleFactor: 1 });
  await rp.goto("file://" + path.join(ROOT, "dist", "rechtliches.html"), { waitUntil: "load" });
  const recht = await rp.evaluate(() => {
    const t = document.body.textContent, h = sel => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect().height : -1; };
    return { main: document.querySelectorAll("main").length, inMain: !!document.querySelector("main #datenschutz"),
      odr: /consumers\/odr/.test(document.documentElement.innerHTML), start: /Startseite/.test(t),
      theme: /pbw\.theme/.test(t), name: /pflanzenlernen\.name/.test(t), wa: /WhatsApp/.test(t) && /wa\.me/.test(t),
      vsbg: /§ 36 VSBG/.test(t), btn: h("#btnTheme"), back: h(".back"), csp: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]') };
  });
  await rp.close();
  assert(rerrs.length === 0, "Rechtliches: Konsolenfehler: " + rerrs.join(" | "));
  assert(recht.main === 1 && recht.inMain && !recht.odr && !recht.start && recht.theme && recht.name && recht.wa && recht.vsbg,
    "Rechtliches: <main>, ODR raus, keine Startseite, Datenschutz vollständig: " + JSON.stringify(recht));
  assert(recht.btn >= 43.5 && recht.back >= 43.5 && recht.csp, "Rechtliches: Design-Knopf/»zurück« ≥44 px + CSP-Meta erwartet: " + JSON.stringify(recht));

  assert(errs.length === 0, "Konsolenfehler im Testverlauf: " + errs.join(" | "));
  await browser.close();
  console.log("Smoke-Test OK – Boot, Modul-Modals (öffnen/×/Esc, aktive Buttons), Hilfe + Tooltips, Profilwechsel (148/248), Schema-Matrix, Ziehen, Bogen (offizielle Formulare), Druck-Dialog speichert/aktualisiert Prüfung, Prüfungen (speichern/laden/kopieren/aktualisieren), Prüfungs-JSON-Import (Gerätewechsel), Sicherung mit Profilwechsel, Einstellungen, Vorschau, Info-Karte (ℹ in Liste + Aktueller Prüfung: Namensherleitung, Deep-Links, opt-in Wikipedia, ×/Esc), Persistenz, Mobile-Kopf, Touch-Ziele (≥44px, Zeile wählt an/ab, #gMax breit genug), Bild-Lightbox (Galerie: Pfeile, Zähler, Wischen), Verwaltung als Popover (Top-Layer, Light-Dismiss).");
}

main().catch((e) => { console.error("Smoke-Test FEHLGESCHLAGEN:\n  " + e.message); process.exit(1); });
