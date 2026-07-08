import {
  getSupabaseAdmin,
  isUuid,
  normalizePushSubscription,
  readJsonBody,
  requireMethod,
  sendError,
  sendJson,
  toSafeErrorMessage,
} from '../_cafeAlertService.js';

export default async function handler(request, response) {
  if (!requireMethod(request, response, 'POST')) {
    return;
  }

  try {
    const body = await readJsonBody(request);
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    const subscription = normalizePushSubscription(body.subscription);
    const userAgent = typeof body.userAgent === 'string'
      ? body.userAgent.slice(0, 500)
      : request.headers['user-agent']?.slice(0, 500) ?? null;

    if (!isUuid(deviceId)) {
      sendError(response, 400, 'INVALID_DEVICE_ID', 'deviceId must be a UUID');
      return;
    }

    if (!subscription) {
      sendError(response, 400, 'INVALID_SUBSCRIPTION', 'Valid push subscription is required');
      return;
    }

    const nowIso = new Date().toISOString();
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('cafe_push_subscriptions')
      .upsert(
        {
          device_id: deviceId,
          endpoint: subscription.endpoint,
          subscription,
          user_agent: userAgent,
          active: true,
          last_seen_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: 'endpoint' },
      )
      .select('id')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    sendJson(response, 200, { subscriptionId: data.id });
  } catch (error) {
    sendError(response, 500, 'SUBSCRIPTION_REGISTRATION_FAILED', toSafeErrorMessage(error));
  }
}
