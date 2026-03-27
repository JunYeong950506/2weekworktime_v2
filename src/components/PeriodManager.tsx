import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';

import { CreatePeriodPayload, Period } from '../types';
import { formatSavedAt } from '../utils/time';

interface PeriodManagerProps {
  periods: Period[];
  selectedPeriodId: string | null;
  selectedStartDate: string;
  defaultCreateLabel: string;
  isDirty: boolean;
  lastSavedAt: string | null;
  canDeleteCurrentPeriod: boolean;
  canResetAllData: boolean;
  onSelectPeriod: (id: string) => void;
  onChangeStartDate: (startDate: string) => void;
  onCreatePeriod: (payload: CreatePeriodPayload) => void;
  onSave: () => void;
  onDeleteCurrentPeriod: () => void;
  onResetAllData: () => void;
}

export default function PeriodManager({
  periods,
  selectedPeriodId,
  selectedStartDate,
  defaultCreateLabel,
  isDirty,
  lastSavedAt,
  canDeleteCurrentPeriod,
  canResetAllData,
  onSelectPeriod,
  onChangeStartDate,
  onCreatePeriod,
  onSave,
  onDeleteCurrentPeriod,
  onResetAllData,
}: PeriodManagerProps): JSX.Element {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDangerMenuOpen, setIsDangerMenuOpen] = useState(false);
  const [labelInput, setLabelInput] = useState(defaultCreateLabel);
  const [startDateInput, setStartDateInput] = useState(selectedStartDate);
  const [copyValues, setCopyValues] = useState(false);
  const startDateInputRef = useRef<HTMLInputElement | null>(null);
  const dangerMenuRef = useRef<HTMLDivElement | null>(null);

  const periodRangeLabel = useMemo(() => {
    if (!selectedStartDate) {
      return '-';
    }

    const start = dayjs(selectedStartDate);
    const end = start.add(13, 'day');
    return `${start.format('MM월 DD일')} ~ ${end.format('MM월 DD일')}`;
  }, [selectedStartDate]);

  useEffect(() => {
    if (!isCreateOpen) {
      setLabelInput(defaultCreateLabel);
      setStartDateInput(selectedStartDate);
      setCopyValues(false);
    }
  }, [defaultCreateLabel, selectedStartDate, isCreateOpen]);

  useEffect(() => {
    if (!isDangerMenuOpen) {
      return;
    }

    function handleWindowClick(event: MouseEvent): void {
      if (!dangerMenuRef.current) {
        return;
      }

      if (!dangerMenuRef.current.contains(event.target as Node)) {
        setIsDangerMenuOpen(false);
      }
    }

    function handleWindowKeydown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setIsDangerMenuOpen(false);
      }
    }

    window.addEventListener('mousedown', handleWindowClick);
    window.addEventListener('keydown', handleWindowKeydown);

    return () => {
      window.removeEventListener('mousedown', handleWindowClick);
      window.removeEventListener('keydown', handleWindowKeydown);
    };
  }, [isDangerMenuOpen]);

  function submitCreate(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!startDateInput) {
      return;
    }

    onCreatePeriod({
      label: labelInput.trim() || defaultCreateLabel,
      startDate: startDateInput,
      copyValues,
    });

    setIsCreateOpen(false);
  }

  function openStartDatePicker(): void {
    const input = startDateInputRef.current;
    if (!input) {
      return;
    }

    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
        return;
      }
    } catch {
      // Fallback to focus/click when showPicker is blocked or unsupported.
    }

    input.focus();
    input.click();
  }

  return (
    <section className="surface-panel">
      <header className="flex flex-col gap-4 border-b border-slate-200/80 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-slate-900">
            2주 자율출퇴근 계산기 ⏱️
          </h1>
          <div className="mb-3 flex min-w-0 items-center gap-3 max-[520px]:flex-col max-[520px]:items-stretch">
            <div className="relative min-w-0 flex-1">
              <button
                type="button"
                onClick={openStartDatePicker}
                className="inline-flex w-full min-w-0 items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 text-sm font-bold text-slate-500 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50/40 max-[520px]:pointer-events-none"
                aria-label="2주 시작일 선택"
              >
                <svg
                  className="h-4 w-4 shrink-0 text-indigo-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M8 7V4m8 3V4M6 11h12M7 5h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2z"
                  />
                </svg>
                <span className="truncate">{periodRangeLabel}</span>
              </button>
              <input
                type="date"
                value={selectedStartDate}
                onChange={(event) => onChangeStartDate(event.target.value)}
                className="absolute inset-0 z-10 hidden cursor-pointer opacity-0 max-[520px]:block"
                aria-label="2주 시작일 선택"
              />
              <input
                ref={startDateInputRef}
                id="period-start-date"
                type="date"
                value={selectedStartDate}
                onChange={(event) => onChangeStartDate(event.target.value)}
                className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0 max-[520px]:hidden"
                tabIndex={-1}
                aria-hidden="true"
              />
            </div>

            <div className="w-40 shrink-0 sm:w-56 max-[520px]:w-full">
              <label className="sr-only" htmlFor="period-selector">
                2주 단위 구간 선택
              </label>
              <select
                id="period-selector"
                value={selectedPeriodId ?? ''}
                onChange={(event) => onSelectPeriod(event.target.value)}
                className="field-select h-11 w-full min-w-0"
              >
                {periods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-start gap-2.5 md:items-end">
          <p className="text-xs text-slate-400">
            마지막 저장: {formatSavedAt(lastSavedAt)}
          </p>
          <p
            className={`inline-flex items-center rounded-xl px-3 py-1 text-xs font-semibold ${
              isDirty ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {isDirty ? '저장되지 않은 변경사항 있음' : '저장 상태 최신'}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsCreateOpen((prev) => !prev)}
              className="btn-secondary"
            >
              새 구간 생성
            </button>
            <button type="button" onClick={onSave} className="btn-primary">
              전체 저장
            </button>
            <div ref={dangerMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsDangerMenuOpen((prev) => !prev)}
                aria-expanded={isDangerMenuOpen}
                aria-label="위험 작업 더보기"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="M12 5h.01M12 12h.01M12 19h.01" />
                </svg>
              </button>

              {isDangerMenuOpen ? (
                <div className="absolute right-0 z-30 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDangerMenuOpen(false);
                      onDeleteCurrentPeriod();
                    }}
                    disabled={!canDeleteCurrentPeriod}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-rose-500 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    현재 구간 삭제
                  </button>
                  <div className="my-1 h-px bg-slate-100" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => {
                      setIsDangerMenuOpen(false);
                      onResetAllData();
                    }}
                    disabled={!canResetAllData}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    데이터 초기화
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {isCreateOpen ? (
        <form
          onSubmit={submitCreate}
          className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 md:grid-cols-4"
        >
          <label className="field-label md:col-span-2">
            구간 이름
            <input
              value={labelInput}
              onChange={(event) => setLabelInput(event.target.value)}
              placeholder={defaultCreateLabel}
              className="field-input"
            />
          </label>

          <label className="field-label">
            시작일
            <input
              type="date"
              value={startDateInput}
              onChange={(event) => setStartDateInput(event.target.value)}
              className="field-input"
              required
            />
          </label>

          <label className="flex items-center gap-2 self-end rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-600">
            <input
              type="checkbox"
              checked={copyValues}
              onChange={(event) => setCopyValues(event.target.checked)}
              className="field-check"
            />
            현재 구간 값 복사
          </label>

          <div className="md:col-span-4 mt-1 flex items-center gap-2">
            <button type="submit" className="btn-primary">
              생성
            </button>
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="btn-quiet"
            >
              취소
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
