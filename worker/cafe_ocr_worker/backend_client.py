from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

from .models import NumberDetection
from .wait_time_estimator import WaitTimeEstimate

logger = logging.getLogger("cafe_ocr_worker.backend_client")


def build_detection_payload(
    detection: NumberDetection,
    captured_at: datetime,
    wait_estimate: WaitTimeEstimate,
) -> dict[str, Any]:
    return {
        "currentNumber": detection.current_number,
        "mainNumber": detection.main_number,
        "listNumbers": detection.list_numbers,
        "rawOcr": detection.raw_text,
        "confidence": detection.confidence,
        "capturedAt": captured_at.astimezone(timezone.utc).isoformat(),
        "estimatedSecondsPerNumber": wait_estimate.seconds_per_number,
        "estimateSampleNumbers": wait_estimate.sample_numbers,
    }


class BackendClient:
    def __init__(
        self,
        backend_url: str,
        worker_token: str,
        timeout_seconds: float = 10.0,
    ) -> None:
        self.backend_url = backend_url.rstrip("/")
        self.worker_token = worker_token
        self.timeout_seconds = timeout_seconds

    @property
    def configured(self) -> bool:
        return bool(self.backend_url and self.worker_token)

    async def send_detection(
        self,
        detection: NumberDetection,
        captured_at: datetime,
        wait_estimate: WaitTimeEstimate,
    ) -> dict[str, Any]:
        if not self.configured:
            raise RuntimeError("BACKEND_URL and OCR_WORKER_TOKEN are required")

        payload = build_detection_payload(detection, captured_at, wait_estimate)

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                f"{self.backend_url}/api/internal/cafe-number",
                headers={"Authorization": f"Bearer {self.worker_token}"},
                json=payload,
            )
            response.raise_for_status()
            return response.json()


@dataclass(frozen=True)
class QueuedDetection:
    detection: NumberDetection
    captured_at: datetime
    wait_estimate: WaitTimeEstimate


class QueuedBackendSender:
    def __init__(self, backend: BackendClient, max_queue_size: int = 20) -> None:
        self.backend = backend
        self._queue: asyncio.Queue[QueuedDetection | None] = asyncio.Queue(maxsize=max(1, max_queue_size))
        self._pending_numbers: set[int] = set()
        self._last_sent_number: int | None = None
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    def enqueue(
        self,
        detection: NumberDetection,
        captured_at: datetime,
        wait_estimate: WaitTimeEstimate,
    ) -> bool:
        number = detection.current_number
        if number in self._pending_numbers or number == self._last_sent_number:
            return False

        if self._queue.full():
            self._drop_oldest_pending()

        try:
            self._queue.put_nowait(QueuedDetection(detection, captured_at, wait_estimate))
        except asyncio.QueueFull:
            logger.warning("backend queue is full; skip number=%s", number)
            return False

        self._pending_numbers.add(number)
        return True

    async def stop(self) -> None:
        if self._task is None:
            return

        await self._queue.join()
        await self._queue.put(None)
        await self._task
        self._task = None

    async def _run(self) -> None:
        while True:
            item = await self._queue.get()
            try:
                if item is None:
                    return

                number = item.detection.current_number
                try:
                    response = await self.backend.send_detection(
                        item.detection,
                        item.captured_at,
                        item.wait_estimate,
                    )
                    self._last_sent_number = number
                    logger.info("backend updated number=%s response=%s", number, response)
                except Exception:
                    logger.exception("backend update failed number=%s", number)
                finally:
                    self._pending_numbers.discard(number)
            finally:
                self._queue.task_done()

    def _drop_oldest_pending(self) -> None:
        try:
            item = self._queue.get_nowait()
        except asyncio.QueueEmpty:
            return

        try:
            if item is not None:
                self._pending_numbers.discard(item.detection.current_number)
                logger.warning("backend queue full; drop pending number=%s", item.detection.current_number)
        finally:
            self._queue.task_done()
