import { type UIEvent, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { MINUTES_PER_HOUR } from '../constants';

const DURATION_WHEEL_ROW_HEIGHT = 44;

function clampDurationMinutes(totalMinutes: number, maxMinutes: number): number {
  return Math.min(maxMinutes, Math.max(0, Math.round(totalMinutes)));
}

function formatDurationLabel(totalMinutes: number, maxMinutes: number): string {
  const safeMinutes = clampDurationMinutes(totalMinutes, maxMinutes);
  const hours = Math.floor(safeMinutes / MINUTES_PER_HOUR);
  const minutes = safeMinutes % MINUTES_PER_HOUR;

  return `${hours}시간 ${String(minutes).padStart(2, '0')}분`;
}

function DurationWheel({
  label,
  suffix,
  values,
  value,
  onChange,
}: {
  label: string;
  suffix: string;
  values: number[];
  value: number;
  onChange: (value: number) => void;
}): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  const settleTimerRef = useRef<number | null>(null);
  const selectedIndex = Math.max(0, values.indexOf(value));

  useEffect(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTop = selectedIndex * DURATION_WHEEL_ROW_HEIGHT;
    }
  }, [selectedIndex, values.length]);

  useEffect(
    () => () => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
    },
    [],
  );

  function selectIndex(index: number): void {
    const safeIndex = Math.min(values.length - 1, Math.max(0, index));
    onChange(values[safeIndex]);
    listRef.current?.scrollTo({
      top: safeIndex * DURATION_WHEEL_ROW_HEIGHT,
      behavior: 'smooth',
    });
  }

  function handleScroll(event: UIEvent<HTMLDivElement>): void {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
    }

    const list = event.currentTarget;
    settleTimerRef.current = window.setTimeout(() => {
      selectIndex(Math.round(list.scrollTop / DURATION_WHEEL_ROW_HEIGHT));
    }, 90);
  }

  return (
    <div className="min-w-0 flex-1">
      <p className="mb-2 text-center text-xs font-bold text-slate-400">{label}</p>
      <div className="relative h-[220px] overflow-hidden rounded-2xl bg-slate-50">
        <div className="pointer-events-none absolute inset-x-2 top-1/2 z-0 h-11 -translate-y-1/2 rounded-xl border border-indigo-100 bg-indigo-50" />
        <div
          ref={listRef}
          role="listbox"
          aria-label={label}
          onScroll={handleScroll}
          className="duration-wheel relative z-10 h-full snap-y snap-mandatory overflow-y-auto overscroll-contain py-[88px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {values.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === value}
              onClick={() => selectIndex(values.indexOf(option))}
              className={`flex h-11 w-full snap-center items-center justify-center bg-transparent text-xl transition-colors ${
                option === value ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-400'
              }`}
            >
              {String(option).padStart(2, '0')}
              <span className="ml-1 text-sm">{suffix}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface DurationPickerProps {
  ariaLabel: string;
  valueMinutes: number;
  maxMinutes: number;
  onChange: (value: number) => void;
  className: string;
  onAnchorChange?: (element: HTMLSpanElement | null) => void;
}

export function DurationPicker({
  ariaLabel,
  valueMinutes,
  maxMinutes,
  onChange,
  className,
  onAnchorChange,
}: DurationPickerProps): JSX.Element {
  const titleId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [draftMinutes, setDraftMinutes] = useState(() =>
    clampDurationMinutes(valueMinutes, maxMinutes),
  );
  const maxHours = Math.floor(maxMinutes / MINUTES_PER_HOUR);
  const draftHours = Math.floor(draftMinutes / MINUTES_PER_HOUR);
  const draftMinutePart = draftMinutes % MINUTES_PER_HOUR;
  const maxMinutePart = draftHours === maxHours ? maxMinutes % MINUTES_PER_HOUR : 59;
  const hourValues = Array.from({ length: maxHours + 1 }, (_, index) => index);
  const minuteValues = Array.from({ length: maxMinutePart + 1 }, (_, index) => index);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  function openPicker(): void {
    setDraftMinutes(clampDurationMinutes(valueMinutes, maxMinutes));
    setIsOpen(true);
  }

  return (
    <>
      <span ref={onAnchorChange} className={`relative inline-flex ${className}`}>
        <button
          type="button"
          aria-label={`${ariaLabel} 선택`}
          onClick={openPicker}
          className="flex h-full w-full items-center justify-center border-0 bg-transparent p-0 text-center"
        >
          {formatDurationLabel(valueMinutes, maxMinutes)}
        </button>
      </span>

      {isOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setIsOpen(false);
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="w-full max-w-xs rounded-3xl bg-white p-5 shadow-2xl"
              >
                <h3 id={titleId} className="text-center text-lg font-extrabold text-slate-900">
                  {ariaLabel}
                </h3>

                <div className="mt-4 flex gap-3">
                  <DurationWheel
                    label="시간"
                    suffix="시"
                    values={hourValues}
                    value={draftHours}
                    onChange={(hours) =>
                      setDraftMinutes(
                        clampDurationMinutes(
                          hours * MINUTES_PER_HOUR + Math.min(draftMinutePart, 59),
                          maxMinutes,
                        ),
                      )
                    }
                  />
                  <DurationWheel
                    label="분"
                    suffix="분"
                    values={minuteValues}
                    value={Math.min(draftMinutePart, maxMinutePart)}
                    onChange={(minutes) =>
                      setDraftMinutes(
                        clampDurationMinutes(
                          draftHours * MINUTES_PER_HOUR + minutes,
                          maxMinutes,
                        ),
                      )
                    }
                  />
                </div>

                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDraftMinutes(0)}
                    className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-200"
                  >
                    초기화
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(clampDurationMinutes(draftMinutes, maxMinutes));
                      setIsOpen(false);
                    }}
                    className="flex-[1.4] rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700"
                  >
                    확인
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
