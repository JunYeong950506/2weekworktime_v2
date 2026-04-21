export const APP_STORAGE_KEY = 'flex-work-2week-app-v1';
export const USER_CODE_STORAGE_KEY = 'flex-work-2week-user-code-v1';
export const REMOTE_CLEANUP_CHECKED_AT_KEY =
  'flex-work-2week-remote-cleanup-checked-at-v1';

export const DAYS_PER_PERIOD = 14;
export const MAX_STORED_PERIODS = 10;
export const MINUTES_PER_HOUR = 60;

export const REGULAR_TARGET_MINUTES_2WEEK = 80 * MINUTES_PER_HOUR;
export const DAILY_REGULAR_MINUTES = 8 * MINUTES_PER_HOUR;
export const DINNER_BREAK_MINUTES = 30;
export const MAX_TOTAL_MINUTES_2WEEK = 104 * MINUTES_PER_HOUR;
export const OVERTIME_APPROVAL_UNIT_MINUTES = 10;

export const MAX_ADDITIONAL_OVERTIME_MINUTES =
  MAX_TOTAL_MINUTES_2WEEK - REGULAR_TARGET_MINUTES_2WEEK;
