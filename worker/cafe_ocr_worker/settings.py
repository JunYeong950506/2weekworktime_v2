from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from .models import NormalizedRoi

WORKER_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", WORKER_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    cafe_cctv_url: str = Field(default="https://www.hanwha701.com/")
    cafe_frame_selector: str = Field(default="img, canvas")
    cafe_refresh_button_selector: str = Field(default='button:has-text("새로고침")')
    capture_mode: Literal["click", "reload", "none", "fixture", "direct_image"] = "click"
    capture_settle_ms: int = 800
    poll_interval_seconds: float = 1.0
    direct_image_url: str = ""
    direct_image_timeout_seconds: float = 5.0

    change_detection_enabled: bool = True
    change_detection_resize_width: int = 180
    change_detection_mean_threshold: float = 2.0
    change_detection_changed_ratio: float = 0.01
    change_detection_pixel_threshold: int = 18
    force_ocr_interval_seconds: float = 30.0

    ocr_engine: Literal["rapidocr", "tesseract", "auto", "mock"] = "rapidocr"
    ocr_min_confidence: float = 70.0
    ocr_high_confidence: float = 90.0
    ocr_max_forward_jump: int = 10
    ocr_reset_drop: int = 100
    ocr_confirmation_repeats: int = 2

    ocr_panel_roi_x: float = 0.30
    ocr_panel_roi_y: float = 0.30
    ocr_panel_roi_width: float = 0.45
    ocr_panel_roi_height: float = 0.55

    ocr_main_roi_x: float = 0.00
    ocr_main_roi_y: float = 0.00
    ocr_main_roi_width: float = 0.55
    ocr_main_roi_height: float = 0.28

    ocr_list_roi_x: float = 0.00
    ocr_list_roi_y: float = 0.23
    ocr_list_roi_width: float = 0.55
    ocr_list_roi_height: float = 0.70

    backend_url: str = ""
    ocr_worker_token: str = ""
    backend_queue_size: int = 20
    debug_image_dir: Path = Path("./debug")

    fixture_image_path: Path | None = None
    fixture_image_dir: Path | None = None

    @field_validator(
        "capture_settle_ms",
        "ocr_max_forward_jump",
        "ocr_reset_drop",
        "ocr_confirmation_repeats",
        "change_detection_resize_width",
        "change_detection_pixel_threshold",
        "backend_queue_size",
    )
    @classmethod
    def non_negative_integer(cls, value: int) -> int:
        if value < 0:
            raise ValueError("value must be non-negative")
        return value

    @field_validator("poll_interval_seconds", "direct_image_timeout_seconds")
    @classmethod
    def positive_interval(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("value must be greater than 0")
        return value

    @field_validator(
        "change_detection_mean_threshold",
        "change_detection_changed_ratio",
        "force_ocr_interval_seconds",
    )
    @classmethod
    def non_negative_float(cls, value: float) -> float:
        if value < 0:
            raise ValueError("value must be non-negative")
        return value

    @field_validator("fixture_image_path", "fixture_image_dir", mode="before")
    @classmethod
    def empty_path_to_none(cls, value: object) -> object | None:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("backend_url")
    @classmethod
    def trim_backend_url(cls, value: str) -> str:
        return value.rstrip("/")

    @model_validator(mode="after")
    def validate_rois(self) -> "Settings":
        self.panel_roi.validate("OCR_PANEL")
        self.main_roi.validate("OCR_MAIN")
        self.list_roi.validate("OCR_LIST")
        return self

    @property
    def panel_roi(self) -> NormalizedRoi:
        return NormalizedRoi(
            self.ocr_panel_roi_x,
            self.ocr_panel_roi_y,
            self.ocr_panel_roi_width,
            self.ocr_panel_roi_height,
        )

    @property
    def main_roi(self) -> NormalizedRoi:
        return NormalizedRoi(
            self.ocr_main_roi_x,
            self.ocr_main_roi_y,
            self.ocr_main_roi_width,
            self.ocr_main_roi_height,
        )

    @property
    def list_roi(self) -> NormalizedRoi:
        return NormalizedRoi(
            self.ocr_list_roi_x,
            self.ocr_list_roi_y,
            self.ocr_list_roi_width,
            self.ocr_list_roi_height,
        )
