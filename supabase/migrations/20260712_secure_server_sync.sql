alter table public.users add column if not exists state_revision integer not null default 0;

-- Move code-based sync behind Vercel server functions.
-- Browser anon/authenticated roles can no longer access sync data directly.

alter table public.users enable row level security;
alter table public.periods enable row level security;
alter table public.work_records enable row level security;

revoke all on table public.users from anon, authenticated;
revoke all on table public.periods from anon, authenticated;
revoke all on table public.work_records from anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.users to service_role;
grant select, insert, update, delete on table public.periods to service_role;
grant select, insert, update, delete on table public.work_records to service_role;

drop policy if exists server_sync_service_role on public.users;
drop policy if exists server_sync_service_role on public.periods;
drop policy if exists server_sync_service_role on public.work_records;

create policy server_sync_service_role on public.users
  for all to service_role using (true) with check (true);
create policy server_sync_service_role on public.periods
  for all to service_role using (true) with check (true);
create policy server_sync_service_role on public.work_records
  for all to service_role using (true) with check (true);

revoke all on function public.cleanup_inactive_user_codes() from public, anon, authenticated;
grant execute on function public.cleanup_inactive_user_codes() to service_role;

select pg_notify('pgrst', 'reload schema');