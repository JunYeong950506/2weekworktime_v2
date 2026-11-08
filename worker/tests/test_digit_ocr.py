import numpy as np

from cafe_ocr_worker.digit_ocr import MockOcrEngine, detect_board_numbers, extract_numbers, recognize_region_numbers
from cafe_ocr_worker.models import NormalizedRoi


def test_fast_path_stops_after_three_agreeing_high_confidence_images():
    from cafe_ocr_worker.models import OcrTextResult

    class Engine:
        calls = 0

        def recognize(self, image):
            self.calls += 1
            return [OcrTextResult("76", 99, "mock")]

    engine = Engine()
    numbers, _, _ = recognize_region_numbers(np.zeros((100, 200, 3), dtype=np.uint8), engine, 70, fast_min_numbers=1)
    assert numbers == [76]
    assert engine.calls == 3


def test_uncertain_fast_path_uses_all_variants():
    from cafe_ocr_worker.models import OcrTextResult

    class Engine:
        calls = 0

        def recognize(self, image):
            self.calls += 1
            return [OcrTextResult("99" if self.calls == 1 else "76", 99, "mock")]

    engine = Engine()
    numbers, _, _ = recognize_region_numbers(np.zeros((100, 200, 3), dtype=np.uint8), engine, 70, fast_min_numbers=1)
    assert numbers == [76]
    assert engine.calls == 6


def test_region_discards_outlier_seen_in_only_two_variants():
    from cafe_ocr_worker.models import OcrTextResult

    class Engine:
        calls = 0

        def recognize(self, image):
            self.calls += 1
            text = "66 65 64 63 62 61" + (" 99" if self.calls <= 2 else "")
            return [OcrTextResult(text, 99, "mock")]

    numbers, _, _ = recognize_region_numbers(np.zeros((100, 200, 3), dtype=np.uint8), Engine(), 70)
    assert numbers == [66, 65, 64, 63, 62, 61]


def test_non_board_numeric_text_cannot_produce_detection():
    image = np.zeros((100, 200, 3), dtype=np.uint8)
    assert detect_board_numbers(
        image, MockOcrEngine("1600 2040 44 1440", 99),
        NormalizedRoi(0, 0, 1, 0.4), NormalizedRoi(0, 0.4, 1, 0.6), 70,
    ) is None


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


def test_detect_board_numbers_ignores_main_number_lower_than_list_max():
    image = np.zeros((100, 200, 3), dtype=np.uint8)

    class RegionEngine:
        name = "region-mock"
        calls = 0

        def recognize(self, _image):
            self.calls += 1
            text = "9" if self.calls <= 3 else "60 59 58 57 56 55"
            from cafe_ocr_worker.models import OcrTextResult

            return [OcrTextResult(text, 100, self.name)]

    detection = detect_board_numbers(
        image,
        RegionEngine(),
        NormalizedRoi(0, 0, 0.5, 0.3),
        NormalizedRoi(0, 0.3, 0.5, 0.7),
        70,
    )

    assert detection is not None
    assert detection.current_number == 60
    assert detection.main_number is None
    assert detection.source == "LIST_MAX"
