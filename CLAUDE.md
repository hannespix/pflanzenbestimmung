# CLAUDE.md — Arbeitsanweisungen

Dieses Repo enthält ein **Prüfungslisten-Werkzeug für die Pflanzenkenntnis-Prüfung**
der **Gärtnerberufe** (Abschlussprüfung Gärtner/in und Fachwerker/in, alle sieben
Fachrichtungen; zuständige Stelle: Regierungspräsidium Freiburg). Es zieht zufällig
Pflanzen aus einer Liste, druckt Prüfungsbogen und Musterlösung und rechnet Noten.

Bitte alle Antworten und Commit-/PR-Texte **auf Deutsch**.

---

## Nicht verhandelbar

- **Keine externen Ressourcen, kein CDN.** Jede Seite lädt nichts nach und rechnet
  komplett im Browser – dadurch funktioniert sie nach dem ersten Aufruf **auch ohne
  Internet** (online, als installierte App oder als Datei per `file://`). Alle
  Bibliotheken werden beim Build inline eingebettet. `python3 tools/check_offline.py`
  muss grün bleiben (läuft in CI).
  *Wortwahl in der Oberfläche:* nicht »vollständig offline« schreiben – bei einer
  Webseite klingt das widersprüchlich. Stattdessen »läuft im Browser, auch ohne
  Internet« bzw. »nach dem ersten Aufruf ohne Internet nutzbar«.
- **Zwei bewusste Ausnahmen, beide nur im Lern-Tool und beide opt-in:**
  (1) Das »ℹ Mehr zur Pflanze«-Modal bietet **optionale** Online-Infos (deutsche
  Wikipedia, nur auf Knopfdruck). (2) Der **Lernmodus »Bilder«** lädt Bilder von
  Wikipedia/Wikimedia Commons – aber erst, wenn der Modus gestartet wird.
  Beide laden **nichts beim Seitenaufbau** und nutzen **JSONP** (zur Laufzeit
  erzeugtes `<script>`) statt `fetch`/`XHR` – dadurch bleibt `check_offline.py` grün.
  Der Kern (**Karteikarten/Quiz/Tippen/Liste**) funktioniert **ohne Netz** vollständig
  weiter; ohne Verbindung sagt der Bilder-Modus das klar an. Die Deep-Link-Buttons
  öffnen bloß einen neuen Tab. **Das Prüfungswerkzeug bleibt strikt offline** – dort
  keine Online-Funktion.
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

Aus **einer** gemeinsamen Pflanzendatenbank (`seeds/`) werden **vier** eigenständige
Offline-Dateien gebaut — eine Startseite, die zwei Werkzeuge und eine statische
Rechtliches-Seite (Impressum & Datenschutz):

```
src/start.html  ──────────────► dist/index.html            Startseite (verzweigt zu Lernen/Prüfen)
                                 (start.html + Kennzahlen, statisch, ohne Seeds)

                          ┌────► dist/pflanzenkenntnis.html  Prüfungswerkzeug (Prüfende)
seeds/*.json  ────────────┤      (template.html + app.js  + Seeds + SheetJS inline)
src/{template,app}.js  ───┤
src/{learn.html,learn.js} ┼────► dist/pflanzen-lernen.html   Lern-Tool (Azubis)
lib/xlsx.full.min.js  ────┘      (learn.html    + learn.js + Seeds, OHNE SheetJS)

src/recht.html  ──────────────► dist/rechtliches.html      Impressum & Datenschutz
                                 (statisch, ohne Seeds/JS; von allen Seiten verlinkt)
                → build.py schreibt alle vier Dateien + versionierte Root-Kopien
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
python3 build.py                                         # -> alle vier dist/*.html + Root-Kopien
python3 tools/check_offline.py dist/index.html             # Offline-Check Startseite (muss grün sein)
python3 tools/check_offline.py dist/pflanzenkenntnis.html  # dito Prüfungswerkzeug
python3 tools/check_offline.py dist/pflanzen-lernen.html   # dito Lern-Tool
python3 tools/check_offline.py dist/rechtliches.html       # dito Impressum & Datenschutz
```

Node (Konverter und Tests):

```bash
node tools/xlsx_to_seed.mjs <excel> <profil-id> [--sheet "Blattname"]
bash tools/rebuild_seeds.sh            # alle Seeds aus data/<id>.<ext> neu erzeugen
node tests/start.mjs                    # Puppeteer-Smoke Startseite (Verzweigung)
node tests/smoke.mjs                    # Puppeteer-Smoke Prüfungswerkzeug (npm test)
node tests/learn.mjs                    # Puppeteer-Smoke Lern-Tool
node tests/pwa.mjs                      # PWA: Manifest + Service Worker + Offline-Cache
node tools/make_icons.mjs               # PWA-Icons einmalig neu erzeugen (Ergebnis committen)
```

**PWA (installierbar + offline):** `build.py` legt zusätzlich `dist/manifest.webmanifest`,
`dist/sw.js` (Service Worker; Cache-Version = Inhalts-Hash) und die `dist/icon-*.png` ab.
Quellen: `src/manifest.webmanifest`, `src/sw.js`, `icons/*.png` (einmalig via
`tools/make_icons.mjs` erzeugt). Der Head-Snippet (Manifest-Link, apple-touch-icon,
SW-Registrierung) steckt in allen vier `src/*.html`. Diese Assets liegen **nur in `dist/`**
(Deploy-Basis; `dist/` ist gitignored) – der Deploy-Workflow kopiert sie nach `_site/`.
Beim lokalen `file://`-Aufruf sind sie ohne Belang (der Kern ist ohnehin offline). Der
Service Worker behandelt **ausschließlich same-origin**-Anfragen; die opt-in Wikipedia-
Anreicherung bleibt unberührt. `check_offline.py` bleibt grün (nur relative Links, kein
`fetch("http`, kein `<script src>`).

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
  Umschaltoption vorhanden, inkl. offizieller Dezimaltabelle. Für die Gärtnerberufe
  in BW ist **linear** der Standard.
- **Zwei Druckvarianten:** Prüfungsbogen (leer, zum Ausfüllen) und Musterlösung
  (gefüllt, »Nur für Prüfende«, kompakte Zeilen). **Die Leerbögen entsprechen den
  offiziellen AP-Formularen** der Regierungspräsidien BW (Quellen:
  `data/leerboegen/*.docx`) — drei Familien via `sheetFamily()`: **Fachwerker**
  (alle 7; Titel + »Gartenbaufachwerker/in«, Dt. Name/Gattung/Art, »Gesamtpunkte«,
  »Es wurde folgende Note erzielt«), **GaLaBau-Gärtner** (»… im Gartenbau GALA«,
  Schreibfehler-Hinweiszeile) und **Produktions-Gärtner** (»… im Gartenbau«).
  Spalten/Punkte kommen aus dem Prüfungsschema, Beschriftung à la Formular
  (»Gattungsname · 3 Punkte (G)« bzw. FW »Gattung (botanisch)«), Arial,
  10-mm-Schreibzeilen, Fußzeile = Einstellungen (`stelle1`/`stelle2`,
  Standard »Regierungspräsidien Baden-Württemberg«).

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
- [x] Automatischer Deploy nach jedem Merge auf **zwei Kanälen**
      (`.github/workflows/deploy.yml`, zwei unabhängige Jobs): eigener Webspace per
      SFTP (Live + PR-Vorschau) **und** GitHub Pages als Zweitadresse
      (`hannespix.github.io/pflanzenbestimmung/`, nur `main`) – weil manche
      Firmennetze junge Domains sperren.
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
      (Ablenker bevorzugt aus gleicher Kategorie) und **Tippen**
      (tippfehlertolerant, Gattung/Art getrennt geprüft). **Eine feste, prüfungs-
      nahe Lernrichtung** (deutscher Name → botanische Identität; siehe unten),
      Filter Kategorie/ZP, Sitzungslänge. Fortschritt je Profil im `localStorage` (Namensraum
      `pflanzenlernen.`), Link zurück zur Prüfungsversion. `src/learn.html` +
      `src/learn.js`; `build.py` baut beide Dateien; Smoke-Test `tests/learn.mjs`;
      CI und Pages-Deploy erfassen beide Dateien.
