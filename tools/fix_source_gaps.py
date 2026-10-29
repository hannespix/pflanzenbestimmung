#!/usr/bin/env python3
"""
Bekannte Fehler und Lücken der Excel-Quelllisten reproduzierbar berichtigen.

Einige offizielle Prüfungslisten lassen Einzelangaben leer (z. B. fehlt die
Familie zu *Chimonanthus praecox* im Profil garten_und_landschaftsbau_gaertner
– so steht es in der Quell-Excel) oder enthalten einen offensichtlichen
Übertragungsfehler (z. B. trägt im selben Profil die Zeile des Bauernjasmins
den botanischen Namen »Salvia abrotanoides«). Solche Korrekturen werden hier
zentral gepflegt, damit sie einen Neubau der Seeds aus den Original-Excels
(tools/rebuild_seeds.sh) überleben – statt sie von Hand in seeds/*.json zu
setzen, wo der nächste Rebuild sie wieder verwerfen würde.

Zwei Arten von Korrekturen:

  CORRECTIONS  – füllt ausschließlich LEERE Felder, nie vorhandene Angaben;
                 greift nur, wenn Gattung UND Art der Zielzeile exakt passen.
  Jeder Eintrag trägt als letztes Element eine Begründung in ganzen Sätzen –
  daraus erzeugt tools/fehlermeldung.py die Meldung an die zuständige Stelle
  (docs/quelllisten-fehlermeldung.md).
  REPLACEMENTS – ersetzt Felder einer Zeile, die als Ganzes (alle vier
                 Textfelder) exakt dem dokumentierten Fehler entspricht; die
                 Zeile bleibt erhalten (Nummer, ZP-Kennzeichnung, Synonyme),
                 nur die genannten Felder ändern sich. Die Wuchsform-Kategorie
                 wird danach wie in tools/categorize_seeds.py neu bestimmt.

Beide Schritte sind idempotent (ein zweiter Lauf ändert nichts mehr) und
werden auf rechtliches.html#datenquellen offengelegt.

Aufruf:  python3 tools/fix_source_gaps.py            (schreibt seeds/*.json)
         python3 tools/fix_source_gaps.py --check    (nur Report, kein Schreiben)

Aufgerufen von tools/rebuild_seeds.sh nach der Excel-Konvertierung und der
Kategorisierung.
"""
import json, pathlib, sys

ROOT = pathlib.Path(__file__).parent.parent
SEEDS = ROOT / "seeds"
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from categorize_seeds import categorize, KEEP  # noqa: E402  (Kategorie der ersetzten Zeile)

# Feld-Indizes der Seed-Zeile: [gattung, art, familie, dt_name, kategorie, zp, syn]
GATTUNG, ART, FAMILIE, DTNAME, KATEGORIE = 0, 1, 2, 3, 4

# Korrekturen je Profil-ID: Liste von (gattung, art, feld-index, wert).
# Nur leere Zielfelder werden gefüllt; Quelle/Begründung jeweils als Kommentar.
CORRECTIONS = {
    "garten_und_landschaftsbau_gaertner": [
        # Familie fehlt in der Excel. Calycanthaceae (Gewürzstrauchgewächse) ist
        # botanisch eindeutig und steht im Baumschul-Seed derselben Art bereits so.
        ("Chimonanthus", "praecox", FAMILIE, "Calycanthaceae",
         "Das Feld »Familie« ist in der Excel leer. Calycanthaceae (Gewürzstrauchgewächse) ist botanisch eindeutig und steht in der Baumschul-Gärtner-Liste bei derselben Art."),
    ],
}

