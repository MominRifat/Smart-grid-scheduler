"""Rule 8: invalid_input names the field and exits non-zero (CLI) / HTTP 400 (API)."""
import json
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent


def cli(path, *extra):
    return subprocess.run([sys.executable, "-m", "app", str(path), *extra], cwd=BACKEND, capture_output=True, text=True, timeout=30)


def test_cli_ok_exits_zero(tmp_path):
    out = tmp_path / "out.json"
    r = cli(ROOT / "examples/worked_example_input.json", out)
    assert r.returncode == 0
    assert json.loads(out.read_text())["value_total"] == 84


def test_cli_invalid_exits_nonzero(tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_text('{"grid_available": [true]}')
    r = cli(bad)
    assert r.returncode == 1
    assert json.loads(r.stdout)["status"] == "invalid_input"