- [x] **Pflanzen-Info-Modal im Lern-Tool** (»ℹ Mehr zur Pflanze«): kuratierte
      Deep-Links je Art. **Nur neutrale, nicht-kommerzielle Quellen:** Wikipedia
      (immer), NaturaDB (immer; deckt auch Gehölze gut ab), iNaturalist (immer).
      **Granularität differenziert:** Wikipedia sucht **fein** (voller Name inkl.
      Sorte/Unterart – löst sauber auf, 404t nie); die anderen Quellen **grob** mit dem
      reinen Binom via `searchName()` (Sorten-/Gruppen-Zusatz weglassen, sonst 0 Treffer;
      mehrere Treffer dort ok). **Bewusst NICHT verlinkt:** Gaißmayer (kommerzieller
      Shop – gehört nicht in ein neutrales Werkzeug), Baumkunde (konstant HTTP 403
      »Zugriff verweigert«, auch im Nutzer-Browser), InfoFlora (nur CH-Wildflora, keine
      GET-Suche). iNaturalist bleibt (funktioniert im echten Browser; die 403 im
      CI-Rechenzentrum sind nur ein Bot-Block). Öffnen neuen
      Tab → offline-rein; plus **opt-in** »Online-Infos laden« via **Wikipedia-JSONP**
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
      Smoke-Test `tests/start.mjs` klickt beide Verzweigungen durch; CI prüft alle vier
      Dateien (Offline-Check + Smoke).
- [x] **Impressum & Datenschutz** (`rechtliches.html`, aus `src/recht.html`): statische
      vierte Seite (keine Seeds, kein JS), Herbarium-Look, `noindex`. Impressum nach
      § 5 DDG (Hannes Pix, Ihringen am Kaiserstuhl; Kontakt
      `pflanzenbestimmung@pix-el.de`) und Datenschutzerklärung (DSGVO): rein lokale
      Verarbeitung, keine Cookies/kein Tracking, GitHub-Pages-Hosting (Art. 6 Abs. 1
      lit. f), `localStorage`, **opt-in** Wikipedia-JSONP, externe Links, Betroffenen-
      rechte + LfDI BW. Von allen drei Werkzeugen über eine Fußzeile (`.foot`/`.pagefoot`
      → `rechtliches.html`) erreichbar; im Prüfungsbogen-Druck ausgeblendet (Fußzeile
      liegt in `.wrap`). `build.py` baut die Seite; CI (Offline-Check) und Pages-Deploy
      erfassen sie; `tests/start.mjs` klickt den Fußzeilen-Link durch und prüft Inhalt.
- [x] **Prüfungs-JSON importierbar + Gerätewechsel-Flow** (`importJsonData` in
      `app.js`): »JSON laden« (früher »Sicherung laden«) erkennt den Dateityp
      automatisch — Gesamt-Sicherung (`v`/`profile`) vs. einzelne Prüfungs-JSON
      (`plants`+`date`+`schema`, `isExamJson`). Eine Prüfungs-JSON wird als
      gespeicherte Prüfung übernommen (`importExamData`; gleiche `id` → kein
      Duplikat) und ersetzt **nicht** mehr die Pflanzenliste (früherer Bug: sie
      fiel in `applyBackup`, weil sie auch `plants` hat; Snapshot-Arten ohne `id`
      machten die Auswahl kaputt). Zusätzlicher Button »Prüfung importieren
      (.json)« im Prüfungen-Panel (`#exImport`). `loadExam` ergänzt Snapshot-
      Arten, die in der Profil-Liste fehlen (Gerätewechsel/geänderte Liste),
      automatisch in die Liste (mit neuer id, `markDirty`) statt sie zu
      verwerfen. Sicherungs-Import wechselt zum im Backup gespeicherten Profil
      statt still das aktive zu überschreiben. Abgedeckt in `tests/smoke.mjs`
      (7g Gerätewechsel, 7h Profilwechsel).

- [x] **Kopf entschlackt** (Prüfungswerkzeug): sichtbar nur noch die häufigen
      Werkzeuge **Prüfungen** und **Notenrechner** plus ein Knopf **»Verwaltung ▾«**
      (`#btnAdmin`), der eine abgesetzte Leiste `#adminBar` auf-/zuklappt mit den
      Gruppen Liste (Excel-Import, Art hinzufügen), Anpassen (Prüfungsschema,
      Einstellungen) und Sicherung (JSON laden, Sichern, Standardliste). Button-IDs
      unverändert; Panels/Handler bleiben. Smoke 1d prüft Toggle + Vollständigkeit.
- [x] **Lern-Tool mobil aufgeräumt**: Modus-Tabs (Karteikarten/Quiz/Tippen/Liste)
      als 2×2-Raster mit Trennlinien statt zufälligem Umbruch; Listen-Suche in
      `.searchbox` + separater »Liste drucken«-Knopf, der mobil in voller Breite
      darunter rutscht (`@media (max-width:640px)` in `learn.html`).
- [x] **Modul-Panels als Modal-Fenster** (`.pscrim`-Wrapper um die sechs Sections
      Hilfe/Notenrechner/Schema/Prüfungen/Einstellungen/Vorschau): öffnen über
      `openHelp()/openGrader()/openSchema()/openExams()/openSettings()/openPreview()`,
      schließen per ×-Knopf (`.pclose`), Esc (nur oberstes Modal) oder Scrim-Klick;
      Zustandsprüfung `panelOpen("#…Scrim")`, `closePanel()`. `loadExam` schließt
      das Prüfungen-Modal, damit die geladene Auswahl sichtbar ist. **Prüfung
      direkt beim Drucken speichern:** Druck-Dialog hat vorbelegtes Häkchen
      »Als Prüfung speichern« + Datum/Bezeichnung (`#prSaveRow`,
      `maybeSaveFromPrint`); bei geladener Prüfung wird aktualisiert statt
      dupliziert (Kernfunktionen `saveExamData`/`updateExamData`).
      `drawRandom`/`clearSel` setzen `loadedExamId` zurück (frische Liste = neue
      Prüfung). Musterlösung übernimmt das gewählte Prüfungsdatum
      (`printSheet(mode, ex)`). Smoke: 1b/1c (Modals), 6a2 (Druck-Speichern).
- [x] **Offizielle Leerbögen als Druck-Layout** (`buildSheet` neu): Nachbau der drei
      AP-Formulare (FW_neu / Gärtner_GALA_ab_S26 / Gärtner_Produktion, Quellen in
      `data/leerboegen/`). Familie je Profil (`sheetFamily`), Spaltenbreiten aus den
      DOCX (dxa→%), Namensfeld, Punkte-Spalte, Abschlussbereich und Fußzeile im
      Wortlaut der Vorlagen; GALA mit Schreibfehler-Hinweis. Musterlösung = gleiches
      Formular mit kursiven Antworten, kompakten Zeilen (`table.exam.solved`),
      Zuordnungszeile (`.sheet-meta`), rotem Vermerk und Bewertungsschlüssel; alles
      einseitig (per Puppeteer-PDF verifiziert). Einstellungen umgestellt:
      `sheetTitle` = Titel (Zusatz »im Gartenbau (GALA)«/»Gartenbaufachwerker/in«
      automatisch beim Standardtitel), `stelle1/2` = Fußzeile; Migration ersetzt
      unverändert gespeicherte alte Defaults. `.toast` wird im Druck ausgeblendet.
      `tests/smoke.mjs` 6e prüft alle drei Familien.

- [x] **Druckbare Lernliste im Lern-Tool** (Listenmodus, Button »Liste drucken«):
      druckt die aktuell gefilterte Liste (Kategorie/ZP/Suche) als Tabelle in der
      **Form des Prüfungsbogens** — gleiche Spalten, Beschriftungen und Punkt-
      angaben je Formular-Familie (`printFamily()`/`PRINT_COLS` in `learn.js`,
      FW/GaLa/Produktion wie im Prüfungswerkzeug), gefüllt wie eine Musterlösung,
      fortlaufend nummeriert, botanische Namen kursiv, schmale **ZP-Spalte**,
      Tabellenkopf wiederholt je Seite (`thead{display:table-header-group}`).
      **Gruppierung/Reihenfolge folgen der gewählten Listen-Ansicht** (`listSort`):
      Wuchsform/Kategorie oder botanische Familie mit Gruppen-Bändern (Name · Anzahl),
      A–Z botanisch/deutsch flach mit Buchstaben-Bändern; die Kopfzeile nennt
      »sortiert nach …«. `#printList` + `@media print` in `learn.html` (Bildschirm-UI
      wird ausgeblendet); `buildPrintList()` ist für Tests exponiert, `tests/learn.mjs`
      prüft Produktions- und FW-Familie, Zeilenzahl, ZP-Spalte, Suchfilter und die
      vier Ansichts-Sortierungen (Wuchsform/Familie/A–Z-Bänder).

