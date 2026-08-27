import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dayjs from 'dayjs';
import ts from 'typescript';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function importOvertimeAllowance() {
  const sourcePath = resolve(rootDir, 'src/utils/overtimeAllowance.ts');
  const outPath = resolve(rootDir, 'tests/.tmp/overtimeAllowance.mjs');
  const source = await readFile(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2020,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, compiled);
  return import(`${pathToFileURL(outPath).href}?v=${Date.now()}`);
}

function record(date, claimedOtMinutes) {
  return {
    date,
    claimedOtMinutes,
  };
}

const {
  buildOvertimeAllowanceEstimates,
  calculateEstimatedOvertimePay,
  getMonthlyClaimedOvertimeMinutes,
} = await importOvertimeAllowance();

const periods = [
  {
    id: 'july',
    label: '7월',
    startDate: '2026-07-01',
    createdAt: '2026-07-01T00:00:00.000Z',
    records: [record('2026-07-05', 368), record('2026-07-07', 210), record('2026-08-02', 300)],
  },
  {
    id: 'august',
    label: '8월',
    startDate: '2026-08-01',
    createdAt: '2026-08-01T00:00:00.000Z',
    records: [record('2026-08-03', 200), record('2026-08-25', 60)],
  },
];

assert.equal(getMonthlyClaimedOvertimeMinutes(periods, '2026-07'), 578);
assert.equal(getMonthlyClaimedOvertimeMinutes(periods, '2026-08'), 560);
assert.equal(calculateEstimatedOvertimePay(3080, 13888), 1069380);

const [currentEstimate, nextEstimate] = buildOvertimeAllowanceEstimates(
  periods,
  13888,
  dayjs('2026-08-27'),
);

assert.equal(currentEstimate.payMonth, '2026-08');
assert.equal(currentEstimate.workMonth, '2026-07');
assert.equal(currentEstimate.overtimeMinutes, 578);
assert.equal(nextEstimate.payMonth, '2026-09');
assert.equal(nextEstimate.workMonth, '2026-08');
assert.equal(nextEstimate.overtimeMinutes, 560);

console.log('PASS overtime allowance estimates');
