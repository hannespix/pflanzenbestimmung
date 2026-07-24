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

  // Entschlackte Startansicht: Feineinstellungen stecken in einer standardmäßig
  // zugeklappten »Optionen«-Klappe (Kategorie/ZP/Sitzungslänge), Modi + Start bleiben sichtbar
  const declutter = await page.evaluate(() => {
    const d = document.querySelector("#setOpts");
    return { isDetails: d && d.tagName === "DETAILS", closed: d && !d.open,
      holdsControls: d ? ["#cat", "#onlyzp", "#sessLen"].every((s) => d.querySelector(s)) : false,
      modesVisible: !document.querySelector("#modeTabs").hidden,
      startVisible: !document.querySelector("#startRow").hidden };
  });
  assert(declutter.isDetails && declutter.closed, "Optionen sollten in einer standardmäßig zugeklappten Klappe stecken");
  assert(declutter.holdsControls, "Die Optionen-Klappe muss Kategorie, ZP und Sitzungslänge enthalten");
  assert(declutter.modesVisible && declutter.startVisible, "Modi und »Sitzung starten« müssen ohne Aufklappen sichtbar sein");

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

  // Hilfe: Panel öffnet/schließt, Button zeigt aktiven Zustand
  const help = await page.evaluate(() => {
    const b = document.querySelector("#btnHelp"), h = document.querySelector("#helpPanel");
    b.click();
    const opened = !h.hidden && b.classList.contains("active") && b.getAttribute("aria-pressed") === "true";
    const hasContent = h.querySelectorAll(".hdl dt").length >= 4;
    b.click();
    const closed = h.hidden && !b.classList.contains("active");
    return { opened, hasContent, closed };
  });
  assert(help.opened && help.hasContent, "Hilfe-Panel öffnet nicht bzw. Inhalt fehlt");
  assert(help.closed, "Hilfe-Panel schließt nicht");

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
  assert(info.closed, "Info-Modal schließt nicht");

  // Wikipedia-Auflösung: Sorten-/Gruppen-Eintrag findet das reine Binom, NIE die bloße Gattung
  const wc = await page.evaluate(() => {
    const c = allCards.find((x) => /^beta$/i.test(x.g)) || { g: "Beta", a: "vulgaris Conditiva-Grp.", de: "Rote Bete" };
    return { name: (c.g + " " + c.a).trim(), cands: wikiCandidates(c) };
  });
  assert(wc.cands.some((t) => /^beta vulgaris$/i.test(t)), "Wiki-Kandidaten müssen das reine Binom »Beta vulgaris« enthalten (" + wc.name + " → " + JSON.stringify(wc.cands) + ")");
  assert(!wc.cands.some((t) => /^beta$/i.test(t)), "Wiki-Kandidaten dürfen NICHT die bloße Gattung »Beta« enthalten (griech. Buchstabe)");

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

  // Ansicht & Filter (Akkordion): Standard ist A–Z (flach, keine Filter-Tags);
  // Umschalten auf »Wuchsform« zeigt Filter-Tags, ein Tag filtert die Liste
  const tagsort = await page.evaluate(() => {
    const total = document.querySelectorAll("#stage .sprow").length;
    // Standard: alphabetisch → Buchstaben-Header, keine Kategorie-Tags
    const botHeads = [...document.querySelectorAll("#stage .cathead")].map((e) => e.textContent.trim());
    const alphabetical = botHeads.length >= 2 && botHeads.every((h) => h.length === 1);
    const noTagsDefault = document.querySelectorAll("#listControls .cattag").length === 0;
    // auf Wuchsform/Kategorie umschalten → Filter-Tags erscheinen
    document.querySelector('#listControls .sortbtn[data-sort="kategorie"]').click();
    const tagEls = [...document.querySelectorAll("#listControls .cattag")].filter((b) => b.dataset.cat);
    const hasTags = tagEls.length >= 1;
    tagEls[0].click();
    const afterFilter = document.querySelectorAll("#stage .sprow").length;
    const onlyOneGroup = document.querySelectorAll("#stage .catblock").length === 1;
    // Familie-Ansicht: Tags wechseln zur Dimension Familie, Filter wird zurückgesetzt
    document.querySelector('#listControls .sortbtn[data-sort="familie"]').click();
    const famReset = document.querySelectorAll("#stage .sprow").length === total;
    // zurück auf Standard (alle)
    document.querySelector('#listControls .sortbtn[data-sort="bot"]').click();
    const backAll = document.querySelectorAll("#stage .sprow").length;
    return { total, alphabetical, noTagsDefault, hasTags, afterFilter, onlyOneGroup, famReset, backAll };
  });
  assert(tagsort.alphabetical && tagsort.noTagsDefault,
    "Standard-Listenansicht sollte alphabetisch (Buchstaben-Header) und ohne Filter-Tags sein: " + JSON.stringify(tagsort));
  assert(tagsort.hasTags, "Umschalten auf Wuchsform zeigt keine Filter-Tags");
  assert(tagsort.afterFilter > 0 && tagsort.afterFilter < tagsort.total && tagsort.onlyOneGroup,
    "Kategorie-Tag filtert die Liste nicht auf eine Kategorie: " + JSON.stringify(tagsort));
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
      meta: /Fachrichtung Gemüsebau/.test(html) && /148 Arten/.test(html)
    };
  });
  assert(plist.n === 148 && plist.dataRows === 148, "Druckliste: 148 Datenzeilen erwartet, war " + plist.dataRows);
  assert(plist.catRows >= 1, "Druckliste: Kategorie-Zwischenzeilen fehlen");
  assert(plist.title && plist.heads, "Druckliste: Titel/Spaltenköpfe entsprechen nicht dem Prüfungsbogen (Produktion)");
  assert(plist.zpCol, "Druckliste: ZP-Spalte fehlt");
  assert(plist.filled && plist.meta, "Druckliste: Zeilen nicht gefüllt oder Kopfzeile falsch");
  assert(plist.nFiltered > 0 && plist.nFiltered < plist.n, "Druckliste: Suchfilter wirkt nicht (" + plist.nFiltered + ")");

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

  // Druckliste folgt der gewählten Ansicht: Wuchsform / Familie / A–Z
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
    const kat = bandsFor("kategorie"), fam = bandsFor("familie"), bot = bandsFor("bot");
    document.querySelector('.sortbtn[data-sort="kategorie"]').click(); buildPrintList(); // zurücksetzen
    return {
      katOk: kat.bands.some((t) => /Gemüsepflanzen/.test(t)) && /sortiert nach Wuchsform/.test(kat.meta),
      famOk: fam.bands.some((t) => /Asteraceae/.test(t)) && /sortiert nach Familie/.test(fam.meta),
      botOk: bot.bands.some((t) => /^A$/.test(t)) && bot.bands.every((t) => /^[A-ZÄÖÜ·]$/.test(t)) && /sortiert nach A–Z botanisch/.test(bot.meta),
      counts: [kat.n, fam.n, bot.n],
    };
  });
  assert(psort.katOk, "Druckliste (Wuchsform): Kategorie-Band/Meta fehlt");
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

  // Kategorien nach Wuchsform: GaLaBau (aus Quelle ohne Kategorien) ist jetzt
  // nach Nadelgehölze/Laubgehölze/Stauden/… gegliedert
  const wuchs = await page.evaluate(() => {
    document.querySelector("#frSelect").value = "garten_und_landschaftsbau";
    document.querySelector("#frSelect").dispatchEvent(new Event("change"));
    document.querySelector("#nivSelect").value = "gaertner";
    document.querySelector("#nivSelect").dispatchEvent(new Event("change"));
    // Ansicht auf Wuchsform/Kategorie schalten (Standard ist alphabetisch)
    document.querySelector('#listControls .sortbtn[data-sort="kategorie"]').click();
    const cats = [...document.querySelectorAll("#stage .cathead")].map((e) => e.childNodes[0].textContent.trim());
    return { cats, hasNadel: cats.includes("Nadelgehölze"), hasLaub: cats.includes("Laubgehölze"),
      hasStaude: cats.includes("Stauden"), n: cats.length };
  });
  assert(wuchs.hasNadel && wuchs.hasLaub && wuchs.hasStaude && wuchs.n >= 5,
    "GaLaBau sollte nach Wuchsform gegliedert sein (Nadel-/Laubgehölze, Stauden …): " + JSON.stringify(wuchs.cats));

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

  // zurück auf Standardprofil
  await page.evaluate(() => {
    document.querySelector("#frSelect").value = "gemuesebau";
    document.querySelector("#frSelect").dispatchEvent(new Event("change"));
  });

  // Fortschritt-Persistenz über einen Reload
  await page.waitForFunction("localStorage.getItem('pflanzenlernen.progress.gemuesebau_gaertner')!=null", { timeout: 5000 });
  const before = await page.evaluate(() => Object.keys(progress).length);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.startSession!=null", { timeout: 10000 });
  const after = await page.evaluate(() => Object.keys(progress).length);
  assert(after >= before && after > 0, "Lernfortschritt überlebte den Reload nicht: " + before + " -> " + after);

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
    const url = challengeURL();
    return { finished, hasShare, hasWa, hasCopy, url, dec: b64urlDec(url.split("#c=")[1]), correct: sess.correct, done: sess.done };
  });
  assert(duelShare.finished, "Lernduell: Quiz-Sitzung erreicht den Abschluss-Screen nicht");
  assert(duelShare.hasShare && duelShare.hasWa && duelShare.hasCopy, "Lernduell: Teilen-Block (Teilen/WhatsApp/Kopieren) fehlt");
  assert(duelShare.dec && duelShare.dec.p === "gemuesebau_gaertner" && duelShare.dec.m === "quiz",
    "Lernduell-Link kodiert Profil/Modus nicht: " + JSON.stringify(duelShare.dec));
  assert(Array.isArray(duelShare.dec.i) && duelShare.dec.i.length === duelShare.done && duelShare.dec.i.every((n) => Number.isInteger(n) && n >= 0),
    "Lernduell-Link kodiert die exakte Kartenauswahl (Indizes) nicht: " + JSON.stringify(duelShare.dec.i));
  assert(duelShare.dec.n === "Testine" && duelShare.dec.s === duelShare.correct && duelShare.dec.t === duelShare.done,
    "Lernduell-Link kodiert Name/Ergebnis nicht: " + JSON.stringify(duelShare.dec));

  // 2) Eingehende Herausforderung (#c=…): Banner erscheint, übernimmt Profil/Modus
  const b64 = await page.evaluate((idx) => b64urlEnc({ v: 1, p: "gemuesebau_gaertner", m: "quiz", i: idx, s: 1, t: 4, n: "Kollege" }), duelShare.dec.i);
  await page.goto("about:blank");                   // erzwingt echten Reload (Hash-Wechsel allein lädt nicht neu)
  await page.goto(FILE + "#c=" + b64, { waitUntil: "load" });
  await page.waitForFunction("window.startChallenge!=null", { timeout: 10000 });
  const duelIn = await page.evaluate(() => {
    const banner = document.querySelector("#duelBanner");
    return { shown: banner && !banner.hidden, txt: banner ? banner.textContent : "",
      hasAccept: !!document.querySelector("#btnAcceptDuel"), prof: profileId, mode };
  });
  assert(duelIn.shown && duelIn.hasAccept, "Lernduell: Banner/Annehmen-Knopf erscheint nicht bei #c=-Link");
  assert(/Kollege/.test(duelIn.txt) && /fordert dich heraus/.test(duelIn.txt), "Lernduell-Banner nennt Herausforderer/Text nicht: " + duelIn.txt);
  assert(duelIn.prof === "gemuesebau_gaertner" && duelIn.mode === "quiz",
    "Lernduell: Profil/Modus nicht aus dem Link übernommen: " + JSON.stringify(duelIn));

  // Annehmen spielt EXAKT die kodierten Karten; alle richtig → Sieg + Zurückschicken-Knopf
  const duelPlay = await page.evaluate((idx) => {
    document.querySelector("#btnAcceptDuel").click();
    const started = sess.cards.map((c) => allCards.indexOf(c));
    const sameSet = started.length === idx.length && started.every((v, k) => v === idx[k]);
    let guard = 0;
    while (document.querySelector("#opts") && guard++ < 60) {
      const correct = answerText(current).toLowerCase();
      const opt = [...document.querySelectorAll("#opts .opt")].find((b) => b.querySelector("span:last-child").textContent.toLowerCase() === correct);
      if (!opt) break; opt.click();
      const wt = document.querySelector("#wt"); if (wt) wt.click();
    }
    const txt = document.querySelector("#stage").textContent;
    return { sameSet, hasResult: !!document.querySelector(".duel-result"), win: /gewonnen/i.test(txt),
      backLabel: (document.querySelector("#btnShare") || {}).textContent || "" };
  }, duelShare.dec.i);
  assert(duelPlay.sameSet, "Lernduell: Annehmen spielt nicht exakt die kodierten Karten");
  assert(duelPlay.hasResult && duelPlay.win, "Lernduell: Vergleich/Sieg wird nicht angezeigt");
  assert(/zurückschicken/i.test(duelPlay.backLabel), "Lernduell: Revanche-/Zurückschicken-Knopf fehlt");

  // Zurück auf sauberen Zustand für die Aufräum-Schritte
  await page.goto("about:blank");
  await page.goto(FILE, { waitUntil: "load" });
  await page.waitForFunction("window.startSession!=null", { timeout: 10000 });

  // aufräumen
  await page.evaluate(() => { localStorage.removeItem("pflanzenlernen.progress.gemuesebau_gaertner"); });

  assert(errs.length === 0, "Konsolenfehler im Testverlauf: " + errs.join(" | "));
  await browser.close();
  console.log("Lern-Smoke OK – Boot, Lernstoff (148), Hilfe-Panel, Karteikarten (umdrehen/bewerten), Leitner-Einplanung (again/hard/good unterschiedlich), Info-Modal (Deep-Links + Online-Knopf), Liste (kategorisiert/durchsuchbar/klickbar), Druckliste (Prüfungsbogen-Form, Produktions- + FW-Familie, ZP-Spalte, Filter, Ansicht-Sortierung Wuchsform/Familie/A–Z), Familien-Steckbriefe (Modal + Fallback), Lernduell (Teilen-Link kodiert exakte Lektion, Banner übernimmt Profil/Modus, Annehmen spielt gleiche Karten, Vergleich/Sieg + Zurückschicken), »nur Prüfungsstoff« (Fachwerker: Familie/Synonyme aus Karte+Liste ausgeblendet, Schalter nur bei Fachwerker), Disclaimer, Mobile ohne Overflow, Quiz, Tippen, Fortschritt-Persistenz.");
}

main().catch((e) => { console.error("Lern-Smoke FEHLGESCHLAGEN:\n  " + e.message); process.exit(1); });
