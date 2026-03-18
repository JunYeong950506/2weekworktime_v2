import dayjs from 'dayjs';

import { APP_STORAGE_KEY } from '../constants';
import {
  AnnualLeaveType,
  AppState,
  DayRecord,
  PersistedAppState,
  Period,
} from '../types';

const APP_STORAGE_KEYS = [APP_STORAGE_KEY] as const;

function isValidObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function toNonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function normalizeAnnualLeaveType(value: unknown): AnnualLeaveType {
  if (value === 'quarter' || value === 'half' || value === 'full') {
    return value;
  }

  return 'none';
}

function normalizeDayRecord(raw: unknown): DayRecord | null {
  if (!isValidObject(raw)) {
    return null;
  }

  return {
    date: typeof raw.date === 'string' ? raw.date : '',
    isHoliday: Boolean(raw.isHoliday),
    annualLeaveType: normalizeAnnualLeaveType(raw.annualLeaveType),
    clockIn: typeof raw.clockIn === 'string' ? raw.clockIn : '',
    clockOut: typeof raw.clockOut === 'string' ? raw.clockOut : '',
    dinnerChecked:
      typeof raw.dinnerChecked === 'boolean' ? raw.dinnerChecked : false,
    nonWorkMinutes: toNonNegativeInteger(raw.nonWorkMinutes),
    workMinutes: toNullableNumber(raw.workMinutes),
    regularMinutes: toNullableNumber(raw.regularMinutes),
    overtimeMinutes: toNullableNumber(raw.overtimeMinutes),
    recommendedOtMinutes: toNullableNumber(raw.recommendedOtMinutes),
    claimedOtMinutes: toNonNegativeInteger(raw.claimedOtMinutes),
    earlyLeaveBalanceMinutes: toNullableNumber(raw.earlyLeaveBalanceMinutes),
  };
}

function normalizePeriod(raw: unknown): Period | null {
  if (!isValidObject(raw)) {
    return null;
  }

  if (
    typeof raw.id !== 'string' ||
    typeof raw.label !== 'string' ||
    typeof raw.startDate !== 'string' ||
    typeof raw.createdAt !== 'string' ||
    !Array.isArray(raw.records)
  ) {
    return null;
  }

  const records = raw.records
    .map((record) => normalizeDayRecord(record))
    .filter((record): record is DayRecord => record !== null);

  return {
    id: raw.id,
    label: raw.label,
    startDate: raw.startDate,
    createdAt: raw.createdAt,
    records,
  };
}

function parsePersistedState(raw: unknown): PersistedAppState | null {
  if (!isValidObject(raw)) {
    return null;
  }

  const selectedPeriodId = raw.selectedPeriodId;
  const savedAt = raw.savedAt;

  if (!(typeof selectedPeriodId === 'string' || selectedPeriodId === null)) {
    return null;
  }

  if (typeof savedAt !== 'string') {
    return null;
  }

  if (!Array.isArray(raw.periods)) {
    return null;
  }

  const periods = raw.periods
    .map((period) => normalizePeriod(period))
    .filter((period): period is Period => period !== null);

  return {
    periods,
    selectedPeriodId,
    savedAt,
  };
}

export function loadAppState(): PersistedAppState | null {
  try {
    const text = localStorage.getItem(APP_STORAGE_KEY);

    if (!text) {
      return null;
    }

    const parsed = JSON.parse(text) as unknown;
    return parsePersistedState(parsed);
  } catch {
    return null;
  }
}

export function saveAppState(state: AppState): string {
  const savedAt = dayjs().toISOString();

  const payload: PersistedAppState = {
    ...state,
    savedAt,
  };

  localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(payload));

  return savedAt;
}

export function hasAppStorageData(): boolean {
  try {
    return APP_STORAGE_KEYS.some((key) => localStorage.getItem(key) !== null);
  } catch {
    return false;
  }
}

export function clearAllAppStorage(): void {
  try {
    APP_STORAGE_KEYS.forEach((key) => {
      localStorage.removeItem(key);
    });
  } catch {
    // no-op
  }
}
