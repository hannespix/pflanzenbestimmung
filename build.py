#!/usr/bin/env python3
"""
Build-Skript – erzeugt aus den Quellen eine einzelne, vollständig offline
lauffähige HTML-Datei (kein CDN, keine Runtime-Abhängigkeiten außer inline SheetJS).

Aufruf:  python3 build.py
Ergebnis: dist/pflanzenkenntnis.html
          + versionierte Verteilkopie pflanzenkenntnis.html im Repo-Root
"""
import pathlib, json, sys

ROOT = pathlib.Path(__file__).parent

def read(p):
    return (ROOT / p).read_text(encoding="utf-8")

def main():
    tpl  = read("src/template.html")
    app  = read("src/app.js")
    xlsx = read("lib/xlsx.full.min.js")

    # Alle Seeds einsammeln: Dateiname (ohne .json) = Profil-ID
    seeds = {}
    for f in sorted((ROOT / "seeds").glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"FEHLER in {f.name}: {e}", file=sys.stderr); sys.exit(1)
        if not isinstance(data, list):
            print(f"FEHLER: {f.name} muss ein Array sein", file=sys.stderr); sys.exit(1)
        seeds[f.stem] = data
    seeds_json = json.dumps(seeds, ensure_ascii=False, separators=(",", ":"))

    out = tpl.replace("/*__XLSX_JS__*/", xlsx)
    out = out.replace("/*__APP_JS__*/", app)
    out = out.replace("/*__SEEDS__*/{}", seeds_json)

    for ph in ["__XLSX_JS__", "__APP_JS__", "__SEEDS__", "__SEED__", "__WASM_B64__", "__SQL_WASM_JS__"]:
        if ph in out:
            print(f"FEHLER: Platzhalter {ph} nicht ersetzt", file=sys.stderr); sys.exit(1)

    dist = ROOT / "dist"; dist.mkdir(exist_ok=True)
    target = dist / "pflanzenkenntnis.html"
    target.write_text(out, encoding="utf-8")
    # Verteilkopie im Repo-Root: versioniert, direkt aus GitHub herunterladbar
    (ROOT / "pflanzenkenntnis.html").write_text(out, encoding="utf-8")

    total = sum(len(v) for v in seeds.values())
    kb = round(len(out.encode("utf-8")) / 1024)
    print(f"OK  {target.relative_to(ROOT)}  ({kb} KB)")
    print(f"Profile mit Seed: {len(seeds)}  ·  Arten gesamt: {total}")
    for pid, arr in seeds.items():
        print(f"  - {pid}: {len(arr)}")

if __name__ == "__main__":
    main()
