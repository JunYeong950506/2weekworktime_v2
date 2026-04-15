import dayjs from 'dayjs';
import Holidays from 'date-holidays';

import type { Period } from '../types';

export interface HolidayYearCache {
  year: number;
  fetchedAt: string;
  holidays: Record<string, string>;
}

const HOLIDAY_CACHE_VERSION = 'v1';
const krHolidays = new Holidays('KR');

function getHolidayCacheKey(year: number): string {
  return `flex-work-2week-holidays-${year}-${HOLIDAY_CACHE_VERSION}`;
}

function normalizeDate(dateIso: string): string | null {
  const parsed = dayjs(dateIso);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : null;
}

function readHolidayCache(year: number): HolidayYearCache | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getHolidayCacheKey(year));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<HolidayYearCache>;
    if (
      parsed.year !== year ||
      typeof parsed.fetchedAt !== 'string' ||
      !parsed.holidays ||
      typeof parsed.holidays !== 'object'
    ) {
      return null;
    }

    return {
      year,
      fetchedAt: parsed.fetchedAt,
      holidays: parsed.holidays as Record<string, string>,
    };
  } catch {
    return null;
  }
}

function writeHolidayCache(cache: HolidayYearCache): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(getHolidayCacheKey(cache.year), JSON.stringify(cache));
  } catch {
    // 캐시 저장 실패는 휴일 계산 실패로 취급하지 않는다.
  }
}

export function isMayDayHoliday(dateIso: string): boolean {
  const date = normalizeDate(dateIso);
  return date ? dayjs(date).format('MM-DD') === '05-01' : false;
}

function getDateHolidaysResult(dateIso: string): ReturnType<Holidays['isHoliday']> {
  const date = dayjs(dateIso);
  const localDate = new Date(date.year(), date.month(), date.date());
  return krHolidays.isHoliday(localDate);
}

export function getFallbackHolidayName(dateIso: string): string | null {
  if (isMayDayHoliday(dateIso)) {
    return '근로자의 날';
  }

  const result = getDateHolidaysResult(dateIso);
  if (!result) {
    return null;
  }

  const item = Array.isArray(result) ? result[0] : result;
  return typeof item.name === 'string' ? item.name : null;
}

export function isKoreanPublicHolidayFallback(dateIso: string): boolean {
  return Boolean(getDateHolidaysResult(dateIso)) || isMayDayHoliday(dateIso);
}

export async function ensureHolidayCache(
  year: number,
  options: { refresh?: boolean } = {},
): Promise<HolidayYearCache | null> {
  if (!options.refresh) {
    const cached = readHolidayCache(year);
    if (cached) {
      return cached;
    }
  }

  if (typeof fetch !== 'function') {
    return null;
  }

  try {
    const refreshQuery = options.refresh ? '&refresh=1' : '';
    const response = await fetch(`/api/holidays?year=${year}${refreshQuery}`);
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as Partial<HolidayYearCache>;
    if (
      payload.year !== year ||
      !payload.holidays ||
      typeof payload.holidays !== 'object'
    ) {
      return null;
    }

    const cache: HolidayYearCache = {
      year,
      fetchedAt: payload.fetchedAt ?? dayjs().toISOString(),
      holidays: payload.holidays as Record<string, string>,
    };
    writeHolidayCache(cache);
    return cache;
  } catch {
    return null;
  }
}

export async function isHoliday(dateIso: string): Promise<boolean> {
  const date = normalizeDate(dateIso);
  if (!date) {
    return false;
  }

  const cache = await ensureHolidayCache(dayjs(date).year());
  return Boolean(cache?.holidays[date]) || isKoreanPublicHolidayFallback(date);
}

export async function getHolidayName(dateIso: string): Promise<string | null> {
  const date = normalizeDate(dateIso);
  if (!date) {
    return null;
  }

  const cache = await ensureHolidayCache(dayjs(date).year());
  return cache?.holidays[date] ?? getFallbackHolidayName(date);
}

export async function getHolidayDateSet(dates: string[]): Promise<Set<string>> {
  const holidayDates = new Set<string>();
  const normalizedDates = Array.from(new Set(dates.map(normalizeDate).filter(Boolean))) as string[];
  const cacheByYear = new Map<number, HolidayYearCache | null>();

  for (const year of Array.from(new Set(normalizedDates.map((date) => dayjs(date).year())))) {
    cacheByYear.set(year, await ensureHolidayCache(year));
  }

  for (const date of normalizedDates) {
    const cache = cacheByYear.get(dayjs(date).year()) ?? null;
    if (Boolean(cache?.holidays[date]) || isKoreanPublicHolidayFallback(date)) {
      holidayDates.add(date);
    }
  }

  return holidayDates;
}

export async function applyHolidayProviderToPeriods(
  periods: Period[],
): Promise<{ periods: Period[]; changed: boolean }> {
  const holidayDates = await getHolidayDateSet(
    periods.flatMap((period) => period.records.map((record) => record.date)),
  );

  let changed = false;
  const nextPeriods = periods.map((period) => ({
    ...period,
    records: period.records.map((record) => {
      if (!holidayDates.has(record.date) || record.isHoliday) {
        return record;
      }

      changed = true;
      return {
        ...record,
        isHoliday: true,
      };
    }),
  }));

  return { periods: nextPeriods, changed };
}
