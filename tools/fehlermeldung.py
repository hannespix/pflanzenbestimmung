#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later · Copyright (C) 2026 Hannes Pix (siehe LICENSE)
"""
Meldung der berichtigten Fehler in den amtlichen Prüfungslisten – zum Versand an die
zuständige Stelle (Regierungspräsidium). Quelle sind die Tabellen in tools/fix_source_gaps.py
(CORRECTIONS, REPLACEMENTS, TYPOS) samt ihrer Begründungen; die Datei
docs/quelllisten-fehlermeldung.md wird daraus erzeugt und gehört ins Repo.

Aufruf:  python3 tools/fehlermeldung.py            (schreibt docs/quelllisten-fehlermeldung.md)
         python3 tools/fehlermeldung.py --check    (nur vergleichen; Exit 1, wenn die Datei veraltet ist)

Aufgerufen von tools/rebuild_seeds.sh; die CI prüft mit --check, dass die Meldung zu den
Tabellen passt (eine neue Berichtigung ohne aktualisierte Meldung lässt den Build scheitern).
"""
import pathlib, sys, datetime
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from fix_source_gaps import CORRECTIONS, REPLACEMENTS, TYPOS, GATTUNG, ART, FAMILIE, DTNAME  # noqa: E402

ROOT = pathlib.Path(__file__).parent.parent
OUT = ROOT / "docs" / "quelllisten-fehlermeldung.md"
FR = {"baumschule": "Baumschule", "friedhofsgaertnerei": "Friedhofsgärtnerei",
      "garten_und_landschaftsbau": "Garten- und Landschaftsbau", "gemuesebau": "Gemüsebau",
      "obstbau": "Obstbau", "staudengaertnerei": "Staudengärtnerei", "zierpflanzenbau": "Zierpflanzenbau"}
NIV = {"gaertner": "Gärtner/in", "fachwerker": "Fachwerker/in"}
FELD = {GATTUNG: "Gattung", ART: "Art", FAMILIE: "Familie", DTNAME: "Deutscher Name"}


def profil_label(pid):
    fr, niv = pid.rsplit("_", 1)
    return f"{FR.get(fr, fr)} · {NIV.get(niv, niv)}"


def quelle(pid):
    hits = sorted((ROOT / "data").glob(pid + ".*"))
    return hits[0].name if hits else f"{pid}.xlsx"


def typo_set():
    return {(pid, wrong) for pid, items in TYPOS.items() for wrong, *_ in items}


def sammeln():
    """je Profil: Liste von (art, eintrag_in_liste, berichtigung, begruendung)"""
    rows = {}
    for pid, corr in CORRECTIONS.items():
        for gattung, art, idx, val, *begr in corr:
            rows.setdefault(pid, []).append(("Lücke", f"*{gattung} {art}*",
                                             f"{FELD[idx]} ergänzt: **{val}** (Feld war leer)",
                                             begr[0] if begr else ""))
    typos = typo_set()
    for pid, repl in REPLACEMENTS.items():
        for wrong, new, *begr in repl:
            art = "Schreibweise" if (pid, wrong) in typos else "Übertragungsfehler"
            was = f"*{wrong[GATTUNG]} {wrong[ART]}* · {wrong[DTNAME]}"
            fixes = " · ".join(f"{FELD[i]}: {wrong[i]} → **{v}**" for i, v in new.items())
            rows.setdefault(pid, []).append((art, was, fixes, begr[0] if begr else ""))
    return rows


