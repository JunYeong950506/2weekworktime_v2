import {
  getSupabaseAdmin,
  getWatchExpiresAt,
  isUuid,
  readJsonBody,
  requireMethod,
  sendError,
  sendJson,
  toSafeErrorMessage,
  validateAdvanceCount,
  validateTargetNumber,
} from '../_cafeAlertService.js';

function toWatchResponse(watch, currentState) {
  return {
    watchId: watch.id,
    targetNumber: watch.target_number,
    advanceCount: watch.advance_count,
    triggerNumber: watch.trigger_number,
    currentNumber: currentState?.current_number ?? null,
    capturedAt: currentState?.captured_at ?? null,
    sourceStatus: currentState?.source_status ?? 'UNKNOWN',
    status: watch.status,
    expiresAt: watch.expires_at,
  };
}

export default async function handler(request, response) {
  if (!requireMethod(request, response, 'POST')) {
    return;
  }

  try {
    const body = await readJsonBody(request);
    const subscriptionId = typeof body.subscriptionId === 'string'
      ? body.subscriptionId.trim()
      : '';
    const targetNumber = validateTargetNumber(body.targetNumber);
    const advanceCount = validateAdvanceCount(body.advanceCount);

    if (!isUuid(subscriptionId)) {
      sendError(response, 400, 'INVALID_SUBSCRIPTION_ID', 'subscriptionId must be a UUID');
      return;
    }

    if (targetNumber === null) {
      sendError(response, 400, 'INVALID_TARGET_NUMBER', 'targetNumber must be 1-9999');
      return;
    }

    if (advanceCount === null) {
      sendError(response, 400, 'INVALID_ADVANCE_COUNT', 'advanceCount must be 3 or 5');
      return;
    }

    if (targetNumber <= advanceCount) {
      sendError(response, 400, 'INVALID_TRIGGER_NUMBER', 'targetNumber must be greater than advanceCount');
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: subscription, error: subscriptionError } = await supabase
      .from('cafe_push_subscriptions')
      .select('id,active')
      .eq('id', subscriptionId)
      .maybeSingle();

    if (subscriptionError) {
      throw new Error(subscriptionError.message);
    }

    if (!subscription?.active) {
      sendError(response, 404, 'SUBSCRIPTION_NOT_FOUND', 'Active push subscription was not found');
      return;
    }

    const { data: currentState, error: stateError } = await supabase
      .from('cafe_number_state')
      .select('current_number,captured_at,source_status')
      .eq('id', 1)
      .maybeSingle();

    if (stateError) {
      throw new Error(stateError.message);
    }

    if (
      typeof currentState?.current_number === 'number' &&
      currentState.current_number >= targetNumber
    ) {
      sendError(response, 400, 'TARGET_ALREADY_PASSED', 'Current number is already equal to or greater than targetNumber');
      return;
    }

    const nowIso = new Date().toISOString();
    const expiresAt = getWatchExpiresAt();
    const { data: existingWatch, error: existingWatchError } = await supabase
      .from('cafe_number_watches')
      .select('id')
      .eq('subscription_id', subscriptionId)
      .eq('target_number', targetNumber)
      .eq('status', 'WAITING')
      .maybeSingle();

    if (existingWatchError) {
      throw new Error(existingWatchError.message);
    }

    if (existingWatch) {
      const { data: updatedWatch, error: updateError } = await supabase
        .from('cafe_number_watches')
        .update({
          advance_count: advanceCount,
          registered_current_number: currentState?.current_number ?? null,
          expires_at: expiresAt,
          updated_at: nowIso,
        })
        .eq('id', existingWatch.id)
        .select('id,target_number,advance_count,trigger_number,status,expires_at')
        .single();

      if (updateError) {
        throw new Error(updateError.message);
      }

      sendJson(response, 200, toWatchResponse(updatedWatch, currentState));
      return;
    }

    const { data: watch, error: insertError } = await supabase
      .from('cafe_number_watches')
      .insert({
        subscription_id: subscriptionId,
        target_number: targetNumber,
        advance_count: advanceCount,
        registered_current_number: currentState?.current_number ?? null,
        status: 'WAITING',
        expires_at: expiresAt,
      })
      .select('id,target_number,advance_count,trigger_number,status,expires_at')
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }

    sendJson(response, 200, toWatchResponse(watch, currentState));
  } catch (error) {
    sendError(response, 500, 'WATCH_REGISTRATION_FAILED', toSafeErrorMessage(error));
  }
}
