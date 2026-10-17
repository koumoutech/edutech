-- =============================================================================
-- EduDigi — Messaging directory and request notifications.
-- Profiles are not readable school-wide; these definer functions expose only
-- the minimum (name + role labels) needed to address messages.
-- =============================================================================

create or replace function public.message_directory(p_school uuid)
returns table (user_id uuid, full_name text, role_names text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_auth();
  v_staff boolean;
begin
  if not private.has_any_perm(p_school, 'messages.create') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  v_staff := private.is_staff_member_of(p_school, v_me);
  return query
    select m.user_id, coalesce(nullif(p.full_name, ''), 'Utilisateur'), string_agg(distinct r.name, ', ')
    from public.memberships m
    join public.roles r on r.id = m.role_id
    join public.profiles p on p.id = m.user_id
    where m.school_id = p_school and m.status = 'active' and m.user_id <> v_me
      and (v_staff or private.is_staff_member_of(p_school, m.user_id))
    group by m.user_id, p.full_name
    order by 2
    limit 1000;
end;
$$;

create or replace function public.thread_participants(p_thread uuid)
returns table (user_id uuid, full_name text)
language sql stable security definer set search_path = '' as $$
  select mp.user_id, coalesce(nullif(p.full_name, ''), 'Utilisateur')
  from public.message_participants mp join public.profiles p on p.id = mp.user_id
  where mp.thread_id = p_thread and private.is_thread_participant(p_thread);
$$;

create or replace function public.notify_request_update(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.admin_requests;
begin
  select * into r from public.admin_requests where id = p_request;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_perm(r.school_id, 'requests.manage');
  perform private.notify(r.school_id, r.requester_id, 'request.updated',
    case r.status when 'done' then 'Demande traitée : ' else 'Demande mise à jour : ' end || r.subject,
    r.resolution, '/app/requests');
end;
$$;

revoke execute on function public.message_directory(uuid) from public, anon;
revoke execute on function public.thread_participants(uuid) from public, anon;
revoke execute on function public.notify_request_update(uuid) from public, anon;
grant execute on function public.message_directory(uuid) to authenticated;
grant execute on function public.thread_participants(uuid) to authenticated;
grant execute on function public.notify_request_update(uuid) to authenticated;
