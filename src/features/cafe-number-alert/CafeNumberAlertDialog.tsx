import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  cancelCafeWatch,
  fetchCafeWatchStatus,
  getOrCreateCafeDeviceId,
  registerCafeNativePushSubscription,
  registerCafePushSubscription,
  registerCafeWatch,
} from './cafeNumberApi';
import {
  isAndroid,
  isIos,
  isNativeAndroidPushSupported,
  isPushSupported,
  isStandalone,
  registerCafeServiceWorker,
  requestNotificationPermission,
  requestNativeAndroidPushToken,
  subscribeToCafePush,
} from './pushSupport';
import { AdvanceCount, CafeWatchStatus, CafeWatchStatusResponse, RegisterWatchResponse } from './types';

interface CafeNumberAlertDialogProps {
  open: boolean;
  onClose: () => void;
}

type AlertUiState =
  | 'INITIAL'
  | 'IOS_INSTALL_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'REGISTERING'
  | 'CANCELLING'
  | 'WAITING'
  | 'NOTIFIED'
  | 'EXPIRED'
  | 'UNSUPPORTED'
  | 'ERROR';

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim();
const NOTIFIED_RESET_DELAY_MS = 10 * 60 * 1000;
const WAIT_STATUS_REFRESH_MS = 15 * 1000;

function toWatchStatus(response: RegisterWatchResponse): CafeWatchStatusResponse {
  return {
    currentNumber: response.currentNumber,
    capturedAt: response.capturedAt,
    watch: {
      id: response.watchId,
      targetNumber: response.targetNumber,
      advanceCount: response.advanceCount,
      status: response.status,
      notifiedAt: null,
    },
    estimatedWaitMinutes: null,
    estimateSampleNumbers: 0,
  };
}

function stateFromWatchStatus(status: CafeWatchStatus | null): AlertUiState {
  if (status === 'WAITING' || status === 'PROCESSING') {
    return 'WAITING';
  }

  if (status === 'NOTIFIED') {
    return 'NOTIFIED';
  }

  if (status === 'EXPIRED') {
    return 'EXPIRED';
  }

  if (status === 'FAILED') {
    return 'ERROR';
  }

  return 'INITIAL';
}

function toFriendlyError(error: unknown): { state: AlertUiState; message: string } {
  const rawMessage = error instanceof Error ? error.message : '';

  if (rawMessage === 'NOTIFICATION_PERMISSION_DENIED') {
    return {
      state: 'PERMISSION_DENIED',
      message: '브라우저 알림이 차단되어 있습니다. 브라우저 설정에서 알림을 허용해 주세요.',
    };
  }

  if (rawMessage === 'NOTIFICATION_PERMISSION_NOT_GRANTED') {
    return {
      state: 'ERROR',
      message: '알림 권한이 허용되지 않아 등록을 완료하지 못했습니다.',
    };
  }

  if (rawMessage === 'SERVICE_WORKER_NOT_SUPPORTED' || rawMessage === 'NOTIFICATION_NOT_SUPPORTED') {
    return {
      state: 'UNSUPPORTED',
      message: '이 브라우저는 웹 알림을 지원하지 않습니다.',
    };
  }

  if (rawMessage === 'ANDROID_PUSH_PERMISSION_DENIED') {
    return {
      state: 'PERMISSION_DENIED',
      message: 'Android 앱 알림이 차단되어 있습니다. 앱 설정에서 알림을 허용해 주세요.',
    };
  }

  if (
    rawMessage === 'ANDROID_PUSH_UNAVAILABLE' ||
    rawMessage === 'ANDROID_PUSH_TOKEN_TIMEOUT' ||
    rawMessage === 'ANDROID_PUSH_TOKEN_FAILED'
  ) {
    return {
      state: 'UNSUPPORTED',
      message: 'Android 앱 알림 초기화에 실패했습니다. 앱을 최신 버전으로 업데이트한 뒤 다시 시도해 주세요.',
    };
  }

  if (rawMessage === 'WEB_PUSH_NOT_CONFIGURED') {
    return {
      state: 'ERROR',
      message: 'VITE_VAPID_PUBLIC_KEY 환경변수가 필요합니다.',
    };
  }

  return {
    state: 'ERROR',
    message: rawMessage || '알림 등록 중 오류가 발생했습니다.',
  };
}

