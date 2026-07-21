# Pflanzenkenntnis — grüne Berufe

Zwei **eigenständige, vollständig offline lauffähige HTML-Werkzeuge** rund um die
Pflanzenkenntnis-Prüfung der grünen Berufe — für alle sieben Gärtner-Fachrichtungen
und die jeweiligen Fachwerker, aus **einer** gemeinsamen Pflanzendatenbank gebaut:

- **`pflanzenkenntnis.html` — Prüfungswerkzeug (für Prüfende).** Prüfungslisten
  ziehen, Prüfungsbogen und Musterlösung drucken, Noten rechnen, Prüfungen nach
  Datum speichern.
- **`pflanzen-lernen.html` — Lern-Tool (für Azubis).** Dieselben Pflanzenlisten
  zum Üben: Karteikarten mit Spaced-Repetition (Leitner), Multiple-Choice-Quiz und
  Tippen — **keine** Prüfungslisten-Erstellung, **kein** Notenschlüssel.

Eine gemeinsame **Startseite** (`index.html`) verzweigt zu beiden Werkzeugen
(**Lernen** / **Prüfen**); zusätzlich sind die beiden Tools direkt untereinander
verlinkt.

> Zuständige Stelle: Regierungspräsidium Freiburg · Abschlussprüfung Gärtner/in
> und Fachwerker/in.

Arbeitsanweisungen für die Weiterentwicklung mit Claude Code stehen in
[`CLAUDE.md`](./CLAUDE.md).

---

## Prüfungswerkzeug (`pflanzenkenntnis.html`)

- **Fachrichtung + Ausbildung wählen** (7 Fachrichtungen × Gärtner/in 20 Pflanzen
  / Fachwerker/in 15 Pflanzen = 14 Profile). Jedes Profil hat eigene Liste,
  eigenes Bewertungsschema und eigenen Notenschlüssel — getrennt im Browser
  gespeichert.
- **Hinterlegte Listen** (Seeds) — sofort einsatzbereit, ohne Datei zu laden.
- **Intelligenter Excel-Import** — erkennt Kopfzeile automatisch, trennt Gattung
  (erstes Wort) und Art (Rest inkl. `var.`/`ssp.`/Gruppen), übernimmt Familie,
  deutschen Namen, ZP-Kennzeichen und Kategorie-Überschriften.
- **Zufällig ziehen** (Profil-Anzahl als Vorgabe) oder manuell anhaken, Reihenfolge
  mischen.
- **Auswahl · Bogen-Vorschau (bearbeiten):** eine Extra-Ansicht der aktuellen
  Auswahl – Reihenfolge per ▲▼ (= Spaltenreihenfolge auf dem Bogen), Arten
  bearbeiten (öffnet die Art; Änderungen inkl. Bemerkungen und Synonyme werden in
  die Liste/DB übernommen), aus der Auswahl entfernen oder Arten (bestehend/neu)
  ergänzen.
- **Einstellungen:** Kopf des Bogens anpassbar – Titel, **zuständige Stelle**
  (zwei Zeilen) und der Vermerk auf der Musterlösung; damit auch andere zuständige
  Stellen als das RP Freiburg das Werkzeug nutzen können (geräteweit gespeichert).
- **Druck:** Prüfungsbogen (leer) und Musterlösung (gefüllt, mit Punktespalte).
  Spalten und Punkte richten sich nach dem Prüfungsschema des Profils.
- **Prüfungen speichern (nach Prüfungsdatum):** eine gezogene Liste als
  Momentaufnahme (samt Schema) unter einem Prüfungsdatum sichern – im Tool
  wieder **laden**, **kopieren** (z. B. für den nächsten Prüfungstag), nach dem
  Bearbeiten **aktualisieren**, erneut **drucken** (Bogen/Musterlösung) oder als
  **`.json` herunterladen**. Bleibt exakt reproduzierbar, auch wenn die
  Profil-Liste später geändert wird.
- **Prüfungsschema** einstellbar: welche Felder mit wie vielen Punkten (auch
  Nachkommastellen wie 0,5) bewertet werden, in **welcher Reihenfolge** (▲▼ –
  bestimmt die Spaltenfolge auf dem Bogen) und wie viele Pflanzen je Prüfung.
