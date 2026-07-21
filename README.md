# Pflanzenkenntnis — Prüfungslisten (grüne Berufe)

Ein **einzelnes, vollständig offline lauffähiges HTML-Werkzeug** für die
Pflanzenkenntnis-Prüfung der grünen Berufe: Prüfungslisten ziehen, Prüfungsbogen
und Musterlösung drucken, Noten rechnen — für alle sieben Gärtner-Fachrichtungen
und die jeweiligen Fachwerker.

> Zuständige Stelle: Regierungspräsidium Freiburg · Abschlussprüfung Gärtner/in
> und Fachwerker/in.

Arbeitsanweisungen für die Weiterentwicklung mit Claude Code stehen in
[`CLAUDE.md`](./CLAUDE.md).

---

## Funktionen

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
- **Barrierearm, druckoptimiert (A4)**, herbarium-nahe Gestaltung.

---

## Nutzung

`pflanzenkenntnis.html` (Repo-Root) im Browser öffnen (Doppelklick genügt — die
Datei ist eigenständig und benötigt kein Internet). Identisch gebaut liegt sie auch
unter `dist/pflanzenkenntnis.html`. Änderungen bleiben im Browser gespeichert.

## Build

```bash
python3 build.py                 # erzeugt dist/ + Root-Verteilkopie
python3 tools/check_offline.py   # prüft: keine externen Ressourcen
node tests/smoke.mjs             # Puppeteer-Smoke-Test (optional, empfohlen)
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
├─ build.py                  Template + Logik + Seeds + SheetJS  →  dist/ + Root-Kopie
├─ pflanzenkenntnis.html     Verteilkopie (versioniert, direkt herunterladbar)
├─ src/
│  ├─ template.html          HTML-Gerüst, CSS, Platzhalter
│  └─ app.js                 gesamte Logik (Vanilla JS)
├─ seeds/
│  └─ <profil-id>.json       Pflanzenliste je Profil (14 Dateien, Name = Profil-ID)
├─ lib/
│  └─ xlsx.full.min.js       SheetJS (inline eingebettet, kein CDN)
├─ tools/
│  ├─ xlsx_to_seed.mjs       Excel → seeds/<id>.json
│  ├─ rebuild_seeds.sh       alle Seeds aus data/<id>.<ext> neu erzeugen
│  └─ check_offline.py       CI-Check: keine externen Ressourcen
├─ tests/
│  └─ smoke.mjs              Puppeteer-Smoke-Test gegen dist/ (file://)
├─ data/                     Quell-Excel je Profil (data/<profil-id>.<ext>)
└─ dist/                     Build-Ergebnis (nicht versioniert)
```

Die Datei **`pflanzenkenntnis.html`** im Repo-Root ist die fertige Offline-Datei
zum direkten Herunterladen und Öffnen. `build.py` schreibt sie bei jedem Build
byte-identisch zu `dist/pflanzenkenntnis.html` mit.

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

**Hart hinterlegte Schema-Abweichungen** (Vorgabe der zuständigen Stelle):

- Garten- und Landschaftsbau · **Gärtner/in**: Gattung 1, Art 1, Deutscher Name 2
  = 80 Punkte bei 20 Pflanzen.
- Garten- und Landschaftsbau · **Fachwerker/in**: Deutscher Name 3, Gattung 0,5,
  Art 0,5 = 60 Punkte bei 15 Pflanzen; Deutscher Name als erste Spalte.

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
