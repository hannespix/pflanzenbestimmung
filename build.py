#!/usr/bin/env python3
"""
Build-Skript – erzeugt aus den Quellen vollständig offline lauffähige HTML-Dateien
(kein CDN, keine Runtime-Abhängigkeiten außer inline SheetJS im Prüfungswerkzeug).

Aufruf:  python3 build.py
Ergebnisse:
  dist/index.html              Startseite (verzweigt zu Lernen / Prüfen)
  dist/pflanzenkenntnis.html   Prüfungswerkzeug (für Prüfende)
  dist/pflanzen-lernen.html    Lern-Tool (für Azubis)
  dist/rechtliches.html        Impressum & Datenschutz (statisch)
  + versionierte Verteilkopien aller Dateien im Repo-Root
"""
import pathlib, json, sys, hashlib, shutil

ROOT = pathlib.Path(__file__).parent

def read(p):
    return (ROOT / p).read_text(encoding="utf-8")

def load_seeds():
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
    return seeds

def render(tpl, app, seeds_json, xlsx=None):
    out = tpl
    if xlsx is not None:
        out = out.replace("/*__XLSX_JS__*/", xlsx)
    out = out.replace("/*__APP_JS__*/", app)
    out = out.replace("/*__SEEDS__*/{}", seeds_json)
    for ph in ["__XLSX_JS__", "__APP_JS__", "__SEEDS__", "__SEED__", "__WASM_B64__", "__SQL_WASM_JS__"]:
        if ph in out:
            print(f"FEHLER: Platzhalter {ph} nicht ersetzt", file=sys.stderr); sys.exit(1)
    return out

def render_landing(tpl, stats):
    # Statische Startseite: nur die Kennzahl der gemeinsamen Datenbank einsetzen.
    out = tpl.replace("/*__STATS__*/", stats)
    if "__STATS__" in out:
        print("FEHLER: Platzhalter __STATS__ nicht ersetzt", file=sys.stderr); sys.exit(1)
    return out

def write_out(out, name):
    dist = ROOT / "dist"; dist.mkdir(exist_ok=True)
    (dist / name).write_text(out, encoding="utf-8")
    # Verteilkopie im Repo-Root: versioniert, direkt aus GitHub herunterladbar
    (ROOT / name).write_text(out, encoding="utf-8")
    kb = round(len(out.encode("utf-8")) / 1024)
    print(f"OK  dist/{name}  ({kb} KB)")

def emit_pwa(outputs):
    """PWA-Assets nach dist/ schreiben: Icons, Manifest und den Service Worker
    (mit Inhalts-Hash als Cache-Version). dist/ ist die Ausliefer-/Deploy-Basis;
    für den lokalen Datei-Aufruf (file://) sind diese Assets ohne Belang."""
    if not ((ROOT / "src/manifest.webmanifest").exists() and (ROOT / "src/sw.js").exists()):
        return
    dist = ROOT / "dist"; dist.mkdir(exist_ok=True)
    icons = sorted((ROOT / "icons").glob("*.png"))
    for ic in icons:
        shutil.copyfile(ic, dist / ic.name)
    manifest = read("src/manifest.webmanifest")
    (dist / "manifest.webmanifest").write_text(manifest, encoding="utf-8")
    # Cache-Version = Hash über die ausgelieferten Inhalte → ändert sich der Inhalt,
    # erneuert der Service Worker den Cache automatisch.
    h = hashlib.sha256()
    for o in outputs:
        h.update(o.encode("utf-8"))
    h.update(manifest.encode("utf-8"))
    for ic in icons:
        h.update(ic.read_bytes())
    version = h.hexdigest()[:12]
    sw = read("src/sw.js").replace("/*__SW_VERSION__*/dev", version)
    (dist / "sw.js").write_text(sw, encoding="utf-8")
    print(f"OK  dist/manifest.webmanifest · dist/sw.js (v{version}) · {len(icons)} Icons")


def main():
    seeds = load_seeds()
    seeds_json = json.dumps(seeds, ensure_ascii=False, separators=(",", ":"))
    outputs = []

    # Prüfungswerkzeug (inkl. SheetJS für den Excel-Import)
    exam = render(read("src/template.html"), read("src/app.js"), seeds_json,
                  xlsx=read("lib/xlsx.full.min.js"))
    write_out(exam, "pflanzenkenntnis.html"); outputs.append(exam)

    # Lern-Tool (kein Excel-Import → ohne SheetJS)
    if (ROOT / "src/learn.html").exists() and (ROOT / "src/learn.js").exists():
        learn = render(read("src/learn.html"), read("src/learn.js"), seeds_json)
        write_out(learn, "pflanzen-lernen.html"); outputs.append(learn)

    total = sum(len(v) for v in seeds.values())

    # Gemeinsame Startseite (verzweigt zu Lernen / Prüfen); nur wenn beide Ziele existieren
    if (ROOT / "src/start.html").exists():
        stats = f"{len(seeds)} Profile · {total} Arten"
        landing = render_landing(read("src/start.html"), stats)
        write_out(landing, "index.html"); outputs.append(landing)

    # Impressum & Datenschutz (statische Seite, keine Seeds/JS)
    if (ROOT / "src/recht.html").exists():
        recht = read("src/recht.html")
        write_out(recht, "rechtliches.html"); outputs.append(recht)

    # PWA: Manifest, Icons und Service Worker (Installation + Offline-Cache)
    emit_pwa(outputs)

    print(f"Profile mit Seed: {len(seeds)}  ·  Arten gesamt: {total}")
    for pid, arr in seeds.items():
        print(f"  - {pid}: {len(arr)}")

if __name__ == "__main__":
    main()
