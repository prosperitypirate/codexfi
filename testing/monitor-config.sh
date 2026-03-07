#!/bin/bash
# Monitor ~/.config/opencode/codexfi.jsonc for deletion
# Run in a separate terminal: bash monitor-config.sh

FILE="$HOME/.config/opencode/codexfi.jsonc"
echo "Monitoring: $FILE"
echo "PID: $$"
echo "Started: $(date)"
echo "---"

if [ ! -f "$FILE" ]; then
  echo "WARNING: File does not exist right now!"
  echo "Waiting for it to appear..."
  while [ ! -f "$FILE" ]; do sleep 0.2; done
  echo "File appeared at $(date)"
fi

echo "File exists. Watching for deletion..."

while true; do
  if [ ! -f "$FILE" ]; then
    echo ""
    echo "========================================"
    echo "DELETED at $(date)"
    echo "========================================"
    echo ""
    echo "-- Open files in ~/.config/opencode/ --"
    lsof +D "$HOME/.config/opencode/" 2>/dev/null || echo "(none)"
    echo ""
    echo "-- Processes with 'opencode' in name --"
    ps aux | grep -i opencode | grep -v grep | grep -v monitor-config || echo "(none)"
    echo ""
    echo "-- Processes with 'codexfi' in name --"
    ps aux | grep -i codexfi | grep -v grep | grep -v monitor-config || echo "(none)"
    echo ""
    echo "-- Processes with 'bun' in name --"
    ps aux | grep -i '[b]un' || echo "(none)"
    echo ""
    echo "-- Recent fs_usage (5s capture) --"
    echo "(requires sudo — skipping if not root)"
    if [ "$(id -u)" = "0" ]; then
      timeout 5 fs_usage -w -f filesys 2>/dev/null | grep -i codexfi || echo "(nothing caught)"
    fi
    echo ""
    echo "File gone. Waiting for it to reappear..."
    while [ ! -f "$FILE" ]; do sleep 0.5; done
    echo "File REAPPEARED at $(date). Resuming watch..."
  fi
  sleep 0.2
done
