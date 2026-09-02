alter table public.work_records
  add column if not exists meal_count smallint;

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

update public.work_records
set meal_count = 0
where meal_count is null;

alter table public.work_records
  alter column meal_count set default 0,
  alter column meal_count set not null;

alter table public.work_records
  drop constraint if exists work_records_meal_count_check;

alter table public.work_records
  add constraint work_records_meal_count_check
  check (meal_count between 0 and 2);

alter table public.work_records
  drop column if exists dinner_checked;

select pg_notify('pgrst', 'reload schema');
