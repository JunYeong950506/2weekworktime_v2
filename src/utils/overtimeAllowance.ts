import dayjs from 'dayjs';

import { Period } from '../types';
import { estimateSinglePersonWithholding } from './withholdingTax';

export const ORDINARY_HOURLY_WAGE_STORAGE_KEY =
  'flex-work-2week-ordinary-hourly-wage-v1';
export const OVERTIME_PAY_MULTIPLIER = 1.5;
export const MONTHLY_ORDINARY_HOURS = 216;

export interface OvertimeAllowanceEstimate {
  payMonth: string;
  workMonth: string;
  overtimeMinutes: number;
  estimatedPay: number;
  estimatedAfterTaxPay: number;
  estimatedWithholdingIncrease: number;
}

function sanitizeNonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

export function loadOrdinaryHourlyWage(): number {
  try {
    const raw = window.localStorage.getItem(ORDINARY_HOURLY_WAGE_STORAGE_KEY);
    if (!raw) {
      return 0;
    }

    return sanitizeNonNegativeInteger(Number(raw));
  } catch {
    return 0;
  }
}

export function saveOrdinaryHourlyWage(value: number): number {
  const normalized = sanitizeNonNegativeInteger(value);

  try {
    if (normalized > 0) {
      window.localStorage.setItem(
        ORDINARY_HOURLY_WAGE_STORAGE_KEY,
        String(normalized),
      );
    } else {
      window.localStorage.removeItem(ORDINARY_HOURLY_WAGE_STORAGE_KEY);
    }
  } catch {
    // Keep the calculator usable even when local storage is unavailable.
  }

  return normalized;
}

export function getMonthlyClaimedOvertimeMinutes(
  periods: Period[],
  month: string,
): number {
  const recordsByDate = new Map<string, { periodCreatedAt: string; minutes: number }>();

  periods.forEach((period) => {
    period.records.forEach((record) => {
      if (!record.date.startsWith(`${month}-`)) {
        return;
      }

      const existing = recordsByDate.get(record.date);
      if (
        !existing ||
        dayjs(period.createdAt).valueOf() >= dayjs(existing.periodCreatedAt).valueOf()
      ) {
        recordsByDate.set(record.date, {
          periodCreatedAt: period.createdAt,
          minutes: sanitizeNonNegativeInteger(record.claimedOtMinutes),
        });
      }
    });
  });

  return [...recordsByDate.values()].reduce(
    (total, record) => total + record.minutes,
    0,
  );
}

export function calculateEstimatedOvertimePay(
  overtimeMinutes: number,
  ordinaryHourlyWage: number,
): number {
  const minutes = sanitizeNonNegativeInteger(overtimeMinutes);
  const wage = sanitizeNonNegativeInteger(ordinaryHourlyWage);
  const rawAmount = (minutes / 60) * wage * OVERTIME_PAY_MULTIPLIER;

  return Math.round(rawAmount / 10) * 10;
}

export function calculateEstimatedAfterTaxOvertimePay(
  estimatedPay: number,
  ordinaryHourlyWage: number,
): { estimatedAfterTaxPay: number; estimatedWithholdingIncrease: number } {
  const pay = sanitizeNonNegativeInteger(estimatedPay);
  const wage = sanitizeNonNegativeInteger(ordinaryHourlyWage);
  const monthlyOrdinaryPay = wage * MONTHLY_ORDINARY_HOURS;
  const withholdingBefore = estimateSinglePersonWithholding(monthlyOrdinaryPay);
  const withholdingAfter = estimateSinglePersonWithholding(
    monthlyOrdinaryPay + pay,
  );
  const estimatedWithholdingIncrease = Math.max(
    0,
    withholdingAfter - withholdingBefore,
  );

  return {
    estimatedAfterTaxPay: Math.max(0, pay - estimatedWithholdingIncrease),
    estimatedWithholdingIncrease,
  };
}

export function buildOvertimeAllowanceEstimates(
  periods: Period[],
  ordinaryHourlyWage: number,
  now = dayjs(),
): [OvertimeAllowanceEstimate, OvertimeAllowanceEstimate] {
  const currentPayMonth = now.startOf('month');
  const nextPayMonth = currentPayMonth.add(1, 'month');

  const estimates = [currentPayMonth, nextPayMonth].map((payMonth) => {
    const workMonth = payMonth.subtract(1, 'month');
    const workMonthKey = workMonth.format('YYYY-MM');
    const overtimeMinutes = getMonthlyClaimedOvertimeMinutes(periods, workMonthKey);
    const estimatedPay = calculateEstimatedOvertimePay(
      overtimeMinutes,
      ordinaryHourlyWage,
    );
    const afterTaxEstimate = calculateEstimatedAfterTaxOvertimePay(
      estimatedPay,
      ordinaryHourlyWage,
    );

    return {
      payMonth: payMonth.format('YYYY-MM'),
      workMonth: workMonthKey,
      overtimeMinutes,
      estimatedPay,
      ...afterTaxEstimate,
    };
  });

  return [estimates[0], estimates[1]];
}
