alter table public.work_records
  add column if not exists special_work_request_minutes integer not null default 0;

alter table public.work_records
  drop constraint if exists work_records_special_work_request_minutes_check;

alter table public.work_records
  add constraint work_records_special_work_request_minutes_check
  check (special_work_request_minutes between 0 and 480);

select pg_notify('pgrst', 'reload schema');
