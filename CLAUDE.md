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
- **Zwei bewusste Ausnahmen, beide opt-in:**
  (1) Das »ℹ Mehr zur Pflanze«-Modal bietet **optionale** Online-Infos (deutsche
  Wikipedia, nur auf Knopfdruck) – **in beiden Werkzeugen** (Lern-Tool und
  Prüfungswerkzeug; die Info-Karte ist identisch, im Prüfungswerkzeug über die
  ℹ-Knöpfe in der Auswahl-Liste und in der »Aktuellen Prüfung«). (2) Der **Lernmodus
  »Bilder«** lädt Bilder von Wikipedia/Wikimedia Commons – aber erst, wenn der Modus
  gestartet wird (**nur im Lern-Tool**).
  Beide laden **nichts beim Seitenaufbau** und nutzen **JSONP** (zur Laufzeit
  erzeugtes `<script>`) statt `fetch`/`XHR` – dadurch bleibt `check_offline.py` grün.
  Der Kern (**Karteikarten/Quiz/Selbst eingeben/Liste** bzw. Ziehen/Bogen/Musterlösung/Noten)
  funktioniert **ohne Netz** vollständig weiter; ohne Verbindung sagt es der Bilder-
  Modus bzw. der Wikipedia-Knopf klar an. Die Deep-Link-Buttons öffnen bloß einen
  neuen Tab. **Der Prüfungsbogen selbst bleibt strikt offline** – der Druck (Leerbogen
  und Musterlösung) und die Notenberechnung rufen nichts nach; die Wikipedia-
  Anreicherung sitzt ausschließlich im optionalen ℹ-Modal, nie im Bogen.
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

Aus **einer** gemeinsamen Pflanzendatenbank (`seeds/`) werden zwei Werkzeuge und eine
statische Rechtliches-Seite gebaut. **Die Wurzel `pflanze-bw.de` ist das Lern-Tool** —
eine verzweigende Startseite gibt es bewusst **nicht mehr**:

```
                          ┌────► dist/pflanzenkenntnis.html  Prüfungswerkzeug (Prüfende)
seeds/*.json  ────────────┤      (template.html + app.js  + Seeds + SheetJS inline)
src/{template,app}.js  ───┤      + dist/pruefung/index.html  hübsche Adresse /pruefung (Weiterleitung)
src/{learn.html,learn.js} ┼────► dist/pflanzen-lernen.html   Lern-Tool (Azubis)
lib/xlsx.full.min.js  ────┘      dist/index.html             DASSELBE Lern-Tool (= Wurzel)
                                 (learn.html    + learn.js + Seeds, OHNE SheetJS)

src/recht.html  ──────────────► dist/rechtliches.html      Impressum & Datenschutz
                                 (statisch, ohne Seeds/JS; von beiden Werkzeugen verlinkt)
                → build.py schreibt alle Dateien + versionierte Root-Kopien
```

**Zugänge (bewusst getrennte Zielgruppen):**
- **Azubis:** `pflanze-bw.de` → direkt das **Lern-Tool**. Es ist eine **Sackgasse**:
  Es verlinkt **nirgends** auf das Prüfungswerkzeug (nur Impressum/Datenschutz in der
  Fußzeile, gesetzlich nötig). Azubis sollen das Prüfungswerkzeug gar nicht erst sehen.
- **Prüfende:** `pflanze-bw.de/pruefung` (oder direkt `/pflanzenkenntnis.html`).
  Von dort führt ein Link **»Lernversion →«** zum Lern-Tool — der Weg geht also nur
  in **eine** Richtung.
- `index.html` und `pflanzen-lernen.html` tragen **dieselbe** Datei (Altlinks,
  Lesezeichen und die PWA-Verknüpfung bleiben gültig).
- `dist/pruefung/index.html` ist eine winzige **Weiterleitung** auf
  `../pflanzenkenntnis.html` (kein Server-Rewrite nötig; die echte Datei bleibt die
  eine Quelle, PWA/Service-Worker und relative Links unverändert). Sie wird **nicht**
  als Root-Kopie ins Repo geschrieben – reines Deploy-Beiwerk.

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
python3 tools/check_offline.py dist/index.html             # Offline-Check Wurzel = Lern-Tool (muss grün sein)
python3 tools/check_offline.py dist/pruefung/index.html    # Weiterleitung /pruefung
python3 tools/check_offline.py dist/pflanzenkenntnis.html  # dito Prüfungswerkzeug
python3 tools/check_offline.py dist/pflanzen-lernen.html   # dito Lern-Tool
python3 tools/check_offline.py dist/rechtliches.html       # dito Impressum & Datenschutz
```

Node (Konverter und Tests):

```bash
node tools/xlsx_to_seed.mjs <excel> <profil-id> [--sheet "Blattname"]
bash tools/rebuild_seeds.sh            # alle Seeds aus data/<id>.<ext> neu erzeugen
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

**Datenherkunft prüfen:** `bash tools/rebuild_seeds.sh && git diff --exit-code seeds/` – die
Seeds müssen sich byte-genau aus den amtlichen Excel-Listen in `data/` ergeben (läuft in CI und
vor jedem Deploy; bei Abweichung geht nichts online). Seeds nie von Hand ändern;
Formanpassungen in den Konverter, Lücken in `fix_source_gaps.py`.

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
- **Kein IHK-Schlüssel.** Für die Gärtnerberufe in BW wird **immer linear**
  gerechnet; die frühere IHK-Umschaltoption (100-Punkte, ungleichmäßig) wurde auf
  Wunsch **entfernt** (Notenrechner ohne Modus-Umschalter, `computeGrade`/`buildSheet`
  nur noch linear, ein alt gespeicherter `mode:"ihk"` heilt sich beim Öffnen des
  Notenrechners zu `linear`).
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

- [x] **Fokus-Modus auch am Desktop + ZP-Marker neutral (UI-Audit, Schritt 3).** Der
      Vollbild-/Fokus-Modus (`body.stagefull`) galt bisher nur `@media (max-width:640px)`;
      auf Desktop/Tablet lief die Sitzung inmitten des vollen Seitenchroms. Jetzt greift
      das Overlay auf **allen Viewports** (Regeln aus der Mobile-Media-Query herausgezogen):
      `#stage` wird `position:fixed; inset:0` und zentriert seinen Inhalt als **Lese-Spalte**
      (`#stage>*{max-width:720px}`, `align-items:center`) – am Desktop ein ruhiger,
      ablenkungsfreier »Lernraum«, am Handy unverändert randfüllend. Kein JS nötig
      (`stageFull()` setzte die Klasse ohnehin schon überall; nur die CSS-Sperre fiel weg);
      Bildhöhe im Bilder-Quiz zusätzlich auf `min(38vh,420px)` gedeckelt. **Konsistenz:**
      der **ZP-Marker** (`.sp-zp`) war im selben Rot (`--madder`) wie Fehler/„Nochmal" –
      jetzt neutrales Sepia, denn ZP ist ein sachlicher Relevanz-Hinweis, keine Warnung.
      (Sessionbar-`flex-wrap` und der Abbruch-Titel »Sitzung beendet« kamen schon in
      Schritt 1.) Offline-rein; `tests/learn.mjs` prüft den Desktop-Fokus (`#stage` fixed,
      zentrierte Spalte ≤720px, Exit über »Zur Übersicht«).

- [x] **Lern-Barrierefreiheit & Touch (UI-Audit, Schritt 4).** Der Kern-Modus war für
      Tastatur/Screenreader unbedienbar (Karte = `<div onclick>`). Jetzt: die **Karteikarte
      ist ein echter Button** (`role="button"`, `tabindex="0"`, Fokus beim Rendern), die
      **Leertaste/Enter dreht um**, danach bewerten die Tasten **1/2/3** (Nochmal/Unsicher/
      Gewusst) – ein globaler `cardKeys`-Listener, der nur im Karten-Modus greift; nach dem
      Umdrehen wandert der Fokus auf »Nochmal«. **Rückmeldungen als `aria-live="polite"`**
      (`#fb` in Quiz/Tippen/Bilder) → Screenreader sagt »Richtig!/Fast/Leider falsch« an.
      **Modale barrierefrei:** Info- und Familien-Steckbrief bekommen beim Öffnen den Fokus
      auf »Schließen«, eine **Tab-Fokusfalle** (Tab zykelt im Dialog) und geben den Fokus
      beim Schließen an den Auslöser zurück (`infoReturnFocus`, `infoKey` um Tab erweitert).
      **Touch:** sichtbarer Fokusring am Schalter (`.switch input:focus-visible + .track`)
      und an der Karte; ≥44 px Tap-Ziele auf dem Handy (`.btn`/`.modes button`/`.modal-x`,
      `.cattag`/`.sortbtn` ≥36). Offline-rein; `tests/learn.mjs` prüft Karten-Button,
      Leertaste-Umdrehen + Bewertung, `aria-live` und den Modal-Fokus.

- [x] **Prüfwerkzeug – Barrierefreiheit & Touch (UI-Audit, Schritt 5).** Erster Schritt am
      Prüfungswerkzeug. **Modale barrierefrei – zentral & additiv:** eine neue Funktion
      `wireModalA11y()` (in `wire()`) vergibt allen neun `.scrim`-Modalen `role="dialog"`,
      `aria-modal="true"` und `aria-labelledby` (Titel-`id` automatisch), legt beim Öffnen den
      Fokus ins Modal und gibt ihn beim Schließen an den Auslöser zurück (per
      `MutationObserver` auf die `.open`-Klasse – **kein** Eingriff in die neun verstreuten
      Öffnen-Wege oder die zentralen Schließen-Handler), plus eine **Tab-Fokusfalle** im
      obersten offenen Dialog. **Toast als Live-Region** (`role="status" aria-live="polite"`,
      Fehler `assertive`) → Rückmeldungen wie »20 Arten gezogen« werden angesagt. **Touch/
      Tablet:** Zeilen-Aktionen (Bearbeiten/Löschen) waren nur bei `:hover` sichtbar und auf
      dem iPad (>640 px, `hover:none`) gar nicht erreichbar – jetzt `@media (hover:none){
      .rowacts{opacity:1}}`; dazu ≥40 px Tap-Ziele auf Touch (`.iconbtn`/`.pclose`/`.scmove`/
      `.btn.small`). Offline-rein; die offiziellen Leerbögen unberührt. `tests/smoke.mjs`
      prüft role/aria-modal/aria-labelledby, Fokus ins Modal beim Öffnen und die Toast-Live-
      Region.

- [x] **Prüfwerkzeug – Farben & Wortlaut (UI-Audit, Schritt 6).** Kleine, testneutrale
      Klarheits-Politur. **Farben:** »Bogen drucken« (`#btnPrint`/`#pvPrint`) war rot
      (`.madder`) – Rot signalisiert sonst Gefahr/Löschen; jetzt **grün** (`.primary`),
      denn es ist die wichtigste **positive** Aktion. Umgekehrt bekommt **»Standardliste«**
      (`#btnReset`, verwirft gespeicherte Änderungen, mit `confirm()`) jetzt **Rot** – Rot
      bleibt destruktiven Aktionen vorbehalten. **Wortlaut:** der Auswahl-Zähler koppelt
      »N / Ziel« an das **feste Profil-Soll** statt an das Eingabefeld (`syncSelUI`:
      `#selTarget = drawTarget()`), sodass »18 / 20« als Fortschritt und nicht als Fehler
      liest; Label »gezogen« → **»gewählt«** (deckt Ziehen **und** Anhaken ab). Die
      **Status-Pille** spricht Alltagssprache statt Technik (`setStatus`): »Standardliste«,
      »Wird gespeichert …«, »Auf diesem Gerät gespeichert«, »Nur für diese Sitzung (kein
      dauerhafter Speicher)«. Offizielle Leerbögen unberührt, offline-rein; alle vier
      Puppeteer-Tests grün.

- [x] **Prüfwerkzeug – zwei Modi, »Aktuelle Prüfung«-Panel & immer sichtbare Suche
      (UI-Audit, Schritt 7).** Der größte Umbau am Prüfungswerkzeug. **Dauerhaftes
      »Aktuelle Prüfung«-Panel** (`#currentSel`): die gezogene Auswahl war bisher nur im
      Vorschau-Modal sichtbar und lag sonst verstreut in der Gesamt-Datenbank – jetzt
      steht sie **dauerhaft** unter der Ziehen-Leiste, nummeriert und voll bearbeitbar
      (▲▼ · Bearbeiten · Entfernen). Umgesetzt über eine geteilte Zeilenvorlage `pvRowEl()`
      (aus `renderPreview` extrahiert) + `renderCurrentSel()`, angehängt an `syncSelUI()` –
      das Vorschau-Modal bleibt unangetastet. **Zwei Modi** über Tabs »Prüfung erstellen ⇄
      Liste verwalten« (`#tabExam`/`#tabManage`, `setMode()` toggelt eine Body-Klasse
      `m-exam`/`m-manage`, gemerkt im `localStorage`): »Liste verwalten« blendet Ziehen-
      Leiste + `#currentSel` aus und stellt die Pflanzenliste zum Bearbeiten in den
      Vordergrund; »Prüfung erstellen« zeigt Ziehen + aktuelle Prüfung + Drucken.
      **Suche zentral & immer sichtbar** (Nutzerwunsch): das Suchfeld `#q` steckte im
      eingeklappten Filter-Akkordeon – jetzt eine dauerhafte, prominente Suchleiste
      (`.findbar`), das Akkordeon (`#filterOpts`) hält nur noch Kategorie/ZP; die Suche
      bleibt in **beiden** Modi sichtbar (`syncFilterSummary` ohne Such-Term, Default
      »Kategorie · nur ZP«). `#adminBar`/`#btnAdmin` und die offiziellen Leerbögen bleiben
      unberührt; offline-rein. `tests/smoke.mjs` erweitert: Suche immer sichtbar (nicht im
      Akkordeon), Ziehen füllt das Panel nummeriert, Modus-Umschaltung blendet Leiste+Panel
      korrekt aus/ein, Suche bleibt in »Liste verwalten« sichtbar.

- [x] **Suchleiste klebt beim Scrollen oben (UI-Audit, Schritt 7b).** Nutzerwunsch: beim
      Runterscrollen der (langen) Pflanzenliste soll die Suche als kleiner sticky Header
      oben bleiben. Die `.findbar` ist jetzt `position:sticky; top:0` (z-index 40, unter den
      Modalen); ein `scroll`-Listener setzt `.stuck`, sobald sie wirklich angepinnt ist
      (dezenter Schatten + Trennlinie). Offline-rein; `tests/smoke.mjs` prüft
      `position:sticky`.

- [x] **Lernpfad: Modi nach Schwierigkeit + Erst-Einweisung (Lern-Tool).** Die Modi sind
      jetzt als **Lernpfad von leicht bis prüfungsreif** sortiert: **Bilder (leicht) →
      Quiz (leicht) → Karteikarten (mittel) → Tippen (prüfungsnah) → Liste (nachschlagen)**;
      jeder Tab trägt ein dezentes Schwierigkeits-Tag (`.mdiff`, Mono-Kapitälchen unter dem
      Namen). Neue Nutzer starten im leichtesten Modus (Default `photo` statt `cards`; wer
      schon einen Modus gewählt hat, behält ihn via `localStorage`). **Erst-Einweisung**
      (`openIntro()` in `learn.js`): beim **ersten Besuch** öffnet einmalig ein Modal »So
      wirst du prüfungsreif« mit den vier Stufen samt Tags und dem Ziel (Gattung/Art/Familie
      sicher benennen); »Los geht's«/×/Esc/Scrim schließen und merken `pflanzenlernen.introSeen`
      – danach ist die Einführung **nie mehr im Weg**, bleibt aber über den dezenten Link
      **»So funktioniert der Lernpfad ›«** (`#btnIntro`, unter den Modus-Tabs) jederzeit
      erreichbar. Bei Duell-Links (`#c=…`) erscheint sie nicht (Challenge geht vor). Fokus
      beim Öffnen auf »Los geht's«, Rückgabe beim Schließen. Offline-rein; `tests/learn.mjs`
      setzt `introSeen` global vorab (damit die übrigen Tests unberührt bleiben) und prüft:
      Modi-Reihenfolge `photo,quiz,cards,type,list`, Tags (leicht … prüfungsnah), Intro
      öffnet mit vier Stufen, »Los geht's« schließt und merkt »gesehen«.

- [x] **Intro-Feintuning-Hinweis + Sticky-Listen-Suche (Lern-Tool).** (1) Die
      Erst-Einweisung (»So wirst du prüfungsreif«) erklärt jetzt zusätzlich die
      **Feineinstellung**: Unter »Optionen« lässt sich jede Stufe anpassen – vom
      **deutschen Namen** allein bis zur prüfungsechten Abfrage von **Gattung, Art und
      Familie** (Felder einzeln wählbar), dazu Lernstoff/ZP/Sitzungslänge (`.intro-tip`
      in `openIntro`). (2) **Listen-Suche klebt beim Scrollen** (Konsistenz zum
      Prüfwerkzeug): `#listSearchRow` (+ `#listControls`) wurden aus der `.setup`-Karte
      auf **Seitenebene** verschoben (sticky endet sonst an der Unterkante des Eltern-
      elements), `position:sticky; top:0` + `.stuck`-Schatten via Scroll-Listener in
      `wire()`; IDs unverändert, `applyMode` funktioniert weiter. **Design-Entscheid**
      (Nutzer): Im Prüfwerkzeug bleibt die Datenbank-Liste im Modus »Prüfung erstellen«
      sichtbar (praktisch fürs Nachlegen). `tests/learn.mjs` prüft den Optionen-Hinweis
      im Intro und sticky + Position außerhalb `.setup`.

- [x] **Herbarium 2.0 – 2026-Design-Refresh + Dark Mode (alle vier Seiten).** Die
      botanische Identität (Grün, Serifen, Papier) bleibt, die Umsetzung ist modern:
      **(1) Design-Token-Layer** am Ende jedes `<style>` (Marker »Herbarium 2.0«):
      neue Tokens `--card` (ersetzt hartkodiertes `background:#fff` in Lern-/Prüf-Tool),
      `--glass`/`--glass-m` (Glas-Flächen), `--shadow-1/-2` (mehrschichtige Tiefe);
      weiche große Radien (Karten 16–20 px, Buttons 10 px, Chips als Pills), Glas-Effekt
      (`backdrop-filter: blur`) auf Sticky-Leisten (`.findbar`, `.listsearchrow`,
      Fokus-`sessionbar`) und allen Modalen, sanfte Hover-Lifts. **(2) Dark Mode:**
      folgt automatisch dem System (`prefers-color-scheme`), zusätzlich ein **runder
      Umschalt-Knopf** (`#btnTheme`, Mond/Sonne) im Kopf jeder Seite – die Wahl
      (`pbw.theme`, geräteweit für alle Seiten) übersteuert das System und wird per
      Inline-Snippet im `<head>` **vor dem ersten Rendern** gesetzt (kein Aufblitzen);
      dunkle Palette überschreibt nur die `:root`-Variablen (zweifach: `[data-theme=
      "dark"]` + Media-Query mit `:not([data-theme="light"])`), plus gezielte Fixes
      (`.btn.primary:hover`, `.toast` – `--green-deep` ist im Dark Mode ein heller
      Akzent) und zweite `theme-color`-Meta. **(3) Druck bleibt immer hell:** ein
      `@media print`-Guard setzt die Kern-Token auf Hell zurück – amtliche Bögen/Listen
      unverändert, egal welches Theme aktiv ist. Umgesetzt per Transformer-Skript
      (idempotent, Marker-geschützt) in `src/{learn,template,start,recht}.html`; die
      Tool-Logik (`app.js`/`learn.js`) ist unberührt. Offline-rein (nur Inline-Skripte).
      `tests/learn.mjs` + `tests/smoke.mjs` prüfen den Umschalter (data-theme wechselt,
      Wahl gespeichert); Light + Dark aller Kernansichten per Screenshot verifiziert.

- [x] **Herbarium 2.0 · Stufe 2 – Spotlights, Papier-Milchglas, Motion (alle vier
      Seiten).** Der Light Mode wirkte nach Stufe 1 fast unverändert – jetzt ist der
      Refresh deutlich sichtbar, ohne die botanische Ruhe zu verlieren (Marker
      »Stufe 2« am Ende jedes `<style>`): **(1) Spotlight-Hintergrund** – drei große,
      weiche Lichtkegel (Grün/Gold/Krapp, Token `--spot1..3`) liegen als
      `radial-gradient`-Ebenen über der Papier-Punktraster-Textur (`background-
      attachment:fixed` für Tiefe; der Fokus-Modus `body.stagefull #stage` bekommt
      dieselben Ebenen). **(2) Papier-organisches Milchglas** – die großen Karten
      (Masthead, Setup, Karteikarte, Progress, Selbar, »Aktuelle Prüfung«, Choices,
      Doc …) sind jetzt transluzent (`--glass-card`) mit `backdrop-filter: blur` –
      die Spotlights schimmern grün durch – plus **feines Papierkorn** (SVG-
      `feTurbulence` als Daten-URI, Token `--grain`) und einer **Licht-Kante oben**
      (`inset 0 1px 0 var(--edge)`) für den 3D-Touch. **(3) Motion** – Modale gleiten
      mit `h2ModalIn` ein (translateY+scale, expo-out; Lern-Scrims animieren beim
      Einhängen, Prüf-Scrims über `.open`), Seiten bauen sich gestaffelt auf
      (`h2Rise`), Quiz-Optionen/Bewertungs-Knöpfe heben sich beim Hover, Buttons
      federn beim Drücken (`:active` scale), Fokus bekommt einen weichen grünen Ring
      (`--ring`), Primär-Buttons einen dezenten 3D-Verlauf. Alles unter `prefers-
      reduced-motion` abgeschaltet; Dark-Token für Spotlights/Glas/Kante doppelt
      hinterlegt; Druck unberührt (Print-Guard aus Stufe 1 gilt weiter). Per
      idempotentem Transformer (`Stufe 2`-Marker) eingespielt; Logik unberührt;
      offline-rein (Daten-URI statt Netz). Alle vier Puppeteer-Tests grün; Light-
      Screenshots (Start, Prüfwerkzeug, Lern-Setup, Intro-Modal) + Dark-Gegenprobe
      verifiziert.

