import type { MealCount } from '../types';

const MEAL_OPTIONS: Array<{ value: MealCount; label: string }> = [
  { value: 0, label: '없음' },
  { value: 1, label: '1끼 식사' },
  { value: 2, label: '2끼 식사' },
];

interface MealCountSegmentedControlProps {
  value: MealCount;
  disabled?: boolean;
  onChange: (value: MealCount) => void;
}

export function MealCountSegmentedControl({
  value,
  disabled = false,
  onChange,
}: MealCountSegmentedControlProps): JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label="조식/석식 여부"
      className={`grid h-11 grid-cols-3 rounded-xl border border-slate-200 bg-white p-1 ${
        disabled ? 'opacity-60' : ''
      }`}
    >
      {MEAL_OPTIONS.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`min-w-0 rounded-lg px-1 text-[11px] font-bold whitespace-nowrap transition-all duration-200 sm:text-xs ${
              selected
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            } disabled:cursor-not-allowed`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