- **Notenrechner** mit **linearer BW-Skala** (Standard) oder IHK-Schlüssel;
  Notengrenzen editierbar; zeigt Note, Prozent, Dezimalnote und die Punktschwellen.
- **Browser-Speicher** (localStorage) je Profil, **Sicherung als `.json`**
  (enthält die Profilliste **sowie die gespeicherten Prüfungen und die
  Einstellungen** – »Sicherung laden« stellt alles wieder her),
  **Zurücksetzen** auf die hinterlegte Liste. In Kiosk-/Sandbox-Umgebungen ohne
  localStorage bleiben Änderungen wenigstens für die laufende Sitzung erhalten.
- **Hilfe & Tooltips:** eingebaute Kurzanleitung (Button »Hilfe«) mit Erklärung
  jeder Funktion; nahezu jede Schaltfläche und jedes Feld hat einen erklärenden
  Tooltip.
- **Barrierearm, druckoptimiert (A4)**, herbarium-nahe Gestaltung.

---

## Lern-Tool (`pflanzen-lernen.html`)

Für Auszubildende zum **Üben** derselben Pflanzenlisten — ohne Prüfungslisten-
Erstellung und ohne Noten. Fachrichtung und Ausbildung werden oben gewählt (dieselben
14 Profile und Listen wie im Prüfungswerkzeug); ein Link führt zur Prüfungsversion.

- **Drei Lernmodi:**
  - **Karteikarten** mit **Spaced-Repetition (Leitner-Boxen 1–5).** Karte umdrehen,
    dann selbst einschätzen: »Nochmal« (heute nochmal) · »Unsicher« (bald) · »Gewusst«
    (in einigen Tagen). Jede Bewertung plant die Karte sofort neu ein – Intervalle
    1/3/7/16/35 Tage, und **jeder Knopf zeigt an, wann die Karte wiederkommt**.
    »Nochmal« bringt sie zusätzlich in derselben Sitzung erneut; »sitzt« ab Box 4.
  - **Multiple-Choice-Quiz** – eine richtige Antwort unter plausiblen Ablenkern
    (bevorzugt aus derselben Kategorie bzw. Familie).
  - **Tippen** – Antwort selbst eingeben; tippfehlertolerant (kleine Abweichungen
    zählen als richtig), Gattung/Art bzw. Synonyme werden getrennt geprüft.
- **Liste / Nachschlagen:** ein vierter Tab zeigt **alle** Arten des Profils nach
  Kategorie gruppiert (wie im Prüfungswerkzeug) und **durchsuchbar** (Name, Familie,
  Synonym; akzent-tolerant). Ein Klick auf eine Art öffnet direkt das Info-Modal
  (Quellen-Links + optionale Online-Infos).
- **Abfragerichtung wählbar:** Deutsch → Botanisch, Botanisch → Deutsch oder
  Art → Familie.
- **Lernstoff eingrenzen:** nach Kategorie und optional nur **ZP-relevante** Arten;
  Sitzungslänge einstellbar.
- **Fortschritt bleibt erhalten** (localStorage, je Profil getrennt, Namensraum
  `pflanzenlernen.`) – die Leitner-Boxen und Fälligkeiten überleben das Schließen.
- **Mehr zur Pflanze (ℹ):** Zu jeder Art öffnet ein Info-Modal kuratierte Links zu
  deutschsprachigen Pflanzenquellen (Wikipedia, NaturaDB, Baumkunde, Gaißmayer,
  iNaturalist – passend zur Fachrichtung; öffnen in neuem Tab, also offline-rein).
  **Wikipedia** sucht **fein** (voller Name inkl. Sorte/Unterart – Wikipedia löst das
  sauber auf); die **anderen** Quellen suchen **grob** mit dem reinen Binom (Gattung +
  Art), weil sie bei zu feiner Suche oft nichts finden (mehrere Treffer sind dort ok).
  Optional holt »Online-Infos laden« per Wikipedia einen deutschen Kurztext samt
  Vorschaubild direkt ins Modal (nur online; funktioniert auch als lokale Datei, da
  ohne CORS-Umweg geladen wird; Quelle CC BY-SA).