- [x] **Kategorien nach Wuchsform** für die 10 Profile, die aus den Quell-Excel
      keine Kategorien mitbrachten (Baumschule, GaLaBau, Staudengärtnerei,
      Zierpflanzenbau, Friedhof-Gärtner, Obst-FW u. a.). `tools/categorize_seeds.py`
      setzt Feld 5 botanisch kuratiert: **Nadelgehölze · Laubgehölze ·
      Kletterpflanzen · Stauden · Gräser · Farne · Zwiebel- und Knollenpflanzen ·
      Ein- und zweijährige · Zimmerpflanzen**. Bestimmung: Art-Ausnahme → Gattung →
      Familie → Fallback (Staude); gemischte Gattungen (Freiland- + Zimmer-/einj.
      Arten) über Default + `SPECIES`; Nicht-Gefäßpflanzen (Cetraria/Sphagnum)
      bleiben ohne Kategorie. Die vier Profile mit Kategorien aus der Quelle bleiben
      unangetastet (`KEEP`). In `tools/rebuild_seeds.sh` eingehängt (reproduzierbar).
      `KAT_ORDER` in `app.js`/`learn.js` um die Wuchsformen erweitert (Anzeige-
      Reihenfolge). Verteilung per Puppeteer-PDF (GaLaBau, 8 Seiten) botanisch
      geprüft; `tests/learn.mjs` prüft die Wuchsform-Gliederung.

- [x] **Listen-Ansicht mit Dimensionen + Filter-Akkordion** (Lern-Tool, Modus »Liste«):
      einklappbares Panel **»Ansicht & Filter«** (`#listControls`, standardmäßig zu, damit
      es nicht überfrachtet wirkt). **Ansicht** umschaltbar: **A–Z botanisch/deutsch**
      (flach mit Buchstaben-Trennern – **Standard**), **Wuchsform/Kategorie** oder botanische
      **Familie**. In den beiden Gruppen-Ansichten erscheinen **Filter-Tags** der jeweiligen
      Dimension (Mehrfachauswahl, »Alle« = kein Filter, mit Anzahl je Gruppe). Zustand:
      `listSort` (in `localStorage`), `listCats` (Set, beim Ansichts-/Profilwechsel geleert);
      `dimKey`/`dimValues`/`groupsView` in `learn.js`; die **Druckliste** nutzt dieselbe
      gefilterte Menge. `tests/learn.mjs` prüft Standard=A–Z ohne Tags, Umschalten auf
      Wuchsform zeigt Tags, Tag filtert, Ansichtswechsel setzt Filter zurück.

- [x] **Musterlösung & Lernliste im Herbarium-Look** (schöner als der amtliche Bogen):
      Der **leere Prüfungsbogen bleibt strikt im offiziellen Arial-Layout** (amtliches
      Formular). Nur die **Musterlösung** (`buildSheet`, `#sheet.sol-look` – gesetzt bei
      `mode==="solution"`) und die **druckbare Lernliste** (`buildPrintList`, `.ptab`)
      bekommen ein gut lesbares, lernfreundliches Print-Design: Serif-Typo, grüner
      Tabellenkopf (weiße Schrift), **Zebrastreifen**, kursive botanische Namen (Spalten
      `td.bot`), dezent grüne Kategorie-Bänder (Lernliste), grüner Titel; Namensfeld auf
      der Musterlösung entfällt. Weiterhin mehrseitig sauber (Kopf-Wiederholung). Print-CSS
      in `template.html` (`#sheet.sol-look …`) bzw. `learn.html` (`@media print .ptab`).
      Per Puppeteer-PDF geprüft (Musterlösung, Lernliste, **Leerbogen unverändert**);
      `tests/smoke.mjs` sichert die Trennung ab (Musterlösung = sol-look + kursive Botanik,
      Leerbogen = kein sol-look).

- [x] **Familien-Steckbriefe im Lern-Tool** (Listen-Ansicht »Familie«): neben jedem
      Familiennamen ein **ℹ**, das ein Modal mit kuratiertem Kurztext öffnet – *was die
      Arten der Familie gemeinsam haben* (Bauplan, Blüte, Blatt, Frucht) plus ein
      praktischer **Lerntipp** zum Erkennen. `FAM_INFO` in `learn.js` (~45 häufigste
      Familien, `{de,m,t}`), Normalisierung `famLatin()`/`famGerman()` (lat. Teil vor
      »/«); `openFamilyInfo()` baut das Modal (dasselbe `.scrim`/`.modal`-System wie das
      Pflanzen-Info-Modal, Titel nicht-kursiv via `.mh-bot.fam`). Für nicht kuratierte
      Familien greift ein Fallback mit allgemeinem Bestimmungstipp. Offline-rein (kein
      Netzabruf). `tests/learn.mjs` prüft ℹ-Knopf, kuratierten Steckbrief (Asteraceae)
      und Fallback.

- [x] **Lernduell – Ergebnis teilen & Kollegen herausfordern** (Lern-Tool, nach
      Quiz/Tippen): Auf dem Abschluss-Screen ein **Teilen-Block** (»Ergebnis teilen ·
      herausfordern«) mit **Web-Share** (`navigator.share`, mobil inkl. WhatsApp),
      **WhatsApp-Deeplink** (`https://wa.me/?text=…`, neuer Tab) und **Link kopieren**
      (`navigator.clipboard`, Textarea-Fallback). Der Link kodiert die Sitzung
      **base64-URL-safe im `#c=`-Fragment**: `{v,p:profil,m:modus,r:richtung,i:[Indizes
      in cardsFor],s:richtig,t:gestellt,n:name}` – also die **exakte Lektion** (gleiche
      Karten/Fragen, reproduzierbar unabhängig vom Leitner-Stand des Empfängers) plus
      Trefferquote und optionaler Name. Wer den Link öffnet, sieht beim Boot ein
      **Herausforderungs-Banner** (`#duelBanner`, übernimmt Profil/Modus/Richtung),
      nimmt an (`startChallenge` spielt genau die kodierten Karten) und bekommt am Ende
      einen **Vergleich** (Du % ↔ Herausforderer %, gewonnen/verloren/Gleichstand) mit
      **»Ergebnis zurückschicken«** (Revanche = gleiche Lektion, eigenes Ergebnis).
      Nur in Quiz/Tippen (echte Trefferquote); Karteikarten = keine Punkte, kein Duell.
      **Offline-rein** (kein `fetch`/CDN – nur `<a>`/`window.open`/Web-Share/Clipboard);
      `check_offline.py` bleibt grün. Kurznotiz im Hilfe-Panel. `tests/learn.mjs` prüft
      Teilen-Block, Link-Kodierung (exakte Indizes/Ergebnis/Name), Banner-Übernahme,
      Annehmen der exakten Karten und den Sieg-Vergleich.

- [x] **Karteikarten lern-didaktisch geschärft** (Lern-Tool): Statt dreier
      Abfragerichtungen (de→bot / bot→de / Art→Familie) **eine feste, prüfungsnahe
      Richtung** – wie in der AP: man erkennt die Pflanze (greifbarster bildloser
      Anker = **deutscher Name**) und nennt **Gattung, Art, Familie**. Karteikarte:
      **vorne nur der deutsche Name**, **hinten** der botanische Name (kursiv) plus
      eine klar **beschriftete Aufschlüsselung Gattung · Art · Familie** (Familie
      aufrecht, deutscher Familienname aus Daten oder `FAM_INFO` via `famName()`,
      ohne Dopplung bei »Latein/Deutsch«-Quellen) und Synonyme. Quiz: dt. Name →
      richtigen botanischen Namen wählen (Ablenker aus gleicher Kategorie); Tippen:
      dt. Name → botanischen Namen tippen (Gattung/Art getrennt, tippfehlertolerant).
      **Botanisch→Deutsch und Art→Familie entfernt** (fachlich nicht sinnvoll), das
      »Abfrage«-Dropdown ganz raus (weniger Bedienelemente); die Familie ist nun Teil
      der Rückseite und bleibt über Liste + Familien-Steckbriefe vertiefbar.
      `richtung`-Zustand und `#c=r`-Feld im Lernduell entfallen (Link kodiert nur noch
      Profil/Modus/Karten/Ergebnis). `tests/learn.mjs` prüft: Vorderseite = nur dt.
      Name, Rückseite weist Gattung/Art/Familie getrennt aus, `famName` doppelt nicht.

