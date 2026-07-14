from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from datetime import datetime

ESTIMATE_WINDOW_NUMBERS = 5


@dataclass(frozen=True)
class WaitTimeEstimate:
    seconds_per_number: float | None
    sample_numbers: int


@dataclass(frozen=True)
class WaitTimeSegment:
    number_delta: int
    elapsed_seconds: float


class WaitTimeEstimator:
    def __init__(self, window_numbers: int = ESTIMATE_WINDOW_NUMBERS, max_number_jump: int = 10) -> None:
        self.window_numbers = window_numbers
        self.max_number_jump = max_number_jump
        self._segments: deque[WaitTimeSegment] = deque(maxlen=20)
        self._last_number: int | None = None
        self._last_changed_at: datetime | None = None

    def reset(self) -> None:
        self._segments.clear()
        self._last_number = None
        self._last_changed_at = None

    def record(self, number: int, captured_at: datetime) -> WaitTimeEstimate:
        if self._last_number is None or self._last_changed_at is None:
            self._last_number = number
            self._last_changed_at = captured_at
            return self.current_estimate()

        if number == self._last_number:
            return self.current_estimate()

        number_delta = number - self._last_number
        elapsed_seconds = (captured_at - self._last_changed_at).total_seconds()
        self._last_number = number
        self._last_changed_at = captured_at

        if number_delta <= 0 or number_delta > self.max_number_jump or elapsed_seconds <= 0:
            self._segments.clear()
            return self.current_estimate()

        self._segments.append(WaitTimeSegment(number_delta, elapsed_seconds))
        return self.current_estimate()

    def current_estimate(self) -> WaitTimeEstimate:
        remaining_numbers = self.window_numbers
        sampled_numbers = 0
        sampled_seconds = 0.0

        for segment in reversed(self._segments):
            used_numbers = min(remaining_numbers, segment.number_delta)
            sampled_numbers += used_numbers
            sampled_seconds += segment.elapsed_seconds * used_numbers / segment.number_delta
            remaining_numbers -= used_numbers
            if remaining_numbers == 0:
                break

        if sampled_numbers < self.window_numbers:
            return WaitTimeEstimate(None, sampled_numbers)

        return WaitTimeEstimate(sampled_seconds / sampled_numbers, sampled_numbers)
