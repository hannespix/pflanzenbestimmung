# CLAUDE.md — Arbeitsanweisungen

Dieses Repo enthält ein **Prüfungslisten-Werkzeug für die Pflanzenkenntnis-Prüfung**
der grünen Berufe (Abschlussprüfung Gärtner/in und Fachwerker/in, alle sieben
Fachrichtungen; zuständige Stelle: Regierungspräsidium Freiburg). Es zieht zufällig
Pflanzen aus einer Liste, druckt Prüfungsbogen und Musterlösung und rechnet Noten.

Bitte alle Antworten und Commit-/PR-Texte **auf Deutsch**.

---

## Nicht verhandelbar

- **Vollständig offline. Kein CDN, keine externen Ressourcen.** Alle Bibliotheken
  werden beim Build inline eingebettet. `python3 tools/check_offline.py` muss grün
  bleiben (läuft in CI).
- **Eine bewusste Ausnahme, nur im Lern-Tool:** Das »ℹ Mehr zur Pflanze«-Modal bietet
  **optionale** Online-Infos (deutsche Wikipedia). Sie sind **opt-in** (nur auf
  Knopfdruck), laden **nichts beim Seitenaufbau** und nutzen **JSONP** (zur Laufzeit
  erzeugtes `<script>`) statt `fetch`/`XHR` – dadurch bleibt `check_offline.py` grün
  und der Kern (Karteikarten/Quiz/Tippen) funktioniert **ohne Netz** vollständig
  weiter; nur die Anreicherung entfällt. Die Deep-Link-Buttons öffnen bloß einen neuen
  Tab. **Das Prüfungswerkzeug bleibt strikt offline** – dort keine Online-Funktion.
- **Kein Framework, kein Build-Tool-Zoo.** Reines Vanilla-JS, eine `app.js`, ein
  `template.html`. Kein React/Vue/Svelte, kein npm-Bundler, kein TypeScript.
  Node wird nur für das Konverter-Skript (`tools/xlsx_to_seed.mjs`) gebraucht.
