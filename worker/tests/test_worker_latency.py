import asyncio
import threading
import time
from contextlib import asynccontextmanager

import numpy as np

from cafe_ocr_worker import main
from cafe_ocr_worker.models import NumberDetection
from cafe_ocr_worker.settings import Settings


def test_unchanged_pending_number_is_rechecked_without_blocking_event_loop(monkeypatch, caplog):
    captures = 0
    ocr_threads = []
    heartbeat_count = 0

    class Capture:
        async def capture(self):
            nonlocal captures
            captures += 1
            return np.full((500, 500, 3), (210, 180, 175), dtype=np.uint8)

    @asynccontextmanager
    async def create_capture(settings):
        yield Capture()

    def detect(*args):
        ocr_threads.append(threading.get_ident())
        time.sleep(0.03)
        return NumberDetection(76, [75, 74, 73], 76, "76", 99, "MAIN_NUMBER")

    async def run():
        async def heartbeat():
            nonlocal heartbeat_count
            while True:
                heartbeat_count += 1
                await asyncio.sleep(0.002)

        task = asyncio.create_task(heartbeat())
        try:
            await main.run_worker(Settings(backend_url="", ocr_worker_token="", poll_interval_seconds=0.001))
        finally:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    monkeypatch.setattr(main, "create_capture", create_capture)
    monkeypatch.setattr(main, "create_ocr_engine", lambda name: object())
    monkeypatch.setattr(main, "detect_board_numbers", detect)
    monkeypatch.setattr(main, "is_capture_window", lambda now: captures < 2)
    with caplog.at_level("INFO"):
        asyncio.run(run())
    assert len(ocr_threads) == 2
    assert all(thread != threading.get_ident() for thread in ocr_threads)
    assert heartbeat_count >= 5
    assert "accepted number=76" in caplog.text
