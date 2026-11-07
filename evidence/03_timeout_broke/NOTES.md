# Broke: an input that took longer than the 10-second limit

**Input:** `input.json`, made by our random stress generator. It has 12 shops, 33 kW generator, 4-level fuel table, 10 outage hours, max 2 dark hours in a row.

**Earlier version:** `solve()` maximised `value * BIG - fuel` in one model with a fixed 4 s limit. It then re-solved every dark cell for its explanation under a separate 4 s budget. Measured on this input: **10.09 s** wall time, and `"optimal": false`. That breaks the brief's "under 10 seconds per input". We did not keep that version's output file. The numbers come from our stress-run log.

**Fix** (`backend/app/solver.py`, `roster.py`, `timebudget.py`):
1. The solve is now lexicographic: maximise value first, then minimise diesel at that value. It produces the same answer from two smaller objectives.
2. A single `Deadline` (7.5 s) is shared by the main solve, the explanations and the diagnosis. Explanations use only what is left. When time runs out they fall back to the local reason, which still has numbers.
3. If the main solve is not proven optimal, the backup solver also runs and the better legal roster wins.

**Fixed output:** `output_fixed.json`, answered in under 9 s. The test `tests/test_backup.py::test_hardest_known_inputs_answer_within_10_seconds` keeps this from coming back.
