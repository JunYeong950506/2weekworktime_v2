from __future__ import annotations

import argparse
import asyncio
import logging
import signal
from datetime import datetime, timezone
from pathlib import Path

from .backend_client import BackendClient
from .browser_capture import create_capture
from .digit_ocr import create_ocr_engine, detect_board_numbers
from .image_preprocessor import crop_normalized_roi, save_debug_image
from .models import DecisionKind
from .number_validator import DetectionState, NumberValidator, ValidatorConfig
from .settings import Settings

logger = logging.getLogger("cafe_ocr_worker")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def debug_path(settings: Settings, prefix: str, captured_at: datetime) -> Path:
    timestamp = captured_at.strftime("%Y%m%dT%H%M%S")
    return settings.debug_image_dir / f"{timestamp}_{prefix}.png"


async def run_worker(settings: Settings, once: bool = False) -> None:
    engine = create_ocr_engine(settings.ocr_engine)
    validator = NumberValidator(
        ValidatorConfig(
            min_confidence=settings.ocr_min_confidence,
            high_confidence=settings.ocr_high_confidence,
            max_forward_jump=settings.ocr_max_forward_jump,
            reset_drop=settings.ocr_reset_drop,
            confirmation_repeats=settings.ocr_confirmation_repeats,
        ),
    )
    state = DetectionState()
    backend = BackendClient(settings.backend_url, settings.ocr_worker_token)
    stop_event = asyncio.Event()
    last_sent_number: int | None = None

    def request_stop() -> None:
        logger.info("Shutdown requested")
        stop_event.set()

    for signal_name in ("SIGINT", "SIGTERM"):
        if hasattr(signal, signal_name):
            try:
                asyncio.get_running_loop().add_signal_handler(
                    getattr(signal, signal_name),
                    request_stop,
                )
            except (NotImplementedError, RuntimeError):
                signal.signal(getattr(signal, signal_name), lambda *_: request_stop())

    async with create_capture(settings) as capture:
        while not stop_event.is_set():
            captured_at = utc_now()

            try:
                frame = await capture.capture()
                panel = crop_normalized_roi(frame, settings.panel_roi)
                detection = detect_board_numbers(
                    panel,
                    engine,
                    settings.main_roi,
                    settings.list_roi,
                    settings.ocr_min_confidence,
                )
                decision = validator.validate(detection, state)

                if decision.accepted and detection is not None and decision.number is not None:
                    state.accept(decision.number)
                    logger.info(
                        "accepted number=%s source=%s confidence=%s list=%s",
                        detection.current_number,
                        detection.source,
                        detection.confidence,
                        detection.list_numbers,
                    )

                    if backend.configured and decision.number != last_sent_number:
                        response = await backend.send_detection(detection, captured_at)
                        last_sent_number = decision.number
                        logger.info("backend updated response=%s", response)
                    elif not backend.configured:
                        logger.info("backend not configured; skip sending number=%s", decision.number)
                    else:
                        logger.info("number=%s already sent; skip duplicate backend update", decision.number)

                elif decision.kind == DecisionKind.CONFIRM:
                    logger.info("pending candidate number=%s reason=%s", decision.number, decision.reason)
                else:
                    logger.warning("rejected candidate number=%s reason=%s", decision.number, decision.reason)
                    save_debug_image(debug_path(settings, "rejected", captured_at), panel)

            except Exception:
                logger.exception("Cafe OCR cycle failed")

            if once:
                break

            try:
                await asyncio.wait_for(stop_event.wait(), timeout=settings.poll_interval_seconds)
            except asyncio.TimeoutError:
                pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Cafe 701 OCR worker")
    parser.add_argument("--once", action="store_true", help="Run one capture/OCR cycle and exit")
    return parser.parse_args()


def cli() -> None:
    configure_logging()
    args = parse_args()
    settings = Settings()
    asyncio.run(run_worker(settings, once=args.once))


if __name__ == "__main__":
    cli()
