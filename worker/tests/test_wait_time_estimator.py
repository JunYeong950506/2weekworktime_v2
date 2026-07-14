from datetime import datetime, timedelta, timezone

from cafe_ocr_worker.wait_time_estimator import WaitTimeEstimator


def test_estimate_uses_recent_five_number_changes_with_weighted_segments():
    estimator = WaitTimeEstimator()
    started_at = datetime(2026, 7, 14, 1, 0, tzinfo=timezone.utc)

    estimator.record(100, started_at)
    estimator.record(101, started_at + timedelta(minutes=1))
    estimate = estimator.record(104, started_at + timedelta(minutes=7))
    assert estimate.seconds_per_number is None
    assert estimate.sample_numbers == 4

    estimate = estimator.record(105, started_at + timedelta(minutes=9))

    assert estimate.sample_numbers == 5
    assert estimate.seconds_per_number == 108.0


def test_same_number_keeps_its_original_change_time():
    estimator = WaitTimeEstimator()
    started_at = datetime(2026, 7, 14, 1, 0, tzinfo=timezone.utc)

    estimator.record(100, started_at)
    estimator.record(100, started_at + timedelta(minutes=2))
    estimate = estimator.record(101, started_at + timedelta(minutes=5))

    assert estimate.sample_numbers == 1
    assert estimate.seconds_per_number is None


def test_reset_or_large_jump_discards_previous_estimate_samples():
    estimator = WaitTimeEstimator()
    started_at = datetime(2026, 7, 14, 1, 0, tzinfo=timezone.utc)

    estimator.record(100, started_at)
    estimator.record(101, started_at + timedelta(minutes=1))
    estimator.record(120, started_at + timedelta(minutes=3))
    estimate = estimator.record(121, started_at + timedelta(minutes=4))

    assert estimate.seconds_per_number is None
    assert estimate.sample_numbers == 1


def test_reset_discards_samples_after_an_invalid_ocr_cycle():
    estimator = WaitTimeEstimator()
    started_at = datetime(2026, 7, 14, 1, 0, tzinfo=timezone.utc)

    estimator.record(100, started_at)
    estimator.record(101, started_at + timedelta(minutes=1))
    estimator.reset()
    estimate = estimator.record(102, started_at + timedelta(minutes=3))

    assert estimate.seconds_per_number is None
    assert estimate.sample_numbers == 0
