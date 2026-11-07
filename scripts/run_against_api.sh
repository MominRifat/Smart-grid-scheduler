#!/usr/bin/env bash
# Re-run every public + evidence input against a RUNNING API and refresh the committed outputs.
#   docker compose up -d && ./scripts/run_against_api.sh            (default http://localhost:8088)
#   API=http://localhost:8000 ./scripts/run_against_api.sh
# Any new file dropped in inputs/ (e.g. the minute-150 update) gets outputs/<name>_output.json.
set -euo pipefail
API="${API:-http://localhost:8088}"
cd "$(dirname "$0")/.."

post() { # input output
  local t0=$(python3 -c 'import time;print(time.time())')
  code=$(curl -s -o "$2" -w '%{http_code}' -X POST "$API/api/roster" -H 'Content-Type: application/json' --data-binary @"$1")
  local dt=$(python3 -c "import time;print(f'{time.time()-$t0:.2f}s')")
  printf '%-58s HTTP %s %6s  %s\n' "$1" "$code" "$dt" "$(python3 -c "import json;d=json.load(open('$2'));print(d['status'], d.get('value_total',''), d.get('fuel_total_litres',''), d.get('solver',''))")"
}

mkdir -p outputs
for f in inputs/*.json; do
  name=$(basename "$f" .json); name=${name%_input}
  post "$f" "outputs/${name}_output.json"
done
post examples/minute150_predicted_input.json          outputs/minute150_predicted_output.json
post examples/worked_example_input.json               outputs/worked_example_output.json

for d in evidence/0*_broke; do
  for f in "$d"/input*.json; do
    out="${f/input/output}"; [ "$(basename "$f")" = "input.json" ] && out="$d/output_fixed.json"
    post "$f" "$out"
  done
done
for f in evidence/02_boundary/input_*.json; do post "$f" "${f/input_/output_}"; done

echo "--- independent rule check (scripts/validate_output.py)"
for f in inputs/*.json; do
  name=$(basename "$f" .json); name=${name%_input}
  python3 scripts/validate_output.py "$f" "outputs/${name}_output.json"
done
python3 scripts/validate_output.py examples/worked_example_input.json outputs/worked_example_output.json
for d in evidence/0*_broke; do python3 scripts/validate_output.py "$d/input.json" "$d/output_fixed.json"; done
