import dayjs from 'dayjs';

import { AnnualLeaveType, DayRecord, TimeField } from '../types';
import { formatMinutesAsClock } from '../utils/time';

interface TodayQuickEntryCardProps {
  targetLabel: string;
  isTodayTarget: boolean;
  record: DayRecord | null;
  onPatchRecord: (
    patch: Partial<
      Pick<
        DayRecord,
        | 'annualLeaveType'
        | 'clockIn'
        | 'clockOut'
        | 'dinnerChecked'
        | 'nonWorkMinutes'
        | 'claimedOtMinutes'
      >
    >,
  ) => void;
  onSetNow: (field: TimeField) => void;
}

const ANNUAL_LEAVE_OPTIONS: Array<{ value: AnnualLeaveType; label: string }> = [
  { value: 'none', label: '없음' },
  { value: 'quarter', label: '반반차 (2시간)' },
  { value: 'half', label: '반차 (4시간)' },
  { value: 'full', label: '연차 (8시간)' },
];

function ClockIcon({ className }: { className?: string }): JSX.Element {
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
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </svg>
  );
}
function TimeInputWithButton({
  label,
  value,
  min,
  max,
  buttonLabel,
  disabled,
  onChange,
  onButtonClick,
}: {
  label: string;
  value: string;
  min: string;
  max: string;
  buttonLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onButtonClick: () => void;
}): JSX.Element {
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <div className="grid grid-cols-[70%_auto] gap-2">
        <input
          type="time"
          step={60}
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          title="HH:mm (24시간 형식)"
          className="h-11 w-auto rounded-xl border border-slate-300 bg-slate-50 px-3 text-base text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        />
        <button
          type="button"
          onClick={onButtonClick}
          disabled={disabled}
          className="h-11 min-w-[72px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

function ResultChip({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: 'blue' | 'amber';
}): JSX.Element {
  const toneClass =
    tone === 'blue'
      ? 'border-blue-100 bg-blue-50 text-blue-900'
      : 'border-amber-100 bg-amber-50 text-amber-900';

  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <p className="text-xs font-semibold text-slate-600">{title}</p>
      <p className="mt-1 text-xl font-bold leading-none">{value}</p>
    </div>
  );
}

function isPartialLeave(type: AnnualLeaveType): boolean {
  return type === 'quarter' || type === 'half';
}

export default function TodayQuickEntryCard({
  targetLabel,
  isTodayTarget,
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
  const disableTimeAndDeductionInputs = isSpecialWorkMode || isAnnualLeaveFullMode;

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

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-slate-900">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-indigo-100 text-indigo-600">
              <ClockIcon className="h-4 w-4" />
            </span>
            <h2 className="text-xl font-bold sm:text-2xl">오늘 근무 입력</h2>
          </div>

          <span className="inline-flex rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600">
            오늘 날짜: {targetLabel}
          </span>
        </div>

        {!isTodayTarget ? (
          <p className="mt-2 text-xs text-slate-500">
            오늘 날짜가 현재 구간에 없어 가장 가까운 날짜와 연결했습니다.
          </p>
        ) : null}

        {record && isAnnualLeaveFullMode ? (
          <p className="mt-2 text-xs text-slate-500">
            연차 사용일은 출퇴근 입력이 필요 없습니다.
          </p>
        ) : null}

        {record && showPartialLeaveNotice ? (
          <p className="mt-2 text-xs text-amber-600">
            반차/반반차는 실제 근무시간 4시간 이상일 때 인정됩니다.
          </p>
        ) : null}

        {record && showPartialLeaveWarning ? (
          <p className="mt-2 text-xs text-rose-600">
            반차/반반차는 실제 근무시간 4시간 이상일 때만 사용할 수 있습니다.
          </p>
        ) : null}
      </header>

      {!record ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          편집 가능한 행이 없습니다.
        </p>
      ) : (
        <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <TimeInputWithButton
              label="출근시간"
              value={disableTimeAndDeductionInputs ? '' : record.clockIn}
              min="06:00"
              max="23:59"
              buttonLabel="출근"
              disabled={disableTimeAndDeductionInputs}
              onChange={(value) => onPatchRecord({ clockIn: value })}
              onButtonClick={() => onSetNow('clockIn')}
            />

            <TimeInputWithButton
              label="퇴근시간"
              value={disableTimeAndDeductionInputs ? '' : record.clockOut}
              min="00:00"
              max="23:59"
              buttonLabel="퇴근"
              disabled={disableTimeAndDeductionInputs}
              onChange={(value) => onPatchRecord({ clockOut: value })}
              onButtonClick={() => onSetNow('clockOut')}
            />
          </div>

          <div className="flex flex-wrap gap-2.5">
            <div className="min-w-[280px] flex-1">
              <div className="grid grid-cols-2 gap-2.5 items-end">
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-600">연차</span>
                  <select
                    value={annualLeaveValue}
                    disabled={isSpecialWorkMode}
                    onChange={(event) =>
                      onPatchRecord({
                        annualLeaveType: event.target.value as AnnualLeaveType,
                      })
                    }
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {ANNUAL_LEAVE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-600">석식 여부</span>
                  <span
                    className={`inline-flex h-11 w-full items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors ${
                      record.dinnerChecked
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                        : 'border-slate-300 bg-white text-slate-700'
                    } ${disableTimeAndDeductionInputs ? 'opacity-60' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={record.dinnerChecked}
                      disabled={disableTimeAndDeductionInputs}
                      onChange={(event) => onPatchRecord({ dinnerChecked: event.target.checked })}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    석식
                  </span>
                </label>
              </div>
            </div>

            <div className="min-w-[280px] flex-1">
              <div className="grid grid-cols-2 gap-2.5 items-end">
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-600">비업무시간(분)</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={disableTimeAndDeductionInputs ? 0 : record.nonWorkMinutes}
                    disabled={disableTimeAndDeductionInputs}
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
                    className="h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-right text-base disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-600">실제 야근결재(분)</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
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
                    className="h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-right text-base disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </label>
              </div>
            </div>

            <div className="min-w-[280px] flex-1">
              <div className="grid grid-cols-2 gap-2.5 items-end">
                <ResultChip
                  title="오늘 근무시간"
                  value={formatMinutesAsClock(record.workMinutes)}
                  tone="blue"
                />

                <ResultChip
                  title="권장 야근결재"
                  value={formatMinutesAsClock(record.recommendedOtMinutes)}
                  tone="amber"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
