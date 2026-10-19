# Pflanze-BW — Technische Kurzbeschreibung

Stand: 19.10.2026 · Kontakt: Hannes Pix, pflanzenbestimmung@pix-el.de · https://pflanze-bw.de

## 1. Was es ist

Ein Lernwerkzeug für die **Pflanzenkenntnis-Prüfung der Gärtnerberufe** (Abschlussprüfung
Gärtner/in und Gartenbaufachwerker/in, alle sieben Fachrichtungen). Datenbasis sind die
amtlichen Prüfungslisten: **2114 Arten in 14 Profilen** (7 Fachrichtungen × 2 Niveaus).

Es besteht aus zwei getrennten Anwendungen:

| Anwendung | Adresse | Zielgruppe |
|---|---|---|
| **Lernanwendung** | `pflanze-bw.de` | Auszubildende |
| Prüfungswerkzeug | `pflanze-bw.de/pruefung` | Prüfende der RPen |

Die Lernanwendung ist bewusst eine **Sackgasse**: Sie verlinkt an keiner Stelle auf das
Prüfungswerkzeug — der einzige interne Verweis führt auf Impressum/Datenschutz.

## 2. Bauart

- **Statische Dateien, kein Server.** Jede Anwendung ist **eine einzige HTML-Datei**, die
  Programm, Gestaltung und Pflanzendaten vollständig enthält: Lernanwendung 619 KB,
  Prüfungswerkzeug 1316 KB, Rechtliches 23 KB.
- **Kein Backend, keine Datenbank, keine Anmeldung, keine Nutzerkonten.** Alles rechnet im
  Browser. Es gibt keinen Serverprozess, der betrieben, aktualisiert oder abgesichert werden
  müsste — ein beliebiger Webserver, der Dateien ausliefert, genügt.
- **Kein Framework, keine Nachlade-Dienste (CDN).** HTML, CSS und JavaScript ohne React,
  Vue o. ä. Einzige eingebettete Fremdbibliothek: SheetJS für den Excel-Import, nur im
  Prüfungswerkzeug.
- **Installierbar und offline nutzbar** (PWA): Nach dem ersten Aufruf funktioniert die
  Anwendung ohne Internet und lässt sich auf dem Startbildschirm ablegen.
- **Automatisierte Prüfungen** bei jeder Änderung: Ein Testlauf verweigert die
  Veröffentlichung, sobald eine Seite eine externe Ressource nachladen würde; dazu kommen
  Funktionstests beider Anwendungen in einem echten Browser.

## 3. Datenschutz

- **Es werden keine personenbezogenen Daten verarbeitet.** Keine Anmeldung, keine
  Benutzerkennung, keine Serverprotokollierung durch die Anwendung selbst.
- **Keine Cookies, kein Tracking, keine Analysedienste** (im Quelltext nachprüfbar nicht
  vorhanden).
- **Lernfortschritt bleibt auf dem Gerät** (`localStorage` des Browsers) und wird nirgendwo
  übertragen.
- **Zwei bewusste, freiwillige Online-Funktionen** — beide laden **nichts beim Seitenaufbau**,
  sondern erst auf ausdrücklichen Knopfdruck:
  1. „Online-Infos laden" — deutscher Wikipedia-Kurztext und Bild in der Info-Karte.
  2. Lernmodus „Bilder" — Pflanzenfotos von Wikipedia/Wikimedia Commons.
  Dabei wird die IP-Adresse an die Wikimedia Foundation übermittelt; die Datenschutzseite
  weist das aus. **Beide Funktionen sind abschaltbar**, falls das IT-Referat eine Fassung
  ohne jede Außenverbindung wünscht — der Kern (Karteikarten, Quiz, Tippen, Listen,
  Prüfungsbogen, Notenberechnung) funktioniert vollständig ohne Netz.
- **Impressum (§ 5 DDG) und Datenschutzerklärung** sind vorhanden und aus beiden
  Anwendungen verlinkt.

## 4. Barrierefreiheit

Durchgängig berücksichtigt und mit automatisierten Messungen abgesichert: vollständige
Tastaturbedienung, Ansagen für Screenreader (`aria-live`, Fokusführung in Dialogen),
Bedienflächen ≥ 44 px auf Touchgeräten, Textkontraste ≥ 4,5:1, Rücksicht auf
„Bewegung reduzieren" und ein Dunkelmodus. Eine **formale BITV-2.0-Prüfung durch eine
Prüfstelle steht aus** — die Anwendung ist an den Kriterien ausgerichtet, aber nicht
zertifiziert.

## 5. Betrieb — drei Möglichkeiten

1. **Verlinken** (kein Aufwand für das Land): Der Infodienst verweist auf `pflanze-bw.de`.
   Betrieb bleibt wie bisher privat beim Autor; Hosting: webgo GmbH, Hamburg, mit
   Auftragsverarbeitungsvertrag nach Art. 28 DSGVO.
2. **Selbst ausliefern** (geringer Aufwand): Die fertigen Dateien werden in ein Verzeichnis
   des Landes kopiert. Kein Serverprozess, keine Datenbank, keine Laufzeitumgebung, keine
   Lizenzkosten. Eine Aktualisierung ist ein Dateiaustausch.
