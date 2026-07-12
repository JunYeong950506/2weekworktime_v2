import dayjs from 'dayjs';

import { AnnualLeaveType, AppState, DayRecord, Period } from '../types';
import { normalizeUserCode } from './userCode';

const REMOTE_SYNC_ENDPOINT = '/api/sync';

interface RemoteUserRow {
  user_code: string;
  last_activity_at: string | null;
  state_revision?: number | null;
}

interface RemotePeriodRow {
  id: string;
  user_code: string;
  period_name: string;
  start_date: string;
  created_at: string;
  updated_at: string;
}

interface RemoteWorkRecordRow {
  id: string;
  period_id: string;
  user_code: string;
  work_date: string;
  holiday: boolean;
  work_type: string;
  gongga_minutes: number;
  clock_in: string;
  clock_out: string;
  dinner_checked: boolean;
  non_work_minutes: number;
  special_work_request_minutes: number;
  actual_overtime_minutes: number;
}

interface LoadRemoteStateResult {
  appState: AppState | null;
  savedAt: string | null;
  syncRevision: number;
  hasRemoteUser: boolean;
}

interface SyncOptions {
  markActivity: boolean;
  stateRevision: number;
}

interface RemoteSyncApiResponse {
  ok: boolean;
  error?: string;
  user?: RemoteUserRow | null;
  periods?: RemotePeriodRow[];
  workRecords?: RemoteWorkRecordRow[];
}

function isValidObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

function isRecordTouched(record: DayRecord): boolean {
  return (
    record.isHoliday ||
    record.annualLeaveType !== 'none' ||
    record.officialLeaveMinutes > 0 ||
    record.clockIn.trim() !== '' ||
    record.clockOut.trim() !== '' ||
    record.dinnerChecked ||
    record.nonWorkMinutes > 0 ||
    record.specialWorkRequestMinutes > 0 ||
    record.claimedOtMinutes > 0
  );
}

function getTouchedRecordCount(state: AppState): number {
  return state.periods.reduce(
    (acc, period) =>
      acc + period.records.filter((record) => isRecordTouched(record)).length,
    0,
  );
}

function toIsoTimestamp(value: string, fallbackIso: string): string {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.toISOString() : fallbackIso;
}

function toDateOnly(value: string, fallbackDate: string): string {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : fallbackDate;
}

function fallbackPeriodStartDate(period: Period, fallbackDate: string): string {
  const firstRecordDate = period.records.find((record) => dayjs(record.date).isValid())?.date;
  return toDateOnly(period.startDate, firstRecordDate ?? fallbackDate);
}

function remotePeriodId(userCode: string, localPeriodId: string): string {
  return `${userCode}::${localPeriodId}`;
}

function localPeriodId(remoteId: string): string {
  const separatorIndex = remoteId.indexOf('::');
  if (separatorIndex < 0) {
    return remoteId;
  }

  return remoteId.slice(separatorIndex + 2);
}

function recordRowId(userCode: string, periodId: string, workDate: string): string {
  return `${userCode}::${periodId}::${workDate}`;
}

function toPeriodRows(userCode: string, periods: Period[]): RemotePeriodRow[] {
  const nowIso = dayjs().toISOString();
  const fallbackDate = dayjs().format('YYYY-MM-DD');
  const rows = new Map<string, RemotePeriodRow>();

  periods.forEach((period, index) => {
    const localId = period.id.trim() || `period_${index + 1}`;
    const id = remotePeriodId(userCode, localId);
    const startDate = fallbackPeriodStartDate(period, fallbackDate);

    rows.set(id, {
      id,
      user_code: userCode,
      period_name: period.label.trim() || localId,
      start_date: startDate,
      created_at: toIsoTimestamp(period.createdAt, nowIso),
      updated_at: nowIso,
    });
  });

  return [...rows.values()];
}

function toWorkRecordRows(
  userCode: string,
  periods: Period[],
): RemoteWorkRecordRow[] {
  const fallbackDate = dayjs().format('YYYY-MM-DD');
  const rows = new Map<string, RemoteWorkRecordRow>();

  periods.forEach((period, periodIndex) => {
    const localId = period.id.trim() || `period_${periodIndex + 1}`;
    const remoteId = remotePeriodId(userCode, localId);
    const periodStartDate = fallbackPeriodStartDate(period, fallbackDate);

    period.records.forEach((record, recordIndex) => {
      const workDate = toDateOnly(record.date, dayjs(periodStartDate).add(recordIndex, 'day').format('YYYY-MM-DD'));
      const rowId = recordRowId(userCode, localId, workDate);

      rows.set(rowId, {
        id: rowId,
        period_id: remoteId,
        user_code: userCode,
        work_date: workDate,
        holiday: record.isHoliday,
        work_type: record.annualLeaveType,
        gongga_minutes: toNonNegativeInteger(record.officialLeaveMinutes),
        clock_in: record.clockIn,
        clock_out: record.clockOut,
        dinner_checked: Boolean(record.dinnerChecked),
        non_work_minutes: toNonNegativeInteger(record.nonWorkMinutes),
        special_work_request_minutes: Math.min(
          8 * 60,
          toNonNegativeInteger(record.specialWorkRequestMinutes),
        ),
        actual_overtime_minutes: toNonNegativeInteger(record.claimedOtMinutes),
      });
    });
  });

  return [...rows.values()];
}

