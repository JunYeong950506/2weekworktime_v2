import { isKoreanPublicHolidayFallback } from './holidayProvider';

export function isKoreanPublicHoliday(dateIso: string): boolean {
  return isKoreanPublicHolidayFallback(dateIso);
}
