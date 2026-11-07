"""One time budget per request, shared by every solver call (no third-party imports)."""
import time


class Deadline:
    """So a response never takes longer than the brief's 10 s."""

    def __init__(self, seconds: float):
        self.end = time.monotonic() + seconds

    def left(self, reserve: float = 0.0) -> float:
        return max(0.05, self.end - time.monotonic() - reserve)
