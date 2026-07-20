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

```
seeds/*.json  ─┐
src/app.js    ─┼─► build.py ─► dist/pflanzenkenntnis.html  (eine Offline-Datei)
src/template.html ┘            (Template + Logik + Seeds + SheetJS inline)
lib/xlsx.full.min.js ─┘
```

- **`src/template.html`** — HTML-Gerüst, gesamtes CSS und die Platzhalter
  `/*__XLSX_JS__*/`, `/*__APP_JS__*/`, `/*__SEEDS__*/{}`.
- **`src/app.js`** — die komplette Logik (Vanilla JS, IIFE `boot()` am Ende).
- **`seeds/<profil-id>.json`** — eine Pflanzenliste je Profil. Dateiname = Profil-ID.
  `build.py` sammelt automatisch **alle** Dateien aus `seeds/` in das globale
  Objekt `SEEDS = { "<profil-id>": [ [gattung, art, familie, dt_name, kategorie, zp, synonyme], … ] }`.
- **`build.py`** — fügt alles zusammen und schreibt `dist/pflanzenkenntnis.html`.

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
python3 build.py                       # -> dist/pflanzenkenntnis.html
python3 tools/check_offline.py         # Offline-Check (muss grün sein)
```

Node (nur für den Konverter):

```bash
node tools/xlsx_to_seed.mjs <excel> <profil-id> [--sheet "Blattname"]
```

**Funktionstests** laufen mit Puppeteer gegen die gebaute Datei (`file://`).
Ein neuer Test soll mindestens prüfen: Boot ohne Konsolenfehler, korrekte
Zeilenzahl, Profilwechsel, `localStorage`-Persistenz über einen Reload, Ziehen
und Aufbau des Druckbogens. Beispielmuster:

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

## Offene Aufgaben (TODO)

- [ ] Seeds für die restlichen 13 Profile ergänzen, sobald die Excel-Listen
      vorliegen (Konverter → `seeds/<id>.json` → Build).
- [ ] Je Fachrichtung prüfen, ob Bewertungsspalten/Punkte/Anzahl vom Gemüsebau-
      Standard abweichen; ggf. Schema-Override hinterlegen.
- [ ] Optional: automatischer Puppeteer-Smoke-Test in CI (`.github/workflows`).
- [ ] Optional: kleines `localStorage`-Ausfall-Fallback (Kiosk-/Sandbox-Profile),
      damit Änderungen zumindest pro Sitzung erhalten bleiben.
