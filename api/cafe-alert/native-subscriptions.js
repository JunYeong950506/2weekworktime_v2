import {
  getSupabaseAdmin,
  isUuid,
  normalizeNativePushSubscription,
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
    const nativePush = normalizeNativePushSubscription(body.token);

    if (!isUuid(deviceId)) {
      sendError(response, 400, 'INVALID_DEVICE_ID', 'deviceId must be a UUID');
      return;
    }

    if (!nativePush) {
      sendError(response, 400, 'INVALID_FCM_TOKEN', 'token must be a valid FCM token');
      return;
    }

    const nowIso = new Date().toISOString();
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('cafe_push_subscriptions')
      .upsert(
        {
          device_id: deviceId,
          endpoint: nativePush.endpoint,
          subscription: nativePush.subscription,
          user_agent: typeof body.userAgent === 'string' ? body.userAgent.slice(0, 300) : 'android-webview',
          active: true,
          updated_at: nowIso,
          last_seen_at: nowIso,
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
    sendError(response, 500, 'NATIVE_SUBSCRIPTION_REGISTRATION_FAILED', toSafeErrorMessage(error));
  }
}
