create extension if not exists pgcrypto;

create table if not exists public.cafe_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null,
  endpoint text not null unique,
  subscription jsonb not null,
  user_agent text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists cafe_push_subscriptions_device_idx
  on public.cafe_push_subscriptions(device_id);

create table if not exists public.cafe_number_watches (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null
    references public.cafe_push_subscriptions(id)
    on delete cascade,
  target_number integer not null,
  advance_count integer not null,
  trigger_number integer generated always as
    (target_number - advance_count) stored,
  registered_current_number integer,
  status text not null default 'WAITING'
    check (
      status in (
        'WAITING',
        'PROCESSING',
        'NOTIFIED',
        'CANCELLED',
        'EXPIRED',
        'FAILED'
      )
    ),
  notification_type text
    check (
      notification_type is null
      or notification_type in ('PRE_ALERT', 'LATE_ALERT')
    ),
  expires_at timestamptz not null,
  notified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (advance_count in (3, 5)),
  check (target_number between 1 and 9999),
  check (target_number > advance_count)
);

create index if not exists cafe_number_watches_waiting_idx
  on public.cafe_number_watches(status, trigger_number, expires_at);

create index if not exists cafe_number_watches_subscription_idx
  on public.cafe_number_watches(subscription_id, created_at desc);

create table if not exists public.cafe_number_state (
  id smallint primary key default 1
    check (id = 1),
  current_number integer,
  raw_ocr text,
  confidence numeric,
  source_status text not null default 'UNKNOWN'
    check (
      source_status in (
        'UNKNOWN',
        'HEALTHY',
        'LOW_CONFIDENCE',
        'STALE',
        'ERROR'
      )
    ),
  captured_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.cafe_number_state(id)
values (1)
on conflict (id) do nothing;

create table if not exists public.cafe_number_detections (
  id bigint generated always as identity primary key,
  candidate_number integer,
  raw_ocr text,
  confidence numeric,
  accepted boolean not null,
  reject_reason text,
  captured_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.cafe_notification_logs (
  id bigint generated always as identity primary key,
  watch_id uuid not null
    references public.cafe_number_watches(id)
    on delete cascade,
  current_number integer not null,
  target_number integer not null,
  notification_type text not null,
  success boolean not null,
  provider_status integer,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.cafe_push_subscriptions enable row level security;
alter table public.cafe_number_watches enable row level security;
alter table public.cafe_number_state enable row level security;
alter table public.cafe_number_detections enable row level security;
alter table public.cafe_notification_logs enable row level security;

revoke all on table public.cafe_push_subscriptions from anon, authenticated;
revoke all on table public.cafe_number_watches from anon, authenticated;
revoke all on table public.cafe_number_state from anon, authenticated;
revoke all on table public.cafe_number_detections from anon, authenticated;
revoke all on table public.cafe_notification_logs from anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.cafe_push_subscriptions to service_role;
grant select, insert, update, delete on table public.cafe_number_watches to service_role;
grant select, insert, update, delete on table public.cafe_number_state to service_role;
grant select, insert, update, delete on table public.cafe_number_detections to service_role;
grant select, insert, update, delete on table public.cafe_notification_logs to service_role;
grant usage, select on sequence public.cafe_number_detections_id_seq to service_role;
grant usage, select on sequence public.cafe_notification_logs_id_seq to service_role;

select pg_notify('pgrst', 'reload schema');
