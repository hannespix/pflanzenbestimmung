#!/usr/bin/env python3
"""
check_offline.py – stellt sicher, dass die gebaute HTML keine externen
Ressourcen lädt (Zero-Trust / kein CDN). Bricht mit Fehlercode ab, wenn
verbotene Muster gefunden werden.

Aufruf:  python3 tools/check_offline.py [dist/pflanzenkenntnis.html]
"""
import re, sys, pathlib

TARGET = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "dist/pflanzenkenntnis.html")

# Verbotene Muster: externe Skripte/Styles/Fonts/Fetches
FORBIDDEN = [
    (r'<script[^>]+\bsrc\s*=', "Externes <script src=…> gefunden – Bibliothek muss inline sein"),
    (r'<link[^>]+\bhref\s*=\s*["\']https?:', "Externes <link href=…> gefunden"),
    (r'@import\s+url\(\s*["\']?https?:', "Externer @import gefunden"),
    (r'(cdnjs|jsdelivr|unpkg|googleapis|cloudflare|gstatic)\.', "CDN-Referenz gefunden"),
    (r'\bfetch\(\s*["\']https?://', "fetch() auf externe URL gefunden"),
    (r'new\s+XMLHttpRequest', "XMLHttpRequest gefunden (Offline-Tool sollte keinen Netzzugriff benötigen)"),
]

def main():
    if not TARGET.exists():
        print(f"FEHLER: {TARGET} existiert nicht – zuerst 'python3 build.py' ausführen.", file=sys.stderr)
        sys.exit(1)
    html = TARGET.read_text(encoding="utf-8", errors="ignore")
    problems = []
    for pat, msg in FORBIDDEN:
        for mobj in re.finditer(pat, html, re.IGNORECASE):
            ctx = html[max(0, mobj.start() - 20): mobj.start() + 60].replace("\n", " ")
            problems.append(f"  - {msg}\n      …{ctx}…")
    if problems:
        print("Offline-Check FEHLGESCHLAGEN:\n" + "\n".join(problems), file=sys.stderr)
        sys.exit(1)
    print(f"Offline-Check OK – {TARGET} lädt keine externen Ressourcen.")

if __name__ == "__main__":
    main()
