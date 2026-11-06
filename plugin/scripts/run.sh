#!/bin/sh
# codexfi launcher — runs the bundled CLI with whichever JS runtime is present.
# Prefers Bun (fastest startup), then Node >= 22.5 (needs the built-in node:sqlite).
# Exits 0 silently when no runtime is found: a memory plugin must never break a session.
DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENTRY="$DIR/dist/codexfi.js"

if [ -n "$CODEXFI_RUNTIME" ] && command -v "$CODEXFI_RUNTIME" >/dev/null 2>&1; then
  exec "$CODEXFI_RUNTIME" "$ENTRY" "$@"
fi

BUN="$(command -v bun 2>/dev/null)"
[ -z "$BUN" ] && [ -x "$HOME/.bun/bin/bun" ] && BUN="$HOME/.bun/bin/bun"
if [ -n "$BUN" ]; then
  exec "$BUN" "$ENTRY" "$@"
fi

NODE="$(command -v node 2>/dev/null)"
if [ -n "$NODE" ] && "$NODE" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=5)?0:1)' 2>/dev/null; then
  exec "$NODE" "$ENTRY" "$@"
fi

LOGDIR="${CODEXFI_DATA_DIR:-$HOME/.codexfi}/logs"
mkdir -p "$LOGDIR" 2>/dev/null && echo "no usable runtime (need bun, or node >= 22.5) for: $*" >> "$LOGDIR/launcher.log"
exit 0
