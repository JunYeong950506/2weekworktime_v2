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
    setAppState(createEmptyAppState());
    setLastSavedAt(null);
    setIsDirty(false);
    setEmptyStartDate(dayjs().format('YYYY-MM-DD'));
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

              <button
                type="button"
                onClick={handleLoadSample}
                className="btn-secondary h-11 min-w-[170px]"
              >
                샘플 데이터 불러오기
              </button>
            </div>

            <div className="danger-zone mt-5">
              <p className="text-xs font-semibold tracking-wide text-rose-700">데이터 관리</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" disabled className="btn-secondary h-10 text-xs opacity-60">
                  현재 구간 삭제
                </button>
                <button
                  type="button"
                  onClick={handleResetAllData}
                  disabled={!canResetAllData}
                  className="btn-danger h-10 text-xs"
                >
                  전체 데이터 초기화
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="content-reveal">
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
