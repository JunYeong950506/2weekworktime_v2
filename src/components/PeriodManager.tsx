import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';

import { CreatePeriodPayload, Period } from '../types';
import { formatSavedAt } from '../utils/time';
import { normalizeUserCode } from '../utils/userCode';

interface PeriodManagerProps {
  periods: Period[];
  selectedPeriodId: string | null;
  selectedStartDate: string;
  defaultCreateLabel: string;
  userCode: string;
  isDirty: boolean;
  lastSavedAt: string | null;
  canDeleteCurrentPeriod: boolean;
  canResetAllData: boolean;
  onSelectPeriod: (id: string) => void;
  onChangeStartDate: (startDate: string) => void;
  onCreatePeriod: (payload: CreatePeriodPayload) => void;
  onSave: () => void;
  onLoadUserCode: (code: string) => Promise<{ ok: boolean; message: string }>;
  onDeleteCurrentPeriod: () => void;
  onResetAllData: () => void;
}

export default function PeriodManager({
  periods,
  selectedPeriodId,
  selectedStartDate,
  defaultCreateLabel,
  userCode,
  isDirty,
  lastSavedAt,
  canDeleteCurrentPeriod,
  canResetAllData,
  onSelectPeriod,
  onChangeStartDate,
  onCreatePeriod,
  onSave,
  onLoadUserCode,
  onDeleteCurrentPeriod,
  onResetAllData,
}: PeriodManagerProps): JSX.Element {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDangerMenuOpen, setIsDangerMenuOpen] = useState(false);
  const [isCodeViewOpen, setIsCodeViewOpen] = useState(false);
  const [isCodeLoadOpen, setIsCodeLoadOpen] = useState(false);
  const [codeInputDraft, setCodeInputDraft] = useState('');
  const [codeFeedback, setCodeFeedback] = useState<string | null>(null);
  const [isCodeActionPending, setIsCodeActionPending] = useState(false);
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

  useEffect(() => {
    if (!isCodeViewOpen && !isCodeLoadOpen) {
      return;
    }

    function handleWindowKeydown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setIsCodeViewOpen(false);
        setIsCodeLoadOpen(false);
      }
    }

    window.addEventListener('keydown', handleWindowKeydown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeydown);
    };
  }, [isCodeViewOpen, isCodeLoadOpen]);

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

  async function handleCopyCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(userCode);
      setCodeFeedback('동기화 코드를 복사했습니다.');
    } catch {
      setCodeFeedback('복사에 실패했습니다. 코드를 직접 선택해 복사해주세요.');
    }
  }

  async function submitLoadCode(): Promise<void> {
    setIsCodeActionPending(true);
    setCodeFeedback(null);
    try {
      const result = await onLoadUserCode(codeInputDraft);
      setCodeFeedback(result.message);
      if (result.ok) {
        setIsCodeLoadOpen(false);
        setCodeInputDraft('');
      }
    } finally {
      setIsCodeActionPending(false);
    }
  }

  return (
    <section className="surface-panel relative z-20 overflow-visible">
      <header className="flex flex-col gap-4 pb-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-slate-900">
            2주 자율출퇴근 계산기 ⏱️
          </h1>
          <div className="mb-3 flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
            <div className="relative min-w-0 w-full flex-1">
              <button
                type="button"
                onClick={openStartDatePicker}
                className="pointer-events-none inline-flex w-full min-w-0 items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 text-sm font-bold text-slate-500 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50/40 md:pointer-events-auto"
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
                className="absolute inset-0 z-10 cursor-pointer opacity-0 md:hidden"
                aria-label="2주 시작일 선택"
              />
              <input
                ref={startDateInputRef}
                id="period-start-date"
                type="date"
                value={selectedStartDate}
                onChange={(event) => onChangeStartDate(event.target.value)}
                className="pointer-events-none absolute hidden h-px w-px overflow-hidden opacity-0 md:block"
                tabIndex={-1}
                aria-hidden="true"
              />
            </div>

            <div className="w-full md:w-56 md:shrink-0">
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

        <div className="flex w-full flex-col items-start gap-2.5 md:w-auto md:items-end">
          <div className="flex w-full items-center gap-2 md:w-auto md:justify-end">
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
                aria-label="설정 메뉴"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-slate-100 text-slate-500 shadow-sm transition hover:bg-slate-200 hover:text-slate-700"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.591 1.066c1.527-.94 3.31.843 2.37 2.37a1.724 1.724 0 001.065 2.592c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.591c.94 1.527-.843 3.31-2.37 2.37a1.724 1.724 0 00-2.592 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.591-1.066c-1.527.94-3.31-.843-2.37-2.37a1.724 1.724 0 00-1.065-2.592c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.591c-.94-1.527.843-3.31 2.37-2.37.995.607 2.295.069 2.591-1.066z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                    d="M12 15.75A3.75 3.75 0 1112 8.25a3.75 3.75 0 010 7.5z"
                  />
                </svg>
              </button>

              {isDangerMenuOpen ? (
                <div className="absolute right-0 z-30 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDangerMenuOpen(false);
                      setCodeFeedback(null);
                      setIsCodeViewOpen(true);
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-slate-700 transition hover:bg-slate-100"
                  >
                    동기화 코드 보기
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDangerMenuOpen(false);
                      setCodeFeedback(null);
                      setCodeInputDraft('');
                      setIsCodeLoadOpen(true);
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-slate-700 transition hover:bg-slate-100"
                  >
                    코드 입력 / 붙여넣기
                  </button>
                  <div className="my-1 h-px bg-slate-100" aria-hidden="true" />
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

          <div className="flex w-full flex-col items-start gap-1 md:w-auto md:items-end">
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

      {isCodeViewOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsCodeViewOpen(false);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-extrabold tracking-tight text-slate-900">동기화 코드</h3>
            <p className="mt-1 text-sm text-slate-500">
              다른 디바이스에서 이 코드를 입력하면 같은 데이터를 불러옵니다.
            </p>

            <code className="mt-4 inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-extrabold tracking-wide text-indigo-700">
              {userCode}
            </code>

            {codeFeedback ? (
              <p className="mt-2 text-xs text-slate-500">{codeFeedback}</p>
            ) : null}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void handleCopyCode();
                }}
                className="btn-primary flex-1"
              >
                코드 복사
              </button>
              <button
                type="button"
                onClick={() => setIsCodeViewOpen(false)}
                className="btn-quiet flex-1"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCodeLoadOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsCodeLoadOpen(false);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-extrabold tracking-tight text-slate-900">
              코드 입력 / 붙여넣기
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              입력한 코드의 서버 데이터를 현재 기기로 불러옵니다.
            </p>

            <input
              value={codeInputDraft}
              onChange={(event) => setCodeInputDraft(normalizeUserCode(event.target.value))}
              placeholder="예: WT-8F4K2M"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="field-input mt-4 h-11 w-full"
            />

            {codeFeedback ? (
              <p className="mt-2 text-xs text-slate-500">{codeFeedback}</p>
            ) : null}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setIsCodeLoadOpen(false)}
                className="btn-quiet flex-1"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  void submitLoadCode();
                }}
                disabled={isCodeActionPending}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                불러오기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
