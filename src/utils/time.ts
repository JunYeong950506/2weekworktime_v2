import dayjs from 'dayjs';

import { MINUTES_PER_HOUR } from '../constants';

const TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

export const CLOCK_IN_MIN_MINUTES = 6 * MINUTES_PER_HOUR;

export interface ParsedTime24 {
  hours: number;
  minutes: number;
  totalMinutes: number;
}

export function parseTime24(value: string): ParsedTime24 | null {
  if (!TIME_REGEX.test(value)) {
    return null;
  }

  const [hoursRaw, minutesRaw] = value.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  return {
    hours,
    minutes,
    totalMinutes: hours * MINUTES_PER_HOUR + minutes,
  };
}

export function normalizeOvernightCheckout(
  clockInMinutes: number,
  clockOutMinutes: number,
): number {
  return clockOutMinutes < clockInMinutes
    ? clockOutMinutes + MINUTES_PER_DAY
    : clockOutMinutes;
}

export function formatMinutesAsClock(minutes: number | null): string {
  if (minutes === null) {
    return '-';
  }

  const rounded = Math.round(minutes);
  const sign = rounded < 0 ? '-' : '';
  const absMinutes = Math.abs(rounded);
  const hours = Math.floor(absMinutes / MINUTES_PER_HOUR);
  const minutePart = absMinutes % MINUTES_PER_HOUR;

  return `${sign}${hours}:${String(minutePart).padStart(2, '0')}`;
}

export function formatSignedMinutesAsClock(minutes: number | null): string {
  if (minutes === null) {
    return '-';
  }

  const sign = minutes < 0 ? '-' : '+';
  const absMinutes = Math.abs(Math.round(minutes));
  const hours = Math.floor(absMinutes / MINUTES_PER_HOUR);
  const minutePart = absMinutes % MINUTES_PER_HOUR;

  return `${sign}${hours}:${String(minutePart).padStart(2, '0')}`;
}

export function nowToHHmm(): string {
  return dayjs().format('HH:mm');
}

export function formatDateCell(dateIso: string): string {
  return dayjs(dateIso).format('MM/DD (dd)');
}

export function formatDateInput(dateIso: string): string {
  return dayjs(dateIso).format('YYYY-MM-DD');
}

export function isToday(dateIso: string): boolean {
  return dayjs().format('YYYY-MM-DD') === dayjs(dateIso).format('YYYY-MM-DD');
}

export function formatSavedAt(savedAtIso: string | null): string {
  if (!savedAtIso) {
    return '저장 기록 없음';
  }

  return dayjs(savedAtIso).format('YYYY-MM-DD HH:mm:ss');
}
