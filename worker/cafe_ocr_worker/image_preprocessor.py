from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from .models import NormalizedRoi


def decode_image(image_bytes: bytes) -> np.ndarray:
    array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Failed to decode image bytes")
    return image


def load_image(path: str | Path) -> np.ndarray:
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Failed to load image: {path}")
    return image


def save_debug_image(path: str | Path, image: np.ndarray) -> None:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), image)


def crop_normalized_roi(image: np.ndarray, roi: NormalizedRoi) -> np.ndarray:
    height, width = image.shape[:2]
    x1 = max(0, min(width - 1, int(round(width * roi.x))))
    y1 = max(0, min(height - 1, int(round(height * roi.y))))
    x2 = max(x1 + 1, min(width, int(round(width * (roi.x + roi.width)))))
    y2 = max(y1 + 1, min(height, int(round(height * (roi.y + roi.height)))))
    return image[y1:y2, x1:x2]


def preprocess_variants(image: np.ndarray) -> list[np.ndarray]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    enlarged = cv2.resize(
        gray,
        None,
        fx=3.0,
        fy=3.0,
        interpolation=cv2.INTER_CUBIC,
    )

    denoised = cv2.fastNlMeansDenoising(enlarged, None, h=8)
    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8)).apply(denoised)

    _, otsu = cv2.threshold(
        clahe,
        0,
        255,
        cv2.THRESH_BINARY + cv2.THRESH_OTSU,
    )
    _, otsu_inv = cv2.threshold(
        clahe,
        0,
        255,
        cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU,
    )

    blurred = cv2.GaussianBlur(enlarged, (3, 3), 0)
    adaptive = cv2.adaptiveThreshold(
        blurred,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        7,
    )

    normalized = cv2.normalize(enlarged, None, 0, 255, cv2.NORM_MINMAX)
    return [enlarged, clahe, otsu, otsu_inv, adaptive, normalized]