3. **Nur die Lernanwendung ausliefern:** Es genügt, die Datei des Prüfungswerkzeugs
   wegzulassen — es ist bereits eine eigene Datei unter eigener Adresse, auf die die
   Lernanwendung nirgends verweist. Dafür ist **keine Programmänderung nötig.**

## 6. Pflege und Aktualisierung

**Wenn sich eine amtliche Liste ändert.** Die Original-Excel-Dateien aller vierzehn Listen liegen
im Projekt und sind die alleinige Datenquelle; die Anwendung führt keine davon abweichende
Zweitfassung. Eine Aktualisierung besteht aus drei Schritten: die neue Excel-Datei unter dem Namen
des betreffenden Profils ablegen, ein Skript starten (es liest alle Listen neu ein, trennt Gattung
und Art und ordnet die Lerngruppen zu) und die automatischen Prüfungen abwarten. Die
Veröffentlichung läuft anschließend selbsttätig. Der Vorgang wurde zuletzt am 19. Oktober 2026 über
alle vierzehn Listen durchgespielt; er dauert Minuten, und es werden keine Einzeldatensätze von
Hand nachgeführt. Eine automatische Prüfung erzeugt den Datenbestand bei jeder Änderung neu aus den
Original-Dateien und schlägt fehl, sobald er auch nur in einem Zeichen von dem abweicht, was
veröffentlicht wird; die Veröffentlichung unterbleibt dann. Eine unbemerkte Abweichung von den hinterlegten Original-Dateien ist damit
ausgeschlossen; dass diese dem aktuellen amtlichen Stand entsprechen, sichert der Meldeweg.

**Meldeweg.** Vorschlag: Die zuständige Stelle übersendet die geänderte Liste als Excel-Datei an
eine feste Adresse und erhält eine Rückmeldung, sobald die Umstellung erfolgt ist. Eine verbindliche
Frist ist bislang nicht vereinbart und lässt sich festlegen.

**Zuständigkeit und Fortführung.** Entwicklung und Pflege liegen derzeit allein beim Autor, ohne
Vertragsverhältnis zum Land. Das ist der größte Risikopunkt des Vorhabens und soll hier nicht
beschönigt werden. Drei Wege sind denkbar:

1. **Fortführung wie bisher** — schnell und unbürokratisch, aber an eine Person gebunden.
2. **Zweite Person einarbeiten** — das Land benennt jemanden, der den Aktualisierungsvorgang
   mitbeherrscht. Der Vorgang ist dokumentiert; eingearbeitet dauert er etwa eine Stunde.
3. **Vollständige Übergabe** — Quelltext und Datenbestand gehen an das Land, das die Pflege selbst
   übernimmt.

Für alle drei Wege gilt: Der Quelltext liegt in einer Versionsverwaltung, jeder Schritt ist
nachvollziehbar dokumentiert, und die automatischen Prüfungen fangen Fehler vor der
Veröffentlichung ab. Eine Nachfolge beginnt also nicht bei null.

## 7. Datenherkunft und Sorgfalt

**Pflanzennamen: unverändert aus den amtlichen Prüfungslisten.** Botanischer Name (Gattung, Art),
Familie, deutscher Name, Synonyme, ZP-Kennzeichnung und – soweit vorhanden – Kategorie werden aus
den Excel-Dateien übernommen. Angepasst wird nur die Form: das Hybrid-Zeichen, Abstände und die
Aufteilung des botanischen Namens in Gattung und Art. Drei Eingriffe sind offengelegt und als
Skripte nachvollziehbar: eine in der Quellliste leere Familie wurde ergänzt (*Chimonanthus
praecox*: Calycanthaceae), zehn Listen ohne eigene Kategorie erhalten eine Wuchsform-Zuordnung,
und eine Kategorie, die in vier Listen unterschiedlich heißt, trägt einheitlich den Namen
»Wild- & Beikräuter« (welche Arten dazugehören, bleibt unverändert).

**Lernhilfen: automatisch erzeugt, teils mithilfe generativer KI.** Themenzuordnung, botanische
Namensherleitung, Familien-Steckbriefe und die Auswahl der Bilder im Bilder-Quiz (Fotos, selten
historische Pflanzentafeln von Wikimedia Commons – nicht KI-erzeugt) stammen nicht aus den
Prüfungslisten. Die Anwendung kennzeichnet diese
Trennung dort, wo die Namen gelesen werden – im Hinweis vor den Lektionen, an der Artenliste, in
der Info-Karte jeder Pflanze und auf der gedruckten Lernliste. Prüfungsbogen, Musterlösung und
Notenberechnung enthalten keine automatisch erzeugten Inhalte. **Verbindlich sind allein die
amtlichen Prüfungslisten.** Für Richtigkeit und Vollständigkeit wird keine Gewähr übernommen.

Der Quelltext liegt in einem Versionsverwaltungssystem; jede Änderung ist nachvollziehbar
und kann bei Bedarf offengelegt werden.
