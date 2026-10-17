-- =============================================================================
-- Security hardening (audit of 2026-10-18)
--
-- 1. Role administration: no self-escalation (cannot edit the permissions of a
--    role you hold, nor assign a role to yourself), the school_admin role is
--    locked, and sensitive permissions can only be granted by a school admin.
-- 2. Platform-owned school columns (slug, status, is_demo) are reserved to
--    platform administrators.
-- 3. Computed / workflow columns are no longer writable through the API
--    (report card results, invoice numbers, approval stamps, file paths…).
-- 4. Actor columns (author, evaluator, recorder…) are stamped with auth.uid()
--    so they cannot be spoofed.
-- 5. Expense workflow (transitions, no self-approval) enforced in the database.
--
-- Triggers only apply to direct API writes (current_user = 'authenticated');
-- SECURITY DEFINER business functions run as their owner and keep their own
-- explicit checks.
-- =============================================================================

create or replace function private.is_school_admin(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.roles r on r.id = m.role_id
    where m.school_id = p_school and m.user_id = auth.uid() and m.status = 'active' and r.key = 'school_admin'
  );
$$;

-- -----------------------------------------------------------------------------
-- 1. Role administration
-- -----------------------------------------------------------------------------
create or replace function private.assert_can_edit_role_permission(p_role uuid, p_perm text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.roles;
begin
  select * into v_role from public.roles where id = p_role;
  if v_role.key = 'school_admin' then
    raise exception 'FORBIDDEN: le rôle administrateur d''établissement n''est pas modifiable' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.memberships m
    where m.school_id = v_role.school_id and m.user_id = auth.uid() and m.role_id = v_role.id and m.status = 'active'
  ) and not private.is_school_admin(v_role.school_id) then
    raise exception 'FORBIDDEN: impossible de modifier les permissions d''un rôle que vous détenez' using errcode = '42501';
  end if;
  if exists (select 1 from public.permissions p where p.key = p_perm and p.sensitive)
     and not private.is_school_admin(v_role.school_id) then
    raise exception 'FORBIDDEN: seule l''administration de l''établissement peut accorder une permission sensible' using errcode = '42501';
  end if;
end;
$$;

-- Guard triggers are SECURITY INVOKER on purpose: current_user is then
-- 'authenticated' for direct API writes and the function owner when the write
-- comes from a SECURITY DEFINER business function (which has its own checks).
create or replace function private.role_permissions_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    perform private.assert_can_edit_role_permission(coalesce(new.role_id, old.role_id), coalesce(new.permission_key, old.permission_key));
  end if;
  return coalesce(new, old);
end;
$$;

create trigger role_permissions_guard before insert or update or delete on public.role_permissions
  for each row execute function private.role_permissions_guard();

revoke update (key, is_privileged) on public.roles from authenticated;

