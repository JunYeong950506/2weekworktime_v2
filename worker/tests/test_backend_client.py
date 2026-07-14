from datetime import datetime, timezone

import pytest

from cafe_ocr_worker.backend_client import QueuedBackendSender, build_detection_payload
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


@pytest.mark.asyncio
async def test_queued_backend_sender_deduplicates_numbers():
    class RecordingBackend:
        def __init__(self):
            self.sent: list[int] = []

        async def send_detection(self, detection, captured_at):
            del captured_at
            self.sent.append(detection.current_number)
            return {"ok": True}

    detection = NumberDetection(
        main_number=205,
        list_numbers=[],
        current_number=205,
        raw_text="205",
        confidence=95,
        source="MAIN_NUMBER",
    )
    backend = RecordingBackend()
    sender = QueuedBackendSender(backend, max_queue_size=2)
    sender.start()

    assert sender.enqueue(detection, datetime(2026, 7, 8, tzinfo=timezone.utc))
    assert not sender.enqueue(detection, datetime(2026, 7, 8, tzinfo=timezone.utc))

    await sender.stop()

    assert backend.sent == [205]