# Ersetzungen je Profil-ID: Liste von (fehlerhafte Zeile, neue Werte).
# Die fehlerhafte Zeile ist das Tupel (gattung, art, familie, dt_name) – es muss
# als Ganzes passen, damit die Ersetzung niemals eine andere (oder eine künftig
# berichtigte) Zeile trifft. Die neuen Werte sind ein Dict {feld-index: wert}.
REPLACEMENTS = {
    "garten_und_landschaftsbau_gaertner": [
        # Excel »Pflanzenliste Gärtner/in Garten- und Landschaftsbau«, Zeile 209
        # (Nr. 207, ZP): »Salvia abrotanoides | Hydrangeaceae/Hortensiengewächse |
        # Bauernjasmin, Gewöhnlicher Pfeifenstrauch, Falscher Jasmin«.
        # Familie und deutsche Namen gehören zum Pfeifenstrauch Philadelphus
        # coronarius – so führt ihn die Fachwerker-Liste derselben Fachrichtung
        # Wort für Wort (Nr. 50). »Salvia abrotanoides« ist das Synonym der
        # Blauraute (Perovskia abrotanoides), die eine Zeile darüber (Nr. 206)
        # steht und dieses Synonym dort bereits trägt – ein Übertragungsfehler.
        (("Salvia", "abrotanoides", "Hydrangeaceae/Hortensiengewächse",
          "Bauernjasmin, Gewöhnlicher Pfeifenstrauch, Falscher Jasmin"),
         {GATTUNG: "Philadelphus", ART: "coronarius"},
         "Familie (Hydrangeaceae) und deutsche Namen (Bauernjasmin, Gewöhnlicher Pfeifenstrauch, Falscher Jasmin) gehören zum Pfeifenstrauch Philadelphus coronarius – so führt ihn die Fachwerker-Liste derselben Fachrichtung (Nr. 50). »Salvia abrotanoides« ist das Synonym der Blauraute (Perovskia abrotanoides), die eine Zeile darüber (Nr. 206) steht und dieses Synonym dort bereits trägt – ein Übertragungsfehler."),
    ],
}

# Rechtschreibfehler in botanischen Namen (Fund des Bildchecks tools/bildcheck.mjs: mit dem
# falschen Namen fand die Bildsuche nichts, und Lernende hätten die falsche Schreibweise
# gelernt). Jeder Fall ist eindeutig: dieselbe Art steht in anderen Listen richtig geschrieben,
# oder der Name existiert botanisch nur in der berichtigten Form. Familie, deutsche Namen,
# Nummer, ZP und Synonyme bleiben unverändert.
TYPOS = {
    "baumschule_fachwerker": [
        (("Juniperus", "communis 'Hibernika'", "Cupressaceae", "Irischer Säulenwacholder"),
         {ART: "communis 'Hibernica'"},
         "Die Sorte heißt 'Hibernica' (lateinisch »irisch«); so steht sie auch in der Baumschul-Gärtner-Liste."),
    ],
    "baumschule_gaertner": [
        (("Lagererstroemia", "indica", "Lythraceae", "Kreppmyrte"),
         {GATTUNG: "Lagerstroemia"},
         "Die Gattung ist nach Magnus von Lagerström benannt und heißt Lagerstroemia; im Namen ist eine Silbe verdoppelt."),
        (("Olea", "europea", "Oleaceae", "Echte Olive"),
         {ART: "europaea"},
         "Der gültige Name lautet Olea europaea; so steht er in zwei anderen Listen."),
    ],
    "friedhofsgaertnerei_fachwerker": [
        (("Antirrinum", "majus", "Scrophulariaceae", "Löwenmäulchen"),
         {GATTUNG: "Antirrhinum"},
         "Die Gattung heißt Antirrhinum; so steht sie in drei anderen Listen."),
        (("Gypsohila", "paniculata", "Caryophyllaceae", "Schleierkraut"),
         {GATTUNG: "Gypsophila"},
         "Die Gattung heißt Gypsophila; so steht sie in fünf anderen Listen."),
        (("Urtica", "dioca", "Urticaceae", "Brennnessel"),
         {ART: "dioica"},
         "Die Art heißt Urtica dioica; so steht sie in sieben anderen Listen."),
        (("Thymus", "serphyllum", "Lamiaceae", "Thymian"),
         {ART: "serpyllum"},
         "Die Art heißt Thymus serpyllum; so steht sie in drei anderen Listen."),
        (("Chameacyparis", "obtusa 'Nana Gracilis'", "Cupressaceae", "Muschel-Scheinzypresse"),
         {GATTUNG: "Chamaecyparis"},
         "Die Gattung heißt Chamaecyparis; so steht sie in vier anderen Listen (acht Einträge)."),
        (("Chameacypris", "lawsoniana 'Glauca'", "Cupressaceae", "Blaue Scheinzypresse"),
         {GATTUNG: "Chamaecyparis"},
         "Die Gattung heißt Chamaecyparis; so steht sie in vier anderen Listen (acht Einträge)."),
    ],
    "friedhofsgaertnerei_gaertner": [
        (("Hosta", "Cultivars Fortuei Aurea'", "Asparagaceae", "Frühlingsgold-Funkie"),
         {ART: "Cultivars Fortunei Aurea'"},
         "Die Sorte heißt 'Fortunei Aurea' (Buchstabendreher). Außerdem fehlt in der Liste das öffnende Anführungszeichen des Sortennamens – das wurde nicht verändert."),
    ],
    "gemuesebau_gaertner": [
        (("Amaranthus", "retoflexus", "Amaranthaceae", "Zurückgekr. Fuchsschwanz, Amarant"),
         {ART: "retroflexus"},
         "Die Art heißt Amaranthus retroflexus; so steht sie in zwei anderen Listen."),
    ],
    "zierpflanzenbau_gaertner": [
        (("Petunie", "x atkinsiana", "Solanaceae", "Garten-Petunie"),
         {GATTUNG: "Petunia"},
         "»Petunie« ist der deutsche Name; die Gattung heißt Petunia (so in drei anderen Listen)."),
    ],
}
for _pid, _items in TYPOS.items():                # dieselbe Mechanik wie REPLACEMENTS
    REPLACEMENTS.setdefault(_pid, []).extend(_items)


