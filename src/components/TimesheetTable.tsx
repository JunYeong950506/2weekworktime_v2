import { useEffect, useMemo, useState } from 'react';

import { recalculateDayRecord } from '../utils/calculations';
import { AnnualLeaveType, DayRecord, DayRecordMeta } from '../types';
import {
  formatDateCell,
  formatMinutesAsClock,
  formatSignedMinutesAsClock,
  isToday,
} from '../utils/time';

interface TimesheetTableProps {
  records: DayRecord[];
  rowMeta: DayRecordMeta[];
  onPatchRecord: (
    index: number,
    patch: Partial<
      Pick<
        DayRecord,
        | 'isHoliday'
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
}

const ANNUAL_LEAVE_OPTIONS: Array<{ value: AnnualLeaveType; label: string }> = [
  { value: 'none', label: '정상근무' },
  { value: 'quarter', label: '반반차 (2시간)' },
  { value: 'half', label: '반차 (4시간)' },
  { value: 'full', label: '연차 (8시간)' },
  { value: 'official', label: '공가' },
];
const MOBILE_TIMESHEET_VIEW_KEY = 'worktime_mobile_timesheet_view';

function getDateToneClass(record: DayRecord, meta?: DayRecordMeta): string {
  if (record.isHoliday || meta?.isSunday) {
    return 'text-rose-600';
  }

  if (meta?.isSaturday) {
    return 'text-blue-600';
  }

  return 'text-slate-700';
}

function getWorkTypeLabel(record: DayRecord, meta?: DayRecordMeta): string {
  if (meta?.isSpecialWorkMode) {
    return '특근/휴일';
  }

  switch (record.annualLeaveType) {
    case 'quarter':
      return '반반차';
    case 'half':
      return '반차';
    case 'full':
      return '연차';
    case 'official':
      return '공가';
    default:
      return '정상근무';
  }
}

function getWorkTypeBadgeClass(record: DayRecord, meta?: DayRecordMeta): string {
  if (meta?.isSpecialWorkMode) {
    return 'border-transparent bg-[#FAEEDA] text-[#633806]';
  }

  switch (record.annualLeaveType) {
    case 'full':
      return 'border-transparent bg-[#E1F5EE] text-[#085041]';
    case 'quarter':
    case 'half':
      return 'border-transparent bg-[#EEEDFE] text-[#3C3489]';
    case 'official':
      return 'border-transparent bg-[#EAF3DE] text-[#27500A]';
    default:
      return 'border-transparent bg-[#E6F1FB] text-[#0C447C]';
  }
}

function formatClockRange(record: DayRecord, meta?: DayRecordMeta): string {
  if (meta?.isAnnualLeaveFullMode) {
    return '연차 사용';
  }

  if (meta?.isSpecialWorkMode) {
    return '특근/휴일';
  }

  const inValue = record.clockIn.trim() || '--:--';
  const outValue = record.clockOut.trim() || '--:--';

  return `${inValue} - ${outValue}`;
}

function hasPartialLeaveWarning(record: DayRecord): boolean {
  return (
    (record.annualLeaveType === 'quarter' || record.annualLeaveType === 'half') &&
    record.clockIn.trim() !== '' &&
    record.clockOut.trim() !== '' &&
    record.workMinutes !== null &&
    record.workMinutes < 4 * 60
  );
}

export default function TimesheetTable({
  records,
  rowMeta,
  onPatchRecord,
}: TimesheetTableProps): JSX.Element {
  const [mobileViewMode, setMobileViewMode] = useState<'card' | 'table'>(() => {
    if (typeof window === 'undefined') {
      return 'card';
    }

    return window.localStorage.getItem(MOBILE_TIMESHEET_VIEW_KEY) === 'table'
      ? 'table'
      : 'card';
  });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<DayRecord | null>(null);
  const [specialInfoOpenDate, setSpecialInfoOpenDate] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!draft) {
      return null;
    }