- [x] **Herbarium 2.0 · Stufe 3 – Fluidität: View-Transitions, gleitende Klappen,
      moderne Controls.** Alles fühlt sich flüssiger/organischer an: **(1) View-
      Transitions** – diskrete Zustandswechsel blenden weich über statt hart zu
      springen: Kategorie-/ZP-Filter (Gefiltertes gleitet heraus/herein), Ansicht-/
      Tag-Wechsel der Lernliste, Modus-Tabs (beide Tools), Profilwechsel, »Zufällig
      ziehen« (Prüfung gleitet ins Panel) und der **Theme-Umschalter** (ganzseitiger
      Crossfade). Zentraler Helfer `vt(cb)` in `app.js`/`learn.js` (Fallback: sofort
      rendern ohne API, bei `prefers-reduced-motion` und im Test via `window.__noVT` –
      die Puppeteer-Harnische setzen das Flag, weil VT asynchron rendert; ein echter
      Async-Check bestätigt Filter/Modus/Theme im VT-Betrieb). Slide-Animationen über
      `view-transition-name` auf `#stage` (Lern) bzw. `#list`/`#currentSel` (Prüf);
      Suchfelder bleiben bewusst instant (VT je Tastendruck wäre flackerig).
      **(2) `<details>`-Klappen gleiten** auf/zu (`interpolate-size:allow-keywords` +
      `::details-content`-Height-Transition – progressive enhancement). **(3) Moderne
      Controls:** Dropdowns mit eigenem SVG-Chevron (`appearance:none`, Daten-URI,
      dunkle Variante), einheitliche Feld-Hintergründe über `:where(...)`-Regeln
      (Null-Spezifität → bestehende Styles gewinnen), größere federnde **Schalter**
      (42×24, Spring-Kurve, Grün-Verlauf), `accent-color` für Checkboxen/Radios,
      **dünne runde Scrollbalken**, Toast mit Spring-Pop. Offline-rein; Druck-Guard
      unberührt; alle vier Puppeteer-Tests grün.

- [x] **Fehlende Quelllisten-Angaben reproduzierbar nachgetragen.** Systematischer
      Scan über alle **2114** Arten: genau **eine** echte Lücke – die in der Excel
      leere **Familie** zu *Chimonanthus praecox* (`garten_und_landschaftsbau_gaertner`);
      korrekt **Calycanthaceae** (Gewürzstrauchgewächse, botanisch eindeutig, steht im
      Baumschul-Seed derselben Art bereits so). Die vier leeren **Art**-Felder sind
      dagegen legitim (Hybrid-Gruppen *Fuchsia-/Rosa-/Freesia-/Hippeastrum-Hybriden*
      ohne Art-Epitheton) und bleiben. Nachgetragen **nicht** von Hand im Seed (ein
      Neubau aus der Original-Excel würde es verwerfen), sondern über einen neuen,
      idempotenten Schritt `tools/fix_source_gaps.py`: füllt ausschließlich **leere**
      Felder, nur bei exaktem Gattung+Art-Treffer, zentrale `CORRECTIONS`-Tabelle mit
      Quellenkommentar, `--check`-Report. In `tools/rebuild_seeds.sh` **nach** der
      Excel-Konvertierung und `categorize_seeds.py` eingehängt – so überlebt die
      Korrektur jeden Rebuild. Build + Offline-Check + alle vier Smoke-Tests grün.

- [x] **Info-Karte auch im Prüfungswerkzeug** (»ℹ Mehr zur Pflanze«, wie im Lern-Tool):
      In der Auswahl-Liste (`rowEl`) und in der »Aktuellen Prüfung«/Vorschau (`pvRowEl`)
      öffnet ein ℹ-Knopf dasselbe Info-Modal – **botanische Namensherleitung** (offline,
      kuratiert), **neutrale Deep-Links** (Wikipedia/NaturaDB/iNaturalist, öffnen neuen
      Tab) und **opt-in** »Online-Infos laden« (deutscher Wikipedia-Kurztext + Vorschau-
      bild via **JSONP**, kein `fetch`/`XHR` → `check_offline.py` bleibt grün). Die Logik
      (Namensherleitung `LAT_EPI/PRE/SUF/GEN`+`nameEtymology`, Wikipedia-Kandidaten,
      `loadWiki`, `openInfo`) ist **1:1 aus `learn.js`** übernommen; ein Mapper
      `infoCard(p)` bringt die Prüfwerkzeug-Pflanze (lange Feldnamen) auf die kompakten
      Schlüssel der Info-Logik. Das Modal läuft im **eigenen Namensraum**
      `.infoscrim`/`.infobox` (per JS erzeugt, sichtbar im DOM), damit die neun
      bestehenden `.scrim`/`.modal`-Panels (über `.open` sichtbar) unberührt bleiben; der
      Panel-Esc-Handler tritt zurück, solange das Info-Modal offen ist. **Der Prüfungs-
      bogen selbst bleibt strikt offline** – die Anreicherung sitzt nur im ℹ-Modal, nie
      im Druck/Noten. `CLAUDE.md`-Regel (»nicht verhandelbar«) und Datenschutzseite
      entsprechend angepasst (Online-Info jetzt in **beiden** Werkzeugen; »Bilder«-Modus
      weiterhin nur im Lern-Tool). `tests/smoke.mjs` prüft: ℹ öffnet aus Liste **und**
      Aktueller Prüfung, Namensherleitung + drei Deep-Links + Wikipedia-Knopf vorhanden,
      kein `.scrim`-Panel geöffnet (Namensraum-Trennung), Schließen per ×/Esc.

- [x] **Wurzel ist das Lern-Tool, Startseite entfällt, getrennte Zugänge.** Auf Wunsch führt
      **pflanze-bw.de jetzt direkt zum Lern-Tool** (Zielgruppe Azubis); die verzweigende
      Startseite (`src/start.html`, `tests/start.mjs`) ist **entfallen**. Prüfende
      erreichen ihr Werkzeug über die hübsche Adresse **`pflanze-bw.de/pruefung`**
      (`dist/pruefung/index.html` = winzige Weiterleitung auf `../pflanzenkenntnis.html`;
      kein Server-Rewrite nötig, die echte Datei bleibt die eine Quelle) oder weiterhin
      direkt über `/pflanzenkenntnis.html`. **Einbahnstraße:** Das Prüfungswerkzeug
      verlinkt **»Lernversion →«**, das Lern-Tool verlinkt **nicht** zurück – Azubis
      sollen das Prüfungswerkzeug gar nicht zu sehen bekommen (auch die veraltete
      Hilfe-Zeile »Über Prüfungsversion → …« ist raus). Impressum/Datenschutz bleibt aus
      beiden Werkzeugen über die Fußzeile erreichbar (Pflicht); die Rechtliches-Seite
      führt statt »zur Startseite« neutral **»← zurück«** (History, Fallback Lern-Tool).
      `index.html` und `pflanzen-lernen.html` tragen dieselbe Datei (Altlinks/Lesezeichen/
      PWA-Verknüpfung bleiben gültig). **PWA** ist jetzt die Azubi-App: `start_url`
      zeigt auf die Wurzel (= Lern-Tool), der Shortcut »Prüfen« ist entfernt, Name/
      Beschreibung ohne Prüfungswerkzeug; `sw.js` cacht die Weiterleitung mit.
      CI/Deploy angepasst (Startseiten-Test raus, `/pruefung` wird geprüft und
      mit ausgeliefert). `tests/learn.mjs` sichert die Sackgasse ab (kein Link/Text zum
      Prüfungswerkzeug, Rechtliches bleibt), `tests/smoke.mjs` den »Lernversion →«-Link.

- [x] **Lern-Tool radikal vereinfacht: Ein-Knopf-Start mit geführter Sitzung** (auf
      Wunsch »viel unkomplizierter, ohne Funktionen einzusparen«; Bausteine A+B+D des
      Vereinfachungs-Plans, C/Sprache bewusst nicht gewählt). Der Startbildschirm zeigt
      im Kern nur noch **Profil-Chip → »Weiter lernen« → Fortschritt** (vorher 18
      Bedienelemente/~11 Entscheidungen auf vier Handy-Bildschirmhöhen).
      **(A) Geführte Sitzung** (`startGuided`/`guidedForm` in `learn.js`): »Weiter
      lernen« (bzw. »Loslegen« ohne Fortschritt) wählt die Übungsform **pro Karte**
      nach ihrer Leitner-Box – 0–1 → Bilder-Quiz (ohne Internet: Auswahl-Quiz), 2 →
      Quiz, 3 → Karteikarte, 4–5 → Tippen. Umsetzung: `nextCard()` schaltet `mode` je
      Karte um (Renderer, Tastatur-, Uhr-, Punkte- und Leitner-Logik gelten unverändert
      je Form; `sess.formOf` Map, `sess.auto`), beim Abschluss wird der gewählte Modus
      wiederhergestellt; Quote läuft über die **bewerteten** Karten (`sess.scored`),
      »Weiter lernen« am Ende startet wieder geführt. **Geführt = kein Lernduell**
      (`CH_MODES` unangetastet; Teilen weiter in den reinen Modi) – als Brücke bietet
      der Abschluss-Screen **»Diese Lektion als Duell-Quiz«** (`startQuizWith`):
      dieselben Karten als reines Quiz, dessen Abschluss den normalen Teilen-/
      Herausfordern-Block hat (faire, vergleichbare Quote). Die fünf Modi +
      eigene Sitzung + Optionen stecken vollständig erhalten in einer zugeklappten
      **»Selbst wählen«**-Klappe (`#chooseWrap`); »Liste zum Nachschlagen« bleibt als
      eigener Schnellzugriff (`#btnList`, wird in der Liste zum »← Zurück«-Weg,
      `lastLearnMode`). **(B) Profil-Chip** (`#profileChip`): Fachrichtung/Ausbildung
      stecken in einem kleinen Modal (`#profScrim`; IDs `#frSelect`/`#nivSelect`
      unverändert → Logik/Tests intakt), im Kopf nur noch »Gemüsebau · Gärtner/in ✎«;
      beim Erstbesuch öffnet die Berufswahl einmalig nach dem Intro
      (`pflanzenlernen.profilechosen`, Bestandsnutzer via vorhandenem Profil-Store
      ausgenommen). **(D) Optionen in zwei Gruppen** »Was üben?« (Lernstoff · ZP ·
      Prüfungsstoff) / »Wie üben?« (Antwort · Abfrage · Sitzungslänge · Design ·
      Prüfungsfelder) – reine Umsortierung (`.og`/`.og-h`), alle Felder/IDs bleiben.
      Idle-Text (`startHintOnly`) und Intro führen zum Ein-Knopf-Start.
      `tests/learn.mjs` prüft: Ein-Knopf sichtbar + Klappe zu, geführte Mischung
      (Box 2 → Quiz, Box 4 → Tippen), Quote »von N bewerteten«, kein Teilen-Block,
      Profil-Chip + Modal + Merken, Listen-Schnellzugriff hin/zurück, Gruppen-Köpfe.

- [x] **Barrierefreie Touch-Bedienung + Großbildschirm-Politur (beide Werkzeuge,
      UI-Audit Abschluss).** Messbasierter Durchgang (eigener Puppeteer-Audit über
      neun Ansichten, iteriert bis 0 Befunde). **Touch-Ziele ≥44 px** über eine
      kombinierte Media-Query `@media (hover:none),(pointer:coarse),(max-width:640px)`
      (die reine `hover:none`-Abfrage griff in den 360-px-Testviewports nicht –
      Chromium emuliert dort kein `pointer:coarse`): Lern-Tool u. a. `.helplink`,
      `.profchip`, `.introlink`, `.sortbtn`/`.cattag` (+ luftigere Gaps), `select.mini`,
      `.listsearch`, Schalter/`label.exf`, alle `<summary>`-Klappen, Fußzeilen-Links,
      `.sp`-Listenzeilen ≥48; Prüfwerkzeug u. a. `.btn`/`.segbtn`, Profil-Selects,
      Suchfeld, Modal-Felder, `.iconbtn`/`.pclose`/`.scmove` ≥44, Listenzeilen `.row`
      ≥48 mit **Zeile-als-Trefferfläche** (Klick auf die Zeile toggelt die Checkbox;
      Knöpfe/Inputs ausgenommen – `rowEl`-Listener), `#gMax{min-width:82px}` +
      `.maxrow{flex-wrap:wrap}` gegen das zusammengequetschte Punktefeld. **Kontrast:**
      Disclaimer/Fußzeilen und kleine Hinweistexte von `--ink-faint` (2,78:1) auf
      `--ink-soft` (5,64:1) gehoben (beide Werkzeuge, gemessen ≥4,65:1); rein
      dekorative Faints bleiben. **Fokus:** sichtbarer Ring einheitlich über
      Null-Spezifitäts-Regel `:where(button,a,select,input,textarea,summary,
      [role="button"]):focus-visible`. **Großbildschirm (≥1440 px):** Lern-Tool
      `.wrap` 920 px mit großzügigerem Start (`#btnGo` größer), Prüfwerkzeug 1080 px –
      ruhige Lese-Spalten statt gedehnter Layouts. Leerbögen/Druck unberührt,
      offline-rein. **Dauerhafte Testguards:** `tests/learn.mjs` misst am
      360-px-Viewport Hilfe-Link/Chip/Sortier-Knöpfe/Filter-Tags/Suchfeld/Fußzeile
      ≥44 px + Fußzeilen-Kontrast ≥4,5:1; `tests/smoke.mjs` misst Buttons/Tabs/
      Selects ≥44, Zeilen ≥48, prüft Zeilen-Klick (an/ab, ℹ toggelt nicht) und
      `#gMax` ≥80 px.

- [x] **Bilder-Quiz: digitalisierte Bücher aussortiert** (Rückmeldung mit Screenshot:
      »Garten-Dill« zeigte einen Buchdeckel, Bildnachweis »Hill, John, 1714–1775«).
      Ursache: Die feinen Suchwege (Taxon-Kategorie, Phrase, deutscher Name) treffen
      für *Anethum graveolens* var. *hortorum* nichts, und der **Volltext-Notweg**
      `Anethum graveolens hortorum` liefert auf Commons fast nur **digitalisierte
      lateinische Bücher als PDF** (»hortorum« = Genitiv von *hortus* – »Hortus
      Kewensis« 1768 von John Hill war Platz 1); das Vorschaubild eines PDFs ist
      seine erste Seite = der Buchdeckel, und weder Dateiname noch Filter schlugen
      an. Fix (minimal-invasiv, Kette unverändert): `commonsQuery` fragt
      `iiprop=url|mime` mit ab, `pickCommons` verwirft alles außer `image/*`
      (und DjVu); `usablePhoto` verwirft zusätzlich die Endungen `.pdf`/`.djvu`
      und das Internet-Archive-Muster `(IA …)` (Wortgrenze – »(Iain Smith)« bleibt).
      Dadurch läuft die Kette weiter zur **Ersatzroute** und landet beim echten Foto
      (Art-Kategorie: »Anethum graveolens20090812 475.jpg«; das Artikelbild der
      Wikipedia ist hier eine historische Illustration und bleibt korrekt Notnagel).
      Bild-Cache-Key auf `pflanzenlernen.photos3` gehoben (schlechte Treffer beim
      Nutzer verfallen). **Verfahren wie gehabt:** Python-Zwilling der Kette gegen
      die echten APIs – Garten-Dill jetzt echtes Dill-Foto, die Referenzfälle
      (Kirschtomate/Küchen-Zwiebel/Schalotte/Hainbuche) unverändert, *Pelargonium ×
      hortorum* (gleiches »hortorum«-Risiko) sauber, 13/13 Stichproben mit Bild,
      0 Buchscans. `tests/learn.mjs` stellt den Realfall offline nach (PDF-Bücher im
      Volltext-Schritt → Kette muss beim Commons-Foto landen) und prüft die Filter
      (PDF/DjVu/`(IA …)` raus, »(Iain …)«-Foto bleibt).

- [x] **Info-Karte: Elternart als letzter Wikipedia-Notnagel** (zweiter Garten-Dill-
      Fund, Screenshot: »Kein deutscher Wikipedia-Artikel gefunden«, obwohl »Dill
      (Pflanze)« existiert). Ursache: Seit dem Steckrüben-Fix lässt `wikiCandidates`
      bei **fremden Varietäten** (infraspezifisch, kein Autonym) das bloße Binom ganz
      weg – zu Recht als *früher* Kandidat (sonst erschien Raps für die Steckrübe),
      aber dadurch fand Garten-Dill (alle Kandidaten missing: voller Name,
      »Garten-Dill«, »Gartendill«) gar nichts. Fix in `learn.js` **und** `app.js`
      (Info-Karte ist in beiden Werkzeugen): Das Binom wird in diesem Zweig als
      **letzter Notnagel** angehängt – die Steckrübe erreicht ihn nie (ihr deutscher
      Titel trifft vorher), Garten-Dill fällt auf »Anethum graveolens« → »Dill
      (Pflanze)« (Weiterleitung, mit Bild + Kurztext). Live-Zwilling über alle
      **61 eindeutigen infraspezifischen Nicht-Autonym-Arten** der 14 Profile:
      44 unverändert (alle Alt-Treffer identisch, z. B. Steckrübe → Steckrübe,
      Knollensellerie → Echter Sellerie); 12 vorher leere Fälle finden jetzt die
      fachlich korrekte Elternart (Buschbohne → Gartenbohne, Kulturtomate → Tomate,
      Frisée → Endivie, Weiße Kletterhortensie → *Hydrangea anomala* …), 3 bleiben
      mangels deutscher Artikel leer wie bisher – null Regressionen. `tests/learn.mjs`:
      Steckrüben-Assertion auf die neue Semantik gehoben (deutscher Titel VOR dem
      Binom, Binom nur als letzter), Dill-Fall ergänzt.

- [x] **Druckliste: Option »jede Gruppe auf neuer Seite«** (Nutzerwunsch: beim
      Druck nach Thema/Familie soll jede Gruppe auf einer eigenen Seite beginnen –
      mehr Papier, aber übersichtlicher zum Lernen). Opt-in-Checkbox im
      **Drucken-Block** des Listen-Akkordeons (»Ansicht & Filter«), neben
      »Namensherkunft mitdrucken«; Zustand in `pflanzenlernen.printbreak`
      (`printBreakOn()`), Standard **aus**. `buildPrintList` zählt die Gruppen-Bänder
      und gibt ab dem **zweiten** Band die Klasse `pbrk` (das erste bleibt frei,
      sonst entstünde eine leere erste Seite); Print-CSS `table.ptab tr.pcat.pbrk{
      break-before:page}` in `learn.html`. Wirkt in **allen** Ansichten (Thema,
      Familie, A–Z-Buchstaben) und respektiert die gefilterte Menge; der
      Tabellenkopf wiederholt sich ohnehin je Seite. Per Puppeteer-PDF verifiziert
      (Gemüsebau/Thema: 9 Bänder, 6 Seiten ohne → 10 Seiten mit Option, jede Gruppe
      beginnt frisch). `tests/learn.mjs` prüft: Checkbox im Drucken-Block, Standard
      aus (keine `pbrk`-Klassen), aktiv = alle Bänder außer dem ersten mit `pbrk`,
      Speicherung, Rücknahme.

- [x] **Bilder-Quiz: Krankheits-/Schädlingsfotos aussortiert** (Screenshot: Feuerbohne
      zeigte die Makroaufnahme eines rostbefallenen Blatts). Ursache: Das Artikelbild
      der »Feuerbohne« ist eine Illustration (→ korrekt Notnagel), in der Commons-
      Kategorie gewann dann **»Uromyces appendiculatus … telia at Phaseolus
      coccineus«** – ein Foto des **Bohnenrost-Pilzes** auf dem Blatt: Es nennt die
      Wirtspflanze im Dateinamen und bekam so die volle commonsScore-Punktzahl,
      einen Platz vor dem perfekten Pflanzenfoto (»… in Jardin des Plantes de
      Toulouse«). Gleiche Fehlerklasse wie die Schmetterlingsraupe in der Dill-
      Kategorie. Fix: **`looksDamage(file)`** (neben `looksIllustration`) verwirft
      Krankheits-/Schädlings-/Schadbilder hart – Rost/telia/uredini, Mehltau,
      blight/Blattfleck, Larven/Raupen, Blattläuse, Gallen (nur engl. `\bgalls?\b`
      + Komposita; »St. Gallen«-Fotos bleiben), Befall/infect, Pilzgattungen
      (Uromyces, Puccinia, Erysiphe, Peronospora …). **`botrytis` fehlt bewusst** –
      *Brassica oleracea* var. *botrytis* ist der Blumenkohl (Wortliste gegen alle
      2114 Arten geprüft, einziger Treffer). Greift in `pickCommons` **und** der
      wp-Route; Bild-Cache auf `pflanzenlernen.photos4`. Live-Zwilling: Feuerbohne →
      Jardin-des-Plantes-Foto, Blumenkohl → korrektes var.-botrytis-Foto, alle
      Referenzfälle (Dill/Kirschtomate/Zwiebel/Schalotte/Hainbuche/Pelargonium)
      unverändert. `tests/learn.mjs`: Rost-Fixture verliert gegen das Pflanzenfoto;
      looksDamage-Einzelprüfungen (Rost/Raupe/Mehltau raus; Blumenkohl, *Rosa
      gallica*, St.-Gallen-Foto bleiben).

