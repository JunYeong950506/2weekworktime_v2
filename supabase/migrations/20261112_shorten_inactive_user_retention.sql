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
    and last_activity_at < now() - interval '14 days'
    and deleted_candidate_at is null;

  delete from public.users
  where last_activity_at < now() - interval '30 days';
end;
$$;

revoke all on function public.cleanup_inactive_user_codes() from public, anon, authenticated;
grant execute on function public.cleanup_inactive_user_codes() to service_role;
