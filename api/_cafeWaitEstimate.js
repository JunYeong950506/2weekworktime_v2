export const WAIT_ESTIMATE_SAMPLE_MEASUREMENTS = 5;

export function calculateRecentWaitEstimate(detections) {
  const measurements = [];
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
      measurements.push({ number, capturedAtMs });
      continue;
    }

    if (number === lastNumber) {
      continue;
    }

    const numberDelta = number - lastNumber;
    const elapsedSeconds = (capturedAtMs - lastCapturedAtMs) / 1000;
    lastNumber = number;
    lastCapturedAtMs = capturedAtMs;

    if (numberDelta <= 0 || elapsedSeconds <= 0) {
      measurements.length = 0;
      measurements.push({ number, capturedAtMs });
      continue;
    }

    measurements.push({ number, capturedAtMs });
  }

  const recentMeasurements = measurements.slice(-WAIT_ESTIMATE_SAMPLE_MEASUREMENTS);
  if (recentMeasurements.length < WAIT_ESTIMATE_SAMPLE_MEASUREMENTS) {
    return {
      secondsPerNumber: null,
      sampleMeasurements: recentMeasurements.length,
    };
  }

  let totalNumberDelta = 0;
  let totalElapsedSeconds = 0;
  for (let index = 1; index < recentMeasurements.length; index += 1) {
    const previous = recentMeasurements[index - 1];
    const current = recentMeasurements[index];
    totalNumberDelta += current.number - previous.number;
    totalElapsedSeconds += (current.capturedAtMs - previous.capturedAtMs) / 1000;
  }

  return {
    secondsPerNumber: totalNumberDelta > 0 ? totalElapsedSeconds / totalNumberDelta : null,
    sampleMeasurements: recentMeasurements.length,
  };
}

export function calculateEstimatedWaitMinutes({
  currentNumber,
  targetNumber,
  advanceCount,
  secondsPerNumber,
  sampleMeasurements,
}) {
  if (
    !Number.isInteger(currentNumber) ||
    !Number.isInteger(targetNumber) ||
    !Number.isInteger(advanceCount) ||
    !Number.isFinite(secondsPerNumber) ||
    secondsPerNumber <= 0 ||
    !Number.isInteger(sampleMeasurements) ||
    sampleMeasurements < WAIT_ESTIMATE_SAMPLE_MEASUREMENTS
  ) {
    return null;
  }

  const remainingNumbers = targetNumber - advanceCount - currentNumber;
  if (remainingNumbers <= 0) {
    return 0;
  }

  return Math.max(1, Math.round((remainingNumbers * secondsPerNumber) / 60));
}
