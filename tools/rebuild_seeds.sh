#!/usr/bin/env bash
# rebuild_seeds.sh – erzeugt alle Seeds neu aus data/<profil-id>.<ext>.
#
# Konvention: jede Quell-Excel in data/ ist nach ihrer Profil-ID benannt,
# sodass data/<id>.xlsx -> seeds/<id>.json exakt zugeordnet ist.
# Aufruf:  bash tools/rebuild_seeds.sh   (danach: python3 build.py)
set -euo pipefail
cd "$(dirname "$0")/.."

ids=(
  baumschule_gaertner baumschule_fachwerker
  friedhofsgaertnerei_gaertner friedhofsgaertnerei_fachwerker
  garten_und_landschaftsbau_gaertner garten_und_landschaftsbau_fachwerker
  gemuesebau_gaertner gemuesebau_fachwerker
  obstbau_gaertner obstbau_fachwerker
  staudengaertnerei_gaertner staudengaertnerei_fachwerker
  zierpflanzenbau_gaertner zierpflanzenbau_fachwerker
)

for id in "${ids[@]}"; do
  file=$(ls "data/$id".* 2>/dev/null | head -1 || true)
  if [ -z "$file" ]; then
    echo "WARN: keine Quelldatei data/$id.* – überspringe" >&2
    continue
  fi
  node tools/xlsx_to_seed.mjs "$file" "$id"
done
