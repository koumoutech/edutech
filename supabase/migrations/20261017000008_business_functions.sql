-- =============================================================================
-- EduDigi — Business functions (RPC). Each function:
--   * requires an authenticated caller (auth.uid() is not null),
--   * re-checks permissions explicitly (SECURITY DEFINER) or relies on RLS (SECURITY INVOKER),
--   * runs atomically (one transaction),
--   * writes an audit entry for sensitive operations.
-- Errors are raised with stable codes (FORBIDDEN, NOT_FOUND, ...) mapped by the app.
-- =============================================================================

create or replace function private.require_auth() returns uuid
language plpgsql stable set search_path = '' as $$
declare
  v uuid := auth.uid();
begin
  if v is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  return v;
end;
$$;

create or replace function private.require_perm(p_school uuid, p_perm text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_auth();
  if not private.has_perm(p_school, p_perm) then
    raise exception 'FORBIDDEN: permission % requise', p_perm using errcode = '42501';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------
create or replace function private.channel_enabled(p_user uuid, p_type text, p_channel text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select enabled from public.notification_preferences where user_id = p_user and type = p_type and channel = p_channel),
    case p_channel
      when 'in_app' then true
      when 'email' then p_type in ('attendance.absence', 'report_card.published', 'invoice.issued', 'payment.received', 'leave.reviewed', 'announcement.urgent', 'invitation')
      else false
    end
  );
$$;

create or replace function private.notify(
  p_school uuid, p_user uuid, p_type text, p_title text, p_body text default null, p_link text default null, p_data jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
begin
  if p_user is null then
    return;
  end if;
  if private.channel_enabled(p_user, p_type, 'in_app') then
    insert into public.notifications (school_id, user_id, type, title, body, link, data)
    values (p_school, p_user, p_type, left(p_title, 200), left(p_body, 2000), p_link, coalesce(p_data, '{}'::jsonb));
  end if;
  if private.channel_enabled(p_user, p_type, 'email') then
    select email into v_email from public.profiles where id = p_user;
    if v_email is not null then
      insert into public.outbound_messages (school_id, user_id, channel, recipient, subject, body)
      values (p_school, p_user, 'email', v_email, left(p_title, 200), coalesce(p_body, p_title));
    end if;
  end if;
  if private.channel_enabled(p_user, p_type, 'sms') then
    insert into public.outbound_messages (school_id, user_id, channel, recipient, subject, body)
    select p_school, p_user, 'sms', pr.phone, null, left(p_title || coalesce(' — ' || p_body, ''), 300)
    from public.profiles pr where pr.id = p_user and pr.phone is not null;
  end if;
end;
$$;

-- Notify the student account and every guardian who accepts notifications.
create or replace function private.notify_student_family(
  p_school uuid, p_student uuid, p_type text, p_title text, p_body text default null, p_link text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  for v_user in
    select s.user_id from public.students s where s.id = p_student and s.user_id is not null
    union
    select g.user_id from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
    where sg.student_id = p_student and sg.receives_notifications and g.user_id is not null
  loop
    perform private.notify(p_school, v_user, p_type, p_title, p_body, p_link, jsonb_build_object('student_id', p_student));
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Session context for the application
-- -----------------------------------------------------------------------------
create or replace function public.my_context() returns jsonb
language sql stable security definer set search_path = '' as $$
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
        where s.status = 'active' and exists (
          select 1 from public.memberships m where m.school_id = s.id and m.user_id = auth.uid() and m.status = 'active')
      ) q
    ), '[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
-- Platform bootstrap and school creation
-- -----------------------------------------------------------------------------
-- Called only by the server with the service role, guarded by a one-time setup token.
create or replace function public.bootstrap_platform_admin(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.platform_admins) then
    raise exception 'ALREADY_INITIALIZED' using errcode = 'P0001';
  end if;
  insert into public.platform_admins (user_id, created_by) values (p_user, p_user);
  insert into public.audit_logs (actor_id, action, entity_type, entity_id)
  values (p_user, 'bootstrap', 'platform_admins', p_user::text);
