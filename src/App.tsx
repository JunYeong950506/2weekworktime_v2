import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';

import PeriodManager from './components/PeriodManager';
import SummaryCards from './components/SummaryCards';
import TimesheetTable from './components/TimesheetTable';
import TodayQuickEntryCard from './components/TodayQuickEntryCard';
import { MAX_STORED_PERIODS } from './constants';
import { AppState, CreatePeriodPayload, DayRecord, Period } from './types';
import { recalculatePeriod, recalculateRecords } from './utils/calculations';
import { createEmptyAppState, deleteCurrentPeriod } from './utils/dataManagement';
import {
  buildDefaultPeriodLabel,
  copyRecordsWithNewDate,
  createPeriod,
  ensureUniquePeriodId,
  rebaseRecordDates,
} from './utils/period';
import { getHolidayDateSet } from './utils/holidayProvider';
import {
  clearAllAppStorage,
  ensureUserCode,
  hasAppStorageData,
  loadAppState,
  saveUserCode,
  saveAppState,
} from './utils/storage';
import {
  getSyncUnavailableMessage,
  isRemoteSyncAvailable,
  loadRemoteState,
  runWeeklyRemoteCleanup,
  syncRemoteState,
} from './utils/remoteSync';
import { isValidUserCode, normalizeUserCode } from './utils/userCode';
import { formatDateCell, nowToHHmm } from './utils/time';
import { useTodayRecord } from './hooks/useTodayRecord';

interface InitialState {
  appState: AppState;
  savedAt: string | null;
}

interface CodeLoadResult {
  ok: boolean;
  message: string;
  tone: 'success' | 'info' | 'warning' | 'error';
}

interface VerifiedRemoteState {
  appState: AppState;
  savedAt: string | null;
}

interface SyncAlert {
  message: string;
  tone: 'warning' | 'error';
}

function hydrateAppState(
  source: AppState,
  preferredSelectedPeriodId?: string | null,
): AppState {
  const periods = source.periods.map((period) => {
    const calc = recalculatePeriod(period);
    return {
      ...period,
      records: calc.records,
    };
  });

  const periodIds = new Set(periods.map((period) => period.id));
  const fallbackSelectedPeriodId = periods.length > 0 ? periods[periods.length - 1].id : null;

  const selectedPeriodId =
    preferredSelectedPeriodId && periodIds.has(preferredSelectedPeriodId)
      ? preferredSelectedPeriodId
      : source.selectedPeriodId && periodIds.has(source.selectedPeriodId)
        ? source.selectedPeriodId
        : fallbackSelectedPeriodId;

  return {
    selectedPeriodId,
    periods,
  };
}

function getInitialState(): InitialState {
  const loaded = loadAppState();

  if (!loaded) {
    return {
      appState: createEmptyAppState(),
      savedAt: null,
    };
  }

  return {
    appState: hydrateAppState(loaded),
    savedAt: loaded.savedAt,
  };
}

function upsertPeriod(periods: Period[], updated: Period): Period[] {
  return periods.map((period) => (period.id === updated.id ? updated : period));
}

