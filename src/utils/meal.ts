import type { MealCount } from '../types';

export const MEAL_BREAK_MINUTES = 30;

export function normalizeMealCount(
  value: unknown,
  legacyDinnerChecked = false,
): MealCount {
  if (value === 2) {
    return 2;
  }

  if (value === 1) {
    return 1;
  }

  return legacyDinnerChecked ? 1 : 0;
}

export function getMealBreakMinutes(mealCount: MealCount): number {
  return mealCount * MEAL_BREAK_MINUTES;
}
