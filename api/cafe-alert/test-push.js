import {
  getSupabaseAdmin,
  isExpiredPushEndpoint,
  isUuid,
  readJsonBody,
  requireMethod,
  sendCafePush,
  sendError,
  sendJson,
  toProviderStatus,
  toSafeErrorMessage,
} from '../_cafeAlertService.js';

async function findSubscription(supabase, body) {
  const subscriptionId = typeof body.subscriptionId === 'string' ? body.subscriptionId.trim() : '';
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';

  if (subscriptionId) {
    if (!isUuid(subscriptionId)) {
      return { error: ['INVALID_SUBSCRIPTION_ID', 'subscriptionId must be a UUID'] };
    }

    const query = supabase
      .from('cafe_push_subscriptions')
      .select('id,subscription,active')
      .eq('id', subscriptionId)
      .eq('active', true);

    if (deviceId) {
      if (!isUuid(deviceId)) {
        return { error: ['INVALID_DEVICE_ID', 'deviceId must be a UUID'] };
      }
      query.eq('device_id', deviceId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new Error(error.message);
    }

    return { subscription: data };
  }

  if (!isUuid(deviceId)) {
    return { error: ['INVALID_DEVICE_ID', 'deviceId must be a UUID'] };
  }

  const { data, error } = await supabase
    .from('cafe_push_subscriptions')
    .select('id,subscription,active')
    .eq('device_id', deviceId)
    .eq('active', true)
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return { subscription: data };
}

export default async function handler(request, response) {
  if (!requireMethod(request, response, 'POST')) {
    return;
  }

  try {
    const body = await readJsonBody(request);
    const supabase = getSupabaseAdmin();
    const result = await findSubscription(supabase, body);

    if (result.error) {
      sendError(response, 400, result.error[0], result.error[1]);
      return;
    }

    if (!result.subscription?.active) {
      sendError(response, 404, 'SUBSCRIPTION_NOT_FOUND', 'Active push subscription was not found');
      return;
    }

    try {
      const pushResult = await sendCafePush(result.subscription.subscription, {
        title: '번호표 알림 테스트',
        body: '알림이 정상적으로 설정되었습니다.',
        tag: 'cafe-number-alert-test',
        url: '/',
      });

      sendJson(response, 200, {
        ok: true,
        providerStatus: pushResult.statusCode ?? null,
      });
    } catch (error) {
      const providerStatus = toProviderStatus(error);

      if (isExpiredPushEndpoint(error)) {
        await supabase
          .from('cafe_push_subscriptions')
          .update({
            active: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', result.subscription.id);
      }

      sendError(
        response,
        502,
        'TEST_PUSH_FAILED',
        providerStatus ? `Push provider returned ${providerStatus}` : toSafeErrorMessage(error),
      );
    }
  } catch (error) {
    sendError(response, 500, 'TEST_PUSH_FAILED', toSafeErrorMessage(error));
  }
}
