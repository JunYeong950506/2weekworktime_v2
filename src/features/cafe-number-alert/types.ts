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
  status: CafeWatchStatus;
  notifiedAt: string | null;
}

export interface CafeWatchStatusResponse {
  currentNumber: number | null;
  capturedAt: string | null;
  watch: CafeWatch | null;
  estimatedWaitMinutes: number | null;
  estimateSampleCount: number;
}

export interface RegisterSubscriptionResponse {
  subscriptionId: string;
}

export interface RegisterWatchResponse {
  watchId: string;
  targetNumber: number;
  advanceCount: AdvanceCount;
  currentNumber: number | null;
  capturedAt: string | null;
  status: CafeWatchStatus;
}
