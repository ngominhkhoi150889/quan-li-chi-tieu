#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EMSDK_DIR="${EMSDK_DIR:-$HOME/emsdk}"

if ! command -v em++ >/dev/null 2>&1; then
  if [[ -f "$EMSDK_DIR/emsdk_env.sh" ]]; then
    # shellcheck disable=SC1090
    source "$EMSDK_DIR/emsdk_env.sh" >/dev/null
  else
    echo "Không tìm thấy Emscripten. Cài emsdk hoặc đặt biến EMSDK_DIR." >&2
    exit 1
  fi
fi

mkdir -p "$ROOT_DIR/docs"

em++ "$ROOT_DIR/src/core.cpp" \
  -std=c++17 \
  -O3 \
  --bind \
  --no-entry \
  -sMODULARIZE=1 \
  -sEXPORT_NAME=createExpenseCore \
  -sENVIRONMENT=web \
  -sALLOW_MEMORY_GROWTH=1 \
  -sFILESYSTEM=0 \
  -sEXPORTED_RUNTIME_METHODS=[] \
  -o "$ROOT_DIR/docs/core.js"

echo "Đã build: docs/core.js + docs/core.wasm"
