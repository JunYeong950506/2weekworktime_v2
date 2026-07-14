import {
  getNotificationType,
  getSupabaseAdmin,
  isExpiredPushEndpoint,
  readJsonBody,
  requireMethod,
  resolveCafeCurrentNumber,
  sendCafePush,
  sendError,
  sendJson,
  toProviderStatus,
  toSafeErrorMessage,
} from '../_cafeAlertService.js';

const MAX_DETECTION_LOG_ROWS = 300;

function isAuthorized(request) {
  const expectedToken = (process.env.OCR_WORKER_TOKEN || '').trim();
  if (!expectedToken) {
    return false;
  }

  const header = request.headers.authorization || request.headers.Authorization || '';
  return header === `Bearer ${expectedToken}`;
}

function normalizeConfidence(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, value));
}

function normalizeCapturedAt(value) {
  if (typeof value !== 'string') {
    return new Date().toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function buildPushPayload(watch, currentNumber, notificationType) {
  const remaining = Math.max(0, watch.target_number - currentNumber);
  const body = notificationType === 'LATE_ALERT'
    ? `현재 ${currentNumber}번입니다. ${watch.target_number}번이 이미 지났을 수 있습니다.`
    : `현재 ${currentNumber}번입니다. ${watch.target_number}번까지 ${remaining}개 남았습니다.`;

  return {
    title: '주문 번호 알림',
    body,
    tag: `cafe-number-watch-${watch.id}`,
    url: '/',
    watchId: watch.id,
  };
}

async function logNotification(supabase, payload) {
  const { error } = await supabase
    .from('cafe_notification_logs')
    .insert(payload);

  if (error) {
    console.warn('failed to write cafe notification log', error.message);
  }
}

async function pruneDetectionLogs(supabase) {
  const { data, error: cutoffError } = await supabase
    .from('cafe_number_detections')
    .select('id')
    .order('id', { ascending: false })
    .range(MAX_DETECTION_LOG_ROWS, MAX_DETECTION_LOG_ROWS);

  if (cutoffError) {
    console.warn('failed to find cafe detection prune cutoff', cutoffError.message);
    return;
  }

  const cutoffId = data?.[0]?.id;
  if (!cutoffId) {
    return;
  }

  const { error: pruneError } = await supabase
    .from('cafe_number_detections')
    .delete()
    .lte('id', cutoffId);

  if (pruneError) {
    console.warn('failed to prune cafe detection logs', pruneError.message);
  }
}

async function markSubscriptionInactive(supabase, subscriptionId) {
  const { error } = await supabase
    .from('cafe_push_subscriptions')
    .update({
      active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscriptionId);

  if (error) {
    console.warn('failed to deactivate cafe push subscription', error.message);
  }
}

async function notifyDueWatch(supabase, watch, currentNumber, nowIso) {
  const { data: claimedWatch, error: claimError } = await supabase
    .from('cafe_number_watches')
    .update({
      status: 'PROCESSING',
      updated_at: nowIso,
    })
    .eq('id', watch.id)
    .eq('status', 'WAITING')
    .select('id,target_number,advance_count,trigger_number,status')
    .maybeSingle();

  if (claimError) {
    throw new Error(claimError.message);
  }

  if (!claimedWatch) {
    return { skipped: true };
  }

  const subscription = Array.isArray(watch.cafe_push_subscriptions)
    ? watch.cafe_push_subscriptions[0]
    : watch.cafe_push_subscriptions;
  const notificationType = getNotificationType(currentNumber, watch.target_number);

  if (!subscription?.active || !subscription.subscription) {
    await supabase
      .from('cafe_number_watches')
      .update({
        status: 'FAILED',
        notification_type: notificationType,
        last_error: 'Push subscription is inactive',
        updated_at: nowIso,
      })
      .eq('id', watch.id);

    return { notified: false };
  }

  try {
    const pushResult = await sendCafePush(
      subscription.subscription,
      buildPushPayload(watch, currentNumber, notificationType),
    );

    await supabase
      .from('cafe_number_watches')
      .update({
        status: 'NOTIFIED',
        notification_type: notificationType,
        notified_at: nowIso,
        updated_at: nowIso,
        last_error: null,
      })
      .eq('id', watch.id);

    await logNotification(supabase, {
      watch_id: watch.id,
      current_number: currentNumber,
      target_number: watch.target_number,
      notification_type: notificationType,
      success: true,
      provider_status: pushResult.statusCode ?? null,
    });

    return { notified: true };
  } catch (error) {
    const providerStatus = toProviderStatus(error);
    const errorMessage = providerStatus
      ? `Push provider returned ${providerStatus}`
      : toSafeErrorMessage(error);

    if (isExpiredPushEndpoint(error)) {
      await markSubscriptionInactive(supabase, subscription.id);
    }

    await supabase
      .from('cafe_number_watches')
      .update({
        status: 'FAILED',
        notification_type: notificationType,
        last_error: errorMessage,
        updated_at: nowIso,
      })
      .eq('id', watch.id);

    await logNotification(supabase, {
      watch_id: watch.id,
      current_number: currentNumber,
      target_number: watch.target_number,
      notification_type: notificationType,
      success: false,
      provider_status: providerStatus,
      error_message: errorMessage,
    });

    return { notified: false };
  }
}

export default async function handler(request, response) {
  if (!requireMethod(request, response, 'POST')) {
    return;
  }

  if (!isAuthorized(request)) {
    sendError(response, 401, 'UNAUTHORIZED', 'Valid OCR worker token is required');
    return;
  }

  try {
    const body = await readJsonBody(request);
    const detected = resolveCafeCurrentNumber(body);
    const currentNumber = detected.currentNumber;
    const rawOcr = typeof body.rawOcr === 'string'
      ? body.rawOcr.slice(0, 200)
      : detected.rawOcr;
    const confidence = normalizeConfidence(body.confidence);
    const capturedAt = normalizeCapturedAt(body.capturedAt);
    if (currentNumber === null) {
      sendError(
        response,
        400,
        'INVALID_CURRENT_NUMBER',
        'currentNumber, mainNumber, or detectedNumbers/listNumbers must include a 1-9999 number',
      );
      return;
    }

    const nowIso = new Date().toISOString();
    const supabase = getSupabaseAdmin();

    const { error: stateError } = await supabase
      .from('cafe_number_state')
      .upsert(
        {
          id: 1,
          current_number: currentNumber,
          raw_ocr: rawOcr,
          confidence,
          source_status: confidence === null || confidence >= 70 ? 'HEALTHY' : 'LOW_CONFIDENCE',
          captured_at: capturedAt,
          updated_at: nowIso,
        },
        { onConflict: 'id' },
      );

    if (stateError) {
      throw new Error(stateError.message);
    }

    const { error: detectionError } = await supabase
      .from('cafe_number_detections')
      .insert({
        candidate_number: currentNumber,
        raw_ocr: rawOcr,
        confidence,
        accepted: true,
        captured_at: capturedAt,
      });

    if (detectionError) {
      throw new Error(detectionError.message);
    }

    await pruneDetectionLogs(supabase);

    await supabase
      .from('cafe_number_watches')
      .update({
        status: 'EXPIRED',
        updated_at: nowIso,
      })
      .eq('status', 'WAITING')
      .lt('expires_at', nowIso);

    const { data: dueWatches, error: watchesError } = await supabase
      .from('cafe_number_watches')
      .select(`
        id,
        subscription_id,
        target_number,
        advance_count,
        trigger_number,
        expires_at,
        cafe_push_subscriptions (
          id,
          subscription,
          active
        )
      `)
      .eq('status', 'WAITING')
      .lte('trigger_number', currentNumber)
      .gt('expires_at', nowIso);

    if (watchesError) {
      throw new Error(watchesError.message);
    }

    let notifiedCount = 0;
    for (const watch of dueWatches ?? []) {
      const result = await notifyDueWatch(supabase, watch, currentNumber, nowIso);
      if (result.notified) {
        notifiedCount += 1;
      }
    }

    sendJson(response, 200, {
      ok: true,
      currentNumber,
      detectionSource: detected.detectionSource,
      detectedNumbers: detected.detectedNumbers,
      dueCount: dueWatches?.length ?? 0,
      notifiedCount,
    });
  } catch (error) {
    sendError(response, 500, 'CAFE_NUMBER_INGEST_FAILED', toSafeErrorMessage(error));
  }
}
