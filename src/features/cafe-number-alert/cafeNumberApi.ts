import {
  AdvanceCount,
  CafeWatchStatusResponse,
  RegisterSubscriptionResponse,
  RegisterWatchResponse,
} from './types';

const DEVICE_ID_KEY = 'cafe-number-device-id';

function createFallbackId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getOrCreateCafeDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const deviceId = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : createFallbackId();
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = typeof payload?.message === 'string'
      ? payload.message
      : '카페 알림 요청을 처리하지 못했습니다.';
    throw new Error(message);
  }

  return payload as T;
}

export function fetchCafeWatchStatus(deviceId: string): Promise<CafeWatchStatusResponse> {
  return apiFetch<CafeWatchStatusResponse>(
    `/api/cafe-alert/watch-status?deviceId=${encodeURIComponent(deviceId)}`,
  );
}

export function registerCafePushSubscription(
  deviceId: string,
  subscription: PushSubscription,
): Promise<RegisterSubscriptionResponse> {
  return apiFetch<RegisterSubscriptionResponse>('/api/cafe-alert/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      deviceId,
      subscription: subscription.toJSON(),
      userAgent: navigator.userAgent,
    }),
  });
}

export function registerCafeNativePushSubscription(
  deviceId: string,
  token: string,
): Promise<RegisterSubscriptionResponse> {
  return apiFetch<RegisterSubscriptionResponse>('/api/cafe-alert/native-subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      deviceId,
      token,
      userAgent: navigator.userAgent,
    }),
  });
}

export function registerCafeWatch(payload: {
  subscriptionId: string;
  targetNumber: number;
  advanceCount: AdvanceCount;
}): Promise<RegisterWatchResponse> {
  return apiFetch<RegisterWatchResponse>('/api/cafe-alert/watches', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function cancelCafeWatch(watchId: string, deviceId: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>('/api/cafe-alert/cancel-watch', {
    method: 'POST',
    body: JSON.stringify({ watchId, deviceId }),
  });
}
