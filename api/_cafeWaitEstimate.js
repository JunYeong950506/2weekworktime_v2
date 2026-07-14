export const WAIT_ESTIMATE_SAMPLE_NUMBERS = 5;
const MAX_FORWARD_NUMBER_JUMP = 10;

export function calculateRecentWaitEstimate(detections) {
  const segments = [];
  let lastNumber = null;
  let lastCapturedAtMs = null;

  for (const detection of [...detections].reverse()) {
    const number = detection?.candidate_number;
    const capturedAtMs = Date.parse(detection?.captured_at ?? '');

    if (!Number.isInteger(number) || Number.isNaN(capturedAtMs)) {
      continue;
    }

    if (lastNumber === null || lastCapturedAtMs === null) {
      lastNumber = number;
      lastCapturedAtMs = capturedAtMs;
      continue;
    }

    if (number === lastNumber) {
      continue;
    }

    const numberDelta = number - lastNumber;
    const elapsedSeconds = (capturedAtMs - lastCapturedAtMs) / 1000;
    lastNumber = number;
    lastCapturedAtMs = capturedAtMs;

    if (
      numberDelta <= 0
      || numberDelta > MAX_FORWARD_NUMBER_JUMP
      || elapsedSeconds <= 0
    ) {
      segments.length = 0;
      continue;
    }

    segments.push({ numberDelta, elapsedSeconds });
  }

  let remainingNumbers = WAIT_ESTIMATE_SAMPLE_NUMBERS;
  let sampleNumbers = 0;
  let sampleSeconds = 0;

  for (const segment of [...segments].reverse()) {
    const usedNumbers = Math.min(remainingNumbers, segment.numberDelta);
    sampleNumbers += usedNumbers;
    sampleSeconds += segment.elapsedSeconds * usedNumbers / segment.numberDelta;
    remainingNumbers -= usedNumbers;

    if (remainingNumbers === 0) {
      break;
    }
  }

  return {
    secondsPerNumber: sampleNumbers === WAIT_ESTIMATE_SAMPLE_NUMBERS
      ? sampleSeconds / sampleNumbers
      : null,
    sampleNumbers,
  };
}

export function calculateEstimatedWaitMinutes({
  currentNumber,
  targetNumber,
  advanceCount,
  secondsPerNumber,
  sampleNumbers,
}) {
  if (
    !Number.isInteger(currentNumber) ||
    !Number.isInteger(targetNumber) ||
    !Number.isInteger(advanceCount) ||
    !Number.isFinite(secondsPerNumber) ||
    secondsPerNumber <= 0 ||
    !Number.isInteger(sampleNumbers) ||
    sampleNumbers < WAIT_ESTIMATE_SAMPLE_NUMBERS
  ) {
    return null;
  }

  const remainingNumbers = targetNumber - advanceCount - currentNumber;
  if (remainingNumbers <= 0) {
    return 0;
  }

  return Math.max(1, Math.round((remainingNumbers * secondsPerNumber) / 60));
}
