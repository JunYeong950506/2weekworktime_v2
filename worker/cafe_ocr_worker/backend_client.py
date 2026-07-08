from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

from .models import NumberDetection


def build_detection_payload(
    detection: NumberDetection,
    captured_at: datetime,
) -> dict[str, Any]:
    return {
        "currentNumber": detection.current_number,
        "mainNumber": detection.main_number,
        "listNumbers": detection.list_numbers,
        "rawOcr": detection.raw_text,
        "confidence": detection.confidence,
        "capturedAt": captured_at.astimezone(timezone.utc).isoformat(),
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
    ) -> dict[str, Any]:
        if not self.configured:
            raise RuntimeError("BACKEND_URL and OCR_WORKER_TOKEN are required")

        payload = build_detection_payload(detection, captured_at)

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                f"{self.backend_url}/api/internal/cafe-number",
                headers={"Authorization": f"Bearer {self.worker_token}"},
                json=payload,
            )
            response.raise_for_status()
            return response.json()
