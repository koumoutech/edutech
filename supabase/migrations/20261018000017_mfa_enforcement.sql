-- =============================================================================
-- Multi-factor authentication enforcement (TOTP, Supabase Auth MFA)
--
-- A user who has enrolled a verified factor must present an aal2 session
-- (password + one-time code). An aal1 session of such a user gets NO data:
--   * a RESTRICTIVE policy on every exposed table (combined with AND),
--   * private.perm_scopes / is_member / is_platform_admin / require_auth also
--     require it, so SECURITY DEFINER business functions refuse the call.
-- Users without a verified factor are unaffected (aal1 is their maximum).
-- =============================================================================

create or replace function private.mfa_satisfied() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'
    );
$$;
grant execute on function private.mfa_satisfied() to authenticated;

create or replace function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.mfa_satisfied() and exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid());
$$;

create or replace function private.is_member(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.mfa_satisfied() and exists (
    select 1 from public.memberships m
    join public.schools s on s.id = m.school_id and s.status = 'active'
    where m.school_id = p_school and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

create or replace function private.my_school_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct m.school_id from public.memberships m
  join public.schools s on s.id = m.school_id and s.status = 'active'
  where m.user_id = auth.uid() and m.status = 'active' and private.mfa_satisfied();
$$;

create or replace function private.perm_scopes(p_school uuid, p_perm text) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct rp.scope), '{}')
  from public.memberships m
  join public.schools s on s.id = m.school_id and s.status = 'active'
  join public.role_permissions rp on rp.role_id = m.role_id
  where m.school_id = p_school
    and m.user_id = auth.uid()
    and m.status = 'active'
    and rp.permission_key = p_perm
    and private.mfa_satisfied();
$$;

create or replace function private.require_auth() returns uuid
language plpgsql stable set search_path = '' as $$
declare
  v uuid := auth.uid();
begin
  if v is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  if not private.mfa_satisfied() then
    raise exception 'MFA_REQUIRED' using errcode = '28000';
  end if;
  return v;
end;
$$;

-- Restrictive policy on every RLS-enabled public table (public branding excepted).
do $$
declare
  t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relname <> 'platform_settings'
  loop
    execute format(
      'create policy mfa_required on public.%I as restrictive for all to authenticated using ((select private.mfa_satisfied())) with check ((select private.mfa_satisfied()))',
      t.relname
    );
  end loop;
end $$;

create policy mfa_required on storage.objects as restrictive for all to authenticated
  using ((select private.mfa_satisfied())) with check ((select private.mfa_satisfied()));

-- Security events for MFA.
alter table public.login_events drop constraint if exists login_events_event_check;
alter table public.login_events add constraint login_events_event_check check (event in (
  'login_success', 'login_failure', 'logout', 'password_reset_requested', 'password_changed', 'locked_out',
  'session_revoked', 'mfa_enabled', 'mfa_disabled', 'mfa_failure', 'mfa_success'
));

-- SECURITY DEFINER read functions that bypass RLS must also require MFA.
CREATE OR REPLACE FUNCTION public.my_context()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'is_platform_admin', private.is_platform_admin(),
    'schools', coalesce((
      select jsonb_agg(x order by x ->> 'name') from (
        select jsonb_build_object(
          'id', s.id, 'name', s.name, 'slug', s.slug, 'currency', s.currency, 'timezone', s.timezone,
          'logo_path', s.logo_path, 'brand_color', s.brand_color, 'is_demo', s.is_demo,
          'roles', (select jsonb_agg(distinct jsonb_build_object('key', r.key, 'name', r.name))
                    from public.memberships m2 join public.roles r on r.id = m2.role_id
                    where m2.school_id = s.id and m2.user_id = auth.uid() and m2.status = 'active'),
          'permissions', (select jsonb_object_agg(k, scopes) from (
                            select rp.permission_key as k, jsonb_agg(distinct rp.scope) as scopes
                            from public.memberships m3 join public.role_permissions rp on rp.role_id = m3.role_id
                            where m3.school_id = s.id and m3.user_id = auth.uid() and m3.status = 'active'
                            group by rp.permission_key) p),
          'staff_id', private.my_staff_id(s.id),
          'guardian_id', private.my_guardian_id(s.id),
          'student_id', private.my_student_id(s.id)
        ) as x
        from public.schools s
        where s.status = 'active' and private.mfa_satisfied() and exists (
          select 1 from public.memberships m where m.school_id = s.id and m.user_id = auth.uid() and m.status = 'active')
      ) q
    ), '[]'::jsonb)
  );
$function$

;
CREATE OR REPLACE FUNCTION public.thread_participants(p_thread uuid)
 RETURNS TABLE(user_id uuid, full_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select mp.user_id, coalesce(nullif(p.full_name, ''), 'Utilisateur')
  from public.message_participants mp join public.profiles p on p.id = mp.user_id
  where mp.thread_id = p_thread and private.is_thread_participant(p_thread) and private.mfa_satisfied();
$function$

;