- [x] **PWA – installierbar + offline-fest** (alle Seiten): Das Werkzeug lässt sich
      zum Home-Bildschirm hinzufügen und startet ohne Netz. **Manifest**
      (`src/manifest.webmanifest`: Name, `start_url=index.html`, `scope="./"`,
      `display=standalone`, Theme/Background, Icons 192/512/maskable, Shortcuts
      Lernen/Prüfen), **Service Worker** (`src/sw.js`: precached die vier HTML-Seiten +
      Manifest + Icons; **cache-first**, Offline-Navigation fällt auf `index.html` zurück;
      behandelt **nur same-origin** → Wikipedia-JSONP unberührt; `skipWaiting`+`clients.claim`;
      Cache-Version = Inhalts-Hash aus `build.py` → Auto-Update), **Icons**
      (`icons/*.png`, Herbarium-Blatt, via `tools/make_icons.mjs`) und ein **Head-Snippet**
      (Manifest-Link, apple-touch-icon, iOS-Metas, SW-Registrierung) in allen vier
      `src/*.html`. `build.py` schreibt die Assets nach `dist/`; `pages.yml` kopiert sie
      nach `_site/`; `build.yml` fährt `tests/pwa.mjs`. **Offline-rein:** kein `fetch("http`,
      keine externen Ressourcen – `check_offline.py` bleibt grün. Datenschutz-Seite um einen
      Abschnitt »Installation & Offline-Cache (PWA)« ergänzt. `tests/pwa.mjs` prüft über einen
      lokalen HTTP-Server: Manifest valide (192/512/maskable), SW aktiv, vier Seiten im Cache,
      **Offline-Reload + Boot aus dem Cache**, zweite Seite offline erreichbar.

- [x] **»nur Prüfungsstoff« für Fachwerker** (Lern-Tool, opt-in): Zusätzlicher
      Schalter im Setup, **nur bei Fachwerker-Profilen sichtbar** (`#examOnlyWrap`,
      per `syncExamOnlyUI()`). Aktiv blendet er in **Karteikarten** (`answerMeta`) und
      **Liste** (`.sp-fam`) alles außer **Deutscher Name, Gattung, Art** aus – Familie
      und Synonyme entfallen, weil die Fachwerker-Abschlussprüfung (Dt. Name 3 /
      Gattung 0,5 / Art 0,5) nur diese Felder bewertet. Die **Familien-Ansicht** der
      Liste wird ausgeblendet (`normalizeSort()` verlässt sie); die **Info-Links (ℹ)**
      und die Online-Anreicherung bleiben unberührt. Zustand global im `localStorage`
      (`pflanzenlernen.examonly`), greift aber nur bei Fachwerkern (`examOnlyActive()`).
      Quiz/Tippen fragen ohnehin nur den botanischen Namen. `tests/learn.mjs` prüft:
      Schalter bei Gärtner unsichtbar / bei Fachwerker sichtbar, Kartenrückseite ohne
      Familie/Synonyme, Liste ohne `.sp-fam` und ohne »Familie«-Ansicht, Rücknahme.

- [x] **Lern-Tool entschlackt (Startansicht)**: Die Feineinstellungen (Kategorie,
      „nur ZP-relevant", „nur Prüfungsstoff", Karten/Sitzung) stecken jetzt in einer
      **standardmäßig zugeklappten `<details class="setopts">`-Klappe »Optionen«** –
      die Startansicht zeigt nur noch **Profil → Modi → »Sitzung starten«**, alle
      Funktionen bleiben einen Klick entfernt. Zusätzlich die **Fortschritts-Box**
      entschlackt (der lange Erklärsatz entfällt; die Box-Legende + Knopf-Beschriftung
      erklären es ohnehin) und der **»Bereit zum Lernen«**-Text gekürzt (Details unter
      Hilfe). Native `<details>` – kein JS, tastaturbedienbar, offline-rein. Hilfe-Schritt
      angepasst. `tests/learn.mjs` prüft: Optionen zugeklappt und enthält Kategorie/ZP/
      Sitzungslänge, Modi + Start ohne Aufklappen sichtbar. (Erster Schritt eines
      Aufräum-Durchgangs; Prüfungswerkzeug folgt separat.)

- [x] **Prüfungswerkzeug entschlackt (Schritt 2 des Aufräum-Durchgangs)**: Drei
      ruhigere Bausteine, alle Funktionen erhalten. (1) **Filterleiste einklappbar** –
      Suche/Kategorie/„nur ZP" stecken in einer standardmäßig zugeklappten
      `<details class="filterbar">`-Klappe (native, kein JS); ein **aktiver Filter bleibt
      sichtbar** (`syncFilterSummary()` schreibt ihn in die Zusammenfassung, z. B.
      »Filter · nur ZP«, grün hervorgehoben – wird an die `#q`/`#cat`/`#onlyzp`-Handler
      und `renderAll` gehängt). (2) **Auswahl-Bar beruhigt** – flacher Hintergrund statt
      Verlauf, engerer Abstand, »Bearbeiten/Drucken« (`.selacts`) mit dezentem Trenner
      von »Ziehen« abgesetzt (mobil ohne Trenner, da umbrechend). (3) **Kopf verschlankt**
      – kompaktere Speicherstatus-Pille, engere Masthead-Abstände. `check_offline.py`
      bleibt grün; `tests/smoke.mjs` prüft: Filter-Klappe zugeklappt und enthält
      Suche/Kategorie/ZP, aktiver Filter in der Zusammenfassung sichtbar/markiert, Rücknahme.

- [x] **Familien-Steckbriefe vervollständigt** (Lern-Tool): `FAM_INFO` von ~45 auf
      **~160 Familien** erweitert (Object.assign-Block nach der Erstdefinition), sodass
      **praktisch jede in den Listen vorkommende Pflanzenfamilie** einen kuratierten
      Kurztext (`{de,m,t}`) hat – nur die beiden Nicht-Gefäßpflanzen (Cladoniaceae/
      Flechte, Sphagnaceae/Torfmoos) behalten bewusst den Fallback. Zusätzlich eine
      **`FAM_ALIAS`-Tabelle** für offensichtliche Tippfehler/alte Schreibweisen in den
      Quelldaten (z. B. `lridaceae`→Iridaceae, `Asteraceae.`, `Malvacea`, `Saxifrasgaceae`,
      `Caesalpinaceae`→Fabaceae); `famKey()` löst sie auf und wird in `famName()` und
      `openFamilyInfo()` genutzt (korrigiert auch den angezeigten lateinischen Namen).
      `tests/learn.mjs` prüft: ergänzte Familie (Papaveraceae→Mohngewächse) kuratiert,
      Tippfehler-Alias (`lridaceae`→Iridaceae) führt auf den richtigen Steckbrief,
      Fallback für echte Unbekannte bleibt.

