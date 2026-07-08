import numpy as np

from cafe_ocr_worker.digit_ocr import MockOcrEngine, detect_board_numbers, extract_numbers
from cafe_ocr_worker.models import NormalizedRoi


def test_extract_numbers_keeps_valid_unique_numbers():
    assert extract_numbers("Cafe 203 202 202 0000 10000 abc 198") == [203, 202, 198]


def test_detect_board_numbers_uses_main_number_first():
    image = np.zeros((100, 200, 3), dtype=np.uint8)
    engine = MockOcrEngine("282 281 280", 100)

    detection = detect_board_numbers(
        image,
        engine,
        NormalizedRoi(0, 0, 0.5, 0.3),
        NormalizedRoi(0, 0.3, 0.5, 0.7),
        70,
    )

    assert detection is not None
    assert detection.current_number == 282
    assert detection.source == "MAIN_NUMBER"


def test_detect_board_numbers_falls_back_to_list_max_when_main_is_empty():
    image = np.zeros((100, 200, 3), dtype=np.uint8)

    class RegionEngine:
        name = "region-mock"
        calls = 0

        def recognize(self, _image):
            self.calls += 1
            text = "" if self.calls <= 6 else "203 202 201 200 199 198"
            from cafe_ocr_worker.models import OcrTextResult

            return [OcrTextResult(text, 100, self.name)] if text else []

    detection = detect_board_numbers(
        image,
        RegionEngine(),
        NormalizedRoi(0, 0, 0.5, 0.3),
        NormalizedRoi(0, 0.3, 0.5, 0.7),
        70,
    )

    assert detection is not None
    assert detection.current_number == 203
    assert detection.main_number is None
    assert detection.source == "LIST_MAX"
