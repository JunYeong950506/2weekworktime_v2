import dayjs from 'dayjs';

import {
  APP_STORAGE_KEY,
  USER_CODE_STORAGE_KEY,
} from '../constants';
import {
  AnnualLeaveType,
  AppState,
  DayRecord,
  PersistedAppState,
  Period,
} from '../types';
import {
  generateUserCode,
  isValidUserCode,
  normalizeUserCode,
} from './userCode';

const APP_STORAGE_KEYS = [APP_STORAGE_KEY, USER_CODE_STORAGE_KEY] as const;

interface SaveAppStateOptions {
  savedAt?: string | null;
  syncRevision?: number;
}

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

function normalizeSyncRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function clampOfficialLeaveMinutes(value: unknown): number {
  return Math.min(480, toNonNegativeInteger(value));
}

function normalizeAnnualLeaveType(value: unknown): AnnualLeaveType {
  if (
    value === 'quarter' ||
    value === 'half' ||
    value === 'full' ||
    value === 'official'
  ) {
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
    officialLeaveMinutes: clampOfficialLeaveMinutes(raw.officialLeaveMinutes),
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
  const syncRevision = raw.syncRevision;

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
    syncRevision: normalizeSyncRevision(syncRevision),
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

export function saveAppState(
  state: AppState,
  options: SaveAppStateOptions = {},
): PersistedAppState {
  const savedAt =
    typeof options.savedAt === 'string' && dayjs(options.savedAt).isValid()
      ? dayjs(options.savedAt).toISOString()
      : dayjs().toISOString();

  const payload: PersistedAppState = {
    ...state,
    savedAt,
    syncRevision: normalizeSyncRevision(options.syncRevision),
  };

  localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(payload));

  return payload;
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

export function loadUserCode(): string | null {
  try {
    const raw = localStorage.getItem(USER_CODE_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const normalized = normalizeUserCode(raw);
    return isValidUserCode(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

export function saveUserCode(userCode: string): string {
  const normalized = normalizeUserCode(userCode);
  localStorage.setItem(USER_CODE_STORAGE_KEY, normalized);
  return normalized;
}

export function ensureUserCode(): string {
  const existing = loadUserCode();
  if (existing) {
    return existing;
  }

  const generated = generateUserCode();
  saveUserCode(generated);
  return generated;
}
