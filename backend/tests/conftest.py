import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "backend"))


def load(rel: str) -> dict:
    return json.loads((ROOT / rel).read_text())


@pytest.fixture
def worked():
    return load("examples/worked_example_input.json")


@pytest.fixture
def sample():
    return load("inputs/sample_input.json")