- [x] **Thematische Ordnung im Lern-Tool** (Rückmeldung einer Lehrerin: im Unterricht
      wird nicht mehr »Vokabeltest«, sondern **nach Themen** gelernt – z. B. »große
      Laubbäume« – wie in der ASP). Jede Art bekommt zur Laufzeit ein **Thema**
      (`themeOf(gattung, art, kategorie, profilId)` in `learn.js`); die **Seeds bleiben
      unverändert**, das Prüfungswerkzeug ist nicht betroffen. Regeln in dieser
      Reihenfolge: (1) **Obstbau-Profile** → Obstart (`FRUIT_THEME`: Kern-/Stein-/
      Beeren-/Schalenobst, Wildobst, Zitrusfrüchte, Obst), (2) kuratierte
      **Art-Ausnahmen** (`SPEC_THEME`, z. B. *Prunus laurocerasus* = immergrün,
      *Acer platanoides* = großer Baum), (3) Kategorie »Kletterpflanzen« bleibt,
      (4) die **unspezifischen Gehölz-Kategorien** (Laub-/Nadelgehölze/Gehölze) werden
      über **Gattungstabellen** aufgelöst (`G_TREE`/`G_SMALL`/`G_EVER`/`G_GC`/`G_CONIF`,
      Sonderfälle Cotoneaster/Juniperus/Rosa), (5) sonst die Kategorie der Liste,
      vereinheitlicht über `KAT_ALIAS` (»Ziergräser«→Gräser, »Bodendecker«→Bodendecker
      & Zwergsträucher, drei Beikraut-Schreibweisen→»Wild- & Beikräuter« …).
      **Neun Gehölz-Themen:** Große Laubbäume · Kleinbäume & Großsträucher · Blüten- &
      Ziersträucher · Immergrüne Laubgehölze · Bodendecker & Zwergsträucher ·
      Kletterpflanzen · Rosen · Nadelbäume · Zwerg- & Kriechkoniferen.
      **UI:** Die Listen-Ansicht »Wuchsform/Kategorie« heißt jetzt **»Thema«** (gleiche
      Filter-Tags, gleiche Druckliste; alter `listSort`-Wert `kategorie` wird migriert),
      die Sitzungs-Auswahl in den »Optionen« filtert nach **Thema** statt Kategorie, und
      die **Quiz-Ablenker** kommen aus demselben Thema. `THEME_ORDER` gibt die Lern-
      Reihenfolge vor (Bäume → Sträucher → … → Obst → Stauden → Krautiges).
      Die Zuordnung wurde vor dem Einbau als Python-Prototyp über alle 2114 Arten
      geprüft und botanisch durchgesehen; `tests/learn.mjs` sichert 14 Referenz-
      Zuordnungen, die Themen-Ansicht (inkl. Reihenfolge, keine Roh-Kategorien mehr)
      und die Themen-Sitzung ab. **M2–M4** verfeinern die noch groben Nicht-Gehölz-
      Themen (Stauden, Gemüse, Zimmerpflanzen).

- [x] **Bilder-Quiz als fünfter Lernmodus** (»Bilder«, opt-in, braucht Internet):
      Prüfungsnah – man sieht **nur ein Bild** der Pflanze (sonst nichts) und wählt
      aus **vier botanischen Namen** den richtigen; die Ablenker kommen wie im
      Quiz bevorzugt aus **demselben Thema**. Nach der Antwort erscheinen deutscher
      Name und **Bildnachweis** (Urheber + Lizenz über die Commons-`imageinfo`-API,
      erst danach abgefragt, damit die Lösung nicht verraten wird). Bild = Artikelbild
      der deutschen Wikipedia über `prop=pageimages` (`wikiPhoto()`), geholt per
      **JSONP** (`jsonpGet()`, aus der Text-Anreicherung herausgezogen – kein
      `fetch`/`XHR`, `check_offline.py` bleibt grün). Bild-URLs werden je Art im
      `localStorage` gemerkt (`pflanzenlernen.photos`, Deckel 1500), das nächste Bild
      wird vorgeladen. **Robustheit:** einzelne fehlgeschlagene Abrufe brechen nicht
      ab (nächster Kandidat), erst wenn **gar keine** Antwort kommt, meldet der Modus
      »Keine Verbindung« mit »Erneut versuchen«; Arten ohne brauchbares Bild werden
      übersprungen (nach 6 Fehlschlägen Hinweis), **Verbreitungskarten/Diagramme/SVG**
      filtert `usablePhoto()` aus. Wertet wie das Quiz in den Leitner-Fortschritt ein
      und ist duell-fähig (`scoreable()`). Die **vier bestehenden Modi bleiben
      unverändert offline**. Tests: `tests/learn.mjs` hängt über `__setPhotoSource`
      eine Bildquelle ein (kein Netz in CI) und prüft Foto, vier Optionen, Wertung,
      Bildnachweis, Offline-Hinweis und den Karten-Filter. Datenschutzseite und Hilfe
      nennen den Modus als zweite bewusste Online-Ausnahme.

- [x] **Abfragerichtung wählbar + Auswahl nach Thema ODER Familie** (Lern-Tool,
      beides in der »Optionen«-Klappe, keine neue Bedienebene). **Abfrage**
      (`#dir`, `DIRS`/`curDir()`): Text-Modi `de2bot` (Standard, Prüfungsrichtung)
      und `bot2de`; Bilder-Modus `img2bot` (Standard) und `img2de`. Das Feld zeigt
      **nur die zum Modus passenden** Richtungen (`dirsFor()`, `syncDirUI()`) und ist
      im Listenmodus ausgeblendet; die Wahl wird je Modus-Gruppe gemerkt
      (`pflanzenlernen.dirtext` / `.dirphoto`). Wirkt auf Vorderseite/Rückseite
      (`promptHTML`/`answerMeta`), Quiz-Optionen, Tippen und Bilder-Quiz; die
      Lösungszeile (`solutionLine`) nennt immer beide Seiten. **Tippen auf Deutsch**
      akzeptiert jede in der Liste geführte Schreibweise, Bindestriche/Leerzeichen
      egal (»Hängebirke« = »Hänge-Birke«), weiter tippfehlertolerant. Kurzform
      `deMain`/`deAll` für Antwortoptionen; die **Vorderseite zeigt weiterhin alle**
      deutschen Namen. **Auswahl** (`#cat`, `scopeOk()`): `<optgroup>` **Thema**
      (`t:…`) und **Pflanzenfamilie** (`f:…`, über `famKey()` normalisiert) plus
      »alle Arten«, jeweils mit Artenzahl. Das Lernduell kodiert die Richtung mit
      (`r`-Feld) und übernimmt sie beim Annehmen. `tests/learn.mjs` prüft die
      Richtungslisten je Modus, bot→de auf Karte/Quiz/Tippen (inkl. Zweitname ohne
      Bindestrich), Bild→deutsch und die Auswahl nach Thema **und** Familie.
      *Hinweis:* Die Richtungswahl war früher entfernt worden (»botanisch→deutsch
      nicht sinnvoll«); sie ist jetzt **Option** mit prüfungsnahem Standard.
      Art→Familie bleibt bewusst draußen.

- [x] **Bilder-Quiz: drei Antwortarten, inkl. »wie in der Prüfung«** (`#phAnswer`,
      `photoAnswer` = `mc` | `type` | `exam`, gemerkt in `pflanzenlernen.phanswer`;
      Auswahl bleibt Standard). `renderPhoto()` rendert nur noch Bild + Rahmen und
      delegiert an `renderPhotoChoice()` / `renderPhotoType()` / `renderPhotoExam()`;
      gemeinsamer Abschluss in `finishPhotoAnswer(ok,g,p,solHTML)` und
      `photoRevealCredit(p)` (Bildnachweis weiterhin erst nach der Antwort).
      **»wie in der Prüfung«:** ein Eingabefeld je bewerteter Spalte, Beschriftung,
      Reihenfolge und **Punkte aus `PRINT_COLS`** (um einen numerischen Punktwert
      erweitert – dieselbe Quelle wie Druckliste und Prüfungsbogen, also je
      Fachrichtung fw/gala/prod korrekt), Enter springt ins nächste Feld, feldweise
      ✓/✗ mit richtiger Antwort und **Teilpunkte** (»7 von 10 Punkten«). Leitner:
      alles richtig → `good`, teilweise → `hard`, nichts → `again`; die
      Trefferquote der Sitzung zählt nur volle Treffer. **Felder selbst bestimmen**
      (`#examFieldsRow`, `examFields`, Standard = Bogen des Profils, gespeichert je
      Profil unter `pflanzenlernen.examfields.<profil>`; mindestens ein Feld).
      Prüfung je Feld über `fieldOk()`: Gattung/Art tippfehlertolerant (Art auch als
      Präfix), deutscher Name über `checkDeName()` (jede geführte Schreibweise,
      Bindestriche egal), **Familie lateinisch ODER deutsch**. Die Abfragerichtung
      wird bei `exam` ausgeblendet (dann werden ohnehin alle Felder gefragt).
      `tests/learn.mjs` prüft Tippen-Variante, Prüfungsfelder (Bogen-Reihenfolge,
      Beschriftung/Punkte, ✓✓✓✗, 7 von 10, Teilpunkt-Meldung), Abwählen eines Feldes,
      den Fachwerker-Bogen (Dt. Name zuerst, 0,5 P.) und `fieldOk()` im Detail.

