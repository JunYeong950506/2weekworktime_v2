import numpy as np
import asyncio
from contextlib import asynccontextmanager

from cafe_ocr_worker.board_validator import coherent_list_numbers, is_number_board


def test_light_number_board_with_dark_digits_passes():
    image = np.full((280, 230, 3), (210, 180, 175), dtype=np.uint8)
    image[25:70, 80:120] = 30
    image[140:175, 30:60] = 30
    assert is_number_board(image)


def test_black_white_and_brown_screens_are_rejected():
    for color in ((0, 0, 0), (255, 255, 255), (100, 125, 145)):
        assert not is_number_board(np.full((280, 230, 3), color, dtype=np.uint8))


def test_partly_occluded_board_is_rejected():
    image = np.full((280, 230, 3), (210, 180, 175), dtype=np.uint8)
    image[:, 115:] = (100, 125, 145)
    assert not is_number_board(image)


def test_numeric_outliers_are_removed_without_inventing_values():
    assert coherent_list_numbers([66, 65, 64, 63, 62, 61, 99, 1600]) == [61, 62, 63, 64, 65, 66]


def test_sparse_and_ambiguous_numbers_fail_closed():
    assert coherent_list_numbers([1600, 2040, 44, 1440]) == []
    assert coherent_list_numbers([1, 2]) == []
    assert coherent_list_numbers([1, 2, 3, 50, 51, 52]) == []


def test_non_board_never_reaches_ocr_or_backend(monkeypatch):
    from cafe_ocr_worker import main
    from cafe_ocr_worker.settings import Settings

    class Capture:
        async def capture(self):
            return np.zeros((500, 500, 3), dtype=np.uint8)

    @asynccontextmanager
    async def create_capture(settings):
        yield Capture()

    def unexpected(*args, **kwargs):
        raise AssertionError("non-board reached OCR or backend")

    monkeypatch.setattr(main, "create_capture", create_capture)
    monkeypatch.setattr(main, "create_ocr_engine", lambda name: object())
    monkeypatch.setattr(main, "detect_board_numbers", unexpected)
    monkeypatch.setattr(main.QueuedBackendSender, "enqueue", unexpected)
    asyncio.run(main.run_worker(Settings(backend_url="", ocr_worker_token=""), once=True))
