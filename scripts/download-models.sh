#!/usr/bin/env bash
# Downloads default GGUF models for local development.
# Models are .gitignored — they live in models/ at repo root.
# In production, the app downloads these on first launch into app-private storage.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODELS="$ROOT/models"
mkdir -p "$MODELS"

WHISPER_BASE_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
WHISPER_BASE_PATH="$MODELS/ggml-base.bin"

GEMMA_URL="https://huggingface.co/google/gemma-2-2b-it-GGUF/resolve/main/2b_it_v2.gguf"
GEMMA_PATH="$MODELS/gemma-2-2b-it.Q4_K_M.gguf"

dl() {
  local url="$1" dst="$2"
  if [ -f "$dst" ]; then
    echo "[skip] $(basename "$dst") already exists"
    return
  fi
  echo "[download] $(basename "$dst")"
  curl -L --fail --progress-bar -o "$dst.part" "$url"
  mv "$dst.part" "$dst"
}

echo "==> Whisper base (~140 MB)"
dl "$WHISPER_BASE_URL" "$WHISPER_BASE_PATH"

echo
echo "==> Gemma 2B IT GGUF (~1.6 GB) — Hugging Face login may be required."
echo "    If this fails, run: huggingface-cli login"
dl "$GEMMA_URL" "$GEMMA_PATH" || {
  echo "[warn] Gemma download failed. You can substitute Phi-3-mini-4k-instruct GGUF instead:"
  echo "       https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf"
}

echo
echo "==> Done. Models in $MODELS"
ls -lh "$MODELS"