def bericht():
    rows = sammeln()
    n = sum(len(v) for v in rows.values())
    o = []
    o.append("# Berichtigte Einzelangaben in den Pflanzenlisten – Meldung an die zuständige Stelle\n")
    o.append("*Erzeugt aus `tools/fix_source_gaps.py` mit `tools/fehlermeldung.py` – bitte nicht von Hand ändern, "
             "sondern dort ergänzen und das Skript laufen lassen.*\n")
    o.append("Sehr geehrte Damen und Herren,\n")
    o.append("das Lern- und Prüfungswerkzeug **Pflanzenkenntnis** (pflanze-bw.de) übernimmt die Pflanzennamen "
             "unverändert aus den veröffentlichten Prüfungslisten der Gärtnerberufe (Abschlussprüfung "
             "Gärtner/in und Fachwerker/in, alle sieben Fachrichtungen). Beim Abgleich aller "
             "2 114 Einträge und bei der automatischen Bildsuche sind die unten aufgeführten "
             f"**{n} Einzelangaben** aufgefallen, die in den Excel-Listen fehlen oder offensichtlich "
             "falsch geschrieben bzw. übertragen sind. Das Werkzeug zeigt in diesen Fällen die berichtigte "
             "Angabe und legt jede Berichtigung offen (pflanze-bw.de/rechtliches.html, Abschnitt "
             "»Datenquellen & Inhalte«).\n")
    o.append("Ich bitte darum, die Angaben zu prüfen und bei der nächsten Ausgabe der Listen zu berichtigen. "
             "Für Rückfragen stehe ich gern zur Verfügung.\n")
    o.append("Mit freundlichen Grüßen\n\n*(Absender)*\n")
    o.append("---\n")
    for pid in sorted(rows, key=lambda p: (p.rsplit('_', 1)[0], p.rsplit('_', 1)[1] == 'fachwerker')):
        o.append(f"## {profil_label(pid)}\n")
        o.append(f"Quelldatei: `{quelle(pid)}`\n")
        o.append("| Nr. | Art | Eintrag in der Liste | Berichtigung | Begründung |")
        o.append("|---:|---|---|---|---|")
        for i, (art, was, fix, begr) in enumerate(rows[pid], 1):
            o.append(f"| {i} | {art} | {was} | {fix} | {begr} |")
        o.append("")
    o.append("## Anmerkungen (keine Berichtigung vorgenommen)\n")
    o.append("- **Baumschule · Gärtner/in:** *Prunus cerasifera* ist als »Blutpflaume, Gewöhnliche Kirschpflaume« "
             "aufgeführt. »Blutpflaume« bezeichnet die rotlaubige Sorte 'Nigra', die Art selbst ist die "
             "Kirschpflaume – eine Ungenauigkeit, kein eindeutiger Fehler; im Werkzeug unverändert.")
    o.append("- Leere Art-Felder bei Sammeleinträgen (*Fuchsia-Hybriden*, *Rosa-Hybriden*, *Freesia-Hybriden*, "
             "*Hippeastrum-Hybriden*) sind kein Fehler: Es gibt dort kein Art-Epitheton.")
    o.append("- Der Platzhalter **'Sorte'** (z. B. *Salvia nemorosa 'Sorte'*) wird als »Art in irgendeiner "
             "Gartensorte« verstanden und so angezeigt; eine Berichtigung ist nicht nötig.")
    o.append("- Nicht Gegenstand dieser Meldung sind die Formanpassungen des Werkzeugs (einheitliche "
             "Anführungszeichen bei Sortennamen, einheitliche Bezeichnung der Beikraut-Kategorie, "
             "ergänzte Wuchsform-Gruppen) – sie ändern keine Namen.\n")
    o.append(f"*Stand: {datetime.date.today().strftime('%d.%m.%Y')} · {n} Berichtigungen in "
             f"{len(rows)} Listen.*\n")
    return "\n".join(o)


if __name__ == "__main__":
    text = bericht()
    if "--check" in sys.argv:
        alt = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        # Datumszeile beim Vergleich ignorieren (sie ändert sich mit jedem Lauf)
        strip = lambda t: "\n".join(l for l in t.split("\n") if not l.startswith("*Stand: "))
        if strip(alt) != strip(text):
            print(f"FEHLER: {OUT.relative_to(ROOT)} ist veraltet – python3 tools/fehlermeldung.py laufen lassen", file=sys.stderr)
            sys.exit(1)
        print(f"OK: {OUT.relative_to(ROOT)} entspricht den Tabellen")
    else:
        OUT.parent.mkdir(exist_ok=True)
        # Das Datum der Stand-Zeile bleibt das der letzten inhaltlichen Änderung: Ist die Meldung bis auf
        # die Datumszeile unverändert, wird die Datei nicht angefasst. Sonst trüge jeder Neubau an einem
        # anderen Tag ein neues Datum ein – und die CI (git diff nach rebuild_seeds.sh) wäre ab dem
        # Folgetag jedes Commits rot, obwohl sich an den Berichtigungen nichts geändert hat.
        strip = lambda t: "\n".join(l for l in t.split("\n") if not l.startswith("*Stand: "))
        if OUT.exists() and strip(OUT.read_text(encoding="utf-8")) == strip(text):
            print(f"unverändert: {OUT.relative_to(ROOT)}"); sys.exit(0)
        OUT.write_text(text, encoding="utf-8")
        print(f"geschrieben: {OUT.relative_to(ROOT)}")
