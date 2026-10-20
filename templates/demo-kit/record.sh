#!/usr/bin/env bash
# OneTake demo kit: renders this folder's page scripts to a 60 fps MP4.
# Copy templates/demo-kit/ next to (not inside) the app you're demoing, edit the CONFIG block, run:
#   bash record.sh            # full quality
#   SCALE=1 bash record.sh    # quicker preview
set -euo pipefail

# ── CONFIG ──────────────────────────────────────────────────────────────────────────────
APP_URL="${APP_URL:-http://localhost:3000}"     # base URL of the running app
START_PATH="/"                                   # page the first script runs on
LOGIN_PATH=""                                    # e.g. "/login"; leave empty if no sign-in is needed
AFTER_LOGIN=""                                   # regex for the page you land on after signing in, e.g. "/dashboard"
SCRIPTS=(1-page.js)                              # one script per page load, in order
WIDTH=1440; HEIGHT=900; FPS=60; SEED=7
NAME="demo"                                      # output: videos/$NAME.mp4
ONETAKE="${ONETAKE_DIR:-$HOME/one-take}"         # a clone of https://github.com/TharinduWijayarathna/one-take
# ────────────────────────────────────────────────────────────────────────────────────────

HERE="$(cd "$(dirname "$0")" && pwd)"
SCALE="${SCALE:-2}"
step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }

if [ ! -d "$ONETAKE" ]; then
  step "Cloning OneTake into $ONETAKE"
  git clone -q https://github.com/TharinduWijayarathna/one-take.git "$ONETAKE"
fi
[ -d "$ONETAKE/node_modules/playwright" ] || (cd "$ONETAKE" && npm install --no-audit --no-fund)
(cd "$ONETAKE" && npx playwright install chromium >/dev/null) || echo "⚠ could not run playwright install; continuing with the installed browser"

curl -s -o /dev/null -m 5 "$APP_URL$START_PATH" || { echo "✖ The app isn't answering at $APP_URL" >&2; exit 1; }

STORAGE=()
if [ -n "$LOGIN_PATH" ]; then
  if ! node "$ONETAKE/tools/save-login.js" --check "$APP_URL$START_PATH" --login "$LOGIN_PATH" --out "$HERE/auth.json"; then
    step "Sign in in the window that opens (saved to auth.json, keep it private)"
    node "$ONETAKE/tools/save-login.js" --url "$APP_URL$LOGIN_PATH" ${AFTER_LOGIN:+--until "$AFTER_LOGIN"} --out "$HERE/auth.json"
  fi
  STORAGE=(--storage "$HERE/auth.json")
fi

SCRIPT_ARGS=()
for s in "${SCRIPTS[@]}"; do SCRIPT_ARGS+=(--script "$HERE/$s"); done

step "Rendering at ${FPS} fps, ${WIDTH}×${HEIGHT} @ ${SCALE}×"
mkdir -p "$HERE/videos"
(cd "$ONETAKE" && node tools/record.js --url "$APP_URL$START_PATH" ${STORAGE[@]+"${STORAGE[@]}"} "${SCRIPT_ARGS[@]}" \
  --width "$WIDTH" --height "$HEIGHT" --scale "$SCALE" --fps "$FPS" --seed "$SEED" \
  --out "$HERE/videos" --name "$NAME")

step "Done: $HERE/videos/$NAME.mp4"
[ "$(uname)" = Darwin ] && open "$HERE/videos/$NAME.mp4" || true
