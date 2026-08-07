#!/usr/bin/env python3
"""
Build-Skript – erzeugt aus den Quellen vollständig offline lauffähige HTML-Dateien
(kein CDN, keine Runtime-Abhängigkeiten außer inline SheetJS im Prüfungswerkzeug).

Aufruf:  python3 build.py
Ergebnisse:
  dist/index.html              Lern-Tool (Azubis) – die Wurzel pflanze-bw.de führt direkt hierher
  dist/pflanzen-lernen.html    dasselbe Lern-Tool unter sprechendem Namen (Altlinks/PWA)
  dist/pflanzenkenntnis.html   Prüfungswerkzeug (für Prüfende)
  dist/pruefung/index.html     hübsche Adresse pflanze-bw.de/pruefung → Prüfungswerkzeug
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

# Hübsche Adresse für die Prüfenden: pflanze-bw.de/pruefung
# Kein Server-Rewrite nötig – ein Unterverzeichnis mit index.html, das auf die
# echte Datei weiterleitet. Damit bleibt pflanzenkenntnis.html die eine Quelle
# (PWA/Service-Worker/relative Links unverändert). Rein relativ und ohne externe
# Ressourcen, damit der Offline-Check grün bleibt.
PRUEFUNG_REDIRECT = """<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Prüfungswerkzeug · Pflanzenkenntnis</title>
<meta http-equiv="refresh" content="0; url=../pflanzenkenntnis.html">
<style>body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#eceee6;color:#22352b;
display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;text-align:center;padding:24px}
a{color:#2b4f38}</style>
</head>
<body>
<p>Das Prüfungswerkzeug wird geladen …<br>
<a href="../pflanzenkenntnis.html">Weiter zum Prüfungswerkzeug</a></p>
<script>location.replace("../pflanzenkenntnis.html");</script>
</body>
</html>
"""

def write_out(out, name, root_copy=True):
    dist = ROOT / "dist"; dist.mkdir(exist_ok=True)
    target = dist / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(out, encoding="utf-8")
    # Verteilkopie im Repo-Root: versioniert, direkt aus GitHub herunterladbar.
    # (Nur für die eigenständigen Werkzeuge – die Weiterleitung ist reines Deploy-Beiwerk.)
    if root_copy:
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

    # Hübsche Adresse pflanze-bw.de/pruefung → leitet auf das Prüfungswerkzeug weiter
    write_out(PRUEFUNG_REDIRECT, "pruefung/index.html", root_copy=False)
    outputs.append(PRUEFUNG_REDIRECT)

    # Lern-Tool (kein Excel-Import → ohne SheetJS). Es ist zugleich die Startseite:
    # pflanze-bw.de führt DIREKT zum Lern-Tool (Zielgruppe Azubis). Das
    # Prüfungswerkzeug ist bewusst nur über seine eigene Adresse erreichbar
    # (pflanze-bw.de/pruefung bzw. /pflanzenkenntnis.html) – Azubis sollen es
    # gar nicht erst zu sehen bekommen. Beide Namen tragen dieselbe Datei, damit
    # bestehende Links, Lesezeichen und die PWA-Verknüpfung weiter funktionieren.
    if (ROOT / "src/learn.html").exists() and (ROOT / "src/learn.js").exists():
        learn = render(read("src/learn.html"), read("src/learn.js"), seeds_json)
        write_out(learn, "pflanzen-lernen.html"); outputs.append(learn)
        write_out(learn, "index.html")          # Wurzel = Lern-Tool (gleiche Datei)

    total = sum(len(v) for v in seeds.values())

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
