#!/usr/bin/env bash
# Monta o trailer completo a partir da versão web.
# Uso (na raiz do repositório, com Playwright instalado):
#   python3 -m http.server 8123 &      # servidor da versão web
#   bash tools/trailer/build.sh [pasta-temporaria]
# Saída: marketing/trailer/eco-da-lamina-trailer.mp4, um GIF curto e screenshots/capas em marketing/
set -euo pipefail
cd "$(dirname "$0")/../.."
TMP="${1:-/tmp/eco-trailer}"
OUT=marketing
if [ ! -f "$TMP/shots.json" ]; then node tools/trailer/record.cjs "$TMP" 1920 1080; fi
python3 tools/trailer/make_audio.py "$TMP" "$TMP/trilha.wav"
mkdir -p "$OUT/trailer" "$OUT/screenshots"
ffmpeg -y -loglevel error -framerate 30 -i "$TMP/frames/%05d.jpg" -i "$TMP/trilha.wav" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart \
  "$OUT/trailer/eco-da-lamina-trailer.mp4"
# GIF curto (aparo + esquiva perfeita) para a página do jogo
START=$(python3 -c "import json;s={x['id']:x for x in json.load(open('$TMP/shots.json'))['shots']};print(s['aparo']['start']/30)")
ffmpeg -y -loglevel error -ss "$START" -t 7 -i "$OUT/trailer/eco-da-lamina-trailer.mp4" \
  -vf "fps=15,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer" \
  "$OUT/trailer/eco-da-lamina-combate.gif"
if [ ! -f "$TMP/keyart/keyart-arauto.png" ]; then node tools/trailer/record.cjs "$TMP/keyart" 1920 1080 --keyart; fi
python3 tools/trailer/make_stills.py "$TMP" "$OUT/screenshots" "$TMP/keyart"
ls -la "$OUT/trailer" "$OUT/screenshots"
