import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';

import { Period } from '../types';
import { formatMinutesAsClock } from '../utils/time';
import {
  buildOvertimeAllowanceEstimates,
  loadOrdinaryHourlyWage,
  saveOrdinaryHourlyWage,
} from '../utils/overtimeAllowance';

interface OvertimeAllowanceDialogProps {
  open: boolean;
  periods: Period[];
  onClose: () => void;
}

function formatWon(value: number): string {
  return `${Math.max(0, Math.round(value)).toLocaleString('ko-KR')}원`;
}

function formatMonthLabel(month: string): string {
  return dayjs(`${month}-01`).format('M월');
}

function MoneyIcon({ className = 'h-6 w-6' }: { className?: string }): JSX.Element {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        d="M4 7.5h16v9H4zM7 10.5h.01M17 13.5h.01M12 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"
      />
    </svg>
  );
}

export default function OvertimeAllowanceDialog({
  open,
  periods,
  onClose,
}: OvertimeAllowanceDialogProps): JSX.Element | null {
  const [ordinaryHourlyWage, setOrdinaryHourlyWage] = useState(loadOrdinaryHourlyWage);
  const estimates = useMemo(
    () => buildOvertimeAllowanceEstimates(periods, ordinaryHourlyWage),
    [ordinaryHourlyWage, periods],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  function handleWageChange(rawValue: string): void {
    const normalized = saveOrdinaryHourlyWage(Number(rawValue.replace(/\D/g, '').slice(0, 7)));
    setOrdinaryHourlyWage(normalized);
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="overtime-allowance-title"
        className="w-full max-w-lg rounded-[28px] bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <MoneyIcon />
            </span>
            <div>
              <h3 id="overtime-allowance-title" className="text-xl font-extrabold tracking-tight text-slate-900">
                예상 잔업수당
              </h3>
              <p className="mt-0.5 text-xs font-semibold text-slate-400">전체 저장 데이터 기준 · 세전/간이 세후</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="예상 잔업수당 팝업 닫기"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <label className="mt-5 block">
          <span className="mb-1.5 ml-1 flex items-center justify-between gap-2 text-xs font-bold text-slate-400">
            <span>통상시급</span>
            <span className="font-semibold text-slate-300">이 기기에만 저장</span>
          </span>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoFocus
              value={ordinaryHourlyWage > 0 ? ordinaryHourlyWage.toLocaleString('ko-KR') : ''}
              placeholder="예: 10,320"
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => handleWageChange(event.target.value)}
              className="w-full rounded-2xl border border-emerald-200 bg-emerald-50/40 py-3 pl-4 pr-12 text-right text-xl font-extrabold text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
            />
            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-bold text-slate-400">원</span>
          </div>
        </label>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {estimates.map((estimate, index) => {
            const isInProgress = index === 1;
            const hasWage = ordinaryHourlyWage > 0;

            return (
              <div
                key={estimate.payMonth}
                className={`rounded-2xl border p-4 ${
                  isInProgress
                    ? 'border-amber-200 bg-amber-50/70'
                    : 'border-indigo-100 bg-indigo-50/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-xs font-extrabold ${isInProgress ? 'text-amber-700' : 'text-indigo-600'}`}>
                    {formatMonthLabel(estimate.payMonth)} 지급 예상
                  </p>
                  {isInProgress ? (
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-extrabold text-amber-700 shadow-sm">
                      진행 중
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">
                  {hasWage ? formatWon(estimate.estimatedPay) : '-'}
                </p>
                <p className="mt-2 text-sm font-extrabold text-emerald-700">
                  세금 반영 후 약 {hasWage ? formatWon(estimate.estimatedAfterTaxPay) : '-'}
                </p>
                <p className="mt-1.5 text-xs font-semibold text-slate-500">
                  {formatMonthLabel(estimate.workMonth)} 근무 {formatMinutesAsClock(estimate.overtimeMinutes)} 기준
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
          세전은 실제 야근결재 시간 × 통상시급 × 1.5로 계산합니다. 세금 반영 후 금액은 월 통상임금(통상시급 × 216시간), 본인 1명·자녀 0명·100% 원천징수 기준의 소득세·지방소득세 증가분만 반영하며 4대보험은 제외합니다.
        </div>
      </div>
    </div>
  );
}
