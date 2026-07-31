#!/usr/bin/env python3
"""
Bekannte Lücken der Excel-Quelllisten reproduzierbar nachtragen.

Einige offizielle Prüfungslisten lassen Einzelangaben leer (z. B. fehlt die
Familie zu *Chimonanthus praecox* im Profil garten_und_landschaftsbau_gaertner
– so steht es in der Quell-Excel). Solche Korrekturen werden hier zentral
gepflegt, damit sie einen Neubau der Seeds aus den Original-Excels
(tools/rebuild_seeds.sh) überleben – statt sie von Hand in seeds/*.json zu
setzen, wo der nächste Rebuild sie wieder verwerfen würde.

Grundsätze:
  * Es werden ausschließlich LEERE Felder gefüllt, nie vorhandene Angaben
    überschrieben.
  * Eine Korrektur greift nur, wenn Gattung UND Art der Zielzeile exakt passen.
  * Der Schritt ist idempotent (ein zweiter Lauf ändert nichts mehr).

Aufruf:  python3 tools/fix_source_gaps.py            (schreibt seeds/*.json)
         python3 tools/fix_source_gaps.py --check    (nur Report, kein Schreiben)

Aufgerufen von tools/rebuild_seeds.sh nach der Excel-Konvertierung und der
Kategorisierung.
"""
import json, pathlib, sys

ROOT = pathlib.Path(__file__).parent.parent
SEEDS = ROOT / "seeds"

# Feld-Indizes der Seed-Zeile: [gattung, art, familie, dt_name, kategorie, zp, syn]
GATTUNG, ART, FAMILIE, DTNAME = 0, 1, 2, 3

# Korrekturen je Profil-ID: Liste von (gattung, art, feld-index, wert).
# Nur leere Zielfelder werden gefüllt; Quelle/Begründung jeweils als Kommentar.
CORRECTIONS = {
    "garten_und_landschaftsbau_gaertner": [
        # Familie fehlt in der Excel. Calycanthaceae (Gewürzstrauchgewächse) ist
        # botanisch eindeutig und steht im Baumschul-Seed derselben Art bereits so.
        ("Chimonanthus", "praecox", FAMILIE, "Calycanthaceae"),
    ],
}


def apply(check=False):
    changed = 0
    for pid, corr in CORRECTIONS.items():
        path = SEEDS / f"{pid}.json"
        if not path.exists():
            print(f"WARN: {path.name} fehlt – überspringe", file=sys.stderr)
            continue
        rows = json.loads(path.read_text(encoding="utf-8"))
        touched = 0
        for gattung, art, idx, val in corr:
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
            path.write_text(
                json.dumps(rows, ensure_ascii=False, separators=(",", ":")) + "\n",
                encoding="utf-8")
        changed += touched
    print(f"{'Offen' if check else 'Nachgetragen'}: {changed}")
    return changed


if __name__ == "__main__":
    apply("--check" in sys.argv)
