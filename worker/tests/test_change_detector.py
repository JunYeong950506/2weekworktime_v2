import numpy as np

from cafe_ocr_worker.change_detector import RoiChangeDetector


def test_change_detector_skips_identical_roi():
    detector = RoiChangeDetector(
        resize_width=32,
        mean_threshold=2.0,
        changed_ratio_threshold=0.01,
        pixel_threshold=18,
    )
    image = np.zeros((40, 80, 3), dtype=np.uint8)

    first = detector.check(image)
    second = detector.check(image.copy())

    assert first.changed
    assert first.reason == "INITIAL_FRAME"
    assert not second.changed
    assert second.reason == "UNCHANGED"


def test_change_detector_detects_number_area_change():
    detector = RoiChangeDetector(
        resize_width=32,
        mean_threshold=2.0,
        changed_ratio_threshold=0.01,
        pixel_threshold=18,
    )
    before = np.zeros((40, 80, 3), dtype=np.uint8)
    after = before.copy()
    after[10:30, 20:60] = 255

    detector.check(before)
    result = detector.check(after)

    assert result.changed
    assert result.reason == "CHANGED"
    assert result.mean_diff is not None and result.mean_diff > 0
