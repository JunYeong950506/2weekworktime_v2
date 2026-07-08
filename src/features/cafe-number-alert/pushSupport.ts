export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

export function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function registerCafeServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('SERVICE_WORKER_NOT_SUPPORTED');
  }

  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) {
    return existing;
  }

  return navigator.serviceWorker.register('/sw.js', {
    scope: '/',
  });
}

export async function requestNotificationPermission(): Promise<void> {
  if (!('Notification' in window)) {
    throw new Error('NOTIFICATION_NOT_SUPPORTED');
  }

  const permission = await Notification.requestPermission();

  if (permission === 'denied') {
    throw new Error('NOTIFICATION_PERMISSION_DENIED');
  }

  if (permission !== 'granted') {
    throw new Error('NOTIFICATION_PERMISSION_NOT_GRANTED');
  }
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const normalized = (value + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }

  return buffer;
}

export async function subscribeToCafePush(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string,
): Promise<PushSubscription> {
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    return existing;
  }

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey),
  });
}