- **Keine Datenbank-Engine.** Früher lief das Tool auf sql.js/WASM — das wurde
  bewusst entfernt (siehe README, Abschnitt „Entstehung"). Daten sind ein reines
  JS-Array, Persistenz läuft über `localStorage`. **sql.js/WASM nicht wieder einführen.**
- **Einzige Runtime-Bibliothek: SheetJS** (`lib/xlsx.full.min.js`), nur für den
  Excel-Import. Nicht ersetzen, nicht per CDN laden.
- **Keine Secrets committen.** Keine API-Keys, keine Tokens im Repo.
- Deutschsprachige Oberfläche. BW-Kontext. Offizielle Texte in der Ich-Perspektive
  (»meine Empfehlung«, »ich«) — nicht »wir«.

---

## Architektur & Datenfluss

Aus **einer** gemeinsamen Pflanzendatenbank (`seeds/`) werden **drei** eigenständige
Offline-Dateien gebaut — eine Startseite und die zwei Werkzeuge:

```
src/start.html  ──────────────► dist/index.html            Startseite (verzweigt zu Lernen/Prüfen)
                                 (start.html + Kennzahlen, statisch, ohne Seeds)

                          ┌────► dist/pflanzenkenntnis.html  Prüfungswerkzeug (Prüfende)
seeds/*.json  ────────────┤      (template.html + app.js  + Seeds + SheetJS inline)
src/{template,app}.js  ───┤
src/{learn.html,learn.js} ┼────► dist/pflanzen-lernen.html   Lern-Tool (Azubis)
lib/xlsx.full.min.js  ────┘      (learn.html    + learn.js + Seeds, OHNE SheetJS)
                → build.py schreibt alle drei Dateien + versionierte Root-Kopien
```

**Startseite** (`index.html`) — gemeinsamer Einstieg, verzweigt zu **Lernen**
(`pflanzen-lernen.html`) und **Prüfen** (`pflanzenkenntnis.html`); die beiden Tools
sind zusätzlich direkt untereinander verlinkt:
- **`src/start.html`** — statische Seite mit dem Platzhalter `/*__STATS__*/`
  (von `build.py` durch die Kennzahl der Datenbank ersetzt, z. B. »14 Profile ·
  2114 Arten«). Keine Seeds, kein JS. Baut nur, wenn `src/start.html` existiert.

**Prüfungswerkzeug** (`pflanzenkenntnis.html`):
- **`src/template.html`** — HTML-Gerüst, gesamtes CSS und die Platzhalter
  `/*__XLSX_JS__*/`, `/*__APP_JS__*/`, `/*__SEEDS__*/{}`.
- **`src/app.js`** — die komplette Logik (Vanilla JS, IIFE `boot()` am Ende).

**Lern-Tool** (`pflanzen-lernen.html`, für Azubis — nur Üben, keine Prüfungslisten,
keine Noten):
- **`src/learn.html`** — eigenes HTML-Gerüst/CSS mit den Platzhaltern
  `/*__APP_JS__*/` und `/*__SEEDS__*/{}` (kein `/*__XLSX_JS__*/` — SheetJS wird nicht
  gebraucht, daher deutlich kleiner).
- **`src/learn.js`** — Lernlogik (Vanilla JS): Karteikarten mit Leitner-SRS,
  Multiple-Choice-Quiz, Tippen; Namensraum `pflanzenlernen.` im `localStorage`.
- Baut nur, wenn **beide** Dateien existieren; nutzt dieselben `SEEDS`.

**Gemeinsam:**
- **`seeds/<profil-id>.json`** — eine Pflanzenliste je Profil. Dateiname = Profil-ID.
  `build.py` sammelt automatisch **alle** Dateien aus `seeds/` in das globale
  Objekt `SEEDS = { "<profil-id>": [ [gattung, art, familie, dt_name, kategorie, zp, synonyme], … ] }`.
- **`build.py`** — fügt alles zusammen und schreibt beide `dist/*.html` plus die
  versionierten Root-Kopien.

Zur **Laufzeit** hält das Tool die Daten pro Profil getrennt:
- Beim Start wird das zuletzt gewählte Profil geladen (oder `gemuesebau_gaertner`).
- Gibt es im `localStorage` (Key `pflanzenkenntnis.data.<profil-id>`) gespeicherte
  Daten, werden diese genommen — sonst der hinterlegte Seed.
- Jede Änderung (Import, Hinzufügen, Bearbeiten, Löschen, Schema, Notenschlüssel)
  wird sofort in den Browser-Speicher dieses Profils geschrieben.
- »Standardliste« löscht den Browser-Speicher des Profils und stellt den Seed her.

---

## Build & Test

```bash
python3 build.py                                         # -> alle drei dist/*.html + Root-Kopien
python3 tools/check_offline.py dist/index.html             # Offline-Check Startseite (muss grün sein)
python3 tools/check_offline.py dist/pflanzenkenntnis.html  # dito Prüfungswerkzeug
python3 tools/check_offline.py dist/pflanzen-lernen.html   # dito Lern-Tool
```

Node (Konverter und Tests):

```bash
node tools/xlsx_to_seed.mjs <excel> <profil-id> [--sheet "Blattname"]
bash tools/rebuild_seeds.sh            # alle Seeds aus data/<id>.<ext> neu erzeugen
node tests/start.mjs                    # Puppeteer-Smoke Startseite (Verzweigung)
node tests/smoke.mjs                    # Puppeteer-Smoke Prüfungswerkzeug (npm test)
node tests/learn.mjs                    # Puppeteer-Smoke Lern-Tool
```

Der Smoke-Test nutzt `puppeteer` oder `puppeteer-core` und findet Chromium über
`PUPPETEER_EXECUTABLE_PATH` bzw. ein vorinstalliertes Playwright-Chromium.

**Funktionstests** laufen mit Puppeteer gegen die gebaute Datei (`file://`) –
siehe `tests/smoke.mjs`. Ein neuer Test soll mindestens prüfen: Boot ohne
Konsolenfehler, korrekte Zeilenzahl, Profilwechsel, `localStorage`-Persistenz
über einen Reload, Ziehen und Aufbau des Druckbogens. Beispielmuster:

```js
import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless:'new', args:['--no-sandbox'] });
const p = await b.newPage();
const errs = []; p.on('pageerror', e=>errs.push(e.message));
await p.goto('file://'+process.cwd()+'/dist/pflanzenkenntnis.html', { waitUntil:'load' });
await p.waitForFunction("window.pickExcel!=null");
// … assertions … 
if (errs.length) throw new Error(errs.join('\n'));
await b.close();
```

Grundsatz: **Erst bauen, dann Offline-Check, dann Puppeteer-Smoke**, bevor ein PR
als fertig gilt.

---

## Datenmodell

**Pflanze** (Laufzeit-Objekt):
```
{ id, gattung, art, familie, deutscher_name, kategorie, zp(0|1), synonyme, bemerkungen }
```

**Seed-Zeile** (in `seeds/*.json`, kompaktes Array):
```
[ gattung, art, familie, deutscher_name, kategorie, zp(0|1), synonyme ]
```

**Profil** (`PROFILE_DEFS[id]` in `app.js`):
```
{ id, fr, niveauKey, niveau, anzahl, schema, seed }
```
- `id = slug(fachrichtung) + "_" + niveauKey`
- `slug`: Kleinbuchstaben, ä→ae ö→oe ü→ue ß→ss, alles Übrige → `_`.

**Prüfungsschema** (`schema`, pro Profil, editierbar & gespeichert):
```
{ anzahl, cols:[ {key, pts}, … ], scale:{ mode:"linear"|"ihk", lin:[g1,g2,g3,g4,g5] } }
```
- `cols` = bewertete Felder in Reihenfolge; nur `pts>0` erscheinen auf dem Bogen.
- mögliche `key`: `gattung`, `art`, `familie`, `deutscher_name`.
- `lin` = Prozent-Untergrenzen der Noten 1..5 (linearer Schlüssel).

---

## Fachliche Invarianten (bitte respektieren)

- **Sieben Fachrichtungen:** Baumschule, Friedhofsgärtnerei, Garten- und
  Landschaftsbau, Gemüsebau, Obstbau, Staudengärtnerei, Zierpflanzenbau.
- **Zwei Niveaus:** Gärtner/in = **20** Pflanzen, Fachwerker/in = **15** Pflanzen.
  Fachwerker gibt es in jeder Fachrichtung mit **eigenen** Listen.
- **Gattung = erstes Wort** des botanischen Namens, **Art = Rest** (inkl.
  `var.`/`ssp.`/Kultivar-Gruppen). Beim Import wird nach `var.`/`ssp.`/`subsp.`/
  `f.`/`cv.`/`convar.` ein Leerzeichen gesetzt und Mehrfach-Leerzeichen bereinigt.
- **Standard-Bewertung** (Gemüsebau, ggf. weitere): Gattung 3, Art 3, Familie 1,
  Deutscher Name 3 = **10 P./Pflanze**. **Nicht alle Fachrichtungen sind gleich** —
  Spalten und Punkte können abweichen und sind pro Profil einstellbar.
- **Notenskala Baden-Württemberg = linear/gleichmäßig.** Rechtlicher Hintergrund:
  VGH Baden-Württemberg, Urt. v. 24.1.1979 — die Punkt-Noten-Zuordnung muss
  grundsätzlich gleichmäßig sein (jede Note gleiche Spannweite), Ausnahmen nur bei
  oberster/unterster Note. Standard-Grenzen (Prozent, ab dem die Note gilt):
  **1 ≥ 90, 2 ≥ 70, 3 ≥ 50, 4 ≥ 30, 5 ≥ 10, 6 < 10**; Dezimalnote linear
  (`6 − 5·%`). Grenzen sind pro Profil editierbar.
- **IHK-Schlüssel** (100-Punkte, ungleichmäßig: 92/81/67/50/30) ist als
  Umschaltoption vorhanden, inkl. offizieller Dezimaltabelle. Für die grünen Berufe
  in BW ist **linear** der Standard.
- **Zwei Druckvarianten:** Prüfungsbogen (leer, zum Ausfüllen) und Musterlösung
  (gefüllt, mit Punktespalte, »Nur für Prüfende«).

---

## Aufgabe: neue Fachrichtung / Fachwerker-Liste einbauen

1. Excel nach `data/` legen (sprechender Name).
2. Konvertieren:
   ```bash
   node tools/xlsx_to_seed.mjs data/<datei>.xlsx <profil-id>
   ```
   Gültige Profil-IDs siehe unten. Bei mehreren Fachrichtungen je Blatt:
   `--sheet "Blattname"`.
3. **Ausgabe prüfen:** stimmen Artenzahl, Kategorien und die Gattung/Art-Trennung?
   Notfalls die Excel-Kopfzeile korrigieren (Spalten »Botanischer Name« + »Familie«
   müssen erkennbar sein) und erneut konvertieren.
4. `python3 build.py` und `python3 tools/check_offline.py`.
5. Puppeteer-Smoke: Profil auswählen, Liste sichtbar, ziehen, Bogen bauen.
6. Weicht das Schema ab (Spalten/Punkte/Anzahl/Skala), siehe nächster Abschnitt.

**Die 14 Profil-IDs:**
```
baumschule_gaertner                 baumschule_fachwerker
friedhofsgaertnerei_gaertner        friedhofsgaertnerei_fachwerker
garten_und_landschaftsbau_gaertner  garten_und_landschaftsbau_fachwerker
gemuesebau_gaertner                 gemuesebau_fachwerker
obstbau_gaertner                    obstbau_fachwerker
staudengaertnerei_gaertner          staudengaertnerei_fachwerker
zierpflanzenbau_gaertner            zierpflanzenbau_fachwerker
```

## Aufgabe: profil-spezifisches Schema/Skala hinterlegen

Endnutzer können Schema und Notenschlüssel pro Profil im Tool selbst einstellen
(Buttons »Prüfungsschema« und »Notenrechner«); die Einstellung wird im Browser
gespeichert. Soll ein abweichendes Schema **als Standard hart hinterlegt** werden,
in `src/app.js` nach der Erzeugung von `PROFILE_DEFS` einen Override setzen, z. B.:

```js
// Beispiel: Fachrichtung X bewertet ohne Familie, dafür dt. Name mit 4 Punkten
PROFILE_DEFS["xyz_gaertner"].schema = {
  anzahl: 20,
  cols: [ {key:"gattung",pts:3}, {key:"art",pts:3}, {key:"deutscher_name",pts:4} ],
  scale: { mode:"linear", lin:[90,70,50,30,10] }
};
```
Danach neu bauen und testen. Achtung: Ein bereits im Browser gespeichertes Profil
behält seine dort gespeicherte Schema-Kopie — der neue Default greift erst nach
»Standardliste« bzw. für frische Browser.

---

## Codestil

- Deutsch in UI-Strings und Kommentaren.
- Kompakt, aber lesbar. Keine Formatter-Kriege — bestehenden Stil beibehalten.
- DOM-Helfer `$`, `el`, `esc` aus `app.js` nutzen. Kein jQuery.
- **Kein** `localStorage`/`sessionStorage` in erklärender Doku als »verboten«
  behandeln — hier ist es die gewollte Persistenz (das Tool läuft als lokale Datei,
  nicht als eingebettetes Artefakt).
- Vor jedem PR: `build.py` + `check_offline.py` + Puppeteer-Smoke grün.

---

## Erledigt

- [x] Seeds für **alle 14 Profile** aus den Excel-Listen erzeugt (2114 Arten).
      Quellen liegen als `data/<profil-id>.<ext>`; `tools/rebuild_seeds.sh`
      erzeugt alle Seeds reproduzierbar neu.
- [x] Bewertungsschemata hart hinterlegt: **alle 7 Fachwerker** Dt. Name 3 /
      Gattung 0,5 / Art 0,5 = 60 P. (15, Dt. Name zuerst); **Gärtner GaLaBau**
      1/1/2 = 80 P. (20); **Gärtner Produktionsfachrichtungen** Standard 3/3/1/3
      = 200 P. (20). Overrides in `app.js` nach `PROFILE_DEFS`; Produktion nutzt
      das Standardschema (kein Override).
- [x] Spaltenreihenfolge im Prüfungsschema editierbar (▲▼); Punkte mit
      Nachkommastellen (0,5) und deutschem Dezimalkomma.
- [x] Prüfungen nach Prüfungsdatum speichern (»Prüfungen«-Panel): gezogene Liste
      als Snapshot samt Schema in `localStorage` (Key `pflanzenkenntnis.exams`),
      Laden/Drucken/JSON-Download/Löschen. `buildSheet(mode, ctx)` druckt aus dem
      Snapshot. Backup-`.json` pro Prüfung.
- [x] Einstellungen (global, Key `pflanzenkenntnis.settings`): Bogen-Titel,
      zuständige Stelle (2 Zeilen) und Musterlösungs-Vermerk editierbar, damit
      andere zuständige Stellen als das RP Freiburg das Werkzeug nutzen können.
      `buildSheet` liest den Kopf aus `settings`.
- [x] Auswahl-/Bogen-Vorschau (`#previewPanel`): aktuelle Auswahl bearbeiten –
      Reihenfolge ▲▼, Art bearbeiten (Writeback in `cache`/DB, inkl. Bemerkungen/
      Synonyme), entfernen, bestehende/neue Art ergänzen.
- [x] Prüfungen kopieren (neues Datum) und geladene Prüfung nach Bearbeitung
      aktualisieren (`loadedExamId`).
- [x] Sichtbares Feedback für geöffnete Modul-Panels: aktive Toggle-Buttons
      (`.btn.active` + `aria-pressed`), zentral über `syncPanelButtons()`.
- [x] UI aufgeräumt: Druck-Dialog (`#printScrim`, `askPrintMode(cb)`) statt
      `window.prompt`; Kopf-Werkzeugleiste in beschriftete Gruppen (Liste ·
      Werkzeuge · Sicherung), Speicherstatus oben rechts; Auswahl-Leiste mit
      »Ziehen« zuerst und gruppierten Aktionen.
- [x] Ausführliche Hilfe (`#helpPanel`, Button »Hilfe«) mit Kurzanleitung und
      Erklärung jeder Funktion; detaillierte `title`-Tooltips auf Buttons/Feldern.
- [x] Sicherung enthält Prüfungen und Einstellungen (`backupData`/`applyBackup`).
- [x] GitHub-Pages-Deploy nach jedem Merge (`.github/workflows/pages.yml`).
- [x] Puppeteer-Smoke-Test (`tests/smoke.mjs`) und CI-Integration (`build.yml`).
- [x] `localStorage`-Ausfall-Fallback (In-Memory) für Kiosk-/Sandbox-Profile.
- [x] Konverter-Ladefehler behoben (SheetJS-Standalone via require lieferte unter
      aktuellem Node ein leeres Objekt) und Import robuster gemacht (Sorte-Spalte,
      unbeschriftete/AP-ZP-Markerspalten, Verwendungs-Kategorie, Hybrid-Gattungen).
- [x] **Zweites Werkzeug: Lern-Tool für Azubis** (`pflanzen-lernen.html`, aus
      denselben Seeds). Kein Prüfungslisten-Ziehen, kein Notenschlüssel. Drei Modi:
      **Karteikarten** mit Spaced-Repetition (Leitner-Boxen 1–5, Intervalle
      1/3/7/16/35 Tage; Selbsteinschätzung Nochmal/Unsicher/Gewusst plant je Box
      unterschiedlich ein und aktualisiert den Fortschritt live, »Nochmal« zeigt die
      Karte in derselben Sitzung erneut), **Multiple-Choice-Quiz**
      (Ablenker bevorzugt aus gleicher Kategorie/Familie) und **Tippen**
      (tippfehlertolerant, Gattung/Art bzw. Synonyme getrennt geprüft).
      Abfragerichtung de→bot / bot→de / Art→Familie, Filter Kategorie/ZP,
      Sitzungslänge. Fortschritt je Profil im `localStorage` (Namensraum
      `pflanzenlernen.`), Link zurück zur Prüfungsversion. `src/learn.html` +
      `src/learn.js`; `build.py` baut beide Dateien; Smoke-Test `tests/learn.mjs`;
      CI und Pages-Deploy erfassen beide Dateien.
- [x] **Pflanzen-Info-Modal im Lern-Tool** (»ℹ Mehr zur Pflanze«): kuratierte
      Deep-Links je Art (Wikipedia/NaturaDB/Baumkunde/Gaißmayer/Bilder-Suche/iNaturalist,
      aus dem botan. Namen gebaut, Zusatzquellen nach Fachrichtung; öffnen neuen Tab →
      offline-rein) plus **opt-in** »Online-Infos laden« via **Wikipedia-JSONP**
      (deutscher Kurztext + Vorschaubild direkt im Modal, funktioniert auch als lokale
      Datei, Cache je Art, Offline-/Nicht-gefunden-Fallback mit »Erneut versuchen«,
      Quelle CC BY-SA). Trigger in Karteikarte/Quiz/Tippen. `check_offline.py` bleibt
      grün (kein `fetch`, kein statisches `script src`). `tests/learn.mjs` prüft Modal
      + Deep-Links offline (ohne den Netz-Abruf auszulösen).
- [x] **Nachschlage-Liste im Lern-Tool** (vierter Modus »Liste«): alle Arten des
      Profils nach Kategorie gruppiert (wie im Prüfungswerkzeug), **durchsuchbar**
      (Name/Familie/Synonym, akzent-tolerant via `deacc`); Klick auf eine Art öffnet
      das Info-Modal. Start-Leiste und Fortschritt sind im Listenmodus ausgeblendet
      (`applyMode()`); `[hidden]{display:none!important}` sorgt dafür, dass das
      Attribut trotz `display:flex` greift. `tests/learn.mjs` deckt Liste + Suche ab.
- [x] **Gemeinsame Startseite** (`index.html`, aus `src/start.html`): verzweigt zu
      **Lernen** und **Prüfen** (zwei Karten), zeigt die Kennzahl der gemeinsamen
      Datenbank (Platzhalter `/*__STATS__*/`). Reziproker »Lernversion«-Link im
      Prüfungswerkzeug (das Lern-Tool verlinkt bereits die »Prüfungsversion«).
      `build.py` schreibt `index.html`; Pages deployt sie als Root (`_site/index.html`);
      Smoke-Test `tests/start.mjs` klickt beide Verzweigungen durch; CI prüft alle drei
      Dateien (Offline-Check + Smoke).

## Offene Aufgaben (TODO)

- [ ] Fehlende Einzelangaben aus den Quelllisten prüfen/ergänzen (z. B. fehlt bei
      `garten_und_landschaftsbau_gaertner` die Familie zu *Chimonanthus praecox* –
      so in der Excel; im Tool nachtragbar).
- [ ] Bei künftigen Listen-Updates: Excel nach `data/<profil-id>.<ext>` legen,
      `tools/rebuild_seeds.sh` (oder Konverter je Datei) laufen lassen, bauen,
      Offline-Check + Smoke-Test.