- [x] **Herbarium 2.0 · Stufe 4 – Cross-Doc-Übergänge, Scroll-Dynamik, Bild-Lightbox,
      Typo** (Nutzerwunsch: »Dynamik, modernste CSS-Effekte, Lesbarkeit, Barriere-
      freiheit, Bilder anklickbar/vergrößerbar«). Alles **native Browser-Features,
      kein CDN** (Grundregel): (1) **Cross-Document View Transitions**
      (`@view-transition{navigation:auto}` in Lern-/Prüf-/Rechtliches-Seite) –
      Seitenwechsel blenden weich über statt hart zu laden. (2) **Scroll-getriebene
      Einblendungen** (`animation-timeline: view()` unter `@supports` + `@media
      screen and (prefers-reduced-motion: no-preference)`): Listenzeilen (`.sprow`
      im Lern-Tool, `.row`/`.pvrow` im Prüfwerkzeug) steigen beim Scrollen sanft
      ein – rein deklarativ, ohne JS. (3) **Bild-Lightbox** (`openLightbox`/
      `lbWire`, 1:1 in `learn.js` UND `app.js`): Quiz-Fotos und die Wikipedia-
      Vorschau der Info-Karte sind klick- **und** tastaturbedienbar (role=button,
      Enter/Leertaste), öffnen eine Großansicht im eigenen Namensraum `.lbscrim`
      (kollidiert nicht mit den `.scrim`-Panels); geladen wird per URL-Ableitung
      das **größere Commons-Derivat** (`lbBig`: »…/640px-…« → »…/1600px-…«, bei
      Fehlschlag Fallback aufs bekannte Bild – nur `<img>`, kein `fetch`, offline-
      rein); Esc läuft in der **Capture-Phase** (Modal dahinter schließt nicht mit),
      Fokus auf ×, Rückgabe an den Auslöser, `@starting-style`-Eintrittsübergang,
      ×-Knopf ≥44 px. (4) **Typo:** `text-wrap:balance` (Überschriften/Summaries)
      + `text-wrap:pretty` (Absätze), nur `@media screen` – **Leerbögen/Druck
      unberührt**; `prefers-reduced-motion` schaltet jede neue Bewegung ab.
      `tests/learn.mjs` prüft Foto-Verkabelung + Lightbox-Zyklus (öffnen/Esc/
      Fokus-Rückgabe, `lbBig`-Ableitung); `tests/smoke.mjs` prüft die Lightbox im
      Prüfwerkzeug (eigener Dialog, kein `.scrim`-Leck). Per Screenshot verifiziert;
      `animation-timeline: view()` auf den Zeilen per computedStyle bestätigt.

- [x] **Quiz-Juice: Feuerwerk 2.0, Haptik, einfahrende Antwort-Knöpfe** (Nutzerwunsch:
      »Buttons sollen stylisch rausfahren, Feuerwerk viel cooler, mehr Dopamin-
      Feedback wie Vibration, bessere Schatten«). Nur Lern-Tool, offline-rein:
      (1) **celebrate() neu**: Blättchen + Blüten (`c-petal`) + goldene Funken
      (`c-spark`, Glow) bersten in **zwei Phasen** (schneller Burst → Fallen mit
      Drall; Keyframe `conf-fly` mit `--dx/--dy/--fall/--rot/--dur/--s`), dazu ein
      **Licht-Ring** (`conf-ring`) am Auslöser; Stärke 2 = 64 Partikel + zweite
      Welle. Klassen `.conf-host`/`.conf` bleiben (Testkompatibilität), alles
      transform/opacity, `try/catch`, unter `prefers-reduced-motion` aus.
      (2) **Haptik** (`buzz(pattern)` via `navigator.vibrate`, in `celebrate`
      eingebaut): Treffer = kurzer Tick (12 ms), Sitzung/Duell gewonnen =
      Erfolgsmuster – Android vibriert, iOS/Desktop ignorieren still; läuft auch
      bei reduzierter Bewegung (Haptik ist keine Motion). (3) **Quiz-Optionen
      fahren gestaffelt ein** (`optIn` + nth-child-Delays 0,02–0,30 s, federnde
      Kurve), der **richtige Knopf poppt** (`optPop`), der **falsche schüttelt**
      (`optShake`); dazu tiefere, grün getönte Mehrschicht-Schatten auf Optionen
      und Bewertungs-Knöpfen (satterer Hover-Lift). `tests/learn.mjs` prüft:
      Vibrationsmuster bei Stärke 2 (sofort gesichert – der echte Treffer-buzz
      der App überschreibt sonst mit 12), ≥60 Partikel + Ring + drei Formen,
      Stagger-Delays + optPop auf dem richtigen Knopf. Screenshot verifiziert.

- [x] **Gamification: Lernserie + Tagesziel & Sammel-Herbarium** (Nutzerwunsch »mehr
      Suchtfaktor, mehr Dopamin – aber didaktisch«; per Auswahl bestätigt: A + C,
      bewusst OHNE XP-Ränge und Combo). Nur Lern-Tool, offline, `localStorage`.
      **(A) Lernserie + Tagesziel** (`streakState`/`streakBump` in `learn.js`,
      global über alle Profile – EIN Lernender, EINE Gewohnheit; Key
      `pflanzenlernen.streak` = `{d,n,g,s,b,gd}`): Jede bewertete Karte zählt
      (`grade()` ruft `streakBump`), bei Erreichen des **Tagesziels** (einstellbar
      10/20/30/50 unter Optionen · »Wie üben?«, `#dayGoal`, Standard 20) wird der
      Tag zum **Serientag** – Toast + Feuerwerk, Meilensteine 7/30/100 groß.
      Serie überlebt die Nacht (Ziel gestern erreicht), reißt nach einem Tag
      Pause. UI: Flammen-Zeile im Fortschritt (`#streakRow`: 🔥 N Tage-Serie ·
      Gold-Zielbalken · »n/Ziel heute«), Rekord im Tooltip. Didaktik: Spaced
      Repetition wirkt nur bei Regelmäßigkeit – belohnt wird genau die.
      **(C) Sammel-Herbarium** (`herbData`/`herbCheck`/`openHerbarium`): Je Thema
      des Profils eine Sammelkarte im Herbarium-Look (Klebestreifen, gepresste
      Pflanze als currentColor-SVG aus 6 Silhouetten, Fortschrittsbalken
      »sitzt/gesamt«). Sitzt **jede** Art eines Themas sicher (Box 4–5, gleiche
      Schwelle wie »sitzt«), gilt es als **gemeistert**: Karte wird grün mit
      »Gemeistert«-Schrägband, gefeiert wird **einmalig** (Feier-Liste
      `pflanzenlernen.herb.<profil>`; der Stand selbst wird live aus dem
      Leitner-Fortschritt berechnet). Prüfpunkte: `finishSession` und Öffnen des
      Modals (`#btnHerb` »🌿 Mein Herbarium« im Fortschritt; gleiches
      `.scrim`-Modal-System wie die Steckbriefe). Didaktik: motiviert, ALLE
      Themen zu lernen statt nur Lieblingsthemen. **Testabsicherung** in
      `tests/learn.mjs`: Serie startet bei Zielerreichen, überlebt »gestern
      erreicht«, reißt nach Lücke; UI-Zeile + Tagesziel-Feld; Harnisch setzt
      global `{g:5000}`, damit die vielen `grade()`-Aufrufe der übrigen Tests
      kein zufälliges Ziel-Feuerwerk mitten in fremden Assertions zünden;
      Herbarium: volles Thema → genau EINE Feier, Modal zeigt genau die
      gemeisterte Karte farbig mit Stempel. Screenshots verifiziert.

