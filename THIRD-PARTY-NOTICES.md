# Hinweise zu Drittmaterial

Der eigene Code dieses Projekts steht unter der **GNU General Public License, Version 3 oder
später** (`LICENSE`, Copyright © 2026 Hannes Pix). Folgendes Material ist **nicht** davon
erfasst und behält seine eigenen Bedingungen:

## SheetJS Community Edition 0.18.5 — `lib/xlsx.full.min.js`

Copyright (C) 2013-present SheetJS LLC · https://sheetjs.com · Lizenz: **Apache License 2.0**
(Text: `lib/LICENSE.Apache-2.0.txt`). Wird nur im Prüfungswerkzeug für den Excel-Import inline
eingebettet; die Kopfzeile mit dem Copyright-Hinweis bleibt dabei erhalten. Die Datei enthält
außerdem `cptable` (Codepage-Tabellen, derselbe Urheber, dieselbe Lizenz). Die Apache-Lizenz ist
mit der GPL 3 vereinbar.

## Amtliche Prüfungslisten und Leerbögen — `data/`, `seeds/`, `data/leerboegen/`

Die Pflanzenlisten der Abschlussprüfung Gärtner/in und Fachwerker/in (Regierungspräsidien
Baden-Württemberg; Excel-Quellen in `data/`, daraus reproduzierbar erzeugte `seeds/`) und die
Leerbogen-Formulare (`data/leerboegen/*.docx`) sind Material der zuständigen Stelle. Sie werden
hier als Grundlage des Lernwerkzeugs genutzt, die Namen bleiben unverändert (die wenigen
dokumentierten Berichtigungen stehen in `docs/quelllisten-fehlermeldung.md`). Dieses Projekt
stellt sie **nicht** unter die GPL; wer sie weiterverwendet, hält sich an das, was die zuständige
Stelle erlaubt.

## Inhalte zur Laufzeit (nicht im Repository)

Wikipedia-Kurztexte (CC BY-SA 4.0), Bilder von Wikimedia Commons (Lizenz je Datei) und
iNaturalist-Beobachtungsfotos (nur freie Lizenzen) lädt das Lern-Tool erst auf Wunsch der
Nutzer in deren Browser; Urheber und Lizenz werden dort am Bild bzw. Text angezeigt.

## Entwicklungsabhängigkeiten (nicht ausgeliefert)

`puppeteer-core` (Apache-2.0) wird nur für die Tests gebraucht und ist nicht Teil der
ausgelieferten Seiten.
