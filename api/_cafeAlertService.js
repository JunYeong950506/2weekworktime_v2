import { createClient } from '@supabase/supabase-js';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import webpush from 'web-push';

const WATCH_TTL_HOURS = 3;

let supabaseAdmin = null;
let firebaseApp = null;

export function sendJson(response, status, payload) {
  response.status(status).json(payload);
}

export function sendError(response, status, code, message) {
  sendJson(response, status, { error: code, message });
}

export function requireMethod(request, response, method) {
  if (request.method === method) {
    return true;
  }

  response.setHeader('Allow', method);
  sendError(response, 405, 'METHOD_NOT_ALLOWED', `${method} request required`);
  return false;
}

export async function readJsonBody(request) {
  if (request.body && typeof request.body === 'object') {
    return request.body;
  }

  if (typeof request.body === 'string') {
    return request.body.trim() ? JSON.parse(request.body) : {};
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString('utf8').trim();
  return rawBody ? JSON.parse(rawBody) : {};
}

export function getSupabaseAdmin() {
  if (supabaseAdmin) {
    return supabaseAdmin;
  }

  const supabaseUrl = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  ).trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !serviceRoleKey) {
    const missing = [];
    if (!supabaseUrl) {
      missing.push('SUPABASE_URL');
    }
    if (!serviceRoleKey) {
      missing.push('SUPABASE_SERVICE_ROLE_KEY');
    }

    throw new Error(`Missing server Supabase environment variables: ${missing.join(', ')}`);
  }

  supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return supabaseAdmin;
}

export async function getCafeSubscriptionIdsForDevice(supabase, deviceId, options = {}) {
  let query = supabase
    .from('cafe_push_subscriptions')
    .select('id')
    .eq('device_id', deviceId);

  if (options.activeOnly) {
    query = query.eq('active', true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((subscription) => subscription.id);
}

export function isUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function toInteger(value) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value);
  }

  return null;
}

export function validateTargetNumber(value) {
  const targetNumber = toInteger(value);
  return targetNumber !== null && targetNumber >= 1 && targetNumber <= 9999
    ? targetNumber
    : null;
}

export function validateAdvanceCount(value) {
  const advanceCount = toInteger(value);
  return advanceCount === 3 || advanceCount === 12 ? advanceCount : null;
}

export function normalizeDetectedNumberList(value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.match(/(?<!\d)\d{1,4}(?!\d)/g) ?? []
      : [];
  const numbers = [];
  const seen = new Set();

  for (const item of values) {
    const number = validateTargetNumber(item);
    if (number === null || seen.has(number)) {
      continue;
    }

    seen.add(number);
    numbers.push(number);
  }

  return numbers;
}

export function resolveCafeCurrentNumber(payload) {
  const mainNumber = validateTargetNumber(payload?.mainNumber);
  const currentNumber = validateTargetNumber(payload?.currentNumber);
  const detectedNumbers = normalizeDetectedNumberList(
    payload?.detectedNumbers ?? payload?.listNumbers ?? payload?.numbers,
  );

  const fallbackNumber = detectedNumbers.length > 0
    ? Math.max(...detectedNumbers)
    : null;

  if (mainNumber !== null && (fallbackNumber === null || mainNumber >= fallbackNumber)) {
    return {
      currentNumber: mainNumber,
      detectionSource: 'MAIN_NUMBER',
      detectedNumbers,
      rawOcr: `main=${mainNumber}; list=${detectedNumbers.join(',')}`,
    };
  }

  if (currentNumber !== null) {
    return {
      currentNumber,
      detectionSource: 'CURRENT_NUMBER',
      detectedNumbers,
      rawOcr: detectedNumbers.length > 0
        ? `current=${currentNumber}; list=${detectedNumbers.join(',')}`
        : `current=${currentNumber}`,
    };
  }

  if (fallbackNumber !== null) {
    return {
      currentNumber: fallbackNumber,
      detectionSource: 'LIST_MAX',
      detectedNumbers,
      rawOcr: `list=${detectedNumbers.join(',')}`,
    };
  }

  return {
    currentNumber: null,
    detectionSource: 'NONE',
    detectedNumbers,
    rawOcr: null,
  };
}

