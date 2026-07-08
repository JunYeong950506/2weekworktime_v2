import {
  getCafeSubscriptionIdsForDevice,
  getSupabaseAdmin,
  isUuid,
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
    const watchId = typeof body.watchId === 'string' ? body.watchId.trim() : '';
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';

    if (!isUuid(watchId)) {
      sendError(response, 400, 'INVALID_WATCH_ID', 'watchId must be a UUID');
      return;
    }

    if (!isUuid(deviceId)) {
      sendError(response, 400, 'INVALID_DEVICE_ID', 'deviceId must be a UUID');
      return;
    }

    const supabase = getSupabaseAdmin();
    const subscriptionIds = await getCafeSubscriptionIdsForDevice(supabase, deviceId);
    if (subscriptionIds.length === 0) {
      sendError(response, 404, 'WATCH_NOT_FOUND', 'Watch was not found for this device');
      return;
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from('cafe_number_watches')
      .update({
        status: 'CANCELLED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', watchId)
      .in('subscription_id', subscriptionIds)
      .in('status', ['WAITING', 'PROCESSING'])
      .select('id');

    if (updateError) {
      throw new Error(updateError.message);
    }

    if (!updatedRows || updatedRows.length === 0) {
      sendError(response, 404, 'WATCH_NOT_FOUND', 'Cancellable watch was not found for this device');
      return;
    }

    sendJson(response, 200, { ok: true });
  } catch (error) {
    sendError(response, 500, 'WATCH_CANCEL_FAILED', toSafeErrorMessage(error));
  }
}
