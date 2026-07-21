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
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text()); });

  await page.goto(FILE, { waitUntil: "load" });
  await page.waitForFunction("window.startSession!=null", { timeout: 10000 });
  assert(errs.length === 0, "Konsolenfehler beim Boot: " + errs.join(" | "));

  // Lernstoff geladen, sauberer Zustand
  const setup = await page.evaluate(() => {
    localStorage.clear();
    $("#frSelect").value = "gemuesebau"; $("#nivSelect").value = "gaertner"; applyProfile();
    return { cards: allCards.length, pool: pool().length };
  });
  assert(setup.cards === 148, "Gemüsebau/Gärtner: 148 Arten erwartet, war " + setup.cards);

  // Karteikarten: Sitzung starten, umdrehen, »Gewusst« bewerten
  const cards = await page.evaluate(() => {
    richtung = "de2bot"; $("#richtung").value = "de2bot";
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    $("#sessLen").value = "8"; startSession();
    const hasCard = !!document.querySelector("#card");
    const key = current.key;
    document.querySelector("#card").click();               // umdrehen
    const flippedShown = /class="answer"/.test(document.querySelector("#card").innerHTML);
    document.querySelector(".rate .r-good").click();        // bewerten -> Box hoch, advance
    return { hasCard, flippedShown, box: (progress[key] || {}).box || 0,
             due: (progress[key] || {}).due || "", today: todayISO(), doneAfter: sess.done };
  });
  assert(cards.hasCard, "Karteikarte wird nicht angezeigt");
  assert(cards.flippedShown, "Karteikarte zeigt nach dem Umdrehen keine Antwort");
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
      hasLoad: !!document.querySelector("#wpLoad"),
      newtab: [...document.querySelectorAll("#infoScrim .srcgrid a")].every((a) => a.target === "_blank"),
    };
    closeInfo();
    res.closed = !document.querySelector("#infoScrim");
    return res;
  });
  assert(info.open && info.n >= 3 && info.hasWiki, "Info-Modal: Deep-Links (inkl. Wikipedia) fehlen");
  assert(info.newtab, "Info-Modal: Quell-Links müssen target=_blank (neuer Tab) sein");
  assert(info.hasLoad, "Info-Modal: »Online-Infos laden«-Knopf fehlt");
  assert(info.closed, "Info-Modal schließt nicht");

  // Wikipedia-Auflösung: Sorten-/Gruppen-Eintrag findet das reine Binom, NIE die bloße Gattung
  const wc = await page.evaluate(() => {
    const c = allCards.find((x) => /^beta$/i.test(x.g)) || { g: "Beta", a: "vulgaris Conditiva-Grp.", de: "Rote Bete" };
    return { name: (c.g + " " + c.a).trim(), cands: wikiCandidates(c) };
  });
  assert(wc.cands.some((t) => /^beta vulgaris$/i.test(t)), "Wiki-Kandidaten müssen das reine Binom »Beta vulgaris« enthalten (" + wc.name + " → " + JSON.stringify(wc.cands) + ")");
  assert(!wc.cands.some((t) => /^beta$/i.test(t)), "Wiki-Kandidaten dürfen NICHT die bloße Gattung »Beta« enthalten (griech. Buchstabe)");

  // Granularität der Deep-Links: reines Binom, KEIN Sorten-/Gruppen-Zusatz
  const gran = await page.evaluate(() => {
    const c = allCards.find((x) => /grp\.|convar\.|'/i.test(x.a));
    if (!c) return { skip: true };
    openInfo(c);
    const hrefs = [...document.querySelectorAll("#infoScrim .srcgrid a")].map((a) => decodeURIComponent(a.href));
    closeInfo();
    return { full: (c.g + " " + c.a).trim(), sn: searchName(c), hrefs };
  });
  if (!gran.skip) {
    assert(/ /.test(gran.sn) && !/grp\.|convar\.|'/i.test(gran.sn), "searchName muss das reine Binom sein (" + gran.full + " → " + gran.sn + ")");
    assert(gran.hrefs.length && gran.hrefs.every((h) => !/grp\.|convar\.|conditiva|aggregatum|cepa-grp/i.test(h)),
      "Deep-Link-URLs dürfen den Sorten-/Gruppen-Zusatz nicht enthalten: " + JSON.stringify(gran.hrefs));
    assert(gran.hrefs.some((h) => h.includes(gran.sn)), "Deep-Link-URLs müssen den Binom-Suchbegriff enthalten");
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

  // Tippen: korrekte Antwort eingeben -> »Richtig«
  const typed = await page.evaluate(() => {
    document.querySelector('#modeTabs button[data-mode="type"]').click();
    startSession();
    const inp = document.querySelector("#typeIn");
    inp.value = answerText(current);
    document.querySelector("#chk").click();
    return { good: /Richtig!/.test(($("#fb") || {}).innerHTML || "") };
  });
  assert(typed.good, "Tippen: korrekte Eingabe nicht als richtig gewertet");

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
  assert(list.cats >= 1 && list.allRows === 148, "Liste: 148 Zeilen in Kategorien erwartet, war " + list.allRows);
  assert(list.startHidden && list.searchShown, "Liste: Start-Leiste aus / Suchfeld an erwartet");
  assert(list.hitN > 0 && list.hitN < list.allRows && list.allMatch, "Liste-Suche »Allium« filtert nicht korrekt (" + list.hitN + ")");
  assert(list.backToAll === list.allRows, "Liste: Leeren der Suche stellt nicht alle Zeilen wieder her");
  assert(list.modalOpen, "Liste: Klick auf eine Art öffnet kein Info-Modal");

  // Fortschritt-Persistenz über einen Reload
  await page.waitForFunction("localStorage.getItem('pflanzenlernen.progress.gemuesebau_gaertner')!=null", { timeout: 5000 });
  const before = await page.evaluate(() => Object.keys(progress).length);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.startSession!=null", { timeout: 10000 });
  const after = await page.evaluate(() => Object.keys(progress).length);
  assert(after >= before && after > 0, "Lernfortschritt überlebte den Reload nicht: " + before + " -> " + after);

  // aufräumen
  await page.evaluate(() => { localStorage.removeItem("pflanzenlernen.progress.gemuesebau_gaertner"); });

  assert(errs.length === 0, "Konsolenfehler im Testverlauf: " + errs.join(" | "));
  await browser.close();
  console.log("Lern-Smoke OK – Boot, Lernstoff (148), Karteikarten (umdrehen/bewerten), Leitner-Einplanung (again/hard/good unterschiedlich), Info-Modal (Deep-Links + Online-Knopf), Liste (kategorisiert/durchsuchbar/klickbar), Quiz, Tippen, Fortschritt-Persistenz.");
}

main().catch((e) => { console.error("Lern-Smoke FEHLGESCHLAGEN:\n  " + e.message); process.exit(1); });
