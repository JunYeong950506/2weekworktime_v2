from cafe_ocr_worker.models import NumberDetection
from cafe_ocr_worker.number_validator import DetectionState, NumberValidator, ValidatorConfig


def make_validator() -> NumberValidator:
    return NumberValidator(
        ValidatorConfig(
            min_confidence=70,
            high_confidence=90,
            max_forward_jump=10,
            reset_drop=100,
            confirmation_repeats=2,
        ),
    )


def make_detection(number: int, confidence: float | None = 95) -> NumberDetection:
    return NumberDetection(
        main_number=number,
        list_numbers=[],
        current_number=number,
        raw_text=str(number),
        confidence=confidence,
        source="MAIN_NUMBER",
    )


def test_normal_forward_high_confidence_is_accepted():
    state = DetectionState(last_accepted=198)
    decision = make_validator().validate(make_detection(200, 95), state)

    assert decision.accepted
    assert decision.reason == "NORMAL_FORWARD"


def test_forward_jump_requires_confirmation():
    state = DetectionState(last_accepted=198)
    validator = make_validator()

    first = validator.validate(make_detection(793, 95), state)
    second = validator.validate(make_detection(793, 95), state)

    assert not first.accepted
    assert first.reason == "FORWARD_JUMP_CONFIRMATION"
    assert second.accepted


def test_small_backward_number_is_rejected():
    state = DetectionState(last_accepted=230)
    decision = make_validator().validate(make_detection(229, 95), state)

    assert not decision.accepted
    assert decision.reason == "BACKWARD_NUMBER"


def test_large_backward_reset_requires_confirmation():
    state = DetectionState(last_accepted=230)
    validator = make_validator()

    first = validator.validate(make_detection(1, 95), state)
    second = validator.validate(make_detection(1, 95), state)

    assert not first.accepted
    assert first.reason == "RESET_CONFIRMATION"
    assert second.accepted


def test_false_high_number_recovers_from_consistent_main_and_list():
    state = DetectionState(last_accepted=99)
    validator = make_validator()
    for number in (76, 77, 78):
        detection = NumberDetection(number, list(range(number - 6, number)), number, str(number), 99, "MAIN_NUMBER")
        decision = validator.validate(detection, state)
        assert decision.accepted == (number == 78)
    assert decision.reason == "BACKWARD_RECOVERY"


def test_backward_recovery_requires_consecutive_coherent_detections():
    state = DetectionState(last_accepted=99)
    validator = make_validator()
    detection = NumberDetection(76, [75, 74, 73], 76, "76", 99, "MAIN_NUMBER")
    assert not validator.validate(detection, state).accepted
    validator.validate(make_detection(99), state)
    assert not validator.validate(detection, state).accepted
    assert not validator.validate(detection, state).accepted