create or replace function public.assign_role(p_school uuid, p_user uuid, p_role uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_perm(p_school, 'users.manage');
  perform private.assert_can_grant_role(p_school, p_role);
  if p_user = auth.uid() and not private.is_school_admin(p_school) then
    raise exception 'FORBIDDEN: impossible de s''attribuer un rôle' using errcode = '42501';
  end if;
  if not exists (select 1 from public.memberships where school_id = p_school and user_id = p_user) then
    raise exception 'NOT_FOUND: utilisateur non membre (utilisez une invitation)' using errcode = 'P0002';
  end if;
  insert into public.memberships (school_id, user_id, role_id, created_by) values (p_school, p_user, p_role, auth.uid())
  on conflict (school_id, user_id, role_id) do update set status = 'active';
  perform private.write_audit(p_school, 'assign_role', 'memberships', p_user::text, jsonb_build_object('role_id', p_role));
end;
$$;
revoke execute on function public.assign_role(uuid, uuid, uuid) from public, anon;
grant execute on function public.assign_role(uuid, uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Platform-owned school columns
-- -----------------------------------------------------------------------------
create or replace function private.schools_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user = 'authenticated' and not private.is_platform_admin()
     and (old.slug, old.status, old.is_demo) is distinct from (new.slug, new.status, new.is_demo) then
    raise exception 'FORBIDDEN: identifiant, statut et mode démonstration sont gérés par la plateforme' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger schools_guard before update on public.schools for each row execute function private.schools_guard();

-- -----------------------------------------------------------------------------
-- 3. Columns that only business functions may write
-- -----------------------------------------------------------------------------
revoke update (student_id, term_id, class_id, average, rank, class_size, class_average, mention, absences_count,
  lates_count, status, generated_at, generated_by, validated_by, published_at) on public.report_cards from authenticated;
revoke update (number, currency, subtotal, discount_total, total, amount_paid, status, cancelled_reason)
  on public.invoices from authenticated;
revoke update (validated_by, validated_at, published_at) on public.assessments from authenticated;
revoke update (published_at, author_id) on public.announcements from authenticated;
revoke update (category, student_id, staff_id, storage_path, mime_type, size_bytes, sha256)
  on public.documents from authenticated;
revoke update (reconciled_by) on public.payments from authenticated;
revoke update (evaluator_id) on public.staff_evaluations from authenticated;
revoke update (granted_by) on public.student_discounts from authenticated;

-- The uploader may withdraw a document they have just created (failed upload clean-up).
create policy documents_uploader_withdraw on public.documents
  for update to authenticated
  using (uploaded_by = auth.uid() and created_at > now() - interval '15 minutes')
  with check (uploaded_by = auth.uid() and deleted_at is not null);

-- -----------------------------------------------------------------------------
-- 4. Actor stamping
-- -----------------------------------------------------------------------------
create or replace function private.stamp_actor() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_col text;
begin
  if current_user = 'authenticated' then
    foreach v_col in array tg_argv loop
      new := jsonb_populate_record(new, jsonb_build_object(v_col, auth.uid()));
    end loop;
  end if;
  return new;
end;
$$;

create trigger announcements_stamp before insert on public.announcements
  for each row execute function private.stamp_actor('author_id');
create trigger staff_evaluations_stamp before insert on public.staff_evaluations
  for each row execute function private.stamp_actor('evaluator_id');
create trigger student_discounts_stamp before insert on public.student_discounts
  for each row execute function private.stamp_actor('granted_by');
create trigger staff_attendance_stamp before insert or update on public.staff_attendance
  for each row execute function private.stamp_actor('recorded_by');
create trigger attendance_sessions_stamp before insert or update on public.attendance_sessions
  for each row execute function private.stamp_actor('taken_by');
create trigger attendance_records_stamp before insert or update on public.attendance_records
  for each row execute function private.stamp_actor('updated_by');
create trigger grades_stamp before insert or update on public.grades
  for each row execute function private.stamp_actor('updated_by');
create trigger payments_reconcile_stamp before update of reconciled on public.payments
  for each row execute function private.stamp_actor('reconciled_by');

-- -----------------------------------------------------------------------------
-- 5. Expense workflow
-- -----------------------------------------------------------------------------
create or replace function private.expenses_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.status is distinct from old.status then
    if not ((old.status = 'pending' and new.status in ('approved', 'rejected')) or (old.status = 'approved' and new.status = 'paid')) then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;
    if new.status = 'approved' then
      if old.requested_by = auth.uid() and not private.has_perm(old.school_id, 'school.manage') then
        raise exception 'FORBIDDEN: une dépense ne peut pas être approuvée par la personne qui l''a saisie' using errcode = '42501';
      end if;
      new.approved_by := auth.uid();
      new.approved_at := now();
    else
      new.approved_by := old.approved_by;
      new.approved_at := old.approved_at;
    end if;
  else
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
    if old.status in ('approved', 'paid') and (old.amount, old.category_id) is distinct from (new.amount, new.category_id) then
      raise exception 'INVALID_TRANSITION: dépense déjà approuvée' using errcode = 'P0001';
    end if;
  end if;
  new.requested_by := old.requested_by;
  return new;
end;
$$;
create trigger expenses_guard before update on public.expenses for each row execute function private.expenses_guard();
