#!/usr/bin/env bash
# Vendors whisper.cpp and llama.cpp as git submodules under
# apps/mobile/native/. Run from repo root.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NATIVE_DIR="$ROOT/apps/mobile/native"

mkdir -p "$NATIVE_DIR"

echo "==> Vendoring whisper.cpp"
if [ ! -d "$NATIVE_DIR/whisper.cpp" ]; then
  git -C "$ROOT" submodule add --depth 1 https://github.com/ggerganov/whisper.cpp apps/mobile/native/whisper.cpp || \
    git -C "$NATIVE_DIR" clone --depth 1 https://github.com/ggerganov/whisper.cpp
else
  echo "whisper.cpp already present"
fi

echo "==> Vendoring llama.cpp"
if [ ! -d "$NATIVE_DIR/llama.cpp" ]; then
  git -C "$ROOT" submodule add --depth 1 https://github.com/ggerganov/llama.cpp apps/mobile/native/llama.cpp || \
    git -C "$NATIVE_DIR" clone --depth 1 https://github.com/ggerganov/llama.cpp
else
  echo "llama.cpp already present"
fi

echo "==> Done. Vendored libraries are in $NATIVE_DIR"
echo "    Both are MIT-licensed; safe to ship."