- [x] **Deutsche Namen fair prüfen** (`deForms()`/`checkDeName()` in `learn.js`): Die
      Quelllisten führen deutsche Namen in **drei Mustern**, die beim Tippen alle als
      richtig gelten müssen. (1) **Synonyme** mit Komma (»Rotkohl, Blaukraut«) – zählen
      alle, Bindestriche/Leerzeichen egal. (2) **Geteiltes Grundwort mit Bindestrich**
      (»Knollen- / Gemüsefenchel«): zur **Prüfzeit** aufgelöst – Eingabe muss mit dem
      Vorderteil beginnen und der Rest ein Suffix (≥4 Zeichen) des letzten Segments sein
      (deckt auch »gewöhnliche Hain-/Weißbuche« → *Hainbuche* über das letzte Wort des
      Vorderteils). Zusammensetzen ist nicht möglich, weil das geteilte Grundwort im
      Kompositum steckt. (3) **Geteiltes Grundwort mit Adjektiv** (»Krauser /
      gewöhnlicher Rhabarber«): beide Vollformen gelten, **das blanke Adjektiv nicht**.
      Unterschieden von Muster 1 (»Karotte / Möhre / Gelbe Rübe«, jeder Teil ein eigener
      Name) über `looksAdjective()` – flektierte Form eines Stamms aus `ADJ_STEMS`
      (~60 Stämme, akzent-/ß-normalisiert über `adjKey`) oder Abkürzung mit Punkt
      (»Gew.«, per `ABBR` zu »gewöhnliche« aufgelöst). Zusätzlich gilt das
      **Grundwort allein** (»Rhabarber«), aber **nur wenn im Profil eindeutig**:
      `buildDeIndex()` zählt je Profil, wie viele Arten dasselbe Grundwort tragen –
      bei »Brennessel« (Große + Kleine) oder »Ahorn« (8 Arten) reicht es also nicht.
      Klammerformen (»(Arznei-)Engelwurz«) gelten mit und ohne Klammerinhalt.
      `deAll()` trennt jetzt nur noch an Komma/Semikolon (die »/«-Form ist EIN Name,
      vorher entstand daraus die Unform »Krauser«), die Lösungszeile nennt alle
      Synonyme. **Verfahren:** Die Regeln wurden als Python-Prototyp gegen alle 1590
      deutschen Namen geprüft – alle 52 »/«-Namen einzeln durchgesehen, die
      Adjektiv-Erkennung auf **alle 33 einteiligen Vorder-Segmente** verifiziert
      (4 Adjektive korrekt erkannt, 29 echte Namen korrekt behalten, keine
      Fehlalarme). `deacc` wurde zu den übrigen Normalisierern nach oben gezogen.
      `tests/learn.mjs` prüft alle drei Muster, Synonyme, Klammerform, Abkürzung und
      die Eindeutigkeitsregel.

- [x] **KI-Hinweis vor den Lektionen** (Lern-Tool): Direkt unter »Sitzung starten«
      steht ein kurzer Hinweis (`.learnnote` / `#learnNote`), dass Karteikarten,
      Quizfragen, **Bildauswahl** und thematische Zuordnung automatisch – teils
      mithilfe generativer KI – erzeugt werden, dass **keine Gewähr und keine Haftung**
      für Richtigkeit/Vollständigkeit übernommen wird und **allein die offiziellen
      Prüfungslisten verbindlich** sind. Ruhig gestaltet (goldener Randstreifen,
      11,5 px), ohne Klickhürde, im **Listenmodus ausgeblendet** (`applyMode()`), weil
      dort keine Lektion läuft. Der ausführliche Disclaimer in der Fußzeile bleibt
      zusätzlich. `tests/learn.mjs` prüft Sichtbarkeit vor dem Start, die genannten
      Punkte (KI, Bildauswahl, Gewähr/Haftung, amtliche Listen) und das Ausblenden
      in der Liste.

- [x] **Deploy auf eigenen Webspace statt GitHub Pages** (`.github/workflows/deploy.yml`,
      `pages.yml` entfernt): Ziel ist **pflanze-bw.de**. Push auf `main` → **live** ins
      Web-Wurzelverzeichnis, Pull Request → **Vorschau** unter `vorschau/pr-<Nr>/`
      (damit eine unfertige Änderung nie die Live-Seite überschreibt); Forks werden
      übersprungen, weil sie keine Secrets bekommen. Übertragung per **SFTP (Port 22)**
      mit `lftp`; das Passwort steht ausschließlich in `LFTP_PASSWORD`
      (`--env-password`), nie in der Kommandozeile. Vor dem Upload laufen Build und
      **Offline-Check aller vier Seiten** – was externe Ressourcen zöge, geht nicht
      online. `mirror --reverse` **ohne** `--delete`: fremde Dateien auf dem Webspace
      bleiben unberührt. Konfiguration: **ein** Secret `DEPLOY_PASSWORD`, optional die
      Variablen `DEPLOY_HOST`/`USER`/`PORT`/`PATH`/`PROTO`/`TLS_VERIFY` (Vorgaben
      s179.goserver.host · web69 · 22 · **/home/www/pflanze-bw.de** · sftp · yes).
      **Wichtig:** Der SFTP-Login landet oberhalb des Dokumentenverzeichnisses – der
      Zielpfad ist deshalb absolut, ein relativer Pfad lud die Dateien außerhalb des
      Web-Verzeichnisses ab (HTTP 404). Ein Kontrollschritt listet nach dem Upload
      das Zielverzeichnis im Log. **Datenschutzseite angepasst:**
      Hosting nicht mehr GitHub Pages, sondern eigener Webspace bei der
      **webgo GmbH** (Wendenstraße 8–12, 20097 Hamburg; s179.goserver.host gehört
      webgo), mit Link auf deren Datenschutzerklärung und Hinweis auf den
      AV-Vertrag nach Art. 28 DSGVO.

- [x] **Denkzeit-Uhr + fälschungssicherer, kurzer Duell-Link** (Lern-Tool).
      **Uhr:** In den bewerteten Modi (Quiz, Tippen, Bilder) läuft in der
      Sitzungsleiste eine Uhr (`#sclock`). Gezählt wird nur die **Denkzeit**:
      `clockStart()` beim fertig gerenderten Frage-Bild (im Bilder-Quiz also nach
      dem Laden), `clockStop()` beim Abschicken (`answerQuiz`/`submitType`/
      `finishPhotoAnswer`) – Netz-Wartezeit und das Lesen der Lösung zählen nicht
      mit, sonst wäre der Vergleich von der Leitung abhängig. Summe in `sess.ms`,
      Anzeige-Takt über `clockRun()`, Formatierung `fmtDur()` (m:ss bzw. h:mm:ss).
      Karteikarten bleiben bewusst ohne Uhr (keine Wertung). Moduswechsel
      (`applyMode`) bricht Sitzung und Uhr ab.
      **Duell:** Der Link kodiert die Zeit mit (`z`, Sekunden); bei **gleicher
      Trefferquote entscheidet die Zeit** (Abschluss-Screen zeigt beide Zeiten,
      `.duel-time`), das Banner nennt Zielwert **und** Zeit, die Teilen-Nachricht
      ebenso. **Kodierung neu (v2, `chEncode`/`chDecode`):** früher lesbares JSON
      in base64 – wer den Link vor dem Verschicken öffnete, konnte `"s":8` in
      zehn Sekunden hochsetzen. Jetzt binär gepackt (Profil/Modus/Richtung in
      einem Byte über die festen Tabellen `CH_PROFILES`/`CH_MODES`/`CH_DIRS`,
      Karten-Indizes und Zahlen als Varints, Name als UTF-8), mit 16-Bit-FNV-1a
      **Prüfsumme** und symmetrischer **Verwürfelung** (`chMask`, LCG-Keystream).
      Ergebnis: **~28 statt ~200 Zeichen**, keine lesbaren Zahlen im Link, jede
      geänderte Stelle fällt auf (Link wird abgelehnt), zusätzlich
      Plausibilitätsprüfung (`chPlausible`: `s ≤ t`, Indizes vorhanden).
      **Ehrlich:** Ohne Server ist das kein echter Fälschungsschutz – der Code
      liegt im Browser; es verhindert schnelles Schummeln, nicht den
      entschlossenen Bastler. Alte v1-Links (JSON) werden weiterhin gelesen.
      Reihenfolge der drei Tabellen **nicht ändern**. `tests/learn.mjs` prüft:
      Uhr vorhanden, Zeit im Link (187 s), Link kurz + nicht als JSON lesbar,
      veränderte Stelle → abgelehnt (auch beim Boot: kein Banner), alte JSON-Links
      lesbar, Banner nennt 10:00, Zeitvergleich entscheidet bei gleicher Quote.

