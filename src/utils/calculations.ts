import dayjs from 'dayjs';

import {
  DAILY_REGULAR_MINUTES,
  LUNCH_BREAK_MINUTES,
  MAX_ADDITIONAL_OVERTIME_MINUTES,
  OVERTIME_APPROVAL_UNIT_MINUTES,
  REGULAR_TARGET_MINUTES_2WEEK,
} from '../constants';
import {
  DayRecord,
  DayRecordMeta,
  Period,
  PeriodCalculationResult,
  SummaryValues,
} from '../types';
import {
  CLOCK_IN_MIN_MINUTES,
  computeWorkedMinutes,
  parseTime24,
} from './time';

function isWeekday(dateIso: string): boolean {
  const day = dayjs(dateIso).day();
  return day >= 1 && day <= 5;
}

function sanitizeMinutes(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

export function recalculateDayRecord(source: DayRecord): {
  record: DayRecord;
  meta: DayRecordMeta;
} {
  const claimedOtMinutes = sanitizeMinutes(source.claimedOtMinutes);
  const weekday = isWeekday(source.date);
  const validationErrors: string[] = [];

  const hasClockIn = source.clockIn.trim() !== '';
  const hasClockOut = source.clockOut.trim() !== '';

  const parsedClockIn = hasClockIn ? parseTime24(source.clockIn) : null;
  const parsedClockOut = hasClockOut ? parseTime24(source.clockOut) : null;

  const clockInMinutes = parsedClockIn?.totalMinutes ?? null;
  const clockOutMinutes = parsedClockOut?.totalMinutes ?? null;

  if (hasClockIn && clockInMinutes === null) {
    validationErrors.push('출근시간 형식은 HH:mm (24시간) 이어야 합니다.');
  }

  if (hasClockOut && clockOutMinutes === null) {
    validationErrors.push('퇴근시간 형식은 HH:mm (24시간) 이어야 합니다.');
  }

  if (clockInMinutes !== null && clockInMinutes < CLOCK_IN_MIN_MINUTES) {
    validationErrors.push('출근시간은 06:00~23:59 범위만 입력할 수 있습니다.');
  }

  if ((hasClockIn && !hasClockOut) || (!hasClockIn && hasClockOut)) {
    validationErrors.push('출근시간과 퇴근시간을 모두 입력하세요.');
  }

  let workMinutes: number | null = null;
  let regularMinutes: number | null = null;
  let overtimeMinutes: number | null = null;
  let recommendedOtMinutes: number | null = null;
  let earlyLeaveBalanceMinutes: number | null = null;

  const canCalculate =
    clockInMinutes !== null &&
    clockOutMinutes !== null &&
    clockInMinutes >= CLOCK_IN_MIN_MINUTES;

  if (canCalculate) {
    workMinutes = computeWorkedMinutes(
      clockInMinutes,
      clockOutMinutes,
      LUNCH_BREAK_MINUTES,
    );
    regularMinutes = Math.max(0, workMinutes - claimedOtMinutes);
    overtimeMinutes = Math.max(0, workMinutes - DAILY_REGULAR_MINUTES);
    recommendedOtMinutes =
      Math.floor(overtimeMinutes / OVERTIME_APPROVAL_UNIT_MINUTES) *
      OVERTIME_APPROVAL_UNIT_MINUTES;

    const dailyTargetMinutes = weekday && !source.isHoliday ? DAILY_REGULAR_MINUTES : 0;
    earlyLeaveBalanceMinutes =
      Math.round(workMinutes - dailyTargetMinutes) - claimedOtMinutes;
  }

  return {
    record: {
      ...source,
      claimedOtMinutes,
      workMinutes,
      regularMinutes,
      overtimeMinutes,
      recommendedOtMinutes,
      earlyLeaveBalanceMinutes,
    },
    meta: {
      isWeekday: weekday,
      validationErrors,
    },
  };
}

export function recalculateRecords(records: DayRecord[]): {
  records: DayRecord[];
  rowMeta: DayRecordMeta[];
} {
  const recalculated = records.map(recalculateDayRecord);

  return {
    records: recalculated.map((item) => item.record),
    rowMeta: recalculated.map((item) => item.meta),
  };
}

function sumNullable(values: Array<number | null>): number {
  return values.reduce<number>(
    (acc, value) => (value === null ? acc : acc + value),
    0,
  );
}

export function calculateSummary(
  records: DayRecord[],
  rowMeta: DayRecordMeta[],
): SummaryValues {
  const weekdayHolidayCount = records.reduce((acc, record, index) => {
    if (record.isHoliday && rowMeta[index]?.isWeekday) {
      return acc + 1;
    }

    return acc;
  }, 0);

  const requiredMinutes =
    REGULAR_TARGET_MINUTES_2WEEK - weekdayHolidayCount * DAILY_REGULAR_MINUTES;

  const regularWorkedMinutes = sumNullable(records.map((record) => record.regularMinutes));
  const remainingMinutes = Math.max(0, requiredMinutes - regularWorkedMinutes);

  const earlyLeaveAvailableMinutes = sumNullable(
    records.map((record) => record.earlyLeaveBalanceMinutes),
  );

  const overtimeApprovalTotalMinutes = records.reduce(
    (acc, record) => acc + sanitizeMinutes(record.claimedOtMinutes),
    0,
  );

  const additionalOvertimeAvailableMinutes = Math.min(
    MAX_ADDITIONAL_OVERTIME_MINUTES,
    Math.max(
      0,
      MAX_ADDITIONAL_OVERTIME_MINUTES -
        Math.max(0, earlyLeaveAvailableMinutes) -
        overtimeApprovalTotalMinutes,
    ),
  );

  return {
    requiredMinutes,
    remainingMinutes,
    additionalOvertimeAvailableMinutes,
    earlyLeaveAvailableMinutes,
    overtimeApprovalTotalMinutes,
  };
}

export function recalculatePeriod(period: Period): PeriodCalculationResult {
  const { records, rowMeta } = recalculateRecords(period.records);

  return {
    records,
    rowMeta,
    summary: calculateSummary(records, rowMeta),
  };
}