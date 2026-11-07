#!/usr/bin/env bash
# Build the submission ZIP (source + inputs + outputs + evidence), without dependencies or build output.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-../who-stays-on.zip}"
rm -f "$OUT"
zip -qr "$OUT" . \
  -x '*/node_modules/*' '*/.venv/*' '*/__pycache__/*' '*/.pytest_cache/*' '*.coverage' \
     'frontend/dist/*' '.claude/*' '*.DS_Store' '.git/*'
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