def _load(pid):
    path = SEEDS / f"{pid}.json"
    if not path.exists():
        print(f"WARN: {path.name} fehlt – überspringe", file=sys.stderr)
        return path, None
    return path, json.loads(path.read_text(encoding="utf-8"))


def _save(path, rows):
    path.write_text(
        json.dumps(rows, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8")


def apply_corrections(check=False):
    changed = 0
    for pid, corr in CORRECTIONS.items():
        path, rows = _load(pid)
        if rows is None:
            continue
        touched = 0
        for gattung, art, idx, val, *_begr in corr:
            for r in rows:
                if r[GATTUNG] == gattung and r[ART] == art:
                    if str(r[idx]).strip():
                        break  # schon vorhanden – nichts tun
                    if not check:
                        r[idx] = val
                    touched += 1
                    tag = "[--check] " if check else ""
                    print(f"{tag}{pid}: {gattung} {art} Feld[{idx}] = {val!r}")
                    break
            else:
                print(f"WARN: {pid}: {gattung} {art} nicht gefunden", file=sys.stderr)
        if touched and not check:
            _save(path, rows)
        changed += touched
    return changed


def apply_replacements(check=False):
    changed = 0
    for pid, repl in REPLACEMENTS.items():
        path, rows = _load(pid)
        if rows is None:
            continue
        touched = 0
        for wrong, new, *_begr in repl:
            key = lambda r: (r[GATTUNG], r[ART], r[FAMILIE], r[DTNAME])
            fixed = list(wrong)
            for idx, val in new.items():
                fixed[idx] = val
            hits = [r for r in rows if key(r) == wrong]
            if not hits:
                if not any(key(r) == tuple(fixed) for r in rows):
                    print(f"WARN: {pid}: {' '.join(wrong[:2])} weder fehlerhaft noch "
                          f"berichtigt gefunden", file=sys.stderr)
                continue  # schon berichtigt – nichts tun
            for r in hits:
                was = f"{r[GATTUNG]} {r[ART]}"
                if not check:
                    for idx, val in new.items():
                        r[idx] = val
                    if pid not in KEEP:  # Wuchsform folgt dem berichtigten Namen
                        r[KATEGORIE] = categorize(r[GATTUNG], r[ART], r[FAMILIE]) or ""
                touched += 1
                tag = "[--check] " if check else ""
                print(f"{tag}{pid}: {was} -> {fixed[GATTUNG]} {fixed[ART]} ({r[DTNAME]})")
        if touched and not check:
            _save(path, rows)
        changed += touched
    return changed


def apply(check=False):
    changed = apply_corrections(check) + apply_replacements(check)
    print(f"{'Offen' if check else 'Berichtigt'}: {changed}")
    return changed


if __name__ == "__main__":
    apply("--check" in sys.argv)
