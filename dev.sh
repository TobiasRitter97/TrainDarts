#!/usr/bin/env bash
# Startet die komplette App lokal mit einem Befehl: ./dev.sh
# Richtet beim ersten Mal automatisch die Python-Umgebung ein.
set -e
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "Erstelle Python-Umgebung (.venv) ..."
  python3 -m venv .venv
  ./.venv/bin/pip install -q --upgrade pip
  ./.venv/bin/pip install -q -r backend/requirements.txt
fi

trap 'kill 0' EXIT INT TERM

echo "Starte Backend auf http://localhost:8088 ..."
./.venv/bin/python3 -m backend.app &

if command -v npm >/dev/null 2>&1; then
  if [ ! -d frontend/node_modules ]; then
    echo "Installiere Frontend-Pakete (einmalig, kann etwas dauern) ..."
    (cd frontend && npm install)
  fi
  echo "Starte Frontend auf http://localhost:5173 ..."
  (cd frontend && npm run dev) &
else
  echo "Hinweis: Node.js/npm wurde nicht gefunden. Bitte zuerst installieren"
  echo "         (siehe Anleitung im Chat) - es laeuft vorerst nur das Backend."
fi


wait
