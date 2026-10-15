# Pflanze-BW — Technische Kurzbeschreibung

Stand: 15.10.2026 · Kontakt: Hannes Pix, pflanzenbestimmung@pix-el.de · https://pflanze-bw.de

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

## 6. Hinweise zur Sorgfalt

Lerninhalte wie Themenzuordnung, Bildauswahl, botanische Namensherleitung und
Familien-Steckbriefe werden automatisiert, teils mithilfe generativer KI erzeugt. Darauf
weist die Anwendung an mehreren Stellen hin; **verbindlich sind allein die amtlichen
Prüfungslisten.** Für Richtigkeit und Vollständigkeit wird keine Gewähr übernommen.

Der Quelltext liegt in einem Versionsverwaltungssystem; jede Änderung ist nachvollziehbar
und kann bei Bedarf offengelegt werden.
