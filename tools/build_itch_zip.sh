#!/usr/bin/env bash
# Empacota a versão web para o itch.io (Kind of project: HTML, "This file will be played in the browser").
# Uso (na raiz do repositório): bash tools/build_itch_zip.sh  ->  marketing/eco-da-lamina-web.zip
set -euo pipefail
cd "$(dirname "$0")/.."
out=marketing/eco-da-lamina-web.zip
rm -f "$out"
zip -qr "$out" index.html style.css src vendor assets/models/protagonista.glb -x '*.DS_Store' 'vendor/three.LICENSE'
zip -q "$out" vendor/three.LICENSE
echo "$out: $(du -h "$out" | cut -f1)"
