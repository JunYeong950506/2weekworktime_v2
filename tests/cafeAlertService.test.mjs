import assert from 'node:assert/strict';

import { resolveCafeCurrentNumber } from '../api/_cafeAlertService.js';
import { calculateEstimatedWaitMinutes, calculateRecentWaitEstimate } from '../api/_cafeWaitEstimate.js';

function run(name, testBody) {
  try {
    testBody();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run('main number wins when it is at least list max', () => {
  assert.deepEqual(
    resolveCafeCurrentNumber({
      mainNumber: 61,
      listNumbers: [60, 59, 58, 57, 56, 55],
    }),
    {
      currentNumber: 61,
      detectionSource: 'MAIN_NUMBER',
      detectedNumbers: [60, 59, 58, 57, 56, 55],
      rawOcr: 'main=61; list=60,59,58,57,56,55',
    },
  );
});

run('list max wins when OCR main number is lower than list max', () => {
  assert.deepEqual(
    resolveCafeCurrentNumber({
      mainNumber: 9,
      listNumbers: [60, 59, 58, 57, 56, 55],
    }),
    {
      currentNumber: 60,
      detectionSource: 'LIST_MAX',
      detectedNumbers: [60, 59, 58, 57, 56, 55],
      rawOcr: 'list=60,59,58,57,56,55',
    },
  );
});

run('wait estimate targets the configured alert trigger number', () => {
  assert.equal(
    calculateEstimatedWaitMinutes({
      currentNumber: 100,
      targetNumber: 110,
      advanceCount: 3,
      secondsPerNumber: 90,
      sampleMeasurements: 10,
    }),
    11,
  );
});

run('wait estimate remains unavailable before ten measurement samples', () => {
  assert.equal(
    calculateEstimatedWaitMinutes({
      currentNumber: 100,
      targetNumber: 110,
      advanceCount: 3,
      secondsPerNumber: 90,
      sampleMeasurements: 9,
    }),
    null,
  );
});

run('wait estimate selects ten recent measurements instead of a number range', () => {
  const estimate = calculateRecentWaitEstimate([
    { candidate_number: 275, captured_at: '2026-07-14T00:11:00Z' },
    { candidate_number: 274, captured_at: '2026-07-14T00:09:00Z' },
    { candidate_number: 272, captured_at: '2026-07-14T00:08:00Z' },
    { candidate_number: 270, captured_at: '2026-07-14T00:07:00Z' },
    { candidate_number: 269, captured_at: '2026-07-14T00:06:00Z' },
    { candidate_number: 267, captured_at: '2026-07-14T00:05:00Z' },
    { candidate_number: 265, captured_at: '2026-07-14T00:04:00Z' },
    { candidate_number: 264, captured_at: '2026-07-14T00:03:00Z' },
    { candidate_number: 262, captured_at: '2026-07-14T00:02:00Z' },
    { candidate_number: 260, captured_at: '2026-07-14T00:01:00Z' },
    { candidate_number: 250, captured_at: '2026-07-14T00:00:00Z' },
  ]);

  assert.deepEqual(estimate, { secondsPerNumber: 40, sampleMeasurements: 10 });
});

run('wait estimate uses detections recorded before an alert is registered', () => {
  const estimate = calculateRecentWaitEstimate([
    { candidate_number: 270, captured_at: '2026-07-14T00:05:00Z' },
    { candidate_number: 269, captured_at: '2026-07-14T00:04:00Z' },
    { candidate_number: 268, captured_at: '2026-07-14T00:02:00Z' },
    { candidate_number: 266, captured_at: '2026-07-14T00:01:00Z' },
    { candidate_number: 265, captured_at: '2026-07-14T00:00:00Z' },
    { candidate_number: 264, captured_at: '2026-07-13T23:59:00Z' },
    { candidate_number: 263, captured_at: '2026-07-13T23:58:00Z' },
    { candidate_number: 262, captured_at: '2026-07-13T23:57:00Z' },
    { candidate_number: 261, captured_at: '2026-07-13T23:56:00Z' },
    { candidate_number: 260, captured_at: '2026-07-13T23:55:00Z' },
  ]);

  assert.deepEqual(estimate, { secondsPerNumber: 60, sampleMeasurements: 10 });
  assert.equal(
    calculateEstimatedWaitMinutes({
      currentNumber: 270,
      targetNumber: 290,
      advanceCount: 3,
      secondsPerNumber: estimate.secondsPerNumber,
      sampleMeasurements: estimate.sampleMeasurements,
    }),
    17,
  );
});

run('wait estimate keeps the first timestamp for duplicate numbers', () => {
  const estimate = calculateRecentWaitEstimate([
    { candidate_number: 269, captured_at: '2026-07-14T00:04:00Z' },
    { candidate_number: 268, captured_at: '2026-07-14T00:03:00Z' },
    { candidate_number: 267, captured_at: '2026-07-14T00:02:00Z' },
    { candidate_number: 266, captured_at: '2026-07-14T00:01:00Z' },
    { candidate_number: 265, captured_at: '2026-07-14T00:00:30Z' },
    { candidate_number: 265, captured_at: '2026-07-14T00:00:00Z' },
    { candidate_number: 264, captured_at: '2026-07-13T23:59:00Z' },
    { candidate_number: 263, captured_at: '2026-07-13T23:58:00Z' },
    { candidate_number: 262, captured_at: '2026-07-13T23:57:00Z' },
    { candidate_number: 261, captured_at: '2026-07-13T23:56:00Z' },
    { candidate_number: 260, captured_at: '2026-07-13T23:55:00Z' },
  ]);

  assert.deepEqual(estimate, { secondsPerNumber: 60, sampleMeasurements: 10 });
});
