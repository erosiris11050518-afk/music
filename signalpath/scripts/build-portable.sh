#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
# 安装包属于私下发布物，不生成到 GitHub Pages 项目目录。
OUTPUT_DIR=${EROSIRIS_RELEASE_DIR:-"$ROOT/../ErosIris-Link-Private-Releases"}
OUTPUT_FILE="$OUTPUT_DIR/ErosIris-Link-Portable.zip"
TEMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/erosiris-link-portable.XXXXXX")
APP_DIR="$TEMP_ROOT/ErosIris Link"

cleanup() {
  rm -rf "$TEMP_ROOT"
}
trap cleanup EXIT INT TERM

mkdir -p "$APP_DIR" "$OUTPUT_DIR"

cp "$ROOT/index.html" "$APP_DIR/index.html"
cp -R "$ROOT/assets" "$APP_DIR/assets"
cp -R "$ROOT/css" "$APP_DIR/css"
cp -R "$ROOT/js" "$APP_DIR/js"

mkdir -p "$APP_DIR/welcome-reverse-prototype"
cp "$ROOT/welcome-reverse-prototype/index.html" "$APP_DIR/welcome-reverse-prototype/index.html"
cp "$ROOT/welcome-reverse-prototype/config.js" "$APP_DIR/welcome-reverse-prototype/config.js"
cp "$ROOT/welcome-reverse-prototype/app.js" "$APP_DIR/welcome-reverse-prototype/app.js"
cp "$ROOT/welcome-reverse-prototype/style.css" "$APP_DIR/welcome-reverse-prototype/style.css"
cp -R "$ROOT/welcome-reverse-prototype/assets" "$APP_DIR/welcome-reverse-prototype/assets"

cp "$ROOT/portable/START ErosIris Link.html" "$APP_DIR/START ErosIris Link.html"
cp "$ROOT/portable/使用说明.txt" "$APP_DIR/使用说明.txt"

find "$APP_DIR" -name '.DS_Store' -delete

rm -f "$OUTPUT_FILE"
(
  cd "$TEMP_ROOT"
  /usr/bin/zip -q -r "$OUTPUT_FILE" "ErosIris Link"
)

printf 'Created: %s\n' "$OUTPUT_FILE"
