import { useEffect, useState } from 'react';
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
        | 'officialLeaveMinutes'
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

function isPartialLeave(type: AnnualLeaveType): boolean {
  return type === 'quarter' || type === 'half';
}

function clampOfficialLeaveMinutes(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(480, Math.max(0, Math.round(value)));
}

function TimePanel({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
  onSetNow,
}: {
  label: string;
  value: string;
  min: string;
  max: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSetNow: () => void;
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 transition-all focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="ml-1 text-xs font-bold text-slate-400">{label}</p>
        <button
          type="button"
          onClick={onSetNow}
          disabled={disabled}
          className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          현재
        </button>
      </div>
      <input
        type="time"
        step={60}
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        title="HH:mm (24시간 형식)"
        className="w-full bg-transparent text-2xl font-extrabold text-slate-800 outline-none disabled:cursor-not-allowed disabled:text-slate-300"
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
  tone: 'indigo' | 'slate';
}): JSX.Element {
  const className =
    tone === 'indigo'
      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
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

  return (
    <>
      <section className="surface-panel">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <span className="icon-pill" aria-hidden="true">
              ⚡
            </span>
            오늘 근무 입력
          </h2>
          <span className="status-chip">오늘 날짜: {targetLabel}</span>
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
                />
              </div>

              <ResultTile
                title="오늘 총 근무시간"
                value={formatMinutesAsClock(record.workMinutes)}
                tone="indigo"
              />

              <ResultTile
                title="권장 야근결재"
                value={formatMinutesAsClock(record.recommendedOtMinutes)}
                tone="slate"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <label className="field-label">
                근무 형태
                <select
                  value={annualLeaveValue}
                  disabled={isSpecialWorkMode}
                  onChange={(event) =>
                    handleWorkTypeChange(event.target.value as AnnualLeaveType)
                  }
                  className="field-select disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="none">정상근무</option>
                  <option value="quarter">반반차 (2시간)</option>
                  <option value="half">반차 (4시간)</option>
                  <option value="full">연차 (8시간)</option>
                  <option value="official">공가</option>
                </select>
                {isOfficialLeaveMode && !isSpecialWorkMode ? (
                  <button
                    type="button"
                    onClick={() => openOfficialDialog('official')}
                    className="mt-1 inline-flex w-fit rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-600 transition-colors hover:bg-indigo-100"
                  >
                    공가 {record.officialLeaveMinutes}분 수정
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

              <label className="field-label">
                비업무시간(분)
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
                  className="field-input h-11 w-full text-right disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300"
                />
              </label>

              <label className="field-label">
                실제 야근(분)
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
                  className="field-input h-11 w-full text-right text-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300"
                />
              </label>
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
