import {
  getCafeSubscriptionIdsForDevice,
  getSupabaseAdmin,
  isUuid,
  requireMethod,
  sendError,
  sendJson,
  toSafeErrorMessage,
} from '../_cafeAlertService.js';
import { calculateEstimatedWaitMinutes, calculateRecentWaitEstimate } from '../_cafeWaitEstimate.js';

function toWatchPayload(watch) {
  if (!watch) {
    return null;
  }

  return {
    id: watch.id,
    targetNumber: watch.target_number,
    advanceCount: watch.advance_count,
    status: watch.status,
    notifiedAt: watch.notified_at,
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
      .select('current_number,captured_at')
      .eq('id', 1)
      .maybeSingle();

    if (stateError) {
      throw new Error(stateError.message);
    }

    const subscriptionIds = await getCafeSubscriptionIdsForDevice(supabase, deviceId, {
      activeOnly: true,
    });
    let watch = null;

    if (subscriptionIds.length > 0) {
      const { data: latestWatch, error: watchError } = await supabase
        .from('cafe_number_watches')
        .select('id,target_number,advance_count,status,notified_at')
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

    let waitEstimate = { secondsPerNumber: null, sampleNumbers: 0 };
    if (watch?.status === 'WAITING') {
      const { data: detections, error: detectionsError } = await supabase
        .from('cafe_number_detections')
        .select('candidate_number,captured_at')
        .eq('accepted', true)
        .order('captured_at', { ascending: false })
        .limit(30);

      if (detectionsError) {
        throw new Error(detectionsError.message);
      }

      waitEstimate = calculateRecentWaitEstimate(detections ?? []);
    }

    const currentNumber = currentState?.current_number ?? null;
    const estimatedWaitMinutes = watch?.status === 'WAITING'
      ? calculateEstimatedWaitMinutes({
        currentNumber,
        targetNumber: watch.target_number,
        advanceCount: watch.advance_count,
        secondsPerNumber: waitEstimate.secondsPerNumber,
        sampleNumbers: waitEstimate.sampleNumbers,
      })
      : null;

    sendJson(response, 200, {
      currentNumber,
      capturedAt: currentState?.captured_at ?? null,
      watch: toWatchPayload(watch),
      estimatedWaitMinutes,
      estimateSampleNumbers: waitEstimate.sampleNumbers,
    });
  } catch (error) {
    sendError(response, 500, 'WATCH_STATUS_FAILED', toSafeErrorMessage(error));
  }
}