- [x] **Bilder-Quiz: das Bild muss zur Art passen** (Rückmeldung: statt der
      Kirschtomate erschien eine normale Tomate, bei »Zwiebel« eine Tafel mit zwei
      Arten). Ursache: Es wurde nur das **Artikelbild** der de-Wikipedia genommen –
      Sorten haben selten einen eigenen Artikel (Anfrage landet auf der Art), manche
      Artikelbilder sind alte Tafeln mit mehreren Arten, und der deutsche Name kann
      auf ein Homonym führen. Neu (`photoSteps`/`pickCommons`/`wikiPhoto`):
      **Suchkette vom Genauen zum Groben** – Commons-Kategorie des exakten Taxons →
      Art-Kategorie + infraspezifisches Epitheton → Phrase → deutscher Name →
      (nur wenn zulässig) Artniveau. Jeder Treffer muss zwei Prüfungen bestehen:
      `pageFitsCard` (Artikel nennt die Gattung – killt Homonyme) und
      `fileMentionsOther` (Dateiname nennt keine **andere** Art derselben Gattung –
      killt »Illustration Allium schoenoprasum and Allium cepa«). Zusätzlich
      `looksIllustration` (Köhler/Tafel/Liebig … nur als Notnagel, `deacc`-normalisiert)
      und `commonsScore` (Dateien, die Gattung/Art/deutschen Namen führen, schlagen
      beliebige Kategoriebilder). **Sorten-Regel:** Steht die Art selbst ebenfalls im
      Profil (`binomCount`, `artLevelOk`), wird für die Sorte **kein Artbild** angeboten –
      die Frage wäre sonst nicht entscheidbar; im Bilder-Quiz erscheinen dann auch keine
      Geschwister derselben Art als Ablenker (`distractors`). Ohne passendes Bild wird
      die Art übersprungen. Bild-Cache-Key auf `pflanzenlernen.photos2` gehoben (alte
      Treffer verfallen). **Verfahren:** Regeln als Python-Zwilling gegen die echten
      APIs geprüft – Kirschtomate → *Starr … var. cerasiforme.jpg*, Küchen-Zwiebel →
      *Küchen-Zwiebel.jpg*, Schalotte → *Allium cepa Aggregatum Grp.jpg*, Hainbuche →
      *Carpinus betulus 001.JPG*, Salbei/Schachblume → Fotos statt Tafeln; Stichprobe
      über 42 zufällige Arten aus allen 14 Profilen: **0 % ohne Bild**. `tests/learn.mjs`
      hängt über `__setJsonp` feste API-Antworten ein (kein Netz in CI) und prüft
      Suchreihenfolge, Sortenbild, Zwei-Arten-Tafel, Homonym, Ranking und Tafel-Erkennung.

