#!/bin/zsh
set -e

cd "$(dirname "$0")"

if [[ ( -z "${MINIMAX_API_KEY:-}" || -z "${DEEPSEEK_API_KEY:-}" ) && -f "$HOME/.zshrc" ]]; then
  source "$HOME/.zshrc"
fi

if [ ! -d node_modules ]; then
  npm install
fi

npm run dev
