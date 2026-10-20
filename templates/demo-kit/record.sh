#!/usr/bin/env bash
# OneTake demo kit: renders tour.js to videos/<name>.mp4 using onetake.config.js.
# Copy templates/demo-kit/ next to (not inside) the app you're demoing, edit onetake.config.js
# and tour.js, then:
#   bash record.sh              check the tour, then render the video
#   bash record.sh --scale 1    any onetake flag works (quicker preview)
#   CHECK_ONLY=1 bash record.sh just the dry run
set -euo pipefail

# ── CONFIG ──────────────────────────────────────────────────────────────────────────────
LOGIN_PATH=""                 # e.g. "/login" when the app needs a sign-in; leave empty if not
AFTER_LOGIN=""                # regex for the page you land on after signing in, e.g. "/dashboard"
ONETAKE="${ONETAKE_DIR:-$HOME/one-take}"   # a clone of https://github.com/TharinduWijayarathna/one-take
# ────────────────────────────────────────────────────────────────────────────────────────

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }

if [ ! -d "$ONETAKE" ]; then
  step "Cloning OneTake into $ONETAKE"
  git clone -q https://github.com/TharinduWijayarathna/one-take.git "$ONETAKE"
fi
[ -d "$ONETAKE/node_modules/playwright" ] || (cd "$ONETAKE" && npm install --no-audit --no-fund)
(cd "$ONETAKE" && npx playwright install chromium >/dev/null) || echo "⚠ could not run playwright install; continuing with the installed browser"
OT=(node "$ONETAKE/bin/onetake.js")

URL="$(node -e "const c=require('./onetake.config.js'); console.log(c.url || '')")"
ORIGIN="$(node -e "try{console.log(new URL(process.argv[1]).origin)}catch(e){console.log('')}" "$URL")"
if [[ "$URL" == http* ]]; then
  curl -s -o /dev/null -m 5 "$URL" || { echo "✖ The app isn't answering at $URL" >&2; exit 1; }
fi

STORAGE=()
if [ -n "$LOGIN_PATH" ]; then
  if ! "${OT[@]}" login --check "$URL" --login "$LOGIN_PATH" --out "$HERE/auth.json"; then
    step "Sign in in the window that opens (saved to auth.json, keep it private)"
    "${OT[@]}" login --url "$ORIGIN$LOGIN_PATH" ${AFTER_LOGIN:+--until "$AFTER_LOGIN"} --out "$HERE/auth.json"
  fi
  STORAGE=(--storage "$HERE/auth.json")
fi

step "Checking the tour"
"${OT[@]}" check --speed 3 ${STORAGE[@]+"${STORAGE[@]}"} "$@"
[ -n "${CHECK_ONLY:-}" ] && exit 0

step "Rendering"
"${OT[@]}" record ${STORAGE[@]+"${STORAGE[@]}"} "$@"

NAME="$(node -e "console.log(require('./onetake.config.js').name || 'demo')")"
OUT="$(node -e "console.log(require('./onetake.config.js').out || 'recordings')")"
step "Done: $HERE/$OUT/$NAME.mp4"
[ "$(uname)" = Darwin ] && open "$HERE/$OUT/$NAME.mp4" || true
