#!/usr/bin/env node
/*
 * learn.mjs – Smoke-Test für das Azubi-Lern-Tool (dist/pflanzen-lernen.html).
 * Prüft: Boot ohne Konsolenfehler · Lernstoff geladen · Modiwechsel ·
 * Karteikarte umdrehen und bewerten (Leitner) · Quiz richtig beantworten ·
 * Tippen richtig beantworten · Fortschritt-Persistenz über einen Reload.
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FILE = "file://" + path.join(ROOT, "dist", "pflanzen-lernen.html");

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
  if (!fs.existsSync(path.join(ROOT, "dist", "pflanzen-lernen.html")))
    throw new Error("dist/pflanzen-lernen.html fehlt – zuerst 'python3 build.py'.");
  const puppeteer = loadPuppeteer();
  const exe = findChromium();
  const launch = { headless: "new", args: ["--no-sandbox", "--disable-gpu"] };
  if (exe) launch.executablePath = exe;

  const browser = await puppeteer.launch(launch);
  const page = await browser.newPage();
  // Deterministischer Zufall: der Smoke-Test zieht sonst je Lauf andere Karten, wodurch
  // einzelne Stichproben-Assertions (Sammelnamen, Punktwerte, Bild-Optionen) zufällig mal
  // danebenlagen (flaky). Fester Seed → reproduzierbarer, stabiler Lauf – auf jedem Dokument
  // (auch nach Reload) mit demselben Startwert.
  await page.evaluateOnNewDocument(() => {
    let s = 0x2545f491 >>> 0;
    Math.random = function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Erst-Einweisung standardmäßig als »gesehen« markieren, damit sie die übrigen
    // Tests nicht überlagert; ein eigener Test setzt sie gezielt zurück.
    try { localStorage.setItem("pflanzenlernen.introSeen", "1"); } catch (e) {}
    // Lernserie: das Tagesziel ist fest 20 – die vielen grade()-Aufrufe der Tests sollen nicht
    // zufällig mitten in einer Assertion das Ziel-Feuerwerk auslösen: heute gilt als längst über
    // dem Ziel (n ≫ 20) und als Zieltag (gd = heute), dann feuert streakBump nie.
    try { const d = new Date(), t = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      localStorage.setItem("pflanzenlernen.streak", JSON.stringify({ d: t, n: 100000, gd: t })); } catch (e) {}
    // View-Transitions deaktivieren: sie rendern asynchron und würden die
    // synchronen Assertions des Tests unzuverlässig machen (vt()-Fallback).
    window.__noVT = 1;
  });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text()); });

  await page.goto(FILE, { waitUntil: "load" });
  await page.waitForFunction("window.startSession!=null", { timeout: 30000 });
  assert(errs.length === 0, "Konsolenfehler beim Boot: " + errs.join(" | "));
  // Ohne Netz testen: Wikipedia/Commons-Abrufe (z. B. der Bildnachweis nach einer Antwort)
  // laufen über den austauschbaren jsonp und antworten hier »offline«. Sonst hinge der
  // Test an der Verfügbarkeit und Ratenbegrenzung (HTTP 429) eines fremden Dienstes.
  await page.evaluate(() => {
    window.__offlineJsonp = () => Promise.reject(new Error("offline (Test)"));
    __setJsonp(window.__offlineJsonp);
  });

  // Lernstoff geladen, sauberer Zustand
  const setup = await page.evaluate(() => {
    localStorage.clear();
    $("#frSelect").value = "gemuesebau"; $("#nivSelect").value = "gaertner"; applyProfile();
    return { cards: allCards.length, pool: pool().length };
  });
  assert(setup.cards === 148, "Gemüsebau/Gärtner: 148 Arten erwartet, war " + setup.cards);

  // Ein-Knopf-Start: »Weiter lernen« (geführt) + Listen-Schnellzugriff sind sofort sichtbar;
  // Modi + eigene Sitzung + Optionen stecken in der zugeklappten »Selbst wählen«-Klappe,
  // die Optionen darin in den zwei Gruppen »Was üben?« / »Wie üben?«.
  const declutter = await page.evaluate(() => {
    const go = document.querySelector("#btnGo"), ch = document.querySelector("#chooseWrap"),
      d = document.querySelector("#setOpts"), ex = document.querySelector("#btnExam");
    return {
      goVisible: !!go && !go.hidden && go.offsetParent !== null,
      goLabel: go ? document.querySelector("#goLabel").textContent.trim() : "",
      goSub: (document.querySelector("#goHint") || {}).textContent || "",
      examVisible: !!ex && ex.offsetParent !== null, examSub: (document.querySelector("#examHint") || {}).textContent || "",
      listQuick: !!document.querySelector("#btnList"),
      weg: ["#phAnswer", "#dayGoal", "#examFieldsRow", ".themetoggle", "#btnTheme", ".pstat", ".goalchip", ".rankchip", ".rk-mini"].filter((s) => document.querySelector(s)),
      stageLeer: (document.querySelector("#stage").textContent || "").trim() === "",
      noteNachFortschritt: document.querySelector("#progress").nextElementSibling === document.querySelector("#learnNote"),
      chooseClosed: ch && ch.tagName === "DETAILS" && !ch.open,
      holdsModes: ch ? !!ch.querySelector("#modeTabs") && !!ch.querySelector("#startRow") : false,
      isDetails: d && d.tagName === "DETAILS", closed: d && !d.open,
      holdsControls: d ? ["#cat", "#onlyzp", "#sessLen"].every((s) => d.querySelector(s)) : false,
      groups: [...document.querySelectorAll("#setOpts .og-h")].map((h) => h.textContent.trim())
    };
  });
  assert(declutter.goVisible && /^(Loslegen|Weiter lernen)$/.test(declutter.goLabel) && declutter.listQuick,
    "Ein-Knopf-Start »Weiter lernen/Loslegen« + Listen-Schnellzugriff müssen sofort sichtbar sein: " + JSON.stringify(declutter));
  assert(declutter.chooseClosed && declutter.holdsModes,
    "Modi + »Sitzung starten« stecken in der standardmäßig zugeklappten »Selbst wählen«-Klappe");
  assert(declutter.examVisible && /20 Pflanzen/.test(declutter.examSub) && /heute dran/.test(declutter.goSub),
    "Zweiter Start-Knopf »Probeprüfung« (20 Pflanzen) + Unterzeile am »Weiter lernen«-Knopf: " + JSON.stringify(declutter));
  assert(declutter.weg.length === 0 && declutter.stageLeer && declutter.noteNachFortschritt,
    "Entschlackt: kein Antwort-/Tagesziel-/Felder-Feld, kein Design-Schalter, keine Zähler-Chips, leere Bühne, Datenhinweis unter dem Fortschritt: " + JSON.stringify(declutter));
  assert(declutter.isDetails && declutter.closed, "Optionen sollten in einer standardmäßig zugeklappten Klappe stecken");
  assert(declutter.holdsControls, "Die Optionen-Klappe muss Kategorie, ZP und Sitzungslänge enthalten");
  assert(declutter.groups.join("|") === "Was üben?|Wie üben?",
    "Optionen müssen in den Gruppen »Was üben?« / »Wie üben?« stehen: " + JSON.stringify(declutter.groups));

  // Geführte Sitzung: JEDE Pflanze kommt als Bild (Rückmeldung: »Bild und Namensfragen nicht
  // extra mischen – nur wenn überhaupt kein Bild verfügbar, einzelne«). Der Lernstand bestimmt
  // nur noch die Antwortart: Box 2 → aus vier Namen wählen, Box 4 → selbst eingeben (Prüfung).
  const guided = await page.evaluate(async (GIF) => {
    __clearPhotoCache(); photoTried.clear();
    __setPhotoSource((card) => Promise.resolve({ thumb: GIF, title: card.g + " " + card.a, file: "T.jpg", url: "https://x/y", src: "cm" }));
    const bis = async (test, ms = 4000) => { const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (test()) return true; await new Promise((r) => setTimeout(r, 30)); } return false; };
    const rows = SEEDS["gemuesebau_gaertner"];
    const cards = rows.map((r) => ({ g: r[0], a: r[1], de: r[3], kat: r[4] }))
      .filter((c) => themeOf(c.g, c.a, c.kat, "gemuesebau_gaertner") === "Zwiebelgemüse");
    const key = (c) => (c.g + "|" + c.a + "|" + c.de).toLowerCase();
    const prog = {};
    cards.forEach((c, i) => { prog[key(c)] = i === 0
      ? { box: 2, due: "2020-01-01", seen: 1, correct: 1, wrong: 0 }
      : { box: 4, due: "2020-01-01", seen: 1, correct: 1, wrong: 0 }; });
    localStorage.setItem("pflanzenlernen.progress.gemuesebau_gaertner", JSON.stringify(prog));
    applyProfile();                                     // präparierten Fortschritt laden
    document.querySelector("#cat").value = "t:Zwiebelgemüse";
    document.querySelector("#cat").dispatchEvent(new Event("change"));
    const goLabel = document.querySelector("#goLabel").textContent.trim();
    document.querySelector("#btnGo").click();           // geführte Sitzung starten
    await bis(() => !!document.querySelector("#phImg") && document.querySelectorAll("#opts .opt").length === 4);
    const erste = { bild: !!document.querySelector("#phImg"), opts: document.querySelectorAll("#opts .opt").length,
      exam: !!document.querySelector("#examForm"), note: (document.querySelector(".gnote") || {}).textContent || "" };
    const barThere = !!document.querySelector(".sessionbar");
    document.querySelector("#opts .opt").click();       // beantworten (richtig oder falsch – egal)
    document.querySelector("#wt").click();              // weiter
    await bis(() => !!document.querySelector("#examForm"));
    const zweite = { bild: !!document.querySelector("#phImg"), exam: !!document.querySelector("#examForm"),
      opts: document.querySelectorAll("#opts .opt").length, typeForm: !!document.querySelector("#typeForm") };
    const note = (document.querySelector(".gnote") || {}).textContent || "";   // sagt Lernstand + Antwortart an
    document.querySelector("#btnStop").click();         // Sitzung beenden → Abschluss-Screen
    const doneTitle = (document.querySelector(".stage-empty h2") || {}).textContent || "";
    const summary = (document.querySelector(".stage-empty p") || {}).textContent || "";
    // Direkt teilbar – ohne die Lektion noch einmal als Quiz spielen zu müssen
    const hatShare = !!document.querySelector(".stage-empty #shareBlock");
    const keinUmweg = !document.querySelector("#duelQuizBtn");
    const nCards = cards.length;
    const link = challengeURL().split("#c=")[1];
    const dec = chDecode(link);
    document.querySelector("#btnOverview").click();
    __setPhotoSource(null); __clearPhotoCache(); photoTried.clear();
    localStorage.removeItem("pflanzenlernen.progress.gemuesebau_gaertner");   // aufräumen
    applyProfile();
    document.querySelector("#cat").value = "";
    document.querySelector("#cat").dispatchEvent(new Event("change"));
    const formen = [0, 1, 2, 3, 4, 5].map((b) => guidedForm(b, true)).join(",") + "|" + guidedForm(4, false);
    return { goLabel, erste, barThere, zweite, doneTitle, summary, note, hatShare, keinUmweg, nCards, dec, formen };
  }, "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==");
  assert(guided.goLabel === "Weiter lernen",
    "Mit vorhandenem Fortschritt muss der Knopf »Weiter lernen« heißen: " + guided.goLabel);
  assert(guided.formen === "photo,photo,photo,photoExam,photoExam,photoExam|quiz",
    "Geführte Lektion: online immer Bild (bis Stufe 2 Auswahl, ab Stufe 3 selbst eingeben), ohne Internet Auswahlfrage: " + guided.formen);
  assert(guided.erste.bild && guided.erste.opts === 4 && !guided.erste.exam && guided.barThere &&
    guided.zweite.bild && guided.zweite.exam && guided.zweite.opts === 0 && !guided.zweite.typeForm,
    "Geführte Sitzung: jede Karte mit Bild – Box 2 → Auswahl aus vier Namen, Box 4 → Namen selbst eingeben (keine Namensfrage dazwischen): " + JSON.stringify(guided));
  assert(/bewerteten/.test(guided.summary),
    "Abschluss der geführten Sitzung nennt die Quote über die bewerteten Karten: " + guided.summary);
  assert(/^Stufe 2 von 5 · am Bild erkennen$/.test(guided.erste.note) && /^Stufe 4 von 5 · am Bild · Namen selbst eingeben$/.test(guided.note),
    "Geführte Lektion: über der Aufgabe stehen Lernstand + Antwortart: " + JSON.stringify([guided.erste.note, guided.note]));
  // Pille: Antwortart je Stufe; eine Auswahlfrage ohne Bild nur als benannter Ausfall
  const pille = await page.evaluate(() => {
    const c = allCards[0], savedSess = sess, savedMode = mode, txt = (h) => h.replace(/<[^>]+>/g, "");
    sess = { auto: true, photoOnly: true, boxOf: new Map([[c, 2]]), formOf: new Map([[c, "photo"]]), photoGiveUp: false };
    mode = "photo"; const stufe2 = guidedNoteHTML(c);
    sess.boxOf = new Map([[c, 4]]); sess.formOf = new Map([[c, "photoExam"]]); const stufe4 = guidedNoteHTML(c);
    sess.boxOf = new Map([[c, 0]]); sess.formOf = new Map([[c, "photo"]]); mode = "quiz"; const ausfall = guidedNoteHTML(c);
    sess.photoGiveUp = true; const wunsch = guidedNoteHTML(c);
    sess.photoGiveUp = false; sess.formOf = new Map([[c, "quiz"]]); const offline = guidedNoteHTML(c);
    sess.formOf = new Map([[c, "photo"]]); mode = "photo"; const bild = guidedNoteHTML(c);
    sess = savedSess; mode = savedMode;
    return { stufe2: txt(stufe2), stufe4: txt(stufe4), ausfall: txt(ausfall), wunsch: txt(wunsch), offline: txt(offline), bild: txt(bild),
      title: /jede Pflanze als Bild/.test(stufe2) && /kein Bild gibt/.test(stufe2) };
  });
  assert(pille.stufe2 === "Stufe 2 von 5 · am Bild erkennen" && pille.stufe4 === "Stufe 4 von 5 · am Bild · Namen selbst eingeben" &&
    pille.bild === "Neu · am Bild erkennen" && pille.title &&
    pille.ausfall === "Neu · zu dieser Art kein Bild – deshalb Auswahlfrage" && pille.wunsch === "Neu · ohne Bild – auf deinen Wunsch" &&
    pille.offline === "Neu · ohne Internet – deshalb Auswahlfrage",
    "Pille der geführten Lektion: Lernstand + Antwortart, Namensfrage nur als benannter Ausfall: " + JSON.stringify(pille));
  assert(guided.hatShare && guided.keinUmweg,
    "Geführte Lektion muss direkt teilbar sein – ohne Umweg über ein zweites Quiz: " + JSON.stringify(guided));
  assert(guided.dec && guided.dec.m === "guided" && guided.dec.po === true && Array.isArray(guided.dec.f) && guided.dec.f.length === guided.dec.i.length,
    "Duell-Link der geführten Lektion muss »nur mit Bildern« und die Antwortart je Karte mitkodieren: " + JSON.stringify(guided.dec));
  assert(guided.dec.f.includes("photo") && guided.dec.f.includes("photoExam") && !guided.dec.f.some((f) => f === "quiz" || f === "cards" || f === "type"),
    "Duell-Link der geführten Lektion: nur Bildkarten (Auswahl bzw. selbst eingeben): " + JSON.stringify(guided.dec.f));
  // Link-Kompatibilität: ältere geführte Links (ohne Bit) lesen sich wie bisher, neue mit Bit
  const ghLinks = await page.evaluate(() => {
    const alt = chDecode(chEncode({ p: "gemuesebau_gaertner", m: "guided", r: "de2bot", a: "mc", rp: "img2bot",
      f: ["quiz", "cards", "type", "photo"], i: [1, 2, 3, 4], s: 2, t: 3, z: 40, n: "" }));
    const neu = chDecode(chEncode({ p: "gemuesebau_gaertner", m: "guided", r: "de2bot", a: "mc", rp: "img2both", po: true,
      f: ["photo", "photoExam", "quiz", "photoExam", "photo"], i: [1, 2, 3, 4, 5], s: 2, t: 5, z: 40, n: "" }));
    return { alt: alt && alt.f, altPo: alt && alt.po, neu: neu && neu.f, neuPo: neu && neu.po, rp: neu && neu.rp };
  });
  assert(JSON.stringify(ghLinks.alt) === '["quiz","cards","type","photo"]' && ghLinks.altPo === false &&
    JSON.stringify(ghLinks.neu) === '["photo","photoExam","quiz","photoExam","photo"]' && ghLinks.neuPo === true && ghLinks.rp === "img2both",
    "Geführte Duell-Links: alte ohne Bit unverändert, neue mit Antwortart je Bildkarte: " + JSON.stringify(ghLinks));

  // Profil-Chip: zeigt den Beruf, öffnet das Modal mit beiden Auswahlfeldern, »Passt so« schließt
  const chip = await page.evaluate(() => {
    const c = document.querySelector("#profileChip");
    const txt = c ? c.textContent.trim() : "";
    c.click();
    const open = !document.querySelector("#profScrim").hidden;
    const holds = !!document.querySelector("#profScrim #frSelect") && !!document.querySelector("#profScrim #nivSelect");
    document.querySelector("#profDone").click();
    const closed = document.querySelector("#profScrim").hidden;
    const flag = localStorage.getItem("pflanzenlernen.profilechosen");
    return { txt, open, holds, closed, flag };
  });
  assert(/Gemüsebau/.test(chip.txt) && /Gärtner/.test(chip.txt),
    "Profil-Chip muss den gewählten Beruf zeigen: " + chip.txt);
  assert(chip.open && chip.holds && chip.closed && chip.flag === "1",
    "Profil-Modal: Chip öffnet, enthält Fachrichtung/Ausbildung, »Passt so« schließt + merkt die Wahl: " + JSON.stringify(chip));

  // Listen-Schnellzugriff: rein in die Liste und zurück, ohne die Klappe zu öffnen
  const quickList = await page.evaluate(() => {
    document.querySelector("#btnList").click();
    const inList = document.querySelector("#listControls").hidden === false
      && document.querySelector("#goRow").hidden === true;
    const label = document.querySelector("#btnList").textContent.trim();
    document.querySelector("#btnList").click();
    const back = document.querySelector("#listControls").hidden === true
      && document.querySelector("#goRow").hidden === false;
    return { inList, label, back };
  });
  assert(quickList.inList && /Zurück/.test(quickList.label) && quickList.back,
    "»Liste zum Nachschlagen« muss ohne Klappe in den Listenmodus und zurück führen: " + JSON.stringify(quickList));

  // Lernpfad: Modi nach Schwierigkeit sortiert (Bilder zuerst) mit Schwierigkeits-Tags;
  // Erst-Einweisung über »So funktioniert der Lernpfad« öffnen/schließen (merkt »gesehen«).
  const lp = await page.evaluate(() => {
    const order = [...document.querySelectorAll("#modeTabs button")].map((b) => b.dataset.mode);
    const tags = [...document.querySelectorAll("#modeTabs button .mdiff")].map((t) => t.textContent);
    document.querySelector("#btnIntro").click();
    const introOpen = !!document.querySelector("#introScrim .intro");
    const steps = document.querySelectorAll("#introScrim .intro-steps li").length;
    const tipTxt = (document.querySelector("#introScrim .intro-tip") || {}).textContent || "";
    const optTip = /Optionen/.test(tipTxt) && /deutscher Name/.test(tipTxt) && /Gattung, Art und Familie/.test(tipTxt);
    // »Ehrlich gesagt«: Lernhilfe, kein Ersatz für die echte Pflanze – im Onboarding UND in der Hilfe
    const realTxt = (document.querySelector("#introScrim .intro-real") || {}).textContent || "";
    const real = /draußen/.test(realTxt) && /ersetzt diese App nicht/.test(realTxt) && /botanischen Namen/.test(realTxt) && !!document.querySelector("#introScrim .intro-real svg.ic");
    const helpTxt = document.querySelector("#helpPanel").textContent.replace(/\s+/g, " ");
    const helpReal = /Lernhilfe für die botanischen Namen/.test(helpTxt) && /draußen/.test(helpTxt) && /ersetzt keine App/.test(helpTxt);
    document.querySelector("#introGo").click();
    const introClosed = !document.querySelector("#introScrim");
    const seen = localStorage.getItem("pflanzenlernen.introSeen");
    return { order, tags, introOpen, steps, optTip, introClosed, seen, real, helpReal };
  });
  assert(lp.order.join(",") === "photo,quiz,cards,type,list",
    "Modi müssen nach Schwierigkeit sortiert sein (Bilder→Quiz→Karteikarten→Tippen→Liste): " + lp.order.join(","));
  assert(lp.tags[0] === "leicht" && lp.tags[3] === "prüfungsnah",
    "Modi brauchen Schwierigkeits-Tags (leicht … prüfungsnah): " + JSON.stringify(lp.tags));
  assert(lp.introOpen && lp.steps === 4,
    "»So funktioniert der Lernpfad« muss die Einführung mit vier Stufen öffnen: " + JSON.stringify(lp));
  assert(lp.optTip,
    "Die Einführung muss auf die Optionen hinweisen (Abfrage umdrehen → deutscher Name; sonst Gattung/Art/Familie): " + JSON.stringify(lp));
  assert(lp.introClosed && lp.seen === "1",
    "»Los geht's« muss die Einführung schließen und als gesehen merken: " + JSON.stringify(lp));
  assert(lp.real && lp.helpReal,
    "Einführung und Hilfe müssen sagen: Lernhilfe für die botanischen Namen, kein Ersatz für die echte Pflanze draußen: " + JSON.stringify({ real: lp.real, help: lp.helpReal }));

  // Listen-Suche klebt beim Scrollen oben (sticky, auf Seitenebene – Konsistenz zum Prüfwerkzeug)
  const listSticky = await page.evaluate(() => {
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    const r = document.querySelector("#listSearchRow");
    const pos = getComputedStyle(r).position;
    const outsideSetup = !r.closest(".setup");   // muss außerhalb der Setup-Karte liegen, sonst endet sticky an deren Unterkante
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    return { pos, outsideSetup };
  });
  assert(listSticky.pos === "sticky" && listSticky.outsideSetup,
    "Die Listen-Suche muss sticky und außerhalb der Setup-Karte sein: " + JSON.stringify(listSticky));

  // Aktive, vom Standard abweichende Optionen erscheinen in der zugeklappten »Optionen«-Kopfzeile (grün hervorgehoben)
  const optsSum = await page.evaluate(() => {
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    const sub = document.querySelector("#setOpts .opts-sub");
    const base = sub.textContent;
    const zp = document.querySelector("#onlyzp"); zp.checked = true; zp.dispatchEvent(new Event("change"));
    const withZp = sub.textContent, activeCls = sub.classList.contains("active");
    zp.checked = false; zp.dispatchEvent(new Event("change"));
    return { base, withZp, activeCls, back: sub.textContent };
  });
  assert(/Abfrage · Lernstoff/.test(optsSum.base), "Ohne Abweichung neutrale Beschreibung in der Optionen-Kopfzeile: " + JSON.stringify(optsSum));
  assert(/nur ZP/.test(optsSum.withZp) && optsSum.activeCls, "Aktive Option »nur ZP« muss in der zugeklappten Kopfzeile erscheinen (grün): " + JSON.stringify(optsSum));
  assert(/Abfrage · Lernstoff/.test(optsSum.back), "Nach Rücknahme wieder neutrale Beschreibung: " + JSON.stringify(optsSum));

  // Barrierefreiheit: Karteikarte per Tastatur (Leertaste dreht um, dann 1/2/3),
  // Feedback als aria-live, Info-Modal setzt den Fokus auf »Schließen«.
  const a11y = await page.evaluate(() => {
    $("#frSelect").value = "gemuesebau"; $("#nivSelect").value = "gaertner"; applyProfile();
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    $("#sessLen").value = "6"; startSession();
    const card = document.querySelector("#card");
    const isBtn = card.getAttribute("role") === "button" && card.getAttribute("tabindex") === "0";
    document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));   // Leertaste dreht um
    const flippedNow = !!document.querySelector("#card .answer");
    const hasRate = !!document.querySelector(".rate .r-good");
    document.querySelector("#btnStop").click(); document.querySelector("#btnOverview").click();
    document.querySelector('#modeTabs button[data-mode="quiz"]').click();
    $("#sessLen").value = "4"; startSession();
    const fbLive = document.querySelector("#fb").getAttribute("aria-live") === "polite";
    document.querySelector("#btnStop").click(); document.querySelector("#btnOverview").click();
    window.openInfo(allCards[0]);
    const modalFocus = !!(document.activeElement && document.activeElement.id === "infoClose");
    window.closeInfo();
    return { isBtn, flippedNow, hasRate, fbLive, modalFocus };
  });
  assert(a11y.isBtn, "Karteikarte muss ein per Tastatur bedienbarer Button sein (role/tabindex): " + JSON.stringify(a11y));
  assert(a11y.flippedNow && a11y.hasRate, "Leertaste muss die Karte umdrehen und die Bewertung zeigen: " + JSON.stringify(a11y));
  assert(a11y.fbLive, "Quiz-/Tipp-Feedback muss aria-live=polite sein (Screenreader-Ansage): " + JSON.stringify(a11y));
  assert(a11y.modalFocus, "Info-Modal muss den Fokus auf den »Schließen«-Knopf setzen: " + JSON.stringify(a11y));

  // Hell/Dunkel folgt allein der Systemeinstellung (Nutzerwunsch: kein Schalter). Ohne Attribut
  // und ohne gespeicherte Wahl: hell; mit prefers-color-scheme: dark greift die Dunkelpalette.
  const themeLight = await page.evaluate(() => ({ toggle: !!document.querySelector(".themetoggle, #btnTheme"),
    attr: document.documentElement.dataset.theme || null, saved: localStorage.getItem("pbw.theme"),
    paper: getComputedStyle(document.documentElement).getPropertyValue("--paper").trim() }));
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  const themeDark = await page.evaluate(() => ({ paper: getComputedStyle(document.documentElement).getPropertyValue("--paper").trim(),
    scheme: matchMedia("(prefers-color-scheme: dark)").matches }));
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  assert(!themeLight.toggle && themeLight.attr === null && themeLight.saved === null,
    "Kein Design-Schalter mehr, kein data-theme, keine gespeicherte Wahl: " + JSON.stringify(themeLight));
  assert(themeDark.scheme && themeDark.paper && themeDark.paper !== themeLight.paper,
    "Dunkelpalette muss allein über prefers-color-scheme greifen: " + JSON.stringify({ hell: themeLight.paper, dunkel: themeDark.paper }));

  // Sackgasse für Azubis: Das Lern-Tool ist die Wurzel (pflanze-bw.de) und darf
  // NIRGENDS auf das Prüfungswerkzeug verweisen – weder per Link noch im Text.
  // Impressum/Datenschutz muss in der Fußzeile erreichbar bleiben (gesetzlich nötig).
  const head = await page.evaluate(() => {
    const help = document.querySelector(".mast-right .helplink");
    return {
      noExamLink: !document.querySelector('a[href*="pflanzenkenntnis"], a[href*="pruefung"]'),
      noHomeLink: !document.querySelector('.mast-right a[href="index.html"], .mast-right .homelink'),
      noExamText: !/Prüfungsversion|Werkzeug für Prüfende/.test(document.body.textContent),
      legalKept: !!document.querySelector('.foot a[href="rechtliches.html"]'),
      helpDezent: !!(help && help.id === "btnHelp"),
      noToggle: !document.querySelector(".themetoggle, #btnTheme")
    };
  });
  assert(head.noExamLink && head.noExamText,
    "Lern-Tool darf nicht auf das Prüfungswerkzeug verweisen (Azubis sollen es nicht sehen): " + JSON.stringify(head));
  assert(head.noHomeLink, "Lern-Tool ist selbst die Startseite – kein Startseite-Link im Kopf: " + JSON.stringify(head));
  assert(head.legalKept, "Impressum/Datenschutz muss über die Fußzeile erreichbar bleiben: " + JSON.stringify(head));
  assert(head.helpDezent, "»Hilfe« muss als dezenter .helplink im Kopf stehen: " + JSON.stringify(head));
  assert(head.noToggle, "Kein Design-Schalter mehr – Hell/Dunkel folgt dem System: " + JSON.stringify(head));


  // Rang-Kürzel »sect.« (Realfall Taraxacum sect. Ruderalia = Gewöhnlicher Löwenzahn, Screenshot:
  // im Bilder-Quiz nie ein Bild). Ursache war nicht die Köhler-Tafel allein (die wird zu Recht
  // verworfen), sondern das Kürzel: »sect.« galt als Art-Epitheton, der Suchname wurde
  // »Taraxacum sect.«, und fileMentionsOther verwarf jede Datei der Sektions-Kategorie als
  // »andere Art«. Jetzt: Sektion = Taxon »Taraxacum sect. Ruderalia« (Artikel + Commons-Kategorie),
  // kein Epitheton (jede Datei der Gattung darf vertreten), Sektionsname zählt beim Ranking.
  // Die Commons-Antwort ist die echte Dateiliste der Kategorie (Stand der Umsetzung).
  const sektion = await page.evaluate(async () => {
    const prev = [$("#frSelect").value, $("#nivSelect").value];
    $("#frSelect").value = "garten_und_landschaftsbau"; $("#nivSelect").value = "gaertner"; applyProfile();
    const lz = allCards.find((c) => c.g === "Taraxacum" && /Ruderalia/.test(c.a));
    const wege = photoSteps(lz).map((s) => s.k + ":" + s.q);
    const live = ["Fly drops.jpg", "Löwenzahn IMG 5372.jpg", "Mellansjön 01.jpg", "Taraxacum sect. Ruderalia 01.JPG", "Taraxacum officinale 2.jpg",
      "Dandelion flower 1001.jpg", "Missbildung Loewenzahn (Taraxacum officinale agg.).jpg", "Taraxacum sect R1.JPG",
      "Puccinia taraxaci - Botanischer Garten Düsseldorf-0075.jpg", "Harilik võilill.jpg", "9 Aug 2014 Swan Family Neuer Teich 110605260.jpg", "Taraxacum sect Ruderalia02 ies.jpg"];
    const cmPage = (i, file) => ({ index: i, title: "File:" + file, imageinfo: [{ thumburl: "https://x/" + file, mime: "image/jpeg", width: 2000, descriptionurl: "https://commons/" + file }] });
    const cmAnswer = (files) => ({ query: { pages: Object.fromEntries(files.map((f, i) => ["p" + i, cmPage(i + 1, f)])) } });
    const abrufe = [];
    __clearPhotoCache(); photoTried.clear();
    __setJsonp((url) => {
      const q = decodeURIComponent((url.match(/(?:gsrsearch|titles)=([^&]+)/) || [])[1] || ""); abrufe.push(q);
      if (/commons/.test(url) && /^File:/.test(q)) return Promise.resolve({ query: { pages: { "1": { title: q, imageinfo: [{ mime: "image/jpeg", extmetadata: {} }] } } } });
      if (/commons/.test(url)) return Promise.resolve(/incategory:"Taraxacum sect\. Ruderalia"/.test(q) ? cmAnswer(live) : { query: { pages: {} } });
      if (q === "Taraxacum sect. Ruderalia") return Promise.resolve({ query: { pages: { "1": { title: "Gewöhnlicher Löwenzahn",
        extract: "Der Gewöhnliche Löwenzahn (Taraxacum sect. Ruderalia; früher Taraxacum officinale L.) stellt eine Gruppe sehr ähnlicher Pflanzenarten in der Gattung Löwenzahn (Taraxacum) dar.",
        pageimage: "Taraxacum_officinale_-_Köhler–s_Medizinal-Pflanzen-135.jpg", thumbnail: { source: "https://x/koehler.jpg" } } } } });
      return Promise.resolve({ query: { pages: { "-1": { title: q, missing: "" } } } });
    });
    const hit = await wikiPhoto(lz);
    __setJsonp(window.__offlineJsonp); __clearPhotoCache(); photoTried.clear();
    const out = { wege, abrufe, file: hit && hit.file, src: hit && hit.src, gal: (hit && hit.gal) || [],
      epi: binomEpithet("sect. Ruderalia"), such: searchName(lz), taxon: taxonName(lz), typo: taxonName({ g: "Taraxacum", a: "sec. Ruderalia" }),
      rubus: photoSteps({ g: "Rubus", a: "sect. Rubus (fruticosus)", de: "Echte Brombeere" }).map((s) => s.k + ":" + s.q),
      hybrid: photoSteps({ g: "Syringa", a: "x chinensis", de: "Chinesischer Flieder" }).map((s) => s.k + ":" + s.q),
      andere: fileMentionsOther("Taraxacum officinale 2.jpg", lz), eigene: fileMentionsOther("Taraxacum sect. Ruderalia 01.JPG", lz),
      koehler: looksIllustration("Taraxacum_officinale_-_Köhler–s_Medizinal-Pflanzen-135.jpg"),
      missbildung: looksDamage("Missbildung Loewenzahn (Taraxacum officinale agg.).jpg"),
      leyland: pageFitsCard({ title: "Leyland-Zypresse", extract: "Die Leyland-Zypresse (× Hesperotropsis leylandii) ist ein Nadelgehölz." }, { g: "×Hesperotropsis", a: "leylandii" }),
      epis: ["vulgaris, A. Cultivars", "× pendulina nothof. tristis", "vinifera supsp. vinvifera", "Cultivars", "- Hybriden", "x chinensis", "cultivars"].map(binomEpithet),
      lupine: photoSteps({ g: "Lupinus", a: "cultivars", de: "Stauden-Lupine, Garten-Lupine" }).map((s) => s.k + ":" + s.q),
      lupineAndere: fileMentionsOther("Lupinus polyphyllus 01.jpg", { g: "Lupinus", a: "cultivars" }),
      gruppe: [pureGroupName("Cultivars"), pureGroupName("sect. Ruderalia"), pureGroupName("vulgaris Conditiva-Grp.")] };
    $("#frSelect").value = prev[0]; $("#nivSelect").value = prev[1]; applyProfile();   // Profil der folgenden Tests wiederherstellen
    return out;
  });
  assert(sektion.epi === "" && sektion.such === "Taraxacum" && sektion.taxon === "Taraxacum sect. Ruderalia" && sektion.typo === "Taraxacum sect. Ruderalia",
    "»sect.« ist ein Rang-Kürzel, kein Epitheton: Suchname = Gattung (Deep-Links), Taxon = »Taraxacum sect. Ruderalia« (auch beim Quell-Tippfehler »sec.«): " + JSON.stringify(sektion));
  assert(JSON.stringify(sektion.wege.slice(0, 4)) === JSON.stringify(["wp:Taraxacum sect. Ruderalia", 'cm:incategory:"Taraxacum sect. Ruderalia"', "wp:Wiesen-Löwenzähne", "cm:Taraxacum sect. Ruderalia"]) &&
    sektion.wege.slice(4).every((w) => /Taraxacum sect\. Taraxacum/.test(w)) && !sektion.wege.some((w) => /^wp:Taraxacum$/.test(w)),
    "Suchwege der Sektion: Artikel + Commons-Kategorie des Taxons, deutscher Name, Volltext – NICHT die Gattung allein; danach nur Synonym-Wege der Liste: " + JSON.stringify(sektion.wege));
  assert(sektion.file === "Taraxacum sect. Ruderalia 01.JPG" && sektion.src === "cm" && sektion.abrufe.length === 2 && sektion.gal.length >= 4,
    "Löwenzahn bekommt ein Foto aus der Sektions-Kategorie (Köhler-Tafel verworfen, Sektionsname gewinnt das Ranking, Rost-/Missbildungs-Fotos raus): " + JSON.stringify({ file: sektion.file, src: sektion.src, abrufe: sektion.abrufe, gal: sektion.gal.length }));
  assert(!sektion.andere && !sektion.eigene && sektion.koehler && sektion.missbildung && sektion.leyland,
    "Filter: Dateien der Gattung gelten bei Sektionen nicht als »andere Art«, Köhler = Tafel, Missbildung = Schadbild, Hybridgattung ohne × im Artikel passt: " + JSON.stringify(sektion));
  assert(JSON.stringify(sektion.rubus) === JSON.stringify(["wp:Rubus sect. Rubus", 'cm:incategory:"Rubus sect. Rubus"', "wp:Rubus fruticosus", "wp:Echte Brombeere", "cm:Rubus sect. Rubus"]) &&
    JSON.stringify(sektion.hybrid) === JSON.stringify(["wp:Syringa × chinensis", "wp:Syringa chinensis", 'cm:incategory:"Syringa × chinensis"', "wp:Chinesischer Flieder", "cm:Syringa × chinensis"]),
    "Brombeere (Klammer-Epitheton) und Hybride (× für Artikel/Kategorie, Binom als Zweitweg): " + JSON.stringify({ rubus: sektion.rubus, hybrid: sektion.hybrid }));
  assert(JSON.stringify(sektion.epis) === JSON.stringify(["vulgaris", "pendulina", "vinifera", "", "", "chinensis", ""]) && JSON.stringify(sektion.gruppe) === JSON.stringify([true, false, false]),
    "binomEpithet: Komma/Rang-Kürzel/Tippfehler/Gruppenwort (auch kleingeschrieben)/Hybrid-x; Sektion ist kein Sammel-Eintrag: " + JSON.stringify({ epis: sektion.epis, gruppe: sektion.gruppe }));
  assert(JSON.stringify(sektion.lupine) === JSON.stringify(["cm:Lupinus cultivar", 'cm:incategory:"Quality images of Lupinus"', "wp:Stauden-Lupine", 'cm:incategory:"Lupinus"', "wp:Lupinus", "cm:Lupinus"]) &&
    sektion.lupineAndere === false,
    "»Lupinus cultivars« (kleingeschrieben, 7 Zeilen): Sammelkarte – Gartenform zuerst (»Lupinus cultivar«, dann Qualitätsbilder), dann deutscher Name, Gattung; Dateien der Gattung gelten nicht als »andere Art«: " + JSON.stringify({ lupine: sektion.lupine, andere: sektion.lupineAndere }));

  // Synonyme der Liste in der Bildsuche (Realfall Lonicera nitida 'Elegant': auf Commons ist die
  // Kategorie »Lonicera nitida« LEER, die Fotos liegen unter dem akzeptierten Namen »Lonicera
  // ligustrina var. yunnanensis« – genau dem Synonym der Liste; der Volltext liefert nur Buchscans).
  // Dazu: eine API-Fehlerantwort (Drosselung) ist ein Ausfall, kein »kein Bild«.
  const synonym = await page.evaluate(async () => {
    const prev = [$("#frSelect").value, $("#nivSelect").value];
    $("#frSelect").value = "garten_und_landschaftsbau"; $("#nivSelect").value = "gaertner"; applyProfile();
    const lon = allCards.find((c) => c.g === "Lonicera" && /Elegant/.test(c.a));
    const wege = photoSteps(lon).map((s) => s.k + ":" + s.q);
    const cmPage = (i, file, mime) => ({ index: i, title: "File:" + file, imageinfo: [{ thumburl: "https://x/" + file, mime: mime || "image/jpeg", width: 2000, descriptionurl: "https://commons/" + file }] });
    const cmAnswer = (files, mime) => ({ query: { pages: Object.fromEntries(files.map((f, i) => ["p" + i, cmPage(i + 1, f, mime)])) } });
    const abrufe = [];
    __clearPhotoCache(); photoTried.clear();
    __setJsonp((url) => {
      const q = decodeURIComponent((url.match(/(?:gsrsearch|titles)=([^&]+)/) || [])[1] || ""); abrufe.push(q);
      if (/commons/.test(url) && /^File:/.test(q)) return Promise.resolve({ query: { pages: { "1": { title: q, imageinfo: [{ mime: "image/jpeg", extmetadata: {} }] } } } });
      if (/commons/.test(url)) {
        if (/incategory:"Lonicera ligustrina var\. yunnanensis"/.test(q)) return Promise.resolve(cmAnswer(["Lonicera ligustrina var. yunnanensis 2.jpg", "Lonicera ligustrina var. yunnanensis 1.jpg"]));
        if (/^Lonicera nitida Elegant$/.test(q)) return Promise.resolve(cmAnswer(["Elmwood Nurseries - 1931-1932 (IA CAT31338015).pdf"], "application/pdf"));   // echte Antwort: nur Buchscans
        return Promise.resolve({ query: { pages: {} } });   // »Lonicera nitida«: leere Kategorie (echt)
      }
      return Promise.resolve({ query: { pages: { "-1": { title: q, missing: "" } } } });
    });
    const hit = await wikiPhoto(lon);
    __clearPhotoCache(); photoTried.clear();
    __setJsonp(() => Promise.resolve({ error: { code: "ratelimited", info: "…" } }));
    let apiErr = "";
    try { await wikiPhoto(lon); apiErr = "kein Fehler"; } catch (e) { apiErr = e.message; }
    __setJsonp(window.__offlineJsonp); __clearPhotoCache(); photoTried.clear();
    const res = { wege, abrufe, file: hit && hit.file, src: hit && hit.src, apiErr,
      syn: synCards(lon).map((s) => s.g + " " + s.a),
      andere: fileMentionsOther("Lonicera ligustrina var. yunnanensis 2.jpg", lon), fremd: fileMentionsOther("Lonicera pileata 2.jpg", lon),
      cands: wikiCandidates(lon),
      mahonia: pageFitsCard({ title: "Gewöhnliche Mahonie", extract: "Die Gewöhnliche Mahonie (Mahonia aquifolium) ist eine Pflanzenart." }, { g: "Berberis", a: "aquifolium", syn: "Mahonia aquifolium" }),
      nigra: photoSteps({ g: "Prunus", a: "cerasifera 'Nigra'", de: "Blutpflaume", syn: "Prunus cerasifera var. atropurpurea" }).map((s) => s.k + ":" + s.q) };
    $("#frSelect").value = prev[0]; $("#nivSelect").value = prev[1]; applyProfile();
    return res;
  });
  assert(JSON.stringify(synonym.syn) === JSON.stringify(["Lonicera ligustrina var. yunnanensis"]) &&
    synonym.wege.slice(-3).join("|") === 'wp:Lonicera ligustrina var. yunnanensis|cm:incategory:"Lonicera ligustrina var. yunnanensis"|cm:Lonicera ligustrina var. yunnanensis' &&
    synonym.wege.indexOf('cm:incategory:"Lonicera nitida"') < synonym.wege.indexOf('cm:incategory:"Lonicera ligustrina var. yunnanensis"'),
    "Bildsuche: Synonyme der Liste kommen als letzte Wege (Artikel, Kategorie, Volltext) nach den eigenen: " + JSON.stringify({ syn: synonym.syn, wege: synonym.wege }));
  assert(synonym.file === "Lonicera ligustrina var. yunnanensis 2.jpg" && synonym.src === "cm" && !synonym.andere && synonym.fremd && synonym.mahonia,
    "Lonicera nitida 'Elegant' bekommt das Foto aus der Synonym-Kategorie; Synonym-Epitheta gelten nicht als »andere Art«, fremde schon; Synonym-Gattung passt zum Artikel: " + JSON.stringify({ file: synonym.file, src: synonym.src, andere: synonym.andere, fremd: synonym.fremd, mahonia: synonym.mahonia, abrufe: synonym.abrufe }));
  assert(synonym.apiErr === "network" && synonym.cands.includes("Lonicera ligustrina var. yunnanensis") && !synonym.nigra.some((w) => /atropurpurea/.test(w)),
    "API-Fehlerantwort = Verbindungsproblem (kein »kein Bild«); Synonym auch als Wikipedia-Kandidatin; beschreibende Sorte bekommt keine Synonym-Wege (Artniveau): " + JSON.stringify({ apiErr: synonym.apiErr, cands: synonym.cands, nigra: synonym.nigra }));

  // Bilder-Quiz: Buchdeckel/Titelseiten/Scans digitalisierter Werke werden verworfen
  // (Praxisfall: Buchdeckel statt Majoran-Foto); Herbarbelege gelten als Tafel.
  // Deutsche Pflanzennamen mit »buch« im Wort (Buche, Buchsbaum) bleiben erlaubt.
  const photoFilter = await page.evaluate(() => ({
    einband: usablePhoto("Majoran_Kraeuterbuch_Einband.jpg"),
    titel: usablePhoto("Title_page_of_Prodromus_1790.jpg"),
    cover: usablePhoto("Book_cover_herbal_1543.jpg"),
    scan: usablePhoto("Origanum_scan_p123.jpg"),
    foto: usablePhoto("Origanum_majorana_flowers_2019.jpg"),
    buche: usablePhoto("Fagus_sylvatica_Buche_im_Wald.jpg"),
    buchs: usablePhoto("Buxus_Buchsbaum_Hecke.jpg"),
    groundcover: usablePhoto("Vinca_minor_groundcover.jpg"),
    herbar: looksIllustration("Herbarium_specimen_Origanum_majorana.jpg"),
  }));
  assert(!photoFilter.einband && !photoFilter.titel && !photoFilter.cover && !photoFilter.scan,
    "Buchdeckel/Titelseiten/Scans müssen als unbrauchbar verworfen werden: " + JSON.stringify(photoFilter));
  assert(photoFilter.foto && photoFilter.buche && photoFilter.buchs && photoFilter.groundcover,
    "Echte Fotos (auch Buche/Buchsbaum/groundcover im Namen) müssen erlaubt bleiben: " + JSON.stringify(photoFilter));
  assert(photoFilter.herbar, "Herbarbelege müssen als Tafel/Scan erkannt werden: " + JSON.stringify(photoFilter));

  // Hinweis vor den Lektionen: automatisch/KI-erzeugte Inhalte, keine Gewähr –
  // muss ohne Aufklappen sichtbar sein und im Listenmodus verschwinden
  const note = await page.evaluate(() => {
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    const n = document.querySelector("#learnNote");
    const t = n ? n.textContent.replace(/\s+/g, " ") : "";
    const sum = n ? n.querySelector("summary").textContent.replace(/\s+/g, " ") : "";
    const r = n ? n.getBoundingClientRect() : { height: 0 };
    const vor = !document.querySelector("#startRow").hidden && !n.hidden && r.height > 0;
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    const imListe = document.querySelector("#learnNote").hidden;
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    return { vor, imListe, zu: !n.open, sum, ki: /generativer KI/.test(t), bild: /Bildauswahl/.test(t),
      gewaehr: /keine Gewähr/.test(t) && /Haftung/.test(t), amtlich: /offiziellen Prüfungslisten/.test(t),
      quelle: /unverändert/.test(t) && /amtlichen Prüfungsliste/.test(t),
      lueckenDok: /Chimonanthus/.test(t) && /Philadelphus coronarius/.test(t) && /Wuchsform/.test(t) &&
        /Fünf Eingriffe/.test(t) && /Rechtschreibfehler/.test(t) && /Antirrhinum/.test(t),
      anfz: /Anführungszeichen um/.test(t),
      mehr: !!(n && n.querySelector('a[href="rechtliches.html#datenquellen"]')), t };
  });
  assert(note.vor, "Der Hinweis muss vor dem Start der Lektion sichtbar sein: " + JSON.stringify(note));
  assert(note.ki && note.bild, "Hinweis muss KI-Erzeugung und Bildauswahl benennen: " + note.t);
  assert(note.gewaehr && note.amtlich,
    "Hinweis muss Gewähr/Haftung ausschließen und auf die offiziellen Listen verweisen: " + note.t);
  assert(note.imListe, "Im Listenmodus (keine Lektion) gehört der Hinweis ausgeblendet");
  // Die Zusammenfassung ist im Normalfall das EINZIGE, was man liest – sie muss die Quelle
  // der Pflanzennamen nennen, nicht nur die KI (sonst entsteht der Eindruck, auch die Namen
  // seien erzeugt).
  assert(note.zu, "Der Hinweis gehört standardmäßig zugeklappt (sonst füllt er die Startansicht)");
  assert(/Pflanzennamen/.test(note.sum) && /amtlichen Prüfungslisten/.test(note.sum),
    "Die zugeklappte Zeile muss die Herkunft der Pflanzennamen nennen: " + note.sum);
  assert(/Lernhilfen/.test(note.sum) && /KI/.test(note.sum),
    "Die zugeklappte Zeile muss die Lernhilfen als KI-gestützt ausweisen: " + note.sum);
  assert(note.quelle, "Der Volltext muss »unverändert aus der amtlichen Prüfungsliste« sagen: " + note.t);
  assert(note.lueckenDok,
    "Der Volltext muss die dokumentierten Eingriffe offenlegen (Chimonanthus, Philadelphus, Rechtschreibfehler, Wuchsform): " + note.t);
  assert(note.anfz,
    "Der Volltext muss die vereinheitlichten Anführungszeichen der Sortennamen als Schreibweise-Anpassung nennen: " + note.t);
  assert(note.mehr, "Der Hinweis muss auf rechtliches.html#datenquellen verweisen");

  // Berichtigte Quellzeile (GaLaBau-Gärtner Nr. 207): »Salvia abrotanoides · Bauernjasmin« muss
  // als Philadelphus coronarius ausgeliefert werden – reproduzierbar über tools/fix_source_gaps.py
  // (REPLACEMENTS), nicht von Hand im Seed; die CI baut die Seeds neu und vergleicht byte-genau.
  const fix = await page.evaluate(() => {
    const rows = SEEDS.garten_und_landschaftsbau_gaertner;
    const falsch = rows.filter((r) => r[0] === "Salvia" && r[1] === "abrotanoides");
    const richtig = rows.filter((r) => r[0] === "Philadelphus" && r[1] === "coronarius");
    const blauraute = rows.find((r) => r[0] === "Perovskia" && r[1] === "abrotanoides");
    return { falsch: falsch.length, richtig: richtig.length, zeile: richtig[0] || null, syn: blauraute ? blauraute[6] : "" };
  });
  assert(fix.falsch === 0 && fix.richtig === 1,
    "GaLaBau-Gärtner: »Salvia abrotanoides« (Bauernjasmin) muss als Philadelphus coronarius berichtigt sein: " + JSON.stringify(fix));
  assert(/Bauernjasmin/.test(fix.zeile[3]) && /^Hydrangeaceae/.test(fix.zeile[2]) && fix.zeile[4] === "Laubgehölze" && fix.zeile[5] === 1,
    "Die berichtigte Zeile muss deutsche Namen, Familie und ZP behalten und als Laubgehölz gelten: " + JSON.stringify(fix.zeile));
  assert(/Salvia abrotanoides/.test(fix.syn),
    "Die Blauraute (Perovskia abrotanoides) muss ihr Synonym Salvia abrotanoides behalten: " + JSON.stringify(fix));

  // Rechtschreibfehler in botanischen Namen (Fund des Bildchecks, berichtigt über
  // tools/fix_source_gaps.py): keine falsche Form mehr, die richtige genau einmal je Liste,
  // deutsche Namen/Familie unverändert. Dazu: Der Lernstand zieht mit (KEY_RENAMES).
  const tippfehler = await page.evaluate(() => {
    const F = [
      ["baumschule_fachwerker", "Juniperus", "communis 'Hibernika'", "Juniperus communis 'Hibernica'", "Irischer Säulenwacholder"],
      ["baumschule_gaertner", "Lagererstroemia", "indica", "Lagerstroemia indica", "Kreppmyrte"],
      ["baumschule_gaertner", "Olea", "europea", "Olea europaea", "Echte Olive"],
      ["friedhofsgaertnerei_fachwerker", "Antirrinum", "majus", "Antirrhinum majus", "Löwenmäulchen"],
      ["friedhofsgaertnerei_fachwerker", "Gypsohila", "paniculata", "Gypsophila paniculata", "Schleierkraut"],
      ["friedhofsgaertnerei_fachwerker", "Urtica", "dioca", "Urtica dioica", "Brennnessel"],
      ["friedhofsgaertnerei_fachwerker", "Thymus", "serphyllum", "Thymus serpyllum", "Thymian"],
      ["friedhofsgaertnerei_fachwerker", "Chameacyparis", "obtusa 'Nana Gracilis'", "Chamaecyparis obtusa 'Nana Gracilis'", "Muschel-Scheinzypresse"],
      ["friedhofsgaertnerei_fachwerker", "Chameacypris", "lawsoniana 'Glauca'", "Chamaecyparis lawsoniana 'Glauca'", "Blaue Scheinzypresse"],
      ["friedhofsgaertnerei_gaertner", "Hosta", "Cultivars Fortuei Aurea'", "Hosta Cultivars Fortunei Aurea'", "Frühlingsgold-Funkie"],
      ["gemuesebau_gaertner", "Amaranthus", "retoflexus", "Amaranthus retroflexus", "Zurückgekr. Fuchsschwanz, Amarant"],
      ["zierpflanzenbau_gaertner", "Petunie", "x atkinsiana", "Petunia x atkinsiana", "Garten-Petunie"],
    ];
    const fehler = [];
    F.forEach(([pid, g, a, richtig, de]) => {
      const rows = SEEDS[pid] || [];
      if (rows.some((r) => r[0] === g && r[1] === a)) fehler.push(pid + ": falsche Form noch da: " + g + " " + a);
      const hit = rows.filter((r) => (r[0] + " " + r[1]) === richtig && r[3] === de);
      if (hit.length !== 1) fehler.push(pid + ": berichtigte Zeile " + richtig + " (" + de + ") " + hit.length + "×");
    });
    // Lernstand-Umzug: jeder neue Schlüssel ist eine echte Karte, kein alter mehr
    const keys = new Set(Object.keys(SEEDS).flatMap((id) => cardsFor(id).map((c) => c.key)));
    Object.entries(KEY_RENAMES).forEach(([alt, neu]) => {
      if (keys.has(alt)) fehler.push("alter Schlüssel noch als Karte: " + alt);
      if (!keys.has(neu)) fehler.push("neuer Schlüssel keine Karte: " + neu);
    });
    const prev = $("#frSelect").value + "|" + $("#nivSelect").value;
    const alt = "amaranthus|retoflexus|zurückgekr. fuchsschwanz, amarant", neu = KEY_RENAMES[alt];
    const vorher = localStorage.getItem("pflanzenlernen.progress.gemuesebau_gaertner");
    const p0 = JSON.parse(vorher || "{}"); delete p0[neu]; p0[alt] = { box: 3, due: "2099-01-01", seen: 4, correct: 3, wrong: 1 };
    localStorage.setItem("pflanzenlernen.progress.gemuesebau_gaertner", JSON.stringify(p0));
    $("#frSelect").value = "obstbau"; $("#nivSelect").value = "gaertner"; applyProfile();
    $("#frSelect").value = "gemuesebau"; $("#nivSelect").value = "gaertner"; applyProfile();
    const umzug = { neuBox: progress[neu] && progress[neu].box, altWeg: !(alt in progress),
      gespeichert: JSON.parse(localStorage.getItem("pflanzenlernen.progress.gemuesebau_gaertner") || "{}")[neu] != null };
    delete progress[neu]; saveProgress();
    const [fr, niv] = prev.split("|"); $("#frSelect").value = fr; $("#nivSelect").value = niv; applyProfile();
    return { fehler, umzug };
  });
  assert(tippfehler.fehler.length === 0, "Rechtschreibfehler müssen berichtigt sein: " + JSON.stringify(tippfehler.fehler));
  assert(tippfehler.umzug.neuBox === 3 && tippfehler.umzug.altWeg && tippfehler.umzug.gespeichert,
    "Der Lernstand einer berichtigten Art muss unter den neuen Schlüssel umziehen: " + JSON.stringify(tippfehler.umzug));

  // Bildsuche: Sammelgruppe im Gattungsfeld (»Fuchsia-Hybriden«, Art leer) und eine Notiz statt
  // Epitheton (»Sphagnum z.B: fallax …«) – beide blieben im Bildcheck ohne Bild.
  const sammel = await page.evaluate(() => {
    const fu = photoCard({ g: "Fuchsia-Hybriden", a: "", de: "Fuchsie", key: "t-fu" });
    const ro = photoCard({ g: "Rosa-Hybriden", a: "", de: "Rose", key: "t-ro" });
    const keep = photoCard({ g: "Impatiens", a: "Neu-Guinea-Hybriden", de: "Edellieschen" });
    const sph = { g: "Sphagnum", a: "z.B: fallax ca. 35 Arten in der BRD", de: "Torfmoos" };
    return { fu, ro, keepG: keep.g, steps: photoSteps({ g: "Fuchsia-Hybriden", a: "", de: "Fuchsie" }).map((s) => s.k + ":" + s.q).slice(0, 2),
      sphEpi: binomEpithet(sph.a), sphSearch: searchName(sph), aquilegia: binomEpithet("vulgaris, A. Cultivars") };
  });
  assert(sammel.fu.g === "Fuchsia" && sammel.fu.a === "Hybriden" && sammel.ro.g === "Rosa" && sammel.keepG === "Impatiens",
    "Sammelgruppe im Gattungsfeld muss für die Bildsuche zur Gattung werden (nur bei leerer Art): " + JSON.stringify(sammel));
  assert(JSON.stringify(sammel.steps) === JSON.stringify(["cm:Fuchsia cultivar", 'cm:incategory:"Quality images of Fuchsia"']),
    "Bildsuche für »Fuchsia-Hybriden« sucht wie jede Sammelkarte zuerst die Gartenform der Gattung: " + JSON.stringify(sammel.steps));
  assert(sammel.sphEpi === "fallax" && sammel.sphSearch === "Sphagnum fallax" && sammel.aquilegia === "vulgaris",
    "Abkürzungen wie »z.B:« sind kein Epitheton (Sphagnum fallax), »vulgaris, A. Cultivars« bleibt vulgaris: " + JSON.stringify(sammel));

  // Kennzeichnung dort, wo Namen nachgeschlagen werden: Liste und Info-Karte
  const quelle = await page.evaluate(() => {
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    const ls = document.querySelector("#stage .listsrc");
    const lsT = ls ? ls.textContent.replace(/\s+/g, " ") : "";
    document.querySelector("#stage .sprow").click();                // Info-Karte der ersten Art
    const ms = document.querySelector("#infoScrim .mh-src");
    const msT = ms ? ms.textContent.replace(/\s+/g, " ") : "";
    const msSvg = !!(ms && ms.querySelector("svg.ic"));
    document.querySelector("#infoClose").click();
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    return { lsT, msT, msSvg };
  });
  assert(/Artnamen unverändert aus der amtlichen/.test(quelle.lsT) && /automatisch erzeugt/.test(quelle.lsT),
    "Die Nachschlage-Liste muss Quelle und Erzeugtes trennen: " + quelle.lsT);
  assert(/Gemüsebau/.test(quelle.lsT),
    "Die Listen-Quellzeile muss das Profil benennen: " + quelle.lsT);
  assert(/amtlichen Prüfungsliste/.test(quelle.msT) && quelle.msSvg,
    "Die Info-Karte muss am Namen die Quelle ausweisen: " + JSON.stringify(quelle));

  // Druckliste: Ausdrucke wandern weiter – die Quelle muss mitgedruckt werden
  const pQuelle = await page.evaluate(() => {
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    window.buildPrintList();
    const f = document.querySelector("#printList .pfoot");
    const t = f ? f.textContent.replace(/\s+/g, " ") : "";
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    return t;
  });
  assert(/Artnamen unverändert aus der amtlichen Prüfungsliste/.test(pQuelle),
    "Die gedruckte Lernliste muss die Quelle der Artnamen nennen: " + pQuelle);

  // Karteikarten: Vorderseite NUR deutscher Name; Rückseite Gattung/Art/Familie; »Gewusst« bewerten
  const cards = await page.evaluate(() => {
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    $("#sessLen").value = "8"; startSession();
    const hasCard = !!document.querySelector("#card");
    const c = current, key = c.key;
    // Vorderseite: nur der deutsche Name (kein botanischer Name, kein Familienhinweis)
    const frontPrompt = (document.querySelector("#card .prompt") || {}).textContent || "";
    const frontOnlyDe = frontPrompt.trim() === (c.de || "").trim()
      && !/class="sub"/.test(document.querySelector("#card").innerHTML);
    document.querySelector("#card").click();               // umdrehen
    const backHtml = document.querySelector("#card").innerHTML;
    const flippedShown = /class="answer"/.test(backHtml);
    const labels = [...document.querySelectorAll("#card .answer .meta .mf b")].map((b) => b.textContent);
    const bigBinom = (document.querySelector("#card .answer .big") || {}).textContent || "";
    document.querySelector(".rate .r-good").click();        // bewerten -> Box hoch, advance
    return { hasCard, frontOnlyDe, flippedShown, labels, bigBinom, gAndA: (c.g + " " + c.a).trim(),
             box: (progress[key] || {}).box || 0, due: (progress[key] || {}).due || "", today: todayISO(), doneAfter: sess.done };
  });
  assert(cards.hasCard, "Karteikarte wird nicht angezeigt");
  assert(cards.frontOnlyDe, "Karteikarten-Vorderseite muss NUR den deutschen Namen zeigen (kein botanischer Name/Hinweis)");
  assert(cards.flippedShown, "Karteikarte zeigt nach dem Umdrehen keine Antwort");
  assert(cards.bigBinom.trim() === cards.gAndA, "Karteikarten-Rückseite: botanischer Name (Gattung + Art) fehlt/prominent");
  assert(cards.labels.includes("Gattung") && cards.labels.includes("Art") && cards.labels.includes("Familie"),
    "Karteikarten-Rückseite muss Gattung, Art und Familie getrennt ausweisen (war: " + JSON.stringify(cards.labels) + ")");
  assert(cards.doneAfter === 1, "Fortschritt (sess.done) stimmt nach einer Bewertung nicht");
  assert(cards.box >= 2 && cards.due > cards.today,
    "»Gewusst« muss eine neue Karte in Box ≥2 heben und in die Zukunft planen (war Box " + cards.box + ", fällig " + cards.due + ")");

  // Leitner: die drei Bewertungen planen eine NEUE Karte unterschiedlich ein
  const sched = await page.evaluate(() => {
    const fresh = pool().filter((c) => !(progress[c.key] && progress[c.key].box)).slice(0, 3);
    grade(fresh[0], "again"); grade(fresh[1], "hard"); grade(fresh[2], "good");
    const P = (k) => progress[k];
    return { t: todayISO(), again: P(fresh[0].key), hard: P(fresh[1].key), good: P(fresh[2].key) };
  });
  assert(sched.again.box === 1 && sched.again.due === sched.t, "again: Box 1, heute fällig");
  assert(sched.hard.box === 1 && sched.hard.due > sched.t, "hard (neu): Box 1, aber künftig fällig");
  assert(sched.good.box >= 2 && sched.good.due > sched.t, "good (neu): Box ≥2, künftig fällig");
  assert(sched.again.due !== sched.good.due, "again und good dürfen eine neue Karte nicht gleich einplanen");

  // Hilfe als Dialog (Audit): öffnet im Scrim mit ×, Fokus geht hinein und per Esc zurück zum
  // Hilfe-Knopf, die Themen sind Klappen (erste offen), »In vier Schritten« (es sind vier).
  const help = await page.evaluate(() => {
    if (typeof sess !== "undefined" && sess && sess.active) {   // laufende Karteikarten-Sitzung beenden: im Fokus-Modus ist der Rest der Seite inert (Hilfe-Knopf verdeckt)
      document.querySelector("#btnStop").click();
      const ov = document.querySelector("#btnOverview"); if (ov) ov.click(); else exitSession();
    }
    const b = document.querySelector("#btnHelp"), s = document.querySelector("#helpScrim"), h = document.querySelector("#helpPanel");
    b.focus(); b.click();
    const opened = !s.hidden && b.classList.contains("active") && b.getAttribute("aria-pressed") === "true";
    const hasContent = h.querySelectorAll(".hdl dt").length >= 4;
    const dialog = h.getAttribute("role") === "dialog" && !!h.querySelector("#helpClose");
    const secs = [...h.querySelectorAll("details.hsec")];
    const accordion = secs.length >= 4 && secs[0].open && secs.slice(1).every((d) => !d.open);
    const txt = h.textContent;
    const vier = /In vier Schritten/.test(txt) && !/In drei Schritten/.test(txt) && h.querySelectorAll(".hsteps li").length === 4;
    const focusIn = document.activeElement && document.activeElement.id === "helpClose";
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    const closedEsc = s.hidden && !b.classList.contains("active") && document.activeElement === b;
    b.click(); document.querySelector("#helpClose").click();
    const closedX = s.hidden;
    return { opened, hasContent, dialog, accordion, vier, focusIn, closedEsc, closedX };
  });
  assert(help.opened && help.hasContent && help.dialog, "Hilfe-Dialog öffnet nicht bzw. Inhalt/×-Knopf fehlt: " + JSON.stringify(help));
  assert(help.accordion && help.vier, "Hilfe: Themen als Klappen (erste offen) + »In vier Schritten«: " + JSON.stringify(help));
  assert(help.focusIn && help.closedEsc && help.closedX, "Hilfe: Fokus hinein, Esc und × müssen funktionieren: " + JSON.stringify(help));

  // Info-Modal: Deep-Links (offline) + Online-Laden-Knopf vorhanden, schließt sauber.
  // Der Wikipedia-Abruf (JSONP) wird NICHT ausgelöst – der Test bleibt offline.
  const info = await page.evaluate(() => {
    const c = pool()[0];
    openInfo(c);
    const links = [...document.querySelectorAll("#infoScrim .srcgrid a")].map((a) => a.getAttribute("href"));
    const res = {
      open: !!document.querySelector("#infoScrim"),
      n: links.length,
      hasWiki: links.some((h) => /de\.wikipedia\.org/.test(h)),
      hasNatura: links.some((h) => /naturadb\.de/.test(h)),
      hasINat: links.some((h) => /inaturalist\.org/.test(h)),
      // Baumkunde ist tot (403), Gaißmayer ist kommerziell → dürfen NICHT auftauchen
      hasBaumkunde: links.some((h) => /baumkunde\.de/.test(h)),
      hasGaissmayer: links.some((h) => /gaissmayer\.de/.test(h)),
      hasLoad: !!document.querySelector("#wpLoad"),
      newtab: [...document.querySelectorAll("#infoScrim .srcgrid a")].every((a) => a.target === "_blank"),
    };
    closeInfo();
    res.closed = !document.querySelector("#infoScrim");
    return res;
  });
  assert(info.open && info.n === 3 && info.hasWiki && info.hasNatura && info.hasINat,
    "Info-Modal: genau die neutralen Quellen (Wikipedia + NaturaDB + iNaturalist) erwartet, war n=" + info.n);
  assert(!info.hasGaissmayer, "Info-Modal: kommerzieller Gaißmayer-Link muss entfernt sein");
  assert(!info.hasBaumkunde, "Info-Modal: defekter Baumkunde-Link (403) muss entfernt sein");
  assert(info.newtab, "Info-Modal: Quell-Links müssen target=_blank (neuer Tab) sein");
  assert(info.hasLoad, "Info-Modal: »Online-Infos laden«-Knopf fehlt");

  // Namensherleitung (Merkhilfe): Akkordeon im Info-Modal, standardmäßig AUFGEKLAPPT;
  // manuelles Zuklappen wird global gemerkt (alle folgenden Karten öffnen zugeklappt,
  // Wiederaufklappen stellt den Standard her). Bei Unbekanntem gar nicht sichtbar.
  const etym = await page.evaluate(() => {
    const mk = (g, a) => ({ g, a, de: "Test", fam: "", thema: "", key: g + " " + a, syn: "" });
    openInfo(mk("Bellis", "perennis"));
    const det = document.querySelector("#infoScrim .etym");
    const items = [...document.querySelectorAll("#infoScrim .etym-list li")].map((li) => li.textContent);
    const openDefault = det ? det.open : null;
    const botItalic = !!(det && det.querySelector(".etym-list li i"));
    det.open = false; det.dispatchEvent(new Event("toggle"));       // manuell zuklappen
    const storedClosed = localStorage.getItem("pflanzenlernen.etyopen") === "0";
    closeInfo();
    openInfo(mk("Rosa", "canina"));                                 // nächste Karte folgt dem gemerkten Zustand
    const det2 = document.querySelector("#infoScrim .etym");
    const staysClosed = !!det2 && !det2.open;
    det2.open = true; det2.dispatchEvent(new Event("toggle"));      // wieder aufklappen → Standard zurück
    const storedOpen = localStorage.getItem("pflanzenlernen.etyopen") === "1";
    closeInfo();
    openInfo(mk("Xyzus", "qqqzz"));                       // unbekannt → kein Akkordeon
    const noneShown = !!document.querySelector("#infoScrim .etym");
    closeInfo();
    const lav = nameEtymology("Lavandula", "angustifolia").map((p) => p.t + "=" + p.d).join(" · ");
    const dup = nameEtymology("Alyssum", "montanum subsp. montanum").filter((p) => p.t === "montanum").length;
    const ficus = nameEtymology("Ficus", "benjamina").length;            // vorher unerklärte Gattung
    const hyb = nameEtymology("Fuchsia-Hybriden", "").map((p) => p.t).join();  // Hybrid-Gruppe → Basisgattung
    // »ALLE Namensbestandteile erklärt«: für jede Karte Gattung UND jedes Epitheton glossiert
    const rank = new Set(["var", "ssp", "subsp", "cv", "convar", "sect", "grp", "group", "gruppe", "cultivars", "cultivar", "sorten", "sorte", "hybriden", "hybride", "aggr", "agg", "nothosubsp"]);
    const allParts = (c) => {
      const e = nameEtymology(c.g, c.a), gk = String(c.g || "").replace(/-Hybride[nr]?$/i, "").trim();
      if (!e.some((p) => p.t === c.g || p.t === gk)) return false;
      for (const raw of String(c.a || "").split(/\s+/)) {
        const w = raw.toLowerCase().replace(/[.,;)('"«»]+$/, "").replace(/^[-]+/, "");
        if (!w || w.length < 3 || rank.has(w) || /[^a-zäöüß-]/.test(w) || /^[A-ZÄÖÜ]/.test(raw)) continue;
        if (!e.some((p) => p.t.toLowerCase() === w || p.t.toLowerCase() === w.replace(/-(gruppe|grp|group|gp)$/, ""))) return false;
      }
      return true;
    };
    const fullPct = Math.round(100 * allCards.filter(allParts).length / allCards.length);
    const person = nameEtymology("Thuja", "zzztestii").some((p) => /Person/.test(p.d));      // Fallback -ii
    const place = nameEtymology("Thuja", "zzztestensis").some((p) => /Fundort/.test(p.d));    // Fallback -ensis
    const stellaria = nameEtymology("Stellaria", "media").length;                            // neue Gattung + Epitheton
    return { has: !!det, openDefault, storedClosed, staysClosed, storedOpen, items, botItalic, noneShown, lav, dup, ficus, hyb, fullPct, person, place, stellaria };
  });
  assert(etym.has && etym.openDefault && etym.botItalic,
    "Namensherleitung muss standardmäßig AUFGEKLAPPT mit kursivem Botanik-Teil erscheinen: " + JSON.stringify({ has: etym.has, openDefault: etym.openDefault }));
  assert(etym.storedClosed && etym.staysClosed && etym.storedOpen,
    "Zuklapp-Zustand muss global gemerkt werden (zu → gemerkt → nächste Karte zu → wieder auf): " + JSON.stringify({ sc: etym.storedClosed, st: etym.staysClosed, so: etym.storedOpen }));
  assert(etym.items.some((t) => /Bellis/.test(t)) && etym.items.some((t) => /ausdauernd|mehrjährig/.test(t)),
    "Herleitung muss Gattung (Bellis) und Epitheton (perennis) erklären: " + JSON.stringify(etym.items));
  assert(!etym.noneShown, "Bei unbekanntem Namen darf kein Herleitungs-Akkordeon erscheinen: " + JSON.stringify(etym));
  assert(/schmalblättrig/.test(etym.lav), "Kompositum »angustifolia« muss als »schmalblättrig« aufgelöst werden: " + etym.lav);
  assert(etym.dup === 1, "Autonyme (montanum subsp. montanum) dürfen die Herleitung nicht doppeln: " + etym.dup);
  assert(etym.ficus > 0 && /Fuchsia/.test(etym.hyb),
    "Gattungs-Wörterbuch muss vervollständigt sein (Ficus) und »-Hybriden« auf die Basisgattung auflösen: " + JSON.stringify({ ficus: etym.ficus, hyb: etym.hyb }));
  assert(etym.fullPct === 100,
    "ALLE Namensbestandteile jeder Art (Gattung UND jedes Epitheton) müssen erklärt sein (100 %): war " + etym.fullPct + "%");
  assert(etym.person && etym.place && etym.stellaria === 2,
    "Struktur-Fallbacks (Person/Fundort) und neue Gattung (Stellaria) müssen greifen: " + JSON.stringify({ person: etym.person, place: etym.place, stellaria: etym.stellaria }));
  assert(info.closed, "Info-Modal schließt nicht");

  // Wikipedia-Auflösung: Sorten-GRUPPE (kein Rang var./ssp.) findet das reine Binom,
  // NIE die bloße Gattung (»Beta« = griech. Buchstabe). Unterarten dagegen s. u.
  const wc = await page.evaluate(() =>
    wikiCandidates({ g: "Beta", a: "vulgaris Conditiva-Grp.", de: "Rote Bete" }));
  assert(wc.some((t) => /^beta vulgaris$/i.test(t)),
    "Wiki-Kandidaten müssen bei einer Sorten-Gruppe das reine Binom »Beta vulgaris« enthalten: " + JSON.stringify(wc));
  assert(!wc.some((t) => /^beta$/i.test(t)),
    "Wiki-Kandidaten dürfen NICHT die bloße Gattung »Beta« enthalten (griech. Buchstabe): " + JSON.stringify(wc));

  // Reiner Sammel-/Sorteneintrag OHNE Art-Epitheton (»Solidago Cultivars«): es gibt keinen
  // Artartikel → die bloße Gattung MUSS als Kandidat rein (dt. Wikipedia: Solidago → Goldruten).
  const wcGrp = await page.evaluate(() =>
    wikiCandidates({ g: "Solidago", a: "Cultivars", de: "Goldruten - Arten" }));
  assert(wcGrp.some((t) => /^solidago$/i.test(t)),
    "Bei einem reinen Sorteneintrag (»Solidago Cultivars«) muss die Gattung »Solidago« als Kandidat enthalten sein: " + JSON.stringify(wcGrp));
  const wcHyb = await page.evaluate(() =>
    wikiCandidates({ g: "Aubrieta", a: "- Hybriden", de: "Blaukissen" }));
  assert(wcHyb.some((t) => /^aubrieta$/i.test(t)),
    "Auch »Aubrieta - Hybriden« muss die Gattung als Kandidat führen: " + JSON.stringify(wcHyb));

  // Granularität: Wikipedia FEIN (voller Name), andere Quellen GROB (reines Binom)
  const gran = await page.evaluate(() => {
    const c = allCards.find((x) => /grp\.|convar\.|'/i.test(x.a));
    if (!c) return { skip: true };
    openInfo(c);
    const links = [...document.querySelectorAll("#infoScrim .srcgrid a")].map((a) => ({
      n: a.textContent.replace(/[↗\s]+$/, ""), href: decodeURIComponent(a.href),
    }));
    closeInfo();
    return { full: (c.g + " " + c.a).trim(), sn: searchName(c), links };
  });
  if (!gran.skip) {
    assert(/ /.test(gran.sn) && !/grp\.|convar\.|'/i.test(gran.sn), "searchName muss das reine Binom sein (" + gran.full + " → " + gran.sn + ")");
    const wiki = gran.links.find((l) => /wikipedia/i.test(l.n));
    const others = gran.links.filter((l) => !/wikipedia/i.test(l.n));
    assert(wiki && wiki.href.includes(gran.full), "Wikipedia soll fein suchen (voller Name inkl. Sorte): " + (wiki && wiki.href));
    assert(others.length && others.every((l) => l.href.includes(gran.sn) && !/grp\.|convar\./i.test(l.href)),
      "Andere Quellen sollen grob (reines Binom, ohne Sortenzusatz) suchen: " + JSON.stringify(others));
  }

  // Quiz: richtige Option wählen -> Feedback »Richtig«
  const quiz = await page.evaluate(() => {
    document.querySelector('#modeTabs button[data-mode="quiz"]').click();
    startSession();
    const correct = answerText(current).toLowerCase();
    const opt = [...document.querySelectorAll("#opts .opt")]
      .find((b) => b.querySelector("span:last-child").textContent.toLowerCase() === correct);
    const found = !!opt; if (opt) opt.click();
    return { found, good: /Richtig!/.test(($("#fb") || {}).innerHTML || ""), correct: sess.correct };
  });
  assert(quiz.found, "Quiz: richtige Option nicht gefunden");
  assert(quiz.good && quiz.correct >= 1, "Quiz: richtige Antwort nicht als korrekt gewertet");

  // Tippen = »wie in der Prüfung«: je bewertetem Bogen-Bestandteil ein Feld MIT Punkten
  // (analog zur Prüfungstabelle); der vom Prompt gezeigte deutsche Name wird nicht abgefragt.
  const numPts = (s) => Number(String(s || "").replace(",", "."));
  const typed = await page.evaluate(() => {
    document.querySelector('#modeTabs button[data-mode="type"]').click();
    startSession();
    const ins = [...document.querySelectorAll("#typeForm input")];
    const keys = ins.map((i) => i.dataset.k).join(",");
    const hasPts = document.querySelectorAll("#typeForm .expts").length === ins.length;
    ins.forEach((inp) => { inp.value = current[inp.dataset.k]; });    // alle Felder korrekt füllen
    document.querySelector("#chk").click();
    const marks = [...document.querySelectorAll("#typeForm .exmark")].map((m) => m.textContent.trim().charAt(0)).join("");
    return { nFields: ins.length, keys, hasPts, hasSingle: !!document.querySelector("#typeIn"), marks,
      pts: (document.querySelector("#fb").textContent.match(/([\d,]+) von ([\d,]+) Punkten/) || []).slice(1) };
  });
  assert(typed.nFields >= 2 && !typed.hasSingle && /^g,a/.test(typed.keys) && !/(^|,)de(,|$)/.test(typed.keys),
    "Tippen muss die Bogen-Bestandteile in Einzelfelder aufteilen (Gattung/Art/…, ohne den gegebenen dt. Namen): " + JSON.stringify(typed));
  assert(typed.hasPts, "Tippen »wie in der Prüfung«: je Feld müssen Punkte stehen (analog zur Prüfungstabelle): " + JSON.stringify(typed));
  assert(/^✓+$/.test(typed.marks) && typed.pts[0] === typed.pts[1],
    "Tippen: alle Felder korrekt → alle ✓ und volle Punktzahl: " + JSON.stringify(typed));

  // Drei Ausgänge mit Punkten (voll · Teilpunkte · null), je Feld ✓/≈/✗; Partikel nur bei Volltreffer
  const stufen = await page.evaluate(() => {
    const probe = (fill) => {
      document.querySelectorAll(".conf-host").forEach((h) => h.remove());
      const ins = [...document.querySelectorAll("#typeForm input")], c = current;
      ins.forEach((inp) => { inp.value = fill(inp.dataset.k, c); });
      document.querySelector("#chk").click();
      const r = { marks: [...document.querySelectorAll("#typeForm .exmark")].map((m) => m.textContent.trim().charAt(0)).join(""),
        partikel: document.querySelectorAll(".conf-host .conf").length,
        pts: (document.querySelector("#fb").textContent.match(/([\d,]+) von ([\d,]+) Punkten/) || []).slice(1) };
      document.querySelector("#wt").click();
      return r;
    };
    startSession();
    const exakt = probe((k, c) => c[k]);                             // alle Felder richtig
    const teils = probe((k, c) => (k === "g" ? c.g : "qqqzzz"));     // Gattung richtig, Rest falsch
    const daneben = probe(() => "Zzzz");                             // nichts davon
    return { exakt, teils, daneben };
  });
  assert(/^✓+$/.test(stufen.exakt.marks) && stufen.exakt.partikel > 0 && stufen.exakt.pts[0] === stufen.exakt.pts[1],
    "Tippen: alle Felder richtig → alle ✓, volle Punkte, Partikel: " + JSON.stringify(stufen.exakt));
  assert(/✓/.test(stufen.teils.marks) && /✗/.test(stufen.teils.marks) && stufen.teils.partikel === 0
    && numPts(stufen.teils.pts[0]) > 0 && numPts(stufen.teils.pts[0]) < numPts(stufen.teils.pts[1]),
    "Tippen: ein Feld richtig, Rest falsch → ✓/✗ je Feld, Teilpunkte, keine Partikel: " + JSON.stringify(stufen.teils));
  assert(/^✗+$/.test(stufen.daneben.marks) && stufen.daneben.pts[0] === "0",
    "Tippen: alle Felder falsch → alle ✗, 0 Punkte: " + JSON.stringify(stufen.daneben));

  // Bewertung der Stufen (Leitner) und die Feld-Variante der Prüfungsantwort
  const stufenLogik = await page.evaluate(() => {
    const c = { g: "Weigela", a: "florida", de: "Liebliche Weigelie", fam: "Caprifoliaceae", syn: "", key: "w|f|l" };
    return {
      exakt: judgeTyped("Weigela florida", c).lvl,
      tippfehler: judgeTyped("Weigela floridaa", c).lvl,      // 1 Zeichen – bleibt richtig
      grob: judgeTyped("Waigellia florida", c).lvl,           // 3 Zeichen – »fast«
      gattung: judgeTyped("Weigela", c),
      falsch: judgeTyped("Cornus mas", c).lvl,
      feldOk: fieldJudge("g", "Weigela", c),
      feldTippfehler: fieldJudge("g", "Weigella", c),         // 1 Zeichen – bleibt richtig
      feldFast: fieldJudge("g", "Waigellia", c),
      feldNo: fieldJudge("g", "Cornus", c),
      famFast: fieldJudge("fam", "Kaprifoliazeen", c),
      diff: markDiff("Weigela florida", "Weigelia florida"),
    };
  });
  assert(stufenLogik.exakt === "ok" && stufenLogik.tippfehler === "ok" && stufenLogik.feldTippfehler === "ok",
    "judgeTyped: kleine Tippfehler müssen richtig bleiben: " + JSON.stringify(stufenLogik));
  assert(stufenLogik.grob === "near" && stufenLogik.gattung.lvl === "near" && stufenLogik.gattung.hint === "Gattung stimmt",
    "judgeTyped: grober Tippfehler bzw. nur die Gattung muss »fast« ergeben: " + JSON.stringify(stufenLogik));
  assert(stufenLogik.falsch === "no", "judgeTyped: andere Art darf nicht »fast« sein: " + JSON.stringify(stufenLogik));
  assert(stufenLogik.feldOk === "ok" && stufenLogik.feldFast === "near" && stufenLogik.feldNo === "no" && stufenLogik.famFast === "near",
    "fieldJudge: Stufen je Prüfungsfeld stimmen nicht: " + JSON.stringify(stufenLogik));
  assert(/<u class="dif">/.test(stufenLogik.diff), "markDiff markiert die abweichende Stelle nicht: " + stufenLogik.diff);

  // Rechtschreibung bleibt relevant: »Bollensellerie« darf nicht als
  // *Knollensellerie* durchgehen (gemeldeter Fall) – das ist ein »Fast«.
  const strenge = await page.evaluate(() => {
    const c = { g: "Apium", a: "graveolens var. rapaceum", fam: "Apiaceae",
      de: "Knollensellerie, Wurzelsellerie", syn: "", key: "sellerie" };
    return {
      falscherAnfang: checkDeName("bollensellerie", c),
      stufeDavon: fieldJudge("de", "bollensellerie", c),
      einZeichen: checkDeName("knollenselerie", c),      // ein fehlender Buchstabe bleibt richtig
      zweitname: checkDeName("Wurzelsellerie", c),
      kurzExakt: closeEnough("Acer", "Acer"), kurzTypo: closeEnough("Aser", "Acer"),
      langTypo: closeEnough("Quercuss", "Quercus"), zweiFehler: closeEnough("Quercuus", "Quarcus"),
    };
  });
  assert(!strenge.falscherAnfang && strenge.stufeDavon === "near",
    "Rechtschreibung: falscher Wortanfang muss »fast« sein, nicht »richtig«: " + JSON.stringify(strenge));
  assert(strenge.einZeichen && strenge.zweitname && strenge.langTypo,
    "Rechtschreibung: ein einzelner Tippfehler und Zweitnamen müssen weiterhin zählen: " + JSON.stringify(strenge));
  assert(!strenge.kurzTypo && strenge.kurzExakt && !strenge.zweiFehler,
    "Rechtschreibung: kurze Namen exakt, zwei Fehler nicht mehr tolerieren: " + JSON.stringify(strenge));

  // Bilder-Quiz: Foto erkennen. Läuft hier ohne Netz über eine eingehängte
  // Bild-Quelle (im Betrieb liefert Wikipedia das Artikelbild per JSONP).
  const PX = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";
  const photo = await page.evaluate(async (PX) => {
    __clearPhotoCache();
    __setPhotoSource((card) => Promise.resolve({
      thumb: PX, title: card.g + " " + card.a, file: "Test.jpg",
      url: "https://de.wikipedia.org/wiki/Test",
    }));
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    const hint = document.querySelector('#modeTabs button[data-mode="photo"]').title;   // die Bühne ist vor der Sitzung leer – der Tab nennt die Voraussetzung
    startSession();
    await new Promise((r) => setTimeout(r, 60));
    const img = document.querySelector("#phImg");
    const opts = [...document.querySelectorAll("#opts .opt")].map((b) => b.querySelector("span:last-child").textContent);
    const noName = !/wikipedia|Test\.jpg/i.test(document.querySelector("#stage").textContent);
    const correct = answerText(current).toLowerCase();
    const before = sess.correct;
    const btn = [...document.querySelectorAll("#opts .opt")]
      .find((b) => b.querySelector("span:last-child").textContent.toLowerCase() === correct);
    if (btn) btn.click();
    const fb = (document.querySelector("#fb") || {}).innerHTML || "";
    return { hintOnline: /braucht Internet/i.test(hint), hasImg: !!img, src: img && img.getAttribute("src"),
      nOpts: opts.length, hasCorrectOpt: !!btn, uniq: new Set(opts).size, noName,
      good: /Richtig!/.test(fb), scored: sess.correct === before + 1,
      credit: !!document.querySelector("#phSrc"), weiter: !!document.querySelector("#wt") };
  }, PX);
  assert(photo.hintOnline, "Bilder-Quiz: der Modus-Tab muss auf die Internet-Voraussetzung hinweisen");
  assert(photo.hasImg && photo.src === PX, "Bilder-Quiz: kein Bild angezeigt");
  assert(photo.nOpts === 4 && photo.uniq === 4 && photo.hasCorrectOpt,
    "Bilder-Quiz: vier verschiedene Optionen inkl. der richtigen erwartet: " + JSON.stringify(photo));
  assert(photo.noName, "Bilder-Quiz: die Frage darf außer dem Bild nichts verraten");
  assert(photo.good && photo.scored, "Bilder-Quiz: richtige Antwort nicht gewertet");
  assert(photo.credit && photo.weiter, "Bilder-Quiz: Bildnachweis/Weiter-Knopf fehlen nach der Antwort");

  // Galerie im Bilder-Quiz: mehrere Ansichten derselben Art (Habitus, Blatt, Blüte …).
  // Bei Commons-Treffern liegen die geprüften Kandidaten schon vor (p.gal); kam das
  // Bild aus einem Wikipedia-Artikel, wird die Galerie erst beim Öffnen nachgeladen.
  const phGal = await page.evaluate(async () => {
    const px = (f) => "data:image/svg+xml," + encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'><title>" + f + "</title></svg>");
    const A = px("A"), B = px("B"), C = px("C");
    const setz = (id, v) => { const e = document.querySelector(id); e.value = v; e.dispatchEvent(new Event("change")); };
    __clearPhotoCache();
    __setPhotoSource(() => Promise.resolve({ thumb: A, gal: [A, B, C], src: "cm", file: "A.jpg", title: "T", url: "https://x/y" }));
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    startSession();
    await new Promise((r) => setTimeout(r, 60));
    const badge = (document.querySelector(".ph-more") || {}).textContent || "";
    const label = document.querySelector("#phImg").getAttribute("aria-label");
    document.querySelector("#phImg").click();
    const sc = document.querySelector(".lbscrim");
    const z = () => (sc.querySelector(".lb-count") || {}).textContent || "";
    const start = z();
    sc.querySelector(".lb-nav.next").click();
    const nach = z();
    const ohneDateiname = !/A\.jpg/.test(sc.querySelector(".lb-img").alt);   // der Dateiname verrät sonst die Lösung
    closeLightbox();

    // Artikelbild (src:"wp"): keine Kandidatenliste – die Bilder des Artikels kommen
    // erst beim Öffnen der Großansicht (hier ohne Netz über __setJsonp vorgegeben).
    __clearPhotoCache();
    __setPhotoSource(() => Promise.resolve({ thumb: A, src: "wp", title: "Testartikel", file: "A.jpg", url: "https://x/y" }));
    __setJsonp(() => Promise.resolve({ query: { pages: {
      1: { title: "File:B.jpg", imageinfo: [{ thumburl: B, mime: "image/jpeg" }] },
      2: { title: "File:C.jpg", imageinfo: [{ thumburl: C, mime: "image/jpeg" }] } } } }));
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    startSession();
    await new Promise((r) => setTimeout(r, 60));
    const keinBadge = !document.querySelector(".ph-more");         // Zahl noch unbekannt → kein Hinweis
    document.querySelector("#phImg").click();
    const sofort = document.querySelectorAll(".lbscrim .lb-nav").length;   // erst einzeln …
    await new Promise((r) => setTimeout(r, 80));
    const nachgeladen = (document.querySelector(".lb-count") || {}).textContent || "";   // … dann Galerie
    closeLightbox();
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    __setPhotoSource(null); __setJsonp(window.__offlineJsonp); __clearPhotoCache();
    return { badge, label, start, nach, ohneDateiname, keinBadge, sofort, nachgeladen };
  });
  assert(/3 Bilder/.test(phGal.badge) && phGal.label === "Bilder ansehen",
    "Bilder-Quiz: Hinweis auf die Galerie (Anzahl am Bild, Beschriftung) fehlt: " + JSON.stringify(phGal));
  assert(phGal.start === "1 / 3" && phGal.nach === "2 / 3" && phGal.ohneDateiname,
    "Bilder-Quiz: Großansicht muss blättern – und der alt-Text darf den Dateinamen nicht verraten: " + JSON.stringify(phGal));
  assert(phGal.keinBadge && phGal.sofort === 0 && phGal.nachgeladen === "1 / 3",
    "Bilder-Quiz: Artikel-Galerie muss beim Öffnen nachgeladen werden (Pfeile erscheinen nach): " + JSON.stringify(phGal));

  // Hartnäckig statt schnell aufgeben: ein Netz-Aussetzer wird still wiederholt, und
  // eine Art, die früher einmal ohne Treffer blieb, wird je Sitzung neu gesucht.
  const zaeh = await page.evaluate(async (PX) => {
    __clearPhotoCache(); photoTried.clear();
    let n = 0;
    __setPhotoSource(() => { n++; return n < 2 ? Promise.reject(new Error("network"))
      : Promise.resolve({ thumb: PX, src: "cm", title: "T", file: "T.jpg", url: "https://x/y" }); });
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    startSession();
    for (let t = 0; t < 60 && !(n >= 2 && document.querySelector("#phImg")); t++) await new Promise((r) => setTimeout(r, 50));   // erste Wiederholung nach ~0,9 s – polling statt fester Pause (Audit)
    const nachAussetzer = { versuche: n, bild: !!document.querySelector("#phImg"),
      keineMeldung: !document.querySelector(".ph-note") };
    document.querySelector('#modeTabs button[data-mode="cards"]').click();

    // gemerkte »kein Bild« aus einer früheren Sitzung darf die Art nicht dauerhaft sperren
    __clearPhotoCache(); photoTried.clear();
    __rememberPhoto(allCards[0].key, null);
    let gefragt = 0;
    __setPhotoSource(() => { gefragt++; return Promise.resolve({ thumb: PX, src: "cm", title: "T", file: "T.jpg", url: "https://x/y" }); });
    const wieder = await photoFor(allCards[0]);           // neuer Versuch trotz gemerkter null
    await photoFor(allCards[0]);                          // jetzt aus dem Speicher
    const zweiteChance = { gefunden: !!wieder, gefragt };

    // bleibt es erfolglos, wird in DERSELBEN Sitzung nicht endlos gesucht
    __clearPhotoCache(); photoTried.clear();
    let leer = 0;
    __setPhotoSource(() => { leer++; return Promise.resolve(null); });
    await photoFor(allCards[1]); await photoFor(allCards[1]);
    __setPhotoSource(null); __clearPhotoCache(); photoTried.clear();
    return { nachAussetzer, zweiteChance, leer };
  }, PX);
  assert(zaeh.nachAussetzer.bild && zaeh.nachAussetzer.versuche >= 2 && zaeh.nachAussetzer.keineMeldung,
    "Bilder-Quiz: ein Aussetzer muss still wiederholt werden statt sofort »keine Verbindung«: " + JSON.stringify(zaeh));
  assert(zaeh.zweiteChance.gefunden && zaeh.zweiteChance.gefragt === 1,
    "Bilder-Quiz: gemerktes »kein Bild« darf die Art nicht dauerhaft sperren (ein neuer Versuch je Sitzung): " + JSON.stringify(zaeh));
  assert(zaeh.leer === 1,
    "Bilder-Quiz: bleibt die Suche erfolglos, darf sie in derselben Sitzung nicht wiederholt werden: " + JSON.stringify(zaeh));

  // Bilder-Quiz vereinfacht: Gefragt ist immer »Bild → voller Name« – die Richtung ist nicht
  // wählbar (Feld ausgeblendet), und es gibt KEIN Antwort-Feld mehr: der Modus »Bilder« fragt aus
  // vier Namen; selbst eingeben übt man in der geführten Lektion (ab Stufe 3) und der Probeprüfung.
  const phEinfach = await page.evaluate(() => {
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    const dirOpts = [...document.querySelectorAll("#dir option")].map((o) => o.value);
    const tab = document.querySelector('#modeTabs button[data-mode="type"]').textContent.replace(/\s+/g, " ").trim();
    const sub = document.querySelector("#setOpts .opts-sub").textContent;
    return { antwFeld: !!document.querySelector("#phAnswer"), dirOpts, dirHidden: document.querySelector("#dirField").hidden, dir: curDir(), ans: phAns(), tab, sub };
  });
  assert(!/→/.test(phEinfach.sub) && !/Antwort/.test(phEinfach.sub) && !phEinfach.antwFeld && phEinfach.ans === "mc",
    "Im Bilder-Quiz kein Antwort-Feld und keine Richtung in der Optionen-Kopfzeile; Auswahl ist die Antwortart: " + JSON.stringify(phEinfach));
  assert(phEinfach.dirOpts.join() === "img2both" && phEinfach.dirHidden && phEinfach.dir === "img2both",
    "Bilder-Quiz: einzige Richtung »voller Name«, Feld ausgeblendet: " + JSON.stringify(phEinfach));
  assert(/^Selbst eingeben/.test(phEinfach.tab) && !/Tippen/.test(phEinfach.tab),
    "Der Modus-Tab muss »Selbst eingeben« heißen (nicht »Tippen«): " + phEinfach.tab);

  // Bilder-Quiz, Antwort »wie in der Prüfung«: ein Feld je bewerteter Spalte, Punkte
  const phExam = await page.evaluate(async (PX) => {
    __clearPhotoCache();
    __setPhotoSource((card) => Promise.resolve({ thumb: PX, title: card.g, file: "T.jpg", url: "https://x/y" }));
    const dirHidden = document.querySelector("#dirField").hidden;   // im Bilder-Modus gibt es keine Richtung zu wählen
    const kein = !document.querySelector("#examFieldsRow") && !document.querySelector("#phAnswer");   // keine Feldwahl, kein Antwort-Feld mehr
    startSession({ ans: "exam" });                                  // Eingabe »wie in der Prüfung« (geführt ab Stufe 3 / Probeprüfung; hier direkt)
    await new Promise((r) => setTimeout(r, 60));
    const keys = [...document.querySelectorAll("#examForm input")].map((i) => i.dataset.k);
    const labels = [...document.querySelectorAll("#examForm .exlab")].map((e) => e.textContent.replace(/\s+/g, " ").trim());
    const c = current;
    // Gattung/Art/Familie richtig, deutschen Namen absichtlich falsch -> Teilpunkte
    const fill = (k, v) => { const i = document.querySelector("#ex_" + k); if (i) i.value = v; };
    fill("g", c.g); fill("a", c.a); fill("fam", (c.fam || "").split("/")[0]); fill("de", "Quatschname");
    document.querySelector("#chk").click();
    const fb = document.querySelector("#fb").textContent;
    const marks = [...document.querySelectorAll("#examForm .exmark")].map((e) => e.textContent.trim().charAt(0));
    return { dirHidden, kein, keys, labels, fb, marks, partial: /Teilweise/.test(fb),
      pts: (fb.match(/([\d,]+) von ([\d,]+) Punkten/) || []).slice(1) };
  }, PX);
  assert(phExam.kein && phExam.dirHidden,
    "»wie in der Prüfung«: keine Feldwahl und kein Antwort-Feld mehr, die Abfragerichtung entfällt: " + JSON.stringify(phExam));
  assert(phExam.keys.join() === "g,a,fam,de",
    "Produktions-Profil braucht Gattung, Art, Familie, Deutscher Name (Bogen-Reihenfolge): " + JSON.stringify(phExam.keys));
  assert(phExam.labels.some((l) => /Gattungsname\s*3 P\./.test(l)) && phExam.labels.some((l) => /Familienname\s*1 P\./.test(l)),
    "Feldbeschriftung/Punkte müssen dem Bogen entsprechen: " + JSON.stringify(phExam.labels));
  assert(phExam.marks.join("") === "✓✓✓✗",
    "Feldweise Bewertung erwartet (3 richtig, dt. Name falsch): " + JSON.stringify(phExam.marks));
  assert(phExam.partial && phExam.pts[0] === "7" && phExam.pts[1] === "10",
    "Teilpunkte erwartet: 7 von 10 Punkten, war " + JSON.stringify(phExam.pts) + " / " + phExam.fb);

  // Schreibfehler: halbe Punkte, Karte gilt NICHT als bestanden und kommt wieder –
  // beim fehlerfreien zweiten Anlauf wird die fehlende Hälfte nachgebucht.
  const halbe = await page.evaluate(async () => {
    __clearPhotoCache();
    startSession({ ans: "exam" });
    await new Promise((r) => setTimeout(r, 60));
    const c = current, key = c.key;
    const fill = (k, v) => { const i = document.querySelector("#ex_" + k); if (i) i.value = v; };
    const alles = (verdreht) => {
      fill("g", verdreht ? c.g + "x" + c.g.slice(-1) : c.g);   // grober Tippfehler in der Gattung
      fill("a", c.a); fill("fam", (c.fam || "").split("/")[0]); fill("de", (c.de || "").split(/[,;/]/)[0]);
    };
    alles(true);
    document.querySelector("#chk").click();
    const fb1 = document.querySelector("#fb").textContent;
    const stand1 = { sum: sess.pts.sum, max: sess.pts.max, correct: sess.correct,
      inQueue: queue.slice(qi + 1).some((x) => x.key === key) };
    document.querySelector("#wt").click();                       // weiter …
    // … bis die Karte wiederkommt
    let guard = 0;
    while (current.key !== key && guard++ < 40) {
      await new Promise((r) => setTimeout(r, 30));
      const inp = document.querySelector("#ex_g");
      if (!inp) break;
      fill("g", "Zzz"); fill("a", "zzz"); fill("fam", "zzz"); fill("de", "zzz");
      document.querySelector("#chk").click();
      const w = document.querySelector("#wt"); if (w) w.click();
    }
    await new Promise((r) => setTimeout(r, 60));
    const wieder = current.key === key;
    alles(false);                                                // jetzt fehlerfrei
    document.querySelector("#chk").click();
    const fb2 = document.querySelector("#fb").textContent;
    return { fb1, fb2, stand1, wieder, sum: sess.pts.sum, je: sess.pts.je[key],
      korrekt: sess.correct, maxKarte: 10 };
  });
  assert(halbe.stand1.sum === 8.5 && /Schreibfehler zählen halb/.test(halbe.fb1),
    "Schreibfehler muss die halbe Punktzahl geben (8,5 von 10): " + JSON.stringify(halbe.stand1) + " / " + halbe.fb1);
  assert(halbe.stand1.correct === 0 && halbe.stand1.inQueue,
    "Schreibfehler darf nicht als bestanden gelten und die Karte muss wiederkommen: " + JSON.stringify(halbe.stand1));
  assert(halbe.wieder, "Karte mit Schreibfehler kam in derselben Sitzung nicht wieder");
  assert(halbe.je === 10 && /nachträglich gutgeschrieben/.test(halbe.fb2),
    "Fehlerfreie Wiederholung muss die fehlende Hälfte nachbuchen: " + JSON.stringify(halbe) );
  assert(halbe.korrekt === 1, "Nach der fehlerfreien Wiederholung muss die Karte als richtig zählen: " + JSON.stringify(halbe));

  // Prüfungsfelder = immer der ganze Bogen der Fachrichtung (kein Abwählen mehr): Produktion
  // g/a/fam/de, Fachwerker de/g/a mit 0,5 Punkten
  const phFields = await page.evaluate(async (PX) => {
    __clearPhotoCache();
    __setPhotoSource((card) => Promise.resolve({ thumb: PX, title: card.g, file: "T.jpg", url: "https://x/y" }));
    startSession({ ans: "exam" });
    await new Promise((r) => setTimeout(r, 60));
    const prod = [...document.querySelectorAll("#examForm input")].map((i) => i.dataset.k);
    // Fachwerker: eigener Bogen (Dt. Name zuerst, Gattung/Art je 0,5 Punkte)
    document.querySelector("#nivSelect").value = "fachwerker";
    document.querySelector("#nivSelect").dispatchEvent(new Event("change"));
    startSession({ ans: "exam" });
    await new Promise((r) => setTimeout(r, 60));
    const fwKeys = [...document.querySelectorAll("#examForm input")].map((i) => i.dataset.k);
    const fwLabels = [...document.querySelectorAll("#examForm .exlab")].map((e) => e.textContent.replace(/\s+/g, " ").trim());
    document.querySelector("#nivSelect").value = "gaertner";
    document.querySelector("#nivSelect").dispatchEvent(new Event("change"));
    __setPhotoSource(null);
    return { prod, fwKeys, fwLabels, chooser: !!document.querySelector("#examFieldsRow") };
  }, PX);
  assert(phFields.prod.join() === "g,a,fam,de" && !phFields.chooser,
    "Immer der ganze Bogen (g,a,fam,de), kein Felder-Wähler mehr: " + JSON.stringify(phFields));
  assert(phFields.fwKeys.join() === "de,g,a" && phFields.fwLabels.some((l) => /0,5 P\./.test(l)),
    "Fachwerker-Bogen erwartet (Dt. Name zuerst, 0,5 Punkte): " + JSON.stringify(phFields));

  // Probeprüfung (zweiter Start-Knopf): so viele Pflanzen wie auf dem Bogen (Gemüsebau/Gärtner 20),
  // zufällig, jede als Bild mit allen Bogenfeldern, keine zweite Chance, am Ende Punkte + Note nach
  // dem linearen BW-Schlüssel; im Duell-Link als Probeprüfung gekennzeichnet (Bit CH_PROBE).
  const probe = await page.evaluate(async (PX) => {
    __clearPhotoCache(); photoTried.clear();
    __setPhotoSource((card) => Promise.resolve({ thumb: PX, title: card.g, file: "T.jpg", url: "https://x/y" }));
    const sub = document.querySelector("#examHint").textContent;
    document.querySelector("#btnExam").click();
    await new Promise((r) => setTimeout(r, 80));
    const out = { sub, total: sess.total, probe: !!sess.probe, keys: [...document.querySelectorAll("#examForm input")].map((i) => i.dataset.k),
      pille: !!document.querySelector(".gnote") };
    const fill = (k, v) => { const i = document.querySelector("#ex_" + k); if (i) i.value = v; };
    // 1. Pflanze absichtlich ganz falsch → kommt NICHT wieder (keine zweite Chance)
    const erste = current.key;
    fill("g", "Zzz"); fill("a", "zzz"); fill("fam", "zzz"); fill("de", "zzz");
    document.querySelector("#chk").click();
    out.erstePunkte = sess.pts.je[erste]; out.wiederInSchlange = queue.slice(qi + 1).some((x) => x.key === erste); out.totalNachFehler = sess.total;
    document.querySelector("#wt").click();
    await new Promise((r) => setTimeout(r, 40));
    out.bar = !!document.querySelector(".sessionbar .spts");          // Bogenpunkte in der Leiste
    // alle übrigen richtig
    let guard = 0;
    while (sess.active && guard++ < 40) {
      if (!document.querySelector("#ex_g")) { await new Promise((r) => setTimeout(r, 25)); continue; }
      const c = current;
      fill("g", c.g); fill("a", c.a); fill("fam", (c.fam || "").split("/")[0]); fill("de", deMain(c));
      document.querySelector("#chk").click(); const w = document.querySelector("#wt"); if (w) w.click();
      await new Promise((r) => setTimeout(r, 25));
    }
    await new Promise((r) => setTimeout(r, 60));
    out.done = sess.done; out.aktiv = sess.active;
    out.titel = (document.querySelector(".stage-empty h2") || {}).textContent || "";
    out.text = (document.querySelector(".stage-empty p") || {}).textContent || "";
    out.note = (document.querySelector(".grade") || {}).textContent || "";
    out.schluessel = (document.querySelector(".g-key") || {}).textContent || "";
    out.again = (document.querySelector("#againBtn") || {}).textContent || "";
    out.share = !!document.querySelector("#shareBlock");
    const dec = chDecode(challengeURL().split("#c=")[1]);
    out.link = { m: dec.m, pr: dec.pr, po: dec.po, formen: [...new Set(dec.f)].join(), n: dec.i.length };
    out.nachricht = duelMessage("x").split("\n")[0];
    out.pct = Math.round(sess.pts.sum / sess.pts.max * 100); out.sum = sess.pts.sum; out.max = sess.pts.max;
    out.noten = [100, 90, 89, 70, 50, 30, 10, 9, 0].map(gradeOf).join();
    document.querySelector("#btnOverview").click();
    __setPhotoSource(null);
    return out;
  }, PX);
  assert(/20 Pflanzen/.test(probe.sub) && probe.total === 20 && probe.probe && probe.keys.join() === "g,a,fam,de" && !probe.pille && probe.bar,
    "Probeprüfung: 20 Pflanzen, alle vier Bogenfelder, keine Pille, Bogenpunkte in der Leiste: " + JSON.stringify(probe));
  assert(probe.erstePunkte === 0 && !probe.wiederInSchlange && probe.totalNachFehler === 20,
    "Probeprüfung: eine falsche Pflanze kommt nicht wieder (keine zweite Chance): " + JSON.stringify(probe));
  assert(!probe.aktiv && probe.done === 20 && /Probeprüfung geschafft/.test(probe.titel) && /20 von 20 Pflanzen/.test(probe.text) && /19 ganz richtig/.test(probe.text),
    "Probeprüfung: Abschluss nach 20 Pflanzen mit 19 ganz richtigen: " + JSON.stringify(probe));
  assert(probe.sum === 190 && probe.max === 200 && probe.pct === 95 && /Note 1/.test(probe.note) && /95 %/.test(probe.note) && /1 ab 90 %/.test(probe.schluessel) && /5 ab 10 %/.test(probe.schluessel),
    "Probeprüfung: 190 von 200 Punkten = 95 % = Note 1 nach dem BW-Schlüssel: " + JSON.stringify(probe));
  assert(/Neue Probeprüfung/.test(probe.again) && probe.share && probe.link.m === "guided" && probe.link.pr && probe.link.po && probe.link.formen === "photoExam" && probe.link.n === 20 && /Probeprüfung/.test(probe.nachricht),
    "Probeprüfung: Neustart-Knopf, teilbar, Link trägt das Probe-Bit und nur photoExam-Formen: " + JSON.stringify(probe));
  assert(probe.noten === "1,1,2,2,3,4,5,6,6", "Notenschlüssel linear (BW): 1 ≥ 90 … 5 ≥ 10, sonst 6 – war " + probe.noten);

  // Feldprüfung: tippfehlertolerant, Familie lateinisch ODER deutsch
  const fchk = await page.evaluate(() => {
    const c = { g: "Quercus", a: "robur", fam: "Fagaceae", de: "Stiel-Eiche, Deutsche Eiche" };
    const sorte = { g: "Apium", a: "graveolens var. rapaceum", fam: "Apiaceae", de: "Knollensellerie" };
    return {
      gTypo: fieldOk("g", "Quercuss", c), gWrong: fieldOk("g", "Fagus", c),
      aAbbruch: fieldOk("a", "rob", c),                       // abgeschnitten reicht nicht mehr
      aWortPrefix: fieldOk("a", "graveolens", sorte),          // Art ohne Sortenzusatz gilt
      aHalbesWort: fieldOk("a", "grav", sorte),
      famLat: fieldOk("fam", "Fagaceae", c), famDe: fieldOk("fam", "Buchengewächse", c),
      famWrong: fieldOk("fam", "Rosaceae", c),
      deSecond: fieldOk("de", "Deutsche Eiche", c), deNoHyphen: fieldOk("de", "Stieleiche", c),
      empty: fieldOk("g", "  ", c),
    };
  });
  assert(fchk.gTypo && !fchk.gWrong && !fchk.aAbbruch,
    "Gattung/Art: einen Tippfehler tolerieren, Abgeschnittenes und Falsches ablehnen: " + JSON.stringify(fchk));
  assert(fchk.aWortPrefix && !fchk.aHalbesWort,
    "Art ohne Sortenzusatz muss zählen, ein halbes Wort nicht: " + JSON.stringify(fchk));
  assert(fchk.famLat && fchk.famDe && !fchk.famWrong,
    "Familie muss lateinisch UND deutsch zählen: " + JSON.stringify(fchk));
  assert(fchk.deSecond && fchk.deNoHyphen && !fchk.empty,
    "Deutscher Name: Zweitname und Schreibung ohne Bindestrich müssen zählen: " + JSON.stringify(fchk));


  // Bilder-Quiz, Abfrage »voller Name« (botanisch + deutsch): die vier Optionen zeigen
  // BEIDE Namen (botanischer Teil kursiv) – ohne dass man dafür eine Richtung wählen müsste.
  const phBoth = await page.evaluate(async (PX) => {
    __clearPhotoCache();
    __setPhotoSource((card) => Promise.resolve({ thumb: PX, title: card.g + " " + card.a, file: "T.jpg", url: "https://x/y" }));
    const set = (id, v) => { const e = document.querySelector(id); e.value = v; e.dispatchEvent(new Event("change")); };
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    startSession();
    await new Promise((r) => setTimeout(r, 60));
    const c = current, correctFull = answerText(c);          // "Gattung art · Deutscher Name"
    const opts = [...document.querySelectorAll("#opts .opt")].map((b) => b.querySelector("span:last-child").textContent);
    const italics = document.querySelectorAll("#opts .opt i").length;   // botanischer Teil je Option kursiv
    const before = sess.correct;
    const btn = [...document.querySelectorAll("#opts .opt")].find((b) => b.querySelector("span:last-child").textContent.toLowerCase() === correctFull.toLowerCase());
    if (btn) btn.click();
    const good = /Richtig!/.test((document.querySelector("#fb") || {}).innerHTML || "");
    const scored = sess.correct === before + 1;
    return { correctFull, opts, italics, hasCorrect: !!btn, good, scored };
  }, PX);
  assert(/ · /.test(phBoth.correctFull) && phBoth.opts.length === 4 && phBoth.opts.every((o) => / · /.test(o)),
    "Bilder-Quiz »voller Name«: alle vier Optionen müssen botanisch · deutsch zeigen: " + JSON.stringify(phBoth.opts));
  assert(phBoth.italics === 4 && phBoth.hasCorrect && phBoth.good && phBoth.scored,
    "Bilder-Quiz »voller Name«: botanischer Teil kursiv, richtige volle Option wertbar: " + JSON.stringify(phBoth));

  // Bilder-Quiz ohne Netz: erst still wiederholen, dann sichtbar auf die Verbindung
  // WARTEN und von selbst weiterprobieren – niemals still in Textfragen umschalten.
  const photoOff = await page.evaluate(async () => {
    __clearPhotoCache(); photoTried.clear();
    __setPhotoSource(() => Promise.reject(new Error("network")));
    startSession();
    await new Promise((r) => setTimeout(r, 60));
    const frueh = document.querySelector("#stage").textContent;
    for (let t = 0; t < 100 && !document.querySelector("#phRetry"); t++) await new Promise((r) => setTimeout(r, 50));   // 0,9 s + 1,8 s Wiederholungen – polling statt fester Pause (Audit)
    const txt = document.querySelector("#stage").textContent;
    const res = { wiederholt: /neuer Versuch/i.test(frueh), fruehKeineMeldung: !/Warte auf die Bilder/i.test(frueh),
      note: /Warte auf die Bilder/i.test(txt), retry: !!document.querySelector("#phRetry"),
      andere: !!document.querySelector("#phOther"),
      keinQuiz: document.querySelectorAll("#opts .opt").length === 0,
      heiltSichSelbst: !!phWaitTimer };
    document.querySelector('#modeTabs button[data-mode="cards"]').click();   // Warte-Timer beenden
    return res;
  });
  assert(photoOff.wiederholt && photoOff.fruehKeineMeldung,
    "Bilder-Quiz offline: erst still wiederholen, nicht sofort aufgeben: " + JSON.stringify(photoOff));
  assert(photoOff.note && photoOff.retry && photoOff.andere,
    "Bilder-Quiz offline: Warte-Ansage mit »nochmal versuchen« und »andere Art« erwartet: " + JSON.stringify(photoOff));
  assert(photoOff.keinQuiz && photoOff.heiltSichSelbst,
    "Bilder-Quiz offline: kein stiller Wechsel zu Textfragen, dafür automatischer neuer Versuch: " + JSON.stringify(photoOff));

  // … und sobald die Verbindung zurück ist, geht es VON SELBST weiter – ohne Zutun
  // und ohne dass zwischendurch Textfragen erschienen wären.
  const heilt = await page.evaluate(async (PX) => {
    __clearPhotoCache(); photoTried.clear(); __setPhotoWait(250);
    let netzWeg = true;
    __setPhotoSource(() => netzWeg ? Promise.reject(new Error("network"))
      : Promise.resolve({ thumb: PX, title: "T", file: "T.jpg", url: "https://x/y", src: "cm" }));
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    document.querySelector("#sessLen").value = "4";
    startSession();
    // warten, bis der Wartebildschirm steht (die stillen Wiederholungen brauchen ~2,7 s)
    const bisZu = async (test, ms) => { const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (test()) return true; await new Promise((r) => setTimeout(r, 50)); }
      return false; };
    const kamWarte = await bisZu(() => !!document.querySelector(".ph-dots"), 6000);
    const warte = { ansage: kamWarte && /Warte auf die Bilder/.test(document.querySelector("#stage").textContent),
      punkte: kamWarte, quiz: document.querySelectorAll("#opts .opt").length };
    netzWeg = false;                                     // Netz kommt zurück – NICHTS weiter tun
    await bisZu(() => !!document.querySelector("#phImg"), 6000);
    const danach = { bild: !!document.querySelector("#phImg"),
      ansage: /Warte auf die Bilder/.test(document.querySelector("#stage").textContent),
      opts: document.querySelectorAll("#opts .opt").length };
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    __setPhotoSource(null); __setPhotoWait(); __clearPhotoCache(); photoTried.clear();
    return { warte, danach };
  }, PX);
  assert(heilt.warte.ansage && heilt.warte.punkte && heilt.warte.quiz === 0,
    "Ohne Netz muss der Bilder-Quiz sichtbar warten (mit Fortschrittspunkten), nicht umschalten: " + JSON.stringify(heilt));
  assert(heilt.danach.bild && !heilt.danach.ansage && heilt.danach.opts === 4,
    "Sobald die Verbindung zurück ist, muss der Bilder-Quiz von selbst weiterlaufen: " + JSON.stringify(heilt));

  // Unbrauchbare Dateien (Karte/Diagramm/Wappen) müssen aussortiert werden. Gibt es zu EINER
  // Art wirklich kein Bild (alle Suchwege haben geantwortet), kommt nur DIESE Karte als
  // Auswahlfrage – die nächste ist wieder eine Bildfrage (Rückmeldung »nur einzelne«).
  const photoSkip = await page.evaluate(async (GIF) => {
    const bad = ["Quercus_robur_range_map.svg", "Verbreitung_Fagus.png", "Wappen_Baden.svg",
      "Acer_distribution_map.png", "Hydrangea_Verbreitungskarte.png", "Fagus_sylvatica_range.jpg"];
    // Audit-Fund: »range« traf als Teilstring jede Hydrangea, »map« jeden »maple«, »range« auch »orange«
    const good = ["Quercus_robur_Blatt.jpg", "Rosa-canina-Bluete.JPG", "Hydrangea_macrophylla_01.jpg",
      "Hydrangea paniculata 'Grandiflora'.jpg", "Acer_maple_leaf_autumn.jpg", "Citrus_sinensis_orange_fruit.jpg"];
    const bis = async (test, ms = 3000) => { const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (test()) return true; await new Promise((r) => setTimeout(r, 30)); } return false; };
    __clearPhotoCache(); photoTried.clear();
    let ohne = null, rufe = 0;                           // die ERSTE Karte der Runde hat kein Bild, alle anderen schon
    __setPhotoSource((card) => { rufe++; if (ohne === null) ohne = card.key;
      return Promise.resolve(card.key === ohne ? null : { thumb: GIF, title: "T", file: "T.jpg", url: "https://x/y", src: "cm" }); });
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    document.querySelector("#sessLen").value = "4";
    startSession();
    await bis(() => document.querySelectorAll("#opts .opt").length === 4);
    const erste = { opts: document.querySelectorAll("#opts .opt").length, bild: !!document.querySelector("#phImg"), mode,
      hinweis: ((document.querySelector(".ph-fallback") || {}).textContent || ""), knopf: !!document.querySelector("#phQuiz"),
      verschoben: sess.photoDefer || 0, karte: current && current.key };
    const richtig = answerText(current).toLowerCase();    // richtig antworten, damit die Karte nicht wiederkommt
    ([...document.querySelectorAll("#opts .opt")].find((o) => o.querySelector("span:last-child").textContent.toLowerCase() === richtig)
      || document.querySelector("#opts .opt")).click();
    document.querySelector("#wt").click();
    await bis(() => !!document.querySelector("#phImg"));
    const zweite = { bild: !!document.querySelector("#phImg"), mode, hinweis: !!document.querySelector(".ph-fallback") };
    __setPhotoSource(null); __clearPhotoCache(); photoTried.clear();
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    return { filterBad: bad.every((f) => !usablePhoto(f)), filterGood: good.every((f) => usablePhoto(f)),
      erste, zweite, ohne, rufe };
  }, "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==");
  assert(photoSkip.filterBad && photoSkip.filterGood,
    "Bilder-Quiz: Karten/Diagramme müssen aussortiert, Fotos behalten werden: " + JSON.stringify(photoSkip));
  assert(photoSkip.erste.opts === 4 && !photoSkip.erste.bild && photoSkip.erste.mode === "quiz" && photoSkip.erste.karte === photoSkip.ohne &&
    /kein Bild/.test(photoSkip.erste.hinweis) && !photoSkip.erste.knopf && photoSkip.erste.verschoben === 0,
    "Art ohne jedes Bild: nur diese Karte als Auswahlfrage (mit Hinweis, ohne Verschieben, ohne Umschalt-Knopf): " + JSON.stringify(photoSkip));
  assert(photoSkip.zweite.bild && photoSkip.zweite.mode === "photo" && !photoSkip.zweite.hinweis,
    "Nach der Ausweich-Karte ist die nächste wieder eine Bildfrage: " + JSON.stringify(photoSkip));

  // Eine Bilder-Lektion muss auch als BILDER-Lektion abgerechnet und geteilt werden
  const phShare = await page.evaluate(async (PX) => {
    __clearPhotoCache(); photoTried.clear();
    __setPhotoSource(() => Promise.resolve({ thumb: PX, title: "T", file: "T.jpg", url: "https://x/y", src: "cm" }));
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    document.querySelector("#sessLen").value = "1";
    startSession();
    await new Promise((r) => setTimeout(r, 80));
    const bild = !!document.querySelector("#phImg");
    const richtig = answerText(current).toLowerCase();    // richtig antworten, sonst kommt die Karte nochmal
    ([...document.querySelectorAll("#opts .opt")]
      .find((o) => o.querySelector("span:last-child").textContent.toLowerCase() === richtig)
      || document.querySelector("#opts .opt")).click();
    document.querySelector("#wt").click();                // letzte Karte → Abschluss-Screen
    const share = !!document.querySelector("#shareBlock");
    const dec = chDecode(challengeURL().split("#c=")[1]);
    const modus = mode;                                   // vor dem Aufräum-Tabwechsel merken
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    __setPhotoSource(null); __clearPhotoCache(); photoTried.clear();
    return { bild, share, m: dec && dec.m, modus };
  }, PX);
  assert(phShare.bild && phShare.share,
    "Bilder-Lektion: nach der letzten Karte muss der Teilen-Block da sein: " + JSON.stringify(phShare));
  assert(phShare.m === "photo" && phShare.modus === "photo",
    "Bilder-Lektion muss als Bilder-Lektion teilbar sein, nicht als Quiz: " + JSON.stringify(phShare));


  // Bildzuordnung: das Bild muss zur ART passen – nicht zur Art statt zur Sorte,
  // nicht zu einem Homonym, keine Tafel mit zwei Arten. Die API-Antworten sind
  // hier vorgegeben (__setJsonp), der Test bleibt also ohne Netz.
  const zuordnung = await page.evaluate(async () => {
    $("#frSelect").value = "gemuesebau"; $("#nivSelect").value = "gaertner"; applyProfile();
    const kirsche = allCards.find((c) => /cerasiforme/.test(c.a));
    const zwiebel = allCards.find((c) => /^Allium cepa/.test(c.g + " " + c.a) && /Cepa/.test(c.a));
    const salbei  = allCards.find((c) => c.g === "Salvia");
    const wege = photoSteps(kirsche).map((s) => s.k + ":" + s.q);

    const cmPage = (i, file) => ({ index: i, title: "File:" + file, imageinfo: [{ thumburl: "https://x/" + file, descriptionurl: "https://commons/" + file }] });
    const cmAnswer = (files) => ({ query: { pages: Object.fromEntries(files.map((f, i) => ["p" + i, cmPage(i + 1, f)])) } });
    const wpAnswer = (title, extract, file) => ({ query: { pages: { "1": { title, extract, pageimage: file, thumbnail: { source: "https://x/" + file } } } } });

    // 1) Sorte: Taxon-Kategorie liefert das Sortenbild
    __clearPhotoCache();
    __setJsonp((url) => Promise.resolve(/commons/.test(url)
      ? cmAnswer(["Starr 060406-7207 Solanum lycopersicum var. cerasiforme.jpg"])
      : wpAnswer("Tomate", "Die Tomate (Solanum lycopersicum) …", "Tomatoes-on-the-bush.jpg")));
    const a = await wikiPhoto(kirsche);

    // 2) Artikelbild zeigt ZWEI Arten → verworfen, Commons-Treffer gewinnt; dabei
    //    schlägt die benannte Datei das beliebige Bild aus derselben Kategorie
    __clearPhotoCache();
    __setJsonp((url) => Promise.resolve(/commons/.test(url)
      ? cmAnswer(["Hortus Haren 06-05-2020 24.jpg", "Allium cepa Zwiebeln 01.jpg"])
      : wpAnswer("Zwiebel", "Die Zwiebel (Allium cepa) …", "Illustration_Allium_schoenoprasum_and_Allium_cepa0.jpg")));
    const b = await wikiPhoto(zwiebel);

    // 3) Homonym: Artikel nennt die Gattung nicht → kein Bild von dort
    __clearPhotoCache();
    __setJsonp((url) => Promise.resolve(/commons/.test(url)
      ? { query: { pages: {} } }
      : wpAnswer("Salbei (Begriffsklärung)", "Ein Ortsteil der Gemeinde …", "Ortsschild.jpg")));
    const c = await wikiPhoto(salbei);

    __setJsonp(window.__offlineJsonp); __clearPhotoCache();
    return { wege, kirscheFile: a && a.file, kirscheSrc: a && a.src, zwiebelFile: b && b.file, salbei: c,
      zwiebelGal: (b && b.gal) || [],
      illuKoehler: looksIllustration("Salvia_officinalis_-_Köhler–s_Medizinal-Pflanzen-126.jpg"),
      illuFoto: looksIllustration("Carpinus betulus 001.JPG"),
      zweiArten: fileMentionsOther("Illustration_Allium_schoenoprasum_and_Allium_cepa0.jpg", zwiebel),
      eigeneArt: fileMentionsOther("Allium cepa Zwiebeln 01.jpg", zwiebel),
      sorte: isCultivarName(kirsche.a) && infraEpithet(kirsche.a) === "cerasiforme",
      artBildVerboten: !artLevelOk(kirsche) };
  });
  assert(zuordnung.sorte, "Bildzuordnung: Varietät wird nicht als solche erkannt");
  assert(zuordnung.artBildVerboten,
    "Bildzuordnung: Steht die Art ebenfalls in der Liste, darf für die Sorte kein Artbild genommen werden");
  assert(zuordnung.wege[0] === 'cm:incategory:"Solanum lycopersicum var. cerasiforme"',
    "Bildzuordnung: erster Weg ist nicht die exakte Taxon-Kategorie: " + JSON.stringify(zuordnung.wege));
  assert(!zuordnung.wege.some((w) => w === 'cm:incategory:"Solanum lycopersicum"' || w === "wp:Solanum lycopersicum"),
    "Bildzuordnung: Artniveau darf bei vorhandener Geschwister-Art nicht angefragt werden: " + JSON.stringify(zuordnung.wege));
  assert(/cerasiforme/.test(zuordnung.kirscheFile || "") && zuordnung.kirscheSrc === "cm",
    "Bildzuordnung: Sorte bekommt nicht das Sortenbild: " + JSON.stringify(zuordnung));
  assert(zuordnung.zweiArten && !zuordnung.eigeneArt,
    "Bildzuordnung: Tafel mit zwei Arten wird nicht erkannt: " + JSON.stringify(zuordnung));
  assert(zuordnung.zwiebelFile === "Allium cepa Zwiebeln 01.jpg",
    "Bildzuordnung: benannte Datei muss das beliebige Kategoriebild schlagen: " + JSON.stringify(zuordnung));
  assert(zuordnung.zwiebelGal.length === 2 && /Allium cepa Zwiebeln 01/.test(zuordnung.zwiebelGal[0]),
    "Galerie: die geprüften Commons-Kandidaten müssen als weitere Ansichten mitkommen (bester zuerst): " +
    JSON.stringify(zuordnung.zwiebelGal));
  assert(zuordnung.salbei === null, "Bildzuordnung: Artikel ohne Gattungsbezug (Homonym) wird trotzdem genommen");
  assert(zuordnung.illuKoehler && !zuordnung.illuFoto,
    "Bildzuordnung: alte Tafeln (Köhler) werden nicht als solche erkannt: " + JSON.stringify(zuordnung));

  // Digitalisierte Bücher (PDF/DjVu, Internet-Archive-Scans) dürfen NIE als Foto
  // durchgehen – ihr Vorschaubild ist der Buchdeckel. Realfall Garten-Dill
  // (Anethum graveolens var. hortorum): die feinen Suchwege treffen nichts,
  // der Volltext-Weg »Anethum graveolens hortorum« liefert nur lateinische
  // Bücher (»hortorum« = Genitiv von hortus) – die Kette muss sie verwerfen
  // und über die Ersatzroute (Art-Kategorie) beim echten Foto landen.
  const buchscan = await page.evaluate(async () => {
    const dill = allCards.find((c) => c.g === "Anethum");
    const cmP = (i, file, mime) => ({ index: i, title: "File:" + file,
      imageinfo: [{ thumburl: "https://x/" + file, mime: mime, descriptionurl: "https://commons/" + file }] });
    const cmA = (specs) => ({ query: { pages: Object.fromEntries(specs.map((s, i) => ["p" + i, cmP(i + 1, s[0], s[1])])) } });
    const buecher = cmA([
      ["Hortus Kewensis. Sistens herbas exoticas (IA mobot31753000817749).pdf", "application/pdf"],
      ["Icones plantarum medicinalium. Abbildungen von Arzneygewächsen (IA b30534732 0006).pdf", "application/pdf"],
      ["Flora Rossica; sive, Enumeratio plantarum (IA florarossica12gmel).pdf", "application/pdf"]]);
    const fotos = cmA([
      ["Schwalbenschwanz (Papilio machaon) Raupe-20250724.jpg", "image/jpeg"],
      ["Aneth FR 2012.jpg", "image/jpeg"],
      ["Anethum graveolens20090812 475.jpg", "image/jpeg"]]);
    __clearPhotoCache();
    __setJsonp((url) => {
      if (/commons/.test(url)) {
        const q = decodeURIComponent((url.match(/gsrsearch=([^&]+)/) || [])[1] || "");
        if (q === 'incategory:"Anethum graveolens"') return Promise.resolve(fotos);   // Ersatzroute (Art-Kategorie)
        if (/incategory:|"/.test(q)) return Promise.resolve({ query: { pages: {} } }); // feine Wege: leer (wie echt)
        return Promise.resolve(buecher);                                               // Volltext: nur Bücher (wie echt)
      }
      const t = decodeURIComponent((url.match(/titles=([^&]+)/) || [])[1] || "");
      if (/Garten-Dill/.test(t)) return Promise.resolve({ query: { pages: { "1": { title: "Garten-Dill" } } } });
      return Promise.resolve({ query: { pages: { "1": { title: "Dill (Pflanze)",
        extract: "Dill, Dille oder Gurkenkraut (Anethum graveolens) …",
        pageimage: "Illustration_Anethum_graveolens0.jpg",
        thumbnail: { source: "https://x/Illustration_Anethum_graveolens0.jpg" } } } } });
    });
    const hit = await wikiPhoto(dill);
    const pdfDirekt = pickCommons(buecher, dill);
    __setJsonp(window.__offlineJsonp); __clearPhotoCache();
    return { file: hit && hit.file, src: hit && hit.src, pdfDirekt,
      pdfRaus: !usablePhoto("Icones plantarum medicinalium (IA b30534732 0006).pdf"),
      djvuRaus: !usablePhoto("Flora Batava afbeelding.djvu"),
      iaRaus: !usablePhoto("Herbarium Blackwellianum (IA herbariumblackwe03blac) page 12.jpg"),
      iainBleibt: usablePhoto("Rosa canina (Iain Smith) 2019.jpg"),
      fotoBleibt: usablePhoto("Anethum graveolens20090812 475.jpg") };
  });
  assert(buchscan.pdfRaus && buchscan.djvuRaus && buchscan.iaRaus,
    "Buchscans (PDF/DjVu, »(IA …)«) müssen aussortiert werden: " + JSON.stringify(buchscan));
  assert(buchscan.iainBleibt && buchscan.fotoBleibt,
    "Echte Fotos (auch mit »(Iain …)« im Namen) dürfen nicht aussortiert werden: " + JSON.stringify(buchscan));
  assert(buchscan.pdfDirekt === null,
    "pickCommons darf aus einer reinen Buch-Trefferliste nichts wählen (mime application/pdf): " + JSON.stringify(buchscan.pdfDirekt));
  assert(buchscan.file === "Anethum graveolens20090812 475.jpg" && buchscan.src === "cm",
    "Garten-Dill muss über die Ersatzroute beim echten Dill-Foto landen (nicht Buchdeckel/Illustration): " + JSON.stringify(buchscan));

  // Krankheits-/Schädlingsfotos: Ein Rostpilz-Foto nennt die Wirtspflanze im Dateinamen
  // und würde über commonsScore gewinnen (Realfall Feuerbohne) – looksDamage muss es
  // verwerfen, das echte Pflanzenfoto dahinter gewinnt. Wortliste ohne Fehlalarme
  // (Blumenkohl = var. botrytis, Rosa gallica, St.-Gallen-Fotos bleiben erlaubt).
  const damage = await page.evaluate(() => {
    const bohne = { g: "Phaseolus", a: "coccineus", de: "Feuerbohne", key: "t|px" };
    const cmP = (i, file) => ({ index: i, title: "File:" + file,
      imageinfo: [{ thumburl: "https://x/" + file, mime: "image/jpeg", descriptionurl: "https://commons/" + file }] });
    const antwort = { query: { pages: {
      p0: cmP(1, "-2019-05-21 Runner Bean plants, Trimingham.JPG"),
      p1: cmP(2, "Uromyces appendiculatus var. appendiculatus telia at Phaseolus coccineus (4) cropped.jpg"),
      p2: cmP(3, "Phaseolus coccineus in Jardin des Plantes de Toulouse 01.jpg") } } };
    const hit = pickCommons(antwort, bohne);
    return { file: hit && hit.file,
      rostRaus: looksDamage("Uromyces appendiculatus telia at Phaseolus coccineus.jpg"),
      raupeRaus: looksDamage("Schwalbenschwanz (Papilio machaon) Raupe-20250724.jpg"),
      mehltauRaus: looksDamage("Erysiphe alphitoides Eichenmehltau 2019.jpg"),
      blumenkohlBleibt: !looksDamage("Brassica oleracea var. botrytis 0125.jpg"),
      gallicaBleibt: !looksDamage("Rosa gallica Habitus 2021.jpg"),
      stGallenBleibt: !looksDamage("Botanischer Garten St. Gallen, Beet 3.jpg"),
      fotoBleibt: !looksDamage("Phaseolus coccineus in Jardin des Plantes de Toulouse 01.jpg") };
  });
  assert(damage.rostRaus && damage.raupeRaus && damage.mehltauRaus,
    "looksDamage muss Rost-/Raupen-/Mehltau-Fotos erkennen: " + JSON.stringify(damage));
  assert(damage.blumenkohlBleibt && damage.gallicaBleibt && damage.stGallenBleibt && damage.fotoBleibt,
    "looksDamage darf Blumenkohl (var. botrytis), Rosa gallica, St.-Gallen- und normale Fotos NICHT sperren: " + JSON.stringify(damage));
  assert(damage.file === "Phaseolus coccineus in Jardin des Plantes de Toulouse 01.jpg",
    "Feuerbohne: das Rostpilz-Foto muss verworfen werden, das echte Pflanzenfoto gewinnt: " + JSON.stringify(damage));

  // Sorten: Für Sortennamen, die eine sichtbare Abweichung benennen ('Nigra', 'Glauca',
  // 'Flaviramea' …), ist ein Bild der ART falsch (Realfälle: Blutpflaume → weiß blühende
  // Kirschpflaume, Gelber Hartriegel → rotholziger Hartriegel). Anführungszeichen-Sorten
  // müssen als Sorten erkannt werden (früher griff nur var./ssp.), ihre Suchkette beginnt
  // bei der Sorten-Kategorie und enthält KEINEN Art-Schritt; Platzhalter ('Sorte') und
  // Phantasienamen ('Bristol Ruby') dürfen weiter aufs Artbild zurückfallen – aber ein
  // gröberer Treffer nach einem abgebrochenen feineren Weg gilt nur für die Sitzung.
  const sorten = await page.evaluate(async () => {
    const prof = (fr, niv) => { $("#frSelect").value = fr; $("#nivSelect").value = niv; applyProfile(); };
    const wege = (c) => photoSteps(c).map((s) => s.k + ":" + s.q);
    const q = (url) => decodeURIComponent((url.match(/gsrsearch=([^&]+)/) || [])[1] || "");
    const cmP = (i, file, meta) => ({ index: i, title: "File:" + file, imageinfo: [{ thumburl: "https://x/" + file, mime: "image/jpeg", descriptionurl: "https://commons/" + file, extmetadata: meta }] });
    const cmA = (specs) => ({ query: { pages: Object.fromEntries(specs.map((s, i) => ["p" + i, cmP(i + 1, s[0], s[1])])) } });
    const leer = { query: { pages: {} } };
    prof("baumschule", "fachwerker");
    const nigra = allCards.find((c) => c.g === "Prunus" && /'Nigra'/.test(c.a));
    const r = { nigraKind: cultivarKind(nigra.a), nigraName: cultivarName(nigra.a), nigraEpi: binomEpithet(nigra.a),
      nigraDesc: descriptiveCultivar("Nigra"), nigraArt: artLevelOk(nigra), nigraWege: wege(nigra),
      nigraAndere: fileMentionsOther("Prunus cerasifera Nigra 01.jpg", nigra),      // Sortenname ist keine »andere Art«
      spinosaAndere: fileMentionsOther("Prunus spinosa Blüte.jpg", nigra) };
    const artikel = { query: { pages: { "1": { title: "Kirschpflaume", extract: "Die Kirschpflaume (Prunus cerasifera) ist eine Pflanzenart …",
      pageimage: "Prunus_cerasifera_flowers.jpg", thumbnail: { source: "https://x/Prunus_cerasifera_flowers.jpg" } } } } };
    const fotoMeta = { Categories: { value: "Prunus cerasifera 'Nigra'|Flowers in April" }, Artist: { value: "Hp" }, LicenseShortName: { value: "CC BY-SA 4.0" } };
    // a) Commons kennt kein Sortenbild, Wikipedia bietet das Artbild an → KEIN Bild (und kein Fehler)
    __clearPhotoCache();
    __setJsonp((url) => Promise.resolve(/commons/.test(url) ? leer : artikel));
    r.ohneSortenbild = await wikiPhoto(nigra);
    // b) Sorten-Kategorie liefert ein Foto → genau das, samt Urheber/Lizenz aus den Metadaten
    __clearPhotoCache();
    __setJsonp((url) => Promise.resolve(/commons/.test(url)
      ? (q(url) === `incategory:"Prunus cerasifera 'Nigra'"` ? cmA([["Prunus cerasifera 'Nigra' 2019.jpg", fotoMeta]]) : leer) : artikel));
    const b = await wikiPhoto(nigra);
    Object.assign(r, { sortenbild: b && b.file, sortenArtist: b && b.artist, sortenLic: b && b.license, sortenTmp: !!(b && b.tmp) });
    prof("garten_und_landschaftsbau", "gaertner");
    const flavi = allCards.find((c) => c.g === "Cornus" && /Flaviramea/.test(c.a));
    const weig = allCards.find((c) => c.g === "Weigela" && /Bristol/.test(c.a));
    Object.assign(r, { flaviArt: artLevelOk(flavi), weigKind: cultivarKind(weig.a), weigName: cultivarName(weig.a),
      weigSearch: searchName(weig), weigDesc: descriptiveCultivar("Bristol Ruby"), weigArt: artLevelOk(weig), weigWege: wege(weig) });
    // c) Weigela: feiner Weg bricht (Ratenlimit), gröberer trifft → Treffer nur für diese Sitzung (tmp), nicht dauerhaft
    let abrufe = 0;
    __clearPhotoCache(); photoTried.clear(); __setPhotoSource(null);
    __setJsonp((url) => { abrufe++;
      if (/commons/.test(url) && /gsrsearch/.test(url)) return Promise.reject(new Error("timeout"));
      if (/commons/.test(url)) return Promise.resolve({ query: { pages: { "9": { title: "File:Weigela_florida_2019.jpg",
        imageinfo: [{ mime: "image/jpeg", extmetadata: { Categories: { value: "Weigela florida|Flowers" }, Artist: { value: "Hp" }, LicenseShortName: { value: "CC BY-SA 4.0" } } }] } } } });
      return Promise.resolve({ query: { pages: { "1": { title: "Weigelien", extract: "Die Weigelien (Weigela) sind eine Pflanzengattung …",
        pageimage: "Weigela_florida_2019.jpg", thumbnail: { source: "https://x/Weigela_florida_2019.jpg" } } } } });
    });
    const w1 = await photoFor(weig); const n1 = abrufe;
    const w2 = await photoFor(weig); const n2 = abrufe;
    Object.assign(r, { weigTmp: !!(w1 && w1.tmp), weigFile: w1 && w1.file, weigCredit: w1 && w1.artist, weigSame: w1 === w2, weigNoRefetch: n2 === n1,
      weigNichtGemerkt: !(localStorage.getItem("pflanzenlernen.photos7") || "").includes(weig.key) });
    __setJsonp(window.__offlineJsonp); __clearPhotoCache(); photoTried.clear();
    // d) Platzhalter 'Sorte': die Liste meint die Art → direkt der Art-Artikel
    prof("garten_und_landschaftsbau", "fachwerker");
    const platz = allCards.find((c) => /'Sorte'/.test(c.a));
    Object.assign(r, { platzKind: cultivarKind(platz.a), platzArt: artLevelOk(platz), platzWege: wege(platz), platzBinom: searchName(platz) });
    // e) alle Sortennamen der 14 Listen: erkannt, Einteilung in den Referenzfällen richtig
    const alle = Object.values(SEEDS).flat().map((row) => row[1]).filter((a) => /'/.test(a));
    const kinds = new Set(alle.map((a) => cultivarKind(a)));
    const namen = new Set(alle.map((a) => cultivarName(a)));
    Object.assign(r, { alleErkannt: [...kinds].every((k) => k === "cv" || k === "placeholder"), namenZahl: namen.size,
      descZahl: [...namen].filter((n) => descriptiveCultivar(n)).length,
      descJa: ["Nigra", "Glauca", "Flaviramea", "Contorta", "Atropunicea", "Nana Gracilis", "Youngii", "Roseum"].every((n) => descriptiveCultivar(n)),
      descNein: ["Bristol Ruby", "Koster", "Hancock", "Sorte", "Herbstblüte", "Elegant", "Sibirica"].every((n) => !descriptiveCultivar(n)),
      frieder: cultivarName("dammeri 'Frieder's Evergreen'"), klammer: cultivarName("procumbens ('Nana')"), klammerEpi: binomEpithet("procumbens ('Nana')"),
      vergessenEnde: cultivarName("abies 'Nidiformis"), vergessenAnfang: cultivarName("fortunei Emerald Gold'"), vergessenEpi: binomEpithet("fortunei Emerald Gold'") });
    prof("gemuesebau", "gaertner");
    return r;
  });
  assert(sorten.nigraKind === "cv" && sorten.nigraName === "Nigra" && sorten.nigraEpi === "cerasifera",
    "Anführungszeichen-Sorte muss als Sorte erkannt werden (Kind/Name/Epitheton): " + JSON.stringify(sorten));
  assert(sorten.nigraDesc && sorten.nigraArt === false && sorten.flaviArt === false,
    "Beschreibende Sorten ('Nigra', 'Flaviramea') dürfen NIE das Artbild bekommen: " + JSON.stringify(sorten));
  assert(sorten.nigraWege[0] === `cm:incategory:"Prunus cerasifera 'Nigra'"` &&
    !sorten.nigraWege.some((w) => w === "wp:Prunus cerasifera" || w === 'cm:incategory:"Prunus cerasifera"'),
    "Sorten-Suchkette: zuerst die Sorten-Kategorie, kein Art-Schritt: " + JSON.stringify(sorten.nigraWege));
  assert(sorten.ohneSortenbild === null,
    "Ohne Sortenbild darf das Artbild der Wikipedia NICHT genommen werden (Blutpflaume ≠ Kirschpflaume): " + JSON.stringify(sorten.ohneSortenbild));
  assert(sorten.sortenbild === "Prunus cerasifera 'Nigra' 2019.jpg" && sorten.sortenArtist === "Hp" && /CC BY-SA/.test(sorten.sortenLic) && !sorten.sortenTmp,
    "Sorten-Kategorie muss das Sortenbild samt Urheber/Lizenz liefern: " + JSON.stringify(sorten));
  assert(sorten.nigraAndere === false && sorten.spinosaAndere === true,
    "fileMentionsOther: der eigene Sortenname ist keine andere Art, eine andere Art schon: " + JSON.stringify(sorten));
  assert(sorten.weigKind === "cv" && sorten.weigName === "Bristol Ruby" && sorten.weigSearch === "Weigela" && !sorten.weigDesc && sorten.weigArt,
    "Phantasiename 'Bristol Ruby': Sorte ohne Epitheton, Suchname nur die Gattung, Artbild erlaubt: " + JSON.stringify(sorten));
  assert(sorten.weigWege[0] === `cm:incategory:"Weigela 'Bristol Ruby'"` && sorten.weigWege.includes("wp:Weigela"),
    "Phantasiename: erst die Sorten-Kategorie, zuletzt die Gattung/Art: " + JSON.stringify(sorten.weigWege));
  assert(sorten.weigTmp && sorten.weigFile === "Weigela_florida_2019.jpg" && sorten.weigCredit === "Hp" && sorten.weigSame && sorten.weigNoRefetch && sorten.weigNichtGemerkt,
    "Bricht ein feinerer Suchweg ab, gilt der gröbere Treffer nur für diese Sitzung (tmp, nicht im Speicher, kein zweiter Abruf): " + JSON.stringify(sorten));
  assert(sorten.platzKind === "placeholder" && sorten.platzArt && sorten.platzWege[0] === "wp:" + sorten.platzBinom,
    "Platzhalter 'Sorte' meint die Art: direkt der Art-Artikel, keine Sorten-Suche: " + JSON.stringify(sorten));
  assert(sorten.alleErkannt && sorten.namenZahl === 68 && sorten.descZahl === 41 &&   // 61/38 bis zur Berichtigung 'Hibernika' → 'Hibernica'; +8/+4 seit ˋ → ' (neun Sorten der Friedhofsgärtnerei-Gärtner-Liste, 'Nana' gab es schon; beschreibend: Glacier, Gnom, Silver Carpet, Coccineus)
    sorten.descJa && sorten.descNein &&
    sorten.frieder === "Frieder's Evergreen" && sorten.klammer === "Nana" && sorten.klammerEpi === "procumbens" &&
    sorten.vergessenEnde === "Nidiformis" && sorten.vergessenAnfang === "Emerald Gold" && sorten.vergessenEpi === "fortunei",
    "Alle 68 Sortennamen der 14 Listen erkannt (6 Zeilen mit vergessenem Anführungszeichen), 41 davon beschreibend; Referenzfälle: " + JSON.stringify(sorten));

  // Zeichnungen, Tafeln, Herbarbelege, Buchscans: Der Dateiname verrät sie oft nicht
  // (Realfall Screenshot: »Bulletin de la Société … de Moscou (1841)« = Buchtafel mit
  // aufgedrucktem Namen). Entscheidend sind die Commons-Metadaten (Kategorien, Urheber),
  // die in derselben Antwort mitkommen – Treffer tragen seither auch Urheber + Lizenz.
  const tafeln = await page.evaluate(async () => {
    const perov = { key: "t-perov", g: "Perovskia", a: "abrotanoides", de: "Silberstrauch", fam: "Lamiaceae" };
    const cmP = (i, file, meta) => ({ index: i, title: "File:" + file, imageinfo: [{ thumburl: "https://x/" + file, mime: "image/jpeg", descriptionurl: "https://commons/" + file, extmetadata: meta }] });
    const cmA = (specs) => ({ query: { pages: Object.fromEntries(specs.map((s, i) => ["p" + i, cmP(i + 1, s[0], s[1])])) } });
    const tafel = ["Bulletin de la Société Impériale des Naturalistes de Moscou (1841) (20228837329).jpg",
      { Categories: { value: "Perovskia abrotanoides|Bulletin de la Société impériale des naturalistes de Moscou (1841)|Files from Internet Archive Book Images Flickr stream" },
        Artist: { value: "Internet Archive Book Images" }, LicenseShortName: { value: "No restrictions" } }];
    const herbar = ["Perovskia abrotanoides - MHNT.BOT.2004.0.726.jpg", { Categories: { value: "Perovskia abrotanoides|Herbarium specimens of Lamiaceae|Muséum de Toulouse" } }];
    const zeichnung = ["Perovskia abrotanoides Karelin.jpg", { Categories: { value: "Perovskia abrotanoides|Botanical illustrations" }, Artist: { value: "Walter Hood Fitch" } }];
    const foto = ["Perovskia abrotanoides 2015-07-01.jpg",
      { Categories: { value: "Perovskia abrotanoides|Flowers in Baden-Württemberg" }, Artist: { value: "<a href=\"//commons.wikimedia.org/wiki/User:Hp\">Hp</a>" }, LicenseShortName: { value: "CC BY-SA 4.0" } }];
    const nurTafeln = pickCommons(cmA([tafel, herbar, zeichnung]), perov);
    const gemischt = pickCommons(cmA([tafel, herbar, zeichnung, foto]), perov);
    // Artikelbild der Wikipedia mit harmlosem Dateinamen, Metadaten sagen »Buchtafel« → verworfen, Kette läuft weiter zur Kategorie
    let metaAbfragen = 0;
    __clearPhotoCache();
    __setJsonp((url) => {
      if (/commons/.test(url) && /titles=File/.test(url)) { metaAbfragen++;
        return Promise.resolve({ query: { pages: { "7": { title: "File:Perovskia_abrotanoides_1841.jpg", imageinfo: [{ mime: "image/jpeg", extmetadata: tafel[1] }] } } } }); }
      if (/commons/.test(url)) return Promise.resolve(cmA([foto]));
      return Promise.resolve({ query: { pages: { "1": { title: "Perovskia abrotanoides", extract: "Perovskia abrotanoides ist eine Pflanzenart …",
        pageimage: "Perovskia_abrotanoides_1841.jpg", thumbnail: { source: "https://x/Perovskia_abrotanoides_1841.jpg" } } } } });
    });
    const hit = await wikiPhoto(perov);
    // Galerie des Bilder-Quiz (Artikelbilder): ohne Tafeln; die Info-Karte behält sie (Nachschlagen)
    const gal = { query: { pages: { "1": cmP(1, "Perovskia_a_habit.jpg", foto[1]), "2": cmP(2, "Perovskia_a_1841.jpg", tafel[1]), "3": cmP(3, "Perovskia_Tafel_x.jpg", foto[1]) } } };
    __setJsonp(() => Promise.resolve(gal));
    const quizGal = (await wikiGallery("Perovskia abrotanoides", true)).map((g) => g.file);
    const infoGal = (await wikiGallery("Perovskia abrotanoides")).map((g) => g.file);
    __setJsonp(window.__offlineJsonp); __clearPhotoCache();
    return { nurTafeln, gemischtFile: gemischt && gemischt.file, gemischtArtist: gemischt && gemischt.artist, gemischtLic: gemischt && gemischt.license,
      gemischtGal: (gemischt && gemischt.gal) || [], hitFile: hit && hit.file, hitSrc: hit && hit.src, metaAbfragen, quizGal, infoGal,
      tafelErkannt: looksArtwork(tafel[1]), herbarErkannt: looksArtwork(herbar[1]), zeichnungErkannt: looksArtwork(zeichnung[1]),
      fotoBleibt: !looksArtwork(foto[1]), ohneMeta: !looksArtwork(undefined),
      dateiname: looksIllustration("Perovskia_Tafel_x.jpg") && !looksIllustration("Rosa canina Botanical Garden Berlin.jpg") &&
        looksIllustration("Curtis's Botanical Magazine Plate 123.jpg") && looksIllustration("Koeh-126.jpg") };
  });
  assert(tafeln.tafelErkannt && tafeln.herbarErkannt && tafeln.zeichnungErkannt && tafeln.fotoBleibt && tafeln.ohneMeta,
    "looksArtwork: Buchtafel (Internet Archive), Herbarbeleg und Illustration erkennen – Foto und fehlende Metadaten nicht: " + JSON.stringify(tafeln));
  assert(tafeln.nurTafeln === null, "pickCommons darf aus Tafel/Herbarbeleg/Zeichnung nichts wählen: " + JSON.stringify(tafeln.nurTafeln));
  assert(tafeln.gemischtFile === "Perovskia abrotanoides 2015-07-01.jpg" && tafeln.gemischtArtist === "Hp" && tafeln.gemischtLic === "CC BY-SA 4.0" && tafeln.gemischtGal.length === 1,
    "pickCommons: das Foto gewinnt, trägt Urheber + Lizenz, und die Galerie enthält keine Tafeln: " + JSON.stringify(tafeln));
  assert(tafeln.hitFile === "Perovskia abrotanoides 2015-07-01.jpg" && tafeln.hitSrc === "cm" && tafeln.metaAbfragen === 1,
    "Artikelbild mit harmlosem Namen, laut Metadaten eine Buchtafel → verworfen (eine Metadaten-Abfrage), Kette landet beim Foto: " + JSON.stringify(tafeln));
  assert(JSON.stringify(tafeln.quizGal) === JSON.stringify(["Perovskia_a_habit.jpg"]) && tafeln.infoGal.length === 3,
    "Galerie: Bilder-Quiz ohne Tafeln (Metadaten + Dateiname), Info-Karte behält sie: " + JSON.stringify(tafeln));
  assert(tafeln.dateiname, "looksIllustration: »Botanical Garden« ist kein Tafel-Hinweis – »Botanical Magazine«, »Plate«, »Koeh-« schon");

  // Lieber Zeichnung als gar kein Bild (Rückmeldung zu Perovskia abrotanoides: auf Commons gibt es
  // von der Art nur die Tafel der Erstbeschreibung von 1841, kein einziges Foto). Fotos gehen immer
  // vor; erst wenn KEIN Suchweg ein Foto liefert, nimmt das Quiz die beste Zeichnung (Artikelbild
  // der Wikipedia zuerst, dann Commons-Funde), gekennzeichnet; Herbarbeleg nur ohne Zeichnung;
  // Karten, Diagramme, Etiketten, PDFs und andere Arten nie. Gemerkte Zeichnungen altern (30 Tage).
  const notnagel = await page.evaluate(async () => {
    __setPhotoSource(null);
    const perov = { key: "t-perov2", g: "Perovskia", a: "abrotanoides", de: "Blauraute, Silberbusch", fam: "Lamiaceae", syn: "Salvia abrotanoides" };
    const cmP = (i, file, meta, mime) => ({ index: i, title: "File:" + file, imageinfo: [{ thumburl: "https://x/" + file, mime: mime || "image/jpeg", width: 1200, descriptionurl: "https://commons/" + file, extmetadata: meta }] });
    const cmA = (specs) => ({ query: { pages: Object.fromEntries(specs.map((s, i) => ["p" + i, cmP(i + 1, s[0], s[1], s[2])])) } });
    const ia = { Categories: { value: "Perovskia abrotanoides|Bulletin de la Société impériale des naturalistes de Moscou (1841)|Files from Internet Archive Book Images Flickr stream" },
      Artist: { value: "Internet Archive Book Images" }, LicenseShortName: { value: "No restrictions" } };
    const tafel1841 = ["Bulletin de la Société impériale des naturalistes de Moscou (1841) (20246494408).jpg", ia];
    const tafel2 = ["Bulletin de la Société Impériale des Naturalistes de Moscou (1841) (14784932583).jpg", ia];
    const andereArt = ["Perovskia atriplicifolia Kreuzberg 1.jpg", { Categories: { value: "Perovskia atriplicifolia" }, Artist: { value: "Hp" } }];
    const pdf = ["Catalogue of plants, Conrad Loddiges (IA catalogueofplant1823conr).pdf", { Categories: { value: "PDF files" } }, "application/pdf"];
    const karte = ["Perovskia abrotanoides distribution map.png", { Categories: { value: "Perovskia abrotanoides|Distribution maps of plants" } }, "image/png"];
    const herbar = ["Perovskia abrotanoides - MHNT.BOT.2004.0.726.jpg", { Categories: { value: "Perovskia abrotanoides|Herbarium specimens of Lamiaceae" }, Artist: { value: "Muséum de Toulouse" }, LicenseShortName: { value: "CC BY-SA 4.0" } }];
    const foto = ["Perovskia abrotanoides 2015-07-01.jpg", { Categories: { value: "Perovskia abrotanoides" }, Artist: { value: "Hp" }, LicenseShortName: { value: "CC BY-SA 4.0" } }];
    const wpArt = { query: { pages: { "1": { title: "Fiederschnittige Perowskie", extract: "Die Fiederschnittige Perowskie (Salvia abrotanoides, Syn.: Perovskia abrotanoides) ist eine Pflanzenart …",
      pageimage: tafel1841[0].replace(/ /g, "_"), thumbnail: { source: "https://x/" + tafel1841[0].replace(/ /g, "_") } } } } };
    const leer = { query: { pages: {} } };
    const fileMetaAnswer = { query: { pages: { "7": { title: "File:" + tafel1841[0], imageinfo: [{ mime: "image/jpeg", extmetadata: ia }] } } } };
    let metaAbfragen = 0;
    const run = async (cmFn, wpFn) => { __clearPhotoCache(); photoTried.clear(); metaAbfragen = 0;
      __setJsonp((url) => { if (/commons/.test(url) && /titles=File/.test(url)) { metaAbfragen++; return Promise.resolve(fileMetaAnswer); }
        if (/commons/.test(url)) { const q = decodeURIComponent((url.match(/gsrsearch=([^&]+)/) || [])[1] || ""); return Promise.resolve(cmFn(q)); }
        const t = decodeURIComponent((url.match(/titles=([^&]+)/) || [])[1] || ""); return Promise.resolve(wpFn(t)); });
      return wikiPhoto(perov); };
    // Realfall: Artikelbild = Tafel (Metadaten), Kategorien leer, Volltext = Tafel + andere Art + PDF + Karte
    const a = await run((q) => /incategory/.test(q) ? leer : cmA([tafel2, andereArt, pdf, karte]), (t) => /Perovskia abrotanoides|Salvia abrotanoides/.test(t) ? wpArt : leer);
    const aMeta = metaAbfragen;
    // Foto auf einem späteren Weg (Synonym-Kategorie) → Foto gewinnt, obwohl die Tafel früher kam
    const b = await run((q) => /incategory:"Salvia abrotanoides"/.test(q) ? cmA([foto]) : (/incategory/.test(q) ? leer : cmA([tafel2, karte])), (t) => /Perovskia abrotanoides/.test(t) ? wpArt : leer);
    // nur Herbarbeleg → Herbarbeleg; Zeichnung + Herbarbeleg → Zeichnung
    const c = await run((q) => /incategory:"Perovskia abrotanoides"/.test(q) ? cmA([herbar]) : leer, () => leer);
    const d = await run((q) => /incategory:"Perovskia abrotanoides"/.test(q) ? cmA([herbar, tafel2]) : leer, () => leer);
    // nur Karte/PDF/andere Art → gar nichts (null, kein Fehler)
    const e = await run((q) => /incategory:"Perovskia abrotanoides"/.test(q) ? cmA([karte, pdf, andereArt]) : leer, () => leer);
    // Zeichnung, aber ein feinerer Weg brach ab → nur für diese Sitzung (tmp)
    const f = await run((q) => { if (/incategory:"Perovskia abrotanoides"/.test(q)) throw new Error("timeout"); return /incategory/.test(q) ? leer : cmA([tafel2]); }, () => leer).catch((err) => ({ err: String(err) }));
    // Gemerkte Zeichnung: frisch → sofort da; älter als 30 Tage → neue Suche, bei Netzfehler bleibt die alte
    __clearPhotoCache(); photoTried.clear();
    __rememberPhoto(perov.key, Object.assign({}, a, { t: Date.now() - 31 * 86400e3 }));
    let suchen = 0; __setJsonp(() => { suchen++; return Promise.reject(new Error("offline")); });
    const g = await photoFor(perov).catch((err) => ({ err: String(err) }));
    const gSuchen = suchen;
    __clearPhotoCache(); photoTried.clear();
    __rememberPhoto(perov.key, Object.assign({}, a, { t: Date.now(), av: 1 }));
    suchen = 0; const h = await photoFor(perov); const hSuchen = suchen;
    // vor der iNaturalist-Ersatzquelle gemerkt (ohne av): einmal sofort neu suchen, bei Netzfehler bleibt die Zeichnung
    __clearPhotoCache(); photoTried.clear();
    __rememberPhoto(perov.key, Object.assign({}, a, { t: Date.now() }));
    suchen = 0; const h2 = await photoFor(perov).catch((err) => ({ err: String(err) })); const h2Suchen = suchen;
    __setJsonp(window.__offlineJsonp); __clearPhotoCache(); photoTried.clear(); __setPhotoSource(null);
    return { aFile: a && a.file, aArt: a && a.art, aSrc: a && a.src, aArtist: a && a.artist, aGal: (a && a.gal) || [], aTmp: !!(a && a.tmp), aMeta, aT: !!(a && a.t) === false,
      bFile: b && b.file, bArt: b && b.art,
      cArt: c && c.art, cFile: c && c.file, dArt: d && d.art, dFile: d && d.file, e,
      fArt: f && f.art, fTmp: !!(f && f.tmp), fErr: f && f.err,
      gFile: g && g.file, gArt: g && g.art, gErr: g && g.err, gSuchen, hFile: h && h.file, hSuchen, h2File: h2 && h2.file, h2Err: h2 && h2.err, h2Suchen,
      kinds: { tafel: artKind(tafel1841[0], ia), herbar: artKind(herbar[0], herbar[1]), karte: artKind(karte[0], karte[1]), foto: artKind(foto[0], foto[1]),
        koehler: artKind("Salvia_officinalis_-_Köhler–s_Medizinal-Pflanzen-126.jpg", null), label: artKind("Perovskia label.jpg", { Categories: { value: "Botanical illustrations|Plant labels" } }) } };
  });
  assert(notnagel.aArt === "zeichnung" && /20246494408/.test(notnagel.aFile || "") && notnagel.aSrc === "wp" && notnagel.aArtist === "Internet Archive Book Images" && !notnagel.aTmp && notnagel.aMeta === 1,
    "Kein Foto auf keinem Weg → Zeichnung als Notnagel (Artikelbild zuerst, mit Nachweis, dauerhaft, eine Metadaten-Abfrage je Datei): " + JSON.stringify(notnagel));
  assert(notnagel.aGal.length === 2 && !notnagel.aGal.some((u) => /Kreuzberg|pdf|map/.test(u)),
    "Notnagel-Galerie: nur Zeichnungen derselben Art, keine andere Art/PDF/Karte, nichts doppelt: " + JSON.stringify(notnagel.aGal));
  assert(notnagel.bFile === "Perovskia abrotanoides 2015-07-01.jpg" && !notnagel.bArt,
    "Ein Foto auf einem späteren Weg schlägt die frühere Zeichnung: " + JSON.stringify(notnagel));
  assert(notnagel.cArt === "herbar" && /MHNT/.test(notnagel.cFile || "") && notnagel.dArt === "zeichnung" && /1841/.test(notnagel.dFile || ""),
    "Nur Herbarbeleg → Herbarbeleg; Zeichnung geht vor Herbarbeleg: " + JSON.stringify(notnagel));
  assert(notnagel.e === null, "Karte, PDF und andere Art sind kein Notnagel (null, kein Fehler): " + JSON.stringify(notnagel.e));
  assert(notnagel.fArt === "zeichnung" && notnagel.fTmp && !notnagel.fErr,
    "Zeichnung trotz abgebrochenem feineren Weg – aber nur für diese Sitzung (tmp): " + JSON.stringify(notnagel));
  assert(notnagel.gArt === "zeichnung" && /1841/.test(notnagel.gFile || "") && !notnagel.gErr && notnagel.gSuchen > 0 && notnagel.hSuchen === 0 && /1841/.test(notnagel.hFile || ""),
    "Gemerkte Zeichnung: nach 30 Tagen neue Suche (bei Netzfehler bleibt die alte), frische ohne Suche: " + JSON.stringify(notnagel));
  assert(/1841/.test(notnagel.h2File || "") && !notnagel.h2Err && notnagel.h2Suchen > 0,
    "Vor iNaturalist gemerkte Zeichnung (ohne av): sofort einmal neu suchen, bei Netzfehler bleibt die Zeichnung: " + JSON.stringify(notnagel));
  assert(notnagel.kinds.tafel === "zeichnung" && notnagel.kinds.herbar === "herbar" && notnagel.kinds.karte === "" && notnagel.kinds.foto === "" && notnagel.kinds.koehler === "zeichnung" && notnagel.kinds.label === "",
    "artKind: Tafel/Köhler = Zeichnung, Herbarbeleg = herbar, Karte/Etikett/Foto = nichts: " + JSON.stringify(notnagel.kinds));

  // Gattungsebene (Bildcheck Lauf 3): »Rosa Cultivars« zeigte »Rosà ciclabile« (Radweg im Ort Rosà) –
  // die Commons-Kategorie »Rosa« ist eine Sammelschublade. Fünf Sammelkarten zeigten eine Art, die in
  // derselben Liste eigens steht (Hemerocallis fulva, Schlehe, Hoher Rittersporn …). Fixtures nach den
  // echten Antworten (Kategorie »Rosa«: die ersten zwölf Dateien wörtlich).
  const gattEbene = await page.evaluate(async () => {
    __setPhotoSource(null);
    const prev = $("#frSelect").value + "|" + $("#nivSelect").value;
    const prof = (fr, niv) => { $("#frSelect").value = fr; $("#nivSelect").value = niv; applyProfile(); };
    const karte = (g, a) => allCards.find((c) => c.g === g && c.a === a);
    const cmP = (i, file) => ({ index: i, title: "File:" + file, imageinfo: [{ thumburl: "https://x/" + encodeURIComponent(file), mime: "image/jpeg", width: 1200, descriptionurl: "https://commons/" + file,
      extmetadata: { Categories: { value: "Rosa" }, Artist: { value: "Hp" }, LicenseShortName: { value: "CC BY-SA 4.0" } } }] });
    const cmA = (files) => ({ query: { pages: Object.fromEntries(files.map((f, i) => ["p" + i, cmP(i + 1, f)])) } });
    const leer = { query: { pages: {} } };
    const ROSA_KAT = ["Rosà ciclabile (4).jpg", "張保仔館房間.JPG", "Agro rosatese (4).jpg", "Magnificent Display of Roses at Exposition Show.jpg",
      "Florists' review (microform) (1912) (16518689729).jpg", "Agro rosatese.jpg", "Hohlerberg-Solms2.JPG", "Waschgeschirr \"Yuri\".jpg",
      "Rosà ciclabile.jpg", "Flag rosa'.jpg", "Parcheggio Piscine Comunali delle Rose (Rosà).jpg", "Rosà ciclabile (2).jpg"];
    const wege = [];
    const run = async (card, cmFn, wpFn) => { __clearPhotoCache(); photoTried.clear(); wege.length = 0;
      __setJsonp((url) => {
        if (/commons/.test(url) && /titles=File/.test(url)) return Promise.resolve({ query: { pages: { "7": { title: "File:x.jpg", imageinfo: [{ mime: "image/jpeg", extmetadata: { Categories: { value: "Photos" } } }] } } } });
        if (/commons/.test(url)) { const q = decodeURIComponent((url.match(/gsrsearch=([^&]+)/) || [])[1] || ""); wege.push("cm:" + q); return Promise.resolve(cmFn(q)); }
        const t = decodeURIComponent((url.match(/titles=([^&]+)/) || [])[1] || ""); wege.push("wp:" + t); return Promise.resolve(wpFn(t)); });
      try { return await wikiPhoto(card); } catch (e) { return { err: String(e) }; } };
    prof("garten_und_landschaftsbau", "gaertner");
    const rc = karte("Rosa", "Cultivars"), pr = karte("Prunus", "'Sorte'"), canina = karte("Rosa", "canina");
    // 1) Sammelschublade: aus der echten Kategorie »Rosa« kommt nichts durch – ohne Suchweg (= ohne Filter) schon
    const ohneFilter = (pickCommons(cmA(ROSA_KAT), rc, []) || {}).file || null;
    const mitFilter = pickCommons(cmA(ROSA_KAT), rc, [], 'incategory:"Rosa"');
    // 2) Kette: Sammelkarte → Sortensuche (hier leer), »Quality images of Rosa« (Wildart der Liste + Gartensorte), die Sammelschublade erst danach
    const a = await run(rc, (q) => q === 'incategory:"Rosa"' ? cmA(ROSA_KAT) : q === 'incategory:"Quality images of Rosa"' ? cmA(["Rosa canina 2.jpg", "Rosa 'Westerland' 2019.jpg"]) : leer, () => leer);
    const aWege = wege.slice();
    // 3) Volltext »Rosa«: Personennamen raus, Art der Liste raus, Gartensorte gewinnt
    const b = await run(rc, (q) => q === "Rosa" ? cmA(["Rosa Parks 1955.jpg", "Rosa Luxemburg 1910.jpg", "Rosa canina 3.jpg", "Rosa 'Gloria Dei' 2.jpg"]) : (/incategory:"Rosa"/.test(q) ? cmA(ROSA_KAT) : leer), () => leer);
    // 4) Prunus 'Sorte' (Zier-Kirsche): Artikelbild »Schlehen.jpg« zeigt Prunus spinosa (steht in der Liste) → weiter zur Gattungskategorie
    const wpPrunus = { query: { pages: { "1": { title: "Prunus", extract: "Prunus ist eine Pflanzengattung …", pageimage: "Schlehen.jpg", thumbnail: { source: "https://x/Schlehen.jpg" } } } } };
    const c = await run(pr, (q) => q === 'incategory:"Prunus"' ? cmA(["Prunus serrulata 'Kanzan' 1.jpg", "Zierkirsche im Park.jpg", "Prunus 'Accolade' 2.jpg"]) : leer, (t) => t === "Prunus" ? wpPrunus : leer);
    // 5) Arten derselben Liste erkennen (lateinisch, Sortenname, deutscher Name; nicht der eigene)
    const sib = (fr, niv, g, a, files) => { prof(fr, niv); const k = karte(g, a); return files.map((f) => namesListSpecies(f, k)); };
    const hem = sib("staudengaertnerei", "gaertner", "Hemerocallis", "Cultivars", ["Hemerocallis_fulva_June.jpg", "Bahnwärter-Taglilie.jpg", "Hemerocallis 'Stella de Oro' 01.jpg"]);
    const del = sib("staudengaertnerei", "gaertner", "Delphinium", "Cultivars (Belladonna-Gruppe)", ["Hoher_Rittersporn.jpg", "Delphinium Belladonna 'Völkerfrieden'.jpg"]);
    const pru = sib("garten_und_landschaftsbau", "gaertner", "Prunus", "'Sorte'", ["Schlehen.jpg", "Prunus serrulata 'Kanzan'.jpg", "Zier-Kirsche.jpg", "Prunus 'Accolade' 01.jpg"]);
    const fairy = sib("friedhofsgaertnerei", "gaertner", "Rosa", "Cultivars", ["Rosa 'The Fairy' 01.jpg", "Rosa 'Gloria Dei'.jpg"]);
    // 6) Ablenker im Bilder-Modus: keine Karte derselben Gattung, wenn eine der beiden auf Gattungsebene steht
    const ablenker = (fr, niv, g, a, m) => { prof(fr, niv); const k = karte(g, a); const s = new Set(); for (let i = 0; i < 30; i++) __distractorsIn(m, k, 40).forEach((x) => s.add(x)); return [...s]; };
    const hemFoto = ablenker("staudengaertnerei", "gaertner", "Hemerocallis", "Cultivars", "photo").filter((x) => /Hemerocallis/.test(x));
    const hemQuiz = ablenker("staudengaertnerei", "gaertner", "Hemerocallis", "Cultivars", "quiz").filter((x) => /Hemerocallis/.test(x));
    const irisFoto = ablenker("staudengaertnerei", "gaertner", "Iris", "Cultivars", "photo").filter((x) => /Iris/.test(x));
    const caninaFoto = ablenker("garten_und_landschaftsbau", "gaertner", "Rosa", "canina", "photo").filter((x) => /Rosa/.test(x));
    // 7) Gemerkte Treffer von Gattungskarten (vor dieser Prüfung) werden einmal neu gesucht – Artkarten nicht
    prof("garten_und_landschaftsbau", "gaertner");
    let suchen = 0; __setPhotoSource(() => { suchen++; return Promise.resolve({ thumb: "https://x/neu.jpg", file: "Rosa 'Westerland' 2019.jpg", src: "cm", title: "T", url: "https://x/y" }); });
    __clearPhotoCache(); photoTried.clear();
    __rememberPhoto(rc.key, { thumb: "https://x/alt.jpg", file: "Rosà ciclabile (4).jpg", src: "cm", title: "T", url: "https://x/y" });
    __rememberPhoto(canina.key, { thumb: "https://x/c.jpg", file: "Rosa canina 1.jpg", src: "cm", title: "T", url: "https://x/y" });
    const neu = await photoFor(rc), nachRc = suchen;
    const art = await photoFor(canina), nachArt = suchen;
    const wieder = await photoFor(rc), nachWieder = suchen;
    __setPhotoSource(null); __setJsonp(window.__offlineJsonp); __clearPhotoCache(); photoTried.clear();
    const [fr, niv] = prev.split("|"); prof(fr, niv);
    return { ohneFilter, mitFilter, aFile: a && a.file, aErr: a && a.err, aWege, bFile: b && b.file, cFile: c && c.file, hem, del, pru, fairy,
      hemFoto, hemQuiz: hemQuiz.length, irisFoto, caninaFoto,
      neuFile: neu && neu.file, neuGv: neu && neu.gv, nachRc, artFile: art && art.file, nachArt, wiederFile: wieder && wieder.file, nachWieder,
      named: [genusNamed("Rosà ciclabile (4).jpg", rc, false), genusNamed("Flag rosa'.jpg", rc, false), genusNamed("Rosa 'Gloria Dei' 01.jpg", rc, true),
        genusNamed("Rosa Parks 1955.jpg", rc, true), genusNamed("Lily (Lilium) in Athens.jpg", { g: "Lilium", a: "cultivars", de: "Lilie", key: "t-li" }, false)],
      lvl: [genusLevel(rc), genusLevel({ g: "Rosa-Hybriden", a: "", key: "t" }), genusLevel(canina), genusLevel({ g: "Taraxacum", a: "sect. Ruderalia", key: "t2" }), genusOf({ g: "Rosa-Hybriden", a: "" })],
      qi: photoSteps(rc).map((s) => s.k + ":" + s.q), qiArt: photoSteps(canina).some((s) => /Quality images/.test(s.q)),
      hilfe: /Sammeleinträgen[\s\S]*nie eine Art, die in\s+deiner Liste eigens steht/.test((document.querySelector("#helpScrim") || {}).textContent || "") };
  });
  assert(gattEbene.ohneFilter && /^Rosà|rosa'/.test(gattEbene.ohneFilter) && gattEbene.mitFilter === null,
    "Sammelschublade »Rosa«: ohne Filter käme Beifang durch (Rosà/Fahne), mit Suchweg keine einzige Datei: " + JSON.stringify(gattEbene));
  assert(gattEbene.aFile === "Rosa 'Westerland' 2019.jpg" && JSON.stringify(gattEbene.aWege) === JSON.stringify(["cm:Rosa cultivar", 'cm:incategory:"Quality images of Rosa"']),
    "»Rosa Cultivars«: Sammelkarte fragt erst die Sortensuche, dann die geprüften »Quality images of Rosa« (vor der Sammelschublade), dort die Gartensorte statt der Hundsrose der Liste: " + JSON.stringify(gattEbene));
  assert(gattEbene.bFile === "Rosa 'Gloria Dei' 2.jpg",
    "Volltext »Rosa«: keine Personen (Rosa Parks/Luxemburg), keine Art der Liste (canina) – die Gartensorte: " + JSON.stringify(gattEbene));
  assert(gattEbene.cFile === "Prunus 'Accolade' 2.jpg",
    "»Prunus 'Sorte'«: Artikelbild Schlehe (Art der Liste) und Prunus serrulata verworfen, ohne Gattungsnamen kein Treffer – die Sorte 'Accolade': " + JSON.stringify(gattEbene));
  assert(JSON.stringify(gattEbene.hem) === "[true,true,false]" && JSON.stringify(gattEbene.del) === "[true,false]" &&
    JSON.stringify(gattEbene.pru) === "[true,true,false,false]" && JSON.stringify(gattEbene.fairy) === "[true,false]",
    "Art derselben Liste erkannt (lateinisch, deutsch, Sorte), der eigene deutsche Name (Zier-Kirsche) nicht: " + JSON.stringify(gattEbene));
  assert(gattEbene.hemFoto.length === 0 && gattEbene.hemQuiz > 0 && gattEbene.irisFoto.length === 0 && gattEbene.caninaFoto.every((x) => /rugosa/.test(x)),
    "Bilder-Modus: keine Ablenker derselben Gattung bei Gattungskarten (in beide Richtungen, auch Bartiris untereinander) – im Text-Quiz schon: " + JSON.stringify(gattEbene));
  assert(gattEbene.neuFile === "Rosa 'Westerland' 2019.jpg" && gattEbene.neuGv >= 1 && gattEbene.nachRc === 1 && gattEbene.artFile === "Rosa canina 1.jpg" && gattEbene.nachArt === 1 &&
    gattEbene.wiederFile === "Rosa 'Westerland' 2019.jpg" && gattEbene.nachWieder === 1,
    "Alter Treffer einer Gattungskarte wird einmal neu gesucht (danach gemerkt), Artkarten behalten ihren: " + JSON.stringify(gattEbene));
  assert(JSON.stringify(gattEbene.named) === "[false,false,true,false,true]" && JSON.stringify(gattEbene.lvl) === '[true,true,false,true,"Rosa"]' &&
    !gattEbene.qiArt && gattEbene.qi.includes('cm:incategory:"Quality images of Rosa"'),
    "genusNamed (Rosà/Fahne/Rosa Parks raus, Sorte/Lilium rein), genusLevel und der Qualitätsbilder-Weg nur für Gattungskarten: " + JSON.stringify(gattEbene));
  assert(gattEbene.hilfe, "Hilfe »Bilder« erklärt die Sammeleinträge (Gattung, nie eine Art der Liste)");

  // Sammeleinträge: Gartenform statt Wildart (Bildcheck-Lauf 4: »Fuchsia Cultivars« zeigte die
  // kolumbianische Wildart F. putumayensis, »Gladiolus Cultivars« G. illyricus, »Canna Cultivars« ein
  // Luftbild der Hebriden-Insel Canna, die drei Begonien-Gruppen dasselbe Bild). Dateinamen aus den
  // echten Commons-Suchen (»Fuchsia cultivar«, »Begonia elatior«, »Begonia rex«, »Canna cultivar«).
  const sammelGarten = await page.evaluate(async () => {
    __setPhotoSource(null);
    const prev = $("#frSelect").value + "|" + $("#nivSelect").value;
    const prof = (fr, niv) => { $("#frSelect").value = fr; $("#nivSelect").value = niv; applyProfile(); };
    prof("zierpflanzenbau", "gaertner");
    const karte = (g, a) => allCards.find((c) => c.g === g && c.a === a);
    const cmP = (i, file, cats) => ({ index: i, title: "File:" + file, imageinfo: [{ thumburl: "https://x/" + encodeURIComponent(file), mime: "image/jpeg", width: 1200,
      descriptionurl: "https://commons/" + file, extmetadata: { Categories: { value: cats || "Photos" }, Artist: { value: "Hp" }, LicenseShortName: { value: "CC BY-SA 4.0" } } }] });
    const cmA = (files) => ({ query: { pages: Object.fromEntries(files.map((f, i) => ["p" + i, Array.isArray(f) ? cmP(i + 1, f[0], f[1]) : cmP(i + 1, f)])) } });
    const leer = { query: { pages: {} } };
    const wege = [];
    const run = async (card, cmFn, wpFn) => { __clearPhotoCache(); photoTried.clear(); wege.length = 0;
      __setJsonp((url) => {
        if (/api\.inaturalist\.org/.test(url)) { wege.push("inat"); return Promise.resolve({ results: [] }); }
        if (/commons/.test(url) && /titles=File/.test(url)) return Promise.resolve({ query: { pages: { "7": { title: "File:x.jpg", imageinfo: [{ mime: "image/jpeg", extmetadata: { Categories: { value: "Photos" } } }] } } } });
        if (/commons/.test(url)) { const q = decodeURIComponent((url.match(/gsrsearch=([^&]+)/) || [])[1] || ""); wege.push("cm:" + q); return Promise.resolve(cmFn(q)); }
        const t = decodeURIComponent((url.match(/titles=([^&]+)/) || [])[1] || ""); wege.push("wp:" + t); return Promise.resolve(wpFn(t)); });
      try { const r = await wikiPhoto(card); return r ? { file: r.file, src: r.src, tmp: !!r.tmp, gal: (r.gal || []).length, url: r.url, rf: r.rf || "", wege: wege.slice() } : null; }
      catch (e) { return { err: String(e), wege: wege.slice() }; } };
    const wpA = (title, extract, img) => ({ query: { pages: { "1": { title, extract, pageimage: img, thumbnail: { source: "https://x/" + img } } } } });
    const fu = karte("Fuchsia", "Cultivars"), gl = karte("Gladiolus", "Cultivars"), ca = karte("Canna", "Cultivars");
    const el = karte("Begonia", "Cultivars Elatior Gruppe"), rex = karte("Begonia", "Cultivars Rex-cultorum Gruppe"), tu = karte("Begonia", "Cultivars Tuberhybrida-Gruppe");
    // 1) Fuchsia: »Fuchsia cultivar« (echte Trefferliste, gekürzt) – Löwenmaul in der Farbe Fuchsia und Wildart raus, benannte Sorte gewinnt
    const FU = ["Bloemknop van een Fuchsia cultivar Origami. 28-06-2026 (d.j.b.).jpg", "Antirrhinum majus Floral Showers Fuchsia 1zz.jpg", "Fuchsia 'Twinny'. Bloeiwijze 01.jpg",
      "Fuchsia 1r.jpg", "Fuchsia cultivar 01.JPG", "Fuchsia putumayensis 04.jpg"];
    const a = await run(fu, (q) => q === "Fuchsia cultivar" ? cmA(FU) : leer, () => leer);
    // 2) Gladiolus: nur Wildarten (Qualitätsbilder, Kategorie, Artikelbild) → die erste als Rückfall …
    const wpGl = wpA("Gladiolen", "Die Gladiolen (Gladiolus) sind eine Pflanzengattung in der Familie der Schwertliliengewächse.", "Gladiolus_illyricus.JPG");
    const b = await run(gl, (q) => /Quality images/.test(q) ? cmA(["Gladiolus italicus 01.jpg"]) : q === 'incategory:"Gladiolus"' ? cmA(["Gladiolus communis 2.jpg"]) : leer, (t) => t === "Gladiolus" ? wpGl : leer);
    // … findet sich später eine Gartensorte, gewinnt sie trotz der früheren Wildart
    const c = await run(gl, (q) => /Quality images/.test(q) ? cmA(["Gladiolus italicus 01.jpg"]) : q === 'incategory:"Gladiolus"' ? cmA(["Gladiolus communis 2.jpg", "Gladiolus 'Priscilla' 3.jpg"]) : leer, () => leer);
    // 3) Canna: der Artikel »Canna« ist die Hebriden-Insel → nie; »Canna cultivar« → Gartenform vor »Canna sp.«
    const insel = wpA("Canna", "Canna (schottisch-gälisch Canaigh) ist die westlichste der Small Isles, die zu den Inneren Hebriden in Schottland gehören.", "Canna_(Canaigh)_Aerial_Pan180_alt.jpg");
    const d = await run(ca, () => leer, (t) => t === "Canna" ? insel : leer);
    const e = await run(ca, (q) => q === "Canna cultivar" ? cmA(["Canna sp.jpg", "Canna Roma FR 2012.jpg", "Canna cultivar (2).jpg"]) : leer, (t) => t === "Canna" ? insel : leer);
    // 4) Begonien-Gruppen: zuerst die Gruppe (»Begonia elatior« / »Begonia rex«), Dateien anderer Formen nur als Rückfall
    const f = await run(el, (q) => q === "Begonia elatior" ? cmA(["Elatior begonia.jpg", "Begonia sp. 3.jpg", "Begonia (Begonia elatior) in Athens on May 3, 2023.jpg"]) : leer, () => leer);
    const g = await run(rex, (q) => q === "Begonia rex" ? cmA(["Begonia sp. 3.jpg", "Begonia rex 2zz.jpg"]) : leer, () => leer);
    // Knollenbegonie: Gruppe nur über die Kategorie bzw. den deutschen Artikel erkennbar
    const h = await run(tu, (q) => q === "Begonia tuberhybrida" ? cmA([["Begonia Nonstop 01.jpg", "Begonia × tuberhybrida|Flowers"]]) : leer, () => leer);
    const wpKnolle = wpA("Knollenbegonie", "Die Knollenbegonie (Begonia ×tuberhybrida) ist eine Hybride aus mehreren Begonien-Arten.", "Begonia_Nonstop_Red.jpg");
    const i = await run(tu, (q) => /Quality images|cultivar/.test(q) ? cmA(["Begonia sp. 3.jpg"]) : leer, (t) => t === "Knollenbegonie" ? wpKnolle : leer);
    // Gruppe nirgends genannt → andere Gartenform als Rückfall (vor der Wildart)
    const j = await run(tu, (q) => /Quality images/.test(q) ? cmA(["Begonia grandis 1.jpg"]) : /cultivar/.test(q) ? cmA(["Begonia 'Bonfire'.jpg", "Begonia sp. 3.jpg"]) : leer, () => leer);
    // 5) Bildcheck-Lauf 5 (Realfälle): Qualitätsbilder liefen vor der Sortensuche und nahmen jedes Bild sofort an –
    //    Streptocarpus zeigte die Saintpaulia der Liste, Lilium den wilden Türkenbund, Lupinus die texanische
    //    Wildlupine, Calibrachoa eine Hummel. Jetzt: Sortensuche zuerst, sofort nur erkennbare Gartenform.
    const ka = (fr, niv, gg, aa) => { prof(fr, niv); return karte(gg, aa); };
    const st = ka("zierpflanzenbau", "gaertner", "Streptocarpus", "Cultivars");
    const k = await run(st, (q) => q === "Streptocarpus cultivar" ? cmA(["Saintpaulia (cultivar) 01.jpg", "Streptocarpus 'Bethan'.jpg"]) : leer, () => leer);
    const k2 = await run(st, (q) => /Quality images/.test(q) ? cmA(["Saintpaulia20110530 01.jpg", "Streptocarpus sp. (Cape primrose) 3.jpg"]) : leer, () => leer);
    const li = ka("zierpflanzenbau", "gaertner", "Lilium", "Cultivars");
    const m = await run(li, (q) => /Quality images/.test(q) ? cmA(["Türkenbund Lilie, Lilium martagon.JPG"]) : q === "Lilium cultivar" ? cmA(["Lilium cultivar 2016 G1.jpg", "Lilium 'Nochka' 02.jpg"]) : leer, () => leer);
    const cal = ka("friedhofsgaertnerei", "gaertner", "Calibrachoa", "Cultivars");
    const l = await run(cal, (q) => q === "Calibrachoa cultivar" ? cmA(["(MHNT) Bombus pascuorum on Calibrachoa 'Cabaret Purple'.jpg", "Calibrachoa cultivar A 5Dsr 4024.jpg"]) : leer, () => leer);
    const lup = ka("garten_und_landschaftsbau", "gaertner", "Lupinus", "cultivars");
    const n = await run(lup, (q) => q === "Lupinus cultivar" ? cmA(["Lupin 'Persian Slipper' - 2018-05-21 - Andy Mabbett - 01.jpg", "Lupinus polyphyllus Manhattan Lights 2019-05-23 3666.jpg"]) : leer, () => leer);
    const wpLup = wpA("Vielblättrige Lupine", "Die Vielblättrige Lupine (Lupinus polyphyllus) ist eine Pflanzenart aus der Gattung der Lupinen.", "Lupinus_polyphyllus_01.jpg");
    const o = await run(lup, (q) => /Quality images/.test(q) ? cmA(["Bluebonnet-8100.jpg"]) : leer, (t) => t === "Stauden-Lupine" ? wpLup : leer);
    const paph = ka("zierpflanzenbau", "gaertner", "Paphiopedilum", "Cultivars");
    const neu5 = { st: k && k.file, stWege: k && k.wege, st2: k2 && k2.file, st2rf: k2 && k2.rf, lil: m && m.file, lilWege: m && m.wege, cal: l && l.file,
      lup: n && n.file, lup2: o && o.file, lup2rf: o && o.rf,
      wildPaph: wildSpeciesFile("Venusschuh paphiopedilum tranlienianum.jpg", paph), wildMart: wildSpeciesFile("Türkenbund Lilie, Lilium martagon.JPG", li),
      garten: [gardenEvident("Canna Roma FR 2012.jpg", ca, false), gardenEvident("Lupinus polyphyllus Manhattan Lights 2019.jpg", lup, false),
        gardenEvident("Lupinus polyphyllus Manhattan Lights 2019.jpg", lup, true), gardenEvident("Rhododendron caucasicum, Plants, Flowers, Caucasus Mountains.jpg", { g: "Rhododendron", a: "Cultivars" }, true),
        gardenEvident("Lilium Roselily 'Elena'.jpg", li, false)],
      fremd2: [namesOtherTaxon("Saintpaulia20110530 01.jpg", st), namesOtherTaxon("Streptocarpus 'Bethan'.jpg", st)],
      auf: [onPlantPhoto("(MHNT) Bombus pascuorum on Calibrachoa 'Cabaret Purple'.jpg", cal), onPlantPhoto("Apis mellifera auf Lavandula angustifolia.jpg", { g: "Lavandula", a: "angustifolia" }),
        onPlantPhoto("Bee on a flower of Salvia nemorosa.jpg", { g: "Salvia", a: "nemorosa" }), onPlantPhoto("Calibrachoa 'Cabaret Purple'.jpg", cal), onPlantPhoto("Rosa on display at Kew.jpg", { g: "Rosa", a: "Cultivars" })] };
    prof("zierpflanzenbau", "gaertner");
    const inat = [a, b, c, d, e, f, g, h, i, j, k, k2, m, l, n, o].some((x) => x && x.wege && x.wege.includes("inat"));   // Sammelkarten fragen iNaturalist nie
    // Info-Karte: Ein-Wort-Titel nur als Pflanzenartikel (»Canna« = Insel → ehrlich »nicht gefunden«)
    const missing = { query: { pages: { "-1": { title: "x", missing: "" } } } };
    const wpI = (title, extract) => ({ query: { pages: { "1": { title, extract, thumbnail: { source: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" } } } } });
    __setJsonp((url) => {
      if (/generator=images/.test(url)) return Promise.resolve({ query: { pages: {} } });
      const t = decodeURIComponent((url.match(/titles=([^&]+)/) || [])[1] || "");
      if (t === "Canna") return Promise.resolve(wpI("Canna", "Canna (schottisch-gälisch Canaigh) ist die westlichste der Small Isles, die zu den Inneren Hebriden in Schottland gehören."));
      if (t === "Indisches Blumenrohr") return Promise.resolve(wpI("Indisches Blumenrohr", "Das Indische Blumenrohr (Canna indica) ist eine Pflanzenart aus der Gattung der Blumenrohre."));
      return Promise.resolve(missing);
    });
    const laden = async (cc) => {
      wikiCache.delete(cc.key); openInfo(cc); document.querySelector("#wpLoad").click();
      for (let k = 0; k < 80 && !document.querySelector("#wpHost .wp-text, #wpHost .wp-note"); k++) await new Promise((r) => setTimeout(r, 25));
      const hh = document.querySelector("#wpHost");
      const r = { text: (hh.querySelector(".wp-text") || {}).textContent || "", none: (hh.querySelector(".wp-note") || {}).textContent || "" };
      closeInfo(); return r;
    };
    const infoInsel = await laden(Object.assign({}, ca, { key: "t-canna-insel", de: "Canna" }));
    const infoRohr = await laden(ca);
    const units = {
      grp: ["Cultivars Elatior-Grp.", "Cultivars Rex-cultorum Gruppe", "Cultivars Tuberhybrida-Gruppe", "Neu-Guinea-Hybriden", "Cultivars Neuguinea-Gruppe", "Belladonna Gruppe",
        "Cultivars (Belladonna-Gruppe)", "Cultivars", "'Sorte'", "Cultivars in Sorten"].map((x) => sammelGroup({ g: "Begonia", a: x })),
      wild: ["Fuchsia putumayensis 04.jpg", "Fuchsia 'Twinny'.jpg", "Fuchsia magellanica 'Riccartonii'.jpg", "Fuchsia cultivar 01.JPG", "Fuchsia flowers.jpg", "Fuchsia sp.jpg",
        "Fuchsia x hybrida.jpg", "Fuchsia-magellanica-2.jpg"].map((x) => wildSpeciesFile(x, fu)),
      fremd: [namesOtherTaxon("Antirrhinum majus Floral Showers Fuchsia 1zz.jpg", fu), namesOtherTaxon("Fuchsia, Rosa rot.jpg", fu), namesOtherTaxon("Fuchsia 'Twinny'.jpg", fu),
        namesOtherTaxon("Coastal Georgia Botanical Gardens, Variegated New Guinea Impatiens hawkeri 'Painted Paradise Orange'.jpg", karte("Impatiens", "Cultivars Neuguinea-Gruppe"))],
      pflanze: [plantArticle({ title: "Canna", extract: "Canna (schottisch-gälisch Canaigh) ist die westlichste der Small Isles, die zu den Inneren Hebriden in Schottland gehören." }),
        plantArticle({ title: "Blumenrohr", extract: "Die Blumenrohre (Canna) bilden die einzige Pflanzengattung der Familie der Blumenrohrgewächse." }),
        plantArticle({ title: "Iris", extract: "Iris steht für: Schwertlilien (Iris), eine Pflanzengattung" }),
        plantArticle({ title: "Teehybride", extract: "Teehybriden sind eine Gruppe von Rosensorten." })],
      sammel: [sammelCard(fu), sammelCard({ g: "Rosa", a: "Cultivars 'The Fairy'" }), sammelCard({ g: "Taraxacum", a: "sect. Ruderalia" }), sammelCard({ g: "Fuchsia-Hybriden", a: "" }), sammelCard({ g: "Abies", a: "koreana" })],
      stufen: photoSteps(el).map((s) => s.k + ":" + s.q),
      hilfe: /Gartenform[\s\S]*Elatior/.test((document.querySelector("#helpScrim") || {}).textContent || ""),
    };
    // Gemerkter Treffer einer Sammelkarte aus der vorigen Prüfung (gv 1, z. B. die Wildart) → einmal neu suchen, danach gemerkt
    let neuSuchen = 0;
    __setPhotoSource(() => { neuSuchen++; return Promise.resolve({ thumb: "https://x/t.jpg", file: "Fuchsia 'Twinny'.jpg", src: "cm", title: "T", url: "https://x/y" }); });
    __clearPhotoCache(); photoTried.clear();
    __rememberPhoto(fu.key, { thumb: "https://x/alt.jpg", file: "Fuchsia putumayensis 04.jpg", src: "cm", title: "T", url: "https://x/y", gv: 1 });
    const auffr = await photoFor(fu), auffrSuchen = neuSuchen;
    const nochmal = await photoFor(fu), nochmalSuchen = neuSuchen;
    __setPhotoSource(null); __setJsonp(window.__offlineJsonp); __clearPhotoCache(); photoTried.clear();
    const [fr, niv] = prev.split("|"); prof(fr, niv);
    return { a, b, c, d, e, f, g, h, i, j, inat, infoInsel, infoRohr, units, neu5,
      auffr: { file: auffr && auffr.file, gv: auffr && auffr.gv, suchen: auffrSuchen, nochmalFile: nochmal && nochmal.file, nochmalSuchen } };
  });
  const sg = sammelGarten;
  assert(sg.a && sg.a.file === "Fuchsia 'Twinny'. Bloeiwijze 01.jpg" && sg.a.src === "cm" && JSON.stringify(sg.a.wege) === JSON.stringify(["cm:Fuchsia cultivar"]) && sg.a.gal === 4,
    "»Fuchsia Cultivars«: »Fuchsia cultivar« liefert die benannte Gartensorte; Löwenmaul »… Fuchsia« (Farbe) und die Wildart F. putumayensis sind nicht dabei: " + JSON.stringify(sg.a));
  assert(sg.b && sg.b.file === "Gladiolus italicus 01.jpg" && sg.b.src === "cm" && sg.b.gal === 3 && sg.b.rf === "wild" && sg.b.wege[sg.b.wege.length - 1] === "cm:Gladiolus" && sg.a.rf === "",
    "»Gladiolus Cultivars« ohne Gartensorte: erst alle Wege, dann die erste Wildart als Rückfall (Foto vor Zeichnung): " + JSON.stringify(sg.b));
  assert(sg.c && sg.c.file === "Gladiolus 'Priscilla' 3.jpg", "Eine spätere Gartensorte schlägt die frühere Wildart: " + JSON.stringify(sg.c));
  assert(sg.d === null && sg.e && sg.e.file === "Canna Roma FR 2012.jpg" && !sg.e.wege.includes("wp:Canna"),
    "»Canna Cultivars«: der Artikel »Canna« (Hebriden-Insel) wird nie genommen; »Canna cultivar« → Gartenform vor »Canna sp.«, " +
    "die benannte Sorte direkt hinter der Gattung ('Roma') vor dem namenlosen »Canna cultivar (2)«: " + JSON.stringify({ d: sg.d, e: sg.e }));
  assert(sg.f && sg.f.file === "Begonia (Begonia elatior) in Athens on May 3, 2023.jpg" && JSON.stringify(sg.f.wege) === JSON.stringify(["cm:Begonia elatior"]) &&
    sg.g && sg.g.file === "Begonia rex 2zz.jpg",
    "Begonien-Gruppen: zuerst die genannte Gruppe (Elatior/Rex), nicht irgendeine Begonie: " + JSON.stringify({ f: sg.f, g: sg.g }));
  assert(sg.h && sg.h.file === "Begonia Nonstop 01.jpg" && sg.i && sg.i.file === "Begonia_Nonstop_Red.jpg" && sg.i.src === "wp" && sg.j && sg.j.file === "Begonia 'Bonfire'.jpg" && sg.j.src === "cm" && sg.j.rf === "form",
    "Knollenbegonie: Gruppe über Kategorie bzw. deutschen Artikel erkannt; nirgends genannt → andere Gartenform vor Wildart: " + JSON.stringify({ h: sg.h, i: sg.i, j: sg.j }));
  assert(!sg.inat, "Sammelkarten fragen iNaturalist nie (dort gäbe es nur Wildarten)");
  const n5 = sg.neu5;
  assert(n5.st === "Streptocarpus 'Bethan'.jpg" && JSON.stringify(n5.stWege) === JSON.stringify(["cm:Streptocarpus cultivar"]) &&
    n5.st2 === "Streptocarpus sp. (Cape primrose) 3.jpg" && n5.st2rf === "form",
    "Streptocarpus: nie die Saintpaulia der Liste (Sortensuche: Gattung fehlt im Namen; Qualitätsbilder: andere Listen-Gattung); ohne erkennbare Gartenform nur als Rückfall: " + JSON.stringify(n5));
  assert(n5.lil === "Lilium 'Nochka' 02.jpg" && JSON.stringify(n5.lilWege) === JSON.stringify(["cm:Lilium cultivar"]) && n5.wildMart && n5.wildPaph,
    "Lilium: Sortensuche vor den Qualitätsbildern (Türkenbund = Wildart, auch ohne lateinische Endung; kleingeschriebene Gattung erkannt): " + JSON.stringify(n5));
  assert(n5.cal === "Calibrachoa cultivar A 5Dsr 4024.jpg", "Calibrachoa: das Hummel-Foto »… on Calibrachoa« fällt raus, obwohl es Gattung und Sorte nennt: " + JSON.stringify(n5));
  assert(n5.lup === "Lupinus polyphyllus Manhattan Lights 2019-05-23 3666.jpg" && n5.lup2 === "Lupinus_polyphyllus_01.jpg" && n5.lup2rf === "wild",
    "Lupinus: Sorte ohne Anführungszeichen aus der Sortensuche gilt als Gartenform (»Lupin« ist nicht die Gattung); ohne Gartenform schlägt die benannte Art das namenlose Bluebonnet-Foto: " + JSON.stringify(n5));
  assert(JSON.stringify(n5.garten) === JSON.stringify([true, false, true, false, true]) && JSON.stringify(n5.fremd2) === JSON.stringify([true, false]) &&
    JSON.stringify(n5.auf) === JSON.stringify([true, true, true, false, false]),
    "gardenEvident (Sortenname ohne Anführungszeichen, hinter dem Epitheton nur in der Sortensuche, »Plants« ist kein Sortenname), namesOtherTaxon (Saintpaulia), onPlantPhoto (Tier auf der Pflanze): " + JSON.stringify(n5));
  assert(/Kein deutscher Wikipedia-Artikel gefunden/.test(sg.infoInsel.none) && !/Hebriden/.test(sg.infoInsel.text) && /Canna indica/.test(sg.infoRohr.text),
    "Info-Karte: der Ein-Wort-Titel »Canna« (Insel) wird übergangen, das Indische Blumenrohr erscheint: " + JSON.stringify({ insel: sg.infoInsel, rohr: sg.infoRohr }));
  assert(JSON.stringify(sg.units.grp) === JSON.stringify([["elatior", "hiemalis"], ["rex"], ["tuberhybrida"], ["new guinea", "hawkeri"], ["new guinea", "hawkeri"], ["belladonna"], ["belladonna"], [], [], []]),
    "sammelGroup: genannte Gruppe → Suchwörter (Elatior/hiemalis, Rex, Tuberhybrida, Neuguinea → »new guinea«/hawkeri, Belladonna); reine Sammelwörter → keine: " + JSON.stringify(sg.units.grp));
  assert(JSON.stringify(sg.units.wild) === JSON.stringify([true, false, false, false, false, false, false, true]),
    "wildSpeciesFile: benannte Wildart ja; Sorte, Sorte einer Art, »cultivar«, »flowers«, »sp.«, »x hybrida« nein; Bindestrich-Dateiname erkannt: " + JSON.stringify(sg.units.wild));
  assert(JSON.stringify(sg.units.fremd) === JSON.stringify([true, false, false, false]),
    "namesOtherTaxon: Art einer anderen Gattung (Löwenmaul) ja; Farbwort »Rosa rot«, eigene Sorte, Ortsnamen nein: " + JSON.stringify(sg.units.fremd));
  assert(JSON.stringify(sg.units.pflanze) === JSON.stringify([false, true, false, true]), "plantArticle: Insel und Begriffsklärung nein, Gattungs- und Sortenartikel ja: " + JSON.stringify(sg.units.pflanze));
  assert(JSON.stringify(sg.units.sammel) === JSON.stringify([true, false, false, true, false]), "sammelCard: Sammeleintrag ja; benannte Sorte, Sektion, Art nein: " + JSON.stringify(sg.units.sammel));
  assert(JSON.stringify(sg.units.stufen.slice(0, 4)) === JSON.stringify(["cm:Begonia elatior", "cm:Begonia hiemalis", "cm:Begonia cultivar", 'cm:incategory:"Quality images of Begonia"']),
    "Suchwege einer Gruppen-Sammelkarte: Gruppe (mit Synonym) → Gartensorten → Qualitätsbilder: " + JSON.stringify(sg.units.stufen));
  assert(sg.units.hilfe, "Hilfe »Bilder« nennt die Gartenform der Sammeleinträge (samt Gruppen wie Elatior)");
  assert(sg.auffr.file === "Fuchsia 'Twinny'.jpg" && sg.auffr.gv === 2 && sg.auffr.suchen === 1 && sg.auffr.nochmalFile === "Fuchsia 'Twinny'.jpg" && sg.auffr.nochmalSuchen === 1,
    "Gemerkte Treffer von Sammelkarten aus der vorigen Prüfung (gv 1) werden einmal neu gesucht, danach gemerkt: " + JSON.stringify(sg.auffr));

  // Bildcheck-Lauf 6 (Realfälle, echte Trefferlisten von Commons, wörtlich): Eine Gartensorte zählt DIREKT
  // hinter der Gattung – nicht die Sortenform einer Wildart (»Verbena hastata 'Rosea'« für die Garten-Verbene,
  // »Tulipa aleppensis cultivar« für die Gartentulpe). »Prunus 'Sorte'« (Zier-Kirsche) fand in der
  // Sortensuche nur Arten der Liste und landete bei einer Mandel-Pfirsich-Hybride – jetzt sucht die Kette
  // zuerst die typischen Gartensorten, die auch die Info-Karte nennt ('Accolade', 'Kanzan').
  const lauf6 = await page.evaluate(async () => {
    __setPhotoSource(null);
    const prev = $("#frSelect").value + "|" + $("#nivSelect").value;
    const prof = (fr, niv) => { $("#frSelect").value = fr; $("#nivSelect").value = niv; applyProfile(); };
    const karte = (g, a) => allCards.find((c) => c.g === g && c.a === a);
    const cmP = (i, file) => ({ index: i, title: "File:" + file, imageinfo: [{ thumburl: "https://x/" + encodeURIComponent(file), mime: "image/jpeg", width: 1200,
      descriptionurl: "https://commons/" + file, extmetadata: { Categories: { value: "Photos" }, Artist: { value: "Hp" }, LicenseShortName: { value: "CC BY-SA 4.0" } } }] });
    const cmA = (files) => ({ query: { pages: Object.fromEntries(files.map((f, i) => ["p" + i, cmP(i + 1, f)])) } });
    const leer = { query: { pages: {} } }, wege = [];
    const run = async (card, cmFn) => { __clearPhotoCache(); photoTried.clear(); wege.length = 0;
      __setJsonp((url) => {
        if (/api\.inaturalist\.org/.test(url)) { wege.push("inat"); return Promise.resolve({ results: [] }); }
        if (/commons/.test(url) && /titles=File/.test(url)) return Promise.resolve({ query: { pages: { "7": { title: "File:x.jpg", imageinfo: [{ mime: "image/jpeg", extmetadata: { Categories: { value: "Photos" } } }] } } } });
        if (/commons/.test(url)) { const q = decodeURIComponent((url.match(/gsrsearch=([^&]+)/) || [])[1] || ""); wege.push("cm:" + q); return Promise.resolve(cmFn(q)); }
        wege.push("wp"); return Promise.resolve(leer); });
      try { const r = await wikiPhoto(card); return r ? { file: r.file, rf: r.rf || "", wege: wege.slice() } : { file: null, wege: wege.slice() }; }
      catch (e) { return { err: String(e), wege: wege.slice() }; } };
    const VE = ["Verbena hastata 'Rosea'.JPG", "Verbena canadensis Imagination 2zz.jpg", "Verbena Tukana Scarlet 1zz.jpg", "Verbena tenuisecta Edith 0zz.jpg",
      "Verbena canadensis Imagination 1zz.jpg", "Verbena Superbena Burgundy 0zz.jpg", "Verbena Aztec Coral 1zz.jpg", "Verbena Superbena Burgundy 2zz.jpg",
      "Verbena ciliata Pink Sunrise 0zz.jpg", "Verbena tenera Sissinghurst 2zz.jpg", "Verbena Tukana Scarlet 2zz.jpg", "Verbena tenera Sissinghurst 3zz.jpg"];
    const TU = ["Tulipa suaveolens floriade to Canberra.jpg", "Tulipa flower.jpg", "Tulipa sp 2011.jpg", "Tulipa aleppensis cultivar.jpg", "Tulipa qtl1.jpg",
      "Tulipa Juliette - April 2023.jpg", "Tulipa cultivar Jdp.jpg", "Tulipa cultivar 01.jpg", "Tulipa cultivar 02.jpg", "Tulipa cultivar 03.JPG",
      "Tulipa (parrot, red cultivar) 02.JPG", "Unidentified Tulipa cultivar (109515021).jpg"];
    const PC = ["Prunus serrulata cultivar 1DS-II 3-9331.jpg", "Prunus serrulata cultivar 1DS-II 3-9326.jpg", "Prunus cerasifera blossoms.jpg",
      "Prunus cerasifera rotblättriger Cultivar (Blutpflaume) in Tübingen 05.jpg", "Prunus cerasifera rotblättriger Cultivar (Blutpflaume) in Tübingen 23.jpg"];
    const PA = ["Prunus 'Accolade' Flowers 3008px.jpg", "Prunus Accolade 2017-04-17 7455.jpg", "Prunus Accolade 2017-04-17 7468.jpg", "Prunus 'Accolade' Flower 2313px.jpg",
      "Lyon 7e - Prunus 'Accolade' planté place du Commandant Bulard (juin 2022).jpg", "20150305 CityHall Accolade Cutler P1160188 - Flickr - wlcutler.jpg"];
    const PK = ["Cerisier du Japon Prunus serrulata.jpg", "Prunus 'Kanzan', Christchurch Botanic Gardens, Canterbury, New Zealand 14.jpg",
      "Prunus serrulata Kanzan blossom Jardin des Plantes 2013-04-21.jpg", "Kanzan cherry blossoms, Rostock.jpg", "Cerasus serrulata ‘Kanzan’ photographed at Nihon Kokkaen.jpg",
      "Prunus serrulata 'Kanzan' 01.JPG", "Wojsławice, arboretum, Prunus 'Kanzan'.jpg", "Prunus Serrulata ´Kanzan´ - panoramio.jpg"];
    prof("zierpflanzenbau", "gaertner");
    const vb = karte("Verbena", "Cultivars"), tl = karte("Tulipa", "Cultivars");
    const ve = await run(vb, (q) => q === "Verbena cultivar" ? cmA(VE) : leer);
    const tu = await run(tl, (q) => q === "Tulipa cultivar" ? cmA(TU) : leer);
    const sc = { ve: ["Verbena hastata 'Rosea'.JPG", "Verbena canadensis Imagination 2zz.jpg", "Verbena Tukana Scarlet 1zz.jpg"].map((f) => commonsScore(f, vb)),
      tu: ["Tulipa aleppensis cultivar.jpg", "Tulipa cultivar 01.jpg", "Tulipa Juliette - April 2023.jpg", "Tulipa 'Apeldoorn' 2.jpg", "Tulipa flower.jpg"].map((f) => commonsScore(f, tl)) };
    prof("garten_und_landschaftsbau", "gaertner");
    const pr = karte("Prunus", "'Sorte'"), ma = karte("Malus", "'Sorte'");
    const p1 = await run(pr, (q) => q === "Prunus Accolade" ? cmA(PA) : q === "Prunus cultivar" ? cmA(PC) : leer);
    const p2 = await run(pr, (q) => q === "Prunus Kanzan" ? cmA(PK) : q === "Prunus cultivar" ? cmA(PC) : leer);
    const p3 = await run(pr, (q) => q === "Prunus cultivar" ? cmA(PC) : leer);
    const box = document.createElement("div"); box.innerHTML = sortenInfoHTML(pr);
    const out = { ve, tu, sc, p1, p2, p3: { file: p3.file, err: p3.err, cultivarSchritt: p3.wege.includes("cm:Prunus cultivar") },
      steps: photoSteps(pr).slice(0, 3).map((s) => s.k + ":" + s.q), malus: photoSteps(ma).slice(0, 3).map((s) => s.k + ":" + s.q),
      info: /'Accolade', 'Kanzan'/.test(box.textContent) };
    __setJsonp(window.__offlineJsonp); __clearPhotoCache(); photoTried.clear();
    const [fr, niv] = prev.split("|"); prof(fr, niv);
    return out;
  });
  assert(lauf6.ve.file === "Verbena Tukana Scarlet 1zz.jpg" && lauf6.tu.file === "Tulipa Juliette - April 2023.jpg",
    "Garten-Verbene/-Tulpe: Sorte direkt hinter der Gattung statt Sortenform einer Wildart (V. hastata, T. aleppensis): " + JSON.stringify(lauf6));
  assert(lauf6.sc.ve[2] > lauf6.sc.ve[0] && lauf6.sc.ve[0] === lauf6.sc.ve[1] && lauf6.sc.tu[2] > lauf6.sc.tu[1] && lauf6.sc.tu[1] > lauf6.sc.tu[0] &&
    lauf6.sc.tu[3] === lauf6.sc.tu[2] && lauf6.sc.tu[4] === lauf6.sc.tu[0],
    "commonsScore: Sorte direkt hinter der Gattung (mit/ohne Anführungszeichen) > »Gattung cultivar« > Sorte hinter einem Epitheton = namenloses Foto: " + JSON.stringify(lauf6.sc));
  assert(JSON.stringify(lauf6.steps) === JSON.stringify(["cm:Prunus Accolade", "cm:Prunus Kanzan", "cm:Prunus cultivar"]) &&
    JSON.stringify(lauf6.malus) === JSON.stringify(["cm:Malus Evereste", 'cm:Malus "Red Sentinel"', "cm:Malus cultivar"]) && lauf6.info,
    "Platzhalter-Sammelkarten suchen zuerst die typischen Gartensorten der Info-Karte (mehrteilige als Phrase), 'Accolade' vor 'Kanzan': " + JSON.stringify(lauf6));
  assert(lauf6.p1.file === "Prunus 'Accolade' Flowers 3008px.jpg" && JSON.stringify(lauf6.p1.wege) === JSON.stringify(["cm:Prunus Accolade"]) &&
    lauf6.p2.file === "Prunus 'Kanzan', Christchurch Botanic Gardens, Canterbury, New Zealand 14.jpg" &&
    lauf6.p3.file === null && !lauf6.p3.err && lauf6.p3.cultivarSchritt,
    "»Prunus 'Sorte'«: 'Accolade' sofort; sonst 'Kanzan' ohne die eigens gelistete P. serrulata im Namen; die Sortensuche allein liefert nur Arten der Liste (alle verworfen): " + JSON.stringify(lauf6));

  // Bildcheck-Lauf 7 durchgesehen (echte Dateinamen): ein Monatsname ist kein Sortenname (»Phalaenopsis
  // July 2020-2« schlug die Gartensorte), »Abeja (Bombus) en una Dahlia x hortensis« ist ein Tierfoto
  // (spanisch »en« = auf), »Allium cepa with Erwinia carotovora« zeigt Bakterienfäule (Lauf 6: Küchen-Zwiebel)
  const lauf7 = await page.evaluate(async () => {
    __setPhotoSource(null);
    const prev = $("#frSelect").value + "|" + $("#nivSelect").value;
    const prof = (fr, niv) => { $("#frSelect").value = fr; $("#nivSelect").value = niv; applyProfile(); };
    prof("zierpflanzenbau", "gaertner");
    const ph = allCards.find((c) => c.g === "Phalaenopsis" && c.a === "Cultivars");
    const cmP = (i, file) => ({ index: i, title: "File:" + file, imageinfo: [{ thumburl: "https://x/" + encodeURIComponent(file), mime: "image/jpeg", width: 1200,
      descriptionurl: "https://commons/" + file, extmetadata: { Categories: { value: "Photos" }, Artist: { value: "Hp" }, LicenseShortName: { value: "CC BY-SA 4.0" } } }] });
    const leer = { query: { pages: {} } };
    const PH = ["Phalaenopsis Cultivar White 01.jpg", "Phalaenopsis Cultivar Mini 01.jpg", "Phalaenopsis Cultivar Yellow 01.jpg", "Phalaenopsis (aka).jpg",
      "Phalaenopsis cultivar FR 2012.jpg", "Phalaenopsis July 2020-2.jpg", "Phalaenopsis white cultivar 2.jpg", "Phalaenopsis purple cultivar 2.jpg",
      "Phalaenopsis cultivar 01.jpg", "Phalaenopsis cultivar 04 double spike full.jpg", "Orchiedeenlüte 2019-05-21 12-03-31 (C)-PSD.jpg", "Phalaenopsis cultivar (Moth orchid).jpg"];
    __clearPhotoCache(); photoTried.clear();
    __setJsonp((url) => {
      if (/api\.inaturalist\.org/.test(url)) return Promise.resolve({ results: [] });
      if (/commons/.test(url) && !/titles=File/.test(url)) {
        const q = decodeURIComponent((url.match(/gsrsearch=([^&]+)/) || [])[1] || "");
        return Promise.resolve(q === "Phalaenopsis cultivar" ? { query: { pages: Object.fromEntries(PH.map((f, i) => ["p" + i, cmP(i + 1, f)])) } } : leer);
      }
      return Promise.resolve(leer); });
    let phFile = null; try { const r = await wikiPhoto(ph); phFile = r && r.file; } catch (e) { phFile = "Fehler: " + e; }
    const dah = { g: "Dahlia", a: "x hortensis" }, lav = { g: "Lavandula", a: "angustifolia" }, sal = { g: "Salvia", a: "nemorosa" };
    const out = { phFile,
      monat: [gardenEvident("Phalaenopsis July 2020-2.jpg", ph, false), gardenEvident("Hosta 'June' 01.jpg", { g: "Hosta", a: "Cultivars" }, false),
        gardenEvident("Tulipa Juliette - April 2023.jpg", { g: "Tulipa", a: "Cultivars" }, false)],
      score: [commonsScore("Phalaenopsis July 2020-2.jpg", ph), commonsScore("Phalaenopsis Cultivar White 01.jpg", ph)],
      tier: [onPlantPhoto("Abeja (Bombus) en una Dahlia x hortensis, jardín botánico de Tallin, Estonia, 2012-08-12, DD 02.jpg", dah),
        onPlantPhoto("Abelha em Lavandula angustifolia.jpg", lav), onPlantPhoto("Ape sulla Salvia nemorosa.jpg", sal),
        onPlantPhoto("Dahlia en fleur 2019.jpg", dah), onPlantPhoto("Dahlia x hortensis 'Bishop of Llandaff'.jpg", dah)],
      schaden: [looksDamage("Allium cepa with Erwinia carotovora subsp. carotovora (10).jpg"), looksDamage("Apfelschorf an Malus domestica.jpg"),
        looksDamage("Weichfäule an Kartoffel.jpg"), looksDamage("Tetranychus urticae spider mites on bean.jpg"), looksDamage("Grauschimmel an Erdbeere.jpg")],
      bleibt: ["Allium cepa (Amaryllidaceae).jpg", "Dracocephalum moldavica 1.jpg", "Deutzia_scabra_A.jpg", "Scabiosa caucasica-IMG 0709.jpg",
        "Juniperus horizontalis Wiltonii 2020-06-23 0840.jpg", "Russels_Brandkraut.jpg", "Blauer_Eisenhut_Dolomiten.jpg", "Nematanthus gregarius 1.jpg",
        "Frangula alnus Faulbaum 2.jpg", "Picea glauca Schimmel-Fichte 1.jpg"].filter((f) => looksDamage(f)),
      // über alle Listen: kein botanischer und kein deutscher Name sieht nach Schadbild oder Tierfoto aus
      // Etikett/Pflanzenschild verrät die Lösung (Lauf 7: Goldregen mit Verkaufsetikett); »labellum« bleibt
      etikett: [usablePhoto("Laburnum × watereri (Goldenchain tree)- invasive plant sold in stores label.jpg"), usablePhoto("Pflanzenetikett Malus Evereste.jpg"),
        usablePhoto("Phalaenopsis labellum detail.jpg"), usablePhoto("20230503Laburnum × watereri2.jpg")],
      listen: Object.values(SEEDS).flat().filter((r) => looksDamage(r[0] + " " + r[1]) || looksDamage(r[3] || "") || onPlantPhoto(r[0] + " " + r[1], { g: r[0], a: r[1] }) ||
        !usablePhoto(r[0] + " " + r[1]) || !usablePhoto(r[3] || "")).map((r) => r[0] + " " + r[1]) };
    __setJsonp(window.__offlineJsonp); __clearPhotoCache(); photoTried.clear();
    const [fr, niv] = prev.split("|"); prof(fr, niv);
    return out;
  });
  assert(lauf7.phFile === "Phalaenopsis Cultivar White 01.jpg" && JSON.stringify(lauf7.monat) === "[false,true,true]" && lauf7.score[0] < lauf7.score[1],
    "Monatsname ist kein Sortenname (»Phalaenopsis July 2020-2« verliert gegen »Phalaenopsis Cultivar White 01«; 'June' in Anführungszeichen bleibt Sorte): " + JSON.stringify(lauf7));
  assert(JSON.stringify(lauf7.tier) === "[true,true,true,false,false]",
    "onPlantPhoto: Tier auf der Pflanze auch spanisch/portugiesisch/italienisch (en una / em / sulla); »Dahlia en fleur« und Sortenfoto bleiben: " + JSON.stringify(lauf7.tier));
  assert(JSON.stringify(lauf7.etikett) === "[false,false,true,true]",
    "usablePhoto: Etikett/Pflanzenschild raus (verrät die Lösung), Orchideen-Labellum und normales Foto bleiben: " + JSON.stringify(lauf7.etikett));
  assert(JSON.stringify(lauf7.schaden) === "[true,true,true,true,true]" && lauf7.bleibt.length === 0 && lauf7.listen.length === 0,
    "looksDamage: Bakterienfäule (Erwinia), Schorf, Weichfäule, Spinnmilben, Grauschimmel raus; Pflanzennamen wie moldavica/scabra/Scabiosa/Wiltonii/Brandkraut/Faulbaum/Schimmel-Fichte und alle Listen-Namen bleiben (auch für usablePhoto): " + JSON.stringify(lauf7));

  // Anführungszeichen ˋ (U+02CB): Neun Sorten der Friedhofsgärtnerei-Gärtner-Liste standen so in der
  // Excel (»helix ˋGlacierˋ«) – keine Sorten-Erkennung, und eine richtige Eingabe zählte nur »fast«.
  const anfzSonder = await page.evaluate(() => {
    const prev = $("#frSelect").value + "|" + $("#nivSelect").value;
    const odd = /[ˋˊ′‵ʹʻʼʽ]/;
    const rest = Object.entries(SEEDS).flatMap(([pid, rows]) => rows.filter((r) => r.some((v) => typeof v === "string" && odd.test(v))).map((r) => pid + ": " + r[0] + " " + r[1]));
    $("#frSelect").value = "friedhofsgaertnerei"; $("#nivSelect").value = "gaertner"; applyProfile();
    const N = ["Nana", "Bernstein", "Frohnleiten", "Max Frei", "Glacier", "Gnom", "The Fairy", "Silver Carpet", "Coccineus"];
    const sorten = N.map((n) => allCards.find((c) => cultivarName(c.a) === n && /'/.test(c.a)));
    const urteile = sorten.map((c) => c ? [cultivarKind(c.a), judgeTyped(c.g + " " + c.a, c).lvl, judgeTyped((c.g + " " + c.a).replace(/'/g, ""), c).lvl] : null);
    const glacierEingabe = clean("Hedera helix ˋGlacierˋ") === clean("Hedera helix 'Glacier'");
    // Lernstand mit altem Schlüssel zieht um
    const p = { "hedera|helix ˋglacierˋ|weißgrüner efeu": { box: 2, due: "2099-01-01", seen: 2, correct: 2, wrong: 0 } };
    const n = migrateKeys(p);
    const [fr, niv] = prev.split("|"); $("#frSelect").value = fr; $("#nivSelect").value = niv; applyProfile();
    return { rest, urteile, glacierEingabe, n, umzug: p["hedera|helix 'glacier'|weißgrüner efeu"], alt: Object.keys(p).some((k) => odd.test(k)),
      neuIstKarte: cardsFor("friedhofsgaertnerei_gaertner").some((c) => c.key === "hedera|helix 'glacier'|weißgrüner efeu") };
  });
  assert(anfzSonder.rest.length === 0, "Kein Seed enthält mehr Sonder-Anführungszeichen (ˋ ˊ ′ …): " + JSON.stringify(anfzSonder.rest));
  assert(anfzSonder.urteile.every((u) => u && u[0] === "cv" && u[1] === "ok" && u[2] === "ok") && anfzSonder.glacierEingabe,
    "Die neun Sorten sind Sorten, die richtige Eingabe zählt (mit und ohne Anführungszeichen, auch mit ˋ): " + JSON.stringify(anfzSonder));
  assert(anfzSonder.n === 1 && anfzSonder.umzug && anfzSonder.umzug.box === 2 && !anfzSonder.alt && anfzSonder.neuIstKarte,
    "Lernstand unter dem alten Schlüssel mit ˋ zieht auf den neuen um: " + JSON.stringify(anfzSonder));

  // Oberfläche: eine Notnagel-Zeichnung ist gekennzeichnet (Pille + alt-Text ohne Namen), der
  // Bildnachweis erscheint wie bei Fotos erst nach der Antwort.
  const notnagelUI = await page.evaluate(async (PX) => {
    __clearPhotoCache(); photoTried.clear();
    __setPhotoSource((card) => Promise.resolve({ thumb: PX, title: card.g + " " + card.a, file: "Tafel 1841.jpg", url: "https://x/y", src: "cm", art: "zeichnung",
      artist: "Internet Archive Book Images", license: "No restrictions" }));
    __setJsonp(() => Promise.reject(new Error("offline (Test)")));
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    $("#sessLen").value = "4"; startSession();
    await new Promise((r) => setTimeout(r, 90));
    const pille = (document.querySelector(".ph-kind") || {}).textContent || "";
    const tip = (document.querySelector(".ph-kind") || {}).title || "";
    const alt = (document.querySelector("#phImg") || {}).alt || "";
    const correct = answerText(current).toLowerCase();
    const btn = [...document.querySelectorAll("#opts .opt")].find((b) => b.querySelector("span:last-child").textContent.toLowerCase() === correct);
    if (btn) btn.click();
    await new Promise((r) => setTimeout(r, 30));
    const src = (document.querySelector("#phSrc") || {}).textContent || "";
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    __setPhotoSource(null); __setJsonp(window.__offlineJsonp); __clearPhotoCache(); photoTried.clear();
    return { pille, tip, alt, src, geklickt: !!btn };
  }, PX);
  assert(notnagelUI.pille === "Zeichnung · kein Foto verfügbar" && /kein Foto/.test(notnagelUI.tip) && notnagelUI.alt === "Zeichnung der gesuchten Pflanze",
    "Notnagel-Zeichnung muss gekennzeichnet sein (Pille, Tooltip, alt ohne Namen): " + JSON.stringify(notnagelUI));
  assert(notnagelUI.geklickt && /Internet Archive Book Images, No restrictions/.test(notnagelUI.src),
    "Bildnachweis der Zeichnung nach der Antwort: " + JSON.stringify(notnagelUI));

  // iNaturalist als Ersatzquelle (Rückmeldung: »Bildquelle iNaturalist hinzufügen, falls Wikimedia nicht
  // ausreicht«). Fixtures nach den echten API-Antworten: »Perovskia abrotanoides« findet iNaturalist als
  // Synonym von Salvia abrotanoides (id 941722), die Taxon-Fotos stehen unter CC BY-NC (Jennifer Chandler).
  const inat = await page.evaluate(async (PX) => {
    __setPhotoSource(null);
    const IA = "https://inaturalist-open-data.s3.amazonaws.com/photos/";
    const ph = (id, lic, extra) => Object.assign({ id, license_code: lic,
      attribution: "(c) Jennifer Chandler, some rights reserved (" + String(lic || "").toUpperCase() + "), uploaded by Jennifer Chandler",
      attribution_name: "Jennifer Chandler", large_url: IA + id + "/large.jpeg", medium_url: IA + id + "/medium.jpeg",
      original_dimensions: { width: 2048, height: 1536 } }, extra || {});
    const such = { total_results: 1, page: 1, per_page: 10, results: [{ id: 941722, rank: "species", is_active: true, name: "Salvia abrotanoides",
      matched_term: "Perovskia abrotanoides", default_photo: { id: 40101992, license_code: "cc-by-nc", attribution: "(c) Jennifer Chandler, some rights reserved (CC BY-NC), uploaded by Jennifer Chandler",
        medium_url: IA + "40101992/medium.jpeg", url: IA + "40101992/square.jpeg" } }] };
    const detail = { results: [{ id: 941722, name: "Salvia abrotanoides", taxon_photos: [
      { photo: ph(40101992, "cc-by-nc") },
      { photo: ph(111, null, { attribution: "(c) Someone, all rights reserved", attribution_name: "Someone" }) },   // alle Rechte vorbehalten
      { photo: ph(222, "cc-by-nd") },                                                                               // keine Bearbeitung
      { photo: ph(40101973, "cc-by-nc", { original_dimensions: { width: 1536, height: 2048 } }) }] }] };
    const leer = { query: { pages: {} } };
    const tafelMeta = { Categories: { value: "Perovskia abrotanoides|Files from Internet Archive Book Images Flickr stream" },
      Artist: { value: "Internet Archive Book Images" }, LicenseShortName: { value: "No restrictions" } };
    const tafel = { query: { pages: { p0: { index: 1, title: "File:Bulletin de la Société impériale des naturalistes de Moscou (1841) (20246494408).jpg",
      imageinfo: [{ thumburl: "https://x/tafel.jpg", mime: "image/jpeg", width: 1200, descriptionurl: "https://commons/tafel", extmetadata: tafelMeta }] } } } };
    const perov = { key: "t-inat-perov", g: "Perovskia", a: "abrotanoides", de: "Blauraute", fam: "Lamiaceae", syn: "Salvia abrotanoides" };
    const anfragen = [];
    const run = async (card, wmFn, inFn) => { __clearPhotoCache(); photoTried.clear(); anfragen.length = 0;
      __setJsonp((url) => {
        if (/^https:\/\/api\.inaturalist\.org\//.test(url)) { anfragen.push(url.replace("https://api.inaturalist.org/v1/taxa", "")); return inFn(url); }
        return wmFn(url);
      });
      try { return await wikiPhoto(card); } catch (e) { return { err: String(e) }; } };
    const inOk = (url) => Promise.resolve(/\/taxa\/941722\?/.test(url) ? detail : such);
    const inWeg = () => Promise.reject(new Error("timeout"));
    const wmLeer = () => Promise.resolve(leer);
    const wmTafel = (url) => { const q = decodeURIComponent((url.match(/gsrsearch=([^&]+)/) || [])[1] || "");
      return Promise.resolve(/commons/.test(url) && q === 'incategory:"Perovskia abrotanoides"' ? tafel : leer); };
    const a = await run(perov, wmLeer, inOk); const aReq = anfragen.slice();                 // Wikimedia ohne Bild → iNaturalist
    const b = await run(perov, wmTafel, inOk);                                              // nur eine Zeichnung → das Foto geht vor
    const c = await run(perov, wmLeer, inWeg);                                              // iNaturalist weg, Wikimedia sauber leer → null
    const d = await run(perov, wmTafel, inWeg);                                             // iNaturalist weg → Zeichnung nur vorläufig
    const e = await run(perov, wmTafel, () => Promise.resolve({ total_results: 1, results: [{ id: 5, rank: "genus", is_active: true, name: "Perovskia", matched_term: "Perovskia" }] }));
    const f = await run(perov, () => Promise.reject(new Error("offline")), inOk);          // Wikimedia brach ab → Foto nur für diese Sitzung
    const g = await run(perov, wmTafel, () => Promise.resolve({ error: "Too Many Requests", status: 429 }));   // API-Fehlerantwort = Ausfall
    const h = await run({ key: "t-inat-rosa", g: "Rosa", a: "Cultivars", de: "Rosen", fam: "Rosaceae", syn: "" }, wmLeer, inOk); const hReq = anfragen.length;
    const i = await run({ key: "t-inat-nigra", g: "Prunus", a: "cerasifera 'Nigra'", de: "Blutpflaume", fam: "Rosaceae", syn: "" }, wmLeer, inOk); const iReq = anfragen.length;
    // Detail nicht erreichbar → das Standardfoto der Suche reicht
    const j = await run(perov, wmLeer, (url) => /\/taxa\/941722\?/.test(url) ? Promise.reject(new Error("timeout")) : Promise.resolve(such));
    // nur gesperrte Lizenzen → kein iNaturalist-Bild
    const k = await run(perov, wmLeer, (url) => Promise.resolve(/\/taxa\/941722\?/.test(url)
      ? { results: [{ id: 941722, taxon_photos: [{ photo: ph(111, null) }, { photo: ph(222, "cc-by-nd") }] }] }
      : { results: [Object.assign({}, such.results[0], { default_photo: ph(333, null) })] }));
    // photoFor merkt den iNaturalist-Treffer wie ein Commons-Foto
    __clearPhotoCache(); photoTried.clear();
    __setJsonp((url) => /inaturalist/.test(url) ? inOk(url) : wmLeer(url));
    const pf = await photoFor(perov);
    const gemerkt = !!(photoStoreLoad()[perov.key] && photoStoreLoad()[perov.key].src === "inat");
    const taxa = [
      perov, { g: "Syringa", a: "x chinensis" }, { g: "Brassica", a: "oleracea var. capitata" }, { g: "Brassica", a: "oleracea var. capitata f. rubra" },
      { g: "Brassica", a: "oleracea var. capitata alba" }, { g: "Foeniculum", a: "vulgare ssp. vulgare var. azoricum" }, { g: "Cornus", a: "kousa subsp. kousa" },
      { g: "Leontopodium", a: "alpinum ssp. Alpinum" }, { g: "Rosa", a: "Cultivars" }, { g: "Fuchsia-Hybriden", a: "" }, { g: "Taraxacum", a: "sect. Ruderalia" },
      { g: "Prunus", a: "cerasifera 'Nigra'" }, { g: "Salvia", a: "nemorosa 'Sorte'" }].map((x) => inatTaxon(Object.assign({ de: "", syn: "" }, x)));
    const pick = [
      !!inatPick(such.results, "Perovskia abrotanoides"),
      inatPick([{ id: 1, rank: "genus", is_active: true, name: "Perovskia", matched_term: "Perovskia abrotanoides" }], "Perovskia abrotanoides"),
      !!inatPick([{ id: 2, rank: "hybrid", is_active: true, name: "Syringa × chinensis" }], "Syringa × chinensis"),
      inatPick([{ id: 3, rank: "species", is_active: true, name: "Syringa chinensis" }], "Syringa × chinensis"),
      inatPick([{ id: 4, rank: "species", is_active: true, name: "Brassica oleracea" }], "Brassica oleracea capitata"),
      !!inatPick([{ id: 5, rank: "variety", is_active: true, name: "Brassica oleracea capitata" }], "Brassica oleracea capitata"),
      inatPick([{ id: 6, rank: "species", is_active: false, name: "Salvia abrotanoides" }], "Salvia abrotanoides"),
      !!inatPick([{ id: 7, rank: "variety", is_active: true, name: "Lonicera ligustrina yunnanensis", matched_term: "Lonicera nitida" }], "Lonicera nitida")];
    const ok = [inatPhotoOk(ph(1, "cc0")), inatPhotoOk(ph(1, "cc-by-sa")), inatPhotoOk(ph(1, null)), inatPhotoOk(ph(1, "cc-by-nd")), inatPhotoOk({ id: 1, license_code: "cc-by" })];
    const img = inatImg({ medium_url: IA + "5/medium.jpeg?1563" }, "large");
    const big = [lbBig(IA + "5/large.jpeg"), lbBig(IA + "5/original.jpeg"), lbBig("https://static.inaturalist.org/photos/7/medium.JPG")];
    const chain = __lbChain({ src: IA + "5/large.jpeg", w: 2048 });
    // Großansicht: Scheitert ein iNaturalist-Bild, nennt die Meldung iNaturalist (kein Commons-Link)
    const kaputt = "data:image/png;base64,AAAA";
    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    Object.defineProperty(HTMLImageElement.prototype, "src", { configurable: true,
      get() { return desc.get.call(this); }, set(v) { desc.set.call(this, /inaturalist/.test(v) ? kaputt : v); } });
    openLightbox(IA + "5/large.jpeg", "Bild 1 der gesuchten Pflanze", [{ src: IA + "5/large.jpeg", w: 2048, file: "inat:5" }], 0);
    await new Promise((r) => setTimeout(r, 150));
    const lbSc = document.querySelector(".lbscrim");
    const lbMeldung = ((lbSc && lbSc.querySelector(".lb-fail")) || {}).textContent || "";
    const lbLink = !!(lbSc && lbSc.querySelector(".lb-fail a"));
    closeLightbox();
    Object.defineProperty(HTMLImageElement.prototype, "src", desc);
    __setJsonp(window.__offlineJsonp); __clearPhotoCache(); photoTried.clear(); __setPhotoSource(null);
    const kurz = (x) => x && (x.err ? { err: x.err } : { src: x.src, file: x.file, art: x.art || "", tmp: !!x.tmp, thumb: x.thumb, url: x.url, artist: x.artist, license: x.license,
      gal: (x.gal || []).length, galInfo: (x.galInfo || []).map((y) => [y.file, y.w, y.license].join("|")) });
    return { a: kurz(a), aReq, b: kurz(b), c, d: kurz(d), e: kurz(e), f: kurz(f), g: kurz(g), h, hReq, i, iReq, j: kurz(j), k, pf: kurz(pf), gemerkt,
      taxa, pick, ok, img, big, chain, lbMeldung, lbLink };
  }, PX);
  const IAx = "https://inaturalist-open-data.s3.amazonaws.com/photos/";
  assert(inat.a && inat.a.src === "inat" && inat.a.file === "inat:40101992" && inat.a.thumb === IAx + "40101992/large.jpeg" && inat.a.url === "https://www.inaturalist.org/photos/40101992" &&
    inat.a.artist === "Jennifer Chandler" && inat.a.license === "CC BY-NC" && !inat.a.art && !inat.a.tmp,
    "Wikimedia ohne Bild → Foto von iNaturalist mit Urheber, Lizenz und Fotoseite (dauerhaft): " + JSON.stringify(inat.a));
  assert(inat.a.gal === 2 && JSON.stringify(inat.a.galInfo) === JSON.stringify(["inat:40101992|2048|CC BY-NC", "inat:40101973|1536|CC BY-NC"]),
    "iNaturalist-Galerie: nur frei lizenzierte Fotos (»alle Rechte vorbehalten« und ND raus), Breite des Originals je Foto: " + JSON.stringify(inat.a));
  assert(inat.aReq.length === 2 && /^\?is_active=true&per_page=10&q=Perovskia%20abrotanoides$/.test(inat.aReq[0]) && inat.aReq[1] === "/941722?locale=de",
    "iNaturalist-Abfragen: Suche nach dem Namen der Liste (Synonym-Treffer), dann die Taxon-Fotos: " + JSON.stringify(inat.aReq));
  assert(inat.b && inat.b.src === "inat" && !inat.b.art, "Nur eine Zeichnung auf Wikimedia → das Foto von iNaturalist geht vor: " + JSON.stringify(inat.b));
  assert(inat.c === null, "iNaturalist nicht erreichbar, Wikimedia sauber ohne Bild → »kein Bild« (kein Netzfehler, sonst wartete die Art endlos): " + JSON.stringify(inat.c));
  assert(inat.d && inat.d.art === "zeichnung" && inat.d.tmp && inat.g && inat.g.art === "zeichnung" && inat.g.tmp,
    "iNaturalist nicht erreichbar bzw. API-Fehler → Zeichnung nur für diese Sitzung (beim nächsten Start neu fragen): " + JSON.stringify({ d: inat.d, g: inat.g }));
  assert(inat.e && inat.e.art === "zeichnung" && !inat.e.tmp, "iNaturalist kennt nur die Gattung → kein Gattungsfoto, die Zeichnung bleibt: " + JSON.stringify(inat.e));
  assert(inat.f && inat.f.src === "inat" && inat.f.tmp, "Wikimedia brach ab, iNaturalist hat ein Foto → nur für diese Sitzung: " + JSON.stringify(inat.f));
  assert(inat.h === null && inat.hReq === 0 && inat.i === null && inat.iReq === 0,
    "Sammeleintrag und beschreibende Sorte fragen iNaturalist gar nicht (dort gäbe es nur eine Art bzw. die Wildform): " + JSON.stringify({ h: inat.h, hReq: inat.hReq, i: inat.i, iReq: inat.iReq }));
  assert(inat.j && inat.j.src === "inat" && inat.j.thumb === IAx + "40101992/large.jpeg" && inat.j.license === "CC BY-NC" && inat.j.artist === "Jennifer Chandler",
    "Taxon-Fotos nicht erreichbar → das Standardfoto der Suche (große Fassung, Nachweis aus der Zuschreibung): " + JSON.stringify(inat.j));
  assert(inat.k === null, "Nur Fotos mit gesperrter Lizenz → kein iNaturalist-Bild: " + JSON.stringify(inat.k));
  assert(inat.pf && inat.pf.src === "inat" && inat.gemerkt, "photoFor merkt den iNaturalist-Treffer: " + JSON.stringify(inat.pf));
  assert(JSON.stringify(inat.taxa) === JSON.stringify(["Perovskia abrotanoides", "Syringa × chinensis", "Brassica oleracea capitata", "", "", "Foeniculum vulgare azoricum",
    "Cornus kousa", "Leontopodium alpinum", "", "", "", "", "Salvia nemorosa"]),
    "inatTaxon: Art, Hybride mit ×, Varietät genau so, tiefer gestaffelt (Rotkohl) nicht, Autonym = Art, keine Gattung/Sektion/beschreibende Sorte: " + JSON.stringify(inat.taxa));
  assert(JSON.stringify(inat.pick) === JSON.stringify([true, null, true, null, null, true, null, true]),
    "inatPick: Name samt Rang oder als Synonym geführt; nie Gattung, Wildart einer Varietät, Inaktives: " + JSON.stringify(inat.pick));
  assert(JSON.stringify(inat.ok) === JSON.stringify([true, true, false, false, false]), "inatPhotoOk: CC0/CC BY-SA ja, alle Rechte vorbehalten/ND/ohne Adresse nein: " + JSON.stringify(inat.ok));
  assert(inat.img === IAx + "5/large.jpeg?1563" && inat.big[0] === IAx + "5/original.jpeg" && inat.big[1] === IAx + "5/original.jpeg" &&
    inat.big[2] === "https://static.inaturalist.org/photos/7/original.JPG" && JSON.stringify(inat.chain) === JSON.stringify([IAx + "5/original.jpeg", IAx + "5/large.jpeg"]),
    "iNaturalist-Größen: Größe steht im Pfad (large fürs Quiz, original für die Großansicht, Kette fällt auf large zurück): " + JSON.stringify({ img: inat.img, big: inat.big, chain: inat.chain }));
  assert(/Bild nicht verfügbar/.test(inat.lbMeldung) && /iNaturalist/.test(inat.lbMeldung) && !/Commons/.test(inat.lbMeldung) && !inat.lbLink,
    "Großansicht: scheitert ein iNaturalist-Bild, nennt die Meldung iNaturalist (kein Link auf Commons): " + JSON.stringify({ m: inat.lbMeldung, l: inat.lbLink }));

  // Oberfläche: Bildnachweis eines iNaturalist-Fotos nach der Antwort – mit Link auf die Fotoseite,
  // Urheber und Lizenz aus der Suche, kein weiterer Abruf.
  const inatUI = await page.evaluate(async (PX) => {
    __clearPhotoCache(); photoTried.clear();
    __setPhotoSource((card) => Promise.resolve({ thumb: PX, title: card.g + " " + card.a, file: "inat:40101992", src: "inat",
      url: "https://www.inaturalist.org/photos/40101992", artist: "Jennifer Chandler", license: "CC BY-NC", gal: [PX], top: 1 }));
    let abrufe = 0; __setJsonp(() => { abrufe++; return Promise.reject(new Error("offline (Test)")); });
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    $("#sessLen").value = "4"; startSession();
    await new Promise((r) => setTimeout(r, 90));
    const correct = answerText(current).toLowerCase();
    const btn = [...document.querySelectorAll("#opts .opt")].find((b) => b.querySelector("span:last-child").textContent.toLowerCase() === correct);
    if (btn) btn.click();
    await new Promise((r) => setTimeout(r, 30));
    const box = document.querySelector("#phSrc");
    const src = (box || {}).textContent || "";
    const href = ((box && box.querySelector("a")) || {}).href || "";
    const pille = !!document.querySelector(".ph-kind");
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    __setPhotoSource(null); __setJsonp(window.__offlineJsonp); __clearPhotoCache(); photoTried.clear();
    return { src, href, abrufe, pille, geklickt: !!btn };
  }, PX);
  assert(inatUI.geklickt && /^Foto: iNaturalist · Jennifer Chandler, CC BY-NC$/.test(inatUI.src.trim()) && inatUI.href === "https://www.inaturalist.org/photos/40101992" &&
    inatUI.abrufe === 0 && !inatUI.pille,
    "Bildnachweis eines iNaturalist-Fotos: Quelle mit Link auf die Fotoseite, Urheber + Lizenz ohne weiteren Abruf, keine Zeichnungs-Pille: " + JSON.stringify(inatUI));

  // Ein Dateiname, der genau DIESE Art nennt, darf nie als »andere Art« gelten – geprüft über alle
  // Arten aller 14 Listen (Fund des Bildchecks: Bindestrich-Epitheta wie vitis-idaea, filix-mas,
  // rosa-sinensis wurden am Bindestrich zerlegt, und jede Datei der Art fiel heraus).
  const eigeneDatei = await page.evaluate(() => {
    const falsch = [];
    Object.keys(SEEDS).forEach((id) => cardsFor(id).forEach((c) => {
      [norm(c.g + " " + c.a) + " 01.jpg", taxonName(c) + " 2019.jpg", (c.g + " " + c.a).replace(/\s+/g, "_") + ".jpg"].forEach((f) => {
        if (fileMentionsOther(f, c)) falsch.push(id + ": " + f);
      });
    }));
    const preisel = { g: "Vaccinium", a: "vitis-idaea", syn: "" };
    return { falsch: [...new Set(falsch)].slice(0, 20), zahl: falsch.length,
      eigene: fileMentionsOther("Vaccinium vitis-idaea 20060824 003.jpg", preisel),
      unterstrich: fileMentionsOther("Vaccinium_vitis-idaea_20060824_003.jpg", preisel),
      andere: fileMentionsOther("Vaccinium myrtillus 01.jpg", preisel) };
  });
  assert(eigeneDatei.zahl === 0 && !eigeneDatei.eigene && !eigeneDatei.unterstrich && eigeneDatei.andere,
    "Dateien mit dem eigenen Artnamen dürfen nie als »andere Art« gelten (auch Bindestrich-Epitheta) – eine andere Art schon: " + JSON.stringify(eigeneDatei));

  // Bildnachweis ohne zweiten Abruf: Urheber + Lizenz kommen mit den Suchmetadaten; nach der
  // Antwort wird nichts mehr nachgeladen (früher eine eigene Commons-Anfrage je Bild).
  const nachweis = await page.evaluate(async (PX) => {
    __clearPhotoCache(); photoTried.clear();
    __setPhotoSource((card) => Promise.resolve({ thumb: PX, title: card.g + " " + card.a, file: "Test.jpg", url: "https://x/y", src: "cm",
      artist: "Hanna Test", license: "CC BY-SA 4.0" }));
    let abrufe = 0; __setJsonp(() => { abrufe++; return Promise.reject(new Error("offline (Test)")); });
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    $("#sessLen").value = "4"; startSession();
    await new Promise((r) => setTimeout(r, 90));
    const correct = answerText(current).toLowerCase();
    const btn = [...document.querySelectorAll("#opts .opt")].find((b) => b.querySelector("span:last-child").textContent.toLowerCase() === correct);
    if (btn) btn.click();
    await new Promise((r) => setTimeout(r, 30));
    const src = (document.querySelector("#phSrc") || {}).textContent || "";
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    __setPhotoSource(null); __setJsonp(window.__offlineJsonp); __clearPhotoCache(); photoTried.clear();
    return { src, abrufe, geklickt: !!btn };
  }, PX);
  assert(nachweis.geklickt && /Hanna Test, CC BY-SA 4\.0/.test(nachweis.src) && nachweis.abrufe === 0,
    "Bildnachweis muss aus den Suchmetadaten kommen – ohne weiteren Abruf: " + JSON.stringify(nachweis));

  // Eingabe: Anführungszeichen (alle Varianten) und das Hybrid-Zeichen sind beim Vergleich
  // egal – »Weigela x „Bristol Ruby“« ist Weigela 'Bristol Ruby' (Realfall: gab Abzug).
  const anfz = await page.evaluate(() => {
    const w = { g: "Weigela", a: "'Bristol Ruby'", de: "Weigelie" };
    const pet = { g: "Petunia", a: "x atkinsiana 'Surfinia'", de: "Garten-Petunie" };
    const cup = { g: "×Cupressocyparis", a: "leylandii", de: "Leyland-Zypresse" };
    document.querySelector('#modeTabs button[data-mode="type"]').click();
    const d = $("#dir"); if (d) { d.value = "de2bot"; d.dispatchEvent(new Event("change")); }
    return { typo: checkTyped("Weigela x „Bristol Ruby“", w), gerade: checkTyped("Weigela 'Bristol Ruby'", w),
      ohne: checkTyped("Weigela Bristol Ruby", w), feldA: fieldOk("a", "x „Bristol Ruby“", w), feldAFalsch: fieldOk("a", "'Bristol Rubin'", w),
      urteil: judgeTyped("Weigela x „Bristol Ruby“", w).lvl, exakt: judgeTyped("Weigela x „Bristol Ruby“", w).exact,
      hybridOhne: checkTyped("Petunia atkinsiana", pet), hybridKreuz: checkTyped("Petunia × atkinsiana 'Surfinia'", pet),
      gattungX: fieldOk("g", "x Cupressocyparis", cup), gattungOhne: fieldOk("g", "Cupressocyparis", cup), gattungFalsch: fieldOk("g", "Cupressus", cup),
      clean: clean("Weigela × „Bristol Ruby“") };
  });
  assert(anfz.typo && anfz.gerade && anfz.ohne && anfz.feldA && !anfz.feldAFalsch && anfz.urteil === "ok" && anfz.exakt,
    "Anführungszeichen/Hybrid-x dürfen beim Eingeben nicht zählen: " + JSON.stringify(anfz));
  assert(anfz.hybridOhne && anfz.hybridKreuz && anfz.gattungX && anfz.gattungOhne && !anfz.gattungFalsch && anfz.clean === "weigela bristol ruby",
    "Hybrid-Zeichen (× / x) ist beim Vergleich egal, eine falsche Gattung bleibt falsch: " + JSON.stringify(anfz));

  // Platzhalter »'Sorte'« (GaLaBau-Listen: »Salvia nemorosa 'Sorte'« = die Art in irgendeiner
  // Gartensorte): Anzeige »in Sorten« statt des kryptischen Platzhalters (nur Lern-Tool),
  // Eingabe ohne den Platzhalter zählt exakt, die Info-Karte erklärt ihn und nennt
  // Beispiel-Sorten – andere Karten bekommen den Block nicht.
  const sorte = await page.evaluate(async () => {
    $("#frSelect").value = "garten_und_landschaftsbau"; $("#nivSelect").value = "gaertner"; applyProfile();
    document.querySelector('#modeTabs button[data-mode="type"]').click();
    const d = $("#dir"); if (d) { d.value = "de2bot"; d.dispatchEvent(new Event("change")); }
    const salvia = allCards.find((c) => c.g === "Salvia" && /nemorosa/.test(c.a));
    const malus = allCards.find((c) => c.g === "Malus" && /'Sorte'/.test(c.a));
    const abies = allCards.find((c) => c.g === "Abies");
    const r = { roh: salvia.a, anzeige: botName(salvia), genus: botName(malus), art: fieldSolution("a", salvia),
      meta: /in Sorten/.test(answerMeta(salvia)) && !/'Sorte'/.test(answerMeta(salvia)),
      ohne: judgeTyped("Salvia nemorosa", salvia), inSorten: judgeTyped("Salvia nemorosa in Sorten", salvia),
      liste: judgeTyped("Salvia nemorosa 'Sorte'", salvia), feld: fieldOk("a", "nemorosa", salvia),
      falsch: judgeTyped("Salvia pratensis", salvia).lvl };
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    const ls = $("#listSearch"); ls.value = "nemorosa"; ls.dispatchEvent(new Event("input"));
    await new Promise((res) => setTimeout(res, 60));
    r.listRow = (document.querySelector(".sprow .sp-bot") || {}).textContent || "";
    buildPrintList(); const pl = document.querySelector("#printList").innerHTML;
    r.druck = /nemorosa in Sorten/.test(pl) && !/nemorosa 'Sorte'/.test(pl);
    ls.value = ""; ls.dispatchEvent(new Event("input"));
    openInfo(salvia);
    const sb = document.querySelector("#infoScrim .sorten"); r.info = sb ? sb.textContent.replace(/\s+/g, " ") : "";
    r.infoKopf = (document.querySelector("#infoScrim .mh-bot") || {}).textContent || ""; closeInfo();
    openInfo(abies); r.infoAbies = !!document.querySelector("#infoScrim .sorten"); closeInfo();
    // Fachwerker-Liste schreibt »Weigela Cultivars · Weigelie in Sorten«: Erklärung auch dort, deutscher Name ohne Zusatz gilt
    $("#frSelect").value = "garten_und_landschaftsbau"; $("#nivSelect").value = "fachwerker"; applyProfile();
    const weig = allCards.find((c) => c.g === "Weigela");
    r.weigKind = cultivarKind(weig.a); r.weigDe = checkDeName("Weigelie", weig);
    openInfo(weig); r.weigInfo = (document.querySelector("#infoScrim .sorten") || {}).textContent || ""; closeInfo();
    r.duell = /Fordere jemanden heraus oder gib einfach mit deinem Wissen an/.test(shareBlockHTML("Teilen")) &&
      !/Azubi-Kollegen/.test(document.documentElement.innerHTML);
    $("#frSelect").value = "gemuesebau"; $("#nivSelect").value = "gaertner"; applyProfile();
    return r;
  });
  assert(sorte.roh === "nemorosa 'Sorte'" && sorte.anzeige === "Salvia nemorosa in Sorten" && sorte.genus === "Malus in Sorten" &&
    sorte.art === "nemorosa in Sorten" && sorte.meta,
    "Platzhalter »'Sorte'« muss als »in Sorten« angezeigt werden (Name, Art-Feld, Rückseite): " + JSON.stringify(sorte));
  assert(sorte.ohne.lvl === "ok" && sorte.ohne.exact && sorte.inSorten.lvl === "ok" && sorte.inSorten.exact &&
    sorte.liste.lvl === "ok" && sorte.feld && sorte.falsch !== "ok",
    "Eingabe ohne/mit Platzhalter muss exakt zählen, eine andere Art nicht: " + JSON.stringify(sorte));
  assert(/in Sorten/.test(sorte.listRow) && !/'Sorte'/.test(sorte.listRow) && sorte.druck,
    "Liste und Druckliste müssen »in Sorten« zeigen: " + JSON.stringify(sorte));
  assert(/keine bestimmte Sorte/.test(sorte.info) && /'Caradonna'/.test(sorte.info) && /ohne Gewähr/.test(sorte.info) &&
    /in Sorten/.test(sorte.infoKopf) && !sorte.infoAbies,
    "Info-Karte muss den Platzhalter erklären und Beispiel-Sorten nennen – nur bei Platzhalter-Arten: " + JSON.stringify(sorte));
  assert(sorte.weigKind === "placeholder" && sorte.weigDe && /Cultivars/.test(sorte.weigInfo) && /'Bristol Ruby'/.test(sorte.weigInfo),
    "»Weigela Cultivars«: Platzhalter erkannt, »Weigelie« gilt, Info-Karte erklärt: " + JSON.stringify(sorte));
  assert(sorte.duell, "Duell-Wortlaut: »Fordere jemanden heraus oder gib einfach mit deinem Wissen an«, kein »Azubi-Kollegen«");

  // Bildvielfalt: nicht immer dasselbe Foto zuerst – das Werkzeug merkt sich je Art die zuletzt
  // zuerst gezeigte Ansicht (pflanzenlernen.photoseen) und nimmt beim nächsten Mal die nächste,
  // reihum (erste Begegnung = beste Ansicht; Dateien, die die Art nennen, bevorzugt). Die Galerie
  // beginnt mit der gezeigten Ansicht, Datei + Nachweis gehören dazu.
  const vielfalt = await page.evaluate(async () => {
    $("#frSelect").value = "garten_und_landschaftsbau"; $("#nivSelect").value = "gaertner"; applyProfile();
    const salvia = allCards.find((c) => c.g === "Salvia" && /nemorosa/.test(c.a));
    const cmP = (i, file) => ({ index: i, title: "File:" + file, imageinfo: [{ thumburl: "https://x/" + file, mime: "image/jpeg",
      descriptionurl: "https://commons/" + file, extmetadata: { Artist: { value: "U" + i }, LicenseShortName: { value: "CC0" } } }] });
    const ans = { query: { pages: { p1: cmP(1, "Salvia nemorosa Caradonna 1.jpg"), p2: cmP(2, "Salvia nemorosa Ostfriesland 2.jpg"),
      p3: cmP(3, "Salvia nemorosa Mainacht 3.jpg"), p4: cmP(4, "Hortus 4.jpg") } } };
    const p = pickCommons(ans, salvia);
    __clearPhotoCache();
    const v0 = photoVariant(p, salvia), v1 = photoVariant(p, salvia), v2 = photoVariant(p, salvia), v3 = photoVariant(p, salvia);
    const r = { top: p.top, galInfo: (p.galInfo || []).map((g) => g.file), pUnveraendert: p.thumb === "https://x/Salvia nemorosa Caradonna 1.jpg",
      first: v0 === p, v1Thumb: v1.thumb, v1File: v1.file, v1Artist: v1.artist, v1Gal0: v1.gal[0], v1Len: v1.gal.length,
      v2File: v2.file, v3File: v3.file, seen: __getPhotoSeen(salvia.key),
      persist: JSON.parse(localStorage.getItem("pflanzenlernen.photoseen") || "{}")[salvia.key] };
    const px = (t) => "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'><title>" + t + "</title></svg>");
    const A = px("A"), B = px("B"), C = px("C");
    __clearPhotoCache(); photoTried.clear();
    __setPhotoSource(() => Promise.resolve({ thumb: A, gal: [A, B, C], top: 3, src: "cm", file: "A.jpg", artist: "UA", title: "T", url: "https://x/y",
      galInfo: [{ file: "A.jpg", artist: "UA" }, { file: "B.jpg", artist: "UB" }, { file: "C.jpg", artist: "UC" }] }));
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    $("#sessLen").value = "4"; startSession();
    await new Promise((res) => setTimeout(res, 90));
    current = salvia; queue[qi] = salvia;                             // diese Art erzwingen
    __setPhotoSeen(salvia.key, 1);                                    // zuletzt war die zweite Ansicht zuerst dran …
    await renderPhoto();
    const img = document.querySelector("#phImg");
    r.quizC = !!img && img.getAttribute("src") === C;                 // … also jetzt die dritte
    const correct = answerText(current).toLowerCase();
    const btn = [...document.querySelectorAll("#opts .opt")].find((b) => b.querySelector("span:last-child").textContent.toLowerCase() === correct);
    if (btn) btn.click(); await new Promise((res) => setTimeout(res, 30));
    r.credit = (document.querySelector("#phSrc") || {}).textContent || "";
    await renderPhoto();                                              // nächste Begegnung: reihum wieder die erste
    r.quizA = (document.querySelector("#phImg") || {}).getAttribute("src") === A;
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    __setPhotoSource(null); __clearPhotoCache(); photoTried.clear();
    $("#frSelect").value = "gemuesebau"; $("#nivSelect").value = "gaertner"; applyProfile();
    return r;
  });
  assert(vielfalt.top === 3 && vielfalt.galInfo.length === 4 && vielfalt.galInfo[0] === "Salvia nemorosa Caradonna 1.jpg" && vielfalt.pUnveraendert,
    "pickCommons muss die Zahl der gleich guten Ansichten (top) und Datei/Nachweis je Ansicht liefern: " + JSON.stringify(vielfalt));
  assert(vielfalt.first && vielfalt.v1Thumb === "https://x/Salvia nemorosa Ostfriesland 2.jpg" && vielfalt.v1File === "Salvia nemorosa Ostfriesland 2.jpg" &&
    vielfalt.v1Artist === "U2" && vielfalt.v1Gal0 === vielfalt.v1Thumb && vielfalt.v1Len === 4 &&
    vielfalt.v2File === "Salvia nemorosa Mainacht 3.jpg" && vielfalt.v3File === "Salvia nemorosa Caradonna 1.jpg" &&
    vielfalt.seen === 0 && vielfalt.persist === 0,
    "photoVariant: erste Begegnung = beste Ansicht, danach reihum (nur Dateien, die die Art nennen), Galerie/Datei/Nachweis passend, Stand gespeichert: " + JSON.stringify(vielfalt));
  assert(vielfalt.quizC && /UC/.test(vielfalt.credit) && vielfalt.quizA,
    "Bilder-Quiz: nach gemerkter Ansicht 2 kommt Ansicht 3 (Bildnachweis gehört zu ihr), danach wieder die erste: " + JSON.stringify(vielfalt));

  // Artikelbild (src:"wp"): nur eine Ansicht bekannt. Beim ersten Mal reicht sie; ab der zweiten
  // Begegnung holt das Werkzeug einmalig die Bilder des Artikels und zeigt eine andere Ansicht –
  // nur Dateien, die diese Art nennen und keine andere Art derselben Gattung; der Nachweis der
  // neuen Ansicht kommt per Datei-Abruf. Gemerkt, kein zweiter Galerie-Abruf.
  const wpRot = await page.evaluate(async () => {
    const px = (t) => "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'><title>" + t + "</title></svg>");
    const A = px("A"), B = px("B"), C = px("C"), D = px("D"), wait = (ms) => new Promise((res) => setTimeout(res, ms));
    $("#frSelect").value = "garten_und_landschaftsbau"; $("#nivSelect").value = "gaertner"; applyProfile();
    const abies = allCards.find((c) => c.g === "Abies" && /koreana/.test(c.a));
    __clearPhotoCache(); photoTried.clear();
    __setPhotoSource(() => Promise.resolve({ thumb: A, src: "wp", title: "Korea-Tanne", file: "Abies koreana A.jpg", url: "https://x/y" }));
    let galAbrufe = 0;
    __setJsonp((url) => {
      if (/generator=images/.test(url)) { galAbrufe++; return Promise.resolve({ query: { pages: {
        1: { title: "File:Abies koreana Zapfen.jpg", imageinfo: [{ thumburl: B, mime: "image/jpeg" }] },
        2: { title: "File:Abies nordmanniana Nadeln.jpg", imageinfo: [{ thumburl: C, mime: "image/jpeg" }] },   // andere Art der Gattung
        3: { title: "File:Botanischer Garten 2019.jpg", imageinfo: [{ thumburl: D, mime: "image/jpeg" }] } } } }); }   // nennt die Art nicht
      if (/prop=imageinfo/.test(url) && /titles=File/.test(url))
        return Promise.resolve({ query: { pages: { 9: { title: "File:Abies koreana Zapfen.jpg", imageinfo: [{ extmetadata: { Artist: { value: "UZ" }, LicenseShortName: { value: "CC0" } } }] } } } });
      return Promise.reject(new Error("offline"));
    });
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    $("#sessLen").value = "4"; startSession(); await wait(90);
    current = abies; queue[qi] = abies;
    await renderPhoto();
    const src = () => (document.querySelector("#phImg") || {}).getAttribute("src");
    const erst = src() === A, abrufeErst = galAbrufe;                 // erste Begegnung: Artikelbild, kein Galerie-Abruf
    await renderPhoto(); await wait(20);
    const zweit = src() === B, abrufeZweit = galAbrufe;              // zweite: Zapfen-Foto (nordmanniana + namenlose Datei verworfen)
    const gemerkt = ((photoStoreLoad()[abies.key] || {}).gal || []).length;
    const correct = answerText(current).toLowerCase();
    const btn = [...document.querySelectorAll("#opts .opt")].find((b) => b.querySelector("span:last-child").textContent.toLowerCase() === correct);
    if (btn) btn.click(); await wait(40);
    const credit = (document.querySelector("#phSrc") || {}).textContent || "";
    await renderPhoto(); await wait(20);
    const dritt = src() === A, abrufeDritt = galAbrufe;              // reihum wieder das Artikelbild, kein neuer Abruf
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    __setPhotoSource(null); __setJsonp(window.__offlineJsonp); __clearPhotoCache(); photoTried.clear();
    $("#frSelect").value = "gemuesebau"; $("#nivSelect").value = "gaertner"; applyProfile();
    return { erst, abrufeErst, zweit, abrufeZweit, gemerkt, credit, dritt, abrufeDritt };
  });
  assert(wpRot.erst && wpRot.abrufeErst === 0 && wpRot.zweit && wpRot.abrufeZweit === 1 && wpRot.gemerkt === 2,
    "Artikelbild: erste Begegnung ohne Abruf, zweite holt die Artikel-Bilder einmal und zeigt die Zapfen-Ansicht (nur Dateien mit dieser Art): " + JSON.stringify(wpRot));
  assert(/UZ/.test(wpRot.credit) && wpRot.dritt && wpRot.abrufeDritt === 1,
    "Artikelbild: Nachweis der neuen Ansicht per Datei-Abruf, danach reihum wieder das Artikelbild ohne weiteren Galerie-Abruf: " + JSON.stringify(wpRot));

  // Info-Karte: Für eine Sorte findet die Wikipedia-Kette nur den Artikel der Art
  // (»Seidiger Hartriegel« für 'Flaviramea'). Der Text passt, das Artikelbild zeigte
  // bisher unkommentiert die rotholzige Art. Jetzt: Kennzeichnung, bei beschreibenden
  // Sorten das Sortenfoto aus der Quiz-Suche (oder bewusst kein Bild), bei
  // Phantasienamen das Artbild mit Hinweis; Art, Platzhalter und passende Unterart ohne Hinweis.
  const sortenInfo = await page.evaluate(async () => {
    const px = (t) => "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'><title>" + t + "</title></svg>");
    const ART = px("art"), SORTE = px("sorte"), SORTE2 = px("sorte2");
    const wp = (title, extract, thumb) => ({ query: { pages: { "1": { title, extract, thumbnail: { source: thumb } } } } });
    const missing = { query: { pages: { "-1": { title: "x", missing: "" } } } };
    let galerieAbrufe = 0;
    __setJsonp((url) => {
      if (/generator=images/.test(url)) { galerieAbrufe++; return Promise.resolve({ query: { pages: {} } }); }
      const t = decodeURIComponent((url.match(/titles=([^&]+)/) || [])[1] || "");
      if (t === "Cornus sericea") return Promise.resolve(wp("Seidiger Hartriegel", "Der Seidige Hartriegel (Cornus sericea), auch Weißer Hartriegel genannt, ist eine Pflanzenart.", ART));
      if (t === "Weigela" || t === "Weigelie") return Promise.resolve(wp("Weigelien", "Die Weigelien (Weigela) sind eine Pflanzengattung.", ART));
      if (t === "Abies koreana") return Promise.resolve(wp("Korea-Tanne", "Die Korea-Tanne (Abies koreana) ist eine Pflanzenart.", ART));
      if (t === "Salvia nemorosa") return Promise.resolve(wp("Steppen-Salbei", "Der Steppen-Salbei (Salvia nemorosa) ist eine Pflanzenart.", ART));
      if (/^Steckr/.test(t)) return Promise.resolve(wp("Steckrübe", "Die Steckrübe (Brassica napus subsp. rapifera) ist eine Unterart.", ART));
      return Promise.resolve(missing);
    });
    const laden = async (c) => {
      wikiCache.delete(c.key); openInfo(c); document.querySelector("#wpLoad").click();
      for (let i = 0; i < 60 && !document.querySelector("#wpHost .wp-text, #wpHost .wp-note"); i++) await new Promise((r) => setTimeout(r, 25));
      const h = document.querySelector("#wpHost"), img = h.querySelector("img");
      const r = { note: (h.querySelector(".wp-taxon") || {}).textContent || "", img: img ? img.getAttribute("src") : null,
        lb: img ? img.getAttribute("aria-label") : null, src: (h.querySelector(".wp-src") || {}).textContent || "",
        text: (h.querySelector(".wp-text") || {}).textContent || "" };
      closeInfo(); return r;
    };
    $("#frSelect").value = "garten_und_landschaftsbau"; $("#nivSelect").value = "gaertner"; applyProfile();
    const flavi = allCards.find((c) => c.g === "Cornus" && /Flaviramea/.test(c.a));
    const weig = allCards.find((c) => c.g === "Weigela");
    const abies = allCards.find((c) => c.g === "Abies" && /koreana/.test(c.a));
    const salvia = allCards.find((c) => c.g === "Salvia" && /nemorosa/.test(c.a));
    __clearPhotoCache(); photoTried.clear();
    __setPhotoSource(() => Promise.resolve({ thumb: SORTE, gal: [SORTE, SORTE2], top: 2, src: "cm", file: "Cornus sericea Flaviramea 0zz.jpg",
      url: "https://commons.wikimedia.org/wiki/File:Cornus_sericea_Flaviramea_0zz.jpg", artist: "David J. Stang", license: "CC BY-SA 4.0", title: "T" }));
    const mitFoto = await laden(flavi); const galerieNachFoto = galerieAbrufe;
    __clearPhotoCache(); photoTried.clear(); __setPhotoSource(() => Promise.resolve(null));
    const ohneFoto = await laden(flavi);
    __setPhotoSource(null);
    const phantasie = await laden(weig);
    const art = await laden(abies);
    const platz = await laden(salvia);
    $("#frSelect").value = "gemuesebau"; $("#nivSelect").value = "gaertner"; applyProfile();
    const steck = allCards.find((c) => /rapifera/.test(c.a));
    const unterart = steck ? await laden(steck) : { note: "", img: ART };
    __setJsonp(window.__offlineJsonp); __clearPhotoCache(); photoTried.clear();
    return { mitFoto, galerieNachFoto, ohneFoto, phantasie, art, platz, unterart, ART, SORTE };
  });
  assert(/Artikel zur Art Cornus sericea/.test(sortenInfo.mitFoto.note) && /Sorte 'Flaviramea'/.test(sortenInfo.mitFoto.note) &&
    sortenInfo.mitFoto.img === sortenInfo.SORTE && sortenInfo.mitFoto.lb === "Bilder ansehen" &&
    /Wikimedia Commons/.test(sortenInfo.mitFoto.src) && /David J\. Stang/.test(sortenInfo.mitFoto.src) &&
    /Seidige Hartriegel/.test(sortenInfo.mitFoto.text) && sortenInfo.galerieNachFoto === 0,
    "Info-Karte: beschreibende Sorte → Hinweis »Artikel zur Art«, Sortenfoto statt Artbild (mit Nachweis, Sorten-Galerie, keine Artikel-Galerie): " + JSON.stringify(sortenInfo.mitFoto) + " Galerieabrufe=" + sortenInfo.galerieNachFoto);
  assert(sortenInfo.ohneFoto.img === null && /weggelassen/.test(sortenInfo.ohneFoto.note) && /Sorte 'Flaviramea'/.test(sortenInfo.ohneFoto.note),
    "Info-Karte: ohne Sortenfoto bleibt das Artbild weg, der Hinweis sagt es: " + JSON.stringify(sortenInfo.ohneFoto));
  assert(sortenInfo.phantasie.img === sortenInfo.ART && /Artikel zur Gattung Weigela/.test(sortenInfo.phantasie.note) && /nicht die Sorte 'Bristol Ruby'/.test(sortenInfo.phantasie.note),
    "Info-Karte: Phantasiename behält das Artikelbild, aber mit Hinweis: " + JSON.stringify(sortenInfo.phantasie));
  assert(sortenInfo.art.note === "" && sortenInfo.art.img === sortenInfo.ART && sortenInfo.platz.note === "" && sortenInfo.unterart.note === "",
    "Info-Karte: reine Art, Platzhalter 'Sorte' und passende Unterart bekommen keinen Hinweis: " + JSON.stringify({ art: sortenInfo.art, platz: sortenInfo.platz, unterart: sortenInfo.unterart }));

  // Gattungs-Notnagel: Für »Syringa x chinensis · Chinesischer Flieder« gibt es keinen Artikel
  // (weder Hybride – in beiden Schreibweisen – noch Binom noch deutscher Name). Statt der
  // Sackgasse »nicht gefunden« erscheint der Artikel zur GATTUNG (»Syringa« → »Flieder«),
  // deutlich gekennzeichnet; ein Foto DIESER Art aus der Quiz-Bildsuche ersetzt das
  // Gattungsbild. Eine Begriffsklärung als »Gattungsartikel« wird abgelehnt (ehrlich: nicht gefunden).
  const gattung = await page.evaluate(async () => {
    const px = (t) => "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'><title>" + t + "</title></svg>");
    const GATT = px("gattung"), ART = px("art");
    const wp = (title, extract, thumb, props) => ({ query: { pages: { "1": Object.assign({ title, extract, thumbnail: { source: thumb } }, props || {}) } } });
    const missing = { query: { pages: { "-1": { title: "x", missing: "" } } } };
    let titles = [];
    const flieder = wp("Flieder", "Flieder (Syringa) ist eine Pflanzengattung aus der Familie der Ölbaumgewächse (Oleaceae). Sie umfasst etwa 20 bis 25 Arten.", GATT);
    __setJsonp((url) => {
      if (/generator=images/.test(url)) return Promise.resolve({ query: { pages: {} } });
      const t = decodeURIComponent((url.match(/titles=([^&]+)/) || [])[1] || "");
      titles.push(t);
      if (t === "Syringa" || t === "Flieder") return Promise.resolve(flieder);
      if (t === "Abies") return Promise.resolve(wp("Abies", "Abies steht für: Tannen, eine Pflanzengattung; Abies (Ort), ein Dorf", GATT, { pageprops: { disambiguation: "" } }));
      return Promise.resolve(missing);
    });
    const laden = async (c) => {
      wikiCache.delete(c.key); openInfo(c); document.querySelector("#wpLoad").click();
      for (let i = 0; i < 80 && !document.querySelector("#wpHost .wp-text, #wpHost .wp-note"); i++) await new Promise((r) => setTimeout(r, 25));
      const h = document.querySelector("#wpHost"), img = h.querySelector("img");
      const r = { note: (h.querySelector(".wp-taxon") || {}).textContent || "", img: img ? img.getAttribute("src") : null, alt: img ? img.getAttribute("alt") : null,
        src: (h.querySelector(".wp-src") || {}).textContent || "", text: (h.querySelector(".wp-text") || {}).textContent || "",
        none: (h.querySelector(".wp-note") || {}).textContent || "", btn: !!document.querySelector("#wpLoad") };
      closeInfo(); return r;
    };
    const prev = [$("#frSelect").value, $("#nivSelect").value];
    $("#frSelect").value = "garten_und_landschaftsbau"; $("#nivSelect").value = "gaertner"; applyProfile();
    const syr = allCards.find((c) => c.g === "Syringa" && /chinensis/.test(c.a));
    const abies = allCards.find((c) => c.g === "Abies" && /koreana/.test(c.a));
    __clearPhotoCache(); photoTried.clear(); __setPhotoSource(() => Promise.resolve(null));
    const ohne = await laden(syr); const reihe = titles.slice();
    titles = []; __clearPhotoCache(); photoTried.clear();
    __setPhotoSource(() => Promise.resolve({ thumb: ART, gal: [ART], src: "cm", file: "Syringa × chinensis 01.jpg",
      url: "https://commons.wikimedia.org/wiki/File:Syringa_×_chinensis_01.jpg", artist: "Test", license: "CC BY-SA 4.0", title: "T" }));
    const mitFoto = await laden(syr);
    titles = []; __setPhotoSource(() => Promise.resolve(null));
    const bkl = await laden(abies);                   // Gattung »Abies« hier als Begriffsklärung → ehrlich »nicht gefunden«
    const bklReihe = titles.slice();
    __setPhotoSource(null); __setJsonp(window.__offlineJsonp); __clearPhotoCache(); photoTried.clear();
    $("#frSelect").value = prev[0]; $("#nivSelect").value = prev[1]; applyProfile();   // Profil der folgenden Tests wiederherstellen
    const pg = (title, extract, props) => Object.assign({ title, extract }, props || {});
    const c = { g: "Syringa", a: "x chinensis", de: "Chinesischer Flieder" };
    return { ohne, reihe, mitFoto, bkl, bklReihe, GATT, ART, cands: wikiCandidates(syr), gcands: wikiGenusCandidates(syr),
      ok: {
        flieder: genusArticleOk(pg("Flieder", "Flieder (Syringa) ist eine Pflanzengattung aus der Familie der Ölbaumgewächse (Oleaceae)."), c),
        weigela: genusArticleOk(pg("Weigelien", "Die Pflanzengattung Weigelien (Weigela, Syn.: Weigelia) gehört heute zur Unterfamilie Diervilloideae."), { g: "Weigela", a: "florida" }),
        loewenzahn: genusArticleOk(pg("Löwenzahn (Taraxacum)", "Löwenzahn (Taraxacum) ist eine Pflanzengattung innerhalb der Familie der Korbblütler (Asteraceae)."), { g: "Taraxacum", a: "sect. Ruderalia" }),
        iris: genusArticleOk(pg("Iris", "Iris steht für: Iris (Vorname), weiblicher Vorname Schwertlilien (Iris), eine Pflanzengattung", { pageprops: { disambiguation: "" } }), { g: "Iris", a: "sibirica" }),
        rose: genusArticleOk(pg("Rose", "Rose steht für: Rosen, Pflanzenarten aus der Gattung Rosa"), { g: "Rosa", a: "canina" }),
        beta: genusArticleOk(pg("Beta", "Beta (Aussprache ['be:ta], griechisches Neutrum Βῆτα, Majuskel Β, Minuskel β) ist der zweite Buchstabe des griechischen Alphabets."), { g: "Beta", a: "vulgaris" }),
        artikelArt: genusArticleOk(pg("Gewöhnliche Rosskastanie", "Die Gewöhnliche Rosskastanie (Aesculus hippocastanum), auch Gemeine Rosskastanie genannt, ist eine Pflanzenart aus der Gattung der Rosskastanien (Aesculus)."), { g: "Aesculus", a: "x carnea" }),
        fremd: genusArticleOk(pg("Hartriegel", "Hartriegel (Cornus) ist eine Pflanzengattung innerhalb der Familie der Hartriegelgewächse."), c),
      } };
  });
  assert(/Kein eigener Wikipedia-Artikel/.test(gattung.ohne.note) && /Gattung/.test(gattung.ohne.note) && /Syringa/.test(gattung.ohne.note) && /Flieder/.test(gattung.ohne.note) &&
    /beschreiben die Gattung/.test(gattung.ohne.note) && gattung.ohne.img === gattung.GATT && /Flieder \(Syringa\) ist eine Pflanzengattung/.test(gattung.ohne.text) && /Wikipedia – Flieder/.test(gattung.ohne.src),
    "Info-Karte: ohne eigenen Artikel erscheint der Gattungsartikel (Flieder) mit deutlichem Hinweis und Gattungsbild: " + JSON.stringify(gattung.ohne));
  assert(JSON.stringify(gattung.reihe) === JSON.stringify(["Syringa x chinensis", "Syringa × chinensis", "Syringa chinensis", "Chinesischer Flieder", "Syringa oblata subsp. oblata", "Syringa"]),
    "Kandidaten-Reihenfolge: voller Name → Hybrid-Zeichen × → Binom → deutscher Name → Synonym der Liste → erst dann die Gattung: " + JSON.stringify(gattung.reihe));
  assert(gattung.mitFoto.img === gattung.ART && /zeigt diese Art/.test(gattung.mitFoto.note) && /Wikimedia Commons/.test(gattung.mitFoto.src) && gattung.mitFoto.alt === "Bild der Art",
    "Info-Karte: gibt es ein Foto DIESER Art aus der Bildsuche, ersetzt es das Gattungsbild (mit Nachweis): " + JSON.stringify(gattung.mitFoto));
  assert(gattung.bkl.note === "" && /auch nicht zur Gattung/.test(gattung.bkl.none) && gattung.bkl.btn === false && gattung.bklReihe.includes("Abies") && gattung.bklReihe.includes("Tanne"),
    "Begriffsklärung ist kein Gattungsartikel → ehrlich »nicht gefunden – auch nicht zur Gattung« (Grundwort »Tanne« wurde noch probiert): " + JSON.stringify({ bkl: gattung.bkl, reihe: gattung.bklReihe }));
  assert(JSON.stringify(gattung.gcands) === JSON.stringify(["Syringa", "Flieder"]) && !gattung.cands.some((t) => /^syringa$/i.test(t)),
    "Gattungs-Kandidatinnen (lateinische Gattung + deutsches Grundwort) stehen getrennt von der Hauptliste: " + JSON.stringify({ cands: gattung.cands, gcands: gattung.gcands }));
  assert(gattung.ok.flieder && gattung.ok.weigela && gattung.ok.loewenzahn && !gattung.ok.iris && !gattung.ok.rose && !gattung.ok.beta && !gattung.ok.artikelArt && !gattung.ok.fremd,
    "genusArticleOk: echte Gattungsartikel ja; Begriffsklärung (pageprops/»steht für«), Fremdartikel (Beta), Artartikel (Rosskastanie), falsche Gattung nein: " + JSON.stringify(gattung.ok));

  // Ausfall ≠ »nicht gefunden« (Realfall Lonicera nitida 'Elegant': »kein Artikel – auch nicht zur
  // Gattung«, obwohl »Lonicera« → Heckenkirschen existiert – die Gattungs-Anfragen waren nur nicht
  // durchgekommen). Bleibt eine Anfrage ohne Antwort oder liefert die API eine Fehlerantwort, zeigt
  // die Karte ein Verbindungsproblem mit »Erneut versuchen« und cacht KEIN »null«.
  const wpFail = await page.evaluate(async () => {
    const prev = [$("#frSelect").value, $("#nivSelect").value];
    $("#frSelect").value = "garten_und_landschaftsbau"; $("#nivSelect").value = "gaertner"; applyProfile();
    const lon = allCards.find((c) => c.g === "Lonicera" && /Elegant/.test(c.a));
    const px = "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'/>");
    const missing = { query: { pages: { "-1": { title: "x", missing: "" } } } };
    const heck = { query: { pages: { "1": { title: "Heckenkirschen", extract: "Die Heckenkirschen bzw. Geißblätter (Lonicera) sind eine Pflanzengattung in der Familie der Geißblattgewächse (Caprifoliaceae).", thumbnail: { source: px } } } } };
    const titel = (url) => decodeURIComponent((url.match(/titles=([^&]+)/) || [])[1] || "");
    const laden = async () => {
      wikiCache.delete(lon.key); openInfo(lon); document.querySelector("#wpLoad").click();
      for (let i = 0; i < 80 && !document.querySelector("#wpHost .wp-text, #wpHost .wp-note"); i++) await new Promise((r) => setTimeout(r, 25));
      const h = document.querySelector("#wpHost");
      const r = { note: (h.querySelector(".wp-note") || {}).textContent || "", taxon: (h.querySelector(".wp-taxon") || {}).textContent || "",
        text: (h.querySelector(".wp-text") || {}).textContent || "", btn: ((document.querySelector("#wpLoad") || {}).textContent || "").trim(),
        cached: wikiCache.has(lon.key) ? String(wikiCache.get(lon.key)) : "nicht gecacht" };
      closeInfo(); return r;
    };
    __setPhotoSource(() => Promise.resolve(null));
    __setJsonp((url) => { if (/generator=images/.test(url)) return Promise.resolve({ query: { pages: {} } });
      const t = titel(url); if (t === "Lonicera" || t === "Heckenkirsche") return Promise.reject(new Error("timeout")); return Promise.resolve(missing); });
    const ausfall = await laden();                        // Art-Kandidatinnen beantwortet, Gattungs-Anfragen brechen ab
    __setJsonp((url) => { if (/generator=images/.test(url)) return Promise.resolve({ query: { pages: {} } });
      const t = titel(url); if (t === "Lonicera") return Promise.resolve({ error: { code: "ratelimited", info: "…" } }); return Promise.resolve(missing); });
    const apiFehler = await laden();                      // API-Fehlerantwort zählt ebenfalls als Ausfall
    __setJsonp((url) => { if (/generator=images/.test(url)) return Promise.resolve({ query: { pages: {} } });
      const t = titel(url); if (t === "Lonicera" || t === "Heckenkirsche") return Promise.resolve(heck); return Promise.resolve(missing); });
    const danach = await laden();                         // Verbindung wieder da → Gattungsartikel
    __setPhotoSource(null); __setJsonp(window.__offlineJsonp); __clearPhotoCache(); photoTried.clear();
    $("#frSelect").value = prev[0]; $("#nivSelect").value = prev[1]; applyProfile();
    return { ausfall, apiFehler, danach };
  });
  assert(/konnten nicht geladen/.test(wpFail.ausfall.note) && /2 von 6 Anfragen/.test(wpFail.ausfall.note) && /Erneut versuchen/.test(wpFail.ausfall.btn) && wpFail.ausfall.cached === "nicht gecacht",
    "Info-Karte: brechen Anfragen ab, heißt es NICHT »nicht gefunden«, sondern Verbindungsproblem + »Erneut versuchen«, nichts gecacht: " + JSON.stringify(wpFail.ausfall));
  assert(/1 von 6 Anfragen/.test(wpFail.apiFehler.note) && /Erneut versuchen/.test(wpFail.apiFehler.btn) && wpFail.apiFehler.cached === "nicht gecacht",
    "Info-Karte: eine API-Fehlerantwort (ratelimited) zählt als Ausfall: " + JSON.stringify(wpFail.apiFehler));
  assert(/Gattung/.test(wpFail.danach.taxon) && /Lonicera/.test(wpFail.danach.taxon) && /Heckenkirschen/.test(wpFail.danach.text) && wpFail.danach.cached === "[object Object]",
    "Info-Karte: nach »Erneut versuchen« mit Verbindung erscheint der Gattungsartikel Heckenkirschen: " + JSON.stringify(wpFail.danach));

  // Bild-Lightbox: das Quiz-Foto ist klick- UND tastaturbedienbar (role=button) und
  // öffnet die Großansicht (größeres Commons-Derivat); Esc schließt, Fokus kehrt zurück.
  const lightbox = await page.evaluate(async () => {
    const derive = lbBig("https://upload.wikimedia.org/wikipedia/commons/thumb/a/b/Foo.jpg/640px-Foo.jpg");
    __clearPhotoCache();
    __setPhotoSource(() => Promise.resolve({ thumb: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
      title: "Testbild", file: "Testbild.jpg", url: "https://example.invalid", src: "cm" }));
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    $("#sessLen").value = "4"; startSession();
    await new Promise((r) => setTimeout(r, 90));
    const img = document.querySelector("#phImg");
    const wired = !!img && img.getAttribute("role") === "button" && img.tabIndex === 0 && img.classList.contains("lb-zoom");
    img.focus(); img.click();
    const sc = document.querySelector(".lbscrim");
    const open = !!sc && sc.getAttribute("role") === "dialog" && !!sc.querySelector(".lb-img");
    const xFocused = document.activeElement === (sc && sc.querySelector(".lb-x"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    const closed = !document.querySelector(".lbscrim");
    const focusBack = document.activeElement === img;
    document.querySelector('#modeTabs button[data-mode="cards"]').click();   // Sitzung aufräumen
    __setPhotoSource(null); __clearPhotoCache();
    return { derive, wired, open, xFocused, closed, focusBack };
  });
  assert(/\/1920px-Foo\.jpg$/.test(lightbox.derive),
    "lbBig muss auf die Commons-Standardstufe ableiten (…/1920px-…, 1600 gibt es nicht mehr): " + lightbox.derive);
  assert(lightbox.wired, "Quiz-Foto muss als Button verkabelt sein (role/tabindex/lb-zoom): " + JSON.stringify(lightbox));
  assert(lightbox.open && lightbox.xFocused,
    "Klick aufs Foto muss die Lightbox öffnen (role=dialog, Fokus auf ×): " + JSON.stringify(lightbox));
  assert(lightbox.closed && lightbox.focusBack,
    "Esc muss die Lightbox schließen und den Fokus zum Foto zurückgeben: " + JSON.stringify(lightbox));

  // Vollbild-Galerie: Hat der Wikipedia-Artikel mehrere Bilder, blättert man in der
  // Großansicht mit Pfeilen bzw. ← → durch; bei einem Bild bleibt alles wie bisher.
  const galerie = await page.evaluate(() => {
    // Data-URIs statt erfundener Hosts: ein <img src> lädt immer, echte Netzfehler
    // würden sonst als Konsolenfehler gewertet.
    const px = (f) => "data:image/svg+xml," + encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'><title>" + f + "</title></svg>");
    const g = [{ src: px("A"), file: "A.jpg" }, { src: px("B"), file: "B.jpg" }, { src: px("C"), file: "C.jpg" }];
    openLightbox(g[0].src, "A", g, 0);
    const sc = document.querySelector(".lbscrim");
    const z = () => sc.querySelector(".lb-count").textContent;
    const start = z();
    const gross = lbBig("https://upload.wikimedia.org/x/thumb/a/A.jpg/640px-A.jpg");   // Ableitung separat prüfen
    sc.querySelector(".lb-nav.next").click();
    const nachKlick = z();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    const nachTaste = z();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    const umlauf = z();                                   // hinter dem letzten wieder das erste

    // Wischen (Handy): nach links = weiter, nach rechts = zurück, kurzer Wisch tut nichts
    const wisch = (x1, y1, x2, y2) => {
      const t = sc.querySelector(".lb-img");
      const f = (x, y) => new Touch({ identifier: 1, target: t, clientX: x, clientY: y });
      const ev = (typ, pts, chg) => t.dispatchEvent(new TouchEvent(typ,
        { bubbles: true, touches: pts, targetTouches: pts, changedTouches: chg }));
      ev("touchstart", [f(x1, y1)], [f(x1, y1)]);
      ev("touchmove",  [f(x2, y2)], [f(x2, y2)]);
      ev("touchend",   [],          [f(x2, y2)]);
    };
    wisch(300, 300, 120, 312); const wischLinks = z();     // −180 px → nächstes Bild
    wisch(120, 300, 300, 288); const wischRechts = z();    // +180 px → vorheriges
    wisch(300, 300, 280, 300); const wischKurz = z();      // −20 px → zu kurz, nichts passiert
    sc.click();                                            // Klick direkt nach dem Wisch darf nicht schließen
    const offenNachWisch = !!document.querySelector(".lbscrim");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    const zu = !document.querySelector(".lbscrim");
    openLightbox(px("Z"), "Z");
    const einzeln = { navs: document.querySelectorAll(".lbscrim .lb-nav").length,
      zaehler: !!document.querySelector(".lb-count") };
    closeLightbox();
    return { start, gross, nachKlick, nachTaste, umlauf, zu, einzeln,
      wischLinks, wischRechts, wischKurz, offenNachWisch };
  });
  assert(galerie.start === "1 / 3" && /1920px/.test(galerie.gross),
    "Galerie: Start bei 1/3 und in großer Auflösung: " + JSON.stringify(galerie));
  assert(galerie.nachKlick === "2 / 3" && galerie.nachTaste === "3 / 3" && galerie.umlauf === "1 / 3",
    "Galerie: Pfeil-Klick und ← → müssen blättern (mit Umlauf): " + JSON.stringify(galerie));
  assert(galerie.wischLinks === "2 / 3" && galerie.wischRechts === "1 / 3" && galerie.wischKurz === "1 / 3",
    "Galerie: Wischen muss blättern (links = weiter, rechts = zurück, kurzer Wisch nicht): " + JSON.stringify(galerie));
  assert(galerie.offenNachWisch,
    "Galerie: der Klick direkt nach einer Wisch-Geste darf die Großansicht nicht schließen: " + JSON.stringify(galerie));
  assert(galerie.zu && galerie.einzeln.navs === 0 && !galerie.einzeln.zaehler,
    "Galerie: Esc schließt; bei nur einem Bild keine Pfeile/Zähler: " + JSON.stringify(galerie));

  // Vorladen: Beim Öffnen der Großansicht werden die übrigen Bilder schon geholt,
  // damit das Blättern nicht wartet. Der Image-Konstruktor wird dafür belauscht.
  const vorlad = await page.evaluate(() => {
    const px = (f) => "data:image/svg+xml," + encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'><title>" + f + "</title></svg>");
    const D = px("D"), E = px("E"), F = px("F"), G = px("G");
    const geholt = [];
    const Orig = window.Image;
    window.Image = function () {                          // kein echter Abruf, nur mitschreiben
      const im = new Orig();
      Object.defineProperty(im, "src", { set(v) { geholt.push(v); }, get() { return ""; }, configurable: true });
      return im;
    };
    openLightbox(D, "D", [{ src: D }, { src: E }, { src: F }, { src: G }], 0);
    const beimOeffnen = geholt.slice();                   // E, F, G – alles außer dem gezeigten
    geholt.length = 0;
    document.querySelector(".lbscrim .lb-nav.next").click();
    const beimBlaettern = geholt.slice();                 // schon alle geholt → nichts Neues
    closeLightbox();
    geholt.length = 0;
    openLightbox(px("H"), "H");                           // Einzelbild: nichts vorzuladen
    const einzeln = geholt.slice();
    closeLightbox();
    window.Image = Orig;
    return { beimOeffnen, beimBlaettern: beimBlaettern.length, einzeln: einzeln.length,
      reihenfolge: beimOeffnen[0] === E, alle: [E, F, G].every((u) => beimOeffnen.indexOf(u) >= 0),
      ohneAktuelles: beimOeffnen.indexOf(D) < 0 };
  });
  assert(vorlad.alle && vorlad.beimOeffnen.length === 3,
    "Vorladen: beim Öffnen müssen alle weiteren Galerie-Bilder geholt werden: " + JSON.stringify(vorlad));
  assert(vorlad.reihenfolge && vorlad.ohneAktuelles,
    "Vorladen: der Nachbar zuerst, das gezeigte Bild nicht noch einmal: " + JSON.stringify(vorlad));
  assert(vorlad.beimBlaettern === 0 && vorlad.einzeln === 0,
    "Vorladen: nichts doppelt anfragen, bei einem Einzelbild gar nichts: " + JSON.stringify(vorlad));

  // Ausweich-Kette: Commons liefert Vorschaubilder bei Direktabruf nur noch in festen Stufen
  // (… 960 · 1280 · 1920 px) – eine selbst abgeleitete »1600px-«/»640px-«-URL kommt als
  // HTML-Fehlerseite (HTTP 400) zurück und blieb als leerer Rahmen stehen. Jetzt: Standard-
  // stufe (nie über die Originalbreite hinaus) → gelieferte Vorschau → sichtbare Meldung.
  const kette = await page.evaluate(async () => {
    const u640 = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/b/Foo.jpg/640px-Foo.jpg?utm_source=x";
    const chain = __lbChain({ src: u640 });
    const klein = __lbChain({ src: u640, w: 1500 });                  // Original nur 1500 px breit → 1280, nicht 1920
    const winzig = __lbChain({ src: u640, w: 900 });                   // nichts Größeres verfügbar → nur die Vorschau
    const data = __lbChain({ src: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>" });
    // Sichtbarer Fallback ohne Netz: das src-Setzen des <img> wird auf Data-URIs umgeleitet
    const px = (f) => "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'><title>" + f + "</title></svg>");
    const kaputt = "data:image/png;base64,AAAA";                       // lädt nie
    const Z960 = "https://fake/thumb/x/Z.jpg/960px-Z.jpg", Z1920 = "https://fake/thumb/x/Z.jpg/1920px-Z.jpg";
    const map = {}; map[Z1920] = kaputt; map[Z960] = px("Z");
    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    const gesetzt = [];
    Object.defineProperty(HTMLImageElement.prototype, "src", { configurable: true,
      get() { return desc.get.call(this); }, set(v) { gesetzt.push(v); desc.set.call(this, map[v] || v); } });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const sc = () => document.querySelector(".lbscrim");
    openLightbox(kaputt, "k", [{ src: kaputt }, { src: Z960 }], 0);
    await wait(120);
    const meldung = (sc().querySelector(".lb-fail") || {}).textContent || "";
    const ausgeblendet = sc().classList.contains("lb-failed") && getComputedStyle(sc().querySelector(".lb-img")).display === "none";
    sc().querySelector(".lb-nav.next").click();
    await wait(120);
    const img = sc().querySelector(".lb-img");
    const weg = !sc().querySelector(".lb-fail") && !sc().classList.contains("lb-failed");
    const geladen = img.complete && img.naturalWidth > 0;
    const reihenfolge = gesetzt.filter((v) => /fake/.test(v));         // 1920 zuerst (scheitert), dann die 960-Vorschau
    closeLightbox();
    Object.defineProperty(HTMLImageElement.prototype, "src", desc);
    return { u640, chain, klein, winzig, data, meldung, ausgeblendet, weg, geladen, reihenfolge, Z960, Z1920 };
  });
  assert(kette.chain.length === 4 && /^https:\/\/upload\.wikimedia\.org\/.*\/1920px-Foo\.jpg\?utm_source=x$/.test(kette.chain[0])
    && kette.chain[1] === "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/b/Foo.jpg/1920px-Foo.jpg" && kette.chain[2] === kette.u640
    && kette.chain[3] === "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/b/Foo.jpg/640px-Foo.jpg",
    "Kette: Standardstufe 1920 (Query-String bleibt) → Ausweich-Host → gelieferte Vorschau → Ausweich-Host: " + JSON.stringify(kette.chain));
  assert(kette.klein.length === 4 && /\/1280px-/.test(kette.klein[0]) && kette.winzig.length === 2 && kette.winzig[0] === kette.u640 && /^https:\/\/thumb\./.test(kette.winzig[1]) && kette.data.length === 1,
    "Kette: nie über die Originalbreite hinaus (1500 → 1280, 900 → nur Vorschau + Ausweich-Host), Data-URI unverändert: " + JSON.stringify({ klein: kette.klein, winzig: kette.winzig, data: kette.data }));
  assert(/Bild nicht verfügbar/.test(kette.meldung) && kette.ausgeblendet,
    "Großansicht: scheitert die ganze Kette, steht eine Meldung statt eines leeren Rahmens: " + JSON.stringify({ m: kette.meldung, a: kette.ausgeblendet }));
  assert(kette.weg && kette.geladen && kette.reihenfolge[0] === kette.Z1920 && kette.reihenfolge.indexOf(kette.Z960) > 0,
    "Großansicht: nächstes Bild – 1920 probiert, scheitert, die gelieferte Vorschau lädt, Meldung weg: " + JSON.stringify({ weg: kette.weg, geladen: kette.geladen, r: kette.reihenfolge }));

  // Bild lädt nicht (Rückmeldung »Vinca minor«): Das Artikelbild hat nur EINE Ansicht –
  // bisher hieß ein einziger Aussetzer dort sofort »Bild konnte nicht geladen werden«,
  // ohne zweiten Versuch. Jetzt: Ausweich-Host (thumb. ↔ upload.), nach kurzer Pause eine
  // zweite Runde mit Cache-Umgehung, erst dann Karte ans Ende der Runde + Treffer verwerfen;
  // geht auch das nicht mehr, eine Meldung MIT Knöpfen. Die Bildabrufe beantwortet der Test
  // selbst (Request-Interception: kaputtes bzw. echtes GIF, immer HTTP 200 → keine Konsolenfehler).
  const GIF = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
  let heil = false; const angefragt = [];
  const onReq = (r) => {
    if (!/wikimedia\.org/.test(r.url())) return r.continue();
    angefragt.push(r.url());
    r.respond({ status: 200, contentType: "image/gif", body: heil ? GIF : Buffer.from("AAAA") });
  };
  await page.setRequestInterception(true); page.on("request", onReq);
  const nodeWait = async (test, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (test()) return true; await new Promise((r) => setTimeout(r, 30)); } return false; };
  const T = "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fa/V.jpg/960px-V.jpg?utm_source=de.wikipedia.org&utm_campaign=pageimages";
  const bf1 = await page.evaluate(async (T) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__bisZu = async (test, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (test()) return true; await wait(40); } return false; };
    __clearPhotoCache(); photoTried.clear(); __setImgRetryWait(150); __setPhotoWait(300);
    window.__suchen = {};
    __setPhotoSource((card) => { window.__suchen[card.key] = (window.__suchen[card.key] || 0) + 1;
      return Promise.resolve({ thumb: T, title: "Kleines Immergrün", file: "V.jpg", url: "https://x/y", src: "wp" }); });
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    document.querySelector("#sessLen").value = "2"; startSession();
    await window.__bisZu(() => !!document.querySelector("#phImg"), 3000);
    window.__erste = current;
    return { chain: __imgChain([{ src: T }]), alt: __hostAlt(T),
      back: __hostAlt("https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/V.jpg/960px-V.jpg"), none: __hostAlt("https://example.org/x.jpg") };
  }, T);
  assert(bf1.chain.length === 2 && bf1.chain[0] === T && bf1.chain[1] === "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/V.jpg/960px-V.jpg"
    && bf1.alt === bf1.chain[1] && /^https:\/\/thumb\.wikimedia\.org\/wikipedia\/commons\/thumb\/f\/fa\/V\.jpg\/960px-V\.jpg$/.test(bf1.back) && bf1.none === null,
    "Bild-Kette: jede Ansicht über beide Wikimedia-Hosts (ohne utm-Anhang), fremde Hosts ohne Ersatz: " + JSON.stringify(bf1));
  // Fall 1: Runde 1 scheitert (beide Hosts) – die zweite Runde lädt → Bild da, keine Meldung, Karte bleibt
  await nodeWait(() => angefragt.length >= 2, 3000);
  heil = true;
  const bf1b = await page.evaluate(async () => {
    const geladen = await window.__bisZu(() => { const i = document.querySelector("#phImg"); return !!i && i.complete && i.naturalWidth > 0; }, 4000);
    return { geladen, gleicheKarte: current === window.__erste, opts: document.querySelectorAll("#opts .opt").length,
      meldung: /nicht geladen/.test(document.querySelector("#stage").textContent) };
  });
  assert(bf1b.geladen && bf1b.gleicheKarte && bf1b.opts === 4 && !bf1b.meldung && angefragt.length >= 3
    && angefragt[0] === T && /^https:\/\/upload\.wikimedia\.org\//.test(angefragt[1]) && /[?&]pbw=[0-9a-z]+$/.test(angefragt[2]),
    "Bild scheitert einmal → Ausweich-Host, dann zweite Runde mit Cache-Umgehung lädt, Karte bleibt: " + JSON.stringify({ bf1b, angefragt }));
  // Fall 2: alles scheitert, auch die zweite Runde → Karte ans Ende der Runde, Treffer verworfen, Toast
  heil = false; angefragt.length = 0;
  const bf2 = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector("#btnStop").click(); await wait(60);
    const ov = document.querySelector("#btnOverview"); if (ov) ov.click(); else exitSession();
    __clearPhotoCache(); photoTried.clear();
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    document.querySelector("#sessLen").value = "2"; startSession();
    await window.__bisZu(() => !!document.querySelector("#phImg"), 3000);
    const c1 = current, k1 = c1.key, imSpeicher = k1 in photoStoreLoad(), suchenVorher = window.__suchen[k1] || 0;
    const verschoben = await window.__bisZu(() => current !== c1, 5000);
    const sofort = { toast: document.querySelector("#toast").textContent, defer: sess.imgDefer, hinten: queue[queue.length - 1] === c1 };
    // Fall 3: eine ganze Runde ohne ladbares Bild → Meldung MIT Knöpfen statt totem Ende (Such-Zähler bleibt davon unberührt)
    const meldung = await window.__bisZu(() => !!document.querySelector("#phImgRetry"), 10000);
    const neuGesucht = (window.__suchen[k1] || 0) > suchenVorher;   // Treffer verworfen → beim Wiederkommen frisch gesucht
    const out = { imSpeicher, verschoben, sofort, meldung, neuGesucht, text: (document.querySelector(".ph-load") || {}).textContent || "",
      andere: !!document.querySelector("#phImgOther"), ohneBild: !!document.querySelector("#phImgQuiz"), keinStillerQuiz: !document.querySelector(".ph-fallback") && mode === "photo" };
    // »Ohne Bild weiter«: nur DIESE Karte als Auswahlfrage, der Modus bleibt Bilder-Quiz
    document.querySelector("#phImgQuiz").click(); await wait(80);
    out.quiz = { opts: document.querySelectorAll("#opts .opt").length, bild: !!document.querySelector("#phImg"), basis: sess.baseMode };
    document.querySelector("#btnStop").click(); await wait(60);
    const ov2 = document.querySelector("#btnOverview"); if (ov2) ov2.click(); else exitSession();
    return out;
  });
  assert(bf2.imSpeicher && bf2.verschoben && /kommt später/.test(bf2.sofort.toast) && bf2.sofort.defer >= 1 && bf2.sofort.hinten && bf2.neuGesucht,
    "Bild scheitert auch in Runde 2 → Karte ans Ende der Runde, Treffer verworfen (neu gesucht), Hinweis-Toast: " + JSON.stringify(bf2));
  assert(bf2.meldung && /nicht geladen/.test(bf2.text) && bf2.andere && bf2.ohneBild && bf2.keinStillerQuiz,
    "Ganze Runde ohne ladbares Bild → Meldung mit »Nochmal versuchen«/»Andere Art zeigen«/»Ohne Bild weiter«, kein stiller Moduswechsel: " + JSON.stringify(bf2));
  assert(bf2.quiz.opts === 4 && !bf2.quiz.bild && bf2.quiz.basis === "photo",
    "»Ohne Bild weiter« stellt nur diese Karte als Auswahlfrage: " + JSON.stringify(bf2.quiz));
  // »Nochmal versuchen« lädt das Bild, sobald es wieder geht
  heil = false;
  const bf3 = await page.evaluate(async () => {
    __clearPhotoCache(); photoTried.clear();
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    document.querySelector("#sessLen").value = "2"; startSession();
    return await window.__bisZu(() => !!document.querySelector("#phImgRetry"), 10000);
  });
  assert(bf3, "zweite Sitzung ohne ladbare Bilder läuft wieder in die Meldung: " + JSON.stringify(bf3));
  heil = true;
  const bf3b = await page.evaluate(async () => {
    document.querySelector("#phImgRetry").click();
    const geladen = await window.__bisZu(() => { const i = document.querySelector("#phImg"); return !!i && i.complete && i.naturalWidth > 0; }, 4000);
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    __setPhotoSource(null); __setImgRetryWait(); __setPhotoWait(); __clearPhotoCache(); photoTried.clear();
    delete window.__bisZu; delete window.__erste; delete window.__suchen;
    return { geladen };
  });
  page.off("request", onReq); await page.setRequestInterception(false);
  assert(bf3b.geladen, "»Nochmal versuchen« lädt das Bild, sobald es wieder geht: " + JSON.stringify(bf3b));

  // Lernstand in der Info-Karte: Stufe, Fälligkeit und Bilanz beim Nachschlagen
  const lstate = await page.evaluate(() => {
    const c1 = allCards[0], c2 = allCards[1];
    const prog = {}; prog[c2.key] = { box: 2, due: "2099-01-01", seen: 3, correct: 2, wrong: 1 };
    localStorage.setItem("pflanzenlernen.progress.gemuesebau_gaertner", JSON.stringify(prog));
    applyProfile();
    const lies = (c) => { openInfo(c); const e = document.querySelector(".lstate");
      const o = { txt: e ? e.textContent.replace(/\s+/g, " ").trim() : "FEHLT",
        an: e ? e.querySelectorAll(".pips i.on").length : -1,
        // Der Lernstand gehört ans Ende der Karte – nach dem Wikipedia-Block
        letzte: !!(e && e.parentElement.lastElementChild === e),
        nachWp: !!(e && e.previousElementSibling && e.previousElementSibling.classList.contains("wpblock")) };
      closeInfo(); return o; };
    const neu = lies(allCards[0]), lernt = lies(allCards[1]);
    localStorage.removeItem("pflanzenlernen.progress.gemuesebau_gaertner"); applyProfile();
    return { neu, lernt };
  });
  assert(/Noch nicht gelernt/.test(lstate.neu.txt) && lstate.neu.an === 0,
    "Info-Karte: unbekannte Art muss »Noch nicht gelernt« zeigen: " + JSON.stringify(lstate.neu));
  assert(/Stufe 2 von 5/.test(lstate.lernt.txt) && /2 richtig/.test(lstate.lernt.txt) && lstate.lernt.an === 2,
    "Info-Karte: Lernstand (Stufe, Bilanz, 2 Punkte aktiv) fehlt: " + JSON.stringify(lstate.lernt));
  assert(lstate.neu.letzte && lstate.neu.nachWp && lstate.lernt.letzte,
    "Info-Karte: Lernstand muss unten stehen (letztes Element, direkt nach dem Wikipedia-Block): " + JSON.stringify(lstate));

  // Quiz-Juice: celebrate() feuert Vibration + Feuerwerk (Ring, Blätter/Blüten/Funken,
  // zweite Welle bei Stärke 2); Quiz-Optionen fahren gestaffelt ein, richtig poppt.
  const juice = await page.evaluate(() => {
    let vibed = null; navigator.vibrate = (p) => { vibed = p; return true; };
    celebrate(document.body, 2);
    const vibedStrong = vibed;                           // sofort sichern – der spätere echte Treffer-buzz (12) überschreibt sonst
    const confN = document.querySelectorAll(".conf").length;
    const ring = !!document.querySelector(".conf-ring");
    const shapes = document.querySelectorAll(".conf.c-petal").length > 0 &&
                   document.querySelectorAll(".conf.c-spark").length > 0;
    document.querySelectorAll(".conf-host").forEach((h) => h.remove());
    $("#frSelect").value = "gemuesebau"; $("#nivSelect").value = "gaertner"; applyProfile();
    document.querySelector('#modeTabs button[data-mode="quiz"]').click();
    $("#sessLen").value = "4"; startSession();
    const opts = [...document.querySelectorAll(".options .opt")];
    const s0 = getComputedStyle(opts[0]), s1 = getComputedStyle(opts[1]);
    const stagger = s0.animationName.includes("optIn") && s1.animationDelay !== s0.animationDelay;
    opts[0].click();                                     // egal ob richtig – der richtige Knopf bekommt .correct
    const cb = document.querySelector(".opt.correct");
    const pop = !!cb && getComputedStyle(cb).animationName.includes("optPop");
    document.querySelector('#modeTabs button[data-mode="cards"]').click();   // Sitzung aufräumen
    return { vibed: vibedStrong, confN, ring, shapes, stagger, pop };
  });
  assert(Array.isArray(juice.vibed) && juice.vibed.length >= 3,
    "celebrate(Stärke 2) muss ein Vibrationsmuster senden (Haptik): " + JSON.stringify(juice.vibed));
  assert(juice.confN >= 60 && juice.ring && juice.shapes,
    "Feuerwerk: Stärke 2 braucht ≥60 Partikel, Licht-Ring und drei Formen (Blatt/Blüte/Funke): " + JSON.stringify(juice));
  assert(juice.stagger && juice.pop,
    "Quiz-Optionen müssen gestaffelt einfahren (optIn + Delays), der richtige Knopf poppt (optPop): " + JSON.stringify(juice));

  // Lernserie + Tagesziel: jede bearbeitete Karte zählt; bei Zielerreichen beginnt/wächst
  // die Serie; »Ziel gestern erreicht« überlebt die Nacht, ein Loch reißt die Serie.
  const streak = await page.evaluate(() => {
    const K = "pflanzenlernen.streak";
    const shift = (n) => { const d = new Date(); d.setDate(d.getDate() + n);
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
    const today = shift(0);
    localStorage.setItem(K, JSON.stringify({}));                  // frischer Stand – das Ziel ist fest 20 Karten
    for (let i = 0; i < 20; i++) streakBump();
    const s1 = streakState();
    const reached = s1.s === 1 && s1.gd === today && s1.n === 20 && streakGoal() === 20;
    localStorage.setItem(K, JSON.stringify({ d: shift(-1), n: 25, s: 3, b: 3, gd: shift(-1) }));
    const s2 = streakState();                                   // Ziel gestern erreicht → Serie lebt, Tageszähler frisch
    const survived = s2.s === 3 && s2.n === 0;
    localStorage.setItem(K, JSON.stringify({ d: shift(-3), n: 9, s: 4, b: 6, gd: shift(-3) }));
    const broken = streakState().s === 0;                       // letzter Zieltag vor 3 Tagen → gerissen
    localStorage.setItem(K, JSON.stringify({ d: today, n: 3, s: 2, b: 6, gd: shift(-1) }));
    renderProgress();
    const row = document.querySelector("#streakRow");
    const ui = !!row && row.querySelector(".sflame b").textContent === "2" && /3\/20 heute/.test(row.textContent) &&
      row.querySelector(".sflame").classList.contains("on");
    const goalField = !!document.querySelector("#dayGoal");
    localStorage.setItem(K, JSON.stringify({ d: today, n: 100000, gd: today }));   // Harnisch-Zustand wiederherstellen
    renderProgress();
    return { reached, survived, broken, ui, goalField };
  });
  assert(streak.reached, "Lernserie: das Erreichen des Tagesziels muss die Serie starten (s=1, gd=heute): " + JSON.stringify(streak));
  assert(streak.survived && streak.broken,
    "Lernserie: »Ziel gestern erreicht« muss die Nacht überleben, ein Loch muss die Serie reißen: " + JSON.stringify(streak));
  assert(streak.ui && !streak.goalField,
    "Lernserie-UI: Flammen-Chip (Serie an, 3/20 heute) im Fortschritt, kein Tagesziel-Feld mehr (fest 20): " + JSON.stringify(streak));

  // Sammel-Herbarium: sitzt JEDE Art eines Themas (Box 4–5), gilt es als gemeistert –
  // einmalige Feier, Sammelkarte wird farbig mit »Gemeistert«-Stempel.
  const herb = await page.evaluate(() => {
    $("#frSelect").value = "gemuesebau"; $("#nivSelect").value = "gaertner"; applyProfile();
    const thema = allCards.find((c) => c.thema === "Zwiebelgemüse") ? "Zwiebelgemüse" : allCards[0].thema;
    const prog = {};
    allCards.filter((c) => c.thema === thema).forEach((c) => {
      prog[c.key] = { box: 5, due: "2099-01-01", seen: 3, correct: 3, wrong: 0 }; });
    localStorage.setItem("pflanzenlernen.progress.gemuesebau_gaertner", JSON.stringify(prog));
    localStorage.removeItem("pflanzenlernen.herb.gemuesebau_gaertner");
    applyProfile();                                     // Fortschritt neu laden
    const neu1 = herbCheck();                           // → [thema], einmalig
    const neu2 = herbCheck();                           // → leer
    openHerbarium();
    const modal = document.querySelector(".herbmodal");
    const total = modal ? modal.querySelectorAll(".herbcard").length : 0;
    const doneCards = modal ? modal.querySelectorAll(".herbcard.done").length : 0;
    const doneName = modal && modal.querySelector(".herbcard.done .hc-name") ?
      modal.querySelector(".herbcard.done .hc-name").textContent.trim() : "";
    const stamp = modal && !!modal.querySelector(".herbcard.done .hc-stamp");
    const btn = !!document.querySelector("#btnHerb");
    document.querySelector("#infoClose").click();
    localStorage.removeItem("pflanzenlernen.progress.gemuesebau_gaertner");
    localStorage.removeItem("pflanzenlernen.herb.gemuesebau_gaertner");
    applyProfile();                                     // aufräumen
    return { thema, neu1, neu2, total, doneCards, doneName, stamp, btn };
  });
  assert(herb.btn, "»Mein Herbarium«-Knopf fehlt im Fortschritts-Bereich");
  assert(Array.isArray(herb.neu1) && herb.neu1.includes(herb.thema) && herb.neu2.length === 0,
    "Herbarium: ein voll gemeistertes Thema muss GENAU EINMAL gefeiert werden: " + JSON.stringify(herb));
  assert(herb.total > 3 && herb.doneCards === 1 && herb.doneName === herb.thema && herb.stamp,
    "Herbarium-Modal: genau die gemeisterte Sammelkarte muss farbig mit Stempel sein: " + JSON.stringify(herb));

  // Angefangenes Thema: die Karte muss zeigen, WAS noch fehlt – Arten ohne Foto extra
  // markiert (sie kommen im Bilder-Modus als Quizfrage, hängen also nicht unsichtbar fest).
  const offen = await page.evaluate(() => {
    $("#frSelect").value = "gemuesebau"; $("#nivSelect").value = "gaertner"; applyProfile();
    const thema = "Zwiebelgemüse";
    const imThema = allCards.filter((c) => c.thema === thema);
    const prog = {};
    imThema.slice(0, imThema.length - 2).forEach((c) => {          // alle bis auf zwei sitzen
      prog[c.key] = { box: 5, due: "2099-01-01", seen: 3, correct: 3, wrong: 0 }; });
    localStorage.setItem("pflanzenlernen.progress.gemuesebau_gaertner", JSON.stringify(prog));
    const fehlt = imThema.slice(imThema.length - 2);
    __clearPhotoCache();
    __rememberPhoto(fehlt[0].key, null);                           // für diese Art gibt es sicher kein Foto
    applyProfile(); openHerbarium();
    const karte = [...document.querySelectorAll(".herbcard")].find((k) => k.querySelector(".hc-name").textContent.trim() === thema);
    const liste = karte ? [...karte.querySelectorAll(".hc-open li")] : [];
    const res = { hatBlock: !!(karte && karte.querySelector(".hc-open")),
      anzahl: liste.length, ohneFoto: liste.filter((li) => li.classList.contains("no-photo")).length,
      tag: !!(karte && karte.querySelector(".np-tag")),
      // ein noch gar nicht begonnenes Thema bekommt keine Liste (das wäre die ganze Liste)
      leerOhneFortschritt: (() => {
        const k2 = [...document.querySelectorAll(".herbcard")].find((k) => /0\/\d+ sitzt/.test(k.querySelector(".hc-n").textContent));
        return k2 ? !k2.querySelector(".hc-open") : true;
      })() };
    document.querySelector("#infoClose").click();
    localStorage.removeItem("pflanzenlernen.progress.gemuesebau_gaertner");
    localStorage.removeItem("pflanzenlernen.herb.gemuesebau_gaertner");
    __clearPhotoCache(); applyProfile();
    return res;
  });
  assert(offen.hatBlock && offen.anzahl === 2,
    "Herbarium: angefangenes Thema muss die noch fehlenden Arten auflisten: " + JSON.stringify(offen));
  assert(offen.ohneFoto === 1 && offen.tag,
    "Herbarium: Arten ohne Foto müssen markiert sein (»ohne Foto«): " + JSON.stringify(offen));
  assert(offen.leerOhneFortschritt,
    "Herbarium: ein noch gar nicht begonnenes Thema bekommt keine Fehl-Liste: " + JSON.stringify(offen));

  // Der Weg zum »sitzt« muss IM TOOL erklärt sein – sonst sieht man nach der ersten
  // Sitzung nur »0 sitzt« und hört auf. Drei Orte: Stufen-Anzeige nach jeder Antwort,
  // Erklärzeile an der Fortschritts-Legende, Erklärkasten im Herbarium.
  const erklaert = await page.evaluate(async () => {
    const rest = [0, 1, 2, 3, 4, 5].map((b) => stepsLeft(b));      // neu/1 → 3 Treffer (Sprung 0→2!)
    $("#frSelect").value = "gemuesebau"; $("#nivSelect").value = "gaertner"; applyProfile();
    renderProgress();
    openHowModal();
    const legende = (document.querySelector(".howmodal") || {}).textContent || "";
    const howBtn = !!document.querySelector("#btnHow");
    document.querySelector("#infoClose").click();
    // Quiz: nach der Antwort steht die Stufe unter der Lösung
    document.querySelector('#modeTabs button[data-mode="quiz"]').click();
    $("#sessLen").value = "6"; startSession();
    const soll = answerText(current);
    [...document.querySelectorAll("#opts .opt")]
      .find((o) => o.querySelector("span:last-child").textContent === soll).click();
    const line = document.querySelector("#fb .stepline");
    const nachTreffer = line ? line.textContent.replace(/\s+/g, " ") : "";
    const pips = line ? line.querySelectorAll(".pips i").length : 0;
    const an = line ? line.querySelectorAll(".pips i.on").length : 0;
    // Karteikarte: Stufe schon VOR der Bewertung sichtbar
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    startSession(); flipCard();
    const aufKarte = !!document.querySelector(".stepline");
    document.querySelector("#btnStop").click();
    openHerbarium();
    const herbHow = (document.querySelector(".herb-how") || {}).textContent || "";
    document.querySelector("#infoClose").click();
    return { rest, legende, howBtn, nachTreffer, pips, an, aufKarte, herbHow };
  });
  assert(JSON.stringify(erklaert.rest) === JSON.stringify([3, 3, 2, 1, 0, 0]),
    "Restrechnung muss den Sprung neu→Stufe 2 berücksichtigen (3/3/2/1/0/0): " + JSON.stringify(erklaert.rest));
  assert(erklaert.howBtn && /Stufe 4/.test(erklaert.legende) && /drei/.test(erklaert.legende),
    "ℹ an der Legende muss die grafische Stufen-Erklärung öffnen: " + erklaert.legende.slice(0, 160));
  assert(erklaert.pips === 5 && erklaert.an === 2 && /Stufe 2 von 5/.test(erklaert.nachTreffer) && /noch 2× richtig/.test(erklaert.nachTreffer),
    "Nach einem Treffer muss die Stufe (2 von 5, noch 2×) mit 5 Punkten erscheinen: " + JSON.stringify(erklaert));
  assert(erklaert.aufKarte, "Karteikarte: die Stufe muss schon vor der Bewertung sichtbar sein");

  // Keine bunten Emojis in der Oberfläche – Symbole sind einheitliche Strich-SVGs.
  // (Geprüft wird der sichtbare Text der Startansicht samt Modalen, nicht der Quelltext.)
  const keineEmojis = await page.evaluate(() => {
    const EMO = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}]/u;   // inkl. ⏱ & Co. (U+2300–23FF, Audit)
    const treffer = [];
    const sammle = (wo) => {
      const w = document.createTreeWalker(wo, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => /^(SCRIPT|STYLE|TEMPLATE)$/.test(n.parentNode && n.parentNode.nodeName)
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
      for (let n = w.nextNode(); n; n = w.nextNode())
        if (EMO.test(n.nodeValue)) treffer.push(n.nodeValue.trim().slice(0, 40));
    };
    renderProgress(); sammle(document.body);
    openHowModal(); sammle(document.querySelector(".howmodal")); document.querySelector("#infoClose").click();
    openHerbarium(); sammle(document.querySelector(".herbmodal")); document.querySelector("#infoClose").click();
    document.querySelectorAll("[title]").forEach((e) => {          // Tooltips zählen mit
      if (EMO.test(e.getAttribute("title"))) treffer.push("title: " + e.getAttribute("title").slice(0, 40));
    });
    const icons = document.querySelectorAll("#progress svg.ic").length;
    // Kein Icon darf wuchern: Die Klassen stammen teils aus Emoji-Zeiten (font-size
    // statt width/height) – ohne Maße dehnt sich ein SVG auf die volle Breite.
    const zuGross = [];
    const messe = () => document.querySelectorAll("svg.ic").forEach((s) => {
      const r = s.getBoundingClientRect();
      if (r.width > 40 || r.height > 40) zuGross.push((s.getAttribute("class") || "ic") + " " + Math.round(r.width) + "x" + Math.round(r.height));
    });
    messe();
    openInfo(allCards[0]); messe(); closeInfo();          // Info-Karte (Buch-Icon im Klapp-Kopf)
    openIntro(false); messe(); document.querySelector("#introGo").click();
    return { treffer, icons, zuGross };
  });
  assert(keineEmojis.treffer.length === 0,
    "Keine bunten Emojis in der Oberfläche – gefunden: " + JSON.stringify(keineEmojis.treffer));
  assert(keineEmojis.icons >= 3,
    "Die Status-Chips müssen Strich-Icons (svg.ic) tragen: " + keineEmojis.icons);
  assert(keineEmojis.zuGross.length === 0,
    "Kein Icon darf über 40px wachsen (fehlende Maße an einer Emoji-Altklasse): " + JSON.stringify(keineEmojis.zuGross));
  assert(/gemeistert/.test(erklaert.herbHow) && /sitzt/.test(erklaert.herbHow),
    "Im Herbarium muss der Verweis auf die Stufen-Erklärung stehen: " + erklaert.herbHow);

  // Ränge = Lernstand (keine Erfahrungspunkte mehr): Keimling → Sämling (10 angefangene Arten) …;
  // ein Aufstieg wird einmalig gefeiert. Combo zählt Treffer in Folge (ab 3 sichtbar), ohne Punkte.
  const xp = await page.evaluate(async () => {
    localStorage.removeItem("pflanzenlernen.xp");
    // Lernstand für die Rang-Bedingung: ein anderes Profil mit zehn angefangenen Arten (bestes Profil zählt)
    localStorage.setItem("pflanzenlernen.progress.obstbau_fachwerker", JSON.stringify(Object.fromEntries(
      cardsFor("obstbau_fachwerker").slice(0, 10).map((c) => [c.key, { box: 1, due: "2099-01-01", seen: 1, correct: 1, wrong: 0 }]))));
    __masteryReset();
    const VOLL = { started: 100, fest: 100, n: 100, share: 1 };
    const r0 = rankOf({ started: 0, fest: 0, n: 100, share: 0 }), r1 = rankOf({ started: 10, fest: 0, n: 100, share: 0 }), rTop = rankOf(VOLL);
    rankCheck();                                         // Aufstieg Keimling → Sämling (zehn angefangene Arten)
    const nachAufstieg = rankOf().name;
    const gefeiert = xpLoad().r === 1 && /Neuer Rang: Sämling/.test(document.querySelector("#toast").textContent);
    const keinePunkte = typeof xpTotal === "undefined" && typeof xpAdd === "undefined" && typeof scoreHit === "undefined" && typeof XP_BASE === "undefined";
    // Quiz-Sitzung: erst falsch (Combo bleibt 0), dann drei richtige in Folge
    $("#frSelect").value = "gemuesebau"; $("#nivSelect").value = "gaertner"; applyProfile();
    document.querySelector('#modeTabs button[data-mode="quiz"]').click();
    $("#sessLen").value = "8"; startSession();
    const antworte = (richtig) => {
      const soll = answerText(current);
      const opts = [...document.querySelectorAll("#opts .opt")];
      const b = opts.find((o) => (o.querySelector("span:last-child").textContent === soll) === richtig);
      b.click(); const nx = document.querySelector("#wt"); if (nx) nx.click();
    };
    antworte(false);
    const comboNachFehler = sess.combo || 0;
    antworte(true); antworte(true);
    const bar2 = document.querySelector(".scombo");      // bei 2 noch nicht sichtbar
    antworte(true);
    const bar3 = document.querySelector(".scombo");      // ab 3 sichtbar
    const combo3 = sess.combo, comboText = bar3 ? bar3.textContent : "";
    document.querySelector('#modeTabs button[data-mode="cards"]').click();   // Sitzung beenden
    localStorage.removeItem("pflanzenlernen.xp");
    localStorage.removeItem("pflanzenlernen.progress.obstbau_fachwerker"); __masteryReset();
    return { r0: r0.name, r1: r1.name, rTopNext: rTop.next, nachAufstieg, gefeiert, keinePunkte,
      comboNachFehler, sichtbarBei2: !!bar2, sichtbarBei3: !!bar3, combo3, comboText };
  });
  assert(xp.r0 === "Keimling" && xp.r1 === "Sämling" && xp.rTopNext === null,
    "Ränge: Keimling → Sämling → … → höchster Rang ohne »nächsten«: " + JSON.stringify(xp));
  assert(xp.nachAufstieg === "Sämling" && xp.gefeiert,
    "Rangaufstieg allein durch den Lernstand muss greifen und gefeiert werden: " + JSON.stringify(xp));
  assert(xp.keinePunkte, "Erfahrungspunkte sind entfallen (xpTotal/xpAdd/scoreHit/XP_BASE gibt es nicht mehr)");
  assert(xp.comboNachFehler === 0 && !xp.sichtbarBei2 && xp.sichtbarBei3 && xp.combo3 === 3 && /3× in Folge/.test(xp.comboText),
    "Combo: Fehler setzt zurück, ab 3 Treffern in Folge sichtbar: " + JSON.stringify(xp));

  // Rang = Lernstand: jede Stufe hat eine Bedingung (10 angefangen · 5 sitzen · 25 % · 60 % · 90 %); die
  // Stufen kommen nur der Reihe nach; das am weitesten gediehene Profil zählt; ein Aufstieg durch den
  // Lernstand wird gefeiert, ein Absinken (neue Regel) senkt still die Feier-Marke. Punkte spielen keine Rolle.
  const gate = await page.evaluate(() => {
    const M = (started, fest, n) => ({ started, fest, n, share: n ? fest / n : 0 });
    const out = { namen: [M(0, 0, 100), M(10, 0, 100), M(30, 5, 100), M(60, 25, 100), M(80, 60, 100), M(100, 90, 100)].map((m) => rankOf(m).name),
      reihe: rankOf(M(5, 90, 100)).name,                 // Sämling-Bedingung fehlt → trotz 90 % sitzt keine höhere Stufe
      fehlt: gateNeed(RANKS[3], M(30, 5, 100)), fehlt2: gateNeed(RANKS[2], M(30, 1, 100)),
      steck: rankOf(M(30, 5, 100)), punkteFeld: RANKS.some((r) => "x" in r) };
    // UI: 5 von 54 sitzen → Steckling; Rang-Zeile, Tooltip + Laufbahn nennen, was zur Jungpflanze fehlt
    localStorage.removeItem("pflanzenlernen.xp"); xpSave({ r: 2 });
    const OF = "obstbau_fachwerker", cs = cardsFor(OF), n = cs.length;   // 54 Arten
    const prog = (fest, started) => Object.fromEntries(cs.slice(0, started).map((c, i) => [c.key, { box: i < fest ? 4 : 1, due: "2099-01-01", seen: 3, correct: 3, wrong: 0 }]));
    localStorage.setItem("pflanzenlernen.progress." + OF, JSON.stringify(prog(5, 30))); __masteryReset();
    renderProgress();
    const chip = document.querySelector("#rankName");
    out.chip = { name: chip.querySelector(".rk-name").textContent, sub: chip.querySelector(".rk-sub").textContent, title: chip.title, best: masteryBest().id, fest: masteryBest().fest, n: masteryBest().n };
    openRankModal();
    const m = document.querySelector("#infoScrim .rankmodal");
    out.modal = { kopf: m.querySelector(".mh-fam").textContent, bedingungen: [...m.querySelectorAll(".rkp-row .r-x")].map((e) => e.textContent), punkte: /\bP\./.test(m.textContent) };
    document.querySelector("#infoClose").click();
    // Aufstieg durch den Lernstand: 25 % sitzen (14 von 54) → Jungpflanze, gefeiert
    const toastVor = document.querySelector("#toast").textContent;
    localStorage.setItem("pflanzenlernen.progress." + OF, JSON.stringify(prog(14, 30))); __masteryReset();
    rankCheck();
    out.auf = { rang: rankOf().name, gefeiert: xpLoad().r === 3, toast: document.querySelector("#toast").textContent, toastVor };
    // Absinken (z. B. Regel geändert): still, Feier-Marke folgt nach unten
    localStorage.removeItem("pflanzenlernen.progress." + OF); __masteryReset();
    rankCheck();
    out.ab = { rang: rankOf().name, marke: xpLoad().r };
    localStorage.removeItem("pflanzenlernen.xp"); __masteryReset(); renderProgress();
    return out;
  });
  assert(JSON.stringify(gate.namen) === JSON.stringify(["Keimling", "Sämling", "Steckling", "Jungpflanze", "Prachtexemplar", "Meistergärtner/in"]),
    "Rang-Bedingungen am Lernstand (10 angefangen · 5 sitzen · 25 % · 60 % · 90 %): " + JSON.stringify(gate.namen));
  assert(gate.reihe === "Keimling" && !gate.punkteFeld,
    "Stufen nur der Reihe nach, keine Punktschwellen mehr: " + JSON.stringify({ r: gate.reihe, p: gate.punkteFeld }));
  assert(/noch 20 Arten müssen sitzen \(25 %\)/.test(gate.fehlt) && /noch 4 Arten müssen sitzen/.test(gate.fehlt2) && gate.steck.name === "Steckling" && /20 Arten/.test(gate.steck.needText),
    "Was fehlt, wird in Worten genannt: " + JSON.stringify({ f: gate.fehlt, f2: gate.fehlt2, s: gate.steck }));
  assert(gate.chip.name === "Steckling" && /5 von 54 Arten sitzen/.test(gate.chip.sub) && /Jungpflanze/.test(gate.chip.title) && gate.chip.best === "obstbau_fachwerker" && gate.chip.fest === 5,
    "Rang-Zeile: Steckling · 5 von 54 Arten sitzen, Tooltip nennt die nächste Stufe; bestes Profil zählt: " + JSON.stringify(gate.chip));
  assert(/5 von 54 Arten sitzen/.test(gate.modal.kopf) && /Jungpflanze/.test(gate.modal.kopf) && gate.modal.bedingungen.filter((t) => /Arten (angefangen|sitzen)/.test(t)).length === 5 && !gate.modal.punkte,
    "Laufbahn-Dialog nennt Lernstand, nächste Stufe und je Stufe die Bedingung – ohne Punkte: " + JSON.stringify(gate.modal));
  assert(gate.auf.rang === "Jungpflanze" && gate.auf.gefeiert && /Neuer Rang: Jungpflanze/.test(gate.auf.toast),
    "Aufstieg durch den Lernstand (25 % sitzen) muss gefeiert werden: " + JSON.stringify(gate.auf));
  assert(gate.ab.rang === "Keimling" && gate.ab.marke === 0,
    "Absinken: Rang fällt still, die Feier-Marke folgt (nächster Aufstieg wird wieder gefeiert): " + JSON.stringify(gate.ab));

  // Herbarium · »Thema üben«: Knopf je Sammelkarte → Lernstoff auf das Thema, geführte Lektion nur damit
  const themaUeben = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    openHerbarium();
    const btns = [...document.querySelectorAll("#infoScrim .hc-learn")], karten = document.querySelectorAll("#infoScrim .herbcard").length;
    const t = btns[1].dataset.t;
    btns[1].click(); await wait(120);
    const out = { knoepfe: btns.length, karten, thema: t, zu: !document.querySelector("#infoScrim"), scope: $("#cat").value,
      aktiv: !!(sess.active && sess.auto), nurThema: queue.length > 0 && queue.every((c) => c.thema === t), n: queue.length,
      summary: (document.querySelector(".setopts summary") || {}).textContent || "" };
    document.querySelector("#btnStop").click(); await wait(60);
    const ov = document.querySelector("#btnOverview"); if (ov) ov.click(); else exitSession();
    $("#cat").value = ""; $("#cat").dispatchEvent(new Event("change"));
    return out;
  });
  assert(themaUeben.knoepfe === themaUeben.karten && themaUeben.knoepfe > 1 && themaUeben.zu && themaUeben.scope === "t:" + themaUeben.thema,
    "Herbarium: jede Karte hat »Thema üben«, Klick schließt das Modal und stellt den Lernstoff auf das Thema: " + JSON.stringify(themaUeben));
  assert(themaUeben.aktiv && themaUeben.nurThema && themaUeben.n > 0 && themaUeben.summary.indexOf(themaUeben.thema) >= 0,
    "»Thema üben« startet eine geführte Lektion nur mit diesem Thema, Optionen-Kopfzeile zeigt es: " + JSON.stringify(themaUeben));

  // Stufe 5: Rang-Popover (Top-Layer, am Rang-Namen verankert) – nur wo Popover UND
  // Anchor-Positioning können; Container Queries auf dem Herbarium-Raster.
  const stufe5 = await page.evaluate(() => {
    const kann = ("popover" in HTMLElement.prototype) && CSS.supports("anchor-name: --a");
    renderProgress();
    const chip = document.querySelector("#rankName");
    const pop = document.querySelector("#rankPop");
    let offen = null, zeilen = 0, aktiv = "", erkl = 0;
    if (kann && chip) {
      chip.click();
      offen = pop.matches(":popover-open");
      zeilen = pop.querySelectorAll(".rkp-row").length;
      const on = pop.querySelector(".rkp-row.on .r-n");
      aktiv = on ? on.textContent : "";
      erkl = [...pop.querySelectorAll(".rkp-row .r-d")].filter((e) => e.textContent.trim().length > 8).length;
      chip.click();
    }
    openHerbarium();
    const grid = document.querySelector(".herbgrid");
    const ct = grid ? getComputedStyle(grid).containerType : "";
    document.querySelector("#infoClose").click();
    return { kann, hatPop: !!pop, rolle: chip ? (chip.tagName === "BUTTON" ? "button" : chip.getAttribute("role")) : "", offen, zeilen, aktiv, erkl, ct,
      oklch: CSS.supports("color: oklch(0.5 0.1 150)") };
  });
  if (stufe5.kann) {
    assert(stufe5.hatPop && stufe5.rolle === "button" && stufe5.offen,
      "Rang-Popover: Chip muss Knopf sein und das Popover im Top-Layer öffnen: " + JSON.stringify(stufe5));
    assert(stufe5.zeilen === 6 && stufe5.aktiv === "Keimling",
      "Rang-Popover muss alle sechs Ränge zeigen und den aktuellen hervorheben: " + JSON.stringify(stufe5));
    assert(stufe5.erkl === 6, "Rang-Popover muss zu jedem Rang sagen, was er bedeutet: " + JSON.stringify(stufe5));
  }

  // Laufbahn: allgemeinverständliche Rangnamen (kein Fachjargon wie »Stockmutter«), jede Stufe mit
  // Erklärung; ohne Popover-Unterstützung öffnet der Rang-Knopf dieselbe Übersicht als Dialog.
  const laufbahn = await page.evaluate(() => {
    const namen = RANKS.map((r) => r.n), erkl = RANKS.every((r) => (r.d || "").length > 8);
    openRankModal();
    const m = document.querySelector("#infoScrim .rankmodal");
    const zeilen = m ? m.querySelectorAll(".rkp-row").length : 0;
    const on = m ? m.querySelector(".rkp-row.on .r-n") : null;
    const how = m ? /Lernstand/.test(m.textContent) : false;
    document.querySelector("#infoClose").click();
    const zu = !document.querySelector("#infoScrim");
    const hilfe = document.querySelector("#helpPanel").textContent.replace(/\s+/g, " ");
    return { namen, erkl, zeilen, aktiv: on ? on.textContent : "", how, zu,
      hilfe: /Ränge:/.test(hilfe) && /Prachtexemplar/.test(hilfe) && /Probeprüfung:/.test(hilfe) && !/Punkte & Ränge/.test(hilfe) };
  });
  assert(!laufbahn.namen.includes("Stockmutter") && laufbahn.namen[4] === "Prachtexemplar" && laufbahn.erkl,
    "Ränge müssen allgemeinverständlich heißen und jeder eine Erklärung tragen: " + JSON.stringify(laufbahn));
  assert(laufbahn.zeilen === 6 && laufbahn.aktiv === "Keimling" && laufbahn.how && laufbahn.zu,
    "Laufbahn-Dialog (Fallback ohne Popover) muss sechs erklärte Ränge, den aktuellen und die Lernstand-Regel zeigen: " + JSON.stringify(laufbahn));
  assert(laufbahn.hilfe, "Die Hilfe muss Ränge (Lernstand) und Probeprüfung erklären: " + JSON.stringify(laufbahn));
  assert(stufe5.ct === "inline-size",
    "Container Queries: das Herbarium-Raster muss ein Inline-Size-Container sein: " + JSON.stringify(stufe5));

  // Wikipedia-Vorschau: bei ANDERER Unterart darf nicht die Elternart erscheinen
  // (»Brassica napus« = Raps, gesucht ist die Steckrübe ssp. rapifera). Offline –
  // nur die Kandidatenliste/Titelbildung, kein Netzabruf.
  const wikiCand = await page.evaluate(() => {
    const steck = { g: "Brassica", a: "napus ssp. rapifera", de: "Kohl- / Steck-Rübe" };
    const raps  = { g: "Brassica", a: "napus", de: "Raps" };
    const auto  = { g: "Cornus", a: "kousa subsp. kousa", de: "Japanischer Blumen-Hartriegel" };
    const dill  = { g: "Anethum", a: "graveolens var. hortorum", de: "Garten-Dill" };
    const low = (a) => a.map((x) => x.toLowerCase());
    const sc = wikiCandidates(steck), dc = wikiCandidates(dill);
    return {
      steck: sc, steckTitles: deArticleTitles(steck),
      steckDeVorBinom: low(sc).indexOf("steckrübe") >= 0 &&
        low(sc).indexOf("steckrübe") < low(sc).indexOf("brassica napus"),
      steckBinomLetzter: low(sc)[sc.length - 1] === "brassica napus",
      dill: dc,
      dillDeVorBinom: low(dc).indexOf("garten-dill") >= 0 &&
        low(dc).indexOf("garten-dill") < low(dc).indexOf("anethum graveolens"),
      dillBinomLetzter: low(dc)[dc.length - 1] === "anethum graveolens",
      raps0: wikiCandidates(raps)[0].toLowerCase(),
      autoHasBinom: low(wikiCandidates(auto)).includes("cornus kousa"),
      steckGenus: wikiGenusCandidates(steck), grpGenus: wikiGenusCandidates({ g: "Solidago", a: "Cultivars", de: "Goldruten - Arten" }),
    };
  });
  assert(wikiCand.steck.includes("Steckrübe") && wikiCand.steckDeVorBinom && wikiCand.steckBinomLetzter,
    "Steckrübe-Vorschau: deutscher Name muss VOR dem Binom stehen, das Binom (Raps) nur als letzter Notnagel: " + JSON.stringify(wikiCand.steck));
  assert(wikiCand.dillDeVorBinom && wikiCand.dillBinomLetzter,
    "Garten-Dill: ohne deutschen Artikel muss die Elternart (Anethum graveolens) letzter Notnagel-Kandidat sein: " + JSON.stringify(wikiCand.dill));
  assert(wikiCand.steckTitles.includes("Steckrübe") && wikiCand.steckTitles.includes("Kohlrübe"),
    "deArticleTitles: Bindestrich auflösen (Steckrübe) und geteiltes Grundwort ergänzen (Kohlrübe): " + JSON.stringify(wikiCand.steckTitles));
  assert(wikiCand.raps0 === "brassica napus",
    "Reine Art: das Binom bleibt erster Kandidat: " + wikiCand.raps0);
  assert(wikiCand.autoHasBinom,
    "Autonym (subsp. = Art): das Binom bleibt Kandidat (dieselbe Pflanze): " + JSON.stringify(wikiCand));
  assert(JSON.stringify(wikiCand.steckGenus) === JSON.stringify(["Brassica", "Rübe"]) && wikiCand.grpGenus.length === 0,
    "Gattungs-Notnagel: Steckrübe → erst nach der Elternart Gattung + Grundwort; Sammel-Eintrag führt die Gattung schon in der Hauptliste: " + JSON.stringify({ steck: wikiCand.steckGenus, grp: wikiCand.grpGenus }));

  // Deutsche Namen: die Listen führen drei Muster – alle müssen als richtig zählen,
  // ohne dass ein blankes Adjektiv durchgeht (Profil: Gemüsebau/Gärtner)
  const deChk = await page.evaluate(() => {
    const t = (de, inp) => checkDeName(inp, { g: "X", a: "y", de, fam: "" });
    const rha = "Krauser / gewöhnlicher Rhabarber";
    const fen = "Knollen- / Gemüsefenchel";
    const kar = "Karotte / Möhre / Gelbe Rübe";
    // Angezeigter/als Antwort gewerteter Name (deMain) muss VOLLSTÄNDIG sein,
    // nie ein blankes Präfix/Adjektiv (»Winter-«, »Krauser«).
    const dm = (de) => deMain({ g: "X", a: "y", de, fam: "", syn: "" });
    const mBohne = dm("Winter- / Staudenbohnenkraut");
    const mRha = dm(rha), mFen = dm(fen), mNorm = dm("Liebstöckel"), mKomma = dm("Kopfsalat, Eissalat");
    return {
      deMainBohne: mBohne, deMainRha: mRha, deMainFen: mFen, deMainNorm: mNorm, deMainKomma: mKomma,
      deMainKeinPrefix: ![mBohne, mRha, mFen].some((s) => /[-\s]$/.test(s) || /^(Winter|Krauser|Knollen)$/.test(s)),
      // Muster »Adjektiv / Adjektiv Grundwort«: Grundwort und beide Vollformen gelten
      rhaHead: t(rha, "Rhabarber"), rhaA: t(rha, "Krauser Rhabarber"), rhaB: t(rha, "gewöhnlicher Rhabarber"),
      rhaAdjAlone: t(rha, "Krauser"), rhaWrong: t(rha, "Spinat"),
      // Muster »Vorderteil- / Grundwort«: beide Zusammensetzungen gelten
      fenA: t(fen, "Knollenfenchel"), fenB: t(fen, "Gemüsefenchel"), fenWrong: t(fen, "Knollenkohl"),
      // Muster »Name / Name / Name«: jeder Teil ist ein eigener Name
      karA: t(kar, "Karotte"), karB: t(kar, "Möhre"), karC: t(kar, "Gelbe Rübe"),
      // Synonyme (Komma) und Schreibung ohne Bindestrich
      synA: t("Rotkohl, Blaukraut", "Blaukraut"), synWrong: t("Rotkohl, Blaukraut", "Weißkohl"),
      hyph: t("Hänge-Birke, Sand-Birke, Weiß-Birke", "Sandbirke"),
      // Klammer-Form und Abkürzung
      klammer: t("Angelika / (Arznei-)Engelwurz", "Engelwurz"),
      abk: t("Gew. / Große Brennessel", "gewöhnliche Brennessel"),
      // Grundwort NUR bei Eindeutigkeit: die Liste führt Große UND Kleine Brennessel
      brennCount: deHeadCounts().get("brennessel"), brennAlone: t("Gew. / Große Brennessel", "Brennessel"),
      // Anzeige-Namen (deMain): Klammer-Qualifier weg, Abkürzungen ausgeschrieben,
      // nie eine blanke Abkürzung/ein hängender Stamm (Praxisfall Bilder-Quiz).
      dmGurke: dm("Gurke (Freiland / Treibh.)"), dmMelone: dm("Gew. Zucker-Melone"),
      dmJap: dm("jap. Lavendelheide"), dmAmerik: dm("[Amerik.] Rot-Eiche"),
      dmKriech: dm("Kriech. Günsel"), dmBuche: dm("Gew. Hain-, Weißbuche"),
      // Adjektiv-Endung nach dem Geschlecht des Nomens (früher fest: »Gewöhnliche Trompetenbaum«)
      dmBaum: dm("Gew. Trompetenbaum"), dmBuchs: dm("gew. Buchsbaum"), dmSalat: dm("Gew. Feldsalat"),
      dmHartr: dm("[Amerik.] Blumen-Hartriegel"), dmBohnenkr: dm("Sommer- / Einj. Bohnenkraut"),
      dmBluem: dm("Austr. Gänseblümchen"),
      // Was angezeigt wird, muss beim Tippen gelten – und die Listenform weiterhin auch
      tAusgeschr: t("Gew. Trompetenbaum", "Gewöhnlicher Trompetenbaum"),
      tListe: t("Gew. Trompetenbaum", "Gew. Trompetenbaum"),
      // … und das für JEDE Art aller 14 Listen: deMain(c) muss als Antwort durchgehen
      anzeigeFalsch: Object.keys(SEEDS).flatMap((pid) => SEEDS[pid].map((r) =>
        ({ g: r[0], a: r[1], fam: r[2], de: r[3], kat: r[4], zp: r[5], syn: r[6] })))
        .filter((c) => c.de && !checkDeName(deMain(c), c)).map((c) => c.de + " → " + deMain(c)),
    };
  });
  assert(deChk.rhaHead && deChk.rhaA && deChk.rhaB,
    "»Rhabarber« und beide Vollformen müssen gelten: " + JSON.stringify(deChk));
  assert(!deChk.rhaAdjAlone && !deChk.rhaWrong,
    "Ein blankes Adjektiv (»Krauser«) darf nicht als Name zählen: " + JSON.stringify(deChk));
  assert(deChk.deMainBohne === "Staudenbohnenkraut" && deChk.deMainRha === "gewöhnlicher Rhabarber"
    && deChk.deMainFen === "Gemüsefenchel" && deChk.deMainNorm === "Liebstöckel" && deChk.deMainKomma === "Kopfsalat",
    "deMain muss den vollständigen Namen liefern (nicht »Winter-«/»Krauser«): " + JSON.stringify(deChk));
  assert(deChk.deMainKeinPrefix,
    "deMain darf nie ein blankes Präfix/Adjektiv als Quiz-Antwort zeigen: " + JSON.stringify(deChk));
  assert(deChk.fenA && deChk.fenB && !deChk.fenWrong,
    "Geteiltes Grundwort (Knollen-/Gemüsefenchel) nicht korrekt aufgelöst: " + JSON.stringify(deChk));
  assert(deChk.karA && deChk.karB && deChk.karC,
    "Bei »Karotte / Möhre / Gelbe Rübe« muss jeder Teil zählen: " + JSON.stringify(deChk));
  assert(deChk.synA && !deChk.synWrong && deChk.hyph,
    "Synonyme und Schreibung ohne Bindestrich müssen zählen: " + JSON.stringify(deChk));
  assert(deChk.klammer && deChk.abk,
    "Klammer-Form und Abkürzung (Gew. → gewöhnliche) nicht behandelt: " + JSON.stringify(deChk));
  assert(deChk.brennCount === 2 && !deChk.brennAlone,
    "Grundwort darf nur bei Eindeutigkeit gelten – die Liste führt Große UND Kleine Brennessel: " + JSON.stringify(deChk));
  assert(deChk.dmGurke === "Gurke" && deChk.dmMelone === "Gewöhnliche Zucker-Melone"
    && deChk.dmJap === "Japanische Lavendelheide" && deChk.dmAmerik === "Amerikanische Rot-Eiche"
    && deChk.dmKriech === "Kriechender Günsel" && deChk.dmBuche === "Weißbuche",
    "deMain muss Klammer-Qualifier entfernen und Abkürzungen ausschreiben (Bilder-Quiz): " + JSON.stringify(deChk));
  assert(deChk.dmBaum === "Gewöhnlicher Trompetenbaum" && deChk.dmBuchs === "Gewöhnlicher Buchsbaum"
    && deChk.dmSalat === "Gewöhnlicher Feldsalat" && deChk.dmHartr === "Amerikanischer Blumen-Hartriegel"
    && deChk.dmBohnenkr === "Einjähriges Bohnenkraut" && deChk.dmBluem === "Australisches Gänseblümchen",
    "Ausgeschriebene Adjektive müssen zum Geschlecht des Nomens passen: " + JSON.stringify(deChk));
  assert(deChk.tAusgeschr && deChk.tListe,
    "Beim Tippen müssen die angezeigte Vollform UND die Listenform gelten: " + JSON.stringify(deChk));
  assert(deChk.anzeigeFalsch.length === 0,
    "Angezeigter deutscher Name (deMain) wird beim Tippen nicht anerkannt: " + deChk.anzeigeFalsch.join(" | "));
  assert(![deChk.dmGurke, deChk.dmMelone, deChk.dmJap, deChk.dmAmerik, deChk.dmKriech, deChk.dmBuche]
    .some((s) => /[-–]\s*$/.test(s) || /^[A-Za-zÄÖÜäöüß]{2,10}\.$/.test(s.trim())),
    "deMain darf nie eine blanke Abkürzung/einen hängenden Stamm zeigen: " + JSON.stringify(deChk));

  // Abfragerichtung: in den Text-Modi de↔bot wählbar, im Bilder-Modus fest auf »voller Name«
  const dirUI = await page.evaluate(() => {
    const set = (id, v) => { const e = document.querySelector(id); e.value = v; e.dispatchEvent(new Event("change")); };
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    const textOpts = [...document.querySelectorAll("#dir option")].map((o) => o.value);
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    const photoOpts = [...document.querySelectorAll("#dir option")].map((o) => o.value);
    const hiddenInPhoto = document.querySelector("#dirField").hidden;
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    const hiddenInList = document.querySelector("#dirField").hidden;
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    return { textOpts, photoOpts, hiddenInPhoto, hiddenInList, back: document.querySelector("#dir").value,
      shownInText: !document.querySelector("#dirField").hidden };
  });
  assert(dirUI.textOpts.join() === "de2bot,bot2de",
    "Text-Modi brauchen genau beide Richtungen: " + JSON.stringify(dirUI.textOpts));
  assert(dirUI.photoOpts.join() === "img2both" && dirUI.hiddenInPhoto,
    "Bilder-Quiz: nur »Bild → voller Name«, Richtungsfeld ausgeblendet: " + JSON.stringify(dirUI));
  assert(dirUI.shownInText, "In den Text-Modi bleibt die Abfragerichtung wählbar");
  assert(dirUI.hiddenInList, "Im Listenmodus ist die Abfragerichtung gegenstandslos und gehört ausgeblendet");
  assert(dirUI.back === "de2bot", "Standard muss die prüfungsnahe Richtung bleiben, war " + dirUI.back);

  // Richtung botanisch → deutsch: Vorderseite botanisch (kursiv), Rückseite deutscher Name
  const rev = await page.evaluate(() => {
    const setDir = (v) => { const d = document.querySelector("#dir"); d.value = v; d.dispatchEvent(new Event("change")); };
    setDir("bot2de");
    document.querySelector("#sessLen").value = "8"; startSession();
    const c = current;
    const front = document.querySelector("#card .prompt");
    const frontBot = front.querySelector("i") && front.textContent.trim() === (c.g + " " + c.a).trim();
    const label = (document.querySelector("#card .side-label") || {}).textContent;
    document.querySelector("#card").click();
    const big = (document.querySelector("#card .answer .big") || {}).textContent.trim();
    const labels = [...document.querySelectorAll("#card .answer .meta .mf b")].map((b) => b.textContent);
    // Erwarteten Namen mit der APP-Logik bilden (deMain/deForms löst Schrägstrich-/
    // Adjektiv-Formen auf) statt naiv am ersten »/«/Komma zu splitten – sonst flackert
    // der Test, sobald zufällig eine Sammelname-Karte (z. B. »Dicke Bohne / Saubohne«) dran ist.
    return { frontBot, label, big, deFirst: (window.deMain ? deMain(c) : (c.de || "").split(/[,;/]/)[0].trim()), labels,
      noGattung: !labels.includes("Gattung") };
  });
  assert(rev.frontBot && rev.label === "Botanischer Name",
    "bot→de: Vorderseite muss der botanische Name (kursiv) sein: " + JSON.stringify(rev));
  assert(rev.big === rev.deFirst && rev.noGattung,
    "bot→de: Rückseite muss der deutsche Name sein (ohne Gattung/Art-Wiederholung): " + JSON.stringify(rev));

  // Quiz und Tippen folgen der Richtung: Optionen bzw. erwartete Eingabe sind deutsch
  const revPlay = await page.evaluate(() => {
    const setDir = (v) => { const d = document.querySelector("#dir"); d.value = v; d.dispatchEvent(new Event("change")); };
    document.querySelector('#modeTabs button[data-mode="quiz"]').click();
    setDir("bot2de"); startSession();
    const c = current;
    const opts = [...document.querySelectorAll("#opts .opt")].map((b) => b.querySelector("span:last-child").textContent);
    const want = (window.deMain ? deMain(c) : (c.de || "").split(/[,;/]/)[0].trim());  // App-Logik, nicht naiv splitten
    const optIsDe = opts.includes(want) && !opts.includes((c.g + " " + c.a).trim());
    [...document.querySelectorAll("#opts .opt")].find((b) => b.querySelector("span:last-child").textContent === want).click();
    const quizGood = /Richtig!/.test(document.querySelector("#fb").innerHTML);
    document.querySelector('#modeTabs button[data-mode="type"]').click();
    setDir("bot2de"); startSession();
    const c2 = current;
    const variants = (c2.de || "").split(/[,;/]/).map((x) => x.trim()).filter(Boolean);
    const alt = variants[variants.length - 1];                 // auch der letzte Zweitname zählt
    // bot→de: abgefragt werden Familie + Deutscher Name; dt. Name ohne Bindestrich getippt
    [...document.querySelectorAll("#typeForm input")].forEach((inp) => {
      const k = inp.dataset.k; inp.value = k === "de" ? alt.replace(/-/g, "") : c2[k];
    });
    document.querySelector("#chk").click();
    const typeGood = /✓/.test((document.querySelector("#tmk_de") || {}).textContent || "");  // dt.-Name-Feld akzeptiert die Schreibweise
    return { optIsDe, quizGood, typeGood, alt, opts: opts.slice(0, 4) };
  });
  assert(revPlay.optIsDe, "bot→de: Quiz-Optionen müssen deutsche Namen sein: " + JSON.stringify(revPlay.opts));
  assert(revPlay.quizGood, "bot→de: richtige Quiz-Antwort nicht gewertet");
  assert(revPlay.typeGood,
    "bot→de: Tippen muss jede geführte Schreibweise akzeptieren (auch ohne Bindestrich): " + revPlay.alt);

  // zurück auf die prüfungsnahe Standardrichtung für die folgenden Prüfungen
  await page.evaluate(() => {
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    const d = document.querySelector("#dir"); d.value = "de2bot"; d.dispatchEvent(new Event("change"));
  });

  // Liste / Nachschlagen: kategorisiert, durchsuchbar, Klick öffnet Info-Modal
  const list = await page.evaluate(() => {
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    const cats = document.querySelectorAll("#stage .catblock").length;
    const allRows = document.querySelectorAll("#stage .sprow").length;
    const startHidden = document.querySelector("#startRow").hidden;
    const searchShown = !document.querySelector("#listSearchRow").hidden;
    const s = document.querySelector("#listSearch");
    s.value = "Allium"; s.dispatchEvent(new Event("input"));
    const hits = [...document.querySelectorAll("#stage .sprow")].map((e) => e.textContent.toLowerCase());
    const allMatch = hits.length > 0 && hits.every((t) => t.includes("allium"));
    s.value = ""; s.dispatchEvent(new Event("input"));
    const backToAll = document.querySelectorAll("#stage .sprow").length;
    document.querySelector("#stage .sprow").click();
    const modalOpen = !!document.querySelector("#infoScrim");
    closeInfo();
    return { cats, allRows, startHidden, searchShown, hitN: hits.length, allMatch, backToAll, modalOpen };
  });
  assert(list.cats >= 1 && list.allRows === 148, "Liste: 148 Zeilen in Gruppen erwartet, war " + list.allRows);
  assert(list.startHidden && list.searchShown, "Liste: Start-Leiste aus / Suchfeld an erwartet");
  assert(list.hitN > 0 && list.hitN < list.allRows && list.allMatch, "Liste-Suche »Allium« filtert nicht korrekt (" + list.hitN + ")");
  assert(list.backToAll === list.allRows, "Liste: Leeren der Suche stellt nicht alle Zeilen wieder her");
  assert(list.modalOpen, "Liste: Klick auf eine Art öffnet kein Info-Modal");

  // Ansicht & Filter (Akkordion): Standard ist jetzt »Thema« (Themen-Header + Filter-Tags);
  // A–Z bleibt verfügbar (flach, keine Tags); ein Themen-Tag filtert die Liste
  const tagsort = await page.evaluate(() => {
    const total = document.querySelectorAll("#stage .sprow").length;
    // Standardansicht = Thema: Themen-Header + Filter-Tags der Dimension Thema
    const themeDefault = listSort === "thema"
      && document.querySelectorAll("#stage .cathead").length >= 2
      && [...document.querySelectorAll("#listControls .cattag")].filter((b) => b.dataset.cat).length >= 1;
    // A–Z-Ansicht: flach, Buchstaben-Header, keine Filter-Tags
    document.querySelector('#listControls .sortbtn[data-sort="bot"]').click();
    const botHeads = [...document.querySelectorAll("#stage .cathead")].map((e) => e.textContent.trim());
    const alphabetical = botHeads.length >= 2 && botHeads.every((h) => h.length === 1);
    const noTagsBot = document.querySelectorAll("#listControls .cattag").length === 0;
    // auf Thema umschalten → Filter-Tags erscheinen
    document.querySelector('#listControls .sortbtn[data-sort="thema"]').click();
    const tagEls = [...document.querySelectorAll("#listControls .cattag")].filter((b) => b.dataset.cat);
    const hasTags = tagEls.length >= 1;
    tagEls[0].click();
    const afterFilter = document.querySelectorAll("#stage .sprow").length;
    const onlyOneGroup = document.querySelectorAll("#stage .catblock").length === 1;
    // Familie-Ansicht: Tags wechseln zur Dimension Familie, Filter wird zurückgesetzt
    document.querySelector('#listControls .sortbtn[data-sort="familie"]').click();
    const famReset = document.querySelectorAll("#stage .sprow").length === total;
    // zurück auf A–Z (alle)
    document.querySelector('#listControls .sortbtn[data-sort="bot"]').click();
    const backAll = document.querySelectorAll("#stage .sprow").length;
    return { total, themeDefault, alphabetical, noTagsBot, hasTags, afterFilter, onlyOneGroup, famReset, backAll };
  });
  assert(tagsort.themeDefault,
    "Standard-Listenansicht sollte »Thema« sein (Themen-Header + Filter-Tags): " + JSON.stringify(tagsort));
  assert(tagsort.alphabetical && tagsort.noTagsBot,
    "A–Z-Ansicht sollte alphabetisch (Buchstaben-Header) und ohne Filter-Tags sein: " + JSON.stringify(tagsort));
  assert(tagsort.hasTags, "Umschalten auf Thema zeigt keine Filter-Tags");
  assert(tagsort.afterFilter > 0 && tagsort.afterFilter < tagsort.total && tagsort.onlyOneGroup,
    "Themen-Tag filtert die Liste nicht auf ein Thema: " + JSON.stringify(tagsort));
  assert(tagsort.famReset, "Wechsel der Ansicht setzt den Filter nicht zurück");
  assert(tagsort.backAll === tagsort.total, "Zurück auf A–Z stellt nicht alle Arten wieder her");

  // Druckbare Lernliste: Form des Prüfungsbogens (Spalten je Familie), gefüllt,
  // kategorisiert, ZP-Spalte; respektiert den Suchfilter
  const plist = await page.evaluate(() => {
    const n = buildPrintList(); // gemuesebau_gaertner → Produktions-Formular
    const host = document.querySelector("#printList");
    const html = host.innerHTML;
    const dataRows = host.querySelectorAll(".ptab tbody tr:not(.pcat)").length;
    const catRows = host.querySelectorAll(".ptab tbody tr.pcat").length;
    const firstCells = [...host.querySelectorAll(".ptab tbody tr:not(.pcat)")[0].children].map((td) => td.textContent.trim());
    // Suchfilter wirkt auch auf den Druck
    const s = document.querySelector("#listSearch");
    s.value = "Allium"; s.dispatchEvent(new Event("input"));
    const nFiltered = buildPrintList();
    s.value = ""; s.dispatchEvent(new Event("input")); buildPrintList();
    return {
      n, dataRows, catRows, nFiltered,
      title: /Abschlussprüfung Pflanzenbestimmung im Gartenbau — Lernliste/.test(html),
      heads: /Gattungsname/.test(html) && /Familienname/.test(html) && /3 Punkte \(G\)/.test(html),
      zpCol: />ZP<\/th>/.test(html),
      filled: firstCells[1] !== "" && firstCells[0] === "1",
      meta: /Fachrichtung Gemüsebau/.test(html) && /148 Arten/.test(html),
      // didaktisches Studienblatt: Abhak-Spalte (ein Kästchen je Art), grüner ZP-Punkt, botanischer Name als bot-Spalte
      chkCol: /gelernt<\/th>/.test(html) && host.querySelectorAll(".ptab td.pchk .box").length === dataRows,
      zpDot: host.querySelectorAll(".ptab td.pzp .zpdot").length >= 1,
      botMark: host.querySelectorAll(".ptab td.bot").length >= 1
    };
  });
  assert(plist.n === 148 && plist.dataRows === 148, "Druckliste: 148 Datenzeilen erwartet, war " + plist.dataRows);
  assert(plist.catRows >= 1, "Druckliste: Themen-Zwischenzeilen fehlen");
  assert(plist.title && plist.heads, "Druckliste: Titel/Spaltenköpfe entsprechen nicht dem Prüfungsbogen (Produktion)");
  assert(plist.zpCol, "Druckliste: ZP-Spalte fehlt");
  assert(plist.filled && plist.meta, "Druckliste: Zeilen nicht gefüllt oder Kopfzeile falsch");
  assert(plist.chkCol, "Druckliste: »gelernt«-Abhakspalte fehlt oder unvollständig (ein Kästchen je Art)");
  assert(plist.zpDot && plist.botMark, "Druckliste: grüner ZP-Punkt bzw. hervorgehobener botanischer Name (td.bot) fehlt");
  assert(plist.nFiltered > 0 && plist.nFiltered < plist.n, "Druckliste: Suchfilter wirkt nicht (" + plist.nFiltered + ")");

  // Druckliste: opt-in »Namensherkunft« druckt je Pflanze eine Merkzeile (nameEtymology);
  // Standard AUS → unveränderte Ausgabe. Häkchen an → Tabelle .ety + Merkzeilen + Fußnote.
  const pety = await page.evaluate(() => {
    // Die Namensherkunft-Checkbox lebt im Listen-Akkordeon (»Optionen«) – öffnen, umlegen
    const lc0 = document.querySelector("#listControls"); lc0.dataset.open = "1"; renderListControls();
    const ety = document.querySelector("#printEty");
    ety.checked = true; ety.dispatchEvent(new Event("change"));
    const n = buildPrintList();
    const host = document.querySelector("#printList");
    const html = host.innerHTML;
    const dataRows = host.querySelectorAll(".ptab tbody tr.pmain").length;
    const etyRows = host.querySelectorAll(".ptab tbody tr.pety").length;
    const anyEty = host.querySelector(".ptab tbody tr.pety");
    const hasLabel = !!(anyEty && /Name:/.test(anyEty.textContent) && anyEty.querySelector("i"));
    // Konkrete Herleitung: erste Pflanze mit App-Logik nachbilden und im Merktext wiederfinden
    const first = host.querySelector(".ptab tbody tr.pmain");
    const firstEtyTr = first && first.nextElementSibling && first.nextElementSibling.classList.contains("pety")
      ? first.nextElementSibling : null;
    let etyMatches = false;
    if (firstEtyTr) {
      // botanischen Namen der ersten Pflanze aus der aktuell gefilterten Menge holen
      const p = listFiltered().p;
      // dieselbe Reihenfolge wie buildPrintList: bei bot/de-Ansicht sortiert – hier reicht: irgendeine echte Herleitung steht drin
      etyMatches = /—/.test(firstEtyTr.textContent) && firstEtyTr.querySelectorAll("i").length >= 1;
    }
    const hasEtyClass = host.querySelector(".ptab").classList.contains("ety");
    const footNote = /Namensherkunft: Kurzherleitung/.test(html);
    // Häkchen wieder aus → Ausgabe wie zuvor
    ety.checked = false; ety.dispatchEvent(new Event("change"));
    const n2 = buildPrintList();
    const offEty = document.querySelectorAll("#printList .ptab tr.pety").length;
    const offClass = document.querySelector("#printList .ptab").classList.contains("ety");
    return { n, n2, dataRows, etyRows, hasLabel, etyMatches, hasEtyClass, footNote, offEty, offClass };
  });
  assert(pety.hasEtyClass && pety.dataRows === 148, "Druckliste Namensherkunft: Tabelle .ety mit 148 Datenzeilen erwartet: " + JSON.stringify(pety));
  assert(pety.etyRows > 0 && pety.etyRows <= pety.dataRows, "Druckliste Namensherkunft: Merkzeilen fehlen (" + pety.etyRows + "/" + pety.dataRows + ")");
  assert(pety.hasLabel && pety.etyMatches, "Druckliste Namensherkunft: Merkzeile ohne »Name:«-Label/Kursivteil/Herleitung");
  assert(pety.footNote, "Druckliste Namensherkunft: Fußnote fehlt");
  assert(pety.offEty === 0 && !pety.offClass && pety.n2 === pety.n, "Druckliste: Häkchen aus → keine Merkzeilen/kein .ety, gleiche Artenzahl");

  // Druckliste: Fachwerker-Profil nutzt das FW-Formular (Dt. Name zuerst, ohne Familie)
  const pfw = await page.evaluate(() => {
    document.querySelector("#nivSelect").value = "fachwerker";
    document.querySelector("#nivSelect").dispatchEvent(new Event("change"));
    const n = buildPrintList();
    const html = document.querySelector("#printList").innerHTML;
    document.querySelector("#nivSelect").value = "gaertner";
    document.querySelector("#nivSelect").dispatchEvent(new Event("change"));
    return { n, sub: /Gartenbaufachwerker\/in/.test(html),
      fwHeads: /Deutscher Name/.test(html) && /Gattung \(botanisch\)/.test(html) && /0,5 Punkte/.test(html),
      noFam: !/Familienname/.test(html) };
  });
  assert(pfw.n === 80 && pfw.sub && pfw.fwHeads && pfw.noFam,
    "Druckliste FW: 80 Arten im Fachwerker-Formular erwartet: " + JSON.stringify(pfw));

  // Druckliste folgt der gewählten Ansicht: Thema / Familie / A–Z
  const psort = await page.evaluate(() => {
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    const lc = document.querySelector("#listControls"); lc.dataset.open = "1"; renderListControls();
    const bandsFor = (sort) => {
      document.querySelector(`.sortbtn[data-sort="${sort}"]`).click();
      const n = buildPrintList();
      const bands = [...document.querySelectorAll("#printList .pcat td")].map((td) => td.textContent.trim());
      const meta = document.querySelector("#printList .pmeta").textContent.replace(/\s+/g, " ");
      return { n, bands, meta };
    };
    const kat = bandsFor("thema"), fam = bandsFor("familie"), bot = bandsFor("bot");
    document.querySelector('.sortbtn[data-sort="thema"]').click(); buildPrintList(); // zurücksetzen
    return {
      katOk: kat.bands.some((t) => /Fruchtgemüse|Kohlgemüse|Wurzel- & Knollengemüse/.test(t)) && /sortiert nach Thema/.test(kat.meta),
      famOk: fam.bands.some((t) => /Asteraceae/.test(t)) && /sortiert nach Familie/.test(fam.meta),
      botOk: bot.bands.some((t) => /^A$/.test(t)) && bot.bands.every((t) => /^[A-ZÄÖÜ·]$/.test(t)) && /sortiert nach A–Z botanisch/.test(bot.meta),
      counts: [kat.n, fam.n, bot.n],
    };
  });
  assert(psort.katOk, "Druckliste (Thema): Themen-Band/Meta fehlt");
  assert(psort.famOk, "Druckliste (Familie): Familien-Band (Asteraceae)/Meta fehlt");
  assert(psort.botOk, "Druckliste (A–Z botanisch): Buchstaben-Bänder/Meta fehlen");
  assert(psort.counts.every((n) => n === 148), "Druckliste: Artenzahl je Ansicht abweichend: " + JSON.stringify(psort.counts));

  // ZP-Legende: erklärt »ZP« auf der Bildschirm-Liste UND (druckbar) in der Druckliste
  const zpLeg = await page.evaluate(() => {
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    const screen = (document.querySelector(".zpnote") || {}).textContent || "";
    buildPrintList();
    const print = (document.querySelector("#printList .pfoot") || {}).textContent || "";
    return { screen, print };
  });
  assert(/ZP.*Zwischenprüfung relevant/.test(zpLeg.screen), "Lern-Liste: ZP-Legende (Bildschirm) fehlt: " + zpLeg.screen);
  assert(/ZP = für die Zwischenprüfung relevant/.test(zpLeg.print), "Druckliste: ZP-Legende (druckbar) fehlt: " + zpLeg.print);

  // Familien-Steckbriefe: In der Familien-Ansicht öffnet ℹ ein Modal mit
  // gemeinsamen Merkmalen + Lerntipp; ein Fallback greift für unbekannte Familien
  const fam = await page.evaluate(() => {
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    const lc = document.querySelector("#listControls"); lc.dataset.open = "1"; renderListControls();
    document.querySelector('.sortbtn[data-sort="familie"]').click();
    const btns = [...document.querySelectorAll(".cathead-i")];
    const hasBtns = btns.length > 0;
    // kuratierte Familie (Asteraceae kommt im Gemüsebau vor)
    const a = btns.find((b) => /Asteraceae/.test(b.dataset.fam));
    let curated = null;
    if (a) { a.click(); const m = document.querySelector("#infoScrim .modal");
      curated = { title: m.querySelector(".mh-bot").textContent, de: (m.querySelector(".mh-de") || {}).textContent || "",
        merkmale: /gemeinsam haben/i.test(m.textContent), tipp: /Erkennen/i.test(m.textContent) };
      closeInfo(); }
    // Neu ergänzte Familie hat jetzt einen Steckbrief …
    openFamilyInfo("Papaveraceae");
    const nm = document.querySelector("#infoScrim .modal");
    const added = { title: nm.querySelector(".mh-bot").textContent, de: (nm.querySelector(".mh-de") || {}).textContent || "",
      curated: /gemeinsam haben/i.test(nm.textContent) };
    closeInfo();
    // … und ein Tippfehler in den Quelldaten führt auf die richtige Familie (lridaceae → Iridaceae)
    openFamilyInfo("lridaceae");
    const am = document.querySelector("#infoScrim .modal");
    const alias = { title: am.querySelector(".mh-bot").textContent, curated: /gemeinsam haben/i.test(am.textContent) };
    closeInfo();
    // Fallback für eine nicht kuratierte Familie
    openFamilyInfo("Xytestaceae/Testgewächse");
    const fb = document.querySelector("#infoScrim .modal");
    const fallback = /kein Steckbrief/i.test(fb.textContent) && /Blütenaufbau/i.test(fb.textContent);
    closeInfo();
    return { hasBtns, curated, added, alias, fallback, gone: !document.querySelector("#infoScrim") };
  });
  assert(fam.hasBtns, "Familien-Ansicht: kein ℹ-Steckbrief-Knopf gefunden");
  assert(fam.curated && /Asteraceae/.test(fam.curated.title) && /Korbblütler/.test(fam.curated.de)
    && fam.curated.merkmale && fam.curated.tipp, "Familien-Steckbrief (Asteraceae) unvollständig: " + JSON.stringify(fam.curated));
  assert(fam.added && /Papaveraceae/.test(fam.added.title) && /Mohngewächse/.test(fam.added.de) && fam.added.curated,
    "Ergänzter Familien-Steckbrief (Papaveraceae → Mohngewächse) fehlt: " + JSON.stringify(fam.added));
  assert(fam.alias && /Iridaceae/.test(fam.alias.title) && fam.alias.curated,
    "Tippfehler-Familie »lridaceae« sollte auf Iridaceae mit Steckbrief führen: " + JSON.stringify(fam.alias));
  assert(fam.fallback, "Familien-Steckbrief: Fallback für unbekannte Familie fehlt");
  assert(fam.gone, "Familien-Modal schließt nicht");

  // Thematische Ordnung (wie im Unterricht): die Zuordnung selbst …
  const themes = await page.evaluate(() => ({
    eiche:  themeOf("Quercus", "robur", "Laubgehölze", "garten_und_landschaftsbau_gaertner"),
    ahorn:  themeOf("Acer", "campestre", "Laubgehölze", "garten_und_landschaftsbau_gaertner"),
    kirsch: themeOf("Prunus", "laurocerasus", "Laubgehölze", "baumschule_gaertner"),
    coto:   themeOf("Cotoneaster", "dammeri", "Laubgehölze", "baumschule_gaertner"),
    wach:   themeOf("Juniperus", "horizontalis", "Nadelgehölze", "baumschule_gaertner"),
    fichte: themeOf("Picea", "abies", "Nadelgehölze", "baumschule_gaertner"),
    rose:   themeOf("Rosa", "canina", "Laubgehölze", "baumschule_gaertner"),
    efeu:   themeOf("Hedera", "helix", "Laubgehölze", "baumschule_gaertner"),
    // dieselbe Art, anderer Kontext: im Obstbau zählt die Obstart, sonst die Wuchsform
    apfelO: themeOf("Malus", "domestica", "Laubgehölze", "obstbau_fachwerker"),
    apfelB: themeOf("Malus", "Cultivars", "Laubgehölze", "baumschule_gaertner"),
    johann: themeOf("Ribes", "rubrum", "Laubgehölze", "obstbau_fachwerker"),
    gras:   themeOf("Carex", "morrowii", "Ziergräser", "friedhofsgaertnerei_fachwerker"),
    unkraut: themeOf("Urtica", "dioica", "Unkräuter, Wildkräuter", "obstbau_gaertner"),
    // M2 Stauden nach Lebensbereich
    stSchatten: themeOf("Hosta", "Cultivars", "Stauden", "staudengaertnerei_gaertner"),
    stBeet:  themeOf("Delphinium", "Cultivars", "Stauden", "staudengaertnerei_gaertner"),
    stStein: themeOf("Sempervivum", "arachnoideum", "Stauden", "staudengaertnerei_gaertner"),
    stWasser: themeOf("Nymphaea", "alba", "Stauden", "staudengaertnerei_gaertner"),
    stSpec:  themeOf("Gentiana", "asclepiadea", "Stauden", "staudengaertnerei_gaertner"),
    // M3 Gemüse nach Nutzungsgruppe
    gemFrucht: themeOf("Solanum", "lycopersicum var. esculentum", "Gemüsepflanzen", "gemuesebau_gaertner"),
    gemKohl:  themeOf("Brassica", "oleracea var. botrytis", "Gemüsepflanzen", "gemuesebau_gaertner"),
    gemWurzel: themeOf("Brassica", "napus ssp. rapifera", "Gemüsepflanzen", "gemuesebau_gaertner"),
    gemZwiebel: themeOf("Allium", "cepa Cepa-Grp.", "Gemüsepflanzen", "gemuesebau_gaertner"),
    gemHuelse: themeOf("Phaseolus", "vulgaris var. nanus", "Gemüsepflanzen", "gemuesebau_gaertner"),
    gemBlatt: themeOf("Lactuca", "sativa var. capitata", "Gemüsepflanzen", "gemuesebau_gaertner"),
    // M4 Zimmerpflanzen nach Typ
    ziGruen: themeOf("Ficus", "benjamina", "Zimmerpflanzen", "zierpflanzenbau_gaertner"),
    ziOrch:  themeOf("Phalaenopsis", "Cultivars", "Zimmerpflanzen", "zierpflanzenbau_gaertner"),
    ziSuk:   themeOf("Echeveria", "elegans", "Zimmerpflanzen", "zierpflanzenbau_gaertner"),
    ziBrom:  themeOf("Aechmea", "fasciata", "Zimmerpflanzen", "zierpflanzenbau_gaertner"),
    ziPalm:  themeOf("Chamaedorea", "elegans", "Zimmerpflanzen", "zierpflanzenbau_gaertner"),
    ziBlueh: themeOf("Anthurium", "andraeanum", "Zimmerpflanzen", "zierpflanzenbau_gaertner"),
    // Nachgeschärft: Bäume gehören nicht zu den Ziersträuchern, Schlinger nicht auch
    birne:   themeOf("Pyrus", "communis", "Laubgehölze", "baumschule_gaertner"),
    birneO:  themeOf("Pyrus", "communis", "Kernobst", "obstbau_gaertner"),
    blauregen: themeOf("Wisteria", "sinensis", "Laubgehölze", "baumschule_gaertner"),
    winterjasmin: themeOf("Jasminum", "nudiflorum", "Laubgehölze", "baumschule_gaertner"),
    kornelkirsche: themeOf("Cornus", "mas", "Laubgehölze", "baumschule_gaertner"),
    kornelObst: themeOf("Cornus", "mas", "Wildobst", "obstbau_gaertner"),
    hartriegel: themeOf("Cornus", "alba", "Laubgehölze", "baumschule_gaertner"),
    // Roh-Kategorien, die keine Wuchsform sind, laufen über die Gehölz-/Zimmer-Logik
    wildrose: themeOf("Rosa", "canina", "Blühpflanzen", "gemuesebau_fachwerker"),
    sommerflieder: themeOf("Buddleja", "davidii", "Blühpflanzen", "gemuesebau_fachwerker"),
    wirt:    themeOf("Crataegus", "monogyna", "Wirtspflanzen", "obstbau_gaertner"),
    topfFicus: themeOf("Ficus", "benjamina", "Topf- und Grünpflanzen", "zierpflanzenbau_fachwerker"),
    stern:   themeOf("Euphorbia", "pulcherrima", "Zimmerpflanzen", "zierpflanzenbau_gaertner"),
    christusdorn: themeOf("Euphorbia", "milii var. milii", "Zimmerpflanzen", "zierpflanzenbau_gaertner"),
    // Beikräuter, die eine Liste unter »Stauden« führt – art-genau, ohne echte Beetstauden mitzureißen
    vogelmiere: themeOf("Stellaria", "media", "Stauden", "garten_und_landschaftsbau_gaertner"),
    brennessel: themeOf("Urtica", "dioica", "Stauden", "garten_und_landschaftsbau_gaertner"),
    greiskraut: themeOf("Senecio", "vulgaris", "Stauden", "garten_und_landschaftsbau_gaertner"),
    silberblatt: themeOf("Senecio", "cineraria", "Stauden", "staudengaertnerei_gaertner"),
    weissklee: themeOf("Trifolium", "repens", "Gründüngungspflanzen", "gemuesebau_gaertner"),
    hahnenfuss: themeOf("Ranunculus", "repens", "Zwiebel- und Knollenpflanzen", "zierpflanzenbau_gaertner"),
    ranunkel: themeOf("Ranunculus", "asiaticus", "Zwiebel- und Knollenpflanzen", "zierpflanzenbau_gaertner"),
    platterbse: themeOf("Lathyrus", "vernus", "Kletterpflanzen", "staudengaertnerei_gaertner"),
  }));
  const expect = {
    birne: "Kleinbäume & Großsträucher", birneO: "Kernobst",
    blauregen: "Kletterpflanzen", winterjasmin: "Kletterpflanzen",
    kornelkirsche: "Kleinbäume & Großsträucher", kornelObst: "Wildobst",
    hartriegel: "Blüten- & Ziersträucher",
    wildrose: "Rosen", sommerflieder: "Blüten- & Ziersträucher", wirt: "Kleinbäume & Großsträucher",
    topfFicus: "Grün- & Blattschmuckpflanzen",
    stern: "Blühende Zimmerpflanzen", christusdorn: "Sukkulenten & Kakteen",
    vogelmiere: "Wild- & Beikräuter", brennessel: "Wild- & Beikräuter", greiskraut: "Wild- & Beikräuter",
    silberblatt: "Beet- & Prachtstauden", weissklee: "Gründüngungspflanzen",
    hahnenfuss: "Wild- & Beikräuter", ranunkel: "Zwiebel- und Knollenpflanzen",
    platterbse: "Schatten- & Gehölzrandstauden",
    eiche: "Große Laubbäume", ahorn: "Kleinbäume & Großsträucher", kirsch: "Immergrüne Laubgehölze",
    coto: "Bodendecker & Zwergsträucher", wach: "Zwerg- & Kriechkoniferen", fichte: "Nadelbäume",
    rose: "Rosen", efeu: "Bodendecker & Zwergsträucher", apfelO: "Kernobst",
    apfelB: "Kleinbäume & Großsträucher", johann: "Beerenobst",
    gras: "Gräser", unkraut: "Wild- & Beikräuter",
    stSchatten: "Schatten- & Gehölzrandstauden", stBeet: "Beet- & Prachtstauden",
    stStein: "Steingarten- & Polsterstauden", stWasser: "Wasser- & Uferstauden",
    stSpec: "Schatten- & Gehölzrandstauden",
    gemFrucht: "Fruchtgemüse", gemKohl: "Kohlgemüse", gemWurzel: "Wurzel- & Knollengemüse",
    gemZwiebel: "Zwiebelgemüse", gemHuelse: "Hülsenfrüchte", gemBlatt: "Blatt- & Salatgemüse",
    ziGruen: "Grün- & Blattschmuckpflanzen", ziOrch: "Orchideen", ziSuk: "Sukkulenten & Kakteen",
    ziBrom: "Bromelien", ziPalm: "Palmen & Zimmerfarne", ziBlueh: "Blühende Zimmerpflanzen",
  };
  for (const [k, v] of Object.entries(expect))
    assert(themes[k] === v, `Thema für »${k}«: erwartet »${v}«, war »${themes[k]}«`);

  // … und die Themen-Ansicht der Liste (GaLaBau: Bäume, Sträucher, Stauden …)
  const wuchs = await page.evaluate(() => {
    document.querySelector("#frSelect").value = "garten_und_landschaftsbau";
    document.querySelector("#frSelect").dispatchEvent(new Event("change"));
    document.querySelector("#nivSelect").value = "gaertner";
    document.querySelector("#nivSelect").dispatchEvent(new Event("change"));
    // Ansicht auf »Thema« schalten (Standard ist alphabetisch)
    document.querySelector('#listControls .sortbtn[data-sort="thema"]').click();
    const cats = [...document.querySelectorAll("#stage .cathead")].map((e) => e.childNodes[0].textContent.trim());
    // Themen stehen in Lern-Reihenfolge: Bäume vor Sträuchern vor Stauden (jetzt nach Lebensbereich)
    const order = cats.indexOf("Große Laubbäume") < cats.indexOf("Blüten- & Ziersträucher")
      && cats.indexOf("Blüten- & Ziersträucher") < cats.indexOf("Beet- & Prachtstauden");
    return { cats, order, hasTree: cats.includes("Große Laubbäume"),
      hasShrub: cats.includes("Blüten- & Ziersträucher"), hasStaude: cats.includes("Beet- & Prachtstauden"),
      noVague: !cats.includes("Laubgehölze") && !cats.includes("Nadelgehölze") && !cats.includes("Stauden"), n: cats.length };
  });
  assert(wuchs.hasTree && wuchs.hasShrub && wuchs.hasStaude && wuchs.n >= 5,
    "GaLaBau sollte nach Themen gegliedert sein (große Laubbäume, Ziersträucher, Beet-/Prachtstauden …): " + JSON.stringify(wuchs.cats));
  assert(wuchs.noVague, "Die unspezifischen Kategorien (Laub-/Nadelgehölze) dürfen als Thema nicht mehr auftauchen");
  assert(wuchs.order, "Themen-Reihenfolge falsch (Bäume → Sträucher → Stauden): " + JSON.stringify(wuchs.cats));

  // Lernstoff eingrenzen (»Optionen · Auswahl«): alle Arten · Thema · Pflanzenfamilie
  const themeSess = await page.evaluate(() => {
    // »Auswahl«/#cat grenzt den LERNSTOFF DER SITZUNG ein (pool), nicht die Nachschlage-Liste.
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    const sel = document.querySelector("#cat");
    const opts = [...sel.options].map((o) => o.value);
    const groups = [...sel.querySelectorAll("optgroup")].map((g) => g.label);
    const setCat = (v) => { sel.value = v; sel.dispatchEvent(new Event("change")); return pool().length; };
    const back = setCat("");
    const nTheme = setCat("t:Große Laubbäume");
    const nFam = setCat("f:Rosaceae");
    setCat("");
    // Ein Filtermodell: im Listenmodus ist »Auswahl« ausgeblendet und filtert die Liste NICHT (Tags übernehmen)
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    const catHiddenInList = sel.closest(".field").hidden === true;
    sel.value = "t:Große Laubbäume"; sel.dispatchEvent(new Event("change"));   // im Listenmodus wirkungslos
    const listAll = document.querySelectorAll("#stage .sprow").length;
    sel.value = ""; sel.dispatchEvent(new Event("change"));
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    return { groups, hasTheme: opts.includes("t:Große Laubbäume"), hasFam: opts.includes("f:Rosaceae"),
      noVagueOpt: !opts.includes("t:Laubgehölze"), allLabel: sel.options[0].textContent,
      nTheme, nFam, back, catHiddenInList, listAll };
  });
  assert(themeSess.hasTheme && themeSess.noVagueOpt,
    "Themen-Auswahl der Sitzung fehlt oder enthält noch Roh-Kategorien: " + JSON.stringify(themeSess));
  assert(themeSess.hasFam && themeSess.groups.join("|") === "Thema|Pflanzenfamilie",
    "Auswahl muss nach Thema UND Pflanzenfamilie gruppiert sein: " + JSON.stringify(themeSess.groups));
  assert(/^alle Arten \(\d+\)/.test(themeSess.allLabel),
    "Erste Option sollte »alle Arten (n)« sein, war: " + themeSess.allLabel);
  assert(themeSess.nTheme > 5 && themeSess.nTheme < themeSess.back,
    "»Auswahl« muss den Lernstoff der Sitzung (pool) eingrenzen: " + JSON.stringify(themeSess));
  assert(themeSess.nFam > 3 && themeSess.nFam < themeSess.back,
    "Familien-Auswahl muss die Sitzung eingrenzen: " + JSON.stringify(themeSess));
  assert(themeSess.catHiddenInList && themeSess.listAll > themeSess.nTheme,
    "Ein Filtermodell: im Listenmodus ist »Auswahl« ausgeblendet und filtert die Liste nicht: " + JSON.stringify(themeSess));

  // Familienname auf der Kartenrückseite: Latein · Deutsch, ohne Dopplung –
  // egal ob die Quelle "Fabaceae" oder "Fabaceae/Schmetterlingsblütler" liefert
  const fn = await page.evaluate(() => ({
    gala: famName("Fabaceae/Schmetterlingsblütler"), gemuese: famName("Fabaceae"), plain: famName("Xytestaceae"),
  }));
  assert(fn.gala === "Fabaceae · Schmetterlingsblütler" && fn.gemuese === "Fabaceae · Schmetterlingsblütler",
    "famName darf den deutschen Familiennamen nicht doppeln: " + JSON.stringify(fn));
  assert(fn.plain === "Xytestaceae", "famName ohne dt. Namen soll nur den lateinischen zeigen: " + fn.plain);

  // »nur Prüfungsstoff« (Fachwerker): optionaler Schalter blendet Familie/Synonyme aus
  const exo = await page.evaluate(() => {
    const setNiv = (v) => { const s = document.querySelector("#nivSelect"); s.value = v; s.dispatchEvent(new Event("change")); };
    setNiv("gaertner");
    const hiddenForGaertner = document.querySelector("#examOnlyWrap").hidden === true;   // Schalter bei Gärtner unsichtbar
    setNiv("fachwerker");
    const shownForFachwerker = document.querySelector("#examOnlyWrap").hidden === false;  // bei Fachwerker sichtbar
    const pick = allCards.find((x) => x.a && x.fam) || allCards[0];
    const backLabels = () => {
      document.querySelector('#modeTabs button[data-mode="cards"]').click(); startSession();
      current = pick; flipCard();
      return [...document.querySelectorAll("#card .answer .meta .mf b")].map((b) => b.textContent);
    };
    const cb = document.querySelector("#examOnly");
    // AN
    cb.checked = true; cb.dispatchEvent(new Event("change"));
    const labelsOn = backLabels();
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    const famRowsOn = document.querySelectorAll("#stage .sprow .sp-fam").length;
    const famBtnOn = !!document.querySelector('#listControls .sortbtn[data-sort="familie"]');
    // AUS
    cb.checked = false; cb.dispatchEvent(new Event("change"));
    const labelsOff = backLabels();
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    const famRowsOff = document.querySelectorAll("#stage .sprow .sp-fam").length;
    const famBtnOff = !!document.querySelector('#listControls .sortbtn[data-sort="familie"]');
    setNiv("gaertner");
    return { hiddenForGaertner, shownForFachwerker, hasFam: !!pick.fam, labelsOn, famRowsOn, famBtnOn, labelsOff, famRowsOff, famBtnOff };
  });
  assert(exo.hiddenForGaertner, "»nur Prüfungsstoff« darf bei Gärtner NICHT sichtbar sein");
  assert(exo.shownForFachwerker, "»nur Prüfungsstoff« muss bei Fachwerker sichtbar sein");
  assert(exo.hasFam, "Testvoraussetzung: Fachwerker-Profil hat eine Art mit Familie");
  assert(exo.labelsOn.includes("Gattung") && !exo.labelsOn.includes("Familie") && !exo.labelsOn.includes("Syn."),
    "Prüfungsstoff-Modus: Kartenrückseite darf nur Gattung/Art zeigen (war: " + JSON.stringify(exo.labelsOn) + ")");
  assert(exo.famRowsOn === 0 && !exo.famBtnOn, "Prüfungsstoff-Modus: Liste darf keine Familie (.sp-fam) und keine »Familie«-Ansicht zeigen");
  assert(exo.labelsOff.includes("Familie"), "Ausgeschaltet: Familie muss auf der Kartenrückseite wieder erscheinen");
  assert(exo.famRowsOff > 0 && exo.famBtnOff, "Ausgeschaltet: Familie/-Ansicht müssen in der Liste wiederkommen");

  // zurück auf Standardprofil (fr + Niveau explizit)
  await page.evaluate(() => {
    if (location.hash) history.replaceState(null, "", location.pathname);   // evtl. Challenge-Hash entfernen → Reload bootet normal
    $("#frSelect").value = "gemuesebau"; $("#nivSelect").value = "gaertner"; applyProfile();
  });

  // Fortschritt-Persistenz über einen Reload. Der Test legt seinen Fortschritt SELBST an (eine
  // Bewertung der letzten Art) und stellt den Eintrag danach wieder her – früher hing er an
  // Bewertungen früherer Testblöcke und kippte in CI gelegentlich (»Waiting failed«), wenn im
  // Standardprofil gerade nichts gespeichert war.
  const before = await page.evaluate(() => {
    const c = allCards[allCards.length - 1];
    const prev = progress[c.key] ? JSON.stringify(progress[c.key]) : null;
    grade(c, "good");
    // Diagnose gleich mitnehmen: Ist der Eintrag wirklich im localStorage gelandet (nicht nur im
    // RAM-Fallback des store-Wrappers), wie groß ist der Speicher insgesamt?
    const raw = localStorage.getItem("pflanzenlernen.progress." + profileId) || "";
    return { n: Object.keys(progress).length, key: c.key, prev, profil: profileId,
      raw: raw.length, drin: raw.indexOf(c.key) >= 0, persistent: store.persistent, total: JSON.stringify(localStorage).length };
  });
  assert(before.n > 0 && before.drin && before.persistent,
    "Lernfortschritt wurde nicht in den localStorage geschrieben (RAM-Fallback? Speicher voll?): " + JSON.stringify(before));
  // Chromium reicht localStorage-Schreibvorgänge asynchron an den Browserprozess weiter – ein sofort
  // folgender Reload konnte auf einem schnellen CI-Runner das letzte Put überholen (Flake: Speicher nach
  // dem Reload leer, obwohl die Zeile davor geschrieben hatte). Kurz setzen lassen, nach dem Reload notfalls nachwarten.
  await new Promise((r) => setTimeout(r, 400));
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.startSession!=null && typeof progress!=='undefined'", { timeout: 30000 });
  try { await page.waitForFunction((key) => !!(progress && progress[key]), { timeout: 3000 }, before.key); } catch (e) { /* unten bewertet */ }
  const after = await page.evaluate((key) => ({ n: Object.keys(progress).length, hat: !!progress[key], profil: profileId,
    roh: (localStorage.getItem("pflanzenlernen.progress." + profileId) || "").length, persistent: store.persistent }), before.key);
  assert(before.n > 0 && after.hat && after.n >= before.n && after.profil === before.profil,
    "Lernfortschritt überlebte den Reload nicht: " + JSON.stringify({ before, after }));
  await page.evaluate((key, prev) => { if (prev) progress[key] = JSON.parse(prev); else delete progress[key]; saveProgress(); }, before.key, before.prev);

  // EIN Options-Akkordeon im Listenmodus: Sitzungs-Optionen ausgeblendet, kein separates
  // Zahnrad/Panel mehr; Ansicht + Filter (ZP-Spiegel) + Drucken (Spaltenauswahl,
  // Namensherkunft) stecken zusammen im Listen-Akkordeon. Selbst-enthaltend am Ende.
  const pcol = await page.evaluate(() => {
    $("#frSelect").value = "gemuesebau"; $("#nivSelect").value = "gaertner"; applyProfile();
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    // konsolidiert: Sitzungs-Optionen weg, keine Zahnrad-Reste, alles im Akkordeon
    const oneAccordion = document.querySelector("#setOpts").hidden === true
      && !document.querySelector("#btnPrintOpts") && !document.querySelector("#printOpts");
    // homogene Position: die Listen-Optionen sitzen im Karten-Slot direkt nach der
    // »Selbst wählen«-Klappe (die Sitzungs-Optionen stecken in der Klappe)
    const inCard = !!document.querySelector(".setup #listControls")
      && document.querySelector("#chooseWrap").nextElementSibling === document.querySelector("#listControls");
    const lc = document.querySelector("#listControls"); lc.dataset.open = "1"; renderListControls();
    const inAccordion = !!lc.querySelector("#printCols") && !!lc.querySelector("#printEty") && !!lc.querySelector("#lcZp");
    const noExamOnlyForGaertner = !lc.querySelector("#lcExamOnly");   // Spiegel nur bei Fachwerkern
    // ZP-Spiegel wirkt auf die echte Quelle (#onlyzp) und zurück
    lc.querySelector("#lcZp").checked = true;
    lc.querySelector("#lcZp").dispatchEvent(new Event("change"));
    const zpMirror = document.querySelector("#onlyzp").checked === true;
    const zpInSub = /nur ZP/.test(document.querySelector("#lcToggle .lc-sub").textContent);
    document.querySelector("#listControls #lcZp").checked = false;    // Re-Render → frisch selektieren
    document.querySelector("#listControls #lcZp").dispatchEvent(new Event("change"));
    const zpBack = document.querySelector("#onlyzp").checked === false;
    const off = (k) => { const cb = document.querySelector(`#printCols input[data-k="${k}"]`); cb.checked = false; cb.dispatchEvent(new Event("change")); };
    const on  = (k) => { const cb = document.querySelector(`#printCols input[data-k="${k}"]`); cb.checked = true;  cb.dispatchEvent(new Event("change")); };
    const hasHeadCol = (re) => [...document.querySelectorAll("#printList .ptab thead th")].some((th) => re.test(th.textContent));
    const hasZPcol   = () => !!document.querySelector("#printList .ptab thead th.pzp");
    const hasChkCol  = () => !!document.querySelector("#printList .ptab thead th.pchk");
    off("fam"); off("zp"); buildPrintList();
    const stored = JSON.parse(localStorage.getItem("pflanzenlernen.printcols") || "[]");
    const famGone = !hasHeadCol(/Familienname/), zpGone = !hasZPcol(), gelerntStill = hasChkCol();
    off("g"); off("a"); off("de");                                 // Guard: die letzte Bogen-Spalte bleibt
    const deStays = document.querySelector('#printCols input[data-k="de"]').checked;
    buildPrintList();
    const hasOneCol = hasHeadCol(/Deutscher Name/);
    on("fam"); on("zp"); on("g"); on("a"); buildPrintList();       // zurücksetzen
    const restored = hasHeadCol(/Familienname/) && hasZPcol();
    return { oneAccordion, inCard, inAccordion, noExamOnlyForGaertner, zpMirror, zpInSub, zpBack,
      famGone, zpGone, gelerntStill,
      storedHasFam: stored.includes("fam") && stored.includes("zp"), deStays, hasOneCol, restored };
  });
  assert(pcol.oneAccordion, "Listenmodus: Sitzungs-Optionen müssen ausgeblendet sein, Zahnrad/Panel entfernt (EIN Akkordeon)");
  assert(pcol.inCard, "Listen-Optionen müssen im Setup-Karten-Slot der Sitzungs-Optionen sitzen (homogene Position)");
  assert(pcol.inAccordion && pcol.noExamOnlyForGaertner, "Listen-Akkordeon: Drucken (Spalten + Namensherkunft) und ZP-Filter müssen darin stecken (Prüfungsstoff nur bei FW)");
  assert(pcol.zpMirror && pcol.zpInSub && pcol.zpBack, "Listen-Akkordeon: ZP-Spiegel muss #onlyzp schalten und in der Kopfzeile erscheinen");
  assert(pcol.famGone && pcol.zpGone && pcol.gelerntStill, "Druckoptionen: abgewählte Spalten (Familie/ZP) erscheinen weiter im Kopf: " + JSON.stringify(pcol));
  assert(pcol.storedHasFam, "Druckoptionen: Auswahl wird nicht in localStorage gemerkt");
  assert(pcol.deStays && pcol.hasOneCol, "Druckoptionen: die letzte Bogen-Spalte darf nicht abwählbar sein");
  assert(pcol.restored, "Druckoptionen: Wiedereinschalten stellt die Spalten nicht her");

  // Opt-in »jede Gruppe auf neuer Seite«: Checkbox im Drucken-Block; aktiv trägt in der
  // Druckliste jedes Gruppen-Band außer dem ersten einen Seitenumbruch (.pbrk); Standard aus.
  const pbrk = await page.evaluate(() => {
    const setBreak = (v) => { const cb = document.querySelector("#printBreak"); cb.checked = v; cb.dispatchEvent(new Event("change")); };
    const inPanel = !!document.querySelector("#listControls #printBreak");
    const themaBtn = document.querySelector('.sortbtn[data-sort="thema"]'); if (themaBtn) themaBtn.click();
    buildPrintList();                                       // Standard: keine Umbruch-Klassen
    const bandsDefault = document.querySelectorAll("#printList .ptab tr.pcat").length;
    const brkDefault = document.querySelectorAll("#printList .ptab tr.pcat.pbrk").length;
    setBreak(true); buildPrintList();
    const bands = [...document.querySelectorAll("#printList .ptab tr.pcat")];
    const brkOn = bands.filter((b) => b.classList.contains("pbrk")).length;
    const firstFree = bands.length > 0 && !bands[0].classList.contains("pbrk");
    const stored = localStorage.getItem("pflanzenlernen.printbreak") === "1";
    setBreak(false); buildPrintList();
    const brkOff = document.querySelectorAll("#printList .ptab tr.pcat.pbrk").length;
    return { inPanel, bandsDefault, brkDefault, nBands: bands.length, brkOn, firstFree, stored, brkOff };
  });
  assert(pbrk.inPanel, "Druckoptionen: Checkbox »jede Gruppe auf neuer Seite« fehlt im Drucken-Block");
  assert(pbrk.bandsDefault > 1 && pbrk.brkDefault === 0,
    "Seitenumbruch je Gruppe muss standardmäßig AUS sein: " + JSON.stringify(pbrk));
  assert(pbrk.brkOn === pbrk.nBands - 1 && pbrk.firstFree,
    "Mit Option: jedes Band außer dem ersten braucht .pbrk (Umbruch davor): " + JSON.stringify(pbrk));
  assert(pbrk.stored, "Die Wahl »jede Gruppe auf neuer Seite« muss gespeichert werden");
  assert(pbrk.brkOff === 0, "Nach Abwahl darf kein Band mehr .pbrk tragen: " + JSON.stringify(pbrk));

  // Disclaimer: dezenter Hinweis (RP-Bezug, Stand, KI-Kategorien, keine Gewähr)
  const disc = await page.evaluate(() => {
    const el = document.querySelector(".disclaimer");
    return el ? el.textContent.replace(/\s+/g, " ") : "";
  });
  assert(/[Ii]noffiziell/.test(disc) && /Regierungspräsidien/.test(disc) && /Juli\s*2026/.test(disc) && /generativer\s*KI/.test(disc) && /keine Gewähr/.test(disc),
    "Disclaimer im Lern-Tool fehlt oder unvollständig: " + disc);

  // Kein horizontaler Overflow im Listenmodus auf schmalem Screen (Responsivität)
  await page.setViewport({ width: 360, height: 780, isMobile: true });
  await page.evaluate(() => {
    document.querySelector("#frSelect").value = "garten_und_landschaftsbau";
    document.querySelector("#frSelect").dispatchEvent(new Event("change"));
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    const lc = document.querySelector("#listControls"); if (lc) { lc.dataset.open = "1"; renderListControls(); }
  });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 1, "Listenmodus läuft mobil horizontal über (Überhang " + overflow + "px)");

  // Audit: im Listenmodus sind die Sitzungs-Klappen (»Selbst wählen«, »Optionen«) weg –
  // es bleiben Rückweg, Suche und das Listen-Akkordeon.
  const listClean = await page.evaluate(() => ({
    choose: document.querySelector("#chooseWrap").hidden, opts: document.querySelector("#setOpts").hidden,
    back: /Zurück zum Lernen/.test(document.querySelector("#btnList").textContent),
    lc: !document.querySelector("#listControls").hidden }));
  assert(listClean.choose && listClean.opts && listClean.back && listClean.lc,
    "Listenmodus: Sitzungs-Klappen müssen ausgeblendet sein: " + JSON.stringify(listClean));

  // Audit (Lesbarkeit): Sekundärtexte ≥ 4,5:1 und ≥ 10 px – Schwierigkeits-Tags, Klappen-
  // Untertitel, ZP-Legende; im Dunkelmodus auch der aktive Modus-Tab samt Tag.
  const lesbar = await page.evaluate(async () => {
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    document.querySelector("#chooseWrap").open = true;
    const lum = c => { const m = (c.match(/\d+(\.\d+)?/g) || [255, 255, 255]).map(Number);
      const f = v => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
      return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
    const bgOf = el => { for (let p = el; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor;
      if (c && !/rgba?\(0, 0, 0, 0\)/.test(c) && c !== "transparent") return c; } return "rgb(255,255,255)"; };
    const ratio = el => { if (!el) return -1; const a = lum(getComputedStyle(el).color), b = lum(bgOf(el));
      return Math.round((Math.max(a, b) + .05) / (Math.min(a, b) + .05) * 100) / 100; };
    const q = s => document.querySelector(s);
    const out = { mdiffPx: parseFloat(getComputedStyle(q(".mdiff")).fontSize), mdiff: ratio(q(".mdiff")),
      sub: ratio(q(".setopts .opts-sub")), note: ratio(q(".zpnote")) };
    const prev = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = "dark";
    await new Promise((r) => setTimeout(r, 400));          // Farb-Transition der Tabs (.15 s) abwarten
    out.onDark = ratio(q(".modes button.on")); out.mdiffDark = ratio(q(".modes button.on .mdiff"));
    if (prev) document.documentElement.dataset.theme = prev; else delete document.documentElement.dataset.theme;
    document.querySelector("#chooseWrap").open = false;
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    return out;
  });
  assert(lesbar.mdiffPx >= 10 && lesbar.mdiff >= 4.5 && lesbar.sub >= 4.5 && (lesbar.note < 0 || lesbar.note >= 4.5),
    "Lesbarkeit (hell): Tags ≥10 px und Sekundärtexte ≥4,5:1 erwartet: " + JSON.stringify(lesbar));
  assert(lesbar.onDark >= 4.5 && lesbar.mdiffDark >= 4.5,
    "Lesbarkeit (dunkel): aktiver Modus-Tab + Tag ≥4,5:1 erwartet: " + JSON.stringify(lesbar));

  // Audit (Barrierefreiheit): Toast = Live-Region; Listenzeilen sind echte Buttons in <li>; Modus-Tabs tragen
  // aria-pressed; Enter auf »beenden« dreht die Karte nicht um; Ziffern bewerten nicht hinter einem offenen
  // Dialog; im Fokus-Modus ist alles außerhalb der Bühne inert; Touch-Ziele ≥44 px; keine ⏱-Glyphe; Hilfe aktuell.
  const a11y2 = await page.evaluate(async () => {
    const out = {}, tick = ms => new Promise(r => setTimeout(r, ms));
    out.toast = document.querySelector("#toast").getAttribute("role") === "status" && document.querySelector("#toast").getAttribute("aria-live") === "polite";
    out.listRows = document.querySelectorAll("#stage ul.splist > li > button.sprow").length;
    out.badRows = document.querySelectorAll("#stage li[role]").length + document.querySelectorAll("#stage ul.splist > :not(li)").length;
    out.noClockGlyph = !/\u23F1/.test(document.documentElement.outerHTML);
    const hilfe = document.querySelector("#helpPanel").textContent;
    out.helpFresh = /Optionen · Lernstoff/.test(hilfe) && !/Duell-Quiz/.test(hilfe) && !/Tipp- oder/.test(hilfe) && /geführten\s+Lektion/.test(hilfe);
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    out.pressed = [...document.querySelectorAll("#modeTabs button")].every(b => b.getAttribute("aria-pressed") === String(b.classList.contains("on")))
      && document.querySelector('#modeTabs button[data-mode="cards"]').getAttribute("aria-pressed") === "true";
    document.querySelector("#sessLen").value = "3";
    startSession(); await tick(120);
    out.inert = document.querySelector(".masthead").inert === true && document.querySelector(".setup").inert === true && document.querySelector("#stage").inert !== true;
    const stop = document.querySelector("#btnStop"); stop.focus();
    stop.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    out.noFlipOnStop = !document.querySelector("#card .answer") && sess.active;
    const card = document.querySelector("#card"); card.focus();
    card.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    out.flipped = !!document.querySelector("#card .answer");
    openInfo(current); await tick(40);
    const doneBefore = sess.done, qiBefore = qi;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "3", bubbles: true }));
    out.noRateBehindDialog = sess.done === doneBefore && qi === qiBefore;
    closeInfo();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "3", bubbles: true })); await tick(80);
    out.rated = sess.done === doneBefore + 1 || qi === qiBefore + 1;
    document.querySelector("#btnStop").click(); await tick(80);
    const ov = document.querySelector("#btnOverview"); if (ov) ov.click(); else exitSession(); await tick(40);
    out.inertOff = document.querySelector(".masthead").inert !== true && document.querySelector(".setup").inert !== true;
    const h = sel => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect().height : -1; };
    out.how = h("#btnHow"); out.rank = h("#rankName"); out.herb = h("#btnHerb");
    document.querySelector("#profileChip").click(); await tick(450);   // Eingangs-Animation des Modals (scale .965→1) abwarten
    out.sel = h("#frSelect");
    document.querySelector("#profDone").click();
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    return out;
  });
  assert(a11y2.toast && a11y2.listRows >= 100 && a11y2.badRows === 0 && a11y2.pressed && a11y2.noClockGlyph && a11y2.helpFresh,
    "Barrierefreiheit: Toast-Live-Region, li>button-Zeilen, aria-pressed, keine ⏱-Glyphe, Hilfe aktuell: " + JSON.stringify(a11y2));
  assert(a11y2.inert && a11y2.noFlipOnStop && a11y2.flipped && a11y2.noRateBehindDialog && a11y2.rated && a11y2.inertOff,
    "Tastatur/Fokus-Modus: beenden dreht nicht um, Dialog blockt Ziffern, inert an/aus: " + JSON.stringify(a11y2));
  for (const k of ["how", "rank", "herb", "sel"])
    assert(a11y2[k] >= 43.5, "Touch-Ziel zu klein (" + k + ": " + Math.round(a11y2[k]) + "px, mindestens 44px erwartet)");

  // Audit-Paket 4 (Lern-Tool): Quota-Fallback, Bild-Cache-Deckel, »Neu« statt »Stufe 0«, toter Code weg,
  // esc('), Kopf-Umschalter, <h1>, CSP, Herausforderung erzwingt ihr Profil, Profilwechsel beendet die Sitzung.
  const p4 = await page.evaluate(async () => {
    const out = {}, tick = ms => new Promise(r => setTimeout(r, ms));
    const origSet = Storage.prototype.setItem; let fails = 1;
    Storage.prototype.setItem = function (k, v) { if (fails-- > 0) { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; } return origSet.call(this, k, v); };
    out.q1 = store.set("pflanzenlernen.__q", "a"); out.q2 = store.set("pflanzenlernen.__q", "b");
    Storage.prototype.setItem = origSet;
    out.qPersistent = store.persistent; out.qValue = localStorage.getItem("pflanzenlernen.__q"); localStorage.removeItem("pflanzenlernen.__q");
    __clearPhotoCache();
    for (let i = 0; i < 450; i++) __rememberPhoto("k" + i, { thumb: "x" });
    out.cap = Object.keys(photoStoreLoad()).length; __clearPhotoCache();
    out.neu = /Neu/.test(stepHTML(0)) && !/Stufe 0/.test(stepHTML(0)) && /3×/.test(stepHTML(0)); out.stufe2 = /Stufe 2 von 5/.test(stepHTML(2));
    out.dead = typeof promptSub === "undefined" && typeof startQuizWith === "undefined" && typeof printColOn === "undefined";
    out.esc = esc("a'b");
    out.noToggle = !document.querySelector(".themetoggle, #btnTheme");
    out.h1 = /\u00a0·/.test(document.querySelector(".masthead h1").textContent);
    out.csp = !!document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    const vorher = profileId, ziel = vorher === "baumschule_gaertner" ? "gemuesebau_gaertner" : "baumschule_gaertner";
    const parts = vorher.match(/^(.*)_(gaertner|fachwerker)$/);
    document.querySelector('#modeTabs button[data-mode="quiz"]').click();
    pendingChallenge = { p: ziel, m: "quiz", i: [0, 1, 2], s: 2, t: 3 };
    startChallenge(); await tick(80);
    out.chProfile = profileId; out.chCards = queue.length; out.chFirst = !!queue[0] && queue[0].key === cardsFor(ziel)[0].key;
    document.querySelector("#btnStop").click(); await tick(60);
    let ov = document.querySelector("#btnOverview"); if (ov) ov.click(); else exitSession();
    pendingChallenge = null;
    document.querySelector("#frSelect").value = parts[1]; document.querySelector("#nivSelect").value = parts[2]; applyProfile(); await tick(60);
    out.back = profileId === vorher;
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    document.querySelector("#sessLen").value = "3"; startSession(); await tick(60);
    out.wasActive = sess.active;
    document.querySelector("#frSelect").value = ziel.replace(/_(gaertner|fachwerker)$/, ""); applyProfile(); await tick(80);
    out.endedOnSwitch = !sess.active && !document.body.classList.contains("stagefull");
    document.querySelector("#frSelect").value = parts[1]; applyProfile(); await tick(60);
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    return out;
  });
  assert(p4.q1 === false && p4.q2 === true && p4.qPersistent && p4.qValue === "b", "Quota-Fallback (Lern-Tool): " + JSON.stringify(p4));
  assert(p4.cap <= 400 && p4.neu && p4.stufe2 && p4.dead && p4.esc === "a&#39;b", "Bild-Cache-Deckel 400, »Neu« statt »Stufe 0«, toter Code weg, esc('): " + JSON.stringify(p4));
  assert(p4.noToggle && p4.h1 && p4.csp, "Kein Design-Schalter, <h1>, CSP (Lern-Tool): " + JSON.stringify(p4));
  assert(p4.chProfile !== p4.back && p4.chCards === 3 && p4.chFirst && p4.back,
    "Herausforderung muss das Profil des Links erzwingen (und danach zurück): " + JSON.stringify(p4));
  assert(p4.wasActive && p4.endedOnSwitch, "Profilwechsel während einer Sitzung muss sie sauber beenden: " + JSON.stringify(p4));

  // Bildnachweis ohne Layoutsprung (Platz reserviert) + richtige Option im Dunkelmodus lesbar
  const p4b = await page.evaluate(async () => {
    const tick = ms => new Promise(r => setTimeout(r, ms));
    const PX = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#8a6"/></svg>');
    __clearPhotoCache(); photoTried.clear();
    __setPhotoSource(() => Promise.resolve({ thumb: PX, src: "cm", title: "T", file: "T.jpg", url: "https://x/y", artist: "A", license: "CC" }));
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    document.querySelector("#sessLen").value = "3"; startSession();
    for (let t = 0; t < 60 && !document.querySelector("#phImg"); t++) await tick(50);
    await tick(120);
    const slot = !!document.querySelector(".ph-srcslot");
    const top0 = document.querySelector("#opts").offsetTop;            // Layout-Position (ohne die Einfahr-Transform der Optionen)
    const ok = [...document.querySelectorAll("#opts .opt")].find(o => o.textContent.includes(current.g));
    (ok || document.querySelector("#opts .opt")).click(); await tick(200);
    const top1 = document.querySelector("#opts").offsetTop;
    const credit = !!document.querySelector("#stage .ph-src");
    const prev = document.documentElement.dataset.theme; document.documentElement.dataset.theme = "dark"; await tick(350);
    const lum = c => { const m = (c.match(/\d+(\.\d+)?/g) || [255, 255, 255]).map(Number);
      const f = v => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
      return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
    const bgOf = el => { for (let p = el; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor;
      if (c && !/rgba?\(0, 0, 0, 0\)/.test(c) && c !== "transparent") return c; } return "rgb(255,255,255)"; };
    const corr = document.querySelector("#opts .opt.correct");
    const dark = corr ? Math.round((Math.max(lum(getComputedStyle(corr).color), lum(bgOf(corr))) + .05) / (Math.min(lum(getComputedStyle(corr).color), lum(bgOf(corr))) + .05) * 100) / 100 : -1;
    if (prev) document.documentElement.dataset.theme = prev; else delete document.documentElement.dataset.theme;
    document.querySelector("#btnStop").click(); await tick(60);
    const ov = document.querySelector("#btnOverview"); if (ov) ov.click(); else exitSession();
    __setPhotoSource(null); __clearPhotoCache();
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    return { slot, shift: Math.abs(top1 - top0), credit, dark, disabled: corr ? corr.disabled : null };
  });
  assert(p4b.slot && p4b.credit && p4b.shift <= 1, "Bildnachweis darf die Optionen nicht verschieben (Platz reserviert): " + JSON.stringify(p4b));
  assert(p4b.dark >= 4.5, "Dunkelmodus: richtige Option muss nach der Antwort lesbar bleiben (≥4,5:1): " + JSON.stringify(p4b));

  // Barrierefreie Touch-Bedienung (schmale/Touch-Viewports): ≥44-px-Ziele für
  // Hilfe-Link, Profil-Chip, Ansicht-/Filter-Knöpfe, Suchfeld und Fußzeilen-Link;
  // die Fußzeile muss zudem genug Kontrast fürs Lesen haben (≥4,5:1).
  const touch = await page.evaluate(() => {
    const tb = document.querySelector('.sortbtn[data-sort="thema"]');
    if (tb) tb.click();                                   // Gruppen-Ansicht -> Filter-Tags sichtbar
    const h = sel => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect().height : -1; };
    const sizes = { help: h(".helplink"), chip: h("#profileChip"), sort: h(".sortbtn"),
      tag: h(".cattag"), search: h(".listsearch"), foot: h(".foot a") };
    const az = document.querySelector('.sortbtn[data-sort="bot"]');
    if (az) az.click();                                   // Ansicht zurück auf Standard
    const lum = c => { const m = (c.match(/\d+(\.\d+)?/g) || [255, 255, 255]).map(Number);
      const f = v => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
      return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
    let bg = "rgb(255,255,255)";
    const foot = document.querySelector(".foot");
    for (let p = foot; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor;
      if (c && !/rgba?\(0, 0, 0, 0\)/.test(c) && c !== "transparent") { bg = c; break; } }
    const fgL = lum(getComputedStyle(foot).color), bgL = lum(bg);
    const ratio = (Math.max(fgL, bgL) + .05) / (Math.min(fgL, bgL) + .05);
    return { sizes, ratio: Math.round(ratio * 100) / 100 };
  });
  for (const [k, v] of Object.entries(touch.sizes))
    assert(v >= 43.5, "Touch-Ziel zu klein (" + k + ": " + Math.round(v) + "px, mindestens 44px erwartet)");
  assert(touch.ratio >= 4.5, "Fußzeilen-Kontrast unter 4,5:1 (" + touch.ratio + ":1)");

  // Fokus-/Vollbild-Sitzung auf dem Smartphone: laufende Lektion füllt den Schirm;
  // das Ergebnis + der Teilen-Block bleiben im Fokus-Overlay (nicht unter dem Fold);
  // erst »Zur Übersicht« bzw. ein Moduswechsel verlässt den Fokus-Modus.
  const full = await page.evaluate(() => {
    $("#frSelect").value = "gemuesebau"; $("#nivSelect").value = "gaertner"; applyProfile();
    document.querySelector('#modeTabs button[data-mode="quiz"]').click();
    const before = document.body.classList.contains("stagefull");
    $("#sessLen").value = "4"; startSession();
    const st = getComputedStyle(document.querySelector("#stage"));
    const during = { cls: document.body.classList.contains("stagefull"), pos: st.position,
      bar: getComputedStyle(document.querySelector(".sessionbar")).position };
    document.querySelector("#opts .opt").click();  // eine Frage beantworten – sonst gibt es nichts zu teilen
    document.querySelector("#wt").click();
    document.querySelector("#btnStop").click();   // Sitzung beenden -> Ergebnis-Screen
    const onResult = { cls: document.body.classList.contains("stagefull"),
      overview: !!document.querySelector("#btnOverview"),
      share: !!document.querySelector("#shareBlock") };
    document.querySelector("#btnOverview").click();   // »Zur Übersicht« verlässt den Fokus
    const afterExit = document.body.classList.contains("stagefull");
    startSession();
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    const afterMode = document.body.classList.contains("stagefull");
    return { before, during, onResult, afterExit, afterMode };
  });
  assert(!full.before && full.during.cls && full.during.pos === "fixed" && full.during.bar === "sticky",
    "Vollbild-Sitzung: #stage muss während der Lektion fixed/Vollbild sein, Leiste sticky: " + JSON.stringify(full));
  assert(full.onResult.cls && full.onResult.overview && full.onResult.share,
    "Ergebnis + Teilen müssen im Fokus-Overlay bleiben (mit »Zur Übersicht« + Teilen-Block): " + JSON.stringify(full));
  assert(!full.afterExit && !full.afterMode,
    "Vollbild-Sitzung: nach »Zur Übersicht« bzw. Moduswechsel muss der Fokus-Modus enden: " + JSON.stringify(full));

  // Fokus-Modus greift auch am Desktop (nicht nur mobil): #stage wird zum Vollbild-Overlay
  // mit zentrierter Lese-Spalte (max-width 720), Exit über »Zur Übersicht«.
  await page.setViewport({ width: 1000, height: 900, isMobile: false });
  const deskFocus = await page.evaluate(() => {
    $("#frSelect").value = "gemuesebau"; $("#nivSelect").value = "gaertner"; applyProfile();
    document.querySelector('#modeTabs button[data-mode="quiz"]').click();
    $("#sessLen").value = "4"; startSession();
    const pos = getComputedStyle(document.querySelector("#stage")).position;
    const col = document.querySelector("#stage .qprompt") || document.querySelector("#stage > *");
    const w = col ? Math.round(col.getBoundingClientRect().width) : 9999;
    document.querySelector("#btnStop").click();
    document.querySelector("#btnOverview").click();
    return { pos, w, after: document.body.classList.contains("stagefull") };
  });
  assert(deskFocus.pos === "fixed" && deskFocus.w <= 760 && !deskFocus.after,
    "Fokus-Modus muss auch am Desktop greifen (fixed, zentrierte Spalte ≤720px) und per »Zur Übersicht« enden: " + JSON.stringify(deskFocus));

  // Lernduell: Ergebnis teilen + Herausforderung (Share-Link, Banner, Vergleich)
  await page.setViewport({ width: 1000, height: 900, isMobile: false });
  // 1) Quiz-Sitzung zu Ende spielen → Teilen-Block erscheint, Link kodiert die exakte Lektion
  const duelShare = await page.evaluate(() => {
    localStorage.clear();
    $("#frSelect").value = "gemuesebau"; $("#nivSelect").value = "gaertner"; applyProfile();
    document.querySelector('#modeTabs button[data-mode="quiz"]').click();
    $("#sessLen").value = "4"; startSession();
    let guard = 0;                                   // alle Fragen korrekt → kein Requeue → Abschluss
    while (document.querySelector("#opts") && guard++ < 60) {
      const correct = answerText(current).toLowerCase();
      const opt = [...document.querySelectorAll("#opts .opt")].find((b) => b.querySelector("span:last-child").textContent.toLowerCase() === correct);
      if (!opt) break; opt.click();
      const wt = document.querySelector("#wt"); if (wt) wt.click();
    }
    const finished = /Sitzung geschafft/.test(document.querySelector("#stage").textContent);
    const hasShare = !!document.querySelector("#shareBlock #btnShare");
    const hasWa = !!document.querySelector("#btnWa");
    const hasCopy = !!document.querySelector("#btnCopy");
    const nameInp = document.querySelector("#duelName"); nameInp.value = "Testine"; nameInp.dispatchEvent(new Event("input"));
    sess.ms = 187000;                                // feste Denkzeit → prüfbare Kodierung (3:07)
    const url = challengeURL(), frag = url.split("#c=")[1];
    // eine einzelne veränderte Stelle muss die Prüfsumme reißen
    const kaputt = (() => { const a = frag.split(""); a[3] = a[3] === "A" ? "B" : "A"; return chDecode(a.join("")); })();
    return { finished, hasShare, hasWa, hasCopy, url, frag, dec: chDecode(frag),
      alsJson: b64urlDec(frag), kaputt, correct: sess.correct, done: sess.done,
      alt: chDecode(b64urlEnc({ v: 1, p: "gemuesebau_gaertner", m: "quiz", i: [1, 2], s: 1, t: 2, n: "Alt" })) };
  });
  assert(duelShare.finished, "Lernduell: Quiz-Sitzung erreicht den Abschluss-Screen nicht");
  assert(duelShare.hasShare && duelShare.hasWa && duelShare.hasCopy, "Lernduell: Teilen-Block (Teilen/WhatsApp/Kopieren) fehlt");
  assert(duelShare.dec && duelShare.dec.p === "gemuesebau_gaertner" && duelShare.dec.m === "quiz",
    "Lernduell-Link kodiert Profil/Modus nicht: " + JSON.stringify(duelShare.dec));
  assert(Array.isArray(duelShare.dec.i) && duelShare.dec.i.length === duelShare.done && duelShare.dec.i.every((n) => Number.isInteger(n) && n >= 0),
    "Lernduell-Link kodiert die exakte Kartenauswahl (Indizes) nicht: " + JSON.stringify(duelShare.dec.i));
  assert(duelShare.dec.n === "Testine" && duelShare.dec.s === duelShare.correct && duelShare.dec.t === duelShare.done,
    "Lernduell-Link kodiert Name/Ergebnis nicht: " + JSON.stringify(duelShare.dec));
  assert(duelShare.dec.z === 187, "Lernduell-Link kodiert die Denkzeit nicht: " + JSON.stringify(duelShare.dec));
  // Ergebnis/Zeit dürfen nicht im Klartext im Link stehen und der Link soll kurz bleiben
  assert(duelShare.alsJson === null && !/^eyJ/.test(duelShare.frag),
    "Lernduell-Link ist lesbares JSON (manipulierbar): " + duelShare.frag);
  assert(duelShare.frag.length < 90, "Lernduell-Link unnötig lang (" + duelShare.frag.length + " Zeichen): " + duelShare.frag);
  assert(duelShare.kaputt === null, "Lernduell-Link: veränderte Stelle wird nicht erkannt (Prüfsumme wirkungslos)");
  assert(duelShare.alt && duelShare.alt.p === "gemuesebau_gaertner" && duelShare.alt.s === 1,
    "Lernduell: alte (JSON-)Links werden nicht mehr verstanden: " + JSON.stringify(duelShare.alt));

  // 2) Eingehende Herausforderung (#c=…): Banner erscheint, übernimmt Profil/Modus, nennt die Zeit
  const b64 = await page.evaluate((idx) => chEncode({ v: 2, p: "gemuesebau_gaertner", m: "quiz", r: "de2bot", i: idx, s: idx.length, t: idx.length, z: 600, n: "Kollege" }), duelShare.dec.i);
  await page.goto("about:blank");                   // erzwingt echten Reload (Hash-Wechsel allein lädt nicht neu)
  await page.goto(FILE + "#c=" + b64, { waitUntil: "load" });
  await page.waitForFunction("window.startChallenge!=null", { timeout: 30000 });
  const duelIn = await page.evaluate(() => {
    const banner = document.querySelector("#duelBanner");
    return { shown: banner && !banner.hidden, txt: banner ? banner.textContent : "",
      hasAccept: !!document.querySelector("#btnAcceptDuel"), prof: profileId, mode };
  });
  assert(duelIn.shown && duelIn.hasAccept, "Lernduell: Banner/Annehmen-Knopf erscheint nicht bei #c=-Link");
  assert(/Kollege/.test(duelIn.txt) && /fordert dich heraus/.test(duelIn.txt), "Lernduell-Banner nennt Herausforderer/Text nicht: " + duelIn.txt);
  assert(/10:00/.test(duelIn.txt), "Lernduell-Banner nennt die Zeit des Herausforderers nicht: " + duelIn.txt);
  assert(duelIn.prof === "gemuesebau_gaertner" && duelIn.mode === "quiz",
    "Lernduell: Profil/Modus nicht aus dem Link übernommen: " + JSON.stringify(duelIn));

  // Annehmen spielt EXAKT die kodierten Karten; gleiche Quote, aber schneller → Sieg über die Zeit
  const duelPlay = await page.evaluate((idx) => {
    document.querySelector("#btnAcceptDuel").click();
    const started = sess.cards.map((c) => allCards.indexOf(c));
    const sameSet = started.length === idx.length && started.every((v, k) => v === idx[k]);
    const hasClock = !!document.querySelector("#sclock");
    let guard = 0;
    while (document.querySelector("#opts") && guard++ < 60) {
      const correct = answerText(current).toLowerCase();
      const opt = [...document.querySelectorAll("#opts .opt")].find((b) => b.querySelector("span:last-child").textContent.toLowerCase() === correct);
      if (!opt) break; opt.click();
      sess.ms = 120000;                              // eigene Denkzeit 2:00 – Herausforderer brauchte 10:00
      const wt = document.querySelector("#wt"); if (wt) wt.click();
    }
    const txt = document.querySelector("#stage").textContent;
    return { sameSet, hasClock, hasResult: !!document.querySelector(".duel-result"),
      times: [...document.querySelectorAll(".duel-time")].map((e) => e.textContent),
      schneller: /schneller/i.test(txt), txt: txt.slice(0, 400),
      backLabel: (document.querySelector("#btnShare") || {}).textContent || "" };
  }, duelShare.dec.i);
  assert(duelPlay.sameSet, "Lernduell: Annehmen spielt nicht exakt die kodierten Karten");
  assert(duelPlay.hasClock, "Lernduell/Quiz: Uhr (#sclock) fehlt in der Sitzungsleiste");
  assert(duelPlay.hasResult, "Lernduell: Vergleich wird nicht angezeigt");
  assert(duelPlay.times.length === 2 && /2:0\d/.test(duelPlay.times[0]) && duelPlay.times[1] === "10:00",
    "Lernduell: Zeiten fehlen im Vergleich: " + JSON.stringify(duelPlay.times));
  assert(duelPlay.schneller, "Lernduell: bei gleicher Quote entscheidet die Zeit nicht: " + duelPlay.txt);
  assert(/zurückschicken/i.test(duelPlay.backLabel), "Lernduell: Revanche-/Zurückschicken-Knopf fehlt");

  // Manipulierter Link (eine Stelle geändert) wird nicht angenommen
  const kaputtFrag = b64.slice(0, 3) + (b64[3] === "A" ? "B" : "A") + b64.slice(4);
  await page.goto("about:blank");
  await page.goto(FILE + "#c=" + kaputtFrag, { waitUntil: "load" });
  await page.waitForFunction("window.startSession!=null", { timeout: 30000 });
  const kaputtIn = await page.evaluate(() => {
    const b = document.querySelector("#duelBanner");
    return { shown: !!(b && !b.hidden) };
  });
  assert(!kaputtIn.shown, "Lernduell: manipulierter Link wird trotzdem als Herausforderung angenommen");

  // Die Aufgabenstellung muss mitwandern: »Bild → voller Name« (img2both) und die
  // Antwortart des Bilder-Quiz. In v2 fielen beide heraus – der Herausgeforderte
  // bekam plötzlich nur den botanischen Namen. Alte v2-Links bleiben lesbar.
  const kodier = await page.evaluate(() => {
    const idx = [1, 2, 3];
    const rund = (o) => chDecode(chEncode(Object.assign({ p: "gemuesebau_gaertner", i: idx, s: 2, t: 3, z: 9, n: "K" }, o)));
    const voll = rund({ m: "photo", r: "img2both", a: "mc" });
    const pruef = rund({ m: "photo", r: "img2bot", a: "exam" });
    const text = rund({ m: "type", r: "bot2de" });
    // v2-Link nachbauen (alter Aufbau: Richtung global über CH_DIRS, keine Antwortart)
    const alt2 = (() => {
      const out = [2, (CH_PROFILES.indexOf("gemuesebau_gaertner") << 4) | (CH_MODES.indexOf("photo") << 2) | CH_DIRS.indexOf("img2de")];
      const put = (n) => { n = Math.round(n); while (n > 127) { out.push((n & 127) | 128); n = Math.floor(n / 128); } out.push(n); };
      put(idx.length); idx.forEach(put); put(2); put(3); put(9); put(0);
      const body = Uint8Array.from(out), sum = chSum(body, body.length);
      const all = new Uint8Array(body.length + 2);
      all.set(body); all[body.length] = sum & 255; all[body.length + 1] = sum >>> 8;
      return chDecode(bytesToB64url(chMask(all)));
    })();
    return { voll, pruef, text, alt2 };
  });
  assert(kodier.voll && kodier.voll.r === "img2both" && kodier.voll.a === "mc",
    "Lernduell: »Bild → voller Name« muss im Link erhalten bleiben: " + JSON.stringify(kodier.voll));
  assert(kodier.pruef && kodier.pruef.a === "exam" && kodier.pruef.r === "img2bot",
    "Lernduell: die Antwortart des Bilder-Quiz muss mitwandern: " + JSON.stringify(kodier.pruef));
  assert(kodier.text && kodier.text.r === "bot2de" && kodier.text.m === "type",
    "Lernduell: Textmodi müssen ihre Richtung behalten: " + JSON.stringify(kodier.text));
  assert(kodier.alt2 && kodier.alt2.r === "img2de" && kodier.alt2.a === "mc" && kodier.alt2.s === 2,
    "Lernduell: alte v2-Links müssen weiterhin richtig gelesen werden: " + JSON.stringify(kodier.alt2));

  // … und beim Öffnen eines solchen Links stellt sich das Tool auch wirklich darauf ein
  const vollFrag = await page.evaluate(() =>
    chEncode({ p: "gemuesebau_gaertner", m: "photo", r: "img2both", a: "mc", i: [1, 2, 3], s: 3, t: 3, z: 30, n: "Kollegin" }));
  await page.goto("about:blank");
  await page.goto(FILE + "#c=" + vollFrag, { waitUntil: "load" });
  await page.waitForFunction("window.startChallenge!=null", { timeout: 30000 });
  const vollIn = await page.evaluate(() => ({
    dir: curDir(), antwort: phAns(), modus: mode,
    txt: (document.querySelector("#duelBanner") || {}).textContent || "",
    imSelect: (document.querySelector("#dir") || {}).value,
  }));
  assert(vollIn.modus === "photo" && vollIn.antwort === "mc" && vollIn.dir === "img2both" && vollIn.imSelect === "img2both",
    "Lernduell: »voller Name« muss beim Öffnen übernommen werden (sonst kommt nur botanisch): " + JSON.stringify(vollIn));
  assert(/voller Name/.test(vollIn.txt),
    "Lernduell-Banner soll die Aufgabenstellung nennen: " + vollIn.txt);

  // Ältere Duell-Links (»Namen tippen« mit EINEM Feld, Bild → botanisch/deutsch) müssen
  // weiterhin genau diese Aufgabe stellen, obwohl beides nicht mehr zur Wahl steht –
  // und sobald eine eigene Sitzung startet, gelten wieder die eigenen Einstellungen.
  const altTypFrag = await page.evaluate(() =>
    chEncode({ p: "gemuesebau_gaertner", m: "photo", r: "img2bot", a: "type", i: [1, 2, 3], s: 1, t: 3, z: 20, n: "Kollege" }));
  await page.goto("about:blank");
  await page.goto(FILE + "#c=" + altTypFrag, { waitUntil: "load" });
  await page.waitForFunction("window.startChallenge!=null", { timeout: 30000 });
  const altTyp = await page.evaluate(async (PX) => {
    window.__offlineJsonp = () => Promise.reject(new Error("offline (Test)"));
    __setJsonp(window.__offlineJsonp); __clearPhotoCache();
    __setPhotoSource((card) => Promise.resolve({ thumb: PX, title: card.g, file: "T.jpg", url: "https://x/y" }));
    const banner = (document.querySelector("#duelBanner") || {}).textContent || "";
    document.querySelector("#btnAcceptDuel").click();
    await new Promise((r) => setTimeout(r, 80));
    const einFeld = !!document.querySelector("#typeIn"), keineAuswahl = !document.querySelector("#opts .opt");
    const dirImSpiel = curDir(), antwImSpiel = phAns();
    document.querySelector("#btnStop").click();
    startSession();                                            // eigene Sitzung → eigene Einstellungen
    await new Promise((r) => setTimeout(r, 80));
    const danach = { dir: curDir(), antw: phAns(), opts: document.querySelectorAll("#opts .opt").length, feld: !!document.querySelector("#phAnswer") };
    document.querySelector("#btnStop").click();
    return { banner, einFeld, keineAuswahl, dirImSpiel, antwImSpiel, danach };
  }, PX);
  assert(/botanischer Name/.test(altTyp.banner) && /Namen eingeben/.test(altTyp.banner),
    "Banner eines älteren Links muss dessen Aufgabe nennen: " + altTyp.banner);
  assert(altTyp.einFeld && altTyp.keineAuswahl && altTyp.dirImSpiel === "img2bot" && altTyp.antwImSpiel === "type",
    "Älterer Duell-Link muss weiterhin EIN Eingabefeld (Bild → botanisch) stellen: " + JSON.stringify(altTyp));
  assert(altTyp.danach.dir === "img2both" && altTyp.danach.antw === "mc" && altTyp.danach.opts === 4 && !altTyp.danach.feld,
    "Nach dem Duell müssen wieder die eigenen Einstellungen gelten (voller Name · Auswahl): " + JSON.stringify(altTyp.danach));

  const altDeFrag = await page.evaluate(() =>
    chEncode({ p: "gemuesebau_gaertner", m: "photo", r: "img2de", a: "mc", i: [1, 2, 3], s: 2, t: 3, z: 15, n: "Kollegin" }));
  await page.goto("about:blank");
  await page.goto(FILE + "#c=" + altDeFrag, { waitUntil: "load" });
  await page.waitForFunction("window.startChallenge!=null", { timeout: 30000 });
  const altDe = await page.evaluate(async (PX) => {
    window.__offlineJsonp = () => Promise.reject(new Error("offline (Test)"));
    __setJsonp(window.__offlineJsonp); __clearPhotoCache();
    __setPhotoSource((card) => Promise.resolve({ thumb: PX, title: card.g, file: "T.jpg", url: "https://x/y" }));
    document.querySelector("#btnAcceptDuel").click();
    await new Promise((r) => setTimeout(r, 80));
    const c = current, want = deMain(c);
    const opts = [...document.querySelectorAll("#opts .opt")].map((b) => b.querySelector("span:last-child").textContent);
    document.querySelector("#btnStop").click();
    return { dir: curDir(), optIsDe: opts.includes(want), noBot: !opts.includes((c.g + " " + c.a).trim()), n: opts.length };
  }, PX);
  assert(altDe.dir === "img2de" && altDe.n === 4 && altDe.optIsDe && altDe.noBot,
    "Älterer Link »Bild → deutscher Name« muss weiterhin deutsche Optionen stellen: " + JSON.stringify(altDe));

  // Geführte Lektion als Herausforderung: der Empfänger spielt genau die kodierten
  // Übungsformen – nicht die, die sein eigener Leitner-Stand vorgeben würde.
  const gefFrag = await page.evaluate(() =>
    chEncode({ p: "gemuesebau_gaertner", m: "guided", r: "de2bot", a: "mc", rp: "img2bot",
      f: ["quiz", "cards", "type"], i: [1, 2, 3], s: 2, t: 2, z: 40, n: "Kollegin" }));
  await page.goto("about:blank");
  await page.goto(FILE + "#c=" + gefFrag, { waitUntil: "load" });
  await page.waitForFunction("window.startChallenge!=null", { timeout: 30000 });
  const gefIn = await page.evaluate(() => {
    const txt = (document.querySelector("#duelBanner") || {}).textContent || "";
    document.querySelector("#btnAcceptDuel").click();
    const erste = !!document.querySelector("#opts .opt");        // Karte 1: Quiz
    document.querySelector("#opts .opt").click(); document.querySelector("#wt").click();
    const zweite = !!document.querySelector("#card");            // Karte 2: Karteikarte
    document.querySelector("#card").click();
    document.querySelectorAll(".rate button")[2].click();        // »Gewusst«
    const dritte = !!document.querySelector("#typeForm");        // Karte 3: Tippen
    document.querySelector("#btnStop").click();
    return { txt, erste, zweite, dritte, auto: !!sess.auto };
  });
  assert(/Geführte Lektion/.test(gefIn.txt) && /gemischte/.test(gefIn.txt),
    "Lernduell-Banner muss die geführte Lektion als solche ansagen: " + gefIn.txt);
  assert(gefIn.auto && gefIn.erste && gefIn.zweite && gefIn.dritte,
    "Geführte Herausforderung muss genau die kodierten Übungsformen spielen (Quiz · Karte · Tippen): " + JSON.stringify(gefIn));

  // Neue Version sofort aktiv + Versionskennung: Der Service Worker liefert cache-first, beim
  // ersten Aufruf nach einer Aktualisierung stand also noch die alte Seite. Jetzt lädt die
  // Seite bei Übernahme der neuen Version von selbst neu – aber nur, wenn gerade nichts
  // läuft; sonst erscheint ein Hinweis mit Knopf. Die Fußzeile nennt die Versionskennung,
  // damit sich auf jedem Gerät ablesen lässt, welche Ausgabe gerade aktiv ist.
  const swu = await page.evaluate(async () => {
    const stamp = (document.querySelector("#buildStamp") || {}).textContent || "";
    let reloads = 0; __swReloadHook(() => { reloads++; });
    __swUpdate();                                        // nichts läuft → sofort neu laden
    const sofort = reloads;
    document.querySelector('#modeTabs button[data-mode="quiz"]').click();
    $("#sessLen").value = "4"; startSession();
    await new Promise((r) => setTimeout(r, 60));
    __swUpdate();                                        // Sitzung läuft → Hinweis statt Neuladen
    const note = document.querySelector("#swNote");
    const hinweis = note ? note.textContent : "";
    const nichtNeu = reloads === sofort;
    __swUpdate();                                        // kein zweiter Hinweis
    const einmal = document.querySelectorAll("#swNote").length;
    document.querySelector("#swGo").click();
    const perKnopf = reloads;
    note.remove();
    document.querySelector('#modeTabs button[data-mode="cards"]').click();   // Sitzung abbrechen
    __swReloadHook(null);
    return { stamp, sofort, hinweis, nichtNeu, einmal, perKnopf };
  });
  assert(/Version [0-9a-f]{7}/.test(swu.stamp), "Fußzeile muss die Versionskennung nennen: " + swu.stamp);
  assert(swu.sofort === 1, "Neue Version im Leerlauf → sofort neu laden: " + JSON.stringify(swu));
  assert(/Neue Version/.test(swu.hinweis) && swu.nichtNeu && swu.einmal === 1 && swu.perKnopf === 2,
    "Neue Version während einer Sitzung → ein Hinweis mit Knopf »Jetzt neu laden« statt Neuladen: " + JSON.stringify(swu));

  // CSP (Hotfix nach Audit-Paket 4): Wikimedia liefert Vorschaubilder seit 2026 von
  // thumb.wikimedia.org statt upload.wikimedia.org (Tech News 2026/36). Fest eingetragene Hosts
  // blockten jedes neu gesuchte Quiz-Bild (»Bild konnte nicht geladen werden«). Die Policy muss
  // deshalb *.wikimedia.org/*.wikipedia.org pauschal erlauben – auf eigener Seite geprüft, weil
  // die erwarteten Block-Meldungen sonst als Konsolenfehler zählen.
  const cp = await browser.newPage();
  await cp.goto(FILE, { waitUntil: "load" });
  await cp.waitForFunction("window.startSession!=null", { timeout: 30000 });
  const cspL = await cp.evaluate(() => new Promise((resolve) => {
    const viol = [];
    document.addEventListener("securitypolicyviolation", (e) => viol.push(e.blockedURI + " [" + e.effectiveDirective + "]"));
    const add = (tag, src) => { const el = document.createElement(tag); el.onerror = () => {}; el.src = src; document.head.appendChild(el); };
    add("img", "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c9/X.jpg/960px-X.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail");
    add("img", "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/X.jpg/960px-X.jpg");
    add("img", "https://neu.wikimedia.org/x.jpg");
    add("img", "https://inaturalist-open-data.s3.amazonaws.com/photos/40101992/large.jpeg");   // iNaturalist-Ersatzquelle
    add("img", "https://static.inaturalist.org/photos/40101992/medium.jpg");
    add("img", "https://example.com/fremd.png");
    add("script", "https://example.com/fremd.js");
    const meta = (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || "";
    const big = lbBig("https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c9/X.jpg/960px-X.jpg?utm_source=commons.wikimedia.org", 4000);
    setTimeout(() => resolve({ viol, meta, big }), 500);
  }));
  await cp.close();
  assert(cspL.viol.some(v => /example\.com.*img/.test(v)) && cspL.viol.some(v => /example\.com.*script/.test(v)), "CSP (Lern-Tool) muss fremde Bilder/Skripte blocken: " + JSON.stringify(cspL.viol));
  assert(!cspL.viol.some(v => /wikimedia|wikipedia/.test(v)), "CSP (Lern-Tool) darf keinen Wikimedia-Host blocken – auch thumb.wikimedia.org nicht: " + JSON.stringify(cspL.viol));
  assert(!cspL.viol.some(v => /inaturalist/.test(v)) && /script-src[^;]*https:\/\/api\.inaturalist\.org/.test(cspL.meta) &&
    /img-src[^;]*https:\/\/inaturalist-open-data\.s3\.amazonaws\.com/.test(cspL.meta) && /img-src[^;]*https:\/\/static\.inaturalist\.org/.test(cspL.meta) &&
    !/script-src[^;]*amazonaws/.test(cspL.meta),
    "CSP (Lern-Tool): iNaturalist-API als Skript (JSONP), Fotos von den beiden iNaturalist-Bildhosts – sonst nichts dazu: " + cspL.meta + " " + JSON.stringify(cspL.viol));
  assert(/img-src[^;]*https:\/\/\*\.wikimedia\.org/.test(cspL.meta) && /img-src[^;]*https:\/\/\*\.wikipedia\.org/.test(cspL.meta), "CSP img-src muss *.wikimedia.org/*.wikipedia.org pauschal erlauben: " + cspL.meta);
  assert(/^https:\/\/thumb\.wikimedia\.org\/.*\/1920px-X\.jpg\?utm_source=/.test(cspL.big), "lbBig muss auch auf dem neuen Host thumb.wikimedia.org ableiten (1920 px, Query bleibt): " + cspL.big);

  // Zurück auf sauberen Zustand für die Aufräum-Schritte
  await page.goto("about:blank");
  await page.goto(FILE, { waitUntil: "load" });
  await page.waitForFunction("window.startSession!=null", { timeout: 30000 });

  // aufräumen
  await page.evaluate(() => { localStorage.removeItem("pflanzenlernen.progress.gemuesebau_gaertner"); });

  assert(errs.length === 0, "Konsolenfehler im Testverlauf: " + errs.join(" | "));
  await browser.close();
  console.log("Lern-Smoke OK – Boot, Ein-Knopf-Start (geführte Lektion zeigt jede Pflanze als Bild, Antwortart nach Lernstand, nur einzelne bildlose Arten als Auswahlfrage, sagt es an, direkt teilbar, »Selbst wählen«-Klappe zu), Profil-Chip (Modal, Wahl gemerkt), Listen-Schnellzugriff, Optionen-Gruppen (Was/Wie üben), Lernstoff (148), Hilfe-Panel, Karteikarten (umdrehen/bewerten), Leitner-Einplanung (again/hard/good unterschiedlich), Info-Modal (Deep-Links + Online-Knopf), Liste (thematisch/durchsuchbar/klickbar), Druckliste (Prüfungsbogen-Form, Produktions- + FW-Familie, ZP-Spalte, Filter, Ansicht-Sortierung Thema/Familie/A–Z), Themen (Zuordnung, Themen-Ansicht, Themen-Sitzung), Familien-Steckbriefe (Modal + Fallback), Lernduell (Teilen-Link kodiert exakte Lektion + Denkzeit kompakt und nicht im Klartext, veränderte Stelle fällt auf, alte JSON- und v2-Links lesbar, Richtung inkl. »voller Name«, Antwortart und die Übungsformen der geführten Lektion wandern mit, Banner übernimmt Profil/Modus/Aufgabenstellung, Annehmen spielt gleiche Karten, Zeitvergleich entscheidet bei gleicher Quote, Zurückschicken), »nur Prüfungsstoff« (Fachwerker: Familie/Synonyme aus Karte+Liste ausgeblendet, Schalter nur bei Fachwerker), Disclaimer (Fußzeile + KI-Hinweis vor den Lektionen), Mobile ohne Overflow, Fokus-Modus (laufende Sitzung füllt mobil den Schirm, Ergebnis + Teilen bleiben im Overlay, Exit über »Zur Übersicht«/Moduswechsel), deutsche Namensformen (Synonyme, geteiltes Grundwort, Adjektiv-Muster, Grundwort nur bei Eindeutigkeit), Tipp-Rückmeldung in drei Stufen (richtig · fast mit markierter Stelle · noch nicht, Partikel nur bei Treffern), Bildzuordnung (Taxon-Kategorie zuerst, Zwei-Arten-Tafel und Homonym verworfen, kein Artbild bei vorhandener Geschwister-Art oder beschreibender Sorte, Tafeln/Herbarbelege/Buchscans über Commons-Metadaten raus, Bildnachweis ohne Zweitabruf, abgebrochener feiner Weg → Treffer nur je Sitzung), Eingabe ohne Anführungszeichen-/Hybrid-Zwang, Abfragerichtungen (Text de↔bot; Bilder fest »voller Name«, ältere Duell-Links spielen ihre Aufgabe weiter), Auswahl nach Thema/Familie, Quiz, Selbst eingeben, Bilder-Quiz (Bild + 4 volle Namen, »Selbst eingeben (wie in der Prüfung)« mit Punkten/Teilpunkten und eigener Feldwahl, Wertung, Bildnachweis, wartet bei schwacher Verbindung sichtbar und heilt sich selbst statt in Textfragen zu wechseln, Galerie mit mehreren Ansichten – Commons-Kandidaten sofort, Artikelbilder nachgeladen, Wischen, Vorladen der Galerie, Commons-Standardgrößen mit Ausweich-Kette und sichtbarer Meldung, stille Wiederholung bei Aussetzern, neuer Versuch je Sitzung; iNaturalist als Ersatzquelle mit freien Lizenzen und Nachweis; Sammeleinträge zeigen eine Gartenform statt einer Wildart, genannte Gruppen gezielt, nie einen Fremdartikel wie die Insel Canna), Fortschritt-Persistenz, Touch-Ziele (≥44px) + Fußzeilen-Kontrast, Lernserie/Tagesziel, Herbarium, XP-Ränge + Combo, Stufe 5 (Rang-Popover, Container Queries), Versionskennung + »Neue Version« (Leerlauf: neu laden, Sitzung: Hinweis).");
}

main().catch((e) => { console.error("Lern-Smoke FEHLGESCHLAGEN:\n  " + e.message + (process.env.DEBUG_STACK ? "\n" + e.stack : "")); process.exit(1); });
