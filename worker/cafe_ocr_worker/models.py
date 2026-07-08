from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Literal


@dataclass(frozen=True)
class NormalizedRoi:
    x: float
    y: float
    width: float
    height: float

    def validate(self, name: str) -> None:
        values = (self.x, self.y, self.width, self.height)
        if any(value < 0 or value > 1 for value in values):
            raise ValueError(f"{name} ROI values must be between 0 and 1")

        if self.width <= 0 or self.height <= 0:
            raise ValueError(f"{name} ROI width and height must be greater than 0")

        if self.x + self.width > 1 or self.y + self.height > 1:
            raise ValueError(f"{name} ROI must fit within the image")


@dataclass(frozen=True)
class OcrTextResult:
    text: str
    confidence: float | None
    source: str


@dataclass(frozen=True)
class NumberDetection:
    main_number: int | None
    list_numbers: list[int]
    current_number: int
    raw_text: str
    confidence: float | None
    source: Literal["MAIN_NUMBER", "LIST_MAX"]


class DecisionKind(str, Enum):
    ACCEPT = "ACCEPT"
    REJECT = "REJECT"
    CONFIRM = "CONFIRM"


@dataclass(frozen=True)
class ValidationDecision:
    kind: DecisionKind
    number: int | None
    reason: str

    @property
    def accepted(self) -> bool:
        return self.kind == DecisionKind.ACCEPT and self.number is not None
