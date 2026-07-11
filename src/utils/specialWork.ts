import dayjs, { Dayjs } from 'dayjs';

import { MINUTES_PER_HOUR } from '../constants';
import { parseTime24 } from './time';

export const MAX_SPECIAL_WORK_REQUEST_MINUTES = 8 * MINUTES_PER_HOUR;

export interface SpecialWorkSimulation {
  completed: boolean;
  progressPercent: number;
  targetClock: string | null;
  workedMinutes: number;
}

export function clampSpecialWorkRequestMinutes(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(MAX_SPECIAL_WORK_REQUEST_MINUTES, Math.max(0, Math.round(value)));
}

export function calculateSpecialWorkSimulation(
  date: string,
  clockIn: string,
  requestMinutes: number,
  nonWorkMinutes: number,
  now: Dayjs = dayjs(),
): SpecialWorkSimulation {
  const parsedClockIn = parseTime24(clockIn);
  const safeRequestMinutes = clampSpecialWorkRequestMinutes(requestMinutes);
  const safeNonWorkMinutes = Math.max(0, Math.round(nonWorkMinutes));

  if (!parsedClockIn || safeRequestMinutes === 0) {
    return {
      completed: false,
      progressPercent: 0,
      targetClock: null,
      workedMinutes: 0,
    };
  }

  const startedAt = dayjs(date)
    .startOf('day')
    .add(parsedClockIn.totalMinutes, 'minute');
  const targetAt = startedAt.add(safeRequestMinutes + safeNonWorkMinutes, 'minute');
  const elapsedMinutes = Math.max(0, now.diff(startedAt, 'minute'));
  const workedMinutes = Math.min(
    safeRequestMinutes,
    Math.max(0, elapsedMinutes - safeNonWorkMinutes),
  );

  return {
    completed: workedMinutes >= safeRequestMinutes,
    progressPercent: (workedMinutes / safeRequestMinutes) * 100,
    targetClock: targetAt.format('HH:mm'),
    workedMinutes,
  };
}
