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
- **Druck:** Prüfungsbogen (leer) und Musterlösung (gefüllt, mit Punktespalte).
  Spalten und Punkte richten sich nach dem Prüfungsschema des Profils.
- **Prüfungsschema** einstellbar: welche Felder mit wie vielen Punkten bewertet
  werden und wie viele Pflanzen je Prüfung.
- **Notenrechner** mit **linearer BW-Skala** (Standard) oder IHK-Schlüssel;
  Notengrenzen editierbar; zeigt Note, Prozent, Dezimalnote und die Punktschwellen.
- **Browser-Speicher** (localStorage) je Profil, **Backup als `.json`**,
  **Zurücksetzen** auf die hinterlegte Liste.
- **Barrierearm, druckoptimiert (A4)**, herbarium-nahe Gestaltung.

---

## Nutzung

`dist/pflanzenkenntnis.html` im Browser öffnen (Doppelklick genügt — die Datei ist
eigenständig und benötigt kein Internet). Änderungen bleiben im Browser gespeichert.

## Build

```bash
python3 build.py                 # erzeugt dist/pflanzenkenntnis.html
python3 tools/check_offline.py   # prüft: keine externen Ressourcen
```

Neue Fachrichtungsliste einbauen:

```bash
node tools/xlsx_to_seed.mjs data/<datei>.xlsx <profil-id>
python3 build.py
```

---

## Repo-Struktur

```
├─ CLAUDE.md                 Arbeitsanweisungen für Claude Code
├─ README.md
├─ build.py                  Template + Logik + Seeds + SheetJS  →  dist/
├─ src/
│  ├─ template.html          HTML-Gerüst, CSS, Platzhalter
│  └─ app.js                 gesamte Logik (Vanilla JS)
├─ seeds/
│  └─ gemuesebau_gaertner.json   Pflanzenliste je Profil (Name = Profil-ID)
├─ lib/
│  └─ xlsx.full.min.js       SheetJS (inline eingebettet, kein CDN)
├─ tools/
│  ├─ xlsx_to_seed.mjs       Excel → seeds/<id>.json
│  └─ check_offline.py       CI-Check: keine externen Ressourcen
├─ data/                     Quell-Excel (Eingangsdateien)
└─ dist/                     Build-Ergebnis (nicht versioniert)
```

---

## Stand

- **Vollständig:** Gemüsebau · Gärtner/in (148 Arten, Bewertung 3/3/1/3, 20 Pflanzen,
  lineare BW-Skala).
- **Vorbereitet, aber ohne Liste:** die übrigen 13 Profile (auswählbar, per Excel
  importierbar; Standardschema 3/3/1/3, Gärtner 20 / Fachwerker 15).

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