- Gleiche Leitplanken: **vollständig offline** (der Lernkern braucht **nie** Internet;
  nur die optionalen »Online-Infos« oben sind eine bewusste, opt-in Ausnahme), kein
  CDN, kein Framework, deutschsprachig, mobiltauglich. Baut **ohne** SheetJS (kein
  Excel-Import nötig) und ist dadurch deutlich kleiner.

---

## Nutzung

**Online:** Nach jedem Merge veröffentlicht die `pages`-Action den aktuellen Stand
automatisch auf **GitHub Pages** → <https://hannespix.github.io/pflanzenbestimmung/>
(einmalig in den Repo-Einstellungen unter *Pages* die Quelle *GitHub Actions*
aktivieren). Die **Startseite** dort verzweigt zu *Lernen* und *Prüfen*; die
Werkzeuge liegen unter `…/pflanzenkenntnis.html` und `…/pflanzen-lernen.html` und
sind zusätzlich direkt untereinander verlinkt.

**Offline:** `index.html` (Startseite), `pflanzenkenntnis.html` (Prüfende) bzw.
`pflanzen-lernen.html` (Azubis) aus dem Repo-Root im Browser öffnen (Doppelklick
genügt — die Dateien sind eigenständig und benötigen kein Internet; für die
Verzweigung der Startseite müssen alle drei im selben Ordner liegen). Identisch
gebaut liegen sie auch unter `dist/`. Änderungen bzw. Lernfortschritt bleiben im
Browser gespeichert.

## Build

```bash
python3 build.py                                   # erzeugt dist/ + Root-Verteilkopien (Startseite + beide Tools)
python3 tools/check_offline.py dist/index.html             # prüft: keine externen Ressourcen
python3 tools/check_offline.py dist/pflanzenkenntnis.html
python3 tools/check_offline.py dist/pflanzen-lernen.html
node tests/start.mjs                               # Puppeteer-Smoke Startseite (Verzweigung)
node tests/smoke.mjs                               # Puppeteer-Smoke Prüfungswerkzeug
node tests/learn.mjs                               # Puppeteer-Smoke Lern-Tool
```

Neue/aktualisierte Fachrichtungsliste einbauen:

```bash
node tools/xlsx_to_seed.mjs data/<datei>.xlsx <profil-id>   # eine Liste
bash tools/rebuild_seeds.sh                                 # oder alle auf einmal
python3 build.py
```

---

## Repo-Struktur

```
├─ CLAUDE.md                 Arbeitsanweisungen für Claude Code
├─ README.md
├─ build.py                  Template + Logik + Seeds (+ SheetJS)  →  dist/ + Root-Kopien
├─ index.html                Verteilkopie Startseite (versioniert)
├─ pflanzenkenntnis.html     Verteilkopie Prüfungswerkzeug (versioniert)
├─ pflanzen-lernen.html      Verteilkopie Lern-Tool (versioniert)
├─ src/
│  ├─ start.html             HTML der Startseite (Verzweigung Lernen/Prüfen)
│  ├─ template.html          HTML-Gerüst Prüfungswerkzeug (CSS, Platzhalter)
│  ├─ app.js                 gesamte Logik Prüfungswerkzeug (Vanilla JS)
│  ├─ learn.html             HTML-Gerüst Lern-Tool (CSS, Platzhalter)
│  └─ learn.js               gesamte Logik Lern-Tool (Vanilla JS)
├─ seeds/
│  └─ <profil-id>.json       Pflanzenliste je Profil (14 Dateien, Name = Profil-ID)
├─ lib/
│  └─ xlsx.full.min.js       SheetJS (nur im Prüfungswerkzeug inline, kein CDN)
├─ tools/
│  ├─ xlsx_to_seed.mjs       Excel → seeds/<id>.json
│  ├─ rebuild_seeds.sh       alle Seeds aus data/<id>.<ext> neu erzeugen
│  └─ check_offline.py       CI-Check: keine externen Ressourcen (Datei als Argument)
├─ tests/
│  ├─ start.mjs              Puppeteer-Smoke Startseite (Verzweigung) gegen dist/
│  ├─ smoke.mjs              Puppeteer-Smoke Prüfungswerkzeug gegen dist/ (file://)
│  └─ learn.mjs              Puppeteer-Smoke Lern-Tool gegen dist/ (file://)
├─ data/                     Quell-Excel je Profil (data/<profil-id>.<ext>)
└─ dist/                     Build-Ergebnis (nicht versioniert)
```

