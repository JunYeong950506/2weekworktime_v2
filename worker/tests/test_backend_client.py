from datetime import datetime, timezone

from cafe_ocr_worker.backend_client import build_detection_payload
from cafe_ocr_worker.models import NumberDetection


def test_build_detection_payload_includes_main_and_list_numbers():
    detection = NumberDetection(
        main_number=None,
        list_numbers=[203, 202, 201],
        current_number=203,
        raw_text="list=203 202 201",
        confidence=91.5,
        source="LIST_MAX",
    )

    payload = build_detection_payload(
        detection,
        datetime(2026, 7, 8, 1, 2, 3, tzinfo=timezone.utc),
    )

    assert payload["currentNumber"] == 203
    assert payload["mainNumber"] is None
    assert payload["listNumbers"] == [203, 202, 201]
    assert payload["confidence"] == 91.5
    assert payload["capturedAt"] == "2026-07-08T01:02:03+00:00"
