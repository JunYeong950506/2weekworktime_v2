export const WAIT_ESTIMATE_SAMPLE_NUMBERS = 5;

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
