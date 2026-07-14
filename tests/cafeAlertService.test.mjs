import assert from 'node:assert/strict';

import { resolveCafeCurrentNumber } from '../api/_cafeAlertService.js';
import { calculateEstimatedWaitMinutes } from '../api/_cafeWaitEstimate.js';

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
      sampleNumbers: 5,
    }),
    11,
  );
});

run('wait estimate remains unavailable before five number samples', () => {
  assert.equal(
    calculateEstimatedWaitMinutes({
      currentNumber: 100,
      targetNumber: 110,
      advanceCount: 3,
      secondsPerNumber: 90,
      sampleNumbers: 4,
    }),
    null,
  );
});
