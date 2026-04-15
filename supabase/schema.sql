-- WorkTime v2: code-based sync schema (no auth)
-- Apply in Supabase SQL editor.

create table if not exists public.users (
  user_code text primary key,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  deleted_candidate_at timestamptz null,
  record_count integer not null default 0
);

create table if not exists public.periods (
  id text primary key,
  user_code text not null references public.users(user_code) on delete cascade,
  period_name text not null,
  start_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_periods_user_code on public.periods(user_code);

create table if not exists public.work_records (
  id text primary key,
  period_id text not null references public.periods(id) on delete cascade,
  user_code text not null references public.users(user_code) on delete cascade,
  work_date date not null,
  holiday boolean not null default false,
  work_type text not null default 'none',
  gongga_minutes integer not null default 0,
  clock_in text not null default '',
  clock_out text not null default '',
  dinner_checked boolean not null default false,
  non_work_minutes integer not null default 0,
  actual_overtime_minutes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_work_records_user_code on public.work_records(user_code);
create index if not exists idx_work_records_period_id on public.work_records(period_id);

-- Restrict work_type values.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'work_records_work_type_check'
  ) then
    alter table public.work_records
      add constraint work_records_work_type_check
      check (work_type in ('none', 'quarter', 'half', 'full', 'official'));
  end if;
end $$;

-- No-auth code sync mode: allow anon CRUD on these tables.
-- This app is intentionally code-based (not auth-based), so RLS is disabled.
alter table public.users disable row level security;
alter table public.periods disable row level security;
alter table public.work_records disable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.users to anon, authenticated;
grant select, insert, update, delete on table public.periods to anon, authenticated;
grant select, insert, update, delete on table public.work_records to anon, authenticated;

-- Weekly cleanup function:
-- 1) record_count = 0 and last_activity_at older than 14 days => delete user (cascade).
-- 2) record_count > 0 and last_activity_at older than 30 days => set deleted_candidate_at.
-- 3) record_count > 0 and last_activity_at older than 50 days => delete user (cascade).
create or replace function public.cleanup_inactive_user_codes()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set deleted_candidate_at = now()
  where record_count > 0
    and last_activity_at < now() - interval '30 days'
    and deleted_candidate_at is null;

  delete from public.users
  where record_count = 0
    and last_activity_at < now() - interval '14 days';

  delete from public.users
  where record_count > 0
    and last_activity_at < now() - interval '50 days';
end;
$$;

revoke all on function public.cleanup_inactive_user_codes() from public;
grant execute on function public.cleanup_inactive_user_codes() to anon, authenticated;

-- Optional but useful when PostgREST cache is stale.
select pg_notify('pgrst', 'reload schema');
