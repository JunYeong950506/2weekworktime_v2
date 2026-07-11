import { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';

import { DAILY_REGULAR_MINUTES, DINNER_BREAK_MINUTES, MINUTES_PER_HOUR } from '../constants';
import { AnnualLeaveType, DayRecord, TimeField } from '../types';
import {
  calculateSpecialWorkSimulation,
  clampSpecialWorkRequestMinutes,
} from '../utils/specialWork';
import { formatMinutesAsClock, parseTime24 } from '../utils/time';

interface TodayQuickEntryCardProps {
  targetLabel: string;
  isTodayTarget: boolean;
  earlyLeaveAvailableMinutes: number;
  record: DayRecord | null;
  onPatchRecord: (
    patch: Partial<
      Pick<
        DayRecord,
        | 'annualLeaveType'
        | 'officialLeaveMinutes'
        | 'clockIn'
        | 'clockOut'
        | 'dinnerChecked'
        | 'nonWorkMinutes'
        | 'specialWorkRequestMinutes'
        | 'claimedOtMinutes'
      >
    >,
  ) => void;
  onSetNow: (field: TimeField) => void;
}

const LONG_PRESS_DELAY_MS = 650;
const BREAK_THRESHOLD_MINUTES = 8 * MINUTES_PER_HOUR + 30;
const EXTRA_BREAK_THRESHOLD_MINUTES = 13 * MINUTES_PER_HOUR;
const SHORT_BREAK_MINUTES = 30;
const LONG_BREAK_MINUTES = 60;
const EXTRA_BREAK_MINUTES = 90;

function isPartialLeave(type: AnnualLeaveType): boolean {
  return type === 'quarter' || type === 'half';
}

function clampOfficialLeaveMinutes(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(480, Math.max(0, Math.round(value)));
}

function formatOfficialLeaveDisplay(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainMinutes = safeMinutes % 60;

  if (safeMinutes === 0) {
    return '0분';
  }

  if (remainMinutes === 0) {
    return `${hours}시간`;
  }

  if (hours === 0) {
    return `${remainMinutes}분`;
  }

  return `${hours}시간 ${remainMinutes}분`;
}

function formatClockFromTotalMinutes(totalMinutes: number): string {
  const minutesPerDay = 24 * MINUTES_PER_HOUR;
  const normalized = ((Math.round(totalMinutes) % minutesPerDay) + minutesPerDay) % minutesPerDay;
  const hours = Math.floor(normalized / MINUTES_PER_HOUR);
  const minutes = normalized % MINUTES_PER_HOUR;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function clampDurationMinutes(totalMinutes: number, maxMinutes: number): number {
  return Math.min(maxMinutes, Math.max(0, Math.round(totalMinutes)));
}

function formatDurationInputValue(totalMinutes: number, maxMinutes: number): string {
  const safeMinutes = clampDurationMinutes(totalMinutes, maxMinutes);
  const hours = Math.floor(safeMinutes / MINUTES_PER_HOUR);
  const minutes = safeMinutes % MINUTES_PER_HOUR;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatDurationLabel(totalMinutes: number, maxMinutes: number): string {
  const safeMinutes = clampDurationMinutes(totalMinutes, maxMinutes);
  const hours = Math.floor(safeMinutes / MINUTES_PER_HOUR);
  const minutes = safeMinutes % MINUTES_PER_HOUR;

  return `${hours}시간 ${String(minutes).padStart(2, '0')}분`;
}

function DurationPicker({
  ariaLabel,
  valueMinutes,
  maxMinutes,
  onChange,
  className,
}: {
  ariaLabel: string;
  valueMinutes: number;
  maxMinutes: number;
  onChange: (value: number) => void;
  className: string;
}): JSX.Element {
  return (
    <span className={`relative inline-flex items-center justify-center text-center ${className}`}>
      <span aria-hidden="true" className="pointer-events-none truncate">
        {formatDurationLabel(valueMinutes, maxMinutes)}
      </span>
      <input
        type="time"
        step={60}
        min="00:00"
        max={formatDurationInputValue(maxMinutes, maxMinutes)}
        aria-label={ariaLabel}
        value={formatDurationInputValue(valueMinutes, maxMinutes)}
        onChange={(event) => {
          const parsed = parseTime24(event.target.value);
          onChange(clampDurationMinutes(parsed?.totalMinutes ?? 0, maxMinutes));
        }}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
      />
    </span>
  );
}

function getExpectedStayMinutes(targetWorkMinutes: number, extraDeductionMinutes: number): number {
  const safeTargetWorkMinutes = Math.max(0, Math.round(targetWorkMinutes));
  const shortBreakStayMinutes =
    safeTargetWorkMinutes + SHORT_BREAK_MINUTES + extraDeductionMinutes;

  if (shortBreakStayMinutes < BREAK_THRESHOLD_MINUTES) {
    return shortBreakStayMinutes;
  }

  const longBreakStayMinutes =
    safeTargetWorkMinutes + LONG_BREAK_MINUTES + extraDeductionMinutes;
  if (longBreakStayMinutes < EXTRA_BREAK_THRESHOLD_MINUTES) {
    return longBreakStayMinutes;
  }

  return safeTargetWorkMinutes + EXTRA_BREAK_MINUTES + extraDeductionMinutes;
}

function TimePanel({
  label,
  value,
  min,
  max,
  disabled,
  compactOnMobile,
  onChange,
  onSetNow,
  onLongPressSetNow,
}: {
  label: string;
  value: string;
  min: string;
  max: string;
  disabled?: boolean;
  compactOnMobile?: boolean;
  onChange: (value: string) => void;
  onSetNow?: () => void;
  onLongPressSetNow?: () => void;
}): JSX.Element {
  const longPressTimerRef = useRef<number | null>(null);
  const longPressHandledRef = useRef(false);

  function clearLongPressTimer(): void {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function startLongPressTimer(): void {
    if (disabled || !onLongPressSetNow) {
      return;
    }

    clearLongPressTimer();
    longPressHandledRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressHandledRef.current = true;
      onLongPressSetNow();
    }, LONG_PRESS_DELAY_MS);
  }

  useEffect(() => clearLongPressTimer, []);

  return (
    <div
      className={`rounded-2xl border border-slate-100 bg-slate-50 transition-all focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100 ${
        compactOnMobile ? 'p-2 min-[360px]:p-3 min-[480px]:p-4' : 'p-4'
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <p className="ml-1 text-xs font-bold text-slate-400">{label}</p>
        {onSetNow ? (
          <button
            type="button"
            onClick={(event) => {
              if (longPressHandledRef.current) {
                event.preventDefault();
                longPressHandledRef.current = false;
                return;
              }

              onSetNow();
            }}
            onPointerDown={startLongPressTimer}
            onPointerUp={clearLongPressTimer}
            onPointerLeave={clearLongPressTimer}
            onPointerCancel={clearLongPressTimer}
            disabled={disabled}
            className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            현재
          </button>
        ) : null}
      </div>
      <input
        type="time"
        step={60}
        min={min}
        max={max}
        inputMode="numeric"
        pattern="[0-9:]*"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        title="HH:mm (24시간 형식)"
        className={`w-full bg-transparent font-extrabold text-slate-800 outline-none disabled:cursor-not-allowed disabled:text-slate-300 ${
          compactOnMobile
            ? 'text-xs min-[360px]:text-base min-[390px]:text-lg min-[480px]:text-2xl'
            : 'text-2xl'
        }`}
      />
    </div>
  );
}

function ResultTile({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: 'indigo' | 'slate' | 'rose';
}): JSX.Element {
  const className =
    tone === 'indigo'
      ? 'bg-indigo-600 text-white'
      : tone === 'rose'
        ? 'bg-rose-500 text-white'
        : 'bg-slate-800 text-white';

  return (
    <div className={`rounded-2xl p-4 ${className}`}>
      <span className="text-xs font-medium text-slate-200">{title}</span>
      <p className="mt-1 text-3xl font-extrabold tracking-tight">{value}</p>
    </div>
  );
}

export default function TodayQuickEntryCard({
  targetLabel,
  isTodayTarget,
  earlyLeaveAvailableMinutes,
  record,
  onPatchRecord,
  onSetNow,
}: TodayQuickEntryCardProps): JSX.Element {
  const dayOfWeek = record ? dayjs(record.date).day() : -1;
  const isSpecialWorkMode =
    record !== null && (dayOfWeek === 0 || dayOfWeek === 6 || record.isHoliday);
  const annualLeaveValue: AnnualLeaveType =
    record === null || isSpecialWorkMode ? 'none' : record.annualLeaveType;
  const isAnnualLeaveFullMode = annualLeaveValue === 'full';
  const isOfficialLeaveMode = annualLeaveValue === 'official';
  const disableTimeAndDeductionInputs = isSpecialWorkMode || isAnnualLeaveFullMode;

  const [isOfficialDialogOpen, setIsOfficialDialogOpen] = useState(false);
  const [officialLeaveDraft, setOfficialLeaveDraft] = useState(0);
  const [officialDialogPrevType, setOfficialDialogPrevType] =
    useState<AnnualLeaveType>('none');
  const [currentTime, setCurrentTime] = useState(() => dayjs());

  const specialWorkRequestMinutes = clampSpecialWorkRequestMinutes(
    record?.specialWorkRequestMinutes ?? 0,
  );
  const specialWorkFinalMinutes = Math.max(
    0,
    Math.round(record?.claimedOtMinutes ?? 0),
  );
  const specialWorkSimulation = record && isSpecialWorkMode
    ? calculateSpecialWorkSimulation(
        record.date,
        record.clockIn,
        specialWorkRequestMinutes,
        record.nonWorkMinutes,
        isTodayTarget ? currentTime : dayjs(record.date).startOf('day'),
      )
    : null;

  const showPartialLeaveNotice =
    record !== null &&
    isPartialLeave(annualLeaveValue) &&
    (record.clockIn.trim() === '' || record.clockOut.trim() === '');

  const showPartialLeaveWarning =
    record !== null &&
    isPartialLeave(annualLeaveValue) &&
    record.clockIn.trim() !== '' &&
    record.clockOut.trim() !== '' &&
    record.workMinutes !== null &&
    record.workMinutes < 4 * 60;
  const useRecommendedOtWarningTone =
    record !== null &&
    record.overtimeMinutes !== null &&
    record.overtimeMinutes > 0 &&
    record.overtimeMinutes < 60;
  const recommendedOtDisplayValue = useRecommendedOtWarningTone
    ? formatMinutesAsClock(record?.overtimeMinutes ?? null)
    : formatMinutesAsClock(record?.recommendedOtMinutes ?? null);
  const usableEarlyLeaveMinutes =
    earlyLeaveAvailableMinutes - (record?.earlyLeaveBalanceMinutes ?? 0);

  useEffect(() => {
    if (!isOfficialDialogOpen) {
      return;
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        handleCancelOfficialDialog();
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOfficialDialogOpen, officialDialogPrevType, record, onPatchRecord]);

  useEffect(() => {
    if (!isSpecialWorkMode || !isTodayTarget) {
      return;
    }

    let intervalId: number | null = null;
    const delayToNextMinute = 60_000 - (Date.now() % 60_000) + 50;
    const refresh = (): void => setCurrentTime(dayjs());
    const timeoutId = window.setTimeout(() => {
      refresh();
      intervalId = window.setInterval(refresh, 60_000);
    }, delayToNextMinute);

    const handleVisibilityChange = (): void => {
      if (!document.hidden) {
        refresh();
      }
    };

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isSpecialWorkMode, isTodayTarget]);

  function openOfficialDialog(previousType: AnnualLeaveType): void {
    setOfficialDialogPrevType(previousType);
    setOfficialLeaveDraft(clampOfficialLeaveMinutes(record?.officialLeaveMinutes ?? 0));
    setIsOfficialDialogOpen(true);
  }

  function handleCancelOfficialDialog(): void {
    if (officialDialogPrevType !== 'official') {
      onPatchRecord({
        annualLeaveType: officialDialogPrevType,
      });
    }

    setIsOfficialDialogOpen(false);
  }

  function handleSaveOfficialDialog(): void {
    onPatchRecord({
      annualLeaveType: 'official',
      officialLeaveMinutes: clampOfficialLeaveMinutes(officialLeaveDraft),
    });
    setIsOfficialDialogOpen(false);
  }

  function handleWorkTypeChange(nextValue: AnnualLeaveType): void {
    if (nextValue === 'official') {
      onPatchRecord({
        annualLeaveType: 'official',
      });
      openOfficialDialog(annualLeaveValue);
      return;
    }

    onPatchRecord({
      annualLeaveType: nextValue,
    });
  }

  function handleSetExpectedClockOut(): void {
    if (!record || disableTimeAndDeductionInputs) {
      return;
    }

    const parsedClockIn = parseTime24(record.clockIn);
    if (!parsedClockIn) {
      return;
    }

    const targetWorkMinutes = Math.max(0, DAILY_REGULAR_MINUTES - usableEarlyLeaveMinutes);
    const extraDeductionMinutes =
      (record.dinnerChecked ? DINNER_BREAK_MINUTES : 0) +
      Math.max(0, Math.round(record.nonWorkMinutes));
    const expectedStayMinutes = getExpectedStayMinutes(
      targetWorkMinutes,
      extraDeductionMinutes,
    );

    onPatchRecord({
      clockOut: formatClockFromTotalMinutes(parsedClockIn.totalMinutes + expectedStayMinutes),
    });
  }

  function handleSpecialWorkRequestChange(value: number): void {
    onPatchRecord({
      specialWorkRequestMinutes: clampSpecialWorkRequestMinutes(value),
    });
  }

  function handleSpecialWorkFinalChange(value: number): void {
    onPatchRecord({
      claimedOtMinutes: value,
    });
  }

  return (
    <>
      <section className="surface-panel">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="section-heading flex items-center gap-2 whitespace-nowrap text-lg min-[360px]:text-xl">
            <span className="section-icon section-icon-blue" aria-hidden="true">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 32 32">
                <path
                  className="stroke-indigo-500"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.7"
                  d="M9 5.5h13.5A2.5 2.5 0 0125 8v15.5a2.5 2.5 0 01-2.5 2.5H9a2.5 2.5 0 01-2.5-2.5V8A2.5 2.5 0 019 5.5z"
                />
                <path
                  className="stroke-indigo-500"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.7"
                  d="M11 11h8M11 16h6.5M11 21h5"
                />
                <circle cx="24" cy="24" r="5.3" className="fill-indigo-50 stroke-indigo-500" strokeWidth="2.5" />
                <path
                  className="stroke-indigo-500"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.4"
                  d="M21.7 23.8l1.6 1.7 3-3.2"
                />
              </svg>
            </span>
            오늘 근무 입력
          </h2>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-slate-400">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8.5" strokeWidth="1.8" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 7.5V12l3 2" />
            </svg>
            {targetLabel}
          </span>
        </div>

        {!isTodayTarget ? (
          <p className="mb-2 text-xs text-slate-500">
            오늘 날짜가 현재 구간에 없어 가장 가까운 날짜와 연결했습니다.
          </p>
        ) : null}

        {record && isAnnualLeaveFullMode ? (
          <p className="mb-2 text-xs text-slate-500">연차 사용일은 출퇴근 입력이 필요 없습니다.</p>
        ) : null}

        {record && isOfficialLeaveMode && record.officialLeaveMinutes <= 0 ? (
          <p className="mb-2 text-xs text-slate-500">공가 시간은 팝업에서 분 단위로 입력하세요.</p>
        ) : null}

        {record && showPartialLeaveNotice ? (
          <p className="mb-2 text-xs text-amber-600">
            반차/반반차는 실제 근무시간 4시간 이상일 때 인정됩니다.
          </p>
        ) : null}

        {record && showPartialLeaveWarning ? (
          <p className="mb-2 text-xs text-rose-600">
            반차/반반차는 실제 근무시간 4시간 이상일 때만 사용할 수 있습니다.
          </p>
        ) : null}

        {!record ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            편집 가능한 행이 없습니다.
          </p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {isSpecialWorkMode ? (
                <>
                  <div className="col-span-1">
                    <TimePanel
                      label="출근 시간"
                      value={record.clockIn}
                      min="00:00"
                      max="23:59"
                      compactOnMobile
                      onChange={(value) => onPatchRecord({ clockIn: value })}
                      onSetNow={() => onSetNow('clockIn')}
                    />
                  </div>

                  <div className="col-span-1 rounded-2xl border border-slate-100 bg-slate-50 p-2 transition-all focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100 min-[360px]:p-3 min-[480px]:p-4">
                    <p className="mb-1.5 ml-1 text-xs font-bold text-slate-400">신청 시간</p>
                    <DurationPicker
                      ariaLabel="신청 시간"
                      valueMinutes={specialWorkRequestMinutes}
                      maxMinutes={8 * MINUTES_PER_HOUR}
                      onChange={handleSpecialWorkRequestChange}
                      className="h-8 w-full bg-transparent text-base font-extrabold text-slate-800 outline-none min-[360px]:text-lg min-[480px]:text-2xl"
                    />
                  </div>

                  <div
                    className="relative col-span-2 h-11 overflow-hidden rounded-xl border border-emerald-100 bg-slate-100 xl:col-span-4"
                    role="progressbar"
                    aria-label="특근 신청시간 진행률"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(specialWorkSimulation?.progressPercent ?? 0)}
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-emerald-200 transition-[width] duration-500"
                      style={{
                        width: `${Math.min(100, specialWorkSimulation?.progressPercent ?? 0)}%`,
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center px-3 text-[11px] font-extrabold text-emerald-900 sm:text-xs">
                      {specialWorkSimulation?.completed ? (
                        <span>근무시간을 채웠습니다</span>
                      ) : (
                        <span className="flex min-w-0 items-center justify-center gap-2">
                          <span>
                            근무시간{' '}
                            {specialWorkSimulation?.targetClock
                              ? formatMinutesAsClock(specialWorkSimulation.workedMinutes)
                              : '-'}
                          </span>
                          <span className="text-emerald-500">/</span>
                          <span>퇴근 시각 {specialWorkSimulation?.targetClock ?? '-'}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="col-span-2 xl:col-span-1">
                    <TimePanel
                      label="출근 시간"
                      value={disableTimeAndDeductionInputs ? '' : record.clockIn}
                      min="06:00"
                      max="23:59"
                      disabled={disableTimeAndDeductionInputs}
                      onChange={(value) => onPatchRecord({ clockIn: value })}
                      onSetNow={() => onSetNow('clockIn')}
                    />
                  </div>

                  <div className="col-span-2 xl:col-span-1">
                    <TimePanel
                      label="퇴근 시간"
                      value={disableTimeAndDeductionInputs ? '' : record.clockOut}
                      min="00:00"
                      max="23:59"
                      disabled={disableTimeAndDeductionInputs}
                      onChange={(value) => onPatchRecord({ clockOut: value })}
                      onSetNow={() => onSetNow('clockOut')}
                      onLongPressSetNow={handleSetExpectedClockOut}
                    />
                  </div>
                </>
              )}

              {!isSpecialWorkMode ? (
                <>
                  <ResultTile
                    title="오늘 총 근무시간"
                    value={formatMinutesAsClock(record.workMinutes)}
                    tone="indigo"
                  />

                  <ResultTile
                    title={useRecommendedOtWarningTone ? '초과 근무 시간' : '권장 야근결재'}
                    value={recommendedOtDisplayValue}
                    tone={useRecommendedOtWarningTone ? 'rose' : 'slate'}
                  />
                </>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {!isSpecialWorkMode ? (
                <>
                  <label className="field-label">
                    근무 형태
                    <select
                      value={annualLeaveValue}
                      onChange={(event) =>
                        handleWorkTypeChange(event.target.value as AnnualLeaveType)
                      }
                      className="field-select"
                    >
                      <option value="none">정상근무</option>
                      <option value="quarter">반반차 (2시간)</option>
                      <option value="half">반차 (4시간)</option>
                      <option value="full">연차 (8시간)</option>
                      <option value="official">공가</option>
                    </select>
                    {isOfficialLeaveMode ? (
                      <button
                        type="button"
                        onClick={() => openOfficialDialog('official')}
                        className="mt-1 inline-flex w-fit rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-600 transition-colors hover:bg-indigo-100"
                      >
                        공가 {formatOfficialLeaveDisplay(record.officialLeaveMinutes)} 수정
                      </button>
                    ) : null}
                  </label>

                  <label className="field-label">
                    석식 여부
                    <span
                      className={`inline-flex h-11 items-center justify-between rounded-xl border px-3 text-sm font-bold ${
                        record.dinnerChecked
                          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-white text-slate-600'
                      } ${disableTimeAndDeductionInputs ? 'opacity-60' : ''}`}
                    >
                      {record.dinnerChecked ? '석식 먹음' : '석식 없음'}
                      <input
                        type="checkbox"
                        checked={record.dinnerChecked}
                        disabled={disableTimeAndDeductionInputs}
                        onChange={(event) => onPatchRecord({ dinnerChecked: event.target.checked })}
                        className="field-check"
                      />
                    </span>
                  </label>
                </>
              ) : null}

              <label className="field-label">
                비업무시간(분)
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={isAnnualLeaveFullMode ? 0 : record.nonWorkMinutes}
                  disabled={isAnnualLeaveFullMode}
                  onFocus={(event) => {
                    if (record.nonWorkMinutes === 0) {
                      event.currentTarget.select();
                    }
                  }}
                  onChange={(event) =>
                    onPatchRecord({
                      nonWorkMinutes: Number(event.target.value || 0),
                    })
                  }
                  className="field-input h-11 w-full text-right text-lg disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300"
                />
              </label>

              {isSpecialWorkMode ? (
                <label className="field-label">
                  최종 특근 시간
                  <DurationPicker
                    ariaLabel="최종 특근 시간"
                    valueMinutes={specialWorkFinalMinutes}
                    maxMinutes={23 * MINUTES_PER_HOUR + 59}
                    onChange={handleSpecialWorkFinalChange}
                    className="field-input h-11 w-full px-3 text-base font-extrabold text-indigo-600 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 min-[480px]:px-4 min-[480px]:text-lg"
                  />
                </label>
              ) : (
                <label className="field-label">
                  실제 야근결재(분)
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={isAnnualLeaveFullMode ? 0 : record.claimedOtMinutes}
                    disabled={isAnnualLeaveFullMode}
                    onFocus={(event) => {
                      if (record.claimedOtMinutes === 0) {
                        event.currentTarget.select();
                      }
                    }}
                    onChange={(event) =>
                      onPatchRecord({
                        claimedOtMinutes: Number(event.target.value || 0),
                      })
                    }
                    className="field-input h-11 w-full text-right text-lg text-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300"
                  />
                </label>
              )}
            </div>
          </div>
        )}
      </section>

      {record && isOfficialDialogOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleCancelOfficialDialog();
            }
          }}
        >
          <div className="w-full max-w-sm rounded-[28px] bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-extrabold tracking-tight text-slate-900">공가 시간 입력</h3>
            <p className="mt-1 text-sm text-slate-500">근무 형태: 공가 (분 단위 입력)</p>

            <label className="mt-4 block">
              <span className="mb-1.5 ml-1 block text-xs font-bold text-slate-400">공가시간(분)</span>
              <input
                type="number"
                min={0}
                max={480}
                step={1}
                inputMode="numeric"
                pattern="[0-9]*"
                value={officialLeaveDraft}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) =>
                  setOfficialLeaveDraft(
                    clampOfficialLeaveMinutes(Number(event.target.value || 0)),
                  )
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right text-xl font-extrabold text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={handleCancelOfficialDialog}
                className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-200"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveOfficialDialog}
                className="flex-[1.4] rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
