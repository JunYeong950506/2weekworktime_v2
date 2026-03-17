export type TimeField = 'clockIn' | 'clockOut';

export interface DayRecord {
  date: string;
  isHoliday: boolean;
  clockIn: string;
  clockOut: string;
  dinnerChecked: boolean;
  nonWorkMinutes: number;
  workMinutes: number | null;
  regularMinutes: number | null;
  overtimeMinutes: number | null;
  recommendedOtMinutes: number | null;
  claimedOtMinutes: number;
  earlyLeaveBalanceMinutes: number | null;
}

export interface Period {
  id: string;
  label: string;
  startDate: string;
  createdAt: string;
  records: DayRecord[];
}

export interface AppState {
  selectedPeriodId: string | null;
  periods: Period[];
}

export interface PersistedAppState extends AppState {
  savedAt: string;
}

export interface DayRecordMeta {
  isWeekday: boolean;
  isSaturday: boolean;
  isSunday: boolean;
  isSpecialWorkMode: boolean;
  validationErrors: string[];
}

export interface SummaryValues {
  requiredMinutes: number;
  remainingMinutes: number;
  additionalOvertimeAvailableMinutes: number;
  earlyLeaveAvailableMinutes: number;
  overtimeApprovalTotalMinutes: number;
}

export interface PeriodCalculationResult {
  records: DayRecord[];
  rowMeta: DayRecordMeta[];
  summary: SummaryValues;
}

export interface CreatePeriodPayload {
  label: string;
  startDate: string;
  copyValues: boolean;
}