export function normalizePushSubscription(subscription) {
  if (!subscription || typeof subscription !== 'object') {
    return null;
  }

  const endpoint = typeof subscription.endpoint === 'string'
    ? subscription.endpoint.trim()
    : '';
  const keys = subscription.keys && typeof subscription.keys === 'object'
    ? subscription.keys
    : null;
  const p256dh = typeof keys?.p256dh === 'string' ? keys.p256dh.trim() : '';
  const auth = typeof keys?.auth === 'string' ? keys.auth.trim() : '';

  if (!endpoint || !endpoint.startsWith('https://') || !p256dh || !auth) {
    return null;
  }

  return {
    endpoint,
    expirationTime: subscription.expirationTime ?? null,
    keys: {
      p256dh,
      auth,
    },
  };
}

export function normalizeNativePushSubscription(value) {
  const token = typeof value === 'string'
    ? value.trim()
    : typeof value?.token === 'string'
      ? value.token.trim()
      : '';

  if (!token || token.length < 20) {
    return null;
  }

  return {
    endpoint: `fcm:${token}`,
    subscription: {
      type: 'fcm',
      token,
    },
  };
}

export function getWatchExpiresAt(now = new Date()) {
  return new Date(now.getTime() + WATCH_TTL_HOURS * 60 * 60 * 1000).toISOString();
}

export function getNotificationType(currentNumber, targetNumber) {
  return currentNumber >= targetNumber ? 'LATE_ALERT' : 'PRE_ALERT';
}

export function getVapidPublicKey() {
  return (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '').trim();
}

function getFirebaseServiceAccount() {
  const rawJson = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (rawJson) {
    const parsed = JSON.parse(rawJson);
    return {
      projectId: parsed.projectId || parsed.project_id,
      clientEmail: parsed.clientEmail || parsed.client_email,
      privateKey: (parsed.privateKey || parsed.private_key || '').replace(/\\n/g, '\n'),
    };
  }

  const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('FCM_NOT_CONFIGURED');
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

function getFirebaseApp() {
  if (firebaseApp) {
    return firebaseApp;
  }

  const existingApp = getApps()[0];
  if (existingApp) {
    firebaseApp = existingApp;
    return firebaseApp;
  }

  firebaseApp = initializeApp({
    credential: cert(getFirebaseServiceAccount()),
  });
  return firebaseApp;
}

function configureWebPush() {
  const publicKey = getVapidPublicKey();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = (process.env.VAPID_SUBJECT || 'mailto:admin@example.com').trim();

  if (!publicKey || !privateKey) {
    throw new Error('WEB_PUSH_NOT_CONFIGURED');
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
}

function toFirebaseData(payload) {
  const data = {};

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null || key === 'title' || key === 'body') {
      continue;
    }

    data[key] = String(value);
  }

  return data;
}

async function sendFirebasePush(subscription, payload) {
  const token = typeof subscription?.token === 'string' ? subscription.token.trim() : '';
  if (!token) {
    throw new Error('FCM_TOKEN_MISSING');
  }

  const messageId = await getMessaging(getFirebaseApp()).send({
    token,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: toFirebaseData(payload),
    android: {
      priority: 'high',
      notification: {
        channelId: 'cafe_number_alerts',
        tag: payload.tag,
      },
    },
  });

  return {
    provider: 'fcm',
    messageId,
  };
}

export async function sendCafePush(subscription, payload) {
  if (subscription?.type === 'fcm') {
    return sendFirebasePush(subscription, payload);
  }

  configureWebPush();
  return webpush.sendNotification(subscription, JSON.stringify(payload));
}

export function toProviderStatus(error) {
  return typeof error?.statusCode === 'number' ? error.statusCode : null;
}

export function isExpiredPushEndpoint(error) {
  const statusCode = toProviderStatus(error);
  const code = error?.code || error?.errorInfo?.code || '';
  return (
    statusCode === 404 ||
    statusCode === 410 ||
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token'
  );
}

export function toSafeErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return '알 수 없는 오류가 발생했습니다.';
}
