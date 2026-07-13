from datetime import datetime, timedelta, timezone

from cafe_ocr_worker.main import clear_debug_directory, is_capture_window


KST = timezone(timedelta(hours=9), "Asia/Seoul")


def test_capture_window_is_weekdays_from_6am_until_5pm():
    assert not is_capture_window(datetime(2026, 7, 13, 5, 59, tzinfo=KST))
    assert is_capture_window(datetime(2026, 7, 13, 6, 0, tzinfo=KST))
    assert is_capture_window(datetime(2026, 7, 13, 16, 59, tzinfo=KST))
    assert not is_capture_window(datetime(2026, 7, 13, 17, 0, tzinfo=KST))
    assert not is_capture_window(datetime(2026, 7, 12, 10, 0, tzinfo=KST))


def test_clear_debug_directory_removes_contents_and_keeps_directory(tmp_path):
    debug_dir = tmp_path / "debug"
    debug_dir.mkdir()
    (debug_dir / "rejected.png").write_bytes(b"image")
    nested_dir = debug_dir / "nested"
    nested_dir.mkdir()
    (nested_dir / "detail.txt").write_text("detail", encoding="utf-8")

    clear_debug_directory(debug_dir)

    assert debug_dir.is_dir()
    assert list(debug_dir.iterdir()) == []
