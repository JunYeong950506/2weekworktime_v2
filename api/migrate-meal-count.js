import { timingSafeEqual } from 'node:crypto';
import pg from 'pg';

import { requireMethod, sendError, sendJson } from './_cafeAlertService.js';

const { Client } = pg;

function hasValidToken(request) {
  const expected = process.env.MEAL_MIGRATION_TOKEN;
  const authorization = request.headers.authorization ?? '';
  const provided = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';

  if (!expected || !provided) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer);
}

async function migrateMealCount(client) {
  await client.query('alter table public.work_records add column if not exists meal_count smallint');
  await client.query(`
    do $$
    begin
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'work_records'
          and column_name = 'dinner_checked'
      ) then
        update public.work_records
        set meal_count = case when dinner_checked then 1 else 0 end
        where meal_count is null;
      end if;
    end;
    $$;
  `);
  await client.query('update public.work_records set meal_count = 0 where meal_count is null');
  await client.query('alter table public.work_records alter column meal_count set default 0');
  await client.query('alter table public.work_records alter column meal_count set not null');
  await client.query('alter table public.work_records drop constraint if exists work_records_meal_count_check');
  await client.query('alter table public.work_records add constraint work_records_meal_count_check check (meal_count between 0 and 2)');
  await client.query('alter table public.work_records drop column if exists dinner_checked');
  await client.query("select pg_notify('pgrst', 'reload schema')");
}

export default async function handler(request, response) {
  if (!requireMethod(request, response, 'POST')) {
    return;
  }

  if (!hasValidToken(request)) {
    sendError(response, 401, 'UNAUTHORIZED', 'Migration token is required');
    return;
  }

  const connectionString = process.env.POSTGRES_URL_NON_POOLING;
  if (!connectionString) {
    sendError(response, 500, 'DATABASE_UNAVAILABLE', 'Database connection is not configured');
    return;
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query('begin');
    await migrateMealCount(client);
    await client.query('commit');

    const [columns, counts] = await Promise.all([
      client.query(`
        select column_name, data_type, is_nullable
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'work_records'
          and column_name in ('meal_count', 'dinner_checked')
        order by column_name
      `),
      client.query('select meal_count, count(*)::integer as count from public.work_records group by meal_count order by meal_count'),
    ]);

    sendJson(response, 200, {
      ok: true,
      columns: columns.rows,
      mealCounts: counts.rows,
    });
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {}
    console.error('Meal count migration failed', error);
    sendError(response, 500, 'MIGRATION_FAILED', 'Meal count migration could not be completed');
  } finally {
    await client.end().catch(() => undefined);
  }
}