function trimPeriodsToLimit(periods: Period[]): Period[] {
  if (periods.length <= MAX_STORED_PERIODS) {
    return periods;
  }

  const overflowCount = periods.length - MAX_STORED_PERIODS;
  const removeIds = new Set(
    [...periods]
      .sort((a, b) => {
        const startDiff = dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf();
        if (startDiff !== 0) {
          return startDiff;
        }

        return dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf();
      })
      .slice(0, overflowCount)
      .map((period) => period.id),
  );

  return periods.filter((period) => !removeIds.has(period.id));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function hasMatchingPeriods(localState: AppState, remoteState: AppState): boolean {
  if (localState.periods.length !== remoteState.periods.length) {
    return false;
  }

  const localIds = localState.periods.map((period) => period.id).sort();
  const remoteIds = remoteState.periods.map((period) => period.id).sort();

  return localIds.every((id, index) => id === remoteIds[index]);
}

const REMOTE_SYNC_MIN_INTERVAL_MS = 60_000;

export default function App(): JSX.Element {
  const initial = useMemo(getInitialState, []);
  const syncAvailable = isRemoteSyncAvailable();
  const createTargetStartDate = dayjs().format('YYYY-MM-DD');

  const [appState, setAppState] = useState<AppState>(initial.appState);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initial.savedAt);
  const [isDirty, setIsDirty] = useState(false);
  const [emptyStartDate, setEmptyStartDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [userCode, setUserCode] = useState<string>(() => ensureUserCode());
  const [codeInputDraft, setCodeInputDraft] = useState('');
  const [codeStatusMessage, setCodeStatusMessage] = useState<string | null>(null);
  const [, setSyncAlert] = useState<SyncAlert | null>(null);
  const [isCodeActionPending, setIsCodeActionPending] = useState(false);
  const [isServerDataMissingForCode, setIsServerDataMissingForCode] = useState(false);
  const [isCreateHolidayNoticeOpen, setIsCreateHolidayNoticeOpen] = useState(false);
  const skipNextAutoSaveRef = useRef(false);
  const initializedCodeRef = useRef<string | null>(null);
  const lastRemoteSyncedAtRef = useRef(0);
  const pendingRemoteSyncTimerRef = useRef<number | null>(null);
  const pendingRemoteSyncStateRef = useRef<AppState | null>(null);

  const selectedPeriod = useMemo(
    () => appState.periods.find((period) => period.id === appState.selectedPeriodId) ?? null,
    [appState.periods, appState.selectedPeriodId],
  );

  const selectedCalc = useMemo(
    () => (selectedPeriod ? recalculatePeriod(selectedPeriod) : null),
    [selectedPeriod],
  );

  const todayTarget = useTodayRecord(selectedCalc?.records ?? []);
  const todayRecordIndex = todayTarget?.index ?? -1;

  const todayRecord =
    selectedCalc && todayRecordIndex >= 0
      ? selectedCalc.records[todayRecordIndex]
      : null;
  const targetLabel = todayRecord ? formatDateCell(todayRecord.date) : '-';
  const isTodayTarget = todayTarget?.mode === 'today';

  const suggestedLabel = useMemo(
    () => buildDefaultPeriodLabel(createTargetStartDate),
    [createTargetStartDate],
  );
  const holidayProviderSyncKey = useMemo(
    () =>
      appState.periods
        .map((period) => period.records.map((record) => record.date).join(','))
        .join('|'),
    [appState.periods],
  );

  const canDeleteCurrentPeriod = Boolean(selectedPeriod);
  const canResetAllData = appState.periods.length > 0 || hasAppStorageData();

  function markDirty(): void {
    setIsDirty(true);
  }

  function updateSelectedPeriod(updater: (period: Period) => Period): void {
    setAppState((prev) => {
      if (!prev.selectedPeriodId) {
        return prev;
      }

      const current = prev.periods.find((period) => period.id === prev.selectedPeriodId);
      if (!current) {
        return prev;
      }

      const updated = updater(current);
      return {
        ...prev,
        periods: upsertPeriod(prev.periods, updated),
      };
    });

    markDirty();
  }

  function handlePatchRecord(
    index: number,
    patch: Partial<
      Pick<
        DayRecord,
        'isHoliday' | 'annualLeaveType' | 'officialLeaveMinutes' | 'clockIn' | 'clockOut' | 'dinnerChecked' | 'nonWorkMinutes' | 'claimedOtMinutes'
      >
    >,
  ): void {
    updateSelectedPeriod((period) => {
      const nextRecords = period.records.map((record, rowIndex) =>
        rowIndex === index ? { ...record, ...patch } : record,
      );

      return {
        ...period,
        records: recalculateRecords(nextRecords).records,
      };
    });
  }

  function handleSetNow(index: number, field: 'clockIn' | 'clockOut'): void {
    handlePatchRecord(index, {
      [field]: nowToHHmm(),
    });
  }

  function handlePatchTodayRecord(
    patch: Partial<
      Pick<
        DayRecord,
        'annualLeaveType' | 'officialLeaveMinutes' | 'clockIn' | 'clockOut' | 'dinnerChecked' | 'nonWorkMinutes' | 'claimedOtMinutes'
      >
    >,
  ): void {
    if (todayRecordIndex < 0) {
      return;
    }

    handlePatchRecord(todayRecordIndex, patch);
  }

  function handleSetNowToday(field: 'clockIn' | 'clockOut'): void {
    if (todayRecordIndex < 0) {
      return;
    }

    handleSetNow(todayRecordIndex, field);
  }

  function handleStartDateChange(startDate: string): void {
    if (!startDate) {
      return;
    }

    updateSelectedPeriod((period) => ({
      ...period,
      startDate,
      records: rebaseRecordDates(startDate, period.records),
    }));
  }

  function handleCreatePeriod(payload: CreatePeriodPayload): void {
    const label = payload.label.trim() || buildDefaultPeriodLabel(payload.startDate);
    const id = ensureUniquePeriodId(label, appState.periods.map((period) => period.id));

    const sourceRecords = selectedPeriod?.records ?? [];
    const records = copyRecordsWithNewDate(payload.startDate, sourceRecords, payload.copyValues);

    const period = createPeriod({
      id,
      label,
      startDate: payload.startDate,
      records,
    });

    skipNextAutoSaveRef.current = true;

    setAppState((prev) => {
      const nextPeriods = trimPeriodsToLimit([...prev.periods, period]);

      return {
        selectedPeriodId: period.id,
        periods: nextPeriods,
      };
    });

    markDirty();
    setIsCreateHolidayNoticeOpen(true);
  }

  function handleCreateFirstPeriod(): void {
    if (!emptyStartDate) {
      return;
    }

    handleCreatePeriod({
      label: buildDefaultPeriodLabel(emptyStartDate),
      startDate: emptyStartDate,
      copyValues: false,
    });
  }

  async function handleCopyUserCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(userCode);
      setCodeStatusMessage(null);
    } catch {
      setCodeStatusMessage('??? ??????. ??? ?? ??? ??????.');
    }
  }

  async function handleLoadByCode(rawCode: string): Promise<CodeLoadResult> {
    const normalized = normalizeUserCode(rawCode);
    const shouldShowInlineCodeStatus = appState.periods.length === 0;

    if (!isValidUserCode(normalized)) {
      const message = '?? ??? ???? ????. (?: WT-8F4K2M)';
      if (shouldShowInlineCodeStatus) {
        setCodeStatusMessage(message);
      }
      return { ok: false, message, tone: 'warning' };
    }

    if (!syncAvailable) {
      const message = '?? ??? ??? ?? ?? ????? ??? ? ????.';
      if (shouldShowInlineCodeStatus) {
        setCodeStatusMessage(message);
      }
      return { ok: false, message, tone: 'warning' };
    }

    if (isDirty) {
      const confirmed = window.confirm(
        '???? ?? ????? ????. ?? ????? ???? ?? ??? ?????. ?????????',
      );
      if (!confirmed) {
        return { ok: false, message: '', tone: 'info' };
      }
    }

    setIsCodeActionPending(true);
    if (shouldShowInlineCodeStatus) {
      setCodeStatusMessage(null);
    }

    try {
      const remote = await loadRemoteState(normalized);
      if (!remote.appState) {
        if (normalized !== userCode) {
          const savedCode = saveUserCode(normalized);
          setUserCode(savedCode);
          const emptyState = createEmptyAppState();
          setAppState(emptyState);
          const localSavedAt = saveAppState(emptyState);
          setLastSavedAt(localSavedAt);
          setIsDirty(false);
          setCodeInputDraft('');
        }

        setIsServerDataMissingForCode(
          normalized === userCode && (remote.hasRemoteUser || appState.periods.length > 0),
        );
        const message = remote.hasRemoteUser
          ? '?? ???? ?? ??? ?? ???? ????.'
          : '?? ???? ?????? ?? ???? ?????.';
        if (shouldShowInlineCodeStatus) {
          setCodeStatusMessage(message);
        }
        return { ok: false, message, tone: 'warning' };
      }

      const preferredSelectedPeriodId =
        normalized === userCode ? appState.selectedPeriodId : null;
      const hydrated = hydrateAppState(remote.appState, preferredSelectedPeriodId);
      const savedCode = saveUserCode(normalized);
      setUserCode(savedCode);
      setAppState(hydrated);
      setIsDirty(false);
      setIsServerDataMissingForCode(false);
      setCodeInputDraft('');

      const localSavedAt = saveAppState(hydrated);
      setLastSavedAt(remote.savedAt ?? localSavedAt);
      setSyncAlert(null);
      if (shouldShowInlineCodeStatus) {
        setCodeStatusMessage(null);
      }

      return { ok: true, message: '', tone: 'success' };
    } catch (error) {
      const message = getSyncUnavailableMessage(error);
      if (shouldShowInlineCodeStatus) {
        setCodeStatusMessage(message);
      }
      return { ok: false, message, tone: 'error' };
    } finally {
      setIsCodeActionPending(false);
    }
  }

  async function handleRestoreServerFromLocal(): Promise<void> {
    if (!syncAvailable) {
      setSyncAlert({
        message: '?? ??? ??? ?? ??? ? ????.',
        tone: 'warning',
      });
      return;
    }

    const localStateToRestore = appState;
    const preferredSelectedPeriodId = appState.selectedPeriodId;

    async function verifyRemoteRestore(): Promise<VerifiedRemoteState | null> {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const remote = await loadRemoteState(userCode);
        if (remote.appState && hasMatchingPeriods(localStateToRestore, remote.appState)) {
          return {
            appState: remote.appState,
            savedAt: remote.savedAt,
          };
        }

        if (attempt === 0) {
          await wait(250);
        }
      }

      return null;
    }

    try {
      clearPendingRemoteSync();
      await syncRemoteState(userCode, localStateToRestore, { markActivity: true });
      lastRemoteSyncedAtRef.current = Date.now();

      const verifiedRemote = await verifyRemoteRestore();
      if (!verifiedRemote) {
        throw new Error('?? ??? ? ???? ???? ?????. ?? ? ?? ??????.');
      }

      const hydrated = hydrateAppState(verifiedRemote.appState, preferredSelectedPeriodId);
      setAppState(hydrated);
      const localSavedAt = saveAppState(hydrated);
      setLastSavedAt(verifiedRemote.savedAt ?? localSavedAt);
      setIsDirty(false);
      setIsServerDataMissingForCode(false);
      setSyncAlert(null);
    } catch (error) {
      setSyncAlert({
        message: getSyncUnavailableMessage(error),
        tone: 'error',
      });
    }
  }

  function triggerRemoteSync(stateToSync: AppState): void {
    lastRemoteSyncedAtRef.current = Date.now();
    void syncRemoteState(userCode, stateToSync, { markActivity: true })
      .then(() => {
        setIsServerDataMissingForCode(false);
        setSyncAlert(null);
      })
      .catch((error) => {
        setSyncAlert({
          message: getSyncUnavailableMessage(error),
          tone: 'error',
        });
      });
  }

  function clearPendingRemoteSync(): void {
    if (pendingRemoteSyncTimerRef.current !== null) {
      window.clearTimeout(pendingRemoteSyncTimerRef.current);
      pendingRemoteSyncTimerRef.current = null;
    }

    pendingRemoteSyncStateRef.current = null;
  }

  function scheduleRemoteSync(stateToSync: AppState, force = false): void {
    if (!syncAvailable) {
      return;
    }

    if (force) {
      clearPendingRemoteSync();
      triggerRemoteSync(stateToSync);
      return;
    }

    const now = Date.now();
    const elapsed = now - lastRemoteSyncedAtRef.current;
    if (
      lastRemoteSyncedAtRef.current === 0 ||
      elapsed >= REMOTE_SYNC_MIN_INTERVAL_MS
    ) {
      triggerRemoteSync(stateToSync);
      return;
    }

    pendingRemoteSyncStateRef.current = stateToSync;
    clearPendingRemoteSync();
    pendingRemoteSyncStateRef.current = stateToSync;

    const waitMs = REMOTE_SYNC_MIN_INTERVAL_MS - elapsed;
    pendingRemoteSyncTimerRef.current = window.setTimeout(() => {
      const nextState = pendingRemoteSyncStateRef.current ?? stateToSync;
      pendingRemoteSyncStateRef.current = null;
      pendingRemoteSyncTimerRef.current = null;
      triggerRemoteSync(nextState);
    }, waitMs);
  }

  function persistState(stateToSave: AppState, forceRemoteSync = false): void {
    const savedAt = saveAppState(stateToSave);
    setLastSavedAt(savedAt);
    setIsDirty(false);

    scheduleRemoteSync(stateToSave, forceRemoteSync);
  }

  function handleSave(): void {
    persistState(appState, true);
  }

  useEffect(() => {
    if (!syncAvailable) {
      return;
    }

    if (initializedCodeRef.current === userCode) {
      return;
    }

    initializedCodeRef.current = userCode;
    let disposed = false;

    async function initializeSync(): Promise<void> {
      try {
        await runWeeklyRemoteCleanup();

        const remote = await loadRemoteState(userCode);
        if (disposed) {
          return;
        }

        if (!remote.appState) {
          if (appState.periods.length > 0) {
            setIsServerDataMissingForCode(true);
          } else {
            setIsServerDataMissingForCode(remote.hasRemoteUser);
          }
          return;
        }

        setIsServerDataMissingForCode(false);
        const hydrated = hydrateAppState(remote.appState, appState.selectedPeriodId);
        setAppState(hydrated);
        const localSavedAt = saveAppState(hydrated);
        setLastSavedAt(remote.savedAt ?? localSavedAt);
        setSyncAlert(null);
        setCodeStatusMessage(null);
      } catch (error) {
        if (!disposed) {
          const message = getSyncUnavailableMessage(error);
          if (appState.periods.length === 0) {
            setCodeStatusMessage(message);
          } else {
            setSyncAlert({
              message,
              tone: 'error',
            });
          }
        }
      }
    }

    void initializeSync();

    return () => {
      disposed = true;
    };
  }, [appState.periods.length, syncAvailable, userCode]);

  useEffect(() => {
    clearPendingRemoteSync();
    lastRemoteSyncedAtRef.current = 0;
  }, [userCode]);

  useEffect(() => {
    if (!holidayProviderSyncKey) {
      return;
    }

    let disposed = false;
    const dates = appState.periods.flatMap((period) =>
      period.records.map((record) => record.date),
    );

    async function syncHolidayProvider(): Promise<void> {
      const holidayDates = await getHolidayDateSet(dates);
      if (disposed || holidayDates.size === 0) {
        return;
      }

      const shouldMarkDirty = appState.periods.some((period) =>
        period.records.some(
          (record) => holidayDates.has(record.date) && !record.isHoliday,
        ),
      );
      if (!shouldMarkDirty) {
        return;
      }

      setAppState((prev) => {
        let changed = false;
        const periods = prev.periods.map((period) => {
          let periodChanged = false;
          const records = period.records.map((record) => {
            if (!holidayDates.has(record.date) || record.isHoliday) {
              return record;
            }

            periodChanged = true;
            changed = true;
            return {
              ...record,
              isHoliday: true,
            };
          });

          return periodChanged
            ? { ...period, records: recalculateRecords(records).records }
            : period;
        });

        return changed ? { ...prev, periods } : prev;
      });

      markDirty();
    }

    void syncHolidayProvider();

    return () => {
      disposed = true;
    };
  }, [holidayProviderSyncKey]);

  useEffect(() => {
    return () => {
      clearPendingRemoteSync();
    };
  }, []);

  useEffect(() => {
    function flushRemoteSyncOnBackground(): void {
      if (!syncAvailable) {
        return;
      }

      const hasPendingRemoteSync =
        pendingRemoteSyncTimerRef.current !== null ||
        pendingRemoteSyncStateRef.current !== null;

      if (!isDirty && !hasPendingRemoteSync) {
        return;
      }

      if (isDirty) {
        persistState(appState, true);
        return;
      }

      clearPendingRemoteSync();
      const stateToSync = pendingRemoteSyncStateRef.current ?? appState;
      pendingRemoteSyncStateRef.current = null;
      triggerRemoteSync(stateToSync);
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState === 'hidden') {
        flushRemoteSyncOnBackground();
      }
    }

    function handlePageHide(): void {
      flushRemoteSyncOnBackground();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [appState, isDirty, syncAvailable, userCode]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      persistState(appState);
    }, 1500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [appState, isDirty]);

  function handleDeleteCurrentPeriod(): void {
    if (!selectedPeriod) {
      return;
    }

    const confirmed = window.confirm(
      `현재 구간 [${selectedPeriod.label}]을(를) 삭제합니다. 이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?`,
    );

    if (!confirmed) {
      return;
    }

    setAppState((prev) => deleteCurrentPeriod(prev));
    markDirty();
  }

  function handleResetAllData(): void {
    const confirmed = window.confirm(
      '전체 데이터 초기화를 실행하면 저장된 모든 구간이 삭제되고 동기화 코드도 새로 발급됩니다. 이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?',
    );

    if (!confirmed) {
      return;
    }

    const previousUserCode = userCode;
    const emptyState = createEmptyAppState();

    clearPendingRemoteSync();
    lastRemoteSyncedAtRef.current = 0;

    if (syncAvailable) {
      void syncRemoteState(previousUserCode, emptyState, { markActivity: true }).catch((error) => {
        setSyncAlert({
          message: getSyncUnavailableMessage(error),
          tone: 'error',
        });
      });
    }

    clearAllAppStorage();
    const nextUserCode = ensureUserCode();

    setAppState(emptyState);
    setUserCode(nextUserCode);
    setLastSavedAt(null);
    setIsDirty(false);
    setEmptyStartDate(dayjs().format('YYYY-MM-DD'));
    setCodeInputDraft('');
    setIsServerDataMissingForCode(false);
    setCodeStatusMessage(null);
    setSyncAlert(null);
  }

  if (!selectedPeriod || !selectedCalc) {
    return (
      <main className="app-shell">
        <section className="surface-panel content-reveal">
          <div className="relative">
            <p className="status-chip">2주 자동 생성 시작</p>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-slate-900">
              2주 탄력근무 근태 계산기
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
              첫 화면에서 2주 시작일만 설정하면 됩니다. 시작일을 기준으로 14일이 자동 생성됩니다.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="field-label max-w-[220px]">
                2주 시작일
                <input
                  type="date"
                  value={emptyStartDate}
                  onChange={(event) => setEmptyStartDate(event.target.value)}
                  className="field-input-soft"
                />
              </label>

              <button
                type="button"
                onClick={handleCreateFirstPeriod}
                className="btn-primary h-11 min-w-[146px]"
              >
                첫 구간 생성
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-bold text-slate-500">동기화 코드</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-extrabold tracking-wide text-indigo-700">
                  {userCode}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    void handleCopyUserCode();
                  }}
                  className="btn-quiet h-11"
                >
                  코드 복사
                </button>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={codeInputDraft}
                  onChange={(event) => setCodeInputDraft(normalizeUserCode(event.target.value))}
                  placeholder="기존 코드 입력 (예: WT-8F4K2M)"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  className="field-input h-11 w-full sm:max-w-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    void handleLoadByCode(codeInputDraft);
                  }}
                  disabled={isCodeActionPending}
                  className="btn-secondary h-11 disabled:opacity-50"
                >
                  기존 코드로 데이터 불러오기
                </button>
              </div>

              {!syncAvailable ? (
                <p className="mt-2 text-xs text-amber-600">
                  서버 동기화를 사용하려면 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
                  환경변수가 필요합니다.
                </p>
              ) : null}

              {codeStatusMessage ? (
                <p className="mt-2 text-xs text-slate-500">{codeStatusMessage}</p>
              ) : null}
            </div>

          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="content-reveal relative z-30">
        <PeriodManager
          periods={appState.periods}
          selectedPeriodId={selectedPeriod.id}
          selectedStartDate={selectedPeriod.startDate}
          createTargetStartDate={createTargetStartDate}
          defaultCreateLabel={suggestedLabel}
          userCode={userCode}
          isDirty={isDirty}
          lastSavedAt={lastSavedAt}
          canDeleteCurrentPeriod={canDeleteCurrentPeriod}
          isCreateHolidayNoticeOpen={isCreateHolidayNoticeOpen}
          canResetAllData={canResetAllData}
          onSelectPeriod={(id) => setAppState((prev) => ({ ...prev, selectedPeriodId: id }))}
          onChangeStartDate={handleStartDateChange}
          onCreatePeriod={handleCreatePeriod}
          onCloseCreateHolidayNotice={() => setIsCreateHolidayNoticeOpen(false)}
          onSave={handleSave}
          onLoadUserCode={handleLoadByCode}
          onDeleteCurrentPeriod={handleDeleteCurrentPeriod}
          onResetAllData={handleResetAllData}
        />
        {isServerDataMissingForCode && appState.periods.length > 0 ? (
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <span>서버 동기화 없이 로컬로 데이터가 저장됩니다.</span>
            <button
              type="button"
              onClick={() => {
                void handleRestoreServerFromLocal();
              }}
              className="rounded-lg bg-white px-2 py-1 font-bold text-amber-700 hover:bg-amber-100"
            >
              서버 동기화
            </button>
          </div>
        ) : null}
      </div>

      <div className="content-reveal">
        <TodayQuickEntryCard
          targetLabel={targetLabel}
          isTodayTarget={isTodayTarget}
          record={todayRecord}
          onPatchRecord={handlePatchTodayRecord}
          onSetNow={handleSetNowToday}
        />
      </div>

      <div className="content-reveal">
        <SummaryCards summary={selectedCalc.summary} />
      </div>

      <div className="content-reveal">
        <TimesheetTable
          records={selectedCalc.records}
          rowMeta={selectedCalc.rowMeta}
          onPatchRecord={handlePatchRecord}
        />
      </div>
    </main>
  );
}
