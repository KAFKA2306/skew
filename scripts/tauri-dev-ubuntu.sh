#!/usr/bin/env bash
set -euo pipefail

echo "[info] Tauri dev setup (Ubuntu/WSL)"

# 1) OS packages required by Tauri GTK/WebKit and build tools
if command -v apt-get >/dev/null 2>&1; then
  echo "[info] Installing system dependencies via apt-get..."
  sudo apt-get update -y
  sudo apt-get install -y \
    libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
    libglib2.0-dev pkg-config build-essential curl file
else
  echo "[warn] apt-get not found. This script targets Ubuntu/WSL."
  echo "       Please install equivalent packages for your distro, then rerun."
fi

# 2) Rust toolchain (required by Tauri backend)
if ! command -v rustc >/dev/null 2>&1; then
  echo "[info] Installing Rust via rustup..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
if [ -f "$HOME/.cargo/env" ]; then
  # shellcheck source=/dev/null
  source "$HOME/.cargo/env"
fi
rustc --version || true
cargo --version || true

# 3) Use Node 20 if nvm is available (recommended for esbuild/Vite)
if [ -n "${NVM_DIR:-}" ] && [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
fi
if command -v nvm >/dev/null 2>&1; then
  nvm install 20 >/dev/null
  nvm use 20
fi
echo "[info] Node: $(node -v 2>/dev/null || echo 'not found')"

# 4) Install npm deps and run Tauri dev
echo "[info] Installing npm dependencies..."
rm -rf node_modules package-lock.json || true
npm install

echo "[info] Starting Tauri dev..."
npm run tauri dev