end;
$$;
revoke execute on function public.bootstrap_platform_admin(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_platform_admin(uuid) to service_role;

create or replace function public.create_school(
  p_name text, p_slug text, p_country text default 'CI', p_currency text default 'XOF',
  p_timezone text default 'Africa/Abidjan', p_admin_user uuid default null, p_is_demo boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid;
  v_role uuid;
  v_admin uuid := coalesce(p_admin_user, auth.uid());
begin
  perform private.require_auth();
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: réservé au superadministrateur' using errcode = '42501';
  end if;
  insert into public.schools (name, slug, country, currency, timezone, is_demo)
  values (p_name, p_slug, p_country, p_currency, p_timezone, p_is_demo)
  returning id into v_school;
  perform private.seed_school_defaults(v_school);
  select id into v_role from public.roles where school_id = v_school and key = 'school_admin';
  insert into public.memberships (school_id, user_id, role_id, created_by) values (v_school, v_admin, v_role, auth.uid());
  perform private.write_audit(v_school, 'create', 'schools', v_school::text, jsonb_build_object('name', p_name));
  return v_school;
end;
$$;

-- -----------------------------------------------------------------------------
-- Invitations and memberships
-- -----------------------------------------------------------------------------
create or replace function private.assert_can_grant_role(p_school uuid, p_role uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.roles;
begin
  select * into v_role from public.roles where id = p_role and school_id = p_school;
  if not found then
    raise exception 'NOT_FOUND: rôle introuvable' using errcode = 'P0002';
  end if;
  if v_role.is_privileged and not private.has_perm(p_school, 'roles.manage') then
    raise exception 'FORBIDDEN: seul un administrateur peut attribuer un rôle privilégié' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.create_invitation(
  p_school uuid, p_email text, p_role uuid, p_token_hash text, p_link_kind text default null, p_link_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.require_perm(p_school, 'users.create');
  perform private.assert_can_grant_role(p_school, p_role);
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_TOKEN_HASH' using errcode = '22023';
  end if;
  if p_link_kind = 'student' and not exists (select 1 from public.students where id = p_link_id and school_id = p_school) then
    raise exception 'NOT_FOUND: élève introuvable' using errcode = 'P0002';
  elsif p_link_kind = 'guardian' and not exists (select 1 from public.guardians where id = p_link_id and school_id = p_school) then
    raise exception 'NOT_FOUND: responsable introuvable' using errcode = 'P0002';
  elsif p_link_kind = 'staff' and not exists (select 1 from public.staff_members where id = p_link_id and school_id = p_school) then
    raise exception 'NOT_FOUND: membre du personnel introuvable' using errcode = 'P0002';
  end if;
  update public.invitations set status = 'revoked'
    where school_id = p_school and email = lower(p_email) and role_id = p_role and status = 'pending';
  insert into public.invitations (school_id, email, role_id, token_hash, link_kind, link_id, invited_by)
  values (p_school, lower(trim(p_email)), p_role, p_token_hash, p_link_kind, p_link_id, auth.uid())
  returning id into v_id;
  perform private.write_audit(p_school, 'invite', 'invitations', v_id::text,
    jsonb_build_object('role_id', p_role, 'link_kind', p_link_kind));
  return v_id;
end;
$$;

create or replace function public.revoke_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid;
begin
  select school_id into v_school from public.invitations where id = p_invitation;
  perform private.require_perm(v_school, 'users.create');
  update public.invitations set status = 'revoked' where id = p_invitation and status = 'pending';
  perform private.write_audit(v_school, 'revoke', 'invitations', p_invitation::text);
end;
$$;

-- The invitee proves possession of the secret token and of the invited e-mail address.
create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.require_auth();
  v_email text;
  v_inv public.invitations;
begin
  select lower(email) into v_email from auth.users where id = v_user;
  select * into v_inv from public.invitations
    where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    for update;
  if not found or v_inv.status <> 'pending' then
    raise exception 'INVITATION_INVALID' using errcode = 'P0001';
  end if;
  if v_inv.expires_at < now() then
    update public.invitations set status = 'expired' where id = v_inv.id;
    raise exception 'INVITATION_EXPIRED' using errcode = 'P0001';
  end if;
  if v_email is distinct from v_inv.email then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = 'P0001';
  end if;

  insert into public.memberships (school_id, user_id, role_id, created_by)
  values (v_inv.school_id, v_user, v_inv.role_id, v_inv.invited_by)
  on conflict (school_id, user_id, role_id) do update set status = 'active';

  if v_inv.link_kind = 'student' then
    update public.students set user_id = v_user where id = v_inv.link_id and (user_id is null or user_id = v_user);
  elsif v_inv.link_kind = 'guardian' then
    update public.guardians set user_id = v_user where id = v_inv.link_id and (user_id is null or user_id = v_user);
  elsif v_inv.link_kind = 'staff' then
    update public.staff_members set user_id = v_user where id = v_inv.link_id and (user_id is null or user_id = v_user);
  end if;

  update public.invitations set status = 'accepted', accepted_by = v_user, accepted_at = now() where id = v_inv.id;
  update public.profiles set last_school_id = v_inv.school_id where id = v_user;
  perform private.write_audit(v_inv.school_id, 'accept', 'invitations', v_inv.id::text);
  return v_inv.school_id;
end;
$$;

create or replace function public.assign_role(p_school uuid, p_user uuid, p_role uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_perm(p_school, 'users.manage');
  perform private.assert_can_grant_role(p_school, p_role);
  if not exists (select 1 from public.memberships where school_id = p_school and user_id = p_user) then
    raise exception 'NOT_FOUND: utilisateur non membre (utilisez une invitation)' using errcode = 'P0002';
  end if;
  insert into public.memberships (school_id, user_id, role_id, created_by) values (p_school, p_user, p_role, auth.uid())
  on conflict (school_id, user_id, role_id) do update set status = 'active';
  perform private.write_audit(p_school, 'assign_role', 'memberships', p_user::text, jsonb_build_object('role_id', p_role));
end;
$$;

create or replace function public.remove_role(p_school uuid, p_user uuid, p_role uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
begin
  perform private.require_perm(p_school, 'users.manage');
  perform private.assert_can_grant_role(p_school, p_role);
  if p_user = auth.uid() then
    raise exception 'FORBIDDEN: impossible de modifier ses propres rôles' using errcode = '42501';
  end if;
  select key into v_key from public.roles where id = p_role;
  if v_key = 'school_admin' and (
    select count(*) from public.memberships m where m.school_id = p_school and m.role_id = p_role and m.status = 'active'
  ) <= 1 then
    raise exception 'LAST_ADMIN: l''établissement doit conserver un administrateur' using errcode = 'P0001';
  end if;
  delete from public.memberships where school_id = p_school and user_id = p_user and role_id = p_role;
  perform private.write_audit(p_school, 'remove_role', 'memberships', p_user::text, jsonb_build_object('role_id', p_role));
end;
$$;

create or replace function public.set_member_status(p_school uuid, p_user uuid, p_status text, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_perm(p_school, 'users.manage');
  if p_status not in ('active', 'suspended') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  if p_user = auth.uid() then
    raise exception 'FORBIDDEN: impossible de suspendre son propre compte' using errcode = '42501';
  end if;
  -- Suspending a privileged member requires roles.manage.
  if exists (select 1 from public.memberships m join public.roles r on r.id = m.role_id
             where m.school_id = p_school and m.user_id = p_user and r.is_privileged)
     and not private.has_perm(p_school, 'roles.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.memberships set status = p_status, suspended_reason = case when p_status = 'suspended' then p_reason end
  where school_id = p_school and user_id = p_user;
  perform private.write_audit(p_school, 'set_status', 'memberships', p_user::text,
    jsonb_build_object('status', p_status), p_reason);
end;
$$;

-- -----------------------------------------------------------------------------
-- Students: creation, enrollment, transfer, archive
-- -----------------------------------------------------------------------------
create or replace function private.generate_matricule(p_school uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_n bigint := private.next_counter(p_school, 'matricule:' || to_char(current_date, 'YYYY'));
begin
  return to_char(current_date, 'YY') || '-' || lpad(v_n::text, 5, '0');
end;
$$;

create or replace function public.create_student(
  p_school uuid, p_student jsonb, p_guardians jsonb default '[]'::jsonb, p_year uuid default null, p_class uuid default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_g jsonb;
  v_gid uuid;
  v_matricule text := nullif(upper(trim(p_student ->> 'matricule')), '');
begin
  perform private.require_perm(p_school, 'students.create');
  if v_matricule is null then
    v_matricule := private.generate_matricule(p_school);
  end if;
  insert into public.students (school_id, matricule, first_name, last_name, gender, birth_date, birth_place,
    nationality, address, phone, email, previous_school, notes)
  values (p_school, v_matricule, trim(p_student ->> 'first_name'), trim(p_student ->> 'last_name'),
    nullif(p_student ->> 'gender', ''), nullif(p_student ->> 'birth_date', '')::date, nullif(p_student ->> 'birth_place', ''),
    nullif(p_student ->> 'nationality', ''), nullif(p_student ->> 'address', ''), nullif(p_student ->> 'phone', ''),
    nullif(lower(p_student ->> 'email'), ''), nullif(p_student ->> 'previous_school', ''), nullif(p_student ->> 'notes', ''))
  returning id into v_id;

  for v_g in select * from jsonb_array_elements(coalesce(p_guardians, '[]'::jsonb)) loop
    v_gid := nullif(v_g ->> 'id', '')::uuid;
    if v_gid is null then
      insert into public.guardians (school_id, first_name, last_name, phone, email, profession, address)
      values (p_school, trim(v_g ->> 'first_name'), trim(v_g ->> 'last_name'), nullif(v_g ->> 'phone', ''),
        nullif(lower(v_g ->> 'email'), ''), nullif(v_g ->> 'profession', ''), nullif(v_g ->> 'address', ''))
      returning id into v_gid;
    end if;
    insert into public.student_guardians (school_id, student_id, guardian_id, relationship, is_legal_guardian,
      is_emergency_contact, is_billing_contact)
    values (p_school, v_id, v_gid, coalesce(nullif(v_g ->> 'relationship', ''), 'other'),
      coalesce((v_g ->> 'is_legal_guardian')::boolean, true), coalesce((v_g ->> 'is_emergency_contact')::boolean, false),
      coalesce((v_g ->> 'is_billing_contact')::boolean, false));
  end loop;

  if p_year is not null then
    insert into public.enrollments (school_id, student_id, academic_year_id, class_id, kind, status)
    values (p_school, v_id, p_year, p_class, 'new', 'active');
  end if;
  return v_id;
end;
$$;

create or replace function public.enroll_student(
  p_school uuid, p_student uuid, p_year uuid, p_class uuid, p_kind text default 're_enrollment'
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.require_perm(p_school, 'enrollments.manage');
  -- Close any active enrollment from a previous year.
  update public.enrollments set status = 'completed', left_on = coalesce(left_on, current_date)
  where student_id = p_student and status = 'active' and academic_year_id <> p_year;
  insert into public.enrollments (school_id, student_id, academic_year_id, class_id, kind, status)
  values (p_school, p_student, p_year, p_class, p_kind, 'active')
  returning id into v_id;
  update public.students set status = 'active' where id = p_student and status in ('applicant', 'withdrawn');
  return v_id;
end;
$$;

-- Move a student to another class of the same year (keeps history).
create or replace function public.change_class(p_enrollment uuid, p_new_class uuid, p_reason text default null) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_e public.enrollments;
  v_id uuid;
begin
  select * into v_e from public.enrollments where id = p_enrollment and status = 'active';
  if not found then
    raise exception 'NOT_FOUND: inscription active introuvable' using errcode = 'P0002';
  end if;
  perform private.require_perm(v_e.school_id, 'enrollments.manage');
  update public.enrollments set status = 'transferred', left_on = current_date, leave_reason = p_reason where id = v_e.id;
  insert into public.enrollments (school_id, student_id, academic_year_id, class_id, kind, status)
  values (v_e.school_id, v_e.student_id, v_e.academic_year_id, p_new_class, 'transfer_in', 'active')
  returning id into v_id;
  return v_id;
end;
$$;

-- Student leaves the school (transfer to another school, withdrawal, graduation).
create or replace function public.withdraw_student(p_student uuid, p_status text, p_reason text) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_school uuid;
begin
  select school_id into v_school from public.students where id = p_student;
  if v_school is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_perm(v_school, 'enrollments.manage');
  if p_status not in ('transferred', 'withdrawn', 'graduated') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  update public.enrollments set status = case when p_status = 'graduated' then 'completed' else p_status end,
    left_on = current_date, leave_reason = p_reason
  where student_id = p_student and status in ('active', 'pending');
  update public.students set status = p_status where id = p_student;
  perform private.write_audit(v_school, 'withdraw', 'students', p_student::text, jsonb_build_object('status', p_status), p_reason);
end;
$$;

create or replace function public.archive_student(p_student uuid, p_reason text) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_school uuid;
begin
  select school_id into v_school from public.students where id = p_student;
  if v_school is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_perm(v_school, 'students.delete');
  update public.enrollments set status = 'withdrawn', left_on = current_date, leave_reason = p_reason
  where student_id = p_student and status in ('active', 'pending');
  update public.students set status = 'archived', archived_at = now() where id = p_student;
  perform private.write_audit(v_school, 'archive', 'students', p_student::text, null, p_reason);
end;
$$;

-- -----------------------------------------------------------------------------
-- Assessments and grades workflow
-- -----------------------------------------------------------------------------
create or replace function public.set_assessment_status(p_assessment uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.assessments;
  v_title text;
  v_student uuid;
begin
  perform private.require_auth();
  select * into a from public.assessments where id = p_assessment for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if (a.status, p_status) in (('draft', 'submitted'), ('submitted', 'draft')) then
    if not private.can_access_class_subject(a.school_id, a.class_subject_id, 'assessments.update', true) then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if p_status = 'submitted' and not exists (select 1 from public.grades where assessment_id = a.id) then
      raise exception 'NO_GRADES: aucune note saisie' using errcode = 'P0001';
    end if;
  elsif (a.status, p_status) in (('submitted', 'validated'), ('draft', 'validated')) then
    perform private.require_perm(a.school_id, 'assessments.validate');
    if not exists (select 1 from public.grades where assessment_id = a.id) then
      raise exception 'NO_GRADES: aucune note saisie' using errcode = 'P0001';
    end if;
  elsif (a.status, p_status) in (('validated', 'published')) then
    perform private.require_perm(a.school_id, 'assessments.publish');
  elsif (a.status, p_status) in (('published', 'validated'), ('validated', 'submitted')) then
    perform private.require_perm(a.school_id, 'assessments.validate');
  else
    raise exception 'INVALID_TRANSITION: % → %', a.status, p_status using errcode = 'P0001';
  end if;

  perform set_config('app.assessment_transition', 'on', true);
  update public.assessments set
    status = p_status,
    validated_by = case when p_status = 'validated' then auth.uid() else validated_by end,
    validated_at = case when p_status = 'validated' then now() else validated_at end,
    published_at = case when p_status = 'published' then now() when p_status <> 'published' then null else published_at end
  where id = a.id;
  perform set_config('app.assessment_transition', 'off', true);

  perform private.write_audit(a.school_id, 'status:' || p_status, 'assessments', a.id::text,
    jsonb_build_object('from', a.status, 'to', p_status));

  if p_status = 'published' then
    v_title := 'Nouvelle note publiée : ' || a.title;
    for v_student in select student_id from public.grades where assessment_id = a.id loop
      perform private.notify_student_family(a.school_id, v_student, 'grade.published', v_title, null, '/app/grades');
    end loop;
  end if;
end;
$$;

-- Controlled correction of a validated/published grade (requires grades.validate + reason; fully audited).
create or replace function public.correct_grade(
  p_grade uuid, p_score numeric, p_is_absent boolean, p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g public.grades;
begin
  perform private.require_auth();
  select * into g from public.grades where id = p_grade for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_perm(g.school_id, 'grades.validate');
  if coalesce(char_length(trim(p_reason)), 0) < 5 then
    raise exception 'REASON_REQUIRED: un motif est obligatoire' using errcode = '22023';
  end if;
  perform set_config('app.grade_correction', 'on', true);
  perform set_config('app.audit_reason', p_reason, true);
  update public.grades set score = case when p_is_absent then null else p_score end, is_absent = coalesce(p_is_absent, false)
  where id = g.id;
  perform set_config('app.grade_correction', 'off', true);
  perform private.write_audit(g.school_id, 'correct', 'grades', g.id::text,
    jsonb_build_object('from', g.score, 'to', p_score, 'absent', p_is_absent), p_reason);
  perform set_config('app.audit_reason', '', true);
end;
$$;

-- Bulk grade entry (atomic). RLS applies: only authorised teachers can write.
create or replace function public.save_grades(p_assessment uuid, p_grades jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_school uuid;
  v_count integer := 0;
  v_row jsonb;
begin
  perform private.require_auth();
  select school_id into v_school from public.assessments where id = p_assessment;
  if v_school is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not private.can_write_grades(v_school, p_assessment) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  for v_row in select * from jsonb_array_elements(p_grades) loop
    insert into public.grades (school_id, assessment_id, student_id, score, is_absent, is_excused, comment)
    values (v_school, p_assessment, (v_row ->> 'student_id')::uuid,
      case when coalesce((v_row ->> 'is_absent')::boolean, false) then null else nullif(v_row ->> 'score', '')::numeric end,
      coalesce((v_row ->> 'is_absent')::boolean, false), coalesce((v_row ->> 'is_excused')::boolean, false),
      nullif(v_row ->> 'comment', ''))
    on conflict (assessment_id, student_id) do update set
      score = excluded.score, is_absent = excluded.is_absent, is_excused = excluded.is_excused, comment = excluded.comment
    where (public.grades.score, public.grades.is_absent, public.grades.is_excused, public.grades.comment)
      is distinct from (excluded.score, excluded.is_absent, excluded.is_excused, excluded.comment);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Report cards: averages are computed by the application service (tested pure
-- functions) and persisted atomically here.
-- -----------------------------------------------------------------------------
create or replace function public.save_report_cards(p_school uuid, p_term uuid, p_class uuid, p_cards jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_card jsonb;
  v_line jsonb;
  v_id uuid;
  v_count integer := 0;
begin
  perform private.require_perm(p_school, 'report_cards.create');
  if not exists (select 1 from public.classes where id = p_class and school_id = p_school)
     or not exists (select 1 from public.terms where id = p_term and school_id = p_school) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  for v_card in select * from jsonb_array_elements(p_cards) loop
    if not exists (select 1 from public.enrollments e where e.student_id = (v_card ->> 'student_id')::uuid
                   and e.class_id = p_class and e.school_id = p_school) then
      raise exception 'STUDENT_NOT_IN_CLASS' using errcode = 'P0001';
    end if;
    -- Never overwrite validated or published report cards.
    if exists (select 1 from public.report_cards where student_id = (v_card ->> 'student_id')::uuid
               and term_id = p_term and status <> 'draft') then
      continue;
    end if;
    insert into public.report_cards (school_id, student_id, term_id, class_id, average, rank, class_size, class_average,
      mention, absences_count, lates_count, generated_at, generated_by)
    values (p_school, (v_card ->> 'student_id')::uuid, p_term, p_class, nullif(v_card ->> 'average', '')::numeric,
      nullif(v_card ->> 'rank', '')::integer, nullif(v_card ->> 'class_size', '')::integer,
      nullif(v_card ->> 'class_average', '')::numeric, v_card ->> 'mention',
      coalesce((v_card ->> 'absences_count')::integer, 0), coalesce((v_card ->> 'lates_count')::integer, 0), now(), auth.uid())
    on conflict (student_id, term_id) do update set
      class_id = excluded.class_id, average = excluded.average, rank = excluded.rank, class_size = excluded.class_size,
      class_average = excluded.class_average, mention = excluded.mention, absences_count = excluded.absences_count,
      lates_count = excluded.lates_count, generated_at = now(), generated_by = auth.uid()
    returning id into v_id;

    delete from public.report_card_lines where report_card_id = v_id
      and subject_id not in (select (l ->> 'subject_id')::uuid from jsonb_array_elements(v_card -> 'lines') l);
    for v_line in select * from jsonb_array_elements(coalesce(v_card -> 'lines', '[]'::jsonb)) loop
      insert into public.report_card_lines (school_id, report_card_id, subject_id, subject_name, teacher_name, coefficient,
        average, class_average, min_average, max_average, rank, position)
      values (p_school, v_id, (v_line ->> 'subject_id')::uuid, v_line ->> 'subject_name', v_line ->> 'teacher_name',
        (v_line ->> 'coefficient')::numeric, nullif(v_line ->> 'average', '')::numeric,
        nullif(v_line ->> 'class_average', '')::numeric, nullif(v_line ->> 'min_average', '')::numeric,
        nullif(v_line ->> 'max_average', '')::numeric, nullif(v_line ->> 'rank', '')::integer,
        coalesce((v_line ->> 'position')::smallint, 0))
      on conflict (report_card_id, subject_id) do update set
        subject_name = excluded.subject_name, teacher_name = excluded.teacher_name, coefficient = excluded.coefficient,
        average = excluded.average, class_average = excluded.class_average, min_average = excluded.min_average,
        max_average = excluded.max_average, rank = excluded.rank, position = excluded.position;
    end loop;
    v_count := v_count + 1;
  end loop;
  perform private.write_audit(p_school, 'generate', 'report_cards', p_class::text, jsonb_build_object('term_id', p_term, 'count', v_count));
  return v_count;
end;
$$;

create or replace function public.set_report_cards_status(p_ids uuid[], p_status text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  rc public.report_cards;
  v_count integer := 0;
  v_term text;
begin
  perform private.require_auth();
  for rc in select * from public.report_cards where id = any (p_ids) for update loop
    if p_status = 'validated' and rc.status = 'draft' then
      perform private.require_perm(rc.school_id, 'report_cards.validate');
    elsif p_status = 'published' and rc.status = 'validated' then
      perform private.require_perm(rc.school_id, 'report_cards.publish');
    elsif p_status = 'draft' and rc.status in ('validated', 'published') then
      perform private.require_perm(rc.school_id, 'report_cards.validate');
    else
      continue;
    end if;
    update public.report_cards set status = p_status,
      validated_by = case when p_status = 'validated' then auth.uid() else validated_by end,
      published_at = case when p_status = 'published' then now() else null end
    where id = rc.id;
    if p_status = 'published' then
      select name into v_term from public.terms where id = rc.term_id;
      perform private.notify_student_family(rc.school_id, rc.student_id, 'report_card.published',
        'Bulletin disponible : ' || v_term, null, '/app/report-cards');
    end if;
    perform private.write_audit(rc.school_id, 'status:' || p_status, 'report_cards', rc.id::text);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Attendance (atomic roll call; RLS applies through SECURITY INVOKER)
-- -----------------------------------------------------------------------------
create or replace function public.save_attendance(
  p_school uuid, p_class uuid, p_date date, p_records jsonb, p_timetable_entry uuid default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_session uuid;
  v_row jsonb;
  v_prev text;
  v_status text;
  v_student uuid;
  v_name text;
begin
  perform private.require_auth();
  if p_date > current_date then
    raise exception 'FUTURE_DATE: impossible de faire l''appel pour une date future' using errcode = '22023';
  end if;
  select id into v_session from public.attendance_sessions
  where class_id = p_class and date = p_date
    and coalesce(timetable_entry_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(p_timetable_entry, '00000000-0000-0000-0000-000000000000'::uuid);
  if v_session is null then
    insert into public.attendance_sessions (school_id, class_id, date, timetable_entry_id, kind, class_subject_id)
    values (p_school, p_class, p_date, p_timetable_entry, case when p_timetable_entry is null then 'daily' else 'lesson' end,
      (select class_subject_id from public.timetable_entries where id = p_timetable_entry))
    returning id into v_session;
  else
    update public.attendance_sessions set taken_at = now(), taken_by = auth.uid() where id = v_session;
  end if;

  for v_row in select * from jsonb_array_elements(p_records) loop
    v_student := (v_row ->> 'student_id')::uuid;
    v_status := v_row ->> 'status';
    if not exists (select 1 from public.enrollments e where e.student_id = v_student and e.class_id = p_class and e.status = 'active') then
      raise exception 'STUDENT_NOT_IN_CLASS' using errcode = 'P0001';
    end if;
    select status into v_prev from public.attendance_records where session_id = v_session and student_id = v_student;
    insert into public.attendance_records (school_id, session_id, student_id, status, minutes_late, note)
    values (p_school, v_session, v_student, v_status, nullif(v_row ->> 'minutes_late', '')::integer, nullif(v_row ->> 'note', ''))
    on conflict (session_id, student_id) do update set
      status = excluded.status, minutes_late = excluded.minutes_late, note = excluded.note;
    if v_status in ('absent', 'late') and v_prev is distinct from v_status then
      select first_name into v_name from public.students where id = v_student;
      perform private.notify_student_family(p_school, v_student, 'attendance.absence',
        case when v_status = 'absent' then v_name || ' a été noté(e) absent(e) le ' || to_char(p_date, 'DD/MM/YYYY')
             else v_name || ' est arrivé(e) en retard le ' || to_char(p_date, 'DD/MM/YYYY') end,
        'Vous pouvez transmettre un justificatif depuis votre espace parent.', '/app/attendance');
    end if;
  end loop;
  return v_session;
end;
$$;

create or replace function public.review_absence_justification(p_id uuid, p_status text, p_comment text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  j public.absence_justifications;
begin
  perform private.require_auth();
  select * into j from public.absence_justifications where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_perm(j.school_id, 'justifications.validate');
  if j.status <> 'pending' or p_status not in ('accepted', 'rejected') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.absence_justifications set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), review_comment = p_comment
  where id = j.id;
  if p_status = 'accepted' then
    update public.attendance_records r set status = 'excused', justification_id = j.id
    from public.attendance_sessions s
    where s.id = r.session_id and r.student_id = j.student_id and r.status = 'absent'
      and s.date between j.from_date and j.to_date;
  end if;
  if j.submitted_by is not null then
    perform private.notify(j.school_id, j.submitted_by, 'justification.reviewed',
      case when p_status = 'accepted' then 'Justificatif accepté' else 'Justificatif refusé' end, p_comment, '/app/attendance');
  end if;
  perform private.write_audit(j.school_id, 'review:' || p_status, 'absence_justifications', j.id::text, null, p_comment);
end;
$$;

-- -----------------------------------------------------------------------------
-- Staff leave workflow
-- -----------------------------------------------------------------------------
create or replace function public.review_leave_request(p_id uuid, p_status text, p_comment text default null, p_substitute uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  l public.leave_requests;
  v_user uuid;
begin
  perform private.require_auth();
  select * into l from public.leave_requests where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_perm(l.school_id, 'leaves.validate');
  if l.status <> 'pending' or p_status not in ('approved', 'rejected') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.staff_members s where s.id = l.staff_id and s.user_id = auth.uid()) then
    raise exception 'FORBIDDEN: impossible de valider sa propre demande' using errcode = '42501';
  end if;
  if p_substitute is not null and not exists (select 1 from public.staff_members where id = p_substitute and school_id = l.school_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.leave_requests set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(),
    review_comment = p_comment, substitute_staff_id = p_substitute
  where id = l.id;
  select user_id into v_user from public.staff_members where id = l.staff_id;
  perform private.notify(l.school_id, v_user, 'leave.reviewed',
    case when p_status = 'approved' then 'Demande d''absence approuvée' else 'Demande d''absence refusée' end, p_comment, '/app/staff/leaves');
  perform private.write_audit(l.school_id, 'review:' || p_status, 'leave_requests', l.id::text, null, p_comment);
end;
$$;

create or replace function public.cancel_leave_request(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  l public.leave_requests;
begin
  perform private.require_auth();
  select * into l from public.leave_requests where id = p_id for update;
  if not found or l.status <> 'pending' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if not (l.created_by = auth.uid() or private.has_perm(l.school_id, 'leaves.validate')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.leave_requests set status = 'cancelled' where id = l.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Finance
-- -----------------------------------------------------------------------------
create or replace function public.create_invoice(
  p_school uuid, p_student uuid, p_due_date date, p_lines jsonb, p_year uuid default null, p_notes text default null,
  p_issue boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_currency text;
  v_line jsonb;
  v_pos smallint := 0;
  v_number text;
begin
  perform private.require_perm(p_school, 'invoices.create');
  if not exists (select 1 from public.students where id = p_student and school_id = p_school) then
    raise exception 'NOT_FOUND: élève introuvable' using errcode = 'P0002';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'EMPTY_INVOICE: au moins une ligne est requise' using errcode = '22023';
  end if;
  select currency into v_currency from public.schools where id = p_school;
  v_number := 'FAC-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(private.next_counter(p_school, 'invoice:' || to_char(current_date, 'YYYY'))::text, 6, '0');
  insert into public.invoices (school_id, number, student_id, academic_year_id, issue_date, due_date, currency, notes)
  values (p_school, v_number, p_student, p_year, current_date, p_due_date, v_currency, p_notes)
  returning id into v_id;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_pos := v_pos + 1;
    insert into public.invoice_lines (school_id, invoice_id, fee_type_id, description, quantity, unit_amount, discount_amount, position)
    values (p_school, v_id, nullif(v_line ->> 'fee_type_id', '')::uuid, v_line ->> 'description',
      coalesce((v_line ->> 'quantity')::numeric, 1), (v_line ->> 'unit_amount')::numeric,
      coalesce((v_line ->> 'discount_amount')::numeric, 0), v_pos);
  end loop;
  if p_issue then
    perform public.issue_invoice(v_id);
  end if;
  perform private.write_audit(p_school, 'create', 'invoices', v_id::text, jsonb_build_object('number', v_number));
  return v_id;
end;
$$;

create or replace function public.issue_invoice(p_invoice uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  i public.invoices;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_perm(i.school_id, 'invoices.create');
  if i.status <> 'draft' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if i.total <= 0 then
    raise exception 'EMPTY_INVOICE' using errcode = '22023';
  end if;
  perform set_config('app.finance_rpc', 'on', true);
  update public.invoices set status = 'issued', issue_date = current_date where id = i.id;
  perform set_config('app.finance_rpc', 'off', true);
  perform private.notify_student_family(i.school_id, i.student_id, 'invoice.issued',
    'Nouvelle facture ' || i.number, 'Montant : ' || i.total || ' ' || i.currency || ' — échéance ' || to_char(i.due_date, 'DD/MM/YYYY'),
    '/app/finance/invoices/' || i.id);
  perform private.write_audit(i.school_id, 'issue', 'invoices', i.id::text);
end;
$$;

create or replace function public.cancel_invoice(p_invoice uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  i public.invoices;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_perm(i.school_id, 'finance.manage');
  if i.status = 'cancelled' or i.amount_paid > 0 then
    raise exception 'INVOICE_HAS_PAYMENTS: annulez ou remboursez d''abord les paiements' using errcode = 'P0001';
  end if;
  if coalesce(char_length(trim(p_reason)), 0) < 5 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  perform set_config('app.finance_rpc', 'on', true);
  update public.invoices set status = 'cancelled', cancelled_reason = p_reason where id = i.id;
  perform set_config('app.finance_rpc', 'off', true);
  perform private.write_audit(i.school_id, 'cancel', 'invoices', i.id::text, null, p_reason);
end;
$$;

-- Records a payment and allocates it to invoices (explicitly, or oldest-due first).
-- The full amount must be allocated: overpayments are rejected.
create or replace function public.record_payment(
  p_school uuid, p_student uuid, p_amount numeric, p_method uuid, p_reference text default null,
  p_payer_name text default null, p_paid_at timestamptz default now(), p_allocations jsonb default null, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_payment uuid;
  v_currency text;
  v_remaining numeric(14, 2) := round(p_amount, 2);
  v_alloc jsonb;
  v_inv record;
  v_amount numeric(14, 2);
  v_receipt text;
begin
  perform private.require_perm(p_school, 'payments.create');
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = '22023';
  end if;
  if not exists (select 1 from public.students where id = p_student and school_id = p_school) then
    raise exception 'NOT_FOUND: élève introuvable' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.payment_methods where id = p_method and school_id = p_school and is_active) then
    raise exception 'NOT_FOUND: mode de paiement invalide' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.payment_methods where id = p_method and requires_reference) and coalesce(trim(p_reference), '') = '' then
    raise exception 'REFERENCE_REQUIRED: référence de transaction obligatoire' using errcode = '22023';
  end if;
  if p_paid_at > now() + interval '5 minutes' then
    raise exception 'FUTURE_DATE' using errcode = '22023';
  end if;

  select currency into v_currency from public.schools where id = p_school;
  v_receipt := 'REC-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(private.next_counter(p_school, 'receipt:' || to_char(current_date, 'YYYY'))::text, 6, '0');
  insert into public.payments (school_id, receipt_number, student_id, payer_name, amount, currency, method_id, reference,
    paid_at, notes)
  values (p_school, v_receipt, p_student, p_payer_name, round(p_amount, 2), v_currency, p_method, nullif(trim(p_reference), ''),
    p_paid_at, p_notes)
  returning id into v_payment;

  if p_allocations is not null and jsonb_array_length(p_allocations) > 0 then
    for v_alloc in select * from jsonb_array_elements(p_allocations) loop
      v_amount := round((v_alloc ->> 'amount')::numeric, 2);
      select id, balance into v_inv from public.invoices
        where id = (v_alloc ->> 'invoice_id')::uuid and school_id = p_school and student_id = p_student
          and status in ('issued', 'partially_paid')
        for update;
      if not found then
        raise exception 'INVOICE_NOT_PAYABLE' using errcode = 'P0001';
      end if;
      if v_amount <= 0 or v_amount > v_inv.balance or v_amount > v_remaining then
        raise exception 'INVALID_ALLOCATION' using errcode = 'P0001';
      end if;
      insert into public.payment_allocations (school_id, payment_id, invoice_id, amount)
      values (p_school, v_payment, v_inv.id, v_amount);
      v_remaining := v_remaining - v_amount;
    end loop;
  else
    for v_inv in
      select id, balance from public.invoices
      where school_id = p_school and student_id = p_student and status in ('issued', 'partially_paid') and balance > 0
      order by due_date, issue_date, number
      for update
    loop
      exit when v_remaining <= 0;
      v_amount := least(v_inv.balance, v_remaining);
      insert into public.payment_allocations (school_id, payment_id, invoice_id, amount)
      values (p_school, v_payment, v_inv.id, v_amount);
      v_remaining := v_remaining - v_amount;
    end loop;
  end if;

  if v_remaining > 0 then
    raise exception 'OVERPAYMENT: % non affecté (aucune facture ouverte suffisante)', v_remaining using errcode = 'P0001';
  end if;

  perform private.notify_student_family(p_school, p_student, 'payment.received',
    'Paiement reçu : ' || round(p_amount, 2) || ' ' || v_currency, 'Reçu n° ' || v_receipt, '/app/finance');
  perform private.write_audit(p_school, 'create', 'payments', v_payment::text,
    jsonb_build_object('amount', p_amount, 'receipt', v_receipt));
  return v_payment;
end;
$$;

-- Reversal of an erroneous payment (all allocations released). Requires payments.validate.
create or replace function public.reverse_payment(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
begin
  select * into p from public.payments where id = p_payment for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_perm(p.school_id, 'payments.validate');
  if p.status <> 'completed' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if coalesce(char_length(trim(p_reason)), 0) < 5 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  update public.payment_allocations set is_active = false where payment_id = p.id and is_active;
  update public.payments set status = 'reversed', notes = coalesce(notes || E'\n', '') || 'Annulé : ' || p_reason where id = p.id;
  perform private.write_audit(p.school_id, 'reverse', 'payments', p.id::text, jsonb_build_object('amount', p.amount), p_reason);
end;
$$;

-- Partial or full refund: releases allocations (most recent first) for the refunded amount.
create or replace function public.refund_payment(p_payment uuid, p_amount numeric, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  v_refunded numeric(14, 2);
  v_left numeric(14, 2) := round(p_amount, 2);
  a public.payment_allocations;
  v_id uuid;
begin
  select * into p from public.payments where id = p_payment for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_perm(p.school_id, 'payments.validate');
  if p.status <> 'completed' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  select coalesce(sum(amount), 0) into v_refunded from public.refunds where payment_id = p.id;
  if p_amount is null or p_amount <= 0 or v_refunded + p_amount > p.amount then
    raise exception 'INVALID_AMOUNT: le remboursement dépasse le paiement' using errcode = '22023';
  end if;
  if coalesce(char_length(trim(p_reason)), 0) < 5 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  for a in select * from public.payment_allocations where payment_id = p.id and is_active order by created_at desc for update loop
    exit when v_left <= 0;
    if a.amount <= v_left then
      update public.payment_allocations set is_active = false where id = a.id;
      v_left := v_left - a.amount;
    else
      update public.payment_allocations set amount = a.amount - v_left where id = a.id;
      v_left := 0;
    end if;
  end loop;
  insert into public.refunds (school_id, payment_id, amount, reason) values (p.school_id, p.id, round(p_amount, 2), p_reason)
  returning id into v_id;
  perform private.write_audit(p.school_id, 'refund', 'payments', p.id::text, jsonb_build_object('amount', p_amount), p_reason);
  return v_id;
end;
$$;

-- Builds invoices for every active student of a class from the fee schedules of their level,
-- applying the student's discounts / scholarships for the year.
create or replace function public.generate_class_invoices(
  p_school uuid, p_class uuid, p_fee_schedules uuid[], p_due_date date, p_issue boolean default false
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_class public.classes;
  v_student uuid;
  v_lines jsonb;
  v_count integer := 0;
begin
  perform private.require_perm(p_school, 'invoices.create');
  select * into v_class from public.classes where id = p_class and school_id = p_school;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  for v_student in
    select e.student_id from public.enrollments e where e.class_id = p_class and e.status = 'active'
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
      'fee_type_id', fs.fee_type_id,
      'description', ft.name,
      'quantity', 1,
      'unit_amount', fs.amount,
      'discount_amount', least(fs.amount, coalesce((
        select sum(case when d.kind = 'percent' then round(fs.amount * d.value / 100, 2) else d.value end)
        from public.student_discounts sd join public.discounts d on d.id = sd.discount_id
        where sd.student_id = v_student and sd.academic_year_id = v_class.academic_year_id and d.is_active
          and (d.applies_to_category is null or d.applies_to_category = ft.category)
      ), 0))
    ) order by ft.name), '[]'::jsonb)
    into v_lines
    from public.fee_schedules fs join public.fee_types ft on ft.id = fs.fee_type_id
    where fs.id = any (p_fee_schedules) and fs.school_id = p_school
      and fs.academic_year_id = v_class.academic_year_id
      and (fs.level_id is null or fs.level_id = v_class.level_id)
      -- Skip fees already invoiced to the student for that year.
      and not exists (
        select 1 from public.invoice_lines il join public.invoices i on i.id = il.invoice_id
        where i.student_id = v_student and i.academic_year_id = v_class.academic_year_id
          and il.fee_type_id = fs.fee_type_id and i.status <> 'cancelled'
      );
    if jsonb_array_length(v_lines) > 0 then
      perform public.create_invoice(p_school, v_student, p_due_date, v_lines, v_class.academic_year_id, null, p_issue);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Messaging rules: staff may write to any member; families/students may only write to staff.
-- -----------------------------------------------------------------------------
create or replace function private.is_staff_member_of(p_school uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.roles r on r.id = m.role_id
    where m.school_id = p_school and m.user_id = p_user and m.status = 'active' and r.key not in ('student', 'parent')
  );
$$;

create or replace function public.start_thread(
  p_school uuid, p_subject text, p_recipients uuid[], p_body text, p_student uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_auth();
  v_thread uuid;
  v_r uuid;
  v_me_staff boolean;
begin
  if not private.has_any_perm(p_school, 'messages.create') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if cardinality(p_recipients) = 0 or cardinality(p_recipients) > 50 then
    raise exception 'INVALID_RECIPIENTS' using errcode = '22023';
  end if;
  v_me_staff := private.is_staff_member_of(p_school, v_me);
  foreach v_r in array p_recipients loop
    if v_r = v_me or not exists (select 1 from public.memberships where school_id = p_school and user_id = v_r and status = 'active') then
      raise exception 'INVALID_RECIPIENTS' using errcode = '22023';
    end if;
    if not v_me_staff and not private.is_staff_member_of(p_school, v_r) then
      raise exception 'FORBIDDEN: les familles ne peuvent écrire qu''au personnel' using errcode = '42501';
    end if;
  end loop;
  if p_student is not null and not private.can_access_student(p_school, p_student, 'students.read') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  insert into public.message_threads (school_id, subject, student_id, created_by) values (p_school, p_subject, p_student, v_me)
  returning id into v_thread;
  insert into public.message_participants (thread_id, user_id, last_read_at) values (v_thread, v_me, now());
  insert into public.message_participants (thread_id, user_id) select v_thread, unnest(p_recipients) on conflict do nothing;
  insert into public.messages (thread_id, school_id, sender_id, body) values (v_thread, p_school, v_me, p_body);
  return v_thread;
end;
$$;

create or replace function private.messages_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_subject text;
begin
  update public.message_threads set last_message_at = new.created_at where id = new.thread_id returning subject into v_subject;
  update public.message_participants set last_read_at = new.created_at where thread_id = new.thread_id and user_id = new.sender_id;
  for v_user in select user_id from public.message_participants where thread_id = new.thread_id and user_id <> new.sender_id loop
    perform private.notify(new.school_id, v_user, 'message.received', 'Nouveau message : ' || v_subject,
      left(new.body, 140), '/app/messages/' || new.thread_id);
  end loop;
  return new;
end;
$$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function private.messages_after_insert();

-- -----------------------------------------------------------------------------
-- Announcements
-- -----------------------------------------------------------------------------
create or replace function public.publish_announcement(p_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  a public.announcements;
  v_user uuid;
  v_count integer := 0;
begin
  select * into a from public.announcements where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_perm(a.school_id, 'announcements.publish');
  update public.announcements set status = 'published', published_at = now() where id = a.id;
  for v_user in
    select distinct m.user_id from public.memberships m join public.roles r on r.id = m.role_id
    where m.school_id = a.school_id and m.status = 'active'
      and (cardinality(a.audience_roles) = 0 or r.key = any (a.audience_roles))
      and (cardinality(a.audience_class_ids) = 0 or exists (
        select 1 from public.enrollments e join public.students s on s.id = e.student_id
        where e.class_id = any (a.audience_class_ids) and e.status = 'active' and s.user_id = m.user_id
      ) or exists (
        select 1 from public.enrollments e join public.student_guardians sg on sg.student_id = e.student_id
        join public.guardians g on g.id = sg.guardian_id
        where e.class_id = any (a.audience_class_ids) and e.status = 'active' and g.user_id = m.user_id
      ) or exists (
        select 1 from public.class_subjects cs join public.staff_members st on st.id = cs.teacher_id
        where cs.class_id = any (a.audience_class_ids) and st.user_id = m.user_id
      ))
      and m.user_id <> auth.uid()
  loop
    perform private.notify(a.school_id, v_user, case when a.priority = 'urgent' then 'announcement.urgent' else 'announcement' end,
      a.title, left(a.body, 200), '/app/announcements');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Aggregations for dashboards and reports (SECURITY INVOKER: RLS filters rows).
-- -----------------------------------------------------------------------------
create or replace function public.stats_enrollment_by_level(p_school uuid, p_year uuid)
returns table (level_id uuid, level_name text, level_position smallint, students bigint, girls bigint, boys bigint, capacity bigint)
language sql stable security invoker set search_path = '' as $$
  select l.id, l.name, l.position,
    count(e.id) filter (where e.status = 'active'),
    count(e.id) filter (where e.status = 'active' and s.gender = 'F'),
    count(e.id) filter (where e.status = 'active' and s.gender = 'M'),
    (select coalesce(sum(c2.capacity), 0) from public.classes c2 where c2.level_id = l.id and c2.academic_year_id = p_year)
  from public.levels l
  left join public.classes c on c.level_id = l.id and c.academic_year_id = p_year
  left join public.enrollments e on e.class_id = c.id
  left join public.students s on s.id = e.student_id
  where l.school_id = p_school
  group by l.id, l.name, l.position
  order by l.position;
$$;

create or replace function public.stats_attendance_daily(p_school uuid, p_from date, p_to date, p_class uuid default null)
returns table (day date, present bigint, absent bigint, late bigint, excused bigint)
language sql stable security invoker set search_path = '' as $$
  select s.date,
    count(*) filter (where r.status = 'present'),
    count(*) filter (where r.status = 'absent'),
    count(*) filter (where r.status = 'late'),
    count(*) filter (where r.status = 'excused')
  from public.attendance_sessions s join public.attendance_records r on r.session_id = s.id
  where s.school_id = p_school and s.date between p_from and p_to and (p_class is null or s.class_id = p_class)
  group by s.date order by s.date;
$$;

create or replace function public.stats_top_absentees(p_school uuid, p_from date, p_to date, p_limit integer default 10)
returns table (student_id uuid, first_name text, last_name text, class_name text, absences bigint, lates bigint, unjustified bigint)
language sql stable security invoker set search_path = '' as $$
  select st.id, st.first_name, st.last_name, c.name,
    count(*) filter (where r.status in ('absent', 'excused')),
    count(*) filter (where r.status = 'late'),
    count(*) filter (where r.status = 'absent')
  from public.attendance_records r
  join public.attendance_sessions s on s.id = r.session_id
  join public.students st on st.id = r.student_id
  join public.classes c on c.id = s.class_id
  where r.school_id = p_school and s.date between p_from and p_to and r.status <> 'present'
  group by st.id, st.first_name, st.last_name, c.name
  order by 5 desc, 6 desc
  limit least(greatest(p_limit, 1), 100);
$$;

create or replace function public.stats_class_averages(p_school uuid, p_term uuid)
returns table (class_id uuid, class_name text, average numeric, students bigint, passing bigint)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.name, round(avg(rc.average), 2), count(rc.id), count(rc.id) filter (where rc.average >= coalesce(
    (select gp.passing_mark from public.grading_policies gp where gp.school_id = p_school and gp.is_default), 10))
  from public.report_cards rc join public.classes c on c.id = rc.class_id
  where rc.school_id = p_school and rc.term_id = p_term and rc.average is not null
  group by c.id, c.name order by c.name;
$$;

create or replace function public.stats_finance_summary(p_school uuid, p_year uuid default null)
returns table (billed numeric, collected numeric, outstanding numeric, overdue numeric, invoices bigint, overdue_invoices bigint)
language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(total), 0), coalesce(sum(amount_paid), 0), coalesce(sum(balance), 0),
    coalesce(sum(balance) filter (where due_date < current_date), 0),
    count(*), count(*) filter (where due_date < current_date and balance > 0)
  from public.invoices
  where school_id = p_school and status in ('issued', 'partially_paid', 'paid')
    and (p_year is null or academic_year_id = p_year);
$$;

-- Net collections (completed payments minus refunds) and approved expenses per month.
create or replace function public.stats_monthly_cashflow(p_school uuid, p_from date, p_to date)
returns table (month date, collected numeric, spent numeric)
language sql stable security invoker set search_path = '' as $$
  with months as (
    select generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month')::date as m
  )
  select m.m,
    coalesce((select sum(p.amount) from public.payments p
              where p.school_id = p_school and p.status = 'completed' and date_trunc('month', p.paid_at)::date = m.m), 0)
    - coalesce((select sum(rf.amount) from public.refunds rf
                where rf.school_id = p_school and date_trunc('month', rf.created_at)::date = m.m), 0),
    coalesce((select sum(e.amount) from public.expenses e where e.school_id = p_school and e.status in ('approved', 'paid')
              and date_trunc('month', e.spent_on)::date = m.m), 0)
  from months m order by m.m;
$$;

create or replace function public.stats_expenses_by_category(p_school uuid, p_year uuid)
returns table (category_id uuid, category_name text, spent numeric, budget numeric)
language sql stable security invoker set search_path = '' as $$
  select ec.id, ec.name,
    coalesce((select sum(e.amount) from public.expenses e where e.category_id = ec.id and e.status in ('approved', 'paid')
              and (e.academic_year_id = p_year or e.academic_year_id is null)), 0),
    (select b.amount from public.budgets b where b.category_id = ec.id and b.academic_year_id = p_year)
  from public.expense_categories ec where ec.school_id = p_school order by ec.name;
$$;

-- Students whose file misses a mandatory document or a guardian (secretariat follow-up).
create or replace function public.incomplete_student_files(p_school uuid, p_limit integer default 50)
returns table (student_id uuid, first_name text, last_name text, matricule text, missing text[])
language sql stable security invoker set search_path = '' as $$
  select s.id, s.first_name, s.last_name, s.matricule,
    array_remove(
      array(select rdt.name from public.required_document_types rdt
            where rdt.school_id = p_school and rdt.applies_to = 'student' and rdt.is_mandatory
              and not exists (select 1 from public.documents d where d.student_id = s.id and d.document_type_id = rdt.id and d.deleted_at is null))
      || case when not exists (select 1 from public.student_guardians sg where sg.student_id = s.id) then array['Responsable légal'] else '{}'::text[] end
      || case when s.birth_date is null then array['Date de naissance'] else '{}'::text[] end,
      null)
  from public.students s
  where s.school_id = p_school and s.status = 'active'
    and (
      exists (select 1 from public.required_document_types rdt
              where rdt.school_id = p_school and rdt.applies_to = 'student' and rdt.is_mandatory
                and not exists (select 1 from public.documents d where d.student_id = s.id and d.document_type_id = rdt.id and d.deleted_at is null))
      or not exists (select 1 from public.student_guardians sg where sg.student_id = s.id)
      or s.birth_date is null
    )
  order by s.last_name, s.first_name
  limit least(greatest(p_limit, 1), 500);
$$;

-- -----------------------------------------------------------------------------
-- Function privileges: nothing is callable anonymously.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.bootstrap_platform_admin(uuid) from authenticated;
revoke execute on function public.consume_rate_limit(text, integer, integer, integer) from authenticated;
revoke execute on function public.reset_rate_limit(text) from authenticated;
