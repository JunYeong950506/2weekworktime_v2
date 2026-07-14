from __future__ import annotations

import argparse
import asyncio
import logging
import signal
import shutil
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .backend_client import BackendClient, QueuedBackendSender
from .browser_capture import create_capture
from .change_detector import RoiChangeDetector
from .digit_ocr import create_ocr_engine, detect_board_numbers
from .image_preprocessor import crop_normalized_roi, save_debug_image
from .models import DecisionKind
from .number_validator import DetectionState, NumberValidator, ValidatorConfig
from .settings import Settings
from .wait_time_estimator import WaitTimeEstimator

logger = logging.getLogger("cafe_ocr_worker")
KOREA_TIMEZONE = timezone(timedelta(hours=9), "Asia/Seoul")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def korea_now() -> datetime:
    return datetime.now(KOREA_TIMEZONE)


def is_capture_window(now: datetime) -> bool:
    local_now = now.astimezone(KOREA_TIMEZONE)
    return local_now.weekday() < 5 and 6 <= local_now.hour < 17


def clear_debug_directory(directory: Path) -> None:
    if not directory.exists():
        return

    for path in directory.iterdir():
        try:
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()
        except OSError:
            logger.warning("Failed to remove debug artifact path=%s", path)


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def debug_path(settings: Settings, prefix: str, captured_at: datetime) -> Path:
    timestamp = captured_at.strftime("%Y%m%dT%H%M%S")
    return settings.debug_image_dir / f"{timestamp}_{prefix}.png"


async def run_worker(settings: Settings, once: bool = False) -> None:
    if not once and not is_capture_window(korea_now()):
        logger.info("Outside weekday capture window; skip worker start")
        clear_debug_directory(settings.debug_image_dir)
        return

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
    wait_time_estimator = WaitTimeEstimator(max_number_jump=settings.ocr_max_forward_jump)
    backend = BackendClient(settings.backend_url, settings.ocr_worker_token)
    backend_sender = QueuedBackendSender(backend, settings.backend_queue_size)
    stop_event = asyncio.Event()
    last_ocr_at: datetime | None = None
    scheduled_stop = False
    change_detector = (
        RoiChangeDetector(
            resize_width=settings.change_detection_resize_width,
            mean_threshold=settings.change_detection_mean_threshold,
            changed_ratio_threshold=settings.change_detection_changed_ratio,
            pixel_threshold=settings.change_detection_pixel_threshold,
        )
        if settings.change_detection_enabled
        else None
    )

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

    if backend.configured:
        backend_sender.start()

    try:
        async with create_capture(settings) as capture:
            while not stop_event.is_set():
                if not once and not is_capture_window(korea_now()):
                    scheduled_stop = True
                    logger.info("Weekday capture window ended; stopping worker")
                    break

                cycle_started_at = time.perf_counter()

                try:
                    frame = await capture.capture()
                    captured_at = utc_now()
                    capture_elapsed = time.perf_counter() - cycle_started_at
                    panel = crop_normalized_roi(frame, settings.panel_roi)

                    skip_ocr = should_skip_ocr(change_detector, panel, captured_at, last_ocr_at, settings)
                    if skip_ocr:
                        logger.info("panel unchanged; skip OCR capture_seconds=%.2f", capture_elapsed)
                    else:
                        ocr_started_at = time.perf_counter()
                        detection = detect_board_numbers(
                            panel,
                            engine,
                            settings.main_roi,
                            settings.list_roi,
                            settings.ocr_min_confidence,
                        )
                        last_ocr_at = captured_at
                        decision = validator.validate(detection, state)
                        ocr_elapsed = time.perf_counter() - ocr_started_at

                        if decision.accepted and detection is not None and decision.number is not None:
                            wait_estimate = wait_time_estimator.record(decision.number, captured_at)
                            state.accept(decision.number)
                            logger.info(
                                "accepted number=%s source=%s confidence=%s list=%s capture_seconds=%.2f ocr_seconds=%.2f",
                                detection.current_number,
                                detection.source,
                                detection.confidence,
                                detection.list_numbers,
                                capture_elapsed,
                                ocr_elapsed,
                            )

                            if backend.configured:
                                queued = backend_sender.enqueue(detection, captured_at, wait_estimate)
                                if queued:
                                    logger.info("backend enqueue number=%s", decision.number)
                                else:
                                    logger.info("number=%s already queued or sent; skip duplicate backend update", decision.number)
                            else:
                                logger.info("backend not configured; skip sending number=%s", decision.number)

                        elif decision.kind == DecisionKind.CONFIRM:
                            logger.info("pending candidate number=%s reason=%s", decision.number, decision.reason)
                        else:
                            wait_time_estimator.reset()
                            logger.warning("rejected candidate number=%s reason=%s", decision.number, decision.reason)
                            save_debug_image(debug_path(settings, "rejected", captured_at), panel)

                except Exception:
                    wait_time_estimator.reset()
                    logger.exception("Cafe OCR cycle failed")

                if once:
                    break

                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=settings.poll_interval_seconds)
                except asyncio.TimeoutError:
                    pass
    finally:
        if backend.configured:
            await backend_sender.stop()
        if scheduled_stop:
            clear_debug_directory(settings.debug_image_dir)


def should_skip_ocr(
    change_detector: RoiChangeDetector | None,
    panel,
    captured_at: datetime,
    last_ocr_at: datetime | None,
    settings: Settings,
) -> bool:
    if change_detector is None:
        return False

    result = change_detector.check(panel)
    force_due = (
        settings.force_ocr_interval_seconds <= 0
        or last_ocr_at is None
        or (captured_at - last_ocr_at).total_seconds() >= settings.force_ocr_interval_seconds
    )

    if result.changed or force_due:
        logger.info(
            "panel change check reason=%s mean_diff=%s changed_ratio=%s force_due=%s",
            result.reason,
            format_metric(result.mean_diff),
            format_metric(result.changed_ratio),
            force_due,
        )
        return False

    logger.info(
        "panel change check reason=%s mean_diff=%s changed_ratio=%s",
        result.reason,
        format_metric(result.mean_diff),
        format_metric(result.changed_ratio),
    )
    return True


def format_metric(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.4f}"


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
