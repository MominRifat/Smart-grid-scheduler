"""Cross-platform script to test running API and regenerate outputs.
Works seamlessly on Windows, Linux, and macOS.

Usage:
    python scripts/run_against_api.py [API_URL]
Default API_URL is http://localhost:8000 (or http://localhost:8088 if Docker is used).
"""
import sys
import os
import json
import time
from pathlib import Path
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parent.parent
API_URL = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("API", "http://localhost:8000")

def post_file(in_path: Path, out_path: Path):
    t0 = time.time()
    data = in_path.read_bytes()
    req = urllib.request.Request(
        f"{API_URL}/api/roster",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    code = 0
    body = b""
    try:
        with urllib.request.urlopen(req) as resp:
            code = resp.status
            body = resp.read()
    except urllib.error.HTTPError as e:
        code = e.code
        body = e.read()
    except Exception as e:
        print(f"Failed to connect to API at {API_URL}: {e}")
        return False

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(body)
    dt = f"{time.time() - t0:.2f}s"
    
    summary = ""
    try:
        d = json.loads(body.decode("utf-8"))
        summary = f"{d.get('status','')} {d.get('value_total','')} {d.get('fuel_total_litres','')} {d.get('solver','')}"
    except Exception:
        summary = "parse_err"
    
    rel_in = in_path.relative_to(ROOT)
    print(f"{str(rel_in):<55} HTTP {code} {dt:>6}  {summary}")
    return True

def main():
    print(f"Testing against API: {API_URL}")
    outputs_dir = ROOT / "outputs"
    outputs_dir.mkdir(exist_ok=True)

    # 1. Inputs
    for inp in sorted((ROOT / "inputs").glob("*.json")):
        name = inp.stem
        if name.endswith("_input"):
            name = name[:-6]
        post_file(inp, outputs_dir / f"{name}_output.json")

    # 2. Examples
    for ex in ["minute150_predicted_input.json", "worked_example_input.json"]:
        p = ROOT / "examples" / ex
        if p.exists():
            out_name = ex.replace("_input", "_output")
            post_file(p, outputs_dir / out_name)

    # 3. Evidence broke
    for broke_dir in sorted((ROOT / "evidence").glob("0*_broke")):
        for f in sorted(broke_dir.glob("input*.json")):
            out_name = "output_fixed.json" if f.name == "input.json" else f.name.replace("input", "output")
            post_file(f, broke_dir / out_name)

    # 4. Boundary
    boundary_dir = ROOT / "evidence" / "02_boundary"
    if boundary_dir.exists():
        for f in sorted(boundary_dir.glob("input_*.json")):
            out_name = f.name.replace("input_", "output_")
            post_file(f, boundary_dir / out_name)

    print("\n--- Running Independent Validator (scripts/validate_output.py) ---")
    sys.path.insert(0, str(ROOT / "scripts"))
    import validate_output

    for inp in sorted((ROOT / "inputs").glob("*.json")):
        name = inp.stem
        if name.endswith("_input"):
            name = name[:-6]
        out = outputs_dir / f"{name}_output.json"
        if out.exists():
            try:
                i_data = json.loads(inp.read_text(encoding="utf-8"))
                o_data = json.loads(out.read_text(encoding="utf-8"))
                errs = validate_output.check(i_data, o_data)
                status_str = "OK" if not errs else f"FAIL: {errs}"
                print(f"[VALIDATE] {inp.name} -> {status_str}")
            except Exception as e:
                print(f"[VALIDATE] {inp.name} -> Error: {e}")

    ex_inp = ROOT / "examples" / "worked_example_input.json"
    ex_out = outputs_dir / "worked_example_output.json"
    if ex_inp.exists() and ex_out.exists():
        errs = validate_output.check(
            json.loads(ex_inp.read_text(encoding="utf-8")),
            json.loads(ex_out.read_text(encoding="utf-8"))
        )
        print(f"[VALIDATE] worked_example -> {'OK' if not errs else f'FAIL: {errs}'}")

if __name__ == "__main__":
    main()
