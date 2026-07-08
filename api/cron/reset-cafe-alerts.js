import {
  getSupabaseAdmin,
  requireMethod,
  sendError,
  sendJson,
  toSafeErrorMessage,
} from '../_cafeAlertService.js';

function isAuthorized(request) {
  const expectedToken = (process.env.CRON_SECRET || '').trim();
  if (!expectedToken) {
    return false;
  }

  const header = request.headers.authorization || request.headers.Authorization || '';
  return header === `Bearer ${expectedToken}`;
}

async function assertNoError(result, label) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
}

export default async function handler(request, response) {
  if (!requireMethod(request, response, 'GET')) {
    return;
  }

  if (!isAuthorized(request)) {
    sendError(response, 401, 'UNAUTHORIZED', 'Valid cron token is required');
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    await assertNoError(
      await supabase.from('cafe_notification_logs').delete().gt('id', 0),
      'delete notification logs',
    );
    await assertNoError(
      await supabase.from('cafe_number_detections').delete().gt('id', 0),
      'delete number detections',
    );
    await assertNoError(
      await supabase.from('cafe_number_watches').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      'delete number watches',
    );
    await assertNoError(
      await supabase.from('cafe_push_subscriptions').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      'delete push subscriptions',
    );
    await assertNoError(
      await supabase.from('cafe_number_state').upsert(
        {
          id: 1,
          current_number: null,
          raw_ocr: null,
          confidence: null,
          source_status: 'UNKNOWN',
          captured_at: null,
          updated_at: nowIso,
        },
        { onConflict: 'id' },
      ),
      'reset number state',
    );

    sendJson(response, 200, {
      ok: true,
      resetAt: nowIso,
    });
  } catch (error) {
    sendError(response, 500, 'CAFE_ALERT_RESET_FAILED', toSafeErrorMessage(error));
  }
}
