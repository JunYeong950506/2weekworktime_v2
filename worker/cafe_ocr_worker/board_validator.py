from __future__ import annotations

import cv2
import numpy as np


def is_number_board(image: np.ndarray) -> bool:
    if image.ndim != 3 or image.shape[2] != 3 or min(image.shape[:2]) < 20:
        return False

    # The fixed display has a light blue/lavender background across both number regions.
    pixels = cv2.resize(image, (80, 100)).astype(np.int16)
    blue, green, red = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
    background = (
        (blue >= 100)
        & (green >= 85)
        & (red >= 70)
        & (blue - red >= 8)
        & (blue - green >= 0)
        & (green - red >= -30)
    )
    return bool(
        background.mean() >= 0.45
        and all(region.mean() >= 0.30 for region in (
            background[:40, :40], background[:40, 40:],
            background[40:, :40], background[40:, 40:],
        ))
    )


def coherent_list_numbers(numbers: list[int]) -> list[int]:
    values = sorted(set(numbers))
    groups = [[value for value in values if start <= value <= start + 12] for start in values]
    if not groups:
        return []
    largest = max(map(len, groups))
    candidates = {tuple(group) for group in groups if len(group) == largest}
    if largest < 3 or len(candidates) != 1:
        return []
    return list(next(iter(candidates)))
