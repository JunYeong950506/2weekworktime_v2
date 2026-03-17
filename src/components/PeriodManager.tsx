import { FormEvent, useEffect, useState } from 'react';

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
    <section className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-soft">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            2주 단위 구간 선택
            <select
              value={selectedPeriodId ?? ''}
              onChange={(event) => onSelectPeriod(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            2주 시작일
            <input
              type="date"
              value={selectedStartDate}
              onChange={(event) => onChangeStartDate(event.target.value)}
              className="rounded-lg border border-slate-300 bg-sky-50 px-3 py-2"
            />
          </label>

          <div>
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen((prev) => !prev)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                새 2주 구간 생성
              </button>
              <button
                type="button"
                onClick={onSave}
                className="min-w-[220px] rounded-lg bg-emerald-600 px-6 py-2.5 text-base font-semibold text-white hover:bg-emerald-500"
              >
                저장
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              데이터는 브라우저 로컬 캐시로 저장됩니다.
              <br />
              새로운 2주 구간을 생성한 경우 저장 버튼을 눌러주세요.
            </p>
          </div>
        </div>

        <div className="text-right text-xs text-slate-500">
          <p>{isDirty ? '저장되지 않은 변경사항 있음' : '저장 상태 최신'}</p>
          <p>마지막 저장: {formatSavedAt(lastSavedAt)}</p>
        </div>
      </div>

      {isCreateOpen ? (
        <form
          onSubmit={submitCreate}
          className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-4"
        >
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 md:col-span-2">
            구간 이름
            <input
              value={labelInput}
              onChange={(event) => setLabelInput(event.target.value)}
              placeholder={defaultCreateLabel}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            시작일
            <input
              type="date"
              value={startDateInput}
              onChange={(event) => setStartDateInput(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2"
              required
            />
          </label>

          <label className="flex items-center gap-2 self-end text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={copyValues}
              onChange={(event) => setCopyValues(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            현재 구간 값 복사
          </label>

          <div className="md:col-span-4 flex items-center gap-2">
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              생성
            </button>
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            >
              취소
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/70 p-3">
        <p className="text-xs font-semibold tracking-wide text-rose-700">데이터 관리</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onDeleteCurrentPeriod}
            disabled={!canDeleteCurrentPeriod}
            className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            현재 구간 삭제
          </button>
          <button
            type="button"
            onClick={onResetAllData}
            disabled={!canResetAllData}
            className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            전체 데이터 초기화
          </button>
        </div>
      </div>
    </section>
  );
}