- [x] **Gamification, zweite Hälfte: XP + botanische Ränge & Sitzungs-Combo**
      (Bausteine B und D des Konzepts, vom Nutzer freigegeben). Nur Lern-Tool,
      offline, global über alle Profile (Key `pflanzenlernen.xp = {x,r}`).
      **XP didaktisch gestaffelt** (`XP_BASE`, `scoreHit(kind, ok, anteil, anchor)`):
      freies **Tippen 10** > **Auswahl 5** > **Karteikarte 3** (Selbsteinschätzung
      am wenigsten, weil am schwächsten belegt), »Unsicher« 1; Teilpunkte anteilig
      (Prüfungsmodus: `got/max`, Bilder-»hard« = halb). **Sechs Ränge**
      (`RANKS`): Keimling · Sämling · Steckling · Jungpflanze · Prachtexemplar (bis #143 »Stockmutter«) ·
      Meistergärtner/in (0/150/500/1200/2500/5000 P.); Aufstieg wird **einmalig**
      gefeiert (Toast + Feuerwerk, `o.r` merkt den zuletzt gefeierten Rang).
      Anzeige: Rang-Zeile unter der Lernserie (`#rankRow`: Rang kursiv · grüner
      Balken · »x P. · noch n bis …«). **Combo** (`comboHit`): Treffer in Folge
      **nur in bewerteten Modi** (bei der Karteikarte könnte man sich sonst durch
      »Gewusst« klicken), ab 3 Bonus 2/4/8 P., jede 5er-Stufe mit größerem
      Feuerwerk + kräftigerer Haptik + Toast; Chip in der Sitzungsleiste
      (`.scombo`, poppt), Abschluss-Screen nennt XP + beste Serie + Rang.
      **Kein Zeitdruck** (verleitet sonst zum Raten). `tests/learn.mjs` prüft
      Rangkette + Aufstieg, Combo (Fehler setzt zurück, ab 3 sichtbar), Bonus-
      Staffel und dass drei Quiz-Treffer ≥15 P. bringen. *Nebenbei gefunden:*
      `rankOf` griff auf `cur.name` zu, während `RANKS` das Feld `n` führt – der
      neue Test deckte es sofort auf.

- [x] **Herbarium 2.0 · Stufe 5 – OKLCH/Display-P3, Popover-Menüs, Container
      Queries** (alle Seiten, Marker »Stufe 5« am Ende jedes `<style>`; alles
      progressive enhancement hinter `@supports`/Feature-Abfragen, Druck unberührt).
      **(1) Farbe:** Nur wenn der Browser `oklch()` versteht **und** das Display
      einen weiten Farbraum meldet (`@media (color-gamut: p3)`), werden Grün/Gold/
      Krapp/Sepia in **OKLCH** neu gesetzt – gleiche Helligkeit, mehr Farbigkeit
      (Töne, die im sRGB-Dreieck gar nicht darstellbar sind), Hell **und** Dunkel
      je doppelt hinterlegt (`[data-theme]` + Media-Query). sRGB-Geräte sehen
      exakt das bisherige Bild. **(2) Popover + Anchor:** Das **Verwaltungs-Menü**
      des Prüfungswerkzeugs wird zum echten `popover="auto"` im **Top-Layer**, am
      Knopf verankert (`anchor-name`/`position-area` + `position-try-fallbacks`) –
      Klick daneben und Esc schließen von selbst. Aktiviert **nur**, wenn Popover
      UND Anchor-Positioning können; sonst bleibt die bisherige Inline-Leiste
      unverändert. Der `hidden`-Zustand bleibt in **beiden** Wegen die Wahrheit
      (Klick-Handler spiegelt **synchron**, weil das `toggle`-Event erst später
      feuert; ein `toggle`-Listener fängt zusätzlich Light-Dismiss/Esc ab).
      Neu im Lern-Tool: **Rang-Popover** (`#rankPop`, am Rang-Namen verankert)
      zeigt die ganze Laufbahn mit Punktzahlen, aktueller Rang hervorgehoben –
      tastaturbedienbar, ohne toten Knopf bei fehlender Unterstützung.
      **(3) Container Queries:** Herbarium-Raster und »Aktuelle Prüfung« reagieren
      auf **ihre eigene** Breite statt auf das Fenster (Sammelkarten im schmalen
      Modal kompakter, im breiten großzügiger). `tests/smoke.mjs` prüft den
      Popover-Modus inkl. Light-Dismiss und dass er nur bei Unterstützung greift;
      `tests/learn.mjs` prüft Rang-Popover (sechs Ränge, aktueller markiert) und
      den Container-Typ. Screenshots verifiziert.

- [x] **Herbarium lückenlos: bildlose Arten weichen aufs Quiz aus + »Es fehlen noch«**
      (Nutzerfrage »kann man im Herbarium auch Pflanzen freischalten, wenn man nur den
      Bildermodus nutzt?«). Antwort: **ja** – alle fünf Modi speisen über `grade()`
      denselben Leitner-Stand, und das Herbarium liest ausschließlich die Box (≥4),
      nicht den Modus. **Aber** es gab eine echte Lücke: Fand die Bildersuche kein
      brauchbares Foto, wurde die Art im Bilder-Modus **übersprungen**
      (`queue.splice`) – sie kam nie dran, blieb in Box 0, und das Thema ließ sich
      mit reinem Bilder-Lernen nie abschließen. Zwei Gegenmaßnahmen, beide umgesetzt:
      **(1) Ausweichen statt Überspringen:** Genau diese eine Karte wird als
      **Quizfrage** gestellt (`mode="quiz"` lokal; `nextCard` stellt über das neue
      `sess.baseMode` danach wieder auf Bilder um – dasselbe Muster wie die geführte
      Sitzung, nur ohne `formOf`), mit Hinweiszeile »Für diese Art gibt es kein
      brauchbares Foto – deshalb als Quizfrage« (`.ph-fallback`). Die frühere
      **Blockade** nach sechs Fehlversuchen entfällt (es geht ja nichts mehr
      verloren) und wird zum nicht-blockierenden Toast. **(2) »Es fehlen noch«:**
      `herbData` liefert je Thema zusätzlich die offenen Arten; die Sammelkarte
      listet sie (max. 6 + »+N weitere«) – **nur bei angefangenen Themen**
      (`fest>0`, ≤12 offen), sonst wäre es die ganze Liste. Arten, für die sicher
      kein Foto existiert (`photoless()` = Cache-Eintrag `null`), tragen die
      Markierung »ohne Foto« samt Tooltip. `tests/learn.mjs`: alter Skip-Test auf
      das neue Verhalten umgestellt (Quizfrage mit 4 Optionen + Hinweis statt
      Überspringen), neuer Test für die Fehl-Liste (Anzahl, »ohne Foto«-Markierung,
      keine Liste bei unbegonnenem Thema); `__rememberPhoto` für Tests exponiert
      (der Bild-Cache liegt in einer Modul-Variable, `localStorage` allein reicht
      nicht). Screenshot verifiziert.

- [x] **Der Weg zum »sitzt« wird im Tool erklärt** (Nutzersorge: »habe Angst, dass
      Leute abspringen – erste Erfolge sind zu spät sichtbar«). Bis dahin war die
      Leitner-Mechanik unsichtbar: Wer eine Sitzung beendete, sah »0 sitzt« und
      konnte nicht wissen, dass er trotzdem vorangekommen ist. Vier Einbauten,
      alle im Lern-Tool: **(1) Stufen-Anzeige nach jeder Antwort** (`stepHTML()`,
      gefüttert aus `lastStep`, das `grade()` setzt): fünf Punkte + »Stufe 2 von 5 ·
      noch 2× richtig bis »sitzt«« – eingehängt in die Rückmeldung von Quiz, Tippen
      und Bilder-Quiz; auf der **Karteikarte** steht die Stufe schon **vor** der
      Bewertung (danach geht es sofort weiter). `stepsLeft(box)` rechnet den Sprung
      **neu → Stufe 2** korrekt mit (nicht 4−Stufe: von neu sind es **drei** Treffer).
      **(2) Der Moment selbst wird gefeiert:** Erreicht eine Art Stufe 4, kommt
      Toast »»X« sitzt jetzt! 🌿« + großes Feuerwerk (`lastStep.neuFest`).
      **(3) Erklärzeile an der Fortschritts-Legende** (`.plegend-note`) – die
      bisherigen `title`-Tooltips sind am Handy unsichtbar; jetzt steht dort im
      Klartext, dass ab Stufe 4 »sitzt« gilt und **schon der erste Treffer zählt**
      (neu → am Lernen). **(4) Herbarium** (`.herb-how`, auf Zuruf ergänzt): Kasten
      über dem Raster erklärt, dass ein Thema gemeistert ist, wenn **jede** Art
      »sitzt«, dass drei richtige Antworten dorthin führen und warum der Balken über
      Tage wächst. Dazu **Intro** (»So wächst dein Fortschritt« inkl. der ehrlichen
      Erwartung: am ersten Tag ist »sitzt« nicht zu erwarten – Punkte, Serie und der
      Wechsel neu → am Lernen sind der Erfolg) und **zwei neue Hilfe-Absätze**
      (»Wie kommt eine Pflanze auf sitzt?« / »Warum das mehrere Tage dauert«).
      `tests/learn.mjs` sichert alles ab: `stepsLeft`-Kette (3/3/2/1/0/0),
      Stufen-Zeile nach einem Treffer (5 Punkte, 2 aktiv, »noch 2× richtig«),
      Stufe auf der Karteikarte vor der Bewertung, Erklärtexte an Legende und
      im Herbarium. Screenshots verifiziert.

- [x] **UI entschlackt: Grafik statt Fließtext, Strich-Icons statt Emojis**
      (Nutzerkritik: »UI wird immer textlastiger auf dem ersten Screen, mehr
      Akkordeons, grafische Lösungen, klare Symbole – **keine bunten Emojis, sieht
      unprofessionell aus**«). Die Erklärrunde davor hatte den Startbildschirm mit
      Absätzen zugestellt – hier die Gegenbewegung.
      **(1) Icon-Set statt Emojis:** `ICONS`/`ico(name)` in `learn.js` (13 Symbole:
      leaf · flame · sprout · info · globe · book · image · check · cards · keys ·
      list · sliders · trophy) und ein schlankes Paar in `app.js` (globe · book) –
      alle im bestehenden Stil (currentColor, 1.8er Strich, 24er Viewbox). Ersetzt
      🌿🌱🔥🎉⚙️🌐📖🖼✔🗂 in Knöpfen, Intro, Duell und Info-Karte **beider**
      Werkzeuge; in Toasts entfallen die Emojis ersatzlos.
      **(2) Erklärungen als Grafik:** Der neue **Stufen-Dialog** `openHowModal()`
      zeigt die fünf Stufen als **Leiter** (Punkte · Kurzlabel *neu/wackelig/kommt/
      sitzt/sicher* · Intervall) plus eine Icon-Legende (richtig → weiter, fast →
      hält, falsch → Stufe 1). Er ersetzt **drei** Textblöcke: den Erklärabsatz an
      der Fortschritts-Legende (jetzt nur noch ein ℹ-Knopf `#btnHow`), den
      Herbarium-Kasten (jetzt ein Satz + Verweis) und den Intro-Absatz (jetzt ein
      Satz + Verweis).
      **(3) Startansicht verdichtet:** »148 Karten heute dran · Übungsform passend
      zu deinem Lernstand« → Icon + **»148 heute dran«**; die drei Statuszeilen
      (Serie / Tagesziel / Rang / Herbarium) wurden zu **einer Chip-Reihe**
      (`.statusrow`) – Flamme mit Zähler, Tagesziel als **Fortschritts-Ring**
      (conic-gradient), Rang-Chip mit Mini-Balken, Herbarium-Knopf. Ergebnis:
      **1932 → 1776 px** Seitenhöhe auf dem Handy, spürbar weniger Fließtext.
      **(4) Layout-Bug behoben:** Die A11y-Regel (44-px-Ziele) setzte
      `display:flex` auf **alle** `<summary>` – beim KI-Hinweis wurden dadurch die
      Inline-Teile zu Flex-Items und der Satz zerfiel in Spalten. Fließtext-Summarys
      bekommen jetzt Padding statt Flex.
      `tests/learn.mjs` prüft: keine Emojis im sichtbaren Text (Startansicht +
      beide Modale, Script/Style ausgenommen), Status-Chips tragen `svg.ic`,
      ℹ öffnet die Stufen-Leiter, Herbarium verweist darauf. Screenshots verifiziert.

- [x] **Icon-Größen repariert (Folgefehler des Emoji-Austauschs).** Nutzer-Screenshot:
      In der Info-Karte füllte das Buch-Symbol den halben Dialog. Ursache: Die Klassen
      `.etym-ic`, `.duel-ic`, `.is-ic` stammten aus Emoji-Zeiten und steuerten die Größe
      über `font-size` – ein SVG ohne `width`/`height` dehnt sich dort auf die volle
      Breite. Behoben in `learn.html` **und** `template.html` (Info-Karte steckt in
      beiden Werkzeugen): feste Maße bzw. Innenabstand statt Schriftgröße. Zusätzlich
      eine **Schutzregel mit Null-Spezifität** `:where(svg.ic){width:16px;height:16px;
      flex:none}` – jede vorhandene Regel gewinnt weiterhin, aber ein Icon ohne eigene
      Maße kann nicht mehr wuchern. `tests/learn.mjs` misst jetzt **alle** `svg.ic` in
      Startansicht, Info-Karte und Intro und schlägt an, sobald eines über 40 px wächst.
      *Lehre:* Nach einem Symbol-Austausch jede betroffene Ansicht erneut öffnen – der
      Fehler lag in einem Dialog, den ich nach dem Umbau nicht noch einmal geprüft hatte.

- [x] **Info-Karte: Lernstand der Art + Bildergalerie in der Vollbild-Ansicht**
      (zwei Nutzerwünsche). **(1) Lernstand** (`learnStateHTML`, direkt unter dem
      Kopf): fünf Stufenpunkte + »Stufe 3 von 5 · noch 1× richtig bis »sitzt««
      bzw. »Noch nicht gelernt«, dazu die **Fälligkeit** (`faellig()`: heute /
      morgen / in N Tagen) und die Bilanz (»7 richtig · 1 daneben«). Bei Stufe 4–5
      grün hervorgehoben. Quelle ist derselbe Leitner-Stand (`pget`) wie Fortschritt
      und Herbarium – **nichts wird zusätzlich gespeichert**. Nur im Lern-Tool
      sinnvoll (das Prüfungswerkzeug führt keinen Lernstand) und deshalb auch nur
      dort eingebaut. **(2) Galerie** (`wikiGallery` + erweiterte Lightbox in
      **beiden** Werkzeugen): Nach dem opt-in »Online-Infos laden« holt ein zweiter
      **JSONP**-Aufruf (`generator=images`, kein `fetch` → `check_offline` bleibt
      grün) bis zu zwölf Bilder des Artikels, gefiltert über die vorhandenen Regeln
      (`usablePhoto`/`looksDamage` bzw. eine schlanke Variante im Prüfwerkzeug;
      botanische **Tafeln bleiben** – beim Nachschlagen sind sie hilfreich, anders
      als im Bilder-Quiz). Das Vorschaubild öffnet dann die **Vollbild-Galerie**:
      Pfeile ‹ ›, Zähler »2 / 5«, Tastatur ← →, Umlauf am Ende, Esc schließt; bei
      nur einem Bild bleibt alles wie bisher (keine Pfeile, kein Zähler). Schlägt
      der Galerie-Abruf fehl, bleibt es beim einen Vorschaubild.
      `tests/learn.mjs` prüft beides (Stufenanzeige für »neu« und »Stufe 2«,
      Galerie-Blättern per Klick/Taste inkl. Umlauf, Einzelbild ohne Pfeile) –
      mit **Data-URI-Fixtures**, weil erfundene Bild-URLs echte Netzfehler und
      damit Konsolenfehler im Test erzeugen würden.

- [x] **Lernstand ans Ende der Info-Karte + Galerie auch im Bilder-Quiz** (zwei
      Rückmeldungen). **(1) Reihenfolge:** `.lstate` steht jetzt **unten** in der
      Info-Karte (nach dem Wikipedia-Block) statt direkt unter dem Kopf – oben die
      Pflanze, unten der eigene Stand. **(2) Galerie im Bilder-Quiz:** Eine Pflanze
      zeigt sich selten auf einem Bild vollständig (Habitus · Blatt · Blüte ·
      Frucht) – deshalb lässt sich die Großansicht auch dort durchblättern.
      `pickCommons` behält die **ohnehin schon geprüften** Kandidaten der
      Commons-Suche (`p.gal`, max. 6, bester zuerst) – **kein zusätzlicher Abruf**,
      die Sortierung `(-score, Fundreihenfolge)` reproduziert exakt die bisherige
      Auswahl des Siegerbilds. Kam das Bild aus einem Wikipedia-**Artikel**
      (`src:"wp"`, keine Kandidatenliste), holt `photoGalLoader` dessen Bilder über
      `wikiGallery` **erst beim Öffnen** der Großansicht. Dafür kann die Lightbox
      jetzt **nachwachsen**: `lbSync()` legt Pfeile und Zähler erst an, wenn es
      wirklich mehrere Bilder gibt (auch nachträglich), `lbLoad(loader)` hängt eine
      später eintreffende Liste an (Token gegen zwischenzeitliches Schließen, Dedup
      über die URL); bei einem Bild bleibt alles wie bisher. Am Bild zeigt ein
      dezenter Zähler »3 Bilder« (`.ph-more`), dass es mehr zu sehen gibt.
      **Ohne Dateinamen:** die Galerie-Einträge tragen ein neutrales `label`
      (»Bild 2 der gesuchten Pflanze«) statt des Dateinamens – der stünde sonst im
      `alt`-Text und verriete die Lösung. Lightbox-Änderungen 1:1 auch in `app.js`
      (Info-Karte des Prüfungswerkzeugs), `wikiGallery` nutzt jetzt den
      austauschbaren `jsonp` (testbar ohne Netz). Offline-rein.
      `tests/learn.mjs` prüft: Lernstand als letztes Element nach dem
      Wikipedia-Block, `gal` sammelt die geprüften Kandidaten (bester zuerst),
      Zähler/Blättern im Quiz, kein Dateiname im `alt`, und die nachgeladene
      Artikel-Galerie (erst keine Pfeile, danach »1 / 3«).
      **Nachgereicht: Wischen** (`lbSwipe`, beide Werkzeuge) – ein Finger nach
      links = nächstes Bild, nach rechts = vorheriges. Bewusst **ohne**
      `touch-action:none`, damit der **Zwei-Finger-Zoom im Bild** erhalten bleibt
      (Blattadern!); Mehrfinger-Gesten werden erkannt und in Ruhe gelassen.
      Schwelle 40 px und »eher waagerecht als senkrecht« (Faktor 1,2), damit ein
      Antipper oder eine senkrechte Bewegung nicht blättert; `lbSwiped` verwirft
      den unmittelbar folgenden Klick, sonst schlösse die Großansicht nach jedem
      Wisch. Listener sind `passive` (kein `preventDefault`), also ohne Scroll-
      Bremse. Tests simulieren echte `TouchEvent`s: `tests/learn.mjs` (links/
      rechts/zu kurz, kein Schließen nach dem Wisch) und `tests/smoke.mjs`
      (gleiche Logik im Prüfungswerkzeug – Schutz gegen Auseinanderdriften der
      beiden Kopien).

- [x] **Galerie vorladen + hartnäckigere Bildsuche** (zwei Rückmeldungen).
      **(1) Vorladen** (`lbPreload`, beide Werkzeuge): Sobald die Vollbild-Ansicht
      offen ist, werden die übrigen Bilder der Galerie im Hintergrund geholt –
      Blättern und Wischen warten dann nicht mehr. Reihenfolge **von innen nach
      außen** (1 vor, 1 zurück, 2 vor …), geladen wird **dieselbe URL wie in der
      Anzeige** (`lbBig`), sonst nützt der Browser-Cache nichts; das gerade
      gezeigte Bild wird in `lbPre` eingetragen und nicht erneut angefragt. `lbPre`
      (URL → `Image`) verhindert Doppel-Abrufe, Deckel 80 Einträge. Bei
      **Datensparmodus oder 2G** (`navigator.connection.saveData`/`effectiveType`)
      nur die direkten Nachbarn – 12 Bilder à 1600 px sind unterwegs schnell
      einige Megabyte. Läuft auch nach dem **Nachladen** der Artikel-Galerie
      (`lbLoad`).
      **(2) Bilder-Quiz gibt nicht mehr so schnell auf** (Rückmeldung »oft werden
      keine Bilder geladen«). Ursache war vor allem der **dauerhaft gemerkte
      Fehlversuch**: `photoFor` speicherte `null` in `pflanzenlernen.photos4`, und
      ein einziger Aussetzer (schwache Verbindung, ein Suchweg lief ins Leere)
      machte die Art damit **für immer** bildlos – sie kam ab dann nur noch als
      Quizfrage. Jetzt gilt »kein Bild« nur für die **laufende Sitzung**
      (`photoTried`): gefundene Bilder bleiben dauerhaft gemerkt, erfolglose Arten
      bekommen bei **jedem Start einen frischen Versuch** (auch im Vorabholen,
      `prefetchPhoto`). Dazu **zwei stille Wiederholungen** mit wachsender Pause
      (0,9 s / 1,8 s, Anzeige »neuer Versuch 2 von 3«), bevor überhaupt »Keine
      Verbindung« erscheint – kurze Funklöcher heilen sich so von selbst. Lädt die
      **Bilddatei selbst** nicht, wird der Reihe nach auf die übrigen Ansichten
      derselben Art ausgewichen, statt sofort »Bild konnte nicht geladen werden«
      zu zeigen. Der Quiz-Ausweichtext sagt jetzt zu, dass **beim nächsten Start
      erneut gesucht** wird. `tests/learn.mjs` prüft: Vorladen (alle weiteren
      Bilder, Nachbar zuerst, nichts doppelt, Einzelbild = nichts), stille
      Wiederholung statt sofortiger Fehlermeldung, gemerktes »kein Bild« sperrt
      die Art nicht dauerhaft, und pro Sitzung wird trotzdem nur einmal gesucht.

- [x] **Lernduell: die Herausforderung ist wieder genau dieselbe Aufgabe** (v3 des
      `#c=`-Links). Rückmeldung: Beim Öffnen des eigenen WhatsApp-Links kam im
      Bilder-Quiz statt »Bild → **voller Name** (botanisch + deutsch)« plötzlich nur
      der botanische Name. Ursache war die Kodierung: In **v2** steckte die Richtung
      als **globaler Index in `CH_DIRS`** in nur **zwei Bit** – die später ergänzte
      fünfte Richtung `img2both` passte dort nicht hinein und wurde beim Teilen
      **absichtlich auf `img2bot` heruntergestuft** (Kommentar stand so im Code).
      Ebenso fehlte die **Antwortart** des Bilder-Quiz (Auswahl/Tippen/wie in der
      Prüfung) – der Empfänger bekam die seines eigenen Geräts.
      **v3:** Die Richtung wird **je Modus** gezählt (`CH_DIR3`: Text 2, Bild 3
      Möglichkeiten) – damit reichen die zwei freien Bit im Kopfbyte auch für
      `img2both`; bei Bild-Lektionen folgt **ein Byte** mit der Antwortart
      (`CH_PHA`). `chDecode` liest **v3 und v2** (alte geteilte Links bleiben gültig,
      dort weiterhin global über `CH_DIRS`) sowie die alten v1-JSON-Links. Beim
      Öffnen wird die **Antwortart vor der Richtung** übernommen – sonst filtert
      `dirsFor()` `img2both` weg (nur bei »Auswahl« verfügbar) und man landete wieder
      bei »nur botanisch«. Das Banner nennt jetzt zusätzlich die
      **Aufgabenstellung** (»Bilder-Quiz (Bild → voller Name) · …«).
      **Reihenfolge von `CH_PROFILES`, `CH_MODES`, `CH_DIRS` und jetzt auch
      `DIRS_TEXT`, `DIRS_PHOTO`, `CH_PHA` nicht mehr ändern.**
      `tests/learn.mjs` prüft Hin-/Rückweg für `img2both`, für `exam` und für die
      Textmodi, einen **von Hand gebauten v2-Link** (muss weiterhin richtig gelesen
      werden) und das Öffnen eines »voller Name«-Links (Richtung + Antwortart +
      Dropdown + Banner-Text).

- [x] **Jede Lektion ist direkt teilbar – auch die geführte und der Bilder-Quiz**
      (Rückmeldung: »nach dem Abschluss … muss man erst noch mal das Quiz machen,
      das geht aber nicht als Bilderrätsel«). Zwei Ursachen. **(1) Geführte Lektion
      ohne Teilen:** Der Abschluss-Screen zeigte den Teilen-Block nur bei reinen
      Modi (`!auto && scoreable()`), weil der Link nur reine Modi kannte; als Ersatz
      gab es den Umweg-Knopf »Diese Lektion als Duell-Quiz«. Jetzt kennt das
      Link-Format den Modus **`guided`** (freier vierter Wert in `CH_MODES`): die
      **Übungsform je Karte** fährt mit (`CH_FORMS`, **2 Bit pro Karte**, 4 Karten je
      Byte – 20 Karten = 5 Byte) plus ein Byte mit **Antwortart und Bild-Richtung**
      (die Lektion hat ja Bild- **und** Textkarten). `startChallenge` baut daraus
      `formOf` und spielt exakt diese Formen – nicht die, die der Leitner-Stand des
      Empfängers vorgäbe. Gezählt wird über die **bewerteten** Karten
      (`sess.scored`; Karteikarten geben keine Quote) – das gilt jetzt auch für den
      Duell-Vergleich (`accEff`). Der Umweg-Knopf ist entfallen.
      **(2) Bilder-Lektion galt am Ende als Quiz:** Weicht eine Karte mangels Foto
      aufs Quiz aus, setzt `renderPhoto` `mode="quiz"`; `nextCard` nahm das für die
      Folgekarte zurück – bei der **letzten** Karte lief es aber direkt in
      `finishSession`, sodass Abrechnung und Link »Quiz« sagten. `nextCard` stellt
      `sess.baseMode` jetzt **vor** dem Abschluss wieder her. Banner/Nachricht nennen
      die geführte Lektion als solche (»Geführte Lektion (gemischte Übungsformen)«).
      `tests/learn.mjs` prüft: Teilen-Block direkt nach der geführten Lektion (ohne
      Umweg-Knopf), Link kodiert `m:"guided"` + eine Form je Karte, Annehmen spielt
      Quiz · Karteikarte · Tippen in genau dieser Reihenfolge, und eine Bilder-Lektion
      mit ausgewichener letzter Karte wird als `photo` geteilt.

- [x] **Die geführte Lektion sagt ihren Formwechsel an** (Rückmeldung: »teilweise
      wurde ins Bilder-Quiz komischerweise ein normales Quiz gemischt«). Es war kein
      Fehler: `startGuided` wählt die Übungsform **je Karte nach Leitner-Stufe**
      (`guidedForm`: Box 0–1 → Bild, 2 → Quiz, 3 → Karteikarte, 4–5 → Tippen), und
      `buildQueue` sortiert neu-zuerst – die schon einmal gekonnten Arten landen
      deshalb als Quizfragen am Stück hinten. Ohne Hinweis liest sich das wie Zufall.
      Jetzt steht über der Aufgabe eine ruhige Pille (`.gnote`, `guidedNoteHTML`):
      **»Neu · am Bild erkennen«**, **»Stufe 2 von 5 · jetzt ohne Bild«**,
      **»Stufe 3 von 5 · selbst abrufen«**, **»Stufe 4 von 5 · prüfungsnah tippen«**
      – mit `title`, der den ganzen Weg erklärt. Die Stufe stammt aus `sess.boxOf`
      (beim Start eingefroren, sonst wanderte sie während der Sitzung mit); bei einer
      **angenommenen Herausforderung** fehlt der fremde Lernstand, dort nennt die
      Pille nur die Übungsform. Nur in der geführten Lektion, in den reinen Modi
      wechselt ja nichts. `tests/learn.mjs` prüft Stufe + Formtext.

- [x] **Themen-Zuordnung nachgeschärft** (Rückmeldung: »eine Birne bei Blüten- und
      Ziersträuchern?«). Sie war falsch – und ein systematischer Durchgang über alle
      2114 Arten (Auswurf je Thema + Gattung, botanisch durchgesehen) förderte weitere
      Fälle zutage. Korrigiert:
      **(1) Gehölze:** `Pyrus` in `G_SMALL` (Zier-/Wildbirnen sind Kleinbäume; im
      Obstbau bleibt Kernobst, weil `FRUIT_THEME` vorher greift). `Wisteria`
      (Blauregen) und `Jasminum nudiflorum` sind **Schlinger** → Kletterpflanzen
      (*J. officinale* stand dort schon). `Cornus florida`/`kousa`/`mas` sind
      Kleinbäume/Großsträucher – *C. alba*/*sanguinea*/*sericea* bleiben Ziersträucher,
      *C. mas* im Obstbau bleibt Wildobst.
      **(2) Roh-Kategorien, die keine Wuchsform sind,** rutschten bisher als eigenes
      »Thema« durch: **»Blühpflanzen«** (3 Arten: Sommerflieder + zwei Wildrosen) und
      **»Wirtspflanzen«** (4 Feuerbrand-Wirte) laufen jetzt über `VAGUE_KAT` →
      `woodyTheme` (Rosa→Rosen, Buddleja→Ziersträucher, Weißdorn→Kleinbaum,
      Eibe→Nadelbaum); **»Topf- und Grünpflanzen«** gilt über `ZIMMER_KAT` als
      Zimmerpflanze.
      **(3) Beikräuter unter »Stauden«:** Vogelmiere, Löwenzahn, Brennnessel,
      Acker-Kratzdistel, Breitwegerich, Greiskraut, Sauerampfer, Riesen-Bärenklau und
      Weißklee standen bei den **Beet- & Prachtstauden**. Neu `ST_WEED` (art-genau) +
      `ST_WEED_G` (nur `Urtica`/`Taraxacum`, in allen Listen ausnahmslos Beikräuter) –
      art-genau, damit *Senecio cineraria* (Silberblatt) und *Rumex sanguineus*
      Beetstauden bleiben und **Weißklee in der Gründüngungsliste** Gründüngung bleibt.
      Dazu *Ranunculus repens* (unter »Zwiebel- und Knollenpflanzen« geführt) und
      *Lathyrus vernus* (bisher aufs Roh-Thema »Stauden« gemappt → Schatten- &
      Gehölzrandstauden).
      **(4) Vorbestehender Fehler mitgefunden:** *Euphorbia pulcherrima*
      (Weihnachtsstern) lag bei den **Sukkulenten** – die Gattungsregel stimmt für
      *E. milii*/*trigona*, für den Weihnachtsstern nicht. Neue Art-Ausnahme `ZI_SPEC`
      → Blühende Zimmerpflanzen; `zimmerTheme(g, ep)` bekommt dafür das Epitheton.
      Danach gibt es **keine Kleinstthemen aus Roh-Kategorien** mehr; »Ohne Thema«
      bleiben bewusst nur die zwei Nicht-Gefäßpflanzen (Flechte, Torfmoos).
      *Hinweis für später:* `SPEC_THEME` steht **vor** den Staudenkonstanten – dort
      Themen als Text schreiben, sonst greift die temporale Totzone.
      `tests/learn.mjs` prüft 21 zusätzliche Referenz-Zuordnungen (Birne im
      Baumschul- **und** Obstbau-Kontext, Blauregen, Winterjasmin, Kornelkirsche in
      beiden Kontexten, Wildrose/Sommerflieder aus »Blühpflanzen«, Wirtspflanze,
      Topfpflanze, Weihnachtsstern vs. Christusdorn, fünf Beikraut-/Gegenprobenfälle).

- [x] **Bilder-Quiz bleibt Bilder-Quiz – Geduld statt Ersatzmodus** (Rückmeldung:
      »sobald die Verbindung schlecht ist, fällt das Bilderrätsel auf einen
      Ersatzmodus zurück … das fühlt sich an, als wäre das Tool kaputt«). Drei
      Ursachen/Änderungen:
      **(1) Schwache Leitung galt als »kein Bild«:** `wikiPhoto` setzte `answered`
      schon beim ersten beantworteten Suchweg – lief auch nur ein weiterer in eine
      Zeitüberschreitung (`jsonpGet`, 7 s), kam ohne Treffer ein `null` zurück und
      die Art galt als **bildlos** → Quizfrage. Jetzt zählt `fehler`: »kein Bild«
      gilt nur, wenn **alle** Suchwege sauber durchgelaufen sind; sonst wird es als
      **Verbindungsproblem** gemeldet und weiter versucht.
      **(2) Kein Moduswechsel mehr.** Findet sich für eine Art gerade kein Foto,
      kommt sie über `deferPhotoCard()` **ans Ende der Runde** und es geht mit der
      nächsten Art weiter (später ist sie wieder dran) – der Zähler `sess.photoDefer`
      verhindert Endlosschleifen (max. eine Runde). Kommt gar nichts durch, zeigt der
      Bildschirm **»Warte auf die Bilder …«** mit drei ruhigen Punkten (`.ph-dots`)
      und versucht es **von selbst** alle `phWaitMs` (6 s) erneut – sobald das Netz
      zurück ist, läuft die Lektion ohne Zutun weiter. Knöpfe: »Jetzt nochmal
      versuchen« und »Andere Art zeigen«.
      **(3) Umschalten nur auf ausdrücklichen Wunsch.** Erst wenn eine **ganze Runde**
      ohne ein einziges Bild vergangen ist, fragt das Werkzeug – und wechselt nur per
      Knopf »Ohne Bilder weiterlernen« (`sess.photoGiveUp`, gilt dann für den Rest der
      Sitzung). Zusätzlich holt `prefetchPhoto` jetzt die **nächsten zwei** Karten
      vorab statt einer. Test-Haken `__setPhotoWait(ms)` für den Warte-Takt.
      `tests/learn.mjs` prüft: Warte-Ansage + Punkte statt Umschalten, **Selbstheilung**
      (Netz zurück → Bilder-Quiz läuft ohne Zutun weiter), Verschieben statt
      Moduswechsel, und dass der Wechsel erst nach einer Runde **und nur per Knopf**
      passiert.

- [x] **Datenherkunft gekennzeichnet: Namen amtlich, Lernhilfen erzeugt** (Rückfrage aus dem
      RP: »Sind die Pflanzennamen nur aus den Listen oder mit KI gemischt? Da steht ja
      KI-unterstützt.«). Der alte Hinweis nannte nur die KI (»Inhalte teils KI-erzeugt«), nicht
      die Quelle – zugeklappt las er sich, als seien auch die Namen erzeugt. **Verifiziert statt
      behauptet:** Neubau aller 14 Seeds aus `data/` ergab genau eine nicht erfasste Abweichung –
      die Kategorie der Beikräuter heißt in vier Excel-Listen »Wildkräuter« / »Bei-, Wild- oder
      Unkräuter« / »Unkräuter, Wildkräuter«, ausgeliefert wurde einheitlich »Wild- & Beikräuter«
      (59 Arten; ein Neubau hätte das stillschweigend zurückgedreht). Jetzt im Konverter
      (`KAT_ALIAS`/`katName` in `tools/xlsx_to_seed.mjs`, nur die Bezeichnung, Zugehörigkeit
      unverändert) → **Neubau = Ausgeliefertes, byte-genau**; neuer Schritt
      (`rebuild_seeds.sh && git diff --exit-code seeds/`) in `build.yml` **und** in beiden
      Deploy-Jobs von `deploy.yml` (vor Build/Upload) hält das dauerhaft wahr: Hand-Edits im Seed
      oder eine unkonvertierte neue Excel lassen die CI scheitern und **blockieren die
      Veröffentlichung**. **Kennzeichnung dort, wo Namen
      gelesen werden:** (1) `.learnnote` (Lern-Tool) – Zusammenfassung »Datenherkunft:
      Pflanzennamen unverändert aus den amtlichen Prüfungslisten · Lernhilfen teils KI-erzeugt«,
      Volltext als zwei Zeilen mit Icon (✓ Quelle / Regler erzeugt), **drei offengelegte
      Eingriffe** (Chimonanthus-Familie, Wuchsform für 10 Listen, Beikräuter-Bezeichnung), Link
      auf `rechtliches.html#datenquellen`. (2) Nachschlage-Liste: Quellzeile `.listsrc` mit Profil
      (`profilLabel()`, aus `syncProfileChip` herausgezogen). (3) Info-Karte: `.mh-src` »Name aus
      der amtlichen Prüfungsliste« (nur Lern-Tool – im Prüfungswerkzeug ist die Liste editierbar).
      (4) Druckliste: Quelle in der Fußzeile (Ausdrucke wandern weiter). (5) Prüfungswerkzeug-
      Hilfe: Abschnitt »Datenherkunft« (Namensherkunft = erzeugt, Wikipedia = Wikipedia, Bogen/
      Musterlösung/Noten frei davon). (6) `recht.html`: neuer Abschnitt **»Datenquellen &
      Inhalte«** (`#datenquellen`) mit Feldliste, Formanpassungen, den drei Eingriffen samt
      Skriptnamen, Lernhilfen und Verbindlichkeit. **Wortwahl:** Die Bilder sind *echte* Commons-
      Bilder (Fotos, als Notnagel selten historische Pflanzentafeln), nicht KI-erzeugt; automatisch
      ist nur die Auswahl – nie »Bilder KI-erzeugt« und nicht pauschal »Fotos« schreiben.
      `docs/technik-kurzbeschreibung.md` Abschnitt 6/7 entsprechend. **Nebenbei:** `photoCredit`
      rief `jsonpGet` direkt statt des austauschbaren `jsonp` – die Bilder-Quiz-Tests fragten
      deshalb live bei Commons an und fielen bei dessen Ratenbegrenzung (HTTP 429) um; jetzt über
      `jsonp`, und `tests/learn.mjs` setzt `__setJsonp(window.__offlineJsonp)` als Standard (auch
      statt der Rücksetzungen auf `null`) → **der Lern-Test macht keine einzige Anfrage ins Netz**.
      **Beim Verifizieren gefunden – Anzeige-Bug:** `DE_ABBR` hatte feste Adjektiv-Endungen
      (`gew:"Gewöhnliche"`), das Lern-Tool zeigte so »Gewöhnliche Trompetenbaum«, »Gewöhnliche
      Buchsbaum/Feldsalat/Meerrettich/Ysop«, »Amerikanische Blumen-Hartriegel« – Formen, die in
      keiner Liste stehen und falsch sind; zudem wurde die angezeigte Vollform beim Tippen NICHT
      anerkannt (deForms kannte nur die Listenform). Jetzt `DE_ADJ_ABBR` (Stämme) + `deGenus()`
      (Geschlecht nach letztem Wortteil: -chen/-kraut… = n, -e/-nessel… = f, sonst m) +
      `ADJ_END`; `deForms` nimmt `expandAbbr(v)` zusätzlich zur Listenform auf. Offengelegt als
      Anzeige-Anpassung (Abkürzungen ausgeschrieben, 30 Einträge; Familien-Tippfehler berichtigt,
      17 Einträge inkl. »Caesalpinaceae« → Fabaceae bei *Gleditsia*; dt. Familienname ergänzt –
      Datenbestand unverändert, Prüfungswerkzeug zeigt ohne diese Anpassungen).
      Tests: Zusammenfassung zu + nennt Quelle und KI, Volltext »unverändert«/Eingriffe/Link,
      Listen-Quellzeile mit Profil, Info-Karten-Quelle, Druck-Fußzeile; Adjektiv-Endung je
      Geschlecht und **über alle 2114 Arten: angezeigter Name (`deMain`) wird beim Tippen
      anerkannt**; `tests/smoke.mjs` prüft den Hilfe-Abschnitt.

- [x] **Bilder-Quiz vereinfacht + »Tippen« heißt »Selbst eingeben«** (Rückmeldung: »zu viele
      verwirrende Optionen« und »Tippen könnte auch Glücksspiel-Tippen heißen – gemeint ist:
      man gibt den Namen selbst per Tastatur ein«). **(1) Eine Aufgabe im Bilder-Quiz:** Gefragt
      ist immer **Bild → voller Name (botanisch + deutsch)**; das Abfrage-Feld ist dort
      ausgeblendet (`dirsFor("photo")` liefert nur noch `["img2both"]`, `syncDirUI` blendet
      bei <2 Richtungen aus, Standard `dirPhoto="img2both"`). **Antwort** bietet genau zwei Wege:
      **Auswahl (4 Namen)** oder **Selbst eingeben (wie in der Prüfung)** – `PH_ANSWER` ohne
      `type`. Das frühere Ein-Feld-»Namen tippen« ist damit aus der Oberfläche verschwunden
      (sein Nutzen steckt in »wie in der Prüfung« mit abwählbaren Feldern). **Angeboten ≠
      spielbar:** `playableDirs()` kennt weiterhin alle drei Bild-Richtungen und `PH_ANSWER_LEGACY`
      das `type` – **ältere Duell-Links** stellen exakt ihre Aufgabe (Banner nennt sie, z. B.
      »Bild → botanischer Name · Namen eingeben«, das Auswahlfeld zeigt die alte Antwortart
      solange sichtbar). `applyChallengePrefs(ch)` setzt Richtung/Antwortart beim Öffnen **und**
      beim Annehmen (übernimmt nebenbei erstmals `ch.rp`, die Bild-Richtung geführter
      Lektionen, die bisher kodiert, aber nie angewendet wurde); `endChallengeOverride()`
      stellt beim Start einer **eigenen** Sitzung oder bei manueller Umstellung die
      gespeicherten Einstellungen wieder her (`loadPrefs()`, aus dem Boot herausgezogen –
      migriert gespeichertes `type` → `exam`, alte Bild-Richtungen → `img2both`). Die
      Teilen-/Revanche-Links werden erst auf dem Abschluss-Screen gebaut und tragen deshalb
      noch die gespielte Aufgabe. **(2) Umbenennung** überall sichtbar: Modus-Tab, Antwort-
      Option, Hilfe, Intro (dort auch das letzte Emoji ⌨️ durch `ico("keys")` ersetzt),
      geführte Pille (»prüfungsnah eingeben«), Duell-Modusname, Rang-Tooltip, Rechtliches,
      Manifest, Prüfwerkzeug-Link, Technik-Doku; die internen IDs (`type`, `CH_MODES`,
      `CH_PHA`, `DIRS_PHOTO`) bleiben – **Reihenfolge weiterhin nicht ändern**.
      `tests/learn.mjs`: genau zwei Antwortarten (keine »tippen«-Beschriftung), einzige
      Richtung + Feld ausgeblendet, Tab heißt »Selbst eingeben«, Text-Modi behalten die
      Richtungswahl; **zwei ältere Links** (`type`+`img2bot` → ein Eingabefeld;
      `mc`+`img2de` → deutsche Optionen) spielen ihre Aufgabe, danach gelten wieder die
      eigenen Einstellungen (`mc,exam` · `img2both`).

- [x] **Bilder-Quiz: Sorten-Regel, keine Zeichnungen/Tafeln/Herbarbelege mehr, Eingabe ohne
      Anführungszeichen-Zwang** (drei kritische Rückmeldungen: »Weigela x „Bristol Ruby“ gab
      Abzug«, Screenshot einer Buchtafel von 1841 im Bilder-Quiz, »Blutpflaume die weiß blüht,
      gelber Hartriegel hat rotes Holz«). Vier Ursachen, vier Änderungen:
      **(1) Anführungszeichen vereinheitlicht** – die Excel-Listen schreiben Sortennamen mal in
      `Backticks`, mal in ´Akzenten´, ‘typografisch’ oder "doppelt" (»Prunus cerasifera
      `Nigra´«). Der Konverter (`quotes()` in `tools/xlsx_to_seed.mjs`, angewandt auf Art,
      Sorte, deutschen Namen, Synonyme) setzt überall gerade Apostrophe `'Nigra'` (ICNCP);
      Seeds-Neubau = **23 Zeilen, ausschließlich Anführungszeichen** (zeilenweise verifiziert).
      Als **Schreibweise-Anpassung offengelegt** (`.learnnote`, Prüfwerkzeug-Hilfe
      »Datenherkunft«, `recht.html#datenquellen`, Technik-Doku) – kein neuer »Eingriff«.
      **(2) Eingabe:** `clean()` in `learn.js` streicht jetzt **alle** Anführungszeichen-
      Varianten (`' \` ´ ‘ ’ „ “ ” "`), Klammern und das **Hybrid-Zeichen** (× bzw. ein
      freistehendes x) – »Weigela x „Bristol Ruby“« = `Weigela 'Bristol Ruby'`, »Petunia
      atkinsiana« = »Petunia × atkinsiana«, »x Cupressocyparis« = `×Cupressocyparis`. Gilt für
      Selbst eingeben, »wie in der Prüfung« (`fieldOk`) und die Fast-Stufe.
      **(3) Sorten-Regel in der Bildsuche:** Anführungszeichen-Sorten wurden bisher **gar nicht
      als Sorten erkannt** (`isCultivarName` kannte nur var./ssp./Gruppen) – die Kette begann
      mit dem Art-Artikel der Wikipedia und zeigte für 'Nigra' die weiß blühende Kirschpflaume,
      für 'Flaviramea' den rotholzigen *Cornus sericea*. Neu: `cultivarName()`/`stripCultivar()`
      (neben `binomEpithet`, das für »Weigela 'Bristol Ruby'« sonst »'Bristol« als Epitheton
      nahm → `searchName` jetzt »Weigela«), `cultivarKind()` = `infra | cv | placeholder |
      ""` ('Sorte', »Hybriden«, »Grp.« sind Platzhalter – dafür IST das Artbild richtig, sie
      gehen direkt in den Art-Zweig, spart 3–4 Abrufe je Karte). **Beschreibende Sortennamen**
      (`CV_DESC_RE`, Farbe/Wuchs/Blatt: nigra, purpurea, glauca, variegata, nana, fastigiata,
      contorta, pendula, repanda, crispa, Smaragd, Sunburst …) bekommen **nie** das Artbild
      (`artLevelOk` → false); Phantasie-/Züchternamen ('Bristol Ruby', 'Koster', 'Hancock')
      dürfen wie bisher aufs Artbild zurückfallen, wenn keine Geschwister in der Liste stehen.
      Gegen **alle 61 Sortennamen** der 14 Listen durchgesehen: **38 beschreibend, 23
      Phantasie/Platzhalter** (Testguard). Sechs Quellzeilen haben ein **vergessenes**
      Anführungszeichen (»abies 'Nidiformis«, »fortunei Emerald Gold'«) – `cultivarName()`
      nimmt dann den Rest hinter dem Zeichen bzw. die großgeschriebenen Wörter davor. `photoSteps` sucht für Sorten zuerst die
      Commons-Kategorie `Genus species 'Name'`, dann innerhalb der Art-Kategorie, Phrase,
      deutscher Name, Volltext; `fileMentionsOther` kennt den eigenen Sortennamen. Dazu
      **`tmp`-Treffer:** bricht ein *feinerer* Suchweg ab (Zeitüberschreitung, HTTP 429 –
      genau so entstand das falsche Blutpflaumen-Bild) und ein gröberer trifft, gilt der
      Treffer nur für die Sitzung (`photoTmp`), wandert **nicht** in den Speicher und wird
      beim nächsten Start fein nachgesucht. Bild-Cache auf `pflanzenlernen.photos5`.
      **(4) Zeichnungen, Tafeln, Herbarbelege, Buchscans raus – über Commons-Metadaten:**
      Der Dateiname verrät sie oft nicht (»Bulletin de la Société … de Moscou (1841)
      (20228837329).jpg«). `commonsQuery` fragt `iiprop=extmetadata` (Categories, Artist,
      Credit, LicenseShortName) **in derselben Antwort** mit ab; `looksArtwork(meta)` prüft
      Kategorien (`ART_CAT_RE`: illustration, drawing, engraving, lithograph, botanical art,
      plates, Tafeln, herbari…, exsiccat, scans, »Files from the Biodiversity Heritage
      Library«, »Internet Archive Book Images«, Flora Batava/Danica, Botanical Magazine,
      Medizinal-Pflanzen, prints, PD-Art, maps, labels, logos …) und Urheber/Quelle
      (`ART_BY_RE`). Für das **Artikelbild der Wikipedia** holt `fileMeta()` die Metadaten
      **einmal vor dem Anzeigen** (Commons-Abruf); der bisherige **Notnagel »Zeichnung, wenn
      sonst nichts«** entfällt – lieber kein Bild als eine Tafel mit aufgedrucktem Namen.
      Treffer tragen seither `artist`/`license` → `photoRevealCredit` braucht **keinen zweiten
      Abruf** mehr (Fallback `photoCredit` nur für eingehängte Quellen/alte Einträge).
      `looksIllustration` (Dateiname) präzisiert: »botanical« nur mit illustration/art/plate/
      drawing/print/magazine (»Botanical Garden«-Fotos wurden bisher fälschlich verworfen),
      `\bplates?\b`, `\bkoeh\b`, `\bsturm\b`, `\bthome\b`. Die **Quiz-Galerie** aus
      Artikelbildern (`photoGalLoader` → `wikiGallery(title, noArt=true)`) filtert ebenso;
      die **Info-Karte behält Tafeln** (beim Nachschlagen hilfreich). Hilfe-Text »Bilder«
      erklärt beides (nur Fotos; beschreibende Sorten nie als Artbild); der Wartebildschirm
      sagt, dass Zeichnungen bewusst fehlen. Außerdem einen seit #137 veralteten Hilfe-Satz
      (Bild → botanischer/deutscher Name) auf »Bild → voller Name« korrigiert.
      **Ehrlich:** Für beschreibende Sorten ohne Sortenbild auf Commons und für Arten, zu
      denen es nur Zeichnungen gibt, bleibt die Karte jetzt **ohne Bild** (wird in der
      Sitzung ans Ende geschoben, beim nächsten Start neu gesucht) – das ist die Gegenseite
      von »kein falsches Bild«. Live-Verifikation gegen die echten APIs stand bei der
      Umsetzung nicht zur Verfügung (Wikimedia lieferte der Build-IP nur noch HTTP 429);
      die Metadaten-Feldnamen entsprechen der dokumentierten `extmetadata`-API, die Kette ist
      offline über `__setJsonp`-Fixtures abgesichert.
      **Nicht geändert – braucht eine Entscheidung:** Das Paar »Salvia abrotanoides ·
      Bauernjasmin« (Screenshot) ist ein **Fehler in der amtlichen GaLaBau-Gärtner-Liste**
      (Zeile 209: Familie Hydrangeaceae, deutscher Name Bauernjasmin/Pfeifenstrauch =
      *Philadelphus coronarius*; *Salvia abrotanoides* ist in Zeile 208 bereits als Synonym
      von *Perovskia abrotanoides* geführt). Wegen der veröffentlichten Zusage »Namen
      unverändert« nicht still korrigiert; Weg wäre `CORRECTIONS` in `fix_source_gaps.py`
      (füllt derzeit nur **leere** Felder) + Offenlegung als vierter Eingriff + Meldung ans RP.
      `tests/learn.mjs`: Sorten-Erkennung (Kind/Name/Epitheton, Klammerform, »Frieder's
      Evergreen«), 'Nigra' bekommt ohne Sortenbild **kein** Artbild (null, kein Fehler),
      Sorten-Kategorie liefert Bild + Urheber/Lizenz, Phantasiename fällt auf Gattung zurück,
      abgebrochener feiner Weg → `tmp` (nicht im Speicher, kein Zweitabruf), Platzhalter
      'Sorte' direkt zur Art, 61/38-Guard (inkl. vergessener Anführungszeichen); `looksArtwork` (Internet Archive, Herbarbeleg,
      Illustration vs. Foto/ohne Metadaten), `pickCommons` ohne Tafeln + Galerie ohne Tafeln,
      Artikelbild laut Metadaten Tafel → Kette läuft weiter (genau eine Metadaten-Abfrage),
      `wikiGallery(noArt)` vs. Info-Karte, Bildnachweis ohne Abruf (UI), Eingabe mit
      „…“/×/x (`checkTyped`/`fieldOk`/`judgeTyped`/`clean`), Offenlegung im Hinweis;
      `tests/smoke.mjs`: Hilfe nennt die Anführungszeichen.

- [x] **Platzhalter »'Sorte'« verständlich gemacht + Duell-Wortlaut** (Rückfrage mit
      Screenshot »Salvia nemorosa 'Sorte' – ist das nicht Blödsinn?«). Befund: Es steht
      wörtlich so in der amtlichen GaLaBau-Gärtner-Liste (Z. 253, ZP) – 25 Einträge in den
      beiden GaLaBau-Listen, die Fachwerker-Liste schreibt »Weigela Cultivars · Weigelie in
      Sorten«. Gemeint ist **die Art in irgendeiner Gartensorte**: In der Prüfung steht eine
      beliebige Sorte vor dem Prüfling, bewertet wird die Art, Sortennamen werden nicht
      abgefragt. **Einzelne Sorten als eigene Zeilen einzufügen wäre falsch** (Willkür, bricht
      »Namen unverändert«, Quiz am Foto unentscheidbar) – stattdessen:
      **(1) Anzeige** (nur Lern-Tool): `artShown(a)` zeigt `'Sorte'` als **»in Sorten«**
      (»Salvia nemorosa in Sorten«, »Malus in Sorten«); `botName` nutzt es, dazu Rückseite
      (`answerMeta`), Prüfungsfeld-Lösung (`fieldSolution`), Liste, Druckliste, Info-Karte,
      Herbarium-Fehlliste und Toast. Das **Prüfungswerkzeug zeigt weiter die Listenform**
      (Musterlösung = amtlich). Offengelegt als Anzeige-Anpassung (`.learnnote`,
      `recht.html#datenquellen`).
      **(2) Eingabe:** `clean()` streicht den Platzhalter (`'sorte'`, `in sorten`) beidseitig –
      »Salvia nemorosa« zählt jetzt **exakt** (vorher richtig, aber mit »saubere Schreibweise«-
      Hinweis), »Weigelie« gilt für »Weigelie in Sorten«.
      **(3) Info-Karte:** Block `.sorten` (`sortenInfoHTML`, nur bei `cultivarKind()==="placeholder"`)
      erklärt den Platzhalter (für 'Sorte', Cultivars, Hybriden) und nennt **typische
      Gartensorten** zum Wiedererkennen (`SORTEN_BEISPIELE`, 23 Taxa, kuratiert; »automatisch
      zusammengestellt – ohne Gewähr; Sortennamen fragt die Prüfung nicht ab«).
      **(4) Bildvielfalt:** `pickCommons` liefert `top` (Zahl der gleich gut bewerteten
      Ansichten) und `galInfo` (Datei + Nachweis je Ansicht); für Platzhalter-Arten dreht
      `photoVariant(p)` in `renderPhoto` zufällig eine der besten Ansichten nach vorn – man sieht
      die Art in verschiedenen Sorten (Blütenfarbe, Wuchs). Galerie beginnt mit der gezeigten
      Ansicht, `file`/`artist`/`license` gehören zu ihr (Bildnachweis stimmt).
      **(5) Wortlaut** (Nutzerwunsch): Teilen-Block »Fordere jemanden heraus oder gib einfach mit
      deinem Wissen an« statt »Fordere Azubi-Kollegen heraus«; Toast »Link kopiert – jetzt
      verschicken«; Hilfe »jemanden herausfordern«.
      `tests/learn.mjs`: Anzeige in Name/Art-Feld/Rückseite/Liste/Druckliste/Info-Kopf,
      Eingabe exakt mit und ohne Platzhalter, Info-Block mit Erklärung + 'Caradonna' nur bei
      Platzhaltern, »Weigela Cultivars« (placeholder, »Weigelie« gilt, Block), Duell-Wortlaut;
      `pickCommons.top/galInfo`, `photoVariant` (Drehung, Datei, Nachweis, 0 = unverändert),
      Quiz zeigt die gedrehte Ansicht samt passendem Nachweis.

- [x] **Info-Karte: Sorte, aber nur der Artikel der Art – gekennzeichnet, mit Sortenfoto**
      (Screenshot: »Cornus sericea 'Flaviramea' · Gelber Hartriegel« zeigte nach »Online-Infos
      laden« den Artikel **Seidiger Hartriegel** mit rotholzigem Artbild). Das war nicht das
      Bilder-Quiz (dort seit #139 korrekt), sondern die **Wikipedia-Vorschau der Info-Karte**:
      Für Sorten gibt es keinen eigenen Artikel, `wikiCandidates` landet beim Artikel der Art –
      der Text passt, das Artikelbild zeigt die Art in ihrer typischen Form, ohne Hinweis.
      **Lern-Tool** (`taxonNote(card, pg, data)` in `loadWiki`, vor dem Cachen): greift bei
      `cultivarKind()` `cv`/`infra` (kein Autonym, kein Platzhalter), wenn Titel + Extract
      den Sorten-/Varietätsnamen **nicht** nennen. (1) `artLevelOk(card)` true (Phantasiename
      ohne Geschwister, Varietät ohne Geschwister): Artikelbild bleibt, Hinweis »Artikel zur
      Art/Gattung X – das Bild zeigt die Art, nicht die Sorte 'Y'«. (2) sonst: **Sortenfoto
      aus derselben Bildsuche wie im Quiz** (`photoFor`, Cache oder Netz) ersetzt das
      Artikelbild; `data.photo` (Datei, URL, Urheber, Lizenz) ergänzt die Quellenzeile
      (»Bild: Wikimedia Commons (…)«), `data.gallery` = die Sorten-Ansichten (`hit.gal`), die
      **Artikel-Galerie entfällt** (sie zeigte die Art). Kein Sortenfoto → **kein Bild**,
      Hinweis sagt es. `renderWiki` rendert `data.note` als `.wp-taxon` (goldener Streifen,
      CSS in `learn.html`/`template.html`). `wikiJSONP` läuft jetzt über den austauschbaren
      `jsonp` (Info-Karte testbar ohne Netz). **Prüfungswerkzeug** (`app.js`): gleiche
      Kennzeichnung (`taxonNote` light, Bild bleibt – keine Bildsuche dort), dazu
      `cultivarName`/`stripCultivar` portiert (`binomEpithet` nahm bei »Weigela 'Bristol
      Ruby'« »'Bristol« als Epitheton → Deep-Links suchten »Weigela 'Bristol«) und
      `window.__setJsonp` + `window.wikiCache` für den Smoke-Test.
      `tests/learn.mjs`: 'Flaviramea' mit Sortenfoto (Hinweis, Bild = Sortenfoto, Nachweis
      David J. Stang, Sorten-Galerie »Bilder ansehen«, keine Artikel-Galerie), ohne Sortenfoto
      (kein Bild, »weggelassen«), 'Bristol Ruby' (Artikelbild + Hinweis »Gattung«), reine Art /
      Platzhalter 'Sorte' / passende Unterart (Steckrübe) ohne Hinweis. `tests/smoke.mjs`:
      Kirschtomate → Hinweis »Artikel zur Art Solanum lycopersicum … Varietät »var.
      cerasiforme««, Bild bleibt.

- [x] **Quellfehler berichtigt: »Salvia abrotanoides · Bauernjasmin« → *Philadelphus
      coronarius*** (GaLaBau-Gärtner, Nr. 207; Rückmeldung mit Screenshot aus dem Bilder-Quiz).
      Befund in der Quell-Excel (Zeile 209): botanischer Name »Salvia abrotanoides«, Familie
      »Hydrangeaceae/Hortensiengewächse«, deutsche Namen »Bauernjasmin, Gewöhnlicher
      Pfeifenstrauch, Falscher Jasmin«, ZP. Familie und deutsche Namen gehören zum
      Pfeifenstrauch *Philadelphus coronarius* – die GaLaBau-**Fachwerker**-Liste führt genau
      diese Zeile (Nr. 50) mit dem richtigen Namen; »Salvia abrotanoides« ist das Synonym der
      Blauraute (*Perovskia abrotanoides*), die eine Zeile darüber steht und es dort schon
      trägt → Übertragungsfehler. **Umsetzung reproduzierbar**, nicht im Seed:
      `tools/fix_source_gaps.py` hat neben `CORRECTIONS` (füllt nur leere Felder) jetzt eine
      `REPLACEMENTS`-Tabelle `{profil: [((gattung, art, familie, dt_name), {feld: wert}), …]}` –
      die fehlerhafte Zeile muss mit **allen vier Textfeldern** passen (trifft nie eine andere
      oder eine künftig amtlich berichtigte Zeile), nur die genannten Felder ändern sich
      (Gattung/Art), Nummer/ZP/Synonyme bleiben, und die **Wuchsform wird mit den Regeln von
      `categorize_seeds.py` neu bestimmt** (Import `categorize`/`KEEP`; Stauden → Laubgehölze),
      unabhängig von der Reihenfolge in `rebuild_seeds.sh`. Idempotent (`--check` meldet
      »Offen«, zweiter Lauf 0; ist weder die falsche noch die berichtigte Zeile da → WARN).
      Verifiziert: Seeds-Neubau aus `data/` byte-identisch, Diff zu vorher genau **eine
      Zeile**. **Offenlegung als vierter Eingriff** (»Vier Eingriffe sind offengelegt«) in
      `.learnnote` (Lern-Tool), Hilfe »Datenherkunft« (Prüfwerkzeug – Bogen und Musterlösung
      zeigen den berichtigten Namen), `recht.html#datenquellen` (eigener Listenpunkt mit
      Begründung) und `docs/technik-kurzbeschreibung.md`. Tests: `tests/learn.mjs` prüft den
      Hinweistext **und die Daten** (kein `Salvia abrotanoides` mehr, genau eine
      *Philadelphus coronarius*-Zeile mit Bauernjasmin/Hydrangeaceae/ZP/Laubgehölze, Blauraute
      behält ihr Synonym); `tests/smoke.mjs` die Hilfe. **Nicht geändert:** Die
      Baumschul-Gärtner-Liste nennt die Art *Prunus cerasifera* »Blutpflaume, Gewöhnliche
      Kirschpflaume« (Blutpflaume ist die Sorte 'Nigra') – Ungenauigkeit, kein eindeutiger
      Fehler. Eine Meldung der Fehler an die zuständige Stelle ist Sache des Betreibers.

- [x] **Rang »Stockmutter« ersetzt + Laufbahn erklärt sich selbst** (Rückmeldung mit Screenshot:
      »Begriff Stockmutter ist nicht gut – was soll das überhaupt sein?«). Befund: Die fünfte
      Stufe der XP-Laufbahn hieß nach dem Zierpflanzenbau-Fachbegriff für die Mutterpflanze,
      von der Stecklinge geschnitten werden – als Rang unverständlich und schief. Dazu war die
      Laufbahn nirgends erklärt: Das Rang-Popover zeigte nur Namen und Punktzahlen, der Hilfe-Text
      kannte Punkte und Ränge gar nicht, und auf Geräten ohne Popover-/Anchor-Unterstützung war
      der Rang-Knopf tot (nur ein am Handy unsichtbarer Tooltip). Vier Änderungen in `learn.js`/
      `learn.html`: (1) Rang 5 heißt **Prachtexemplar** (allgemeinverständlich, bleibt im
      Pflanzen-Bild: Keimling → Sämling → Steckling → Jungpflanze → Prachtexemplar →
      Meistergärtner/in). (2) Jeder Rang trägt eine **Bedeutung** (`RANKS[i].d`, z. B. »voll
      entwickelt – kaum noch Lücken«), die im Popover (`.r-d`), im Aufstiegs-Toast und im neuen
      Dialog erscheint; Fuß `RANK_HOW` nennt die Punkteregel (Selbst eingeben 10 · Auswahl 5 ·
      Karteikarte 3 · Serienbonus). (3) **Fallback-Dialog** `openRankModal()` (gleiches
      `.scrim`-Modal wie die Stufen-Leiter): `wireRankPopover` hängt ihn an den Rang-Knopf,
      wenn `canPopover()` falsch ist – kein toter Knopf mehr. (4) Hilfe-Absatz **»Punkte &
      Ränge«** unter »Fortschritt & mehr«. `tests/learn.mjs` prüft: Erklärzeile je Rang im
      Popover, kein »Stockmutter«/Rang 5 = Prachtexemplar, Dialog mit sechs Rängen + aktuellem
      Rang + Punkteregel, Hilfe-Absatz.

- [x] **Bilder-Quiz: nicht immer dasselbe Bild zuerst** (Nutzerwunsch: »sonst lernt man Bilder
      auswendig und nicht die Pflanze – random oder sich merken, welches Bild zuletzt zuerst
      gezeigt wurde, und beim nächsten Mal ein anderes«). Umgesetzt als **Gedächtnis statt
      Zufall** (`learn.js`): `photoVariant(p, card)` merkt sich je Art die zuletzt zuerst
      gezeigte Ansicht (`pflanzenlernen.photoseen`, Deckel 1500, `photoSeenGet/Set`) und nimmt
      beim nächsten Mal **reihum die nächste** aus den geprüften Ansichten (`p.gal` – bisher
      drehte nur die Platzhalter-Art zufällig unter den gleich guten). Erste Begegnung = beste
      Ansicht; nennen mindestens zwei Dateinamen die Art (`commonsScore>0`), bleibt die
      Rotation unter diesen (ein namenloses Kategoriebild ist seltener eindeutig). Galerie
      beginnt mit der gezeigten Ansicht, Datei/Nachweis gehören zu ihr. Gilt auch innerhalb
      einer Sitzung (»Nochmal« zeigt eine andere Ansicht). **Artikelbild** (`src:"wp"`, nur
      eine Ansicht bekannt): `photoMoreViews(p, card)` holt **ab der zweiten Begegnung**
      einmalig die Artikelbilder (`wikiGallery(title, noArt)`, JSONP – `check_offline.py`
      bleibt grün) und behält nur Dateien, die **diese** Art nennen und keine andere Art der
      Gattung (`fileMentionsOther`); sie werden als `gal`/`galInfo` im Bild-Cache gemerkt
      (kein zweiter Abruf; Thumb auf 640 px via `phThumb`), der Bildnachweis der neuen
      Ansicht kommt wie bisher per Datei-Abruf (`photoCredit`). `prefetchPhoto` holt die
      weiteren Ansichten der nächsten zwei Karten schon vorab; `photoMoreTried` begrenzt auf
      einen Versuch je Sitzung (wikiGallery schluckt Netzfehler als `[]`). Hilfe-Text »Bilder«
      ergänzt. Test-Haken `__getPhotoSeen`/`__setPhotoSeen`; `__clearPhotoCache` leert auch
      den Stand. `tests/learn.mjs`: `vielfalt` umgestellt (erste = beste, dann reihum nur
      Dateien mit Art, Galerie/Datei/Nachweis passend, Stand gespeichert; Quiz: nach gemerkter
      Ansicht 2 kommt 3 samt Nachweis, danach wieder 1) + neuer Block `wpRot` (erste Begegnung
      ohne Abruf, zweite holt einmal die Artikelbilder und zeigt das Zapfen-Foto – andere Art
      und namenlose Datei verworfen –, Nachweis per Datei-Abruf, danach reihum ohne weiteren
      Abruf).

- [x] **Bilder: Commons-Standardgrößen, Ausweich-Kette und sichtbare Meldung statt leerer
      Großansicht** (Rückmeldung mit Screenshot: »teilweise werden Bilder geblockt, aber trotzdem
      als leeres Bild geladen« – DevTools: `1600px-…`/`640px-…Bark_of_Parrotia.JPG?utm_source=…`
      »blocked by CORB«). Ursache: Wikimedia liefert Vorschaubilder bei **Direktabruf nur noch in
      festen Stufen** (20 · 40 · 60 · 120 · 250 · 330 · 500 · 960 · 1280 · 1920 · 3840 px –
      mediawiki.org/wiki/Common_thumbnail_sizes, T414805); jede andere Breite beantwortet der
      Server mit einer HTML-Fehlerseite (HTTP 400 »Use thumbnail sizes listed on …«), die der
      Browser als Bild verwirft – der `<img>` blieb leer. Betroffen waren genau **unsere selbst
      abgeleiteten Größen**: `lbBig` (»…/1600px-…« für die Großansicht) und `phThumb`
      (»…/640px-…« für weitere Quiz-Ansichten) plus ältere Cache-Einträge; die API-Abfragen
      (`iiurlwidth`/`pithumbsize`) rundet der Server selbst auf. »Teilweise«, weil früher erzeugte
      Derivate noch im Wikimedia-Cache lagen. Fix (beide Werkzeuge, Lightbox 1:1):
      (1) `lbBig(src, w)` leitet nur noch auf eine **Standardstufe** ab (1920; im Datensparmodus/
      2G 1280) und **nie über die Originalbreite** hinaus (`w` aus `iiprop=size`, mitgeführt in
      `wikiGallery`/`pickCommons`/`galInfo`/Galerie-Einträgen). (2) **Ausweich-Kette** je Bild
      (`lbChain`: abgeleitete Stufe → vom API gelieferte Vorschau); `lbTry` probiert sie auf dem
      sichtbaren `<img>` und beim Vorladen, die funktionierende URL wird je Eintrag gemerkt
      (`lbState`, WeakMap – nichts wird gespeichert), nichts doppelt angefragt. (3) Scheitert
      alles: **»Bild nicht verfügbar«** (`.lb-fail`; bei bekannter Datei mit Link auf Commons, im
      Quiz ohne Dateinamen) statt eines leeren Rahmens. (4) `phThumb` entfällt – `photoMoreViews`/
      `photoGalLoader` fragen `wikiGallery(title, noArt, 640)` an, der Server liefert die
      960-px-Stufe; `lbLoad` dedupliziert über die Datei (`lbKey`), nicht nur über die URL.
      Bild-Cache auf `pflanzenlernen.photos6` (alte 640-px-Einträge verfallen). Per curl
      verifiziert: 960/1920 px → Bild, 4096 px → 400 (die Build-IP wurde sonst mit 429 gebremst).
      `tests/learn.mjs`: Kette (1920 mit Query-String, Original 1500 → 1280, 900 → nur Vorschau,
      Data-URI unverändert), Meldung bei gescheiterter Kette, nächstes Bild lädt über die
      Vorschau (`src`-Setter des `<img>` im Test umgeleitet); `tests/smoke.mjs`: `lbBig` 1920/1280.

- [x] **Neue Version sofort aktiv + Versionskennung in der Fußzeile** (Rückmeldung »es wird
      weiterhin dasselbe Bild angezeigt«: die Änderung war online, der Service Worker lieferte aber
      cache-first noch die alte Seite – die neue stand erst beim übernächsten Aufruf). Jetzt
      lauscht das Head-Snippet aller drei Seiten auf `controllerchange` (nur wenn vorher schon ein
      Service Worker aktiv war): `swUpdate()` (`learn.js`/`app.js`) lädt **sofort neu, wenn nichts
      läuft** (keine Sitzung bzw. keine gezogene Prüfung, kein offener Dialog, Tab sichtbar),
      sonst erscheint ein Hinweis `#swNote` »Neue Version geladen – wird beim nächsten Aufruf
      aktiv« mit Knopf **»Jetzt neu laden«** (`.swnote`, im Druck ausgeblendet). `build.py`
      schreibt einen **Versionsstempel** (`/*__BUILD__*/` → »Stand TT.MM.JJJJ · Version abcdef1«:
      Datum des letzten Commits + 7-stelliger Hash über Quellen und Seeds, deterministisch) in die
      Fußzeile beider Werkzeuge (`#buildStamp`) – so lässt sich auf jedem Gerät ablesen, ob die
      neue Ausgabe aktiv ist. Test-Haken `__swUpdate`/`__swReloadHook`; `tests/learn.mjs` und
      `tests/smoke.mjs` prüfen Stempel, Leerlauf → Neuladen, laufende Sitzung/gezogene Prüfung →
      genau ein Hinweis mit Knopf.
      **CI-Falle behoben:** `build.yml` vergleicht die Root-Kopien mit `git diff -I 'id="buildStamp"'`,
      weil das Stempel-Datum (letzter Commit) zwischen lokalem Build und CI-Merge-Commit abweicht,
      sobald beide an verschiedenen Tagen liegen – ohne `-I` wäre jeder PR am Folgetag rot.

- [x] **Audit-Paket 1 (sofort): zehn bestätigte Fehler aus dem Tool- und UI-Audit behoben**
      (Funde 2–4, 7, 8, 10, 12, 26–28; Fund 1, die CI-Stempel-Falle, kam schon mit #146).
      **(2) Bildfilter mit Wortgrenzen:** `usablePhoto()` arbeitete als Teilstring-Filter und
      verwarf damit jede *Hydrangea* (»range«), jeden »maple«-Dateinamen (»map«) und jede
      »orange« – genau die Dateien, die `commonsScore` bevorzugt. Jetzt `\b`-Grenzen auf dem
      normalisierten Dateinamen; deutsche Komposita bleiben erfasst (»Verbreitungskarte« über
      Präfix »verbreitung« / Suffix »karte«). Dieselbe Korrektur in `wikiGallery` von `app.js`;
      Bild-Cache auf `pflanzenlernen.photos7` (alte Fehltreffer verfallen).
      **(3) Excel-Import »ersetzen«** setzt `selection` und `loadedExamId` zurück – die alte
      Auswahl verwies sonst auf die neu vergebenen IDs 1…n, Bogen/Vorschau/»Aktuelle Prüfung«
      zeigten fremde Arten. **(4) Verwaltungs-Menü** schließt beim Klick auf einen Menüpunkt
      (delegierter Listener auf `#adminBar`; das Popover im Top-Layer lag sonst über dem
      geöffneten Dialog »Neue Art«/Schema/Einstellungen und verdeckte die Felder).
      **(7) Druck-Guard** in `template.html` mit `!important` + `#sheet{background:#fff}`: die
      spätere »Stufe 2«-Regel (Lichtkegel + Punktraster) gewann die Kaskade und bedruckte den
      amtlichen Leerbogen, sobald im Browser »Hintergrundgrafiken« an waren (`learn.html` hatte
      den Guard schon mit `!important`). **(8)** Musterlösung (`#sheet.sol-look`) mit
      `print-color-adjust:exact` – grüner Kopf und Zebrastreifen auch ohne Hintergrundgrafiken.
      **(10)** `[hidden]{display:none!important}` auch in `template.html` (`.btn{display:flex}`
      überstimmte das Attribut, »Aktualisieren« war ohne geladene Prüfung sichtbar).
      **(12)** `shuffleSel()` ruft `syncSelUI()` – Mischen war nur im Druck sichtbar.
      **(26) Deploy nur nach grünen Tests:** `deploy.yml` hat einen vorgeschalteten Job
      `pruefen` (Seeds = amtliche Listen, Build, Offline-Check, die drei Puppeteer-Tests); die
      Upload-Jobs `deploy` und `pages` hängen per `needs` daran und veröffentlichen das geprüfte
      Artefakt (`actions/upload-artifact` → `download-artifact`, nichts wird zweimal gebaut).
      `cancel-in-progress` gilt nur noch für PR-Vorschauen – ein abgebrochenes `mirror --reverse`
      hätte sonst einen gemischten Live-Stand hinterlassen. **(27)** `sw.js`: `addAll` ohne
      `.catch` – scheitert das Vorladen, scheitert die Installation sauber und der alte Cache
      bleibt (vorher »gelang« sie trotzdem, `activate` löschte den alten Cache → offline leer).
      **(28)** `npm test` = smoke + learn + pwa (`tests/start.mjs` gab es nicht mehr),
      `npm run check` prüft alle fünf Seiten. Tests: `tests/smoke.mjs` (Menüpunkt schließt das
      Menü und der Dialog liegt frei – `elementFromPoint`, `[hidden]` wirkt, Mischen zeigt die
      Reihenfolge, Ersetzen-Import setzt Auswahl zurück, Druck-Guard + `print-color-adjust`
      über `page.emulateMediaType("print")`), `tests/learn.mjs` (Hydrangea/maple/orange bleiben,
      Karten/Verbreitungsdateien weiterhin raus).

- [x] **Audit-Paket 2 (Handy/Lesbarkeit): Funde 5, 6, 11, 15, 16, 17, 18.**
      **Prüfungswerkzeug (`template.html`):** **(5)** »Aktuelle Prüfung«/Vorschau werden schmal
      (`@media ≤640px` und `@container cursel ≤520px`) **zweizeilig** – `.pvrow` als Flex mit
      Umbruch: Zeile 1 Nummer + Name in voller Breite (`.pvname{flex:1 1 200px}`), Zeile 2 die
      Aktionen rechtsbündig (`margin-left:auto`); passen sie neben den Namen, bleibt es eine
      Zeile. Vorher quetschte die Aktionsspalte den Namen auf wenige Wörter je Zeile, das ℹ lag
      über dem Familiennamen. **(11)** Listenzeilen mobil: `.namecell{display:contents}`, Name und
      Meta stapeln in Spalte 2, die Checkbox überspannt beide Zeilen, die Aktionen stehen **rechts**
      (Spalte 3) statt in einer dritten Zeile. **Dabei gefunden:** die Touch-Regel
      `.rowacts .iconbtn{opacity:1}` (0,2,0) verlor gegen `.rowacts .iconbtn:not(.info){opacity:0}`
      (0,3,0) – Bearbeiten/Löschen waren auf Touch-Geräten **unsichtbar, belegten aber Platz**
      (daher stand das ℹ scheinbar allein). Jetzt gleiche Spezifität; zusätzlich zeigt das Handy im
      Modus »Prüfung erstellen« nur das ℹ (`body.m-exam … {display:none}`), in »Liste verwalten«
      alle drei (die »Aktuelle Prüfung« hat ✎ ohnehin). **(6)** Notenrechner: `td.pct` mit
      `white-space:nowrap` (»ab 90 %« zerfiel mobil in drei Zeilen), kompakte Tabelle ≤640px
      (12,5 px, 4 px Zellen-Padding, Grenzfeld 52 px). **(18)** ZP-Marker über eigene Token
      `--zp-ink/--zp-bg/--zp-line` (hell 6,5:1, dunkel 8,5:1 – vorher dunkel 1,92:1 wegen fest
      hellem Hintergrund), Kategorie-Zähler `.cnt` auf `--ink-soft`.
      **Lern-Tool (`learn.html`/`learn.js`):** **(15)** Hilfe ist ein **Dialog** wie im
      Prüfungswerkzeug (`#helpScrim` + `.modal.helppanel`, `role=dialog`, × / Esc / Klick daneben,
      Fokus hinein und zurück zum Hilfe-Knopf, Fokusfalle; `openHelp/closeHelp/helpKey`); der
      Inhalt scrollt in `.hscroll`, die vier Themen sind `<details class="hsec">`-Klappen (erste
      offen); Überschrift »In vier Schritten« (es waren vier). **(16)** Im Listenmodus blendet
      `applyMode` auch `#chooseWrap` (»Selbst wählen«) aus – zurück über »← Zurück zum Lernen«.
      **(17)** Sekundärtexte auf `--ink-soft` (≥4,5:1) und ≥10 px: `.mdiff` 10 px fett,
      `.opts-sub`, `.stage-note`, `.gnote` 12 px, `.exf-hint`, `.lc-h`/`.lc-h2`, `.famfoot`,
      `.zpnote`; **Dunkelmodus:** aktiver Modus-Tab tonig (`--green-tint` + `--green-deep`,
      ≈8:1) statt gefüllt (3,6:1). Tests: `tests/smoke.mjs` 9c (360 px: zweizeilige Prüfung ohne
      Überlappung, Aktionen rechts, Bearbeiten/Löschen nur in »Liste verwalten« und dort sichtbar,
      Notenrechner einzeilig, ZP/Zähler hell + dunkel ≥4,5:1; 8i erwartet Hover-Gating nur ohne
      `hover:none`), `tests/learn.mjs` (Hilfe-Dialog: Fokus/Esc/×/Klappen/»vier Schritten«,
      Listenmodus ohne Sitzungs-Klappen, Kontraste hell + dunkel – nach der Tab-Transition gemessen).

- [x] **Audit-Paket 3 (Barrierefreiheit, Texte, Rechtliches): Funde 19–23, 29–32.**
      **Prüfungswerkzeug:** **(19)** jedes Formularfeld hat einen zugänglichen Namen – `#q` mit
      `aria-label`, `label[for]` für Notenrechner (`gPts`/`gMax`), Schema-Anzahl (`scAnzahl`) und
      den ganzen Bearbeiten-Dialog (`fGattung` … `fBem`, `fZp`), die fünf Notengrenzen (`.gedge`)
      bekommen in `renderGrader` ein `aria-label` (»Note N: Untergrenze in Prozent«). **(23)**
      Dialog-Kopf/-Fuß sind `div.mhead`/`div.mfoot` statt `<header>`/`<footer>` (sonst doppelte
      banner-/contentinfo-Landmarken), die Hilfe nutzt `h3` statt `h4` (Sprung h2→h4), Suche,
      Ziehen-Leiste, »Aktuelle Prüfung« und Liste liegen in **einem** `<main>` (`#list` ist jetzt
      ein `div`). **(31)** Hilfe-Schritt 2 beschreibt die immer sichtbare Suche; die Rücksetz-Rückfrage
      der Einstellungen nennt »Regierungspräsidien Baden-Württemberg« (= Standard).
      **Lern-Tool:** **(20)** Toast ist Live-Region (`role=status`, `aria-live=polite`); Listenzeilen
      sind `<li><button class="sprow">` statt `li[role=button]` (ungültige Rolle, Liste ohne
      Listeneinträge) – Enter/Leertaste nativ, kein eigener `keydown` mehr, Innen-Elemente sind
      `span` (Phrasing-Content im Button). **(21)** `cardKeys`: nur die Karte selbst (und die
      Bewertungs-Knöpfe) gehören zur Tastatursteuerung – Enter/Leertaste auf »beenden« o. ä.
      dreht nicht mehr um; hinter offenem Dialog (`.scrim`, Lightbox) bewerten die Ziffern nicht;
      `stageFull()` setzt alles außerhalb der Bühne (`.wrap`-Kinder außer `#stage`) **inert**
      (Tab wanderte in verdeckte Elemente). **(22)** Touch-Ziele ≥44 px in der Touch-Media-Query:
      ℹ an der Legende (`.legend-i`), Status-Chips, Profil-Selects, `.linklike`, Quellen-Links
      (Innenabstand mit negativem Außenabstand), `.cathead-i`. **(23)** `#stage` ist ein `div`,
      `<main>` umschließt Setup, Fortschritt, Suche und Bühne (`main{margin-top}` → `#stage`);
      Modus-Tabs tragen `aria-pressed` (zentral `syncModeTabs()`); Steckbrief-/Sorten-Modal mit
      `h3` statt `h4`. **(32)** ⏱ (U+23F1, auf Handys buntes Emoji) ersetzt durch `ico("clock")`
      in Sitzungsleiste (`#sclockT` für den Tick) und Duell-Vergleich; Hilfe ohne Glyphe; der
      Emoji-Test deckt U+2300–23FF mit ab. **(31)** Hilfe: »Optionen · Lernstoff«, Lernduell
      auch nach der geführten Lektion, der entfallene »Duell-Quiz«-Knopf ist raus.
      **Rechtliches:** **(29)** ODR-Absatz gestrichen (Plattform seit 20.07.2025 eingestellt), der
      § 36 VSBG-Hinweis bleibt; »Startseite« entfernt. **(30)** Datenschutz nennt `pbw.theme`,
      `pflanzenlernen.name` (nur im selbst verschickten Duell-Link) und den WhatsApp-Knopf
      (`wa.me`, Meta). **(23)** Inhalt in `<main>`; **(22)** Design-Knopf 44 px, »← zurück« 44 px.
      Tests: `tests/smoke.mjs` 9d (benannte Felder inkl. `.gedge`, keine header/footer in Dialogen,
      h3, ein `<main>`) + 10 (Rechtliches: `<main>`, kein ODR, keine Startseite, Datenschutz,
      Touch-Ziele), `tests/learn.mjs` (Live-Region, `li>button`-Zeilen, `aria-pressed`, beenden
      dreht nicht um, Dialog blockt Ziffern, inert an/aus, Touch-Ziele, keine ⏱-Glyphe, Hilfe aktuell).

- [x] **Audit-Paket 4 (Robustheit & Pflege): Funde 9, 24, 33–44 – dazu 13, 14 und 25, die in
      keiner Paketliste standen.** **Lern-Tool:** **(9)** `store.set` behandelt einen vollen
      Speicher (`QuotaExceededError`) je Schreibvorgang statt den Browser-Speicher für die ganze
      Sitzung abzuschalten (`isQuota`, `get` bevorzugt den RAM-Stand eines gescheiterten Schreibens;
      gleiche Änderung in `app.js`); Bild-Cache auf **400** Einträge gedeckelt (`PHOTO_CAP`), neu
      Erinnertes wird nach hinten sortiert, das Schreiben ist 250 ms gebündelt (`photoStoreFlush`,
      bei Quota-Fehler ältere Hälfte weg, `pagehide` flusht). **(33)** `stepHTML(0)` sagt »Neu ·
      noch 3× richtig« statt »Stufe 0 von 5«. **(34)** Der Bildnachweis landet in einem Slot
      **unter** Optionen/Rückmeldung (`.ph-srcslot`), nicht mehr zwischen Bild und Optionen.
      **(35)** `.opt:disabled` hat eine ausdrückliche Textfarbe (`--ink-soft`), die richtige Option
      volle Tinte – vorher UA-»graytext« (dunkel 2,6:1). **(36)** Design-Umschalter als **runder
      Knopf im Kopf** auf allen drei Seiten (`.mast-right .themebtn`); der Optionen-Eintrag und
      der Listen-Abschnitt »Design« sind raus (Prüfwerkzeug: Gruppe »Ansicht« aus der Verwaltung
      raus). **(37)** `<h1>` mit geschütztem Leerzeichen vor dem Trenner (»Pflanzenkenntnis ·« /
      »Lernen«). **(38)** `renderPhoto` prüft nach jedem `await` gegen eine Sitzungs-Nummer
      (`sess.id`/`sessSeq`, `stale()`), nicht nur gegen `current`. **(40)** `startChallenge` lädt
      das Profil des Links, bevor Indizes zu Karten werden. **(41)** Toter Code raus
      (`promptSub`, `startQuizWith`, `printColOn`, CSS `.herblink`/`.rankrow`); **bewusst nicht
      gemacht:** ein gemeinsames `src/shared.js` beim Build – die 40 identischen Blöcke beider
      Werkzeuge sind ein Refactoring mit echtem Regressionsrisiko ohne Nutzen für Nutzer, bleibt
      als Idee in der TODO. **(42)** `esc()` maskiert `'`; JSONP lässt nach Zeitüberschreitung einen
      stillen No-op-Callback stehen (kein `ReferenceError` bei später Antwort); `lbWire` ist
      idempotent (zweiter Aufruf aktualisiert nur Liste/Loader); `own()` gegen Prototyp-Schlüssel
      aus Link/Speicher (`PH_ANSWER`, `DIRS`); **CSP-Meta** auf allen drei Seiten (`script-src`
      self + inline + de.wikipedia.org/commons.wikimedia.org für JSONP, `img-src` self/data/blob +
      upload.wikimedia.org/commons/de.wikipedia, sonst `'self'`, `object-src 'none'`).
      **(25)** `answerTextMemo` (Memo je Karte und Richtung) in `distractors`. **Prüfungswerkzeug:**
      **(24)** SheetJS steckt als `<script type="text/plain" id="sheetjs-text">` in der Seite und
      wird erst beim ersten Import ausgewertet (`ensureXLSX()`, als eingefügtes Inline-Skript –
      CSP-verträglich, kein eval) – spart beim Erstaufruf das Parsen von 624 KB. **(13)** Der
      Werkzeug-Import normalisiert wie der Konverter: gerade Apostrophe (`quotesQ`) und die drei
      Beikraut-Schreibweisen (`KAT_ALIAS`/`katName`). **(14)** Ziehen: negative/0 Anzahl → Profil-
      Soll (vorher `slice(0,-5)` = alle außer fünf). **(39)** `persistNow`/`flushPersist()`:
      `switchProfile` sichert die ausstehende Änderung vorher, `pagehide`/`beforeunload` ebenso;
      `normalizeSchema(s, def)` prüft Spalten (nur bekannte Schlüssel, Punkte ≥0, keine
      Dubletten), Anzahl (1–60) und Skala (5 fallende Prozentwerte) **feldweise** gegen den
      Profil-Standard – beim Laden aus dem Speicher und beim Sicherungs-Import; doppelte Prüfungs-
      IDs aus der Sicherung werden verworfen. **(42)** `copyExam` hängt »(Kopie)« nur einmal an;
      **(25)** die Suche rendert nicht mehr bei jedem Tastendruck die »Aktuelle Prüfung« mit.
      **Werkzeuge/Doku:** `check_offline.py` erkennt zusätzlich `<img src=https…>` und jedes
      `fetch(`; **(44)** README (Wurzel = Lern-Tool, kein `start.mjs`, »Selbst eingeben«, kein
      IHK-Schlüssel, Dateibaum) und Technik-Doku (Größen) nachgezogen. **(43) Tests:** die zwei
      langen festen Pausen (1,5 s/3,2 s) in `tests/learn.mjs` sind Polling; neu in
      `tests/smoke.mjs` 9e/9f: Anzahl-Feld, Notengrenzen editieren (+ `flushPersist`), **echter
      Excel-Import** (SheetJS erst beim Import, Normalisierung), Sicherung mit defektem Schema,
      Quota-Fallback, `flushPersist` vor Profilwechsel, Kopie-Suffix, `esc`, Kopf-Umschalter,
      `<h1>`, CSP-Meta und **CSP-Wirkung** (fremde Skripte/Bilder geblockt, Wikipedia/Commons
      nicht – auf eigener Seite, weil die erwarteten Meldungen sonst als Konsolenfehler zählen);
      `tests/learn.mjs`: Quota, Cache-Deckel, »Neu«, toter Code, `esc`, Kopf-Umschalter, CSP,
      Herausforderung erzwingt Profil, Profilwechsel beendet die Sitzung, Bildnachweis ohne
      Verschieben der Optionen, richtige Option dunkel ≥4,5:1.

- [x] **Hotfix: Bilder-Quiz meldete »Bild konnte nicht geladen werden« – die CSP ließ den neuen
      Wikimedia-Bildhost nicht durch** (Rückmeldung mit Screenshot direkt nach den vier Audit-
      Paketen: »seit den Fixes kommt oft … so kann man nicht arbeiten«). **Ursache:** Die mit
      Paket 4 eingeführte Content-Security-Policy erlaubte Bilder nur von drei fest eingetragenen
      Hosts (`upload.wikimedia.org`, `commons.wikimedia.org`, `de.wikipedia.org`). Wikimedia zieht
      die Vorschaubilder aber gerade von `upload.` nach **`thumb.wikimedia.org`** um (Tech News
      2026/36, T427465): Die API-Felder `thumburl` (Commons `imageinfo`) und `thumbnail.source`
      (`pageimages`) liefern seither den neuen Host samt `utm_`-Query; nur Originale bleiben auf
      `upload.`. Jedes neu gesuchte Quiz-Bild verwarf der Browser damit vor dem Abruf
      (`securitypolicyviolation [img-src]`, »Refused to load the image«), die Ausweich-Kette über
      die weiteren Ansichten derselben Art ebenso → Meldung statt Bild. **»Oft« statt »immer«**,
      weil im Bild-Cache (`photos7`) gemerkte Treffer aus der Zeit vor dem Host-Umzug noch
      `upload.`-Adressen tragen. Ebenso betroffen: die Wikipedia-Vorschau der Info-Karte in
      **beiden** Werkzeugen (`pithumbsize`). **Verifiziert, nicht vermutet:** API-Antworten live
      abgefragt (`iiurlwidth=640` → `thumb.wikimedia.org/…/960px-…` – der Server rundet also
      tatsächlich auf die Standardstufe), dann auf der Live-Seite per Puppeteer ein `<img>` von
      `thumb.` (geblockt, Violation-Event) gegen eines von `upload.` (lädt). Mein erster Live-Test
      hatte nur `upload.` probiert und deshalb nichts gefunden. **Fix:** `img-src` erlaubt jetzt
      pauschal `https://*.wikimedia.org https://*.wikipedia.org` (alle drei Seiten, Kommentar im
      `<head>`); `script-src` bleibt eng – die zwei JSONP-Endpunkte stehen fest im Code. Keine
      Cache-Bereinigung nötig: die gemerkten `thumb.`-Adressen sind richtig, nur die Policy war
      falsch; die neue Version aktiviert sich über `swUpdate` von selbst. **Dauerhafte Guards:**
      `tests/smoke.mjs` 9f und ein neuer Block in `tests/learn.mjs` prüfen, dass weder `thumb.`
      noch `upload.` noch ein erfundener künftiger Host `neu.wikimedia.org` geblockt wird (fremde
      Hosts weiterhin schon), dass `img-src` die Wildcards trägt und dass `lbBig` auch auf dem
      neuen Host ableitet (1920 px, Query bleibt). *Lehre:* Eine CSP mit fest eingetragenen
      Fremd-Hosts ist eine tickende Abhängigkeit – für Inhalte, die nur angezeigt werden (Bilder),
      die Domain pauschal freigeben; und beim Prüfen eines Verdachts die Adresse nehmen, die die
      API **heute** liefert, nicht die aus dem Code.

- [x] **Bilder-Quiz: ein Aussetzer beim Laden tötet die Karte nicht mehr** (Rückmeldung mit
      Screenshot nach dem CSP-Hotfix: *Vinca minor* zeigte »Bild konnte nicht geladen werden«,
      obwohl die Info-Karte dasselbe Foto lud; »die meisten anderen haben funktioniert«).
      **Befund:** Datei und Adresse sind in Ordnung (beide Wikimedia-Hosts antworten 200) – der
      Fehler war vorübergehend (Funkloch, Zeitüberschreitung, HTTP 429 am Thumbnail-Cluster;
      Mobilfunk teilt sich eine IP). Die Schwachstelle lag im Werkzeug: Das **Artikelbild**
      (`src:"wp"`) hat bei der ersten Begegnung nur **eine** Ansicht, und `img.onerror` lief ohne
      zweiten Versuch direkt in die Meldung – ein einziger Aussetzer = tote Karte (Commons-Treffer
      hatten bis zu sechs Ausweich-Ansichten, das Artikelbild keine). **Fix (`renderPhoto`):**
      (1) **Ausweich-Host** `hostAlt()` – jede Adresse zusätzlich über den anderen Wikimedia-Host
      (`thumb.` ↔ `upload.`, derselbe Pfad ohne `utm_`-Anhang; die alten Adressen bedient Wikimedia
      weiter), in `imgChain()` für alle Ansichten und in `lbChain()` der Großansicht (beide
      Werkzeuge). (2) **Zweite Runde** nach `phImgRetryMs` (1,5 s) mit Cache-Umgehung (`imgBust`,
      je Versuch eindeutig – ein fester Anhang lieferte im Test die alte Antwort aus dem
      Browser-Cache). (3) Scheitert auch die: `photoImgFailed()` **verwirft den gemerkten Treffer**
      (`photoForget` – eine umbenannte/gelöschte Datei darf nicht ewig im Speicher stehen) und
      schiebt die Karte **ans Ende der Runde** (`deferPhotoCard("imgDefer")`, eigener Zähler – der
      Such-Zähler `photoDefer` wird bei jeder erfolgreichen Suche genullt, mit ihm lief die
      Verschiebung endlos im Kreis; `img.onload` nullt `imgDefer`), dort wird sie frisch gesucht.
      (4) Geht das nicht mehr (letzte Karten): Meldung **mit Knöpfen** »Nochmal versuchen« ·
      »Andere Art zeigen« · »Ohne Bild weiter« (nur diese Karte als Auswahlfrage, `nextCard` stellt
      den Bilder-Modus wieder her) statt eines toten Endes. Test-Haken `__setImgRetryWait`,
      `__imgChain`, `__hostAlt`. `tests/learn.mjs` beantwortet die Bildabrufe selbst
      (Puppeteer-Request-Interception, kaputtes bzw. echtes GIF, immer HTTP 200 → keine
      Konsolenfehler) und prüft: Kette je Ansicht über beide Hosts, Runde 1 scheitert → Runde 2
      lädt (Reihenfolge thumb → upload → thumb+Umgehung, Karte bleibt), alles scheitert → ans
      Ende + neu gesucht + Toast, ganze Runde ohne Bild → Meldung mit drei Knöpfen, »Ohne Bild
      weiter« = eine Auswahlfrage im Bilder-Modus, »Nochmal versuchen« lädt. Die Lightbox-
      Ketten-Assertions auf vier Adressen (mit Ausweich-Host) gehoben.

- [x] **Rang = Punkte UND Lernstand + »Thema üben« im Herbarium** (zwei Rückmeldungen: »Man steigt
      arg schnell im Level – bin schon Prachtexemplar, hab aber erst 20 fix und ein leeres Herbarium«
      und »Kann man die Herbarium-Gruppen händisch ansteuern, z. B. nur Gräser lernen?«).
      **(1) Ränge:** Punkte messen Fleiß, nicht Können – mit Combo-Bonus waren 2500 P. in ein paar
      Tagen erreicht, während »sitzt« (Box 4, drei richtige Antworten über ≥ 11 Tage) bewusst langsam
      wächst. Jede Stufe hat jetzt zusätzlich eine **Bedingung am Lernstand** (`RANKS[i].g`):
      Sämling ≥ 10 Arten angefangen · Steckling ≥ 5 Arten sitzen · Jungpflanze ≥ 25 % · Prachtexemplar
      ≥ 60 % · Meistergärtner/in ≥ 90 % der Arten sitzen; die Stufen kommen **nur der Reihe nach**
      (`rankOf(xp, m)`, Schleife bricht an der ersten unerfüllten). Maßgeblich ist das **am weitesten
      gediehene Profil** (`masteryBest()` über alle `progress.<id>`-Speicher, andere Profile einmal
      gerechnet in `masteryCache`, `loadProgress` leert ihn) – der Rang ist global, der Lernstand je
      Profil; Profilwechsel senkt ihn nicht. `rankCheck()` ersetzt die Vor/Nach-Logik in `xpAdd` und
      läuft auch in `renderProgress` → ein Aufstieg **allein durch den Lernstand** (eine Art mehr
      sitzt) wird gefeiert; sinkt der Rang (neue Regel), folgt die Feier-Marke `o.r` still nach unten,
      damit der nächste Aufstieg wieder gefeiert wird. Anzeige: Chip-Tooltip, Popover-Zeilen (»ab
      150 P. · 10 Arten angefangen«) und der Fallback-Dialog nennen Bedingung, Lernstand (»5 von 54
      Arten sitzen«) und was zur nächsten Stufe fehlt (`gateNeed`: »noch 20 Arten müssen sitzen
      (25 %)«); der Mini-Balken zeigt die bindende Größe (`min(Punkte, Lernstand)`). Hilfe-Absatz
      angepasst. **Ehrlich:** Der Nutzer fällt damit von Prachtexemplar auf Steckling (20 sitzt von
      304 = 6,6 %; Jungpflanze braucht 76) – gewollt, der Rang soll zeigen, was man kann.
      **(2) Herbarium:** Jede Sammelkarte hat einen Knopf **»Thema üben«** (»Wiederholen« bei
      gemeisterten) → `learnTheme(t)` stellt das Lernstoff-Feld `#cat` auf `t:<Thema>` (dasselbe
      Feld wie Optionen · Lernstoff, per `change`-Ereignis – `refreshView` ist lokal in `wire()`),
      schließt das Modal und startet die geführte Lektion. Die Wahl bleibt sichtbar in der
      Optionen-Kopfzeile und dort umstellbar. Hilfe-Absatz »Herbarium · Thema üben« (nennt auch
      Optionen · Lernstoff mit Thema/Familie). `tests/learn.mjs`: Rang-Kette über die sechs
      Lernstände, Punkte binden weiter (2000 P. = Jungpflanze), Reihenfolge, `gateNeed`-Wortlaut,
      Chip/Dialog bei »Punkte reichen, Lernstand nicht«, bestes Profil zählt, Aufstieg nur durch
      Lernstand gefeiert, Absinken still; Herbarium-Knopf je Karte → Modal zu, Scope gesetzt,
      geführte Lektion nur mit dem Thema, Kopfzeile nennt es. XP-Test auf die Bedingungen gehoben
      (zehn angefangene Arten in einem Zweitprofil).

- [x] **»Ehrlich gesagt« – das Werkzeug ist eine Lernhilfe, kein Ersatz für die echte Pflanze** (Nutzerwunsch:
      beim Onboarding und in der Hilfe kurz, nett und verständlich sagen, dass man Pflanzen praktisch
      draußen an der echten Pflanze lernt und das Tool nur beim Wiederholen der botanischen Namen und
      beim einfachen Zugang zu ihnen unterstützt). Umgesetzt an drei Stellen: **Einführung** (`openIntro`,
      Kasten `.intro-real` mit Blatt-Icon direkt vor »Los geht's«: »Pflanzen lernt man draußen – mit
      Erde unter den Fingernägeln, nicht mit dem Daumen auf dem Display. Das ersetzt diese App nicht,
      und das will sie auch nicht …«), **Hilfe** (`.hreal` als erster Absatz unter »In vier Schritten«:
      »Was dieses Werkzeug ist – und was nicht … hier üben, draußen anschauen, wieder üben«), dazu
      **README** (Lern-Tool-Absatz) und ein Satz in `recht.html` (Datenquellen & Inhalte, vor dem
      Lernhilfen-Abschnitt). Kein Emoji, Strich-Icon wie überall. `tests/learn.mjs` prüft
      beide Stellen (Wortlaut »draußen«, »ersetzt … nicht«, »botanischen Namen«, Icon).

- [x] **Info-Karte: Gattungs-Notnagel mit Warnung statt Sackgasse** (Rückmeldung mit
      Screenshot: *Syringa x chinensis · Chinesischer Flieder* → »Kein deutscher Wikipedia-
      Artikel gefunden«; Wunsch: »stattdessen Flieder vorschlagen, aber mit Warnung«). Live
      geprüft: weder »Syringa x chinensis« noch »Syringa × chinensis«, »Syringa chinensis« oder
      »Chinesischer Flieder« haben einen Artikel; »Syringa« leitet auf »Flieder« weiter. Neu in
      **beiden** Werkzeugen (`wikiGenusCandidates`/`genusArticleOk`/`genusNote` in `learn.js`
      **und** `app.js`): Findet die bisherige Kette nichts, probiert `loadWiki` die **lateinische
      Gattung** (Weiterleitung auf den deutschen Gattungsartikel) und das **Grundwort des
      deutschen Namens** (»Chinesischer Flieder« → »Flieder«, »Hänge-Birke« → »Birke«).
      Angenommen wird nur ein **echter Gattungsartikel**: keine Begriffsklärung
      (`pageprops.disambiguation` – `wikiJSONP` fragt es jetzt mit ab, `wikiFirstPage` lehnt
      Begriffsklärungen für **alle** Kandidaten ab; Textmuster »steht für/bezeichnet/kann
      bedeuten« als Fallback), kein Fremdartikel (»Beta« = griechischer Buchstabe), kein
      Artartikel einer anderen Art (»Rosskastanie« → Gewöhnliche Rosskastanie), und der Artikel
      muss die Gattung nennen. Live-Stichprobe über zwölf Gattungen/Grundwörter (Iris, Rosa, Rose,
      Viola, Erica, Vinca, Dill, Lavendel = Begriffsklärung; Flieder, Birken, Hartriegel,
      Hemlocktannen, Weigelien, Amberbäume = Gattungsartikel). Der Treffer trägt den Hinweis
      (`.wp-taxon`) »**Kein eigener Wikipedia-Artikel** zu *Syringa x chinensis* – stattdessen
      der Artikel zur **Gattung** *Syringa* (Flieder). Text und Bild beschreiben die Gattung –
      nicht unbedingt diese Art.«; im **Lern-Tool** ersetzt – wie bei den Sorten – ein Foto
      **dieser Art** aus der Quiz-Bildsuche (`photoFor`; die Commons-Kategorie »Syringa ×
      chinensis« hat 18 Dateien) das Gattungsbild (»das Bild zeigt diese Art«, mit Nachweis).
      Scheitert auch die Gattung: »… auch nicht zur Gattung« (`WP_NONE`). Nebenbei probiert
      `wikiCandidates` Hybriden in **beiden Schreibweisen** (»x« ↔ »×«: de.wikipedia hat z. B.
      für *Elaeagnus x ebbingei* nur die x-Weiterleitung). Steckrüben-/Dill-Regel unverändert
      (Gattung erst **nach** der Elternart); reine Sammel-Einträge (»Solidago Cultivars«)
      führen die Gattung weiter ohne Hinweis in der Hauptliste. Hilfe beider Werkzeuge ergänzt.
      `tests/learn.mjs`: Abfrage-Reihenfolge (voller Name → × → Binom → deutscher Name →
      Gattung), Hinweis + Gattungsbild, Artfoto ersetzt Gattungsbild, Begriffsklärung → ehrlich
      »nicht gefunden« (Grundwort wurde noch probiert), `genusArticleOk` mit acht Fällen,
      Gattungs-Kandidatinnen getrennt von der Hauptliste; `tests/smoke.mjs`: dasselbe im
      Prüfungswerkzeug.

- [x] **Bilder-Quiz: Rang-Kürzel »sect.« – der Löwenzahn bekommt wieder ein Bild** (Rückmeldung
      mit Screenshots: *Taraxacum sect. Ruderalia* im Bilder-Quiz trotz mehrerer Versuche ohne
      Bild, die Info-Karte zeigt eine Köhler-Tafel; Frage: »liegt das an der Zeichnung?«).
      **Befund:** Die Tafel ist nur das erste Glied – sie wird zu Recht verworfen
      (`looksIllustration`: »Köhler«, »Medizinal«). Der eigentliche Grund: `binomEpithet` kannte
      das Rang-Kürzel **»sect.«** nicht (nur var./subsp./ssp./f./cv./convar.) und machte es zum
      »Art-Epitheton« – der Suchname wurde **»Taraxacum sect.«** (kein Artikel, keine Kategorie),
      und `fileMentionsOther` verwarf **jede** Datei der Commons-Kategorie »Taraxacum sect.
      Ruderalia« (157 Dateien) als »andere Art«, weil auf »Taraxacum« immer ein anderes Wort
      folgt (»officinale«, »sect«, »Ruderalia«). Betroffen: fünf Zeilen in vier Listen
      (*Taraxacum sect. Ruderalia* ×4, einmal als Quell-Tippfehler »sec.«; *Rubus sect. Rubus
      (fruticosus)*), dazu *Salix × pendulina nothof. tristis*, *Vitis vinifera supsp. vinvifera*
      (Quell-Tippfehler) und *Aquilegia vulgaris, A. Cultivars* (Komma blieb am Epitheton).
      **Fix** (beide Werkzeuge): `RANK_TOKEN` (zusätzlich sect./sec./nothof./supsp./subg./agg.),
      Komma/Semikolon am Epitheton gestrichen, **großgeschriebenes erstes Wort = Sektion/Gruppe,
      kein Epitheton** (`binomEpithet` → ""); neu `sectName()` und `taxonName()` = Name in der
      Form, die Wikipedia/Commons führen (Sektion »Taraxacum sect. Ruderalia«, Hybride mit
      **»×«** – die Commons-Kategorie »Syringa × chinensis« hat 18 Dateien, die mit Buchstaben-x
      keine). `photoSteps` sucht damit Artikel + Kategorie des **Taxons** (bei Hybriden
      zusätzlich das Binom ohne Zeichen; bei Sektionen bewusst **nicht** die Gattung allein –
      deren Artikelbild zeigt irgendeine Art, beim Löwenzahn *T. albidum*), Klammer-Epitheton
      als Zweitweg (»Rubus fruticosus« → Brombeeren); `commonsScore` zählt den Sektionsnamen wie
      ein Epitheton; `pageFitsCard` kommt mit Hybridgattungen klar (»× Hesperotropsis« steht im
      Artikel mit Leerzeichen); `looksDamage` kennt Missbildung/Fasziation (Realdatei
      »Missbildung Loewenzahn«). Deep-Links bei Sektionen auf die Gattung (NaturaDB/iNaturalist).
      Die Seeds bleiben unverändert (»sec.«, »supsp.« sind Quellform). Verifiziert gegen die
      echte Dateiliste der Kategorie (Live-API, 12 Dateien: Sektionsname gewinnt das Ranking,
      Rost-/Missbildungsfotos fliegen raus). `tests/learn.mjs`: Suchwege für Sektion/Hybride/
      Brombeere, Kette mit echter Dateiliste → »Taraxacum sect. Ruderalia 01.JPG«,
      `binomEpithet`-Fälle, Filter; `tests/smoke.mjs`: `taxonName`/`binomEpithet` im
      Prüfungswerkzeug.

- [x] **Geführte Lektion: »jetzt ohne Bild« heißt jetzt »am Namen statt am Bild« + Rest der
      Sammelwort-Lücke** (Rückmeldung »weiterhin Probleme beim Bilderquiz!« mit vier Screenshots).
      **Befund:** Drei Screenshots zeigen die Pille »Stufe 2 von 5 · jetzt ohne Bild« – das ist
      kein Ausfall, sondern der **gewollte** Schritt der geführten Lektion (`guidedForm`: Stufe
      0–1 Bild, Stufe 2 Auswahl ohne Bild, 3 Karteikarte, 4–5 Eingabe). Der Wortlaut las sich
      aber wie »Bild fehlt«. Der vierte Screenshot (vor dem Deploy von #155) zeigt *Lupinus
      cultivars* ohne Bild: Das Sammelwort steht in **sieben** Zeilen **kleingeschrieben**
      (»Hosta/Solidago/Tulipa/Lilium/Lupinus/Pyracantha cultivars«), und `binomEpithet` ließ
      Kleingeschriebenes als Epitheton durch – Suchname »Lupinus cultivars«, jede Lupinen-Datei
      als »andere Art« verworfen (dieselbe Mechanik wie beim Löwenzahn). **Fix:** `GROUP_TOKEN`
      in `binomEpithet` (beide Werkzeuge) – Sammelwörter sind unabhängig von der Schreibweise
      kein Epitheton; die Bildsuche läuft dann wie bei »Weigela Cultivars« über die Gattung
      (Artikel »Lupinen«, Commons-Kategorie). **Pille** (`GUIDED_WIE`/`guidedNoteHTML`):
      »jetzt am Namen statt am Bild«; war für die Karte ein Bild **geplant** (`sess.formOf`)
      und kommt sie trotzdem als Auswahlfrage, steht der echte Grund da (»kein brauchbares Bild
      gefunden – deshalb Auswahlfrage« bzw. »ohne Bild – auf deinen Wunsch« nach »Ohne Bilder
      weiterlernen«); der Tooltip nennt den ganzen Pfad mit »gewollt, kein Fehler« und den Weg
      zu durchgehenden Bildern (»Selbst wählen« → Bilder). Hilfe-Schritt 1 ebenso.
      `tests/learn.mjs`: vier Pillen-Varianten (Stufe 2, Bild, Ausfall, Wunsch), `binomEpithet
      ("cultivars")===""`, Suchwege für »Lupinus cultivars« auf Gattungsniveau.

- [x] **Synonyme der Liste in Bildsuche und Info-Karte + Ausfall ≠ »nicht gefunden«** (zwei
      Screenshots: Info-Karte zu *Lonicera nitida 'Elegant'* »Kein deutscher Wikipedia-Artikel
      gefunden – auch nicht zur Gattung«, und die geführte Lektion endete »ohne Bild – auf deinen
      Wunsch«, weil die Art kein Foto bekam). **Befund (Live-API):** Auf Commons ist die Kategorie
      »Lonicera nitida« **leer** (0 Dateien), die Fotos liegen unter dem akzeptierten Namen
      »Lonicera ligustrina var. yunnanensis« (6 Dateien) – **genau dem Synonym, das die
      Prüfungsliste in Feld 7 führt**; der Volltext »Lonicera nitida Elegant« liefert nur
      Buchscans (zu Recht verworfen). Die Bildsuche und die Wikipedia-Kette nutzten die Synonyme
      der Liste bisher gar nicht (383 Zeilen tragen welche: Mahonia→Berberis, Potentilla→Dasiphora,
      Mespilus→Crataegus, Lonicera pileata ↔ ligustrina var. pileata …). Und: »Lonicera« →
      »Heckenkirschen« existiert sehr wohl – die Karte sagte trotzdem »auch nicht zur Gattung«,
      weil `loadWiki` eine abgebrochene Anfrage (Zeitüberschreitung/Drosselung) wie »beantwortet,
      nichts gefunden« behandelte, sobald irgendeine frühere Anfrage geantwortet hatte, und das
      Ergebnis als `null` cachte. **Fix:** (1) `synCards(card)` (beide Werkzeuge) macht aus Feld 7
      Hilfskarten; `photoSteps` hängt je Synonym Artikel · Commons-Kategorie · Volltext **ans Ende**
      (bei Sorten/Varietäten nur, wenn `artLevelOk`); `fileMentionsOther` erlaubt Synonym-Epitheta
      (»ligustrina«, »yunnanensis« sind dieselbe Pflanze), `pageFitsCard` akzeptiert die
      Synonym-Gattung (»Mahonia« für *Berberis aquifolium*), `commonsScore` zählt das
      Synonym-Epitheton wie das eigene; `wikiCandidates` führt Synonyme nach den deutschen Namen
      (bei Unterarten **vor** der Elternart, bei Sammel-Einträgen vor der Gattung). (2) `loadWiki`
      zählt `antworten`/`fehler`: »nicht gefunden« nur, wenn **jede** Anfrage beantwortet wurde;
      sonst »Online-Infos konnten nicht geladen werden – 2 von 6 Anfragen an Wikipedia blieben
      ohne Antwort (offline, langsam oder gedrosselt)« mit **»Erneut versuchen«** und ohne
      `null`-Cache. (3) `apiOk`: eine **API-Fehlerantwort** (`{error:{code:"ratelimited"}}` –
      kommt per JSONP als normale Antwort an) gilt in `wikiJSONP`, `wikiArticleQuery`,
      `commonsQuery` und `fileMetaQuery` als Ausfall – im Bilder-Quiz damit »Warte auf die
      Bilder« statt »kein Bild«. `tests/learn.mjs`: Synonym-Wege am Ende, Löwenzahn-artige
      Kette mit **echter Commons-Lage** (leere Kategorie, Buchscan-Volltext, Synonym-Kategorie →
      Foto), Synonym-Epitheta/-Gattung, beschreibende Sorte ohne Synonym-Wege, API-Fehler =
      `network`; Info-Karte: abgebrochene Gattungs-Anfragen → Verbindungsproblem + Knopf, kein
      Cache; `ratelimited` ebenso; danach mit Verbindung → Heckenkirschen. `tests/smoke.mjs`:
      Synonym-Kandidatin + Ausfall-Zustand im Prüfungswerkzeug.

- [x] **Bilder-Quiz: lieber Zeichnung als gar kein Bild** (Rückmeldung zu *Perovskia abrotanoides*:
      die Art hat auf Wikimedia Commons **kein einziges Foto**, nur die Tafel der Erstbeschreibung von
      1841 – das Quiz blieb ohne Bild, die Info-Karte zeigte die Tafel; Antwort auf »Kann das stimmen?«:
      ja, Namen und Artikel sind richtig, die Fotos im Handel zeigen meist die Silber-Perowskie).
      Seit #139 wurden Zeichnungen/Tafeln/Herbarbelege im Quiz **hart verworfen** (»lieber kein Bild
      als eine Tafel mit aufgedrucktem Namen«); der Nutzer hat das umgekehrt. **Fotos gehen weiter
      immer vor** – an jeder Stelle der Kette. Neu: `pickCommons(d, card, artOut)` und der
      Wikipedia-Schritt in `wikiPhoto` **sammeln** Nicht-Fotos, die alle übrigen Prüfungen bestehen
      (Taxon passt, keine andere Art, kein Schadbild, `image/*`), statt sie zu verwerfen;
      `artKind(file, meta)` sortiert sie: **»zeichnung«** (Illustration, Tafel, Stich, Aquarell, Köhler,
      BHL/Internet-Archive-Tafeln) · **»herbar«** (Herbarbeleg) · **nichts** bei Karten, Diagrammen,
      Etiketten, Logos, Briefmarken, Buchscans/PDFs, Textseiten (`ART_NOPIC_RE` – die zeigen die Pflanze
      nicht; `usablePhoto` und der Mime-Filter bleiben davor). Liefert **kein** Weg ein Foto, gibt
      `bestArt()` den Notnagel: Zeichnung vor Beleg, **Artikelbild der Wikipedia** (von Menschen
      gewählt) vor Commons-Funden, dann Dateien, die die Art nennen; Dubletten über Synonym-Wege nur
      einmal (`metaMemo`: Metadaten je Datei einmal). Die übrigen werden zur Galerie. Treffer tragen
      `art:"zeichnung"|"herbar"`; `renderPhoto` kennzeichnet sie mit der Pille **»Zeichnung · kein Foto
      verfügbar«** (`.ph-kind`, Tooltip: aufgedruckter Name kann die Lösung verraten) und neutralem
      alt-Text. Brach ein feinerer Weg ab, gilt die Zeichnung nur für die Sitzung (`tmp`, wie bei
      Fotos). **Gemerkte Zeichnungen altern:** `photoFor` sucht nach 30 Tagen (`ART_TTL`, Feld `t`)
      erneut nach einem Foto – kommt die Suche nicht durch, bleibt die alte Zeichnung (kein Netzfehler
      nach außen). `photoMoreViews`/`prefetchPhoto` suchen bei Zeichnungen nicht nach, die
      Artikel-Galerie der Großansicht zeigt dann auch die übrigen Abbildungen. Info-Karte: der
      Sorten-/Gattungs-Hinweis nennt die Zeichnung als solche (»die Zeichnung zeigt diese Art (ein Foto
      gibt es auf Wikimedia Commons nicht)«). Hinweistext der Runde ohne Bild, Hilfe »Bilder« und README
      angepasst (»bevorzugt Fotos … ersatzweise Zeichnung, gekennzeichnet«). `tests/learn.mjs`:
      Realfall-Kette (Tafel per Metadaten, leere Kategorie, Volltext mit Tafel/anderer Art/PDF/Karte →
      Artikel-Tafel mit Nachweis, Galerie nur Zeichnungen), Foto auf späterem Weg schlägt frühere Tafel,
      Beleg nur ohne Zeichnung, Karte/PDF/andere Art → null, `tmp` bei Abbruch, Cache-Alterung mit
      Netzfehler-Rückfall, `artKind`-Fälle, Pille/alt/Nachweis in der Oberfläche.

## Offene Aufgaben (TODO)

- [ ] Fehlende oder fehlerhafte Einzelangaben aus den Quelllisten prüfen/berichtigen.
      **Stand:** ein Vollscan (2114 Arten) fand nur die inzwischen geschlossene
      Familien-Lücke zu *Chimonanthus praecox*; dazu kam der aus einer Rückmeldung bekannte
      Übertragungsfehler »Salvia abrotanoides · Bauernjasmin« (berichtigt, siehe Erledigt).
      Künftige Lücken über die `CORRECTIONS`-Tabelle, nachweislich falsche Felder über die
      `REPLACEMENTS`-Tabelle in `tools/fix_source_gaps.py` (nicht direkt im Seed – die CI
      lehnt Hand-Edits in `seeds/` ab). Jeder neue Eingriff gehört zusätzlich in die
      Offenlegung (`.learnnote`, Hilfe »Datenherkunft«, `recht.html#datenquellen`,
      `docs/technik-kurzbeschreibung.md`) und in die Tests (`tests/learn.mjs`, `tests/smoke.mjs`).
- [ ] Gemeinsamer Code beider Werkzeuge (Info-Karte, Lightbox, JSONP, Icons – ~40 identische
      Blöcke in `app.js`/`learn.js`) könnte beim Build aus einer Datei `src/shared.js` eingefügt
      werden. Bewusst zurückgestellt (Audit-Fund 41): Refactoring mit Regressionsrisiko, ohne
      Nutzen für Nutzer; bei der nächsten größeren Änderung an einem der Blöcke erwägen.
- [ ] Bei künftigen Listen-Updates: Excel nach `data/<profil-id>.<ext>` legen,
      `tools/rebuild_seeds.sh` (oder Konverter je Datei) laufen lassen, bauen,
      Offline-Check + Smoke-Test.
