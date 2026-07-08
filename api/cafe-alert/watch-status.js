import {
  getSupabaseAdmin,
  isUuid,
  requireMethod,
  sendError,
  sendJson,
  toSafeErrorMessage,
} from '../_cafeAlertService.js';

function toWatchPayload(watch) {
  if (!watch) {
    return null;
  }

  return {
    id: watch.id,
    targetNumber: watch.target_number,
    advanceCount: watch.advance_count,
    triggerNumber: watch.trigger_number,
    status: watch.status,
    notificationType: watch.notification_type,
    expiresAt: watch.expires_at,
    notifiedAt: watch.notified_at,
    lastError: watch.last_error,
  };
}

export default async function handler(request, response) {
  if (!requireMethod(request, response, 'GET')) {
    return;
  }

  try {
    const deviceId = typeof request.query?.deviceId === 'string'
      ? request.query.deviceId.trim()
      : '';

    if (!isUuid(deviceId)) {
      sendError(response, 400, 'INVALID_DEVICE_ID', 'deviceId must be a UUID');
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: currentState, error: stateError } = await supabase
      .from('cafe_number_state')
      .select('current_number,captured_at,source_status')
      .eq('id', 1)
      .maybeSingle();

    if (stateError) {
      throw new Error(stateError.message);
    }

    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from('cafe_push_subscriptions')
      .select('id')
      .eq('device_id', deviceId)
      .eq('active', true);

    if (subscriptionsError) {
      throw new Error(subscriptionsError.message);
    }

    const subscriptionIds = (subscriptions ?? []).map((subscription) => subscription.id);
    let watch = null;

    if (subscriptionIds.length > 0) {
      const { data: latestWatch, error: watchError } = await supabase
        .from('cafe_number_watches')
        .select('id,target_number,advance_count,trigger_number,status,notification_type,expires_at,notified_at,last_error,created_at')
        .in('subscription_id', subscriptionIds)
        .in('status', ['WAITING', 'PROCESSING', 'NOTIFIED', 'EXPIRED', 'FAILED'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (watchError) {
        throw new Error(watchError.message);
      }

      watch = latestWatch;
    }

    sendJson(response, 200, {
      currentNumber: currentState?.current_number ?? null,
      capturedAt: currentState?.captured_at ?? null,
      sourceStatus: currentState?.source_status ?? 'UNKNOWN',
      watch: toWatchPayload(watch),
    });
  } catch (error) {
    sendError(response, 500, 'WATCH_STATUS_FAILED', toSafeErrorMessage(error));
  }
}
