from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class ChangeDetectionResult:
    changed: bool
    mean_diff: float | None
    changed_ratio: float | None
    reason: str


class RoiChangeDetector:
    def __init__(
        self,
        resize_width: int,
        mean_threshold: float,
        changed_ratio_threshold: float,
        pixel_threshold: int,
    ) -> None:
        self.resize_width = max(16, resize_width)
        self.mean_threshold = mean_threshold
        self.changed_ratio_threshold = changed_ratio_threshold
        self.pixel_threshold = pixel_threshold
        self._previous: np.ndarray | None = None

    def check(self, image: np.ndarray) -> ChangeDetectionResult:
        current = self._fingerprint(image)
        previous = self._previous
        self._previous = current

        if previous is None:
            return ChangeDetectionResult(True, None, None, "INITIAL_FRAME")

        diff = cv2.absdiff(current, previous)
        mean_diff = float(np.mean(diff))
        changed_ratio = float(np.count_nonzero(diff >= self.pixel_threshold) / diff.size)
        changed = (
            mean_diff >= self.mean_threshold
            or changed_ratio >= self.changed_ratio_threshold
        )

        return ChangeDetectionResult(
            changed,
            mean_diff,
            changed_ratio,
            "CHANGED" if changed else "UNCHANGED",
        )

    def _fingerprint(self, image: np.ndarray) -> np.ndarray:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
        height, width = gray.shape[:2]
        scale = self.resize_width / max(1, width)
        resize_height = max(16, int(round(height * scale)))
        resized = cv2.resize(
            gray,
            (self.resize_width, resize_height),
            interpolation=cv2.INTER_AREA,
        )
        return cv2.GaussianBlur(resized, (5, 5), 0)
