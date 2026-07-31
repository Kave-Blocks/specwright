#!/usr/bin/env bash
# Stop gate — runs when the session tries to finish and blocks (exit 2) if lint
# fails, feeding the errors back as work that must be addressed.
#
# stop_hook_active guard is load-bearing: without it, a lint error the model
# cannot fix becomes an infinite stop/continue loop.
set -uo pipefail

payload=$(cat 2>/dev/null)

already_looping=$(node -e '
  const s = process.argv[1];
  try { console.log(JSON.parse(s).stop_hook_active === true ? "1" : "0"); } catch { console.log("0"); }
' "$payload" 2>/dev/null)
[ "$already_looping" = "1" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -x node_modules/.bin/eslint ] || exit 0      # no eslint installed
node -e 'process.exit(require("./package.json").scripts?.lint ? 0 : 1)' 2>/dev/null || exit 0

if ! out=$(npm run --silent lint 2>&1); then
  {
    echo "BLOCKED: npm run lint failed. Fix these before finishing:"
    echo "$out" | tail -40
  } >&2
  exit 2
fi
