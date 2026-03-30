import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';

import PeriodManager from './components/PeriodManager';
import SummaryCards from './components/SummaryCards';
import TimesheetTable from './components/TimesheetTable';
import TodayQuickEntryCard from './components/TodayQuickEntryCard';
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
import {
  clearAllAppStorage,
  ensureUserCode,
  hasAppStorageData,
  loadAppState,
  saveUserCode,
  saveAppState,
} from './utils/storage';
import {
  ensureRemoteUser,
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
}

function hydrateAppState(source: AppState): AppState {
  const periods = source.periods.map((period) => {
    const calc = recalculatePeriod(period);
    return {
      ...period,
      records: calc.records,
    };
  });

  const selectedPeriodId =
    source.selectedPeriodId &&
    periods.some((period) => period.id === source.selectedPeriodId)
      ? source.selectedPeriodId
      : periods[0]?.id ?? null;

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

const REMOTE_SYNC_MIN_INTERVAL_MS = 60_000;

export default function App(): JSX.Element {
  const initial = useMemo(getInitialState, []);
  const syncAvailable = isRemoteSyncAvailable();

  const [appState, setAppState] = useState<AppState>(initial.appState);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initial.savedAt);
  const [isDirty, setIsDirty] = useState(false);
  const [emptyStartDate, setEmptyStartDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [userCode, setUserCode] = useState<string>(() => ensureUserCode());
  const [codeInputDraft, setCodeInputDraft] = useState('');
  const [codeStatusMessage, setCodeStatusMessage] = useState<string | null>(null);
  const [isCodeActionPending, setIsCodeActionPending] = useState(false);
  const [isServerDataMissingForCode, setIsServerDataMissingForCode] = useState(false);
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
    () => buildDefaultPeriodLabel(selectedPeriod?.startDate ?? emptyStartDate),
    [selectedPeriod?.startDate, emptyStartDate],
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

    setAppState((prev) => ({
      selectedPeriodId: period.id,
      periods: [...prev.periods, period],
    }));

    markDirty();
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
      setCodeStatusMessage('동기화 코드를 복사했습니다.');
    } catch {
      setCodeStatusMessage('복사에 실패했습니다. 코드를 직접 선택해 복사해주세요.');
    }
  }

  async function handleLoadByCode(rawCode: string): Promise<CodeLoadResult> {
    const normalized = normalizeUserCode(rawCode);

    if (!isValidUserCode(normalized)) {
      const message = '코드 형식이 올바르지 않습니다. (예: WT-8F4K2M)';
      setCodeStatusMessage(message);
      return { ok: false, message };
    }

    if (!syncAvailable) {
      const message = '서버 동기화 설정이 없어 코드 불러오기를 사용할 수 없습니다.';
      setCodeStatusMessage(message);
      return { ok: false, message };
    }

    if (isDirty) {
      const confirmed = window.confirm(
        '저장되지 않은 변경사항이 있습니다. 코드 불러오기를 진행하면 현재 화면이 교체됩니다. 계속하시겠습니까?',
      );
      if (!confirmed) {
        return { ok: false, message: '불러오기를 취소했습니다.' };
      }
    }

    setIsCodeActionPending(true);
    setCodeStatusMessage(null);

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
          ? '해당 코드에는 아직 생성된 구간 데이터가 없습니다.'
          : '서버 데이터가 정리되었거나 아직 생성되지 않았습니다.';
        setCodeStatusMessage(message);
        return { ok: false, message };
      }

      const hydrated = hydrateAppState(remote.appState);
      const savedCode = saveUserCode(normalized);
      setUserCode(savedCode);
      setAppState(hydrated);
      setIsDirty(false);
      setIsServerDataMissingForCode(false);
      setCodeInputDraft('');

      const localSavedAt = saveAppState(hydrated);
      setLastSavedAt(remote.savedAt ?? localSavedAt);

      const message = '코드 데이터를 불러왔습니다.';
      setCodeStatusMessage(message);
      
      return { ok: true, message };
    } catch (error) {
      const message = getSyncUnavailableMessage(error);
      setCodeStatusMessage(message);
      return { ok: false, message };
    } finally {
      setIsCodeActionPending(false);
    }
  }

  async function handleRestoreServerFromLocal(): Promise<void> {
    if (!syncAvailable) {
      setCodeStatusMessage('서버 동기화 설정이 없어 복구할 수 없습니다.');
      return;
    }

    try {
      await syncRemoteState(userCode, appState, { markActivity: true });
      setIsServerDataMissingForCode(false);
      setCodeStatusMessage('로컬 기록으로 서버 데이터를 다시 시작했습니다.');
    } catch (error) {
      setCodeStatusMessage(getSyncUnavailableMessage(error));
    }
  }

  function triggerRemoteSync(stateToSync: AppState): void {
    lastRemoteSyncedAtRef.current = Date.now();
    void syncRemoteState(userCode, stateToSync, { markActivity: true }).catch((error) => {
      setCodeStatusMessage(getSyncUnavailableMessage(error));
    });
  }

  function scheduleRemoteSync(stateToSync: AppState, force = false): void {
    if (!syncAvailable) {
      return;
    }

    if (force) {
      if (pendingRemoteSyncTimerRef.current !== null) {
        window.clearTimeout(pendingRemoteSyncTimerRef.current);
        pendingRemoteSyncTimerRef.current = null;
      }
      pendingRemoteSyncStateRef.current = null;
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
    if (pendingRemoteSyncTimerRef.current !== null) {
      window.clearTimeout(pendingRemoteSyncTimerRef.current);
    }

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
        await ensureRemoteUser(userCode);
        await runWeeklyRemoteCleanup();

        const remote = await loadRemoteState(userCode);
        if (disposed) {
          return;
        }

        if (!remote.appState) {
          if (appState.periods.length > 0) {
            setIsServerDataMissingForCode(true);
            setCodeStatusMessage(
              '서버 데이터가 정리되었습니다. 필요하면 로컬 기록으로 다시 시작할 수 있습니다.',
            );
          } else {
            setIsServerDataMissingForCode(remote.hasRemoteUser);
          }
          return;
        }

        setIsServerDataMissingForCode(false);
        const hydrated = hydrateAppState(remote.appState);
        setAppState(hydrated);
        const localSavedAt = saveAppState(hydrated);
        setLastSavedAt(remote.savedAt ?? localSavedAt);
        setCodeStatusMessage(
          appState.periods.length > 0
            ? '서버 우선 정책으로 서버 데이터를 적용했습니다.'
            : '서버에 저장된 데이터를 불러왔습니다.',
        );
      } catch (error) {
        if (!disposed) {
          setCodeStatusMessage(getSyncUnavailableMessage(error));
        }
      }
    }

    void initializeSync();

    return () => {
      disposed = true;
    };
  }, [appState.periods.length, syncAvailable, userCode]);

  useEffect(() => {
    if (pendingRemoteSyncTimerRef.current !== null) {
      window.clearTimeout(pendingRemoteSyncTimerRef.current);
      pendingRemoteSyncTimerRef.current = null;
    }
    pendingRemoteSyncStateRef.current = null;
    lastRemoteSyncedAtRef.current = 0;
  }, [userCode]);

  useEffect(() => {
    return () => {
      if (pendingRemoteSyncTimerRef.current !== null) {
        window.clearTimeout(pendingRemoteSyncTimerRef.current);
        pendingRemoteSyncTimerRef.current = null;
      }
    };
  }, []);

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
      '전체 데이터 초기화를 실행하면 저장된 모든 구간이 삭제됩니다. 이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?',
    );

    if (!confirmed) {
      return;
    }

    clearAllAppStorage();
    const emptyState = createEmptyAppState();
    setAppState(emptyState);
    setLastSavedAt(null);
    setIsDirty(false);
    setEmptyStartDate(dayjs().format('YYYY-MM-DD'));

    if (syncAvailable) {
      scheduleRemoteSync(emptyState, true);
    }
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
          defaultCreateLabel={suggestedLabel}
          userCode={userCode}
          isDirty={isDirty}
          lastSavedAt={lastSavedAt}
          canDeleteCurrentPeriod={canDeleteCurrentPeriod}
          canResetAllData={canResetAllData}
          onSelectPeriod={(id) => setAppState((prev) => ({ ...prev, selectedPeriodId: id }))}
          onChangeStartDate={handleStartDateChange}
          onCreatePeriod={handleCreatePeriod}
          onSave={handleSave}
          onLoadUserCode={handleLoadByCode}
          onDeleteCurrentPeriod={handleDeleteCurrentPeriod}
          onResetAllData={handleResetAllData}
        />
        {isServerDataMissingForCode && appState.periods.length > 0 ? (
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <span>서버 데이터가 정리되었습니다. 로컬 기록으로 다시 시작할 수 있습니다.</span>
            <button
              type="button"
              onClick={() => {
                void handleRestoreServerFromLocal();
              }}
              className="rounded-lg bg-white px-2 py-1 font-bold text-amber-700 hover:bg-amber-100"
            >
              로컬 기록으로 다시 시작
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
