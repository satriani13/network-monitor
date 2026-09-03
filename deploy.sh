#!/usr/bin/env bash
# Deploy / update Network Monitor on the VPS (run from its project dir).
set -euo pipefail
cd "$(dirname "$0")"

git pull --ff-only

if [ ! -d venv ]; then
  python3 -m venv venv
fi
venv/bin/pip install -q --upgrade pip
venv/bin/pip install -q -r requirements.txt

export PATH="$PATH:/root/.nvm/versions/node/v20.20.2/bin"
pm2 restart network-monitor --update-env
pm2 save

echo "Network Monitor deployed → https://jpchost.ddns.net/proyectos/network-monitor/"