function buildStateFromRemoteRows(
  periodRows: RemotePeriodRow[],
  workRecordRows: RemoteWorkRecordRow[],
): AppState {
  const groupedRecords = new Map<string, DayRecord[]>();

  workRecordRows.forEach((row) => {
    const list = groupedRecords.get(row.period_id) ?? [];
    list.push({
      date: typeof row.work_date === 'string' ? row.work_date : '',
      isHoliday: Boolean(row.holiday),
      annualLeaveType: normalizeAnnualLeaveType(row.work_type),
      officialLeaveMinutes: toNonNegativeInteger(row.gongga_minutes),
      clockIn: typeof row.clock_in === 'string' ? row.clock_in : '',
      clockOut: typeof row.clock_out === 'string' ? row.clock_out : '',
      dinnerChecked: Boolean(row.dinner_checked),
      nonWorkMinutes: toNonNegativeInteger(row.non_work_minutes),
      specialWorkRequestMinutes: Math.min(
        8 * 60,
        toNonNegativeInteger(row.special_work_request_minutes),
      ),
      workMinutes: null,
      regularMinutes: null,
      overtimeMinutes: null,
      recommendedOtMinutes: null,
      claimedOtMinutes: toNonNegativeInteger(row.actual_overtime_minutes),
      earlyLeaveBalanceMinutes: null,
    });
    groupedRecords.set(row.period_id, list);
  });

  const periods: Period[] = periodRows
    .map((row) => ({
      id: localPeriodId(row.id),
      label: row.period_name,
      startDate: row.start_date,
      createdAt: row.created_at,
      records: (groupedRecords.get(row.id) ?? []).sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return {
    selectedPeriodId: periods.length > 0 ? periods[periods.length - 1].id : null,
    periods,
  };
}

async function requestRemoteSync(payload: Record<string, unknown>): Promise<RemoteSyncApiResponse> {
  const response = await fetch(REMOTE_SYNC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    throw new Error('SYNC_SERVER_UNAVAILABLE');
  }

  if (!isValidObject(body) || body.ok !== true || !response.ok) {
    const code = isValidObject(body) && typeof body.error === 'string'
      ? body.error
      : 'SYNC_OPERATION_FAILED';
    throw new Error(code);
  }

  return body as unknown as RemoteSyncApiResponse;
}

export function isRemoteSyncAvailable(): boolean {
  return !import.meta.env.DEV;
}

export async function syncRemoteState(
  userCode: string,
  state: AppState,
  options: SyncOptions,
): Promise<void> {
  const normalized = normalizeUserCode(userCode);

  await requestRemoteSync({
    action: 'save',
    userCode: normalized,
    periods: toPeriodRows(normalized, state.periods),
    workRecords: toWorkRecordRows(normalized, state.periods),
    recordCount: getTouchedRecordCount(state),
    markActivity: options.markActivity,
    stateRevision: options.stateRevision,
  });
}

export async function loadRemoteState(userCode: string): Promise<LoadRemoteStateResult> {
  const response = await requestRemoteSync({
    action: 'load',
    userCode: normalizeUserCode(userCode),
  });
  const periodRows = Array.isArray(response.periods) ? response.periods : [];
  const workRecordRows = Array.isArray(response.workRecords) ? response.workRecords : [];
  const userRow = response.user ?? null;

  if (periodRows.length === 0) {
    return {
      appState: null,
      savedAt: userRow?.last_activity_at ?? null,
      syncRevision: normalizeSyncRevision(userRow?.state_revision),
      hasRemoteUser: Boolean(userRow?.user_code),
    };
  }

  return {
    appState: buildStateFromRemoteRows(periodRows, workRecordRows),
    savedAt: userRow?.last_activity_at ?? null,
    syncRevision: normalizeSyncRevision(userRow?.state_revision),
    hasRemoteUser: true,
  };
}

export function getSyncUnavailableMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : '';

  if (code === 'SYNC_SERVER_UNAVAILABLE') {
    return '서버 동기화 설정이 없어 코드 불러오기를 사용할 수 없습니다.';
  }

  if (code === 'SYNC_INVALID_REQUEST') {
    return '동기화 요청을 처리하지 못했습니다. 동기화 코드를 다시 확인해 주세요.';
  }

  return '서버 동기화 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
}
