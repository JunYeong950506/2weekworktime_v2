export type AdvanceCount = 3 | 5;

export type CafeWatchStatus =
  | 'WAITING'
  | 'PROCESSING'
  | 'NOTIFIED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FAILED';

export interface CafeWatch {
  id: string;
  targetNumber: number;
  advanceCount: AdvanceCount;
  triggerNumber: number;
  status: CafeWatchStatus;
  notificationType: 'PRE_ALERT' | 'LATE_ALERT' | null;
  expiresAt: string;
  notifiedAt: string | null;
  lastError: string | null;
}

export interface CafeWatchStatusResponse {
  currentNumber: number | null;
  capturedAt: string | null;
  sourceStatus: 'UNKNOWN' | 'HEALTHY' | 'LOW_CONFIDENCE' | 'STALE' | 'ERROR';
  watch: CafeWatch | null;
}

export interface RegisterSubscriptionResponse {
  subscriptionId: string;
}

export interface RegisterWatchResponse {
  watchId: string;
  targetNumber: number;
  advanceCount: AdvanceCount;
  triggerNumber: number;
  currentNumber: number | null;
  capturedAt: string | null;
  sourceStatus: CafeWatchStatusResponse['sourceStatus'];
  status: CafeWatchStatus;
  expiresAt: string;
}
