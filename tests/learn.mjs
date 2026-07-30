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

  // Hinweis vor den Lektionen: automatisch/KI-erzeugte Inhalte, keine Gewähr –
  // muss ohne Aufklappen sichtbar sein und im Listenmodus verschwinden
  const note = await page.evaluate(() => {
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    const n = document.querySelector("#learnNote");
    const t = n ? n.textContent.replace(/\s+/g, " ") : "";
    const r = n ? n.getBoundingClientRect() : { height: 0 };
    const vor = !document.querySelector("#startRow").hidden && !n.hidden && r.height > 0;
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    const imListe = document.querySelector("#learnNote").hidden;
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    return { vor, imListe, ki: /generativer KI/.test(t), bild: /Bildauswahl/.test(t),
      gewaehr: /keine Gewähr/.test(t) && /Haftung/.test(t), amtlich: /offiziellen Prüfungslisten/.test(t), t };
  });
  assert(note.vor, "Der Hinweis muss vor dem Start der Lektion sichtbar sein: " + JSON.stringify(note));
  assert(note.ki && note.bild, "Hinweis muss KI-Erzeugung und Bildauswahl benennen: " + note.t);
  assert(note.gewaehr && note.amtlich,
    "Hinweis muss Gewähr/Haftung ausschließen und auf die offiziellen Listen verweisen: " + note.t);
  assert(note.imListe, "Im Listenmodus (keine Lektion) gehört der Hinweis ausgeblendet");

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

  // Tippen, drei Stufen: richtig · fast (mit korrekter Form) · noch nicht.
  // Dazu die kleine Belohnung: Partikel nur bei einem Treffer.
  const stufen = await page.evaluate(() => {
    const probe = (mach) => {
      document.querySelectorAll(".conf-host").forEach((h) => h.remove());
      const inp = document.querySelector("#typeIn"); if (!inp) return null;
      const soll = answerText(current), c = current;
      inp.value = mach(c, soll);
      document.querySelector("#chk").click();
      const fb = document.querySelector("#fb");
      const r = { soll, ein: inp.value, txt: fb.textContent,
        stufe: fb.querySelector(".good") ? "ok" : fb.querySelector(".near") ? "near" : "no",
        dif: (fb.querySelector(".dif") || {}).textContent || "",
        partikel: document.querySelectorAll(".conf-host .conf").length,
        box: (progress[c.key] || {}).box || 0 };
      document.querySelector("#wt").click();
      return r;
    };
    startSession();
    const exakt = probe((c, s) => s);                                  // exakt richtig
    const tippfehler = probe((c, s) => s.slice(0, -1) + "x");          // ein Buchstabe daneben → toleriert
    const nurGattung = probe((c) => c.g);                              // Gattung stimmt, Art fehlt → »fast«
    const daneben = probe((c) => "Zzzz qqqq");                         // nichts davon
    return { exakt, tippfehler, nurGattung, daneben };
  });
  assert(stufen.exakt.stufe === "ok" && stufen.exakt.partikel > 0,
    "Tippen: exakte Antwort muss »richtig« sein und die Partikel auslösen: " + JSON.stringify(stufen.exakt));
  assert(stufen.tippfehler.stufe === "ok" && /Schreibweise/.test(stufen.tippfehler.txt) && stufen.tippfehler.dif,
    "Tippen: kleiner Tippfehler zählt als richtig, muss aber die saubere Schreibweise zeigen: " + JSON.stringify(stufen.tippfehler));
  assert(stufen.nurGattung.stufe === "near" && /Gattung stimmt/.test(stufen.nurGattung.txt)
    && /richtig wäre/i.test(stufen.nurGattung.txt) && stufen.nurGattung.partikel === 0,
    "Tippen: nur die Gattung muss »fast« ergeben – mit Lob für das Richtige und ohne Partikel: " + JSON.stringify(stufen.nurGattung));
  assert(stufen.daneben.stufe === "no" && /Noch nicht/.test(stufen.daneben.txt),
    "Tippen: klar falsche Eingabe muss »noch nicht« ergeben: " + JSON.stringify(stufen.daneben));

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
    const hint = document.querySelector("#stage").textContent;
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
  assert(photo.hintOnline, "Bilder-Quiz: Startansicht weist nicht auf die Internet-Voraussetzung hin");
  assert(photo.hasImg && photo.src === PX, "Bilder-Quiz: kein Bild angezeigt");
  assert(photo.nOpts === 4 && photo.uniq === 4 && photo.hasCorrectOpt,
    "Bilder-Quiz: vier verschiedene Optionen inkl. der richtigen erwartet: " + JSON.stringify(photo));
  assert(photo.noName, "Bilder-Quiz: die Frage darf außer dem Bild nichts verraten");
  assert(photo.good && photo.scored, "Bilder-Quiz: richtige Antwort nicht gewertet");
  assert(photo.credit && photo.weiter, "Bilder-Quiz: Bildnachweis/Weiter-Knopf fehlen nach der Antwort");

  // Bilder-Quiz, Antwort »Namen tippen«: Eingabefeld direkt unter dem Bild
  const phType = await page.evaluate(async (PX) => {
    __clearPhotoCache();
    __setPhotoSource((card) => Promise.resolve({ thumb: PX, title: card.g, file: "T.jpg", url: "https://x/y" }));
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    const set = (id, v) => { const e = document.querySelector(id); e.value = v; e.dispatchEvent(new Event("change")); };
    set("#phAnswer", "type"); set("#dir", "img2bot");
    startSession();
    await new Promise((r) => setTimeout(r, 60));
    const hasImg = !!document.querySelector("#phImg"), hasInput = !!document.querySelector("#typeIn");
    const noOpts = document.querySelectorAll("#opts .opt").length === 0;
    document.querySelector("#typeIn").value = (current.g + " " + current.a).trim();
    document.querySelector("#chk").click();
    const fb = document.querySelector("#fb").innerHTML;
    return { hasImg, hasInput, noOpts, good: /Richtig!/.test(fb), credit: !!document.querySelector("#phSrc") };
  }, PX);
  assert(phType.hasImg && phType.hasInput && phType.noOpts,
    "Bilder-Quiz »tippen«: Eingabefeld unter dem Bild statt Auswahl erwartet: " + JSON.stringify(phType));
  assert(phType.good && phType.credit, "Bilder-Quiz »tippen«: Wertung/Bildnachweis fehlen: " + JSON.stringify(phType));

  // Bilder-Quiz, Antwort »wie in der Prüfung«: ein Feld je bewerteter Spalte, Punkte
  const phExam = await page.evaluate(async (PX) => {
    __clearPhotoCache();
    __setPhotoSource((card) => Promise.resolve({ thumb: PX, title: card.g, file: "T.jpg", url: "https://x/y" }));
    const set = (id, v) => { const e = document.querySelector(id); e.value = v; e.dispatchEvent(new Event("change")); };
    set("#phAnswer", "exam");
    const dirHidden = document.querySelector("#dirField").hidden;   // Richtung dann gegenstandslos
    const fieldsShown = !document.querySelector("#examFieldsRow").hidden;
    startSession();
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
    return { dirHidden, fieldsShown, keys, labels, fb, marks, partial: /Teilweise/.test(fb),
      pts: (fb.match(/([\d,]+) von ([\d,]+) Punkten/) || []).slice(1) };
  }, PX);
  assert(phExam.fieldsShown && phExam.dirHidden,
    "»wie in der Prüfung«: Feldwahl muss erscheinen, die Abfragerichtung entfallen: " + JSON.stringify(phExam));
  assert(phExam.keys.join() === "g,a,fam,de",
    "Produktions-Profil braucht Gattung, Art, Familie, Deutscher Name (Bogen-Reihenfolge): " + JSON.stringify(phExam.keys));
  assert(phExam.labels.some((l) => /Gattungsname\s*3 P\./.test(l)) && phExam.labels.some((l) => /Familienname\s*1 P\./.test(l)),
    "Feldbeschriftung/Punkte müssen dem Bogen entsprechen: " + JSON.stringify(phExam.labels));
  assert(phExam.marks.join("") === "✓✓✓✗",
    "Feldweise Bewertung erwartet (3 richtig, dt. Name falsch): " + JSON.stringify(phExam.marks));
  assert(phExam.partial && phExam.pts[0] === "7" && phExam.pts[1] === "10",
    "Teilpunkte erwartet: 7 von 10 Punkten, war " + JSON.stringify(phExam.pts) + " / " + phExam.fb);

  // Prüfungsfelder selbst bestimmen (Familie abwählen) + Fachwerker-Bogen
  const phFields = await page.evaluate(async (PX) => {
    __clearPhotoCache();
    __setPhotoSource((card) => Promise.resolve({ thumb: PX, title: card.g, file: "T.jpg", url: "https://x/y" }));
    const cb = document.querySelector('#examFieldsRow input[data-k="fam"]');
    cb.checked = false; cb.dispatchEvent(new Event("change"));
    startSession();
    await new Promise((r) => setTimeout(r, 60));
    const without = [...document.querySelectorAll("#examForm input")].map((i) => i.dataset.k);
    // Fachwerker: eigener Bogen (Dt. Name zuerst, Gattung/Art je 0,5 Punkte)
    document.querySelector("#nivSelect").value = "fachwerker";
    document.querySelector("#nivSelect").dispatchEvent(new Event("change"));
    startSession();
    await new Promise((r) => setTimeout(r, 60));
    const fwKeys = [...document.querySelectorAll("#examForm input")].map((i) => i.dataset.k);
    const fwLabels = [...document.querySelectorAll("#examForm .exlab")].map((e) => e.textContent.replace(/\s+/g, " ").trim());
    document.querySelector("#nivSelect").value = "gaertner";
    document.querySelector("#nivSelect").dispatchEvent(new Event("change"));
    __setPhotoSource(null);
    return { without, fwKeys, fwLabels };
  }, PX);
  assert(phFields.without.join() === "g,a,de",
    "Abgewähltes Feld darf nicht mehr abgefragt werden: " + JSON.stringify(phFields.without));
  assert(phFields.fwKeys.join() === "de,g,a" && phFields.fwLabels.some((l) => /0,5 P\./.test(l)),
    "Fachwerker-Bogen erwartet (Dt. Name zuerst, 0,5 Punkte): " + JSON.stringify(phFields));

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

  // zurück auf Auswahl, damit die folgenden Bilder-Prüfungen unverändert greifen
  await page.evaluate(() => {
    const e = document.querySelector("#phAnswer"); e.value = "mc"; e.dispatchEvent(new Event("change"));
  });

  // Bilder-Quiz ohne Netz: klare Ansage statt kaputter Ansicht
  const photoOff = await page.evaluate(async () => {
    __clearPhotoCache();
    __setPhotoSource(() => Promise.reject(new Error("network")));
    startSession();
    await new Promise((r) => setTimeout(r, 60));
    const txt = document.querySelector("#stage").textContent;
    return { note: /Keine Verbindung/i.test(txt), retry: !!document.querySelector("#phRetry") };
  });
  assert(photoOff.note && photoOff.retry,
    "Bilder-Quiz offline: Hinweis + »Erneut versuchen« erwartet: " + JSON.stringify(photoOff));

  // Arten ohne brauchbares Foto (z. B. Verbreitungskarte) werden übersprungen
  const photoSkip = await page.evaluate(async () => {
    const bad = ["Quercus_robur_range_map.svg", "Verbreitung_Fagus.png", "Wappen_Baden.svg"];
    const good = ["Quercus_robur_Blatt.jpg", "Rosa-canina-Bluete.JPG"];
    __clearPhotoCache(); __setPhotoSource(() => Promise.resolve(null));
    startSession();
    await new Promise((r) => setTimeout(r, 60));
    const skipped = document.querySelector("#stage").textContent;
    __setPhotoSource(null);   // wieder die echte Quelle (wird hier nicht mehr aufgerufen)
    return { filterBad: bad.every((f) => !usablePhoto(f)), filterGood: good.every((f) => usablePhoto(f)),
      note: /kaum Bilder/i.test(skipped) };
  });
  assert(photoSkip.filterBad && photoSkip.filterGood,
    "Bilder-Quiz: Karten/Diagramme müssen aussortiert, Fotos behalten werden: " + JSON.stringify(photoSkip));
  assert(photoSkip.note, "Bilder-Quiz: ohne verfügbare Bilder fehlt der erklärende Hinweis");

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

    __setJsonp(null); __clearPhotoCache();
    return { wege, kirscheFile: a && a.file, kirscheSrc: a && a.src, zwiebelFile: b && b.file, salbei: c,
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
  assert(zuordnung.salbei === null, "Bildzuordnung: Artikel ohne Gattungsbezug (Homonym) wird trotzdem genommen");
  assert(zuordnung.illuKoehler && !zuordnung.illuFoto,
    "Bildzuordnung: alte Tafeln (Köhler) werden nicht als solche erkannt: " + JSON.stringify(zuordnung));

  // Deutsche Namen: die Listen führen drei Muster – alle müssen als richtig zählen,
  // ohne dass ein blankes Adjektiv durchgeht (Profil: Gemüsebau/Gärtner)
  const deChk = await page.evaluate(() => {
    const t = (de, inp) => checkDeName(inp, { g: "X", a: "y", de, fam: "" });
    const rha = "Krauser / gewöhnlicher Rhabarber";
    const fen = "Knollen- / Gemüsefenchel";
    const kar = "Karotte / Möhre / Gelbe Rübe";
    return {
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
    };
  });
  assert(deChk.rhaHead && deChk.rhaA && deChk.rhaB,
    "»Rhabarber« und beide Vollformen müssen gelten: " + JSON.stringify(deChk));
  assert(!deChk.rhaAdjAlone && !deChk.rhaWrong,
    "Ein blankes Adjektiv (»Krauser«) darf nicht als Name zählen: " + JSON.stringify(deChk));
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

  // Abfragerichtung wählbar: Text-Modi de↔bot, Bilder-Modus Bild→bot/de
  const dirUI = await page.evaluate(() => {
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    const textOpts = [...document.querySelectorAll("#dir option")].map((o) => o.value);
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    const photoOpts = [...document.querySelectorAll("#dir option")].map((o) => o.value);
    document.querySelector('#modeTabs button[data-mode="list"]').click();
    const hiddenInList = document.querySelector("#dirField").hidden;
    document.querySelector('#modeTabs button[data-mode="cards"]').click();
    return { textOpts, photoOpts, hiddenInList, back: document.querySelector("#dir").value };
  });
  assert(dirUI.textOpts.join() === "de2bot,bot2de",
    "Text-Modi brauchen genau beide Richtungen: " + JSON.stringify(dirUI.textOpts));
  assert(dirUI.photoOpts.join() === "img2bot,img2de",
    "Bilder-Modus braucht Bild→botanisch und Bild→deutsch: " + JSON.stringify(dirUI.photoOpts));
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
    return { frontBot, label, big, deFirst: (c.de || "").split(/[,;/]/)[0].trim(), labels,
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
    const want = (c.de || "").split(/[,;/]/)[0].trim();
    const optIsDe = opts.includes(want) && !opts.includes((c.g + " " + c.a).trim());
    [...document.querySelectorAll("#opts .opt")].find((b) => b.querySelector("span:last-child").textContent === want).click();
    const quizGood = /Richtig!/.test(document.querySelector("#fb").innerHTML);
    document.querySelector('#modeTabs button[data-mode="type"]').click();
    setDir("bot2de"); startSession();
    const c2 = current;
    const variants = (c2.de || "").split(/[,;/]/).map((x) => x.trim()).filter(Boolean);
    const alt = variants[variants.length - 1];                 // auch der letzte Zweitname zählt
    document.querySelector("#typeIn").value = alt.replace(/-/g, "");  // ohne Bindestrich getippt
    document.querySelector("#chk").click();
    const typeGood = /Richtig!/.test(document.querySelector("#fb").innerHTML);
    return { optIsDe, quizGood, typeGood, alt, opts: opts.slice(0, 4) };
  });
  assert(revPlay.optIsDe, "bot→de: Quiz-Optionen müssen deutsche Namen sein: " + JSON.stringify(revPlay.opts));
  assert(revPlay.quizGood, "bot→de: richtige Quiz-Antwort nicht gewertet");
  assert(revPlay.typeGood,
    "bot→de: Tippen muss jede geführte Schreibweise akzeptieren (auch ohne Bindestrich): " + revPlay.alt);

  // Bilder-Quiz mit Richtung Bild → deutscher Name
  const photoDe = await page.evaluate(async (PX) => {
    __clearPhotoCache();
    __setPhotoSource((card) => Promise.resolve({ thumb: PX, title: card.g, file: "T.jpg", url: "https://x/y" }));
    document.querySelector('#modeTabs button[data-mode="photo"]').click();
    const d = document.querySelector("#dir"); d.value = "img2de"; d.dispatchEvent(new Event("change"));
    startSession();
    await new Promise((r) => setTimeout(r, 60));
    const c = current;
    const opts = [...document.querySelectorAll("#opts .opt")].map((b) => b.querySelector("span:last-child").textContent);
    const want = (c.de || "").split(/[,;/]/)[0].trim();
    const btn = [...document.querySelectorAll("#opts .opt")].find((b) => b.querySelector("span:last-child").textContent === want);
    if (btn) btn.click();
    const fb = document.querySelector("#fb").innerHTML;
    __setPhotoSource(null);
    return { hasImg: !!document.querySelector("#phImg"), optIsDe: opts.includes(want),
      noBot: !opts.includes((c.g + " " + c.a).trim()), good: /Richtig!/.test(fb), solBoth: /<i>/.test(fb) };
  }, PX);
  assert(photoDe.hasImg && photoDe.optIsDe && photoDe.noBot,
    "Bild→deutsch: Optionen müssen deutsche Namen sein: " + JSON.stringify(photoDe));
  assert(photoDe.good && photoDe.solBoth,
    "Bild→deutsch: Wertung bzw. Lösungszeile mit beiden Namen fehlt: " + JSON.stringify(photoDe));

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

  // Ansicht & Filter (Akkordion): Standard ist A–Z (flach, keine Filter-Tags);
  // Umschalten auf »Thema« zeigt Filter-Tags, ein Tag filtert die Liste
  const tagsort = await page.evaluate(() => {
    const total = document.querySelectorAll("#stage .sprow").length;
    // Standard: alphabetisch → Buchstaben-Header, keine Themen-Tags
    const botHeads = [...document.querySelectorAll("#stage .cathead")].map((e) => e.textContent.trim());
    const alphabetical = botHeads.length >= 2 && botHeads.every((h) => h.length === 1);
    const noTagsDefault = document.querySelectorAll("#listControls .cattag").length === 0;
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
    // zurück auf Standard (alle)
    document.querySelector('#listControls .sortbtn[data-sort="bot"]').click();
    const backAll = document.querySelectorAll("#stage .sprow").length;
    return { total, alphabetical, noTagsDefault, hasTags, afterFilter, onlyOneGroup, famReset, backAll };
  });
  assert(tagsort.alphabetical && tagsort.noTagsDefault,
    "Standard-Listenansicht sollte alphabetisch (Buchstaben-Header) und ohne Filter-Tags sein: " + JSON.stringify(tagsort));
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
      meta: /Fachrichtung Gemüsebau/.test(html) && /148 Arten/.test(html)
    };
  });
  assert(plist.n === 148 && plist.dataRows === 148, "Druckliste: 148 Datenzeilen erwartet, war " + plist.dataRows);
  assert(plist.catRows >= 1, "Druckliste: Themen-Zwischenzeilen fehlen");
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
      katOk: kat.bands.some((t) => /Gemüsepflanzen/.test(t)) && /sortiert nach Thema/.test(kat.meta),
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
    // Nicht-Gehölze behalten ihre Kategorie (vereinheitlicht)
    staude: themeOf("Hosta", "Cultivars", "Stauden", "staudengaertnerei_gaertner"),
    gras:   themeOf("Carex", "morrowii", "Ziergräser", "friedhofsgaertnerei_fachwerker"),
    unkraut: themeOf("Urtica", "dioica", "Unkräuter, Wildkräuter", "obstbau_gaertner"),
  }));
  const expect = {
    eiche: "Große Laubbäume", ahorn: "Kleinbäume & Großsträucher", kirsch: "Immergrüne Laubgehölze",
    coto: "Bodendecker & Zwergsträucher", wach: "Zwerg- & Kriechkoniferen", fichte: "Nadelbäume",
    rose: "Rosen", efeu: "Bodendecker & Zwergsträucher", apfelO: "Kernobst",
    apfelB: "Kleinbäume & Großsträucher", johann: "Beerenobst", staude: "Stauden",
    gras: "Gräser", unkraut: "Wild- & Unkräuter",
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
    // Themen stehen in Lern-Reihenfolge: Bäume vor Sträuchern vor Stauden
    const order = cats.indexOf("Große Laubbäume") < cats.indexOf("Blüten- & Ziersträucher")
      && cats.indexOf("Blüten- & Ziersträucher") < cats.indexOf("Stauden");
    return { cats, order, hasTree: cats.includes("Große Laubbäume"),
      hasShrub: cats.includes("Blüten- & Ziersträucher"), hasStaude: cats.includes("Stauden"),
      noVague: !cats.includes("Laubgehölze") && !cats.includes("Nadelgehölze"), n: cats.length };
  });
  assert(wuchs.hasTree && wuchs.hasShrub && wuchs.hasStaude && wuchs.n >= 5,
    "GaLaBau sollte nach Themen gegliedert sein (große Laubbäume, Ziersträucher, Stauden …): " + JSON.stringify(wuchs.cats));
  assert(wuchs.noVague, "Die unspezifischen Kategorien (Laub-/Nadelgehölze) dürfen als Thema nicht mehr auftauchen");
  assert(wuchs.order, "Themen-Reihenfolge falsch (Bäume → Sträucher → Stauden): " + JSON.stringify(wuchs.cats));

  // Lernstoff eingrenzen (»Optionen · Auswahl«): alle Arten · Thema · Pflanzenfamilie
  const themeSess = await page.evaluate(() => {
    const sel = document.querySelector("#cat");
    const opts = [...sel.options].map((o) => o.value);
    const groups = [...sel.querySelectorAll("optgroup")].map((g) => g.label);
    const pick = (v) => { sel.value = v; sel.dispatchEvent(new Event("change"));
      return [...document.querySelectorAll("#stage .sprow .sp-bot")].map((e) => e.textContent.trim()); };
    const baum = pick("t:Große Laubbäume");
    const rosa = pick("f:Rosaceae");
    sel.value = ""; sel.dispatchEvent(new Event("change"));
    const back = document.querySelectorAll("#stage .sprow").length;
    return { groups, hasTheme: opts.includes("t:Große Laubbäume"), hasFam: opts.includes("f:Rosaceae"),
      noVagueOpt: !opts.includes("t:Laubgehölze"), allLabel: sel.options[0].textContent,
      nTheme: baum.length, nFam: rosa.length, themeSample: baum.slice(0, 3), famSample: rosa.slice(0, 3), back };
  });
  assert(themeSess.hasTheme && themeSess.noVagueOpt,
    "Themen-Auswahl der Sitzung fehlt oder enthält noch Roh-Kategorien: " + JSON.stringify(themeSess));
  assert(themeSess.hasFam && themeSess.groups.join("|") === "Thema|Pflanzenfamilie",
    "Auswahl muss nach Thema UND Pflanzenfamilie gruppiert sein: " + JSON.stringify(themeSess.groups));
  assert(/^alle Arten \(\d+\)/.test(themeSess.allLabel),
    "Erste Option sollte »alle Arten (n)« sein, war: " + themeSess.allLabel);
  assert(themeSess.nTheme > 5 && themeSess.nTheme < themeSess.back,
    "Themen-Auswahl grenzt den Lernstoff nicht ein: " + JSON.stringify(themeSess));
  assert(themeSess.nFam > 3 && themeSess.nFam < themeSess.back,
    "Familien-Auswahl grenzt den Lernstoff nicht ein: " + JSON.stringify(themeSess));

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
  await page.waitForFunction("window.startChallenge!=null", { timeout: 10000 });
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
  await page.waitForFunction("window.startSession!=null", { timeout: 10000 });
  const kaputtIn = await page.evaluate(() => {
    const b = document.querySelector("#duelBanner");
    return { shown: !!(b && !b.hidden) };
  });
  assert(!kaputtIn.shown, "Lernduell: manipulierter Link wird trotzdem als Herausforderung angenommen");

  // Zurück auf sauberen Zustand für die Aufräum-Schritte
  await page.goto("about:blank");
  await page.goto(FILE, { waitUntil: "load" });
  await page.waitForFunction("window.startSession!=null", { timeout: 10000 });

  // aufräumen
  await page.evaluate(() => { localStorage.removeItem("pflanzenlernen.progress.gemuesebau_gaertner"); });

  assert(errs.length === 0, "Konsolenfehler im Testverlauf: " + errs.join(" | "));
  await browser.close();
  console.log("Lern-Smoke OK – Boot, Lernstoff (148), Hilfe-Panel, Karteikarten (umdrehen/bewerten), Leitner-Einplanung (again/hard/good unterschiedlich), Info-Modal (Deep-Links + Online-Knopf), Liste (thematisch/durchsuchbar/klickbar), Druckliste (Prüfungsbogen-Form, Produktions- + FW-Familie, ZP-Spalte, Filter, Ansicht-Sortierung Thema/Familie/A–Z), Themen (Zuordnung, Themen-Ansicht, Themen-Sitzung), Familien-Steckbriefe (Modal + Fallback), Lernduell (Teilen-Link kodiert exakte Lektion + Denkzeit kompakt und nicht im Klartext, veränderte Stelle fällt auf, alte JSON-Links lesbar, Banner übernimmt Profil/Modus, Annehmen spielt gleiche Karten, Zeitvergleich entscheidet bei gleicher Quote, Zurückschicken), »nur Prüfungsstoff« (Fachwerker: Familie/Synonyme aus Karte+Liste ausgeblendet, Schalter nur bei Fachwerker), Disclaimer (Fußzeile + KI-Hinweis vor den Lektionen), Mobile ohne Overflow, deutsche Namensformen (Synonyme, geteiltes Grundwort, Adjektiv-Muster, Grundwort nur bei Eindeutigkeit), Tipp-Rückmeldung in drei Stufen (richtig · fast mit markierter Stelle · noch nicht, Partikel nur bei Treffern), Bildzuordnung (Taxon-Kategorie zuerst, Zwei-Arten-Tafel und Homonym verworfen, kein Artbild bei vorhandener Geschwister-Art), Abfragerichtungen (de↔bot, Bild→bot/de), Auswahl nach Thema/Familie, Quiz, Tippen, Bilder-Quiz (Bild + 4 Optionen, Tippen, »wie in der Prüfung« mit Punkten/Teilpunkten und eigener Feldwahl, Wertung, Bildnachweis, Offline-Hinweis, Karten-Filter), Fortschritt-Persistenz.");
}

main().catch((e) => { console.error("Lern-Smoke FEHLGESCHLAGEN:\n  " + e.message); process.exit(1); });