Die Dateien **`index.html`** (Startseite), **`pflanzenkenntnis.html`** und
**`pflanzen-lernen.html`** im Repo-Root sind die fertigen Offline-Dateien zum
direkten Herunterladen und Öffnen. `build.py` schreibt sie bei jedem Build
byte-identisch zu den Kopien in `dist/` mit (alle aus derselben
Pflanzendatenbank).

---

## Stand

**Alle 14 Profile sind mit hinterlegten Listen bestückt** (2114 Arten gesamt,
820 ZP-relevant). Standardschema 3/3/1/3 (Gärtner 20 / Fachwerker 15 Pflanzen),
lineare BW-Skala; Abweichungen sind pro Profil im Tool einstellbar.

| Fachrichtung | Gärtner/in | Fachwerker/in |
|---|---:|---:|
| Baumschule | 248 | 80 |
| Friedhofsgärtnerei | 251 | 80 |
| Garten- und Landschaftsbau | 304 | 80 |
| Gemüsebau | 148 | 80 |
| Obstbau | 79 | 54 |
| Staudengärtnerei | 248 | 128 |
| Zierpflanzenbau | 254 | 80 |

**Bewertungsschemata** (Vorgabe der zuständigen Stelle, hart hinterlegt):

- **Fachwerker/in – alle sieben Fachrichtungen:** Deutscher Name 3, Gattung 0,5,
  Art 0,5 = 4 P./Pflanze · 15 Pflanzen = **60 Punkte**; Deutscher Name zuerst.
- **Gärtner/in Garten- und Landschaftsbau:** Gattung 1, Art 1, Deutscher Name 2
  = 4 P./Pflanze · 20 Pflanzen = **80 Punkte**.
- **Gärtner/in Produktionsfachrichtungen** (Baumschule, Friedhofsgärtnerei,
  Gemüsebau, Obstbau, Staudengärtnerei, Zierpflanzenbau): Gattung 3, Art 3,
  Familie 1, Deutscher Name 3 = 10 P./Pflanze · 20 Pflanzen = **200 Punkte**
  (Standardschema).

Alle mit linearer BW-Skala; im Tool pro Profil weiter anpassbar.

Roadmap siehe TODO-Liste in [`CLAUDE.md`](./CLAUDE.md).

---

## Entstehung (Zusammenfassung der Entwicklung)

Das Tool ist iterativ entstanden; die Architektur hat sich dabei bewusst vereinfacht:

1. **Erste Fassung:** einzelne HTML-Datei mit **SQLite via WASM (sql.js)** und
   Datei­zugriff aus dem Browser; intelligenter Excel-Import; 20 Pflanzen zufällig
   ziehen; Druckbogen mit Gattung (3), Art (3), Familie (1), Deutscher Name (3).
2. **Notenschlüssel + Rechner** ergänzt: Punkte → Note, inkl. Punktschwellen und
   Druck-Schlüsselzeile.
3. **Umstellung auf die lineare BW-Skala:** ausgelöst durch die Rechtsprechung des
   VGH Baden-Württemberg (gleichmäßige Punkt-Noten-Zuordnung). Der ungleichmäßige
   IHK-Schlüssel bleibt als Umschaltoption inkl. offizieller Dezimaltabelle.
4. **Listen hartkodiert** und Ergänzungen in den **Browser-Speicher** verlagert
   (zuerst IndexedDB), damit das Tool ohne externe Datei sofort läuft.
5. **SQLite entfernt:** für ein Array von Datensätzen war eine Datenbank-Engine
   überdimensioniert. Seither reines JS-Array, Persistenz per `localStorage`,
   Backup als `.json`. Dateigröße dadurch von ~1,8 MB auf ~0,9 MB (im Wesentlichen
   nur noch SheetJS).
6. **Generalisierung auf Profile:** Auswahl von Fachrichtung und Ausbildung oben,
   je Profil eigene Liste, eigene Bewertungsspalten samt Punkten, eigene
   Pflanzenanzahl (20/15) und eigener Notenschlüssel. Fachwerker als eigene
   Profile mit 15 Pflanzen.

Leitplanken über alle Schritte: **offline, kein CDN, kein Framework, deutschsprachig,
druckbar** — passend zur Zero-Trust-Umgebung der Verwaltung.
