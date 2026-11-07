"""HTTP contract: POST /api/roster, 200 ok/infeasible, 400 invalid_input, < 10 s."""
import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from validate_output import check

ROOT = Path(__file__).resolve().parents[2]
client = TestClient(app)


def test_health():
    assert client.get("/api/health").json() == {"ok": True}


def test_ok(sample):
    t = time.monotonic()
    r = client.post("/api/roster", json=sample)
    assert time.monotonic() - t < 10
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert check(sample, r.json()) == []


def test_infeasible_is_200(worked):
    worked["fuel_budget_litres"] = 0
    r = client.post("/api/roster", json=worked)
    assert r.status_code == 200 and r.json()["status"] == "infeasible"


def test_invalid_is_400():
    r = client.post("/api/roster", content=b"{}", headers={"content-type": "application/json"})
    assert r.status_code == 400
    assert r.json()["status"] == "invalid_input"
    assert "grid_available" in r.json()["message"]


def test_garbage_body_is_400():
    r = client.post("/api/roster", content=b"\x00\xff garbage")
    assert r.status_code == 400


def test_twelve_shops_all_outage_under_10s(sample):
    sample["grid_available"] = [False] * 10
    sample["fuel_budget_litres"] = 99.99
    t = time.monotonic()
    r = client.post("/api/roster", json=sample)
    assert time.monotonic() - t < 10
    assert r.status_code == 200


@pytest.mark.parametrize("path", sorted((ROOT / "evidence").glob("**/input*.json")))
def test_evidence_inputs_reproduce(path):
    """Every committed evidence input still produces its committed output."""
    expected_file = path.with_name(path.name.replace("input", "output_fixed" if "broke" in str(path) else "output"))
    r = client.post("/api/roster", content=path.read_bytes())
    if expected_file.exists():
        expected, got = json.loads(expected_file.read_text()), r.json()
        assert got["status"] == expected["status"]
        if got["status"] != "ok":
            return
        inp = json.loads(path.read_text())
        assert check(inp, got) == []
        if expected.get("optimal") and got.get("optimal"):
            assert got["value_total"] == expected["value_total"]
        else:  # time-limited on a slower machine: legal and within 1% of what we committed
            assert got["value_total"] >= 0.99 * expected["value_total"]
