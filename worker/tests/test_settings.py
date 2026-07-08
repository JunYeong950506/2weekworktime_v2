from cafe_ocr_worker.settings import Settings


def test_empty_fixture_paths_are_none():
    settings = Settings(
        capture_mode="none",
        fixture_image_path="",
        fixture_image_dir="",
    )

    assert settings.fixture_image_path is None
    assert settings.fixture_image_dir is None
