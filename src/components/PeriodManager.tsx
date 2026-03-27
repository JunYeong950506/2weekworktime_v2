import { FormEvent, useEffect, useMemo, useState } from 'react';
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
  const [labelInput, setLabelInput] = useState(defaultCreateLabel);
  const [startDateInput, setStartDateInput] = useState(selectedStartDate);
  const [copyValues, setCopyValues] = useState(false);

  const periodRangeLabel = useMemo(() => {
    if (!selectedStartDate) {
      return '-';
    }

    const start = dayjs(selectedStartDate);
    const end = start.add(13, 'day');
    return `${start.format('YYYY년 MM월 DD일')} ~ ${end.format('MM월 DD일')}`;
  }, [selectedStartDate]);

  useEffect(() => {
    if (!isCreateOpen) {
      setLabelInput(defaultCreateLabel);
      setStartDateInput(selectedStartDate);
      setCopyValues(false);
    }
  }, [defaultCreateLabel, selectedStartDate, isCreateOpen]);

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

  return (
    <section className="surface-panel">
      <header className="flex flex-col gap-4 border-b border-slate-200/80 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-slate-900">
            2주 자율출퇴근 계산기 ⏱️
          </h1>
          <p className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-5 py-2 text-base font-extrabold text-slate-500 shadow-sm">
            <svg
              className="h-4 w-4 text-indigo-500"
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
            {periodRangeLabel}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor="period-selector">
              2주 단위 구간 선택
            </label>
            <select
              id="period-selector"
              value={selectedPeriodId ?? ''}
              onChange={(event) => onSelectPeriod(event.target.value)}
              className="field-select h-11 min-w-[220px]"
            >
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="period-start-date">
              2주 시작일
            </label>
            <input
              id="period-start-date"
              type="date"
              value={selectedStartDate}
              onChange={(event) => onChangeStartDate(event.target.value)}
              className="field-input h-11 min-w-[180px]"
            />
          </div>
        </div>

        <div className="flex flex-col items-start gap-2.5 md:items-end">
          <p className="text-xs font-medium text-slate-400">
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
              onClick={onDeleteCurrentPeriod}
              disabled={!canDeleteCurrentPeriod}
              className="btn-danger"
            >
              현재 구간 삭제
            </button>
            <button
              type="button"
              onClick={onResetAllData}
              disabled={!canResetAllData}
              className="btn-danger"
            >
              데이터 초기화
            </button>
            <div className="mx-1 h-4 w-px bg-slate-300" aria-hidden="true" />
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
