alter table public.cafe_number_state
  add column if not exists estimated_seconds_per_number numeric,
  add column if not exists estimate_sample_numbers integer not null default 0;
