import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';

import PeriodManager from './components/PeriodManager';
import SummaryCards from './components/SummaryCards';
import TimesheetTable from './components/TimesheetTable';
import TodayQuickEntryCard from './components/TodayQuickEntryCard';
import { createSampleState } from './data/sampleData';
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
  hasAppStorageData,
  loadAppState,
  saveAppState,
} from './utils/storage';
import { formatDateCell, nowToHHmm } from './utils/time';
import { useTodayRecord } from './hooks/useTodayRecord';

interface InitialState {
  appState: AppState;
  savedAt: string | null;
}

function getInitialState(): InitialState {
  const loaded = loadAppState();

  if (!loaded) {
    return {
      appState: createEmptyAppState(),
      savedAt: null,
    };
  }

  const periods = loaded.periods.map((period) => {
    const calc = recalculatePeriod(period);
    return {
      ...period,
      records: calc.records,
    };
  });

  const selectedPeriodId =
    loaded.selectedPeriodId && periods.some((period) => period.id === loaded.selectedPeriodId)
      ? loaded.selectedPeriodId
      : periods[0]?.id ?? null;

  return {
    appState: {
      selectedPeriodId,
      periods,
    },
    savedAt: loaded.savedAt,
  };
}

function upsertPeriod(periods: Period[], updated: Period): Period[] {
  return periods.map((period) => (period.id === updated.id ? updated : period));
}

function SectionCalendarIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function SectionSummaryIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

export default function App(): JSX.Element {
  const initial = useMemo(getInitialState, []);

  const [appState, setAppState] = useState<AppState>(initial.appState);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initial.savedAt);
  const [isDirty, setIsDirty] = useState(false);
  const [emptyStartDate, setEmptyStartDate] = useState(dayjs().format('YYYY-MM-DD'));
  const skipNextAutoSaveRef = useRef(false);

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
        'isHoliday' | 'clockIn' | 'clockOut' | 'dinnerChecked' | 'nonWorkMinutes' | 'claimedOtMinutes'
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
        'clockIn' | 'clockOut' | 'dinnerChecked' | 'nonWorkMinutes' | 'claimedOtMinutes'
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

  function handleLoadSample(): void {
    setAppState(createSampleState());
    markDirty();
  }

  function persistState(stateToSave: AppState): void {
    const savedAt = saveAppState(stateToSave);
    setLastSavedAt(savedAt);
    setIsDirty(false);
  }

  function handleSave(): void {
    persistState(appState);
  }

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
    }, 3000);

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
    setAppState(createEmptyAppState());
    setLastSavedAt(null);
    setIsDirty(false);
    setEmptyStartDate(dayjs().format('YYYY-MM-DD'));
  }

  if (!selectedPeriod || !selectedCalc) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-soft">
          <h1 className="text-2xl font-bold text-slate-900">2주 탄력근무 근태 계산기</h1>
          <p className="mt-2 text-sm text-slate-600">
            첫 화면에서 2주 시작일만 설정하면 됩니다. 시작일을 기준으로 14일이 자동 생성됩니다.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              2주 시작일
              <input
                type="date"
                value={emptyStartDate}
                onChange={(event) => setEmptyStartDate(event.target.value)}
                className="rounded-lg border border-slate-300 bg-sky-50 px-3 py-2"
              />
            </label>

            <button
              type="button"
              onClick={handleCreateFirstPeriod}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              첫 구간 생성
            </button>

            <button
              type="button"
              onClick={handleLoadSample}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              샘플 데이터 불러오기
            </button>
          </div>

          <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50/70 p-3">
            <p className="text-xs font-semibold tracking-wide text-rose-700">데이터 관리</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled
                className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 opacity-50"
              >
                현재 구간 삭제
              </button>
              <button
                type="button"
                onClick={handleResetAllData}
                disabled={!canResetAllData}
                className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                전체 데이터 초기화
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-4 px-3 py-4 sm:px-6 sm:py-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">2주 자율출퇴근 계산기</h1>
        <p className="mt-1 text-sm text-slate-600">
          계산은 분(minute) 단위로 HR시스템과 오차가 발생할 수 있습니다.
          <br />
          임시 공휴일은 직접 수정해주세요.
        </p>
      </header>

      <PeriodManager
        periods={appState.periods}
        selectedPeriodId={selectedPeriod.id}
        selectedStartDate={selectedPeriod.startDate}
        defaultCreateLabel={suggestedLabel}
        isDirty={isDirty}
        lastSavedAt={lastSavedAt}
        canDeleteCurrentPeriod={canDeleteCurrentPeriod}
        canResetAllData={canResetAllData}
        onSelectPeriod={(id) => setAppState((prev) => ({ ...prev, selectedPeriodId: id }))}
        onChangeStartDate={handleStartDateChange}
        onCreatePeriod={handleCreatePeriod}
        onSave={handleSave}
        onDeleteCurrentPeriod={handleDeleteCurrentPeriod}
        onResetAllData={handleResetAllData}
      />

      <TodayQuickEntryCard
        targetLabel={targetLabel}
        isTodayTarget={isTodayTarget}
        record={todayRecord}
        onPatchRecord={handlePatchTodayRecord}
        onSetNow={handleSetNowToday}
      />

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-slate-900">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-indigo-100 text-indigo-600">
            <SectionSummaryIcon className="h-4 w-4" />
          </span>
          <h2 className="text-lg font-bold sm:text-xl">2주 근무 누적 요약</h2>
        </div>
        <SummaryCards summary={selectedCalc.summary} />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
        <div className="mb-3 flex items-center">
          <div className="flex items-center gap-2 text-slate-900">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-indigo-100 text-indigo-600">
              <SectionCalendarIcon className="h-4 w-4" />
            </span>
            <h2 className="text-xl font-bold sm:text-2xl">최근 2주 근무기록</h2>
          </div>
        </div>

        <TimesheetTable
          records={selectedCalc.records}
          rowMeta={selectedCalc.rowMeta}
          onPatchRecord={handlePatchRecord}
        />
      </section>
    </main>
  );
}
