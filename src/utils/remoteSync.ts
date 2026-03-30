import dayjs from 'dayjs';

import { REMOTE_CLEANUP_CHECKED_AT_KEY } from '../constants';
import { getSupabaseClient, getSupabaseEnvError, hasSupabaseEnv } from '../lib/supabase';
import { AnnualLeaveType, AppState, DayRecord, Period } from '../types';
import { normalizeUserCode } from './userCode';

const CLEANUP_INTERVAL_DAYS = 7;

interface RemoteUserRow {
  user_code: string;
  last_activity_at: string | null;
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
  actual_overtime_minutes: number;
}

interface LoadRemoteStateResult {
  appState: AppState | null;
  savedAt: string | null;
  hasRemoteUser: boolean;
}

interface SyncOptions {
  markActivity: boolean;
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

function isRecordTouched(record: DayRecord): boolean {
  return (
    record.isHoliday ||
    record.annualLeaveType !== 'none' ||
    record.officialLeaveMinutes > 0 ||
    record.clockIn.trim() !== '' ||
    record.clockOut.trim() !== '' ||
    record.dinnerChecked ||
    record.nonWorkMinutes > 0 ||
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

function recordRowId(periodId: string, workDate: string): string {
  return `${periodId}::${workDate}`;
}

function toPeriodRows(userCode: string, periods: Period[]): RemotePeriodRow[] {
  const nowIso = dayjs().toISOString();
  return periods.map((period) => ({
    id: period.id,
    user_code: userCode,
    period_name: period.label,
    start_date: period.startDate,
    created_at: period.createdAt || nowIso,
    updated_at: nowIso,
  }));
}

function toWorkRecordRows(
  userCode: string,
  periods: Period[],
): RemoteWorkRecordRow[] {
  return periods.flatMap((period) =>
    period.records.map((record) => ({
      id: recordRowId(period.id, record.date),
      period_id: period.id,
      user_code: userCode,
      work_date: record.date,
      holiday: record.isHoliday,
      work_type: record.annualLeaveType,
      gongga_minutes: toNonNegativeInteger(record.officialLeaveMinutes),
      clock_in: record.clockIn,
      clock_out: record.clockOut,
      dinner_checked: Boolean(record.dinnerChecked),
      non_work_minutes: toNonNegativeInteger(record.nonWorkMinutes),
      actual_overtime_minutes: toNonNegativeInteger(record.claimedOtMinutes),
    })),
  );
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
      id: row.id,
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

function toErrorMessage(error: unknown): string {
  const rawMessage =
    isValidObject(error) && typeof error.message === 'string'
      ? error.message
      : null;

  if (!rawMessage) {
    return '서버 동기화 중 오류가 발생했습니다.';
  }

  const lower = rawMessage.toLowerCase();
  if (
    lower.includes("could not find the table 'public.users'") ||
    lower.includes('relation "public.users" does not exist') ||
    lower.includes('relation "users" does not exist')
  ) {
    return 'Supabase 테이블이 없습니다. Supabase SQL Editor에서 supabase/schema.sql을 실행해주세요.';
  }

  if (
    lower.includes('permission denied') ||
    lower.includes('row-level security') ||
    lower.includes('violates row-level security')
  ) {
    return 'Supabase 권한 또는 RLS 설정이 필요합니다. supabase/schema.sql의 GRANT/RLS 구문을 실행해주세요.';
  }

  return rawMessage;
}

async function upsertUserMetadata(
  userCode: string,
  options: {
    markActivity: boolean;
    touchedRecordCount?: number;
  },
): Promise<void> {
  const nowIso = dayjs().toISOString();
  const payload: Record<string, unknown> = {
    user_code: userCode,
    last_seen_at: nowIso,
  };

  if (typeof options.touchedRecordCount === 'number') {
    payload.record_count = options.touchedRecordCount;
  }

  if (options.markActivity) {
    payload.last_activity_at = nowIso;
    payload.deleted_candidate_at = null;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('users')
    .upsert(payload, { onConflict: 'user_code' });

  if (error) {
    throw new Error(error.message);
  }
}

export function isRemoteSyncAvailable(): boolean {
  return hasSupabaseEnv();
}

export async function ensureRemoteUser(userCode: string): Promise<void> {
  if (!hasSupabaseEnv()) {
    return;
  }

  const normalized = normalizeUserCode(userCode);
  await upsertUserMetadata(normalized, {
    markActivity: false,
  });
}

export async function syncRemoteState(
  userCode: string,
  state: AppState,
  options: SyncOptions,
): Promise<void> {
  if (!hasSupabaseEnv()) {
    return;
  }

  const normalized = normalizeUserCode(userCode);
  const touchedRecordCount = getTouchedRecordCount(state);
  const supabase = getSupabaseClient();

  await upsertUserMetadata(normalized, {
    markActivity: options.markActivity,
    touchedRecordCount,
  });

  const { error: deleteWorkRecordsError } = await supabase
    .from('work_records')
    .delete()
    .eq('user_code', normalized);
  if (deleteWorkRecordsError) {
    throw new Error(deleteWorkRecordsError.message);
  }

  const { error: deletePeriodsError } = await supabase
    .from('periods')
    .delete()
    .eq('user_code', normalized);
  if (deletePeriodsError) {
    throw new Error(deletePeriodsError.message);
  }

  const periodRows = toPeriodRows(normalized, state.periods);
  if (periodRows.length > 0) {
    const { error: insertPeriodsError } = await supabase
      .from('periods')
      .insert(periodRows);
    if (insertPeriodsError) {
      throw new Error(insertPeriodsError.message);
    }
  }

  const recordRows = toWorkRecordRows(normalized, state.periods);
  if (recordRows.length > 0) {
    const { error: insertWorkRecordsError } = await supabase
      .from('work_records')
      .insert(recordRows);
    if (insertWorkRecordsError) {
      throw new Error(insertWorkRecordsError.message);
    }
  }
}

export async function loadRemoteState(
  userCode: string,
): Promise<LoadRemoteStateResult> {
  if (!hasSupabaseEnv()) {
    return {
      appState: null,
      savedAt: null,
      hasRemoteUser: false,
    };
  }

  const normalized = normalizeUserCode(userCode);
  const supabase = getSupabaseClient();

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('user_code,last_activity_at')
    .eq('user_code', normalized)
    .maybeSingle<RemoteUserRow>();
  if (userError) {
    throw new Error(userError.message);
  }

  await upsertUserMetadata(normalized, {
    markActivity: false,
  });

  const { data: periodRows, error: periodError } = await supabase
    .from('periods')
    .select('id,user_code,period_name,start_date,created_at,updated_at')
    .eq('user_code', normalized)
    .order('start_date', { ascending: true })
    .returns<RemotePeriodRow[]>();
  if (periodError) {
    throw new Error(periodError.message);
  }

  if (!periodRows || periodRows.length === 0) {
    return {
      appState: null,
      savedAt: userRow?.last_activity_at ?? null,
      hasRemoteUser: Boolean(userRow?.user_code),
    };
  }

  const { data: recordRows, error: recordError } = await supabase
    .from('work_records')
    .select(
      'id,period_id,user_code,work_date,holiday,work_type,gongga_minutes,clock_in,clock_out,dinner_checked,non_work_minutes,actual_overtime_minutes',
    )
    .eq('user_code', normalized)
    .order('work_date', { ascending: true })
    .returns<RemoteWorkRecordRow[]>();
  if (recordError) {
    throw new Error(recordError.message);
  }

  return {
    appState: buildStateFromRemoteRows(periodRows, recordRows ?? []),
    savedAt: userRow?.last_activity_at ?? null,
    hasRemoteUser: true,
  };
}

export async function runWeeklyRemoteCleanup(): Promise<void> {
  if (!hasSupabaseEnv()) {
    return;
  }

  const lastCheckedAt = localStorage.getItem(REMOTE_CLEANUP_CHECKED_AT_KEY);
  if (lastCheckedAt) {
    const diffDays = dayjs().diff(dayjs(lastCheckedAt), 'day');
    if (diffDays < CLEANUP_INTERVAL_DAYS) {
      return;
    }
  }

  const nowIso = dayjs().toISOString();
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('cleanup_inactive_user_codes');

  if (error && !/cleanup_inactive_user_codes/i.test(error.message)) {
    throw new Error(error.message);
  }

  localStorage.setItem(REMOTE_CLEANUP_CHECKED_AT_KEY, nowIso);
}

export function getSyncUnavailableMessage(error: unknown): string {
  if (!hasSupabaseEnv()) {
    return (
      getSupabaseEnvError() ??
      '서버 동기화 설정이 없어 코드 불러오기를 사용할 수 없습니다.'
    );
  }

  return toErrorMessage(error);
}

