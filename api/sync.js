import {
  getSupabaseAdmin,
  readJsonBody,
  requireMethod,
  sendError,
  sendJson,
} from './_cafeAlertService.js';

const USER_CODE_PATTERN = /^(WT|WORK)-[A-Z0-9]{6,8}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:|(?:[01]\d|2[0-3]):[0-5]\d)$/;
const WORK_TYPES = new Set(['none', 'quarter', 'half', 'full', 'official']);
const MAX_PERIODS = 10;
const MAX_WORK_RECORDS = MAX_PERIODS * 14;

class SyncRequestError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function isObject(value) {
  return typeof value === 'object' && value !== null;
}

function normalizeUserCode(value) {
  return typeof value === 'string'
    ? value.trim().toUpperCase().replace(/\s+/g, '')
    : '';
}

function requireUserCode(value) {
  const userCode = normalizeUserCode(value);
  if (!USER_CODE_PATTERN.test(userCode)) {
    throw new SyncRequestError('SYNC_INVALID_REQUEST', 'Invalid user code');
  }

  return userCode;
}

function toNonNegativeInteger(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

function toIsoTimestamp(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function requireString(value, field, maxLength) {
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new SyncRequestError('SYNC_INVALID_REQUEST', `Invalid ${field}`);
  }

  return value;
}

function requireDate(value, field) {
  const date = requireString(value, field, 10);
  if (!DATE_PATTERN.test(date)) {
    throw new SyncRequestError('SYNC_INVALID_REQUEST', `Invalid ${field}`);
  }

  return date;
}

function normalizePeriodRows(value, userCode) {
  if (!Array.isArray(value) || value.length > MAX_PERIODS) {
    throw new SyncRequestError('SYNC_INVALID_REQUEST', 'Invalid period payload');
  }

  const nowIso = new Date().toISOString();
  const prefix = `${userCode}::`;
  const ids = new Set();

  return value.map((row) => {
    if (!isObject(row)) {
      throw new SyncRequestError('SYNC_INVALID_REQUEST', 'Invalid period payload');
    }

    const id = requireString(row.id, 'period id', 200);
    if (!id.startsWith(prefix) || ids.has(id)) {
      throw new SyncRequestError('SYNC_INVALID_REQUEST', 'Invalid period id');
    }
    ids.add(id);

    return {
      id,
      user_code: userCode,
      period_name: requireString(row.period_name, 'period name', 100),
      start_date: requireDate(row.start_date, 'period start date'),
      created_at: toIsoTimestamp(row.created_at, nowIso),
      updated_at: nowIso,
    };
  });
}

function normalizeWorkRecordRows(value, userCode, periodIds) {
  if (!Array.isArray(value) || value.length > MAX_WORK_RECORDS) {
    throw new SyncRequestError('SYNC_INVALID_REQUEST', 'Invalid work record payload');
  }

  const prefix = `${userCode}::`;
  const ids = new Set();

  return value.map((row) => {
    if (!isObject(row)) {
      throw new SyncRequestError('SYNC_INVALID_REQUEST', 'Invalid work record payload');
    }

    const id = requireString(row.id, 'work record id', 240);
    const periodId = requireString(row.period_id, 'period id', 200);
    const clockIn = requireString(row.clock_in, 'clock in', 5);
    const clockOut = requireString(row.clock_out, 'clock out', 5);
    const workType = requireString(row.work_type, 'work type', 20);

    if (
      !id.startsWith(prefix) ||
      ids.has(id) ||
      !periodIds.has(periodId) ||
      !TIME_PATTERN.test(clockIn) ||
      !TIME_PATTERN.test(clockOut) ||
      !WORK_TYPES.has(workType)
    ) {
      throw new SyncRequestError('SYNC_INVALID_REQUEST', 'Invalid work record');
    }
    ids.add(id);

    return {
      id,
      period_id: periodId,
      user_code: userCode,
      work_date: requireDate(row.work_date, 'work date'),
      holiday: Boolean(row.holiday),
      work_type: workType,
      gongga_minutes: toNonNegativeInteger(row.gongga_minutes),
      clock_in: clockIn,
      clock_out: clockOut,
      dinner_checked: Boolean(row.dinner_checked),
      non_work_minutes: toNonNegativeInteger(row.non_work_minutes),
      special_work_request_minutes: Math.min(
        8 * 60,
        toNonNegativeInteger(row.special_work_request_minutes),
      ),
      actual_overtime_minutes: toNonNegativeInteger(row.actual_overtime_minutes),
    };
  });
}

function isMissingStateRevisionColumnError(error) {
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  const code = typeof error?.code === 'string' ? error.code.toLowerCase() : '';

  return message.includes('state_revision') && (
    code === '42703' ||
    code === 'pgrst204' ||
    message.includes('does not exist') ||
    message.includes('could not find')
  );
}

async function upsertUserMetadata(supabase, userCode, options) {
  const nowIso = new Date().toISOString();
  const payload = {
    user_code: userCode,
    last_seen_at: nowIso,
  };

  if (typeof options.recordCount === 'number') {
    payload.record_count = Math.max(0, Math.round(options.recordCount));
  }

  if (options.markActivity) {
    payload.last_activity_at = nowIso;
    payload.deleted_candidate_at = null;
  }

  if (typeof options.stateRevision === 'number') {
    payload.state_revision = Math.max(0, Math.round(options.stateRevision));
  }

  let { error } = await supabase
    .from('users')
    .upsert(payload, { onConflict: 'user_code' });

  if (error && isMissingStateRevisionColumnError(error) && 'state_revision' in payload) {
    delete payload.state_revision;
    ({ error } = await supabase
      .from('users')
      .upsert(payload, { onConflict: 'user_code' }));
  }

  if (error) {
    throw error;
  }

  return nowIso;
}

async function loadState(supabase, userCode) {
  let user = null;
  let userError = null;

  ({ data: user, error: userError } = await supabase
    .from('users')
    .select('user_code,last_activity_at,state_revision')
    .eq('user_code', userCode)
    .maybeSingle());

  if (userError && isMissingStateRevisionColumnError(userError)) {
    const fallback = await supabase
      .from('users')
      .select('user_code,last_activity_at')
      .eq('user_code', userCode)
      .maybeSingle();
    user = fallback.data ? { ...fallback.data, state_revision: 0 } : null;
    userError = fallback.error;
  }

  if (userError) {
    throw userError;
  }

  if (user?.user_code) {
    const { error } = await supabase
      .from('users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('user_code', userCode);
    if (error) {
      throw error;
    }
  }

  const { data: periods, error: periodError } = await supabase
    .from('periods')
    .select('id,user_code,period_name,start_date,created_at,updated_at')
    .eq('user_code', userCode)
    .order('start_date', { ascending: true });
  if (periodError) {
    throw periodError;
  }

  if (!periods?.length) {
    return { user, periods: [], workRecords: [] };
  }

  const { data: workRecords, error: workRecordError } = await supabase
    .from('work_records')
    .select('id,period_id,user_code,work_date,holiday,work_type,gongga_minutes,clock_in,clock_out,dinner_checked,non_work_minutes,special_work_request_minutes,actual_overtime_minutes')
    .eq('user_code', userCode)
    .order('work_date', { ascending: true });
  if (workRecordError) {
    throw workRecordError;
  }

  return { user, periods, workRecords: workRecords ?? [] };
}

async function saveState(supabase, userCode, payload) {
  const periods = normalizePeriodRows(payload.periods, userCode);
  const periodIds = new Set(periods.map((period) => period.id));
  const workRecords = normalizeWorkRecordRows(payload.workRecords, userCode, periodIds);
  const recordCount = Number.isInteger(payload.recordCount)
    ? Math.max(0, payload.recordCount)
    : 0;

  await upsertUserMetadata(supabase, userCode, { markActivity: false });

  const { error: deleteRecordsError } = await supabase
    .from('work_records')
    .delete()
    .eq('user_code', userCode);
  if (deleteRecordsError) {
    throw deleteRecordsError;
  }

  const { error: deletePeriodsError } = await supabase
    .from('periods')
    .delete()
    .eq('user_code', userCode);
  if (deletePeriodsError) {
    throw deletePeriodsError;
  }

  if (periods.length > 0) {
    const { error } = await supabase.from('periods').insert(periods);
    if (error) {
      throw error;
    }
  }

  if (workRecords.length > 0) {
    const { error } = await supabase.from('work_records').insert(workRecords);
    if (error) {
      throw error;
    }
  }

  return upsertUserMetadata(supabase, userCode, {
    markActivity: payload.markActivity === true,
    recordCount,
    stateRevision: typeof payload.stateRevision === 'number' ? payload.stateRevision : undefined,
  });
}

export default async function handler(request, response) {
  if (!requireMethod(request, response, 'POST')) {
    return;
  }

  try {
    const payload = await readJsonBody(request);
    const userCode = requireUserCode(payload?.userCode);
    const supabase = getSupabaseAdmin();

    if (payload?.action === 'load') {
      const state = await loadState(supabase, userCode);
      sendJson(response, 200, { ok: true, ...state });
      return;
    }

    if (payload?.action === 'save') {
      const savedAt = await saveState(supabase, userCode, payload);
      sendJson(response, 200, { ok: true, savedAt });
      return;
    }

    throw new SyncRequestError('SYNC_INVALID_REQUEST', 'Invalid sync action');
  } catch (error) {
    if (error instanceof SyncRequestError) {
      sendError(response, 400, error.code, error.message);
      return;
    }

    if (error instanceof Error && error.message.includes('Missing server Supabase environment variables')) {
      sendError(response, 503, 'SYNC_SERVER_UNAVAILABLE', 'Server sync is not configured');
      return;
    }

    sendError(response, 500, 'SYNC_OPERATION_FAILED', 'Server sync operation failed');
  }
}
