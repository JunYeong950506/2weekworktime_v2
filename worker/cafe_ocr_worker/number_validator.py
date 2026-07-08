from __future__ import annotations

from dataclasses import dataclass

from .models import DecisionKind, NumberDetection, ValidationDecision


@dataclass
class DetectionState:
    last_accepted: int | None = None
    pending_number: int | None = None
    pending_count: int = 0

    def accept(self, number: int) -> None:
        self.last_accepted = number
        self.pending_number = None
        self.pending_count = 0

    def mark_pending(self, number: int) -> int:
        if self.pending_number == number:
            self.pending_count += 1
        else:
            self.pending_number = number
            self.pending_count = 1
        return self.pending_count


@dataclass(frozen=True)
class ValidatorConfig:
    min_confidence: float
    high_confidence: float
    max_forward_jump: int
    reset_drop: int
    confirmation_repeats: int


class NumberValidator:
    def __init__(self, config: ValidatorConfig) -> None:
        self.config = config

    def validate(self, detection: NumberDetection | None, state: DetectionState) -> ValidationDecision:
        if detection is None:
            return ValidationDecision(DecisionKind.REJECT, None, "EMPTY")

        candidate = detection.current_number
        if not 1 <= candidate <= 9999:
            return ValidationDecision(DecisionKind.REJECT, candidate, "OUT_OF_RANGE")

        confidence = detection.confidence
        if confidence is not None and confidence < self.config.min_confidence:
            return ValidationDecision(DecisionKind.REJECT, candidate, "LOW_CONFIDENCE")

        if state.last_accepted is None:
            return self._accept_or_confirm(candidate, state, "INITIAL_CONFIRMATION")

        diff = candidate - state.last_accepted
        if diff == 0:
            return ValidationDecision(DecisionKind.ACCEPT, candidate, "SAME_NUMBER")

        if 1 <= diff <= self.config.max_forward_jump:
            if confidence is None or confidence >= self.config.high_confidence:
                return ValidationDecision(DecisionKind.ACCEPT, candidate, "NORMAL_FORWARD")

            return self._accept_or_confirm(candidate, state, "FORWARD_CONFIRMATION")

        if diff < 0:
            if abs(diff) >= self.config.reset_drop:
                return self._accept_or_confirm(candidate, state, "RESET_CONFIRMATION")

            return ValidationDecision(DecisionKind.REJECT, candidate, "BACKWARD_NUMBER")

        return self._accept_or_confirm(candidate, state, "FORWARD_JUMP_CONFIRMATION")

    def _accept_or_confirm(
        self,
        candidate: int,
        state: DetectionState,
        reason: str,
    ) -> ValidationDecision:
        repeats = state.mark_pending(candidate)
        if repeats >= max(1, self.config.confirmation_repeats):
            return ValidationDecision(DecisionKind.ACCEPT, candidate, reason)

        return ValidationDecision(DecisionKind.CONFIRM, candidate, reason)
