from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Iterable

import httpx
import numpy as np

from .image_preprocessor import decode_image, load_image
from .settings import Settings

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def iter_fixture_paths(settings: Settings) -> Iterable[Path]:
    if settings.fixture_image_path:
        yield settings.fixture_image_path
        return

    if settings.fixture_image_dir:
        paths = [
            path
            for path in settings.fixture_image_dir.iterdir()
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
        ]
        yield from sorted(paths)


class FixtureCapture:
    def __init__(self, settings: Settings) -> None:
        self._paths = list(iter_fixture_paths(settings))
        self._index = 0

        if not self._paths:
            raise ValueError("FIXTURE_IMAGE_PATH or FIXTURE_IMAGE_DIR is required for fixture capture")

    async def __aenter__(self) -> "FixtureCapture":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        del exc_type, exc, tb

    async def capture(self) -> np.ndarray:
        path = self._paths[self._index % len(self._paths)]
        self._index += 1
        return load_image(path)


class BrowserCapture:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._playwright = None
        self._browser = None
        self._page = None

    async def __aenter__(self) -> "BrowserCapture":
        try:
            from playwright.async_api import async_playwright
        except ImportError as error:
            raise RuntimeError("playwright is not installed") from error

        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(headless=True)
        self._page = await self._browser.new_page(viewport={"width": 1280, "height": 900})
        await self._page.goto(self.settings.cafe_cctv_url, wait_until="domcontentloaded")
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        del exc_type, exc, tb

        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()

    async def capture(self) -> np.ndarray:
        if self._page is None:
            raise RuntimeError("BrowserCapture is not initialized")

        if self.settings.capture_mode == "reload":
            await self._page.reload(wait_until="domcontentloaded")
        elif self.settings.capture_mode == "click":
            refresh = self._page.locator(self.settings.cafe_refresh_button_selector).first
            try:
                await refresh.click(timeout=5000)
            except Exception:
                await self._page.reload(wait_until="domcontentloaded")

        if self.settings.capture_settle_ms > 0:
            await asyncio.sleep(self.settings.capture_settle_ms / 1000)

        frame = self._page.locator(self.settings.cafe_frame_selector).first
        await frame.wait_for(state="visible", timeout=15000)
        image_bytes = await frame.screenshot()
        return decode_image(image_bytes)


class DirectImageCapture:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "DirectImageCapture":
        if not self.settings.direct_image_url:
            raise ValueError("DIRECT_IMAGE_URL is required when CAPTURE_MODE=direct_image")

        self._client = httpx.AsyncClient(
            timeout=self.settings.direct_image_timeout_seconds,
            headers={
                "Referer": self.settings.cafe_cctv_url,
                "User-Agent": "Mozilla/5.0 CafeOcrWorker/1.0",
            },
        )
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        del exc_type, exc, tb

        if self._client:
            await self._client.aclose()

    async def capture(self) -> np.ndarray:
        if self._client is None:
            raise RuntimeError("DirectImageCapture is not initialized")

        response = await self._client.get(self.settings.direct_image_url)
        response.raise_for_status()
        return decode_image(response.content)


def create_capture(settings: Settings) -> BrowserCapture | DirectImageCapture | FixtureCapture:
    if settings.capture_mode == "fixture" or settings.fixture_image_path or settings.fixture_image_dir:
        return FixtureCapture(settings)

    if settings.capture_mode == "direct_image":
        return DirectImageCapture(settings)

    return BrowserCapture(settings)