- [x] **»Fast richtig« statt »falsch« + kleine Belohnung** (Lern-Tool). Beim Tippen
      (Text-Modus und Bilder-Modus) gibt es jetzt **drei Stufen** statt richtig/falsch
      (`judgeTyped` → `ok|near|no`, Text über `typeFeedback`):
      **richtig** (zählt; war ein kleiner Tippfehler dabei, wird zusätzlich die saubere
      Schreibweise gezeigt), **fast** (knapp daneben oder nur die Gattung – zählt nicht
      als Treffer, Leitner-Stufe `hard`, Karte kommt in derselben Sitzung wieder, die
      richtige Form erscheint mit **markierter Abweichung** via `markDiff`) und
      **noch nicht** (`again`). Didaktik: sofortige Korrektur, Teilwissen zuerst
      benennen (»Gattung stimmt« – die Prüfung bewertet Gattung und Art ebenfalls
      getrennt), kein hartes »falsch« für einen Buchstaben. Schwelle: `closeEnough`
      = richtig, `nearEnough` (bis 40 % der Länge) = fast.
      **Rechtschreibung bleibt relevant** (Rückmeldung: »bollensellerie« ging als
      *Knollensellerie* durch): `closeEnough` erlaubt **ein** Zeichen statt zwei, erst
      ab **fünf** Buchstaben (kurze Namen wie *Acer*/*Rosa* exakt) und nur bei
      **gleichem Anfangsbuchstaben** – ein falscher Wortanfang ist kein Vertipper,
      sondern ein anderes Wort. Der frühere Präfix-Freibrief beim Art-Epitheton
      (»rob« für *robur*) ist durch `wordPrefixOk` ersetzt: **ganze Wörter** dürfen
      fehlen (*graveolens* für *graveolens var. rapaceum*), abgeschnittene nicht.
      In der Antwortart **»wie in der Prüfung«** gibt ein »fast« die **halbe Punktzahl**
      (`fieldJudge`) – die Art gilt damit **nicht als bestanden**, kommt in derselben
      Sitzung wieder, und bei der **fehlerfreien Wiederholung wird die fehlende Hälfte
      nachgebucht** (`bookPoints`: Punktekonto `sess.pts = {sum,max,je}`, je Karte zählt
      der **beste** Versuch, nichts doppelt; Anzeige in der Sitzungsleiste `.spts` und auf
      dem Abschluss-Screen). Das entspricht dem amtlichen Bogen (»Schreibfehler führen zur
      Halbierung der Punktezahl«); die Zeile weist das aus.
      **Belohnung:** `celebrate(anchor, stärke)` streut ein paar Blättchen (reines
      CSS/JS, `.conf-host`/`.conf`, keine Bibliothek) – Stärke 1 bei jedem Treffer
      (Quiz, Tippen, Bilder), Stärke 2 am Sitzungsende ab 80 % bzw. bei gewonnenem
      Duell. Respektiert `prefers-reduced-motion` und ist in `try/catch` gekapselt
      (Animation darf nie eine Sitzung kippen). `tests/learn.mjs` prüft die drei Stufen
      im Ablauf (inkl. Partikel nur bei Treffern) und `judgeTyped`/`fieldJudge`/`markDiff`
      im Detail.

- [x] **Wikipedia-Vorschau: keine Elternart bei Unterarten** (Rückmeldung: bei
      *Steckrübe* erschien *Raps*). Ursache: `wikiCandidates` probierte nach dem vollen
      Namen das **reine Binom** – bei einer Unterart ist das die **Elternart**
      (`Brassica napus` = Raps; Steckrübe = ssp. *rapifera* mit eigenem Artikel). Neu:
      Bei **anderer Unterart/Varietät** (`infraEpithet` gesetzt und ≠ `binomEpithet`,
      also **kein Autonym**) wird das bloße Binom **weggelassen** und der **deutsche Name**
      genommen; bei **reinen Arten** und **Autonymen** (`subsp. X` = `X`, z. B.
      *Cornus kousa* subsp. *kousa*) bleibt das Binom (dieselbe Pflanze). Zusätzlich
      `deArticleTitles()`: deutsche Namen als Artikeltitel, jeweils **ohne Bindestrich**
      (Wikipedia löst ihn nicht auf: »Steck-Rübe« → nichts, »Steckrübe« → Treffer) und mit
      **aufgelöstem geteiltem Grundwort** (»Kohl- / Steck-Rübe« → *Steckrübe* **und**
      *Kohlrübe*). Gegen die echte API über alle 93 infraspezifischen Arten geprüft:
      Steckrübe→Steckrübe, Autonyme (Petersilie, Schwarz-Pappel, Asiatischer Blüten-
      Hartriegel) wieder korrekt, Raps nirgends fälschlich. `tests/learn.mjs` prüft
      offline die Kandidaten-Reihenfolge (Steckrübe ohne »Brassica napus«, Autonym mit
      Binom, reine Art Binom-first) und `deArticleTitles`.
- [x] **PWA heißt »Pflanze-BW«** – Manifest `name`/`short_name` und
      `apple-mobile-web-app-title` auf **Pflanze-BW** gesetzt (Home-Bildschirm-Label bei
      der Installation). Interne Titel/Kopfzeilen der Seiten bleiben »Pflanzenkenntnis«.

- [x] **Krautige Lern-Themen (M2/M3/M4)** – das Themen-System (`themeOf` in `learn.js`,
      bislang nur Gehölze + Obst) verfeinert jetzt auch die drei großen krautigen
      Kategorien; die Seeds und das Prüfungswerkzeug bleiben unberührt (Laufzeit-Themen):
      **M2 Stauden (550)** nach Lebensbereich → *Beet- & Prachtstauden* (231),
      *Schatten- & Gehölzrandstauden* (134), *Steingarten- & Polsterstauden* (97),
      *Wasser- & Uferstauden* (44). **M3 Gemüse (120)** nach Nutzungsgruppe →
      *Frucht-/Kohl-/Wurzel- & Knollen-/Blatt- & Salat-/Zwiebelgemüse*, *Hülsenfrüchte*
      (Obst war bereits über `FRUIT_THEME` gegliedert). **M4 Zimmerpflanzen (109)** nach
      Typ → *Grün- & Blattschmuck-*, *Blühende*, *Sukkulenten & Kakteen*, *Bromelien*,
      *Orchideen*, *Palmen & Zimmerfarne*. Kuratiert nach Gattung/Art (Lebensbereich der
      Staude via `ST_*`/`ST_SPEC`, Nutzungsgruppe via `GEM_*`, Zimmertyp via `ZI_*`),
      botanisch gegen **alle 2114 Arten** geprüft (`tools/themes_check.py` = kuratierte
      Referenz + Verteilungs-/Mitglieder-Report). Nur drei neue Zweige in `themeOf`
      **nach** den Gehölz-/Obst-Regeln – bestehendes Verhalten unverändert (z. B.
      Erdbeere im Obstbau bleibt via `FRUIT_THEME` »Beerenobst«). `THEME_ORDER` um die
      neuen Namen erweitert. `tests/learn.mjs`: 18 Referenz-Zuordnungen (je Thema eine)
      + Listen-/Druck-Ansicht auf die feineren Bänder umgestellt.

- [x] **Fokus-Modus (Vollbild-Lektion auf dem Smartphone)** – sobald eine Sitzung
      läuft (Karteikarten/Quiz/Tippen/Bilder), füllt die aktuelle Karte bzw. Frage auf
      dem Handy den ganzen Bildschirm: Kopf, Setup und Fußzeile verschwinden, es bleibt
      nur die Aufgabe. Umgesetzt als **reines CSS-Overlay** (`body.stagefull` blendet
      `#stage` als `position:fixed; inset:0` über die Seite) statt der Fullscreen-API –
      das funktioniert auch auf dem iPhone, wo die echte API nur für `<video>` greift.
      In JS eine winzige Weiche `stageFull(on)` (Klasse an/aus): **an** in
      `startSession`/`startChallenge`, **aus** in `finishSession` und `applyMode`
      (Moduswechsel bricht ab). Die **Fortschrittsleiste** wird `position:sticky` und
      hält den **beenden**-Knopf immer sichtbar → jederzeit zurück zur Übersicht;
      `z-index:55` bleibt unter Toast (60), Info-Modal/Konfetti (80). Safe-Area-Insets
      (Notch) berücksichtigt, `100dvh` gegen die iOS-Adressleiste. Nur `@media
      (max-width:640px)` – am Desktop unverändert. Offline-rein (kein `fetch`/CDN);
      `check_offline.py` bleibt grün. Kurznotiz im Hilfe-Panel; `tests/learn.mjs` prüft:
      `#stage` während der Lektion `fixed`/Vollbild + Leiste `sticky`, nach »beenden«
      und nach Moduswechsel wieder normal.

- [x] **Ergebnis + Teilen bleiben im Fokus-Overlay (UI-Audit, Schritt 1).** Bisher rief
      `finishSession` sofort `stageFull(false)` – der Abschluss-Screen samt Teilen-/
      Lernduell-Block fiel damit aus dem Vollbild zurück in den vollen Seitenfluss und
      landete auf dem Handy **unter dem Fold** (unter Kopf/Setup/Disclaimer). Jetzt bleibt
      das Fokus-Overlay bis zum Schluss an: »Sitzung geschafft« + Trefferquote + der
      **Teilen-Block** stehen mittig im Vollbild (neue Regel `body.stagefull .stage-empty`
      zentriert ohne Kastenrahmen). Verlassen über den neuen Knopf **»Zur Übersicht«**
      (`exitSession` → `stageFull(false)` + Bereit-Screen + Scroll nach oben); **»Weiter
      lernen«** startet direkt im Vollbild neu. Auf dem Desktop (kein Overlay) holt ein
      `scrollIntoView` das Ergebnis in den Blick. Abbruch über »beenden« zeigt jetzt
      »Sitzung **beendet**« statt »geschafft« (`aborted = qi < queue.length`);
      `.sessionbar` bricht bei Punkte+Uhr+beenden sauber um (`flex-wrap`). Direkt aus dem
      Nutzerwunsch »das Teilen-Modul soll auch am Ende im Quiz-Modal erscheinen«.
      **Nebenbei stabilisiert:** `tests/learn.mjs` war flaky (zog je Lauf andere Karten;
      Stichproben-Assertions für Sammelnamen/Bild-Optionen lagen zufällig daneben) – jetzt
      **deterministischer Seed** (`Math.random`-Override via `evaluateOnNewDocument`) und
      die betroffenen Assertions bilden den Erwartungswert mit der App-Logik `deMain()`
      statt naiv am ersten »/«/Komma zu splitten. `tests/learn.mjs` prüft nun: Ergebnis +
      Teilen bleiben im Overlay (`btnOverview` + Teilen-Block sichtbar), Exit über »Zur
      Übersicht« beendet den Fokus-Modus.

- [x] **Lern-Start aufgeräumt + ein Filtermodell (UI-Audit, Schritt 2).** Drei ruhigere
      Bausteine im Lern-Tool. (1) **KI-/Haftungshinweis eingeklappt:** der lange Absatz
      unter »Sitzung starten« ist jetzt ein natives `<details class="learnnote">` –
      Einzeiler »Bitte beachten: Inhalte teils KI-erzeugt, ohne Gewähr (mehr)«, Volltext
      auf Klick. Die Startansicht ist damit deutlich kürzer (Fortschrittsbox rückt nach
      oben). (2) **Ein Filtermodell in der Liste:** früher filterte im Listenmodus
      **zusätzlich** das »Optionen · Auswahl«-Dropdown (`#cat`-Scope via `pool()`) neben
      den »Ansicht & Filter«-Tags – zwei stille Systeme fürs selbe Ziel. Jetzt speist sich
      die Liste allein aus Suche + Ansicht-Tags (+ ZP); `listFiltered()` nutzt nur noch den
      ZP-Filter, und `#cat` (»Auswahl«) ist im Listenmodus ausgeblendet (`applyMode`). Der
      Scope bleibt für **Sitzungen** erhalten (grenzt den Lernstoff auf Thema/Familie ein).
      (3) **Aktive Optionen sichtbar:** `syncOptsSummary()` spiegelt vom Standard
      abweichende Einstellungen (umgekehrte Abfrage, Thema/Familie, »nur ZP«, »nur
      Prüfungsstoff«, abweichende Kartenzahl) grün in die **zugeklappte** »Optionen«-
      Kopfzeile – man sieht ohne Aufklappen, was gilt (wie `syncFilterSummary` im
      Prüfungswerkzeug). Offline-rein; `tests/learn.mjs` prüft: Auswahl grenzt die
      **Sitzung** (pool) ein / filtert die **Liste nicht** (im Listenmodus ausgeblendet),
      und aktive Optionen erscheinen in der Kopfzeile.

## Offene Aufgaben (TODO)

- [ ] Fehlende Einzelangaben aus den Quelllisten prüfen/ergänzen (z. B. fehlt bei
      `garten_und_landschaftsbau_gaertner` die Familie zu *Chimonanthus praecox* –
      so in der Excel; im Tool nachtragbar).
- [ ] Bei künftigen Listen-Updates: Excel nach `data/<profil-id>.<ext>` legen,
      `tools/rebuild_seeds.sh` (oder Konverter je Datei) laufen lassen, bauen,
      Offline-Check + Smoke-Test.
