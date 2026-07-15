alter table public.cafe_number_watches
  drop constraint cafe_number_watches_advance_count_check;

alter table public.cafe_number_watches
  add constraint cafe_number_watches_advance_count_check
  check (advance_count in (3, 5, 12));
