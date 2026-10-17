-- =============================================================================
-- EduDigi — Export audit: every data export is recorded (who, what, how many rows).
-- =============================================================================
create or replace function public.log_export(p_school uuid, p_kind text, p_rows integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_auth();
  if not private.is_member(p_school) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_kind !~ '^[a-z_]{2,40}$' then
    raise exception 'INVALID_KIND' using errcode = '22023';
  end if;
  perform private.write_audit(p_school, 'export', p_kind, null, jsonb_build_object('rows', p_rows));
end;
$$;
revoke execute on function public.log_export(uuid, text, integer) from public, anon;
grant execute on function public.log_export(uuid, text, integer) to authenticated;
