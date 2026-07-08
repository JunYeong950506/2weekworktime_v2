from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from typing import Protocol

import numpy as np

from .image_preprocessor import crop_normalized_roi, preprocess_variants
from .models import NormalizedRoi, NumberDetection, OcrTextResult

DIGIT_PATTERN = re.compile(r"(?<!\d)\d{1,4}(?!\d)")


class OcrEngine(Protocol):
    name: str

    def recognize(self, image: np.ndarray) -> list[OcrTextResult]:
        ...


@dataclass
class MockOcrEngine:
    text: str = ""
    confidence: float = 100.0
    name: str = "mock"

    def recognize(self, image: np.ndarray) -> list[OcrTextResult]:
        del image
        return [OcrTextResult(self.text, self.confidence, self.name)] if self.text else []


class RapidOcrEngine:
    name = "rapidocr"

    def __init__(self) -> None:
        try:
            from rapidocr_onnxruntime import RapidOCR
        except ImportError as error:
            raise RuntimeError("rapidocr-onnxruntime is not installed") from error

        self._engine = RapidOCR()

    def recognize(self, image: np.ndarray) -> list[OcrTextResult]:
        result, _ = self._engine(image)
        outputs: list[OcrTextResult] = []

        for item in result or []:
            text = ""
            confidence: float | None = None
            if len(item) >= 2:
                text = str(item[1])
            if len(item) >= 3:
                try:
                    confidence = float(item[2]) * 100
                except (TypeError, ValueError):
                    confidence = None
            if text:
                outputs.append(OcrTextResult(text, confidence, self.name))

        return outputs


class TesseractOcrEngine:
    name = "tesseract"

    def __init__(self) -> None:
        try:
            import pytesseract
        except ImportError as error:
            raise RuntimeError("pytesseract is not installed") from error

        self._pytesseract = pytesseract

    def recognize(self, image: np.ndarray) -> list[OcrTextResult]:
        config = "--oem 3 --psm 6 -c tessedit_char_whitelist=0123456789"
        data = self._pytesseract.image_to_data(
            image,
            output_type=self._pytesseract.Output.DICT,
            config=config,
        )
        outputs: list[OcrTextResult] = []

        for text, confidence in zip(data.get("text", []), data.get("conf", []), strict=False):
            cleaned = str(text).strip()
            if not cleaned:
                continue

            parsed_confidence: float | None
            try:
                parsed_confidence = float(confidence)
            except (TypeError, ValueError):
                parsed_confidence = None

            outputs.append(OcrTextResult(cleaned, parsed_confidence, self.name))

        if not outputs:
            text = self._pytesseract.image_to_string(image, config=config).strip()
            if text:
                outputs.append(OcrTextResult(text, None, self.name))

        return outputs


class AutoOcrEngine:
    name = "auto"

    def __init__(self) -> None:
        engines: list[OcrEngine] = []
        for factory in (RapidOcrEngine, TesseractOcrEngine):
            try:
                engines.append(factory())
            except RuntimeError:
                continue

        if not engines:
            raise RuntimeError("No OCR engine is available")

        self._engines = engines

    def recognize(self, image: np.ndarray) -> list[OcrTextResult]:
        outputs: list[OcrTextResult] = []
        for engine in self._engines:
            outputs.extend(engine.recognize(image))
        return outputs


def create_ocr_engine(name: str) -> OcrEngine:
    if name == "rapidocr":
        return RapidOcrEngine()
    if name == "tesseract":
        return TesseractOcrEngine()
    if name == "auto":
        return AutoOcrEngine()
    if name == "mock":
        return MockOcrEngine()

    raise ValueError(f"Unsupported OCR engine: {name}")


def extract_numbers(text: str) -> list[int]:
    numbers: list[int] = []
    seen = set()

    for match in DIGIT_PATTERN.findall(text):
        value = int(match)
        if not 1 <= value <= 9999 or value in seen:
            continue
        seen.add(value)
        numbers.append(value)

    return numbers


def average_confidence(results: list[OcrTextResult]) -> float | None:
    values = [result.confidence for result in results if result.confidence is not None and result.confidence >= 0]
    if not values:
        return None
    return sum(values) / len(values)


def recognize_region_numbers(
    image: np.ndarray,
    engine: OcrEngine,
    min_confidence: float,
) -> tuple[list[int], str, float | None]:
    all_results: list[OcrTextResult] = []

    for variant in preprocess_variants(image):
        all_results.extend(engine.recognize(variant))

    accepted_results = [
        result
        for result in all_results
        if result.confidence is None or result.confidence >= min_confidence
    ]
    raw_text = " ".join(result.text for result in accepted_results).strip()
    confidence = average_confidence(accepted_results)
    counts: Counter[int] = Counter()

    for result in accepted_results:
        for number in extract_numbers(result.text):
            counts[number] += 1

    numbers = [
        number
        for number, _ in sorted(counts.items(), key=lambda item: (-item[1], -item[0]))
    ]
    return numbers, raw_text, confidence


def detect_board_numbers(
    panel_image: np.ndarray,
    engine: OcrEngine,
    main_roi: NormalizedRoi,
    list_roi: NormalizedRoi,
    min_confidence: float,
) -> NumberDetection | None:
    main_image = crop_normalized_roi(panel_image, main_roi)
    list_image = crop_normalized_roi(panel_image, list_roi)

    main_numbers, main_text, main_confidence = recognize_region_numbers(
        main_image,
        engine,
        min_confidence,
    )
    list_numbers, list_text, list_confidence = recognize_region_numbers(
        list_image,
        engine,
        min_confidence,
    )

    main_number = max(main_numbers) if main_numbers else None
    list_max = max(list_numbers) if list_numbers else None
    if main_number is not None and list_max is not None and main_number < list_max:
        main_number = None

    if main_number is not None:
        return NumberDetection(
            main_number=main_number,
            list_numbers=list_numbers,
            current_number=main_number,
            raw_text=f"main={main_text}; list={list_text}".strip(),
            confidence=main_confidence,
            source="MAIN_NUMBER",
        )

    if list_max is None:
        return None

    return NumberDetection(
        main_number=None,
        list_numbers=list_numbers,
        current_number=list_max,
        raw_text=f"list={list_text}".strip(),
        confidence=list_confidence,
        source="LIST_MAX",
    )
