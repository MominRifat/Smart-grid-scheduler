"""CLI: python -m app input.json [output.json]  - exits 1 on invalid_input."""
import json
import sys
from pathlib import Path

from .roster import run_text


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python -m app input.json [output.json]", file=sys.stderr)
        return 2
    status, out = run_text(Path(sys.argv[1]).read_bytes())
    text = json.dumps(out, indent=2, ensure_ascii=False)
    if len(sys.argv) > 2:
        Path(sys.argv[2]).write_text(text + "\n")
    else:
        print(text)
    return 0 if status == 200 else 1


if __name__ == "__main__":
    sys.exit(main())
