#!/usr/bin/env bash
# PostToolUse gate — runs after every Edit/Write and blocks (exit 2) if the repo
# stops type-checking. Runs outside the model's control: a claim of "verified"
# in the transcript cannot substitute for this exiting 0.
#
# Every guard below exits 0 (pass) rather than failing, so the gate can never
# fail for a reason unrelated to the edit.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -f tsconfig.json ] || exit 0                 # not a TypeScript project
[ -x node_modules/.bin/tsc ] || exit 0         # deps not installed

# Only pay the typecheck cost when a TS/TSX file actually changed.
edited=$(node -e '
  let s = "";
  process.stdin.on("data", d => (s += d)).on("end", () => {
    try { console.log(JSON.parse(s).tool_input?.file_path ?? ""); } catch { console.log(""); }
  });
' 2>/dev/null)

case "$edited" in
  *.ts|*.tsx|*.mts|*.cts) ;;
  *) exit 0 ;;
esac

if ! out=$(node_modules/.bin/tsc --noEmit 2>&1); then
  {
    echo "BLOCKED: tsc --noEmit failed after editing ${edited}."
    echo "Fix these type errors before continuing:"
    echo "$out" | head -40
  } >&2
  exit 2
fi