function formatNumber(value: number | null): string {
  return typeof value === 'number' ? `${value}번` : '수신 대기';
}

function formatTime(value: string | null): string {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  return parsed.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function statusLabel(state: AlertUiState): string {
  switch (state) {
    case 'IOS_INSTALL_REQUIRED':
      return '홈 화면 실행 필요';
    case 'PERMISSION_DENIED':
      return '알림 차단됨';
    case 'REGISTERING':
      return '등록 중';
    case 'CANCELLING':
      return '취소 중';
    case 'WAITING':
      return '대기 중';
    case 'NOTIFIED':
      return '알림 완료';
    case 'EXPIRED':
      return '만료됨';
    case 'UNSUPPORTED':
      return '미지원';
    case 'ERROR':
      return '오류';
    default:
      return '등록 전';
  }
}

function statusClassName(state: AlertUiState): string {
  if (state === 'CANCELLING') {
    return 'bg-rose-50 text-rose-700';
  }

  if (state === 'REGISTERING') {
    return 'bg-amber-100 text-amber-700';
  }

  if (state === 'WAITING' || state === 'NOTIFIED') {
    return 'bg-emerald-50 text-emerald-700';
  }

  if (state === 'ERROR' || state === 'PERMISSION_DENIED' || state === 'UNSUPPORTED') {
    return 'bg-rose-50 text-rose-700';
  }

  if (state === 'EXPIRED' || state === 'IOS_INSTALL_REQUIRED') {
    return 'bg-amber-50 text-amber-700';
  }

  return 'bg-slate-100 text-slate-600';
}

function getNotifiedAtMs(watch: CafeWatchStatusResponse['watch']): number | null {
  if (watch?.status !== 'NOTIFIED' || !watch.notifiedAt) {
    return null;
  }

  const notifiedAtMs = new Date(watch.notifiedAt).getTime();
  return Number.isNaN(notifiedAtMs) ? null : notifiedAtMs;
}

function shouldResetNotifiedWatch(watch: CafeWatchStatusResponse['watch'], nowMs = Date.now()): boolean {
  const notifiedAtMs = getNotifiedAtMs(watch);
  return notifiedAtMs !== null && nowMs - notifiedAtMs >= NOTIFIED_RESET_DELAY_MS;
}

export default function CafeNumberAlertDialog({
  open,
  onClose,
}: CafeNumberAlertDialogProps): JSX.Element | null {
  const [deviceId, setDeviceId] = useState('');
  const [statusData, setStatusData] = useState<CafeWatchStatusResponse | null>(null);
  const [targetNumberInput, setTargetNumberInput] = useState('');
  const [advanceCount, setAdvanceCount] = useState<AdvanceCount>(3);
  const [uiState, setUiState] = useState<AlertUiState>('INITIAL');
  const [message, setMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'register' | 'cancel' | null>(null);

  const watch = statusData?.watch ?? null;
  const parsedTargetNumber = useMemo(() => {
    if (!/^\d+$/.test(targetNumberInput.trim())) {
      return null;
    }

    return Number(targetNumberInput);
  }, [targetNumberInput]);
  const isTargetNumberValid =
    parsedTargetNumber !== null &&
    parsedTargetNumber >= 1 &&
    parsedTargetNumber <= 9999 &&
    parsedTargetNumber > advanceCount;

  function resetToInitial(nextStatus?: CafeWatchStatusResponse | null): void {
    setStatusData((prev) => {
      if (nextStatus) {
        return { ...nextStatus, watch: null };
      }

      return prev ? { ...prev, watch: null } : prev;
    });
    setTargetNumberInput('');
    setAdvanceCount(3);
    setUiState('INITIAL');
    setMessage(null);
  }

  function applyWatchStatus(nextStatus: CafeWatchStatusResponse): void {
    if (shouldResetNotifiedWatch(nextStatus.watch)) {
      resetToInitial(nextStatus);
      return;
    }

    setStatusData(nextStatus);
    setUiState(stateFromWatchStatus(nextStatus.watch?.status ?? null));
    setMessage(null);
  }

  async function refreshStatus(nextDeviceId: string): Promise<void> {
    try {
      const nextStatus = await fetchCafeWatchStatus(nextDeviceId);
      applyWatchStatus(nextStatus);
    } catch (error) {
      const friendly = toFriendlyError(error);
      setUiState(friendly.state);
      setMessage(friendly.message);
    }
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    const nextDeviceId = getOrCreateCafeDeviceId();
    setDeviceId(nextDeviceId);
    void refreshStatus(nextDeviceId);
  }, [open]);

  useEffect(() => {
    if (!watch) {
      return;
    }

    setTargetNumberInput(String(watch.targetNumber));
    setAdvanceCount(watch.advanceCount);
  }, [watch]);

  useEffect(() => {
    if (!open || !deviceId || uiState !== 'WAITING') {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshStatus(deviceId);
    }, WAIT_STATUS_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [deviceId, open, uiState]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const notifiedAtMs = getNotifiedAtMs(watch);
    if (notifiedAtMs === null) {
      return;
    }

    const remainingMs = notifiedAtMs + NOTIFIED_RESET_DELAY_MS - Date.now();
    if (remainingMs <= 0) {
      resetToInitial();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      resetToInitial();
    }, remainingMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [open, watch]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeydown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
    };
  }, [onClose, open]);

  async function submitRegister(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!isTargetNumberValid || parsedTargetNumber === null) {
      setUiState('ERROR');
      setMessage('주문번호는 알림 시점보다 큰 1-9999 숫자로 입력해 주세요.');
      return;
    }

    const useNativeAndroidPush = isNativeAndroidPushSupported();

    if (isIos() && !isStandalone() && !useNativeAndroidPush) {
      setUiState('IOS_INSTALL_REQUIRED');
      setMessage('iPhone에서는 홈 화면에 추가한 앱에서 알림 등록을 진행해 주세요.');
      return;
    }

    if (!useNativeAndroidPush && !isPushSupported()) {
      setUiState('UNSUPPORTED');
      setMessage(
        isAndroid()
          ? 'Android 앱 알림은 최신 앱 업데이트가 필요합니다.'
          : '이 브라우저는 웹 알림을 지원하지 않습니다.',
      );
      return;
    }

    if (!useNativeAndroidPush && !VAPID_PUBLIC_KEY) {
      setUiState('ERROR');
      setMessage('VITE_VAPID_PUBLIC_KEY 환경변수가 필요합니다.');
      return;
    }

    setPendingAction('register');
    setUiState('REGISTERING');
    setMessage(null);

    try {
      const nextDeviceId = deviceId || getOrCreateCafeDeviceId();
      setDeviceId(nextDeviceId);

      const { subscriptionId } = useNativeAndroidPush
        ? await registerCafeNativePushSubscription(
          nextDeviceId,
          await requestNativeAndroidPushToken(nextDeviceId),
        )
        : await (async () => {
          const registration = await registerCafeServiceWorker();
          await requestNotificationPermission();
          const pushSubscription = await subscribeToCafePush(registration, VAPID_PUBLIC_KEY);
          return registerCafePushSubscription(nextDeviceId, pushSubscription);
        })();
      const watchResponse = await registerCafeWatch({
        subscriptionId,
        targetNumber: parsedTargetNumber,
        advanceCount,
      });

      setStatusData(toWatchStatus(watchResponse));
      setUiState(stateFromWatchStatus(watchResponse.status));
      void refreshStatus(nextDeviceId);
    } catch (error) {
      const friendly = toFriendlyError(error);
      setUiState(friendly.state);
      setMessage(friendly.message);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleCancelWatch(): Promise<void> {
    if (!watch || !deviceId) {
      return;
    }

    setPendingAction('cancel');
    setUiState('CANCELLING');
    setMessage(null);
    try {
      await cancelCafeWatch(watch.id, deviceId);
      resetToInitial();
    } catch (error) {
      const friendly = toFriendlyError(error);
      setUiState(friendly.state);
      setMessage(friendly.message);
    } finally {
      setPendingAction(null);
    }
  }

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/35 px-4 py-6 backdrop-blur-sm sm:py-10"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                  d="M17 9h1a2 2 0 010 4h-1m0-4H4v4a4 4 0 004 4h5a4 4 0 004-4V9zM7 4v2m4-2v2m4-2v2"
                />
              </svg>
            </span>
            <div>
              <h3 className="text-xl font-extrabold tracking-tight text-slate-900">
                카페 번호표 알림
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="카페 알림 화면 닫기"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-400">현재 확인 번호</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">
              {formatNumber(statusData?.currentNumber ?? null)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {formatTime(statusData?.capturedAt ?? null)} 기준
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-400">알림 상태</p>
            <span className={`mt-2 inline-flex rounded-xl px-3 py-1.5 text-sm font-extrabold ${statusClassName(uiState)}`}>
              {statusLabel(uiState)}
            </span>
            <p className="mt-2 text-xs text-slate-400">
              {watch ? `${watch.targetNumber}번 / ${watch.advanceCount}개 전` : '등록된 알림 없음'}
            </p>
            {watch?.status === 'WAITING' ? (
              <p className="mt-1 text-xs font-bold text-indigo-600" aria-live="polite">
                {typeof statusData?.estimatedWaitMinutes === 'number'
                  ? statusData.estimatedWaitMinutes === 0
                    ? '예상 대기 곧 알림 예정'
                    : `예상 대기 약 ${statusData.estimatedWaitMinutes}분`
                  : statusData?.estimateSampleNumbers
                    ? `예상 대기 계산 중 (${statusData.estimateSampleNumbers}/5)`
                    : '예상 대기 계산 중'}
              </p>
            ) : null}
          </div>
        </div>

        <form onSubmit={(event) => void submitRegister(event)} className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="field-label min-w-0">
              주문번호
              <input
                value={targetNumberInput}
                onChange={(event) => setTargetNumberInput(event.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                pattern="[0-9]*"
                className="field-input h-12 w-full text-lg"
              />
            </label>

            <div className="min-w-0">
              <p className="mb-1.5 text-xs font-bold text-slate-400">알림 시점</p>
              <div className="grid h-12 grid-cols-2 rounded-xl border border-slate-200 bg-white p-1">
                {([3, 5] as const).map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setAdvanceCount(count)}
                    className={`rounded-lg text-sm font-extrabold transition ${
                      advanceCount === count
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-100'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {count}개 전
                  </button>
                ))}
              </div>
            </div>
          </div>

          {uiState === 'IOS_INSTALL_REQUIRED' ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-extrabold">iPhone 알림 설정</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5">
                <li>Safari 공유 버튼을 누릅니다.</li>
                <li>홈 화면에 추가를 선택합니다.</li>
                <li>홈 화면에서 다시 실행한 뒤 알림 등록을 누릅니다.</li>
              </ol>
            </div>
          ) : null}

          {message ? (
            <p className={`rounded-2xl px-4 py-3 text-sm font-bold ${statusClassName(uiState)}`}>
              {message}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              disabled={pendingAction !== null || !isTargetNumberValid}
              className="btn-primary h-11 flex-1 disabled:opacity-50"
            >
              {pendingAction === 'register' ? '등록 중' : '알림 등록'}
            </button>
            <button
              type="button"
              onClick={() => {
                void handleCancelWatch();
              }}
              disabled={pendingAction !== null || !watch || watch.status !== 'WAITING'}
              className="btn-quiet h-11 flex-1 border-rose-200 text-rose-600 hover:bg-rose-50 focus-visible:ring-rose-100 disabled:opacity-50"
            >
              {pendingAction === 'cancel' ? '취소 중' : '알림 취소'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