    return recalculateDayRecord(draft);
  }, [draft]);

  function openModal(index: number): void {
    const source = records[index];
    if (!source) {
      return;
    }

    setSpecialInfoOpenDate(null);
    setEditingIndex(index);
    setDraft({ ...source });
  }

  function closeModal(): void {
    setEditingIndex(null);
    setDraft(null);
  }

  function patchDraft(patch: Partial<DayRecord>): void {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function saveModal(): void {
    if (editingIndex === null || !draft) {
      return;
    }

    onPatchRecord(editingIndex, {
      isHoliday: draft.isHoliday,
      annualLeaveType: draft.annualLeaveType,
      officialLeaveMinutes: draft.officialLeaveMinutes,
      clockIn: draft.clockIn,
      clockOut: draft.clockOut,
      dinnerChecked: draft.dinnerChecked,
      nonWorkMinutes: draft.nonWorkMinutes,
      claimedOtMinutes: draft.claimedOtMinutes,
    });

    closeModal();
  }

  useEffect(() => {
    if (editingIndex === null) {
      return;
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        closeModal();
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [editingIndex]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(MOBILE_TIMESHEET_VIEW_KEY, mobileViewMode);
    setSpecialInfoOpenDate(null);
  }, [mobileViewMode]);

  const modalMeta = preview?.meta ?? null;
  const modalRecord = preview?.record ?? null;
  const modalSpecialMode = modalMeta?.isSpecialWorkMode ?? false;
  const modalAnnualLeaveValue: AnnualLeaveType = modalRecord
    ? modalSpecialMode
      ? 'none'
      : modalRecord.annualLeaveType
    : 'none';
  const modalFullLeave = modalMeta?.isAnnualLeaveFullMode ?? false;
  const disableTimeAndDeduction = modalSpecialMode || modalFullLeave;
  const showOfficialInput = modalAnnualLeaveValue === 'official' && !modalSpecialMode;
  const modalValidationErrors = modalMeta?.validationErrors ?? [];
  const modalPartialLeaveWarning =
    (modalAnnualLeaveValue === 'quarter' || modalAnnualLeaveValue === 'half') &&
    (modalRecord?.clockIn.trim() ?? '') !== '' &&
    (modalRecord?.clockOut.trim() ?? '') !== '' &&
    modalRecord?.workMinutes !== null &&
    (modalRecord?.workMinutes ?? 0) < 4 * 60
      ? '반차/반반차는 실제 근무시간 4시간 이상일 때만 사용할 수 있습니다.'
      : null;
  const modalGuideMessages = modalPartialLeaveWarning
    ? [...modalValidationErrors, modalPartialLeaveWarning]
    : modalValidationErrors;
  const hasModalErrors = modalGuideMessages.length > 0;
  const hasMissingTimeError = modalValidationErrors.some((message) =>
    message.includes('미입력'),
  );
  const hasClockInError =
    modalValidationErrors.some((message) => message.includes('출근시간')) ||
    (hasMissingTimeError && (modalRecord?.clockIn.trim() ?? '') === '');
  const hasClockOutError =
    modalValidationErrors.some((message) => message.includes('퇴근시간')) ||
    (hasMissingTimeError && (modalRecord?.clockOut.trim() ?? '') === '');

  return (
    <>
      <section className="surface-panel overflow-hidden px-0 py-0">
        <div className="border-b border-slate-100 px-8 py-6">
          <div className="flex items-start justify-between gap-4">
            <h3 className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-slate-800">
              <span className="icon-pill" aria-hidden="true">
                📅
              </span>
              최근 2주 근무기록
            </h3>

            <div className="shrink-0 rounded-2xl bg-slate-100 p-1 shadow-inner md:hidden">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="카드 보기"
                  aria-pressed={mobileViewMode === 'card'}
                  onClick={() => setMobileViewMode('card')}
                  className={`inline-flex h-[26px] w-[26px] items-center justify-center rounded-[10px] transition ${
                    mobileViewMode === 'card'
                      ? 'bg-white text-indigo-500 shadow-sm'
                      : 'text-slate-400'
                  }`}
                >
                  <svg
                    className="h-[13px] w-[13px]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <rect x="4" y="4" width="6" height="6" rx="1.2" fill="currentColor" stroke="none" />
                    <rect x="14" y="4" width="6" height="6" rx="1.2" fill="currentColor" stroke="none" />
                    <rect x="4" y="14" width="6" height="6" rx="1.2" fill="currentColor" stroke="none" />
                    <rect x="14" y="14" width="6" height="6" rx="1.2" fill="currentColor" stroke="none" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="테이블 보기"
                  aria-pressed={mobileViewMode === 'table'}
                  onClick={() => setMobileViewMode('table')}
                  className={`inline-flex h-[26px] w-[26px] items-center justify-center rounded-[10px] transition ${
                    mobileViewMode === 'table'
                      ? 'bg-white text-indigo-500 shadow-sm'
                      : 'text-slate-400'
                  }`}
                >
                  <svg
                    className="h-[13px] w-[13px]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 7h14M5 12h14M5 17h14"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="mt-2 text-xs text-slate-400 md:hidden">
            <p>계산은 분 단위라 HR과 오차가 있을 수 있습니다.</p>
          </div>

          <div className="mt-2 hidden text-xs text-slate-400 md:block md:text-right">
            <p>계산은 분 단위라 HR과 오차가 있을 수 있습니다.</p>
          </div>
        </div>

        <div className={`space-y-3 px-4 py-4 md:hidden ${mobileViewMode === 'card' ? '' : 'hidden'}`}>
          {records.map((record, index) => {
            const meta = rowMeta[index];
            const hasError =
              (meta?.validationErrors.length ?? 0) > 0 || hasPartialLeaveWarning(record);
            const dateToneClass = getDateToneClass(record, meta);
            const workType = getWorkTypeLabel(record, meta);
            const workLabel = formatMinutesAsClock(record.workMinutes);
            const claimedLabel = formatMinutesAsClock(record.claimedOtMinutes);
            const balanceLabel = formatSignedMinutesAsClock(record.earlyLeaveBalanceMinutes);
            const isCurrentRow = isToday(record.date);
            const isSpecialRow = meta?.isSpecialWorkMode ?? false;
            const isSpecialInfoOpen = specialInfoOpenDate === record.date;
            const workTypeBadgeClass = getWorkTypeBadgeClass(record, meta);
            const mobileCardClass = hasError
              ? isCurrentRow
                ? 'border-rose-200 bg-indigo-50/50 ring-1 ring-rose-100'
                : 'border-rose-200 bg-white ring-1 ring-rose-100'
              : isCurrentRow
                ? 'border-indigo-100 bg-indigo-50/50'
                : 'border-slate-200/80 bg-white';

            return (
              <div
                key={`mobile-${record.date}`}
                onClick={() => openModal(index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openModal(index);
                  }
                }}
                tabIndex={0}
                role="button"
                className={`rounded-[24px] border px-4 py-4 shadow-sm transition active:scale-[0.99] ${mobileCardClass}`}
              >
                <div className="grid grid-cols-[84px_minmax(0,1fr)_20px] items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`whitespace-nowrap text-[13px] font-extrabold ${dateToneClass}`}>
                        {formatDateCell(record.date)}
                      </p>
                      {hasError ? (
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-pink-400">
                          <svg
                            className="h-[18px] w-[18px]"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.8"
                              d="M12 4.75 20 19H4L12 4.75Z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.8"
                              d="M12 9v4m0 2.75h.01"
                            />
                          </svg>
                        </span>
                      ) : null}
                    </div>
                    <div className="relative mt-2">
                      {isSpecialRow ? (
                        <div className="inline-flex items-center gap-1.5">
                          <span
                            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm ${workTypeBadgeClass}`}
                          >
                            {workType}
                          </span>
                          <button
                            type="button"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSpecialInfoOpenDate((prev) =>
                                prev === record.date ? null : record.date,
                              );
                            }}
                            aria-label="특근 안내 보기"
                            aria-expanded={isSpecialInfoOpen}
                            className="inline-flex h-5 w-5 items-center justify-center text-sky-500 transition hover:text-sky-600"
                          >
                            <svg
                              className="h-[18px] w-[18px]"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <circle cx="12" cy="12" r="9" strokeWidth="1.8" />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="1.8"
                                d="M12 10v5m0-8h.01"
                              />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm ${workTypeBadgeClass}`}
                        >
                          {workType}
                        </span>
                      )}
                      {isSpecialRow ? (
                        <div
                          className={`pointer-events-none absolute left-0 top-full z-20 mt-2 w-[180px] max-w-[68vw] whitespace-normal rounded-lg border border-sky-100 bg-sky-50 px-2.5 py-2 text-[11px] font-medium leading-snug text-sky-700 shadow-md transition-opacity ${
                            isSpecialInfoOpen ? 'opacity-100' : 'opacity-0'
                          }`}
                        >
                          특근 시간을 야근결재에 입력하세요.
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid min-w-0 grid-cols-3 gap-2 text-center">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-slate-400">근무시간</p>
                      <p className="mt-1 truncate text-[15px] font-extrabold text-indigo-600">
                        {workLabel}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-slate-400">야근결재</p>
                      <p className="mt-1 truncate text-[15px] font-extrabold text-orange-500">
                        {claimedLabel}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-slate-400">조기/초과</p>
                      <p className="mt-1 truncate text-[15px] font-extrabold text-pink-500">
                        {balanceLabel}
                      </p>
                    </div>
                  </div>

                  <div className="pt-1 text-right text-slate-300">
                    <svg
                      className="inline h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div
          className={`overflow-x-auto overflow-y-hidden [overscroll-behavior-x:contain] ${
            mobileViewMode === 'table' ? 'block' : 'hidden'
          } md:block`}
        >
          <table className="w-full whitespace-nowrap text-left">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-[13px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-8 py-4">날짜</th>
                <th className="px-4 py-4">출근 - 퇴근</th>
                <th className="px-4 py-4 text-center">근무 형태</th>
                <th className="px-4 py-4 text-center">근무 시간</th>
                <th className="px-4 py-4 text-center">실제 야근결재</th>
                <th className="px-4 py-4 text-center">조기/초과</th>
                <th className="px-6 py-4 text-right" />
              </tr>
            </thead>

            <tbody className="text-sm">
              {records.map((record, index) => {
                const meta = rowMeta[index];
                const hasError =
                  (meta?.validationErrors.length ?? 0) > 0 || hasPartialLeaveWarning(record);
                const dateToneClass = getDateToneClass(record, meta);
                const workType = getWorkTypeLabel(record, meta);
                const clockRange = formatClockRange(record, meta);
                const workLabel = formatMinutesAsClock(record.workMinutes);
                const claimedLabel = formatMinutesAsClock(record.claimedOtMinutes);
                const balanceLabel = formatSignedMinutesAsClock(record.earlyLeaveBalanceMinutes);
                const isCurrentRow = isToday(record.date);
                const isSpecialRow = meta?.isSpecialWorkMode ?? false;
                const isSpecialInfoOpen = specialInfoOpenDate === record.date;
                const workTypeBadgeClass = getWorkTypeBadgeClass(record, meta);

                return (
                  <tr
                    key={record.date}
                    onClick={() => openModal(index)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openModal(index);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    className={`group cursor-pointer border-b border-slate-50 transition ${
                      isCurrentRow ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-8 py-5">
                      <div className={`text-base font-bold ${dateToneClass}`}>
                        {formatDateCell(record.date)}
                      </div>
                      {hasError ? (
                        <p className="mt-1 text-xs text-rose-500">상세 메세지를 확인하세요.</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-5 text-base font-extrabold text-slate-700">{clockRange}</td>
                    <td className="px-4 py-5 text-center">
                      {isSpecialRow ? (
                        <div className="relative inline-flex">
                          <button
                            type="button"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (
                                typeof window !== 'undefined' &&
                                !window.matchMedia('(hover: none), (pointer: coarse)').matches
                              ) {
                                return;
                              }
                              setSpecialInfoOpenDate((prev) =>
                                prev === record.date ? null : record.date,
                              );
                            }}
                            onKeyDown={(event) => event.stopPropagation()}
                            aria-label="특근 안내 보기"
                            aria-expanded={isSpecialInfoOpen}
                            className={`peer rounded-lg border px-3 py-1 text-xs font-bold transition hover:opacity-90 ${workTypeBadgeClass}`}
                          >
                            {workType}
                          </button>
                          <div
                            className={`pointer-events-none absolute left-1/2 top-full z-20 mt-1 w-[180px] max-w-[80vw] -translate-x-1/2 whitespace-normal rounded-lg border border-sky-100 bg-sky-50 px-2 py-1 text-[11px] font-medium leading-snug text-sky-700 shadow-md transition-opacity ${
                              isSpecialInfoOpen
                                ? 'opacity-100'
                                : 'opacity-0 md:peer-hover:opacity-100 md:peer-focus-visible:opacity-100'
                            }`}
                          >
                            특근 시간을 야근결재에 입력하세요.
                          </div>
                        </div>
                      ) : (
                        <span className={`rounded-lg border px-3 py-1 text-xs font-bold ${workTypeBadgeClass}`}>
                          {workType}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-5 text-center text-base font-bold text-indigo-600">
                      {workLabel}
                    </td>
                    <td className="px-4 py-5 text-center text-base font-bold text-orange-500">
                      {claimedLabel}
                    </td>
                    <td className="px-4 py-5 text-center text-base font-bold text-pink-500">
                      {balanceLabel}
                    </td>
                    <td className="px-6 py-5 text-right text-slate-300 transition group-hover:text-indigo-500">
                      <span className="mr-1 text-xs font-bold opacity-0 transition group-hover:opacity-100">
                        수정
                      </span>
                      <svg
                        className="inline h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.5"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editingIndex !== null && draft && modalRecord ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-2 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="relative my-2 flex w-full max-w-md flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl sm:my-0 sm:rounded-[32px]">
            <div className="flex items-center justify-between border-b border-slate-100/80 px-5 pb-4 pt-5 sm:px-8 sm:pb-5 sm:pt-8">
              <div>
                <h3 className="text-2xl font-extrabold tracking-tight text-slate-900">
                  {formatDateCell(modalRecord.date)}
                </h3>
                <p className="mt-1 text-sm font-bold text-slate-400">상세 근무 기록 수정 후 저장하기</p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                aria-label="팝업 닫기"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6 overflow-x-hidden px-5 py-4 sm:p-8 sm:pt-5">
              {hasModalErrors ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-rose-700">
                  <p className="mb-1.5 flex items-center gap-2 text-sm font-bold">
                    <span aria-hidden="true">⚠️</span>
                    확인이 필요한 항목 ({modalGuideMessages.length}건)
                  </p>
                  <ul className="list-disc space-y-0.5 pl-5 text-xs leading-5 sm:text-[13px]">
                    {modalGuideMessages.map((message, idx) => (
                      <li key={`modal-error-guide-${idx}`}>{message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {modalSpecialMode ? (
                <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3.5 text-sky-800">
                  <p className="text-sm font-extrabold">특근/휴일 근무 입력 안내</p>
                  <p className="mt-2 text-xs font-medium leading-5 text-sky-700 sm:text-[13px]">
                    특근/휴일은 출퇴근 시간을 입력하지 않습니다.
                    <br />
                    실제 근무한 시간은 실제 야근결재(분)에 입력해 주세요.
                  </p>
                </div>
              ) : (
                <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:gap-4">
                  <div className="min-w-0 w-full flex-1 overflow-hidden">
                    <div className="mb-1.5 ml-1 flex flex-wrap items-center justify-between gap-2">
                      <label
                        className={`block min-w-0 text-xs font-bold ${
                          hasClockInError ? 'text-rose-500' : 'text-slate-400'
                        }`}
                      >
                        출근 시간
                      </label>
                      <button
                        type="button"
                        onClick={() => patchDraft({ clockIn: '' })}
                        disabled={disableTimeAndDeduction || modalRecord.clockIn.length === 0}
                        className="shrink-0 text-[11px] font-bold text-slate-400 transition hover:text-rose-500 disabled:cursor-not-allowed disabled:text-slate-300"
                      >
                        초기화
                      </button>
                    </div>
                    <input
                      type="time"
                      step={60}
                      min="06:00"
                      max="23:59"
                      inputMode="numeric"
                      pattern="[0-9:]*"
                      value={disableTimeAndDeduction ? '' : modalRecord.clockIn}
                      disabled={disableTimeAndDeduction}
                      onChange={(event) => patchDraft({ clockIn: event.target.value })}
                      className={`h-14 w-full min-w-0 max-w-full appearance-none rounded-2xl border px-4 text-lg font-extrabold text-slate-800 outline-none transition focus:bg-white focus:ring-2 disabled:cursor-not-allowed disabled:text-slate-300 sm:text-xl ${
                        hasClockInError
                          ? 'border-rose-300 bg-white focus:border-rose-500 focus:ring-rose-100'
                          : 'border-slate-200 bg-slate-50 focus:border-indigo-500 focus:ring-indigo-100'
                      }`}
                    />
                  </div>
                  <div className="hidden text-xl font-bold text-slate-300 md:mt-5 md:block">→</div>
                  <div className="min-w-0 w-full flex-1 overflow-hidden">
                    <div className="mb-1.5 ml-1 flex flex-wrap items-center justify-between gap-2">
                      <label
                        className={`block min-w-0 text-xs font-bold ${
                          hasClockOutError ? 'text-rose-500' : 'text-slate-400'
                        }`}
                      >
                        퇴근 시간
                      </label>
                      <button
                        type="button"
                        onClick={() => patchDraft({ clockOut: '' })}
                        disabled={disableTimeAndDeduction || modalRecord.clockOut.length === 0}
                        className="shrink-0 text-[11px] font-bold text-slate-400 transition hover:text-rose-500 disabled:cursor-not-allowed disabled:text-slate-300"
                      >
                        초기화
                      </button>
                    </div>
                    <input
                      type="time"
                      step={60}
                      min="00:00"
                      max="23:59"
                      inputMode="numeric"
                      pattern="[0-9:]*"
                      value={disableTimeAndDeduction ? '' : modalRecord.clockOut}
                      disabled={disableTimeAndDeduction}
                      onChange={(event) => patchDraft({ clockOut: event.target.value })}
                      className={`h-14 w-full min-w-0 max-w-full appearance-none rounded-2xl border px-4 text-lg font-extrabold text-slate-800 outline-none transition focus:bg-white focus:ring-2 disabled:cursor-not-allowed disabled:text-slate-300 sm:text-xl ${
                        hasClockOutError
                          ? 'border-rose-300 bg-white focus:border-rose-500 focus:ring-rose-100'
                          : 'border-slate-200 bg-slate-50 focus:border-indigo-500 focus:ring-indigo-100'
                      }`}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-5 rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <div className="min-w-0">
                  <label className="mb-2 ml-1 block text-xs font-bold text-slate-400">연차 사용</label>
                  <select
                    value={modalAnnualLeaveValue}
                    disabled={modalSpecialMode}
                    onChange={(event) =>
                      patchDraft({ annualLeaveType: event.target.value as AnnualLeaveType })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {ANNUAL_LEAVE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0 flex flex-col justify-center">
                  <label className="mb-2 ml-1 block text-xs font-bold text-slate-400">석식 여부</label>
                  <label
                    className={`ml-1 inline-flex h-11 items-center justify-between rounded-xl border px-3 text-sm font-bold ${
                      modalRecord.dinnerChecked
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    } ${disableTimeAndDeduction ? 'opacity-60' : ''}`}
                  >
                    {modalRecord.dinnerChecked ? '석식 먹음' : '석식 없음'}
                    <input
                      type="checkbox"
                      checked={modalRecord.dinnerChecked}
                      disabled={disableTimeAndDeduction}
                      onChange={(event) => patchDraft({ dinnerChecked: event.target.checked })}
                      className="field-check"
                    />
                  </label>
                </div>

                <div className="col-span-2 flex items-center gap-2">
                  <input
                    id="holiday-checkbox-modal"
                    type="checkbox"
                    checked={modalRecord.isHoliday}
                    onChange={(event) => patchDraft({ isHoliday: event.target.checked })}
                    className="field-check"
                  />
                  <label
                    htmlFor="holiday-checkbox-modal"
                    className="text-xs font-bold text-slate-500"
                  >
                    공휴일로 처리
                  </label>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="min-w-0 flex-1">
                  <label className="mb-1.5 ml-1 block text-xs font-bold text-slate-400">
                    비업무 시간 (분)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={disableTimeAndDeduction ? 0 : modalRecord.nonWorkMinutes}
                    disabled={disableTimeAndDeduction}
                    onFocus={(event) => {
                      if (modalRecord.nonWorkMinutes === 0) {
                        event.currentTarget.select();
                      }
                    }}
                    onChange={(event) =>
                      patchDraft({ nonWorkMinutes: Number(event.target.value || 0) })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-right text-lg font-bold text-slate-700 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <label className="mb-1.5 ml-1 block text-xs font-bold text-indigo-500">
                    실제 야근결재(분)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={modalFullLeave ? 0 : modalRecord.claimedOtMinutes}
                    disabled={modalFullLeave}
                    onFocus={(event) => {
                      if (modalRecord.claimedOtMinutes === 0) {
                        event.currentTarget.select();
                      }
                    }}
                    onChange={(event) =>
                      patchDraft({ claimedOtMinutes: Number(event.target.value || 0) })
                    }
                    className="w-full rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-right text-lg font-bold text-indigo-700 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300"
                  />
                </div>
              </div>

              {showOfficialInput ? (
                <div>
                  <label className="mb-1.5 ml-1 block text-xs font-bold text-slate-400">
                    공가 시간 (분)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={480}
                    step={1}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={modalRecord.officialLeaveMinutes}
                    onChange={(event) =>
                      patchDraft({
                        officialLeaveMinutes: Math.min(
                          480,
                          Math.max(0, Number(event.target.value || 0)),
                        ),
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-right text-lg font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              ) : null}

              <div className="flex items-center justify-between rounded-2xl bg-slate-800 p-5 text-white shadow-lg">
                <span className="text-sm font-bold text-slate-300">최종 근무시간</span>
                <span className="text-3xl font-extrabold tracking-tight">
                  {formatMinutesAsClock(modalRecord.workMinutes)}
                </span>
              </div>

              <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="w-full rounded-2xl bg-slate-100 py-4 font-bold text-slate-600 transition hover:bg-slate-200 sm:flex-1"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={saveModal}
                  className="w-full rounded-2xl bg-indigo-600 py-4 text-lg font-bold text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-700 sm:flex-[2]"
                >
                  기록 저장하기
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
