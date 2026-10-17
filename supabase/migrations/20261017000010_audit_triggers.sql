-- =============================================================================
-- EduDigi — Row-level audit on sensitive tables. Redacted columns are listed as
-- trigger arguments so medical/financial details never land in the audit log.
-- =============================================================================

create trigger audit_students after insert or update or delete on public.students
  for each row execute function private.audit_row('notes');
create trigger audit_student_health after insert or update or delete on public.student_health
  for each row execute function private.audit_row('blood_group', 'allergies', 'conditions', 'medications', 'doctor_contact');
create trigger audit_student_guardians after insert or update or delete on public.student_guardians
  for each row execute function private.audit_row();
create trigger audit_enrollments after insert or update or delete on public.enrollments
  for each row execute function private.audit_row();
create trigger audit_memberships after insert or update or delete on public.memberships
  for each row execute function private.audit_row();
create trigger audit_role_permissions after insert or update or delete on public.role_permissions
  for each row execute function private.audit_row();
create trigger audit_roles after insert or update or delete on public.roles
  for each row execute function private.audit_row();
create trigger audit_staff_contracts after insert or update or delete on public.staff_contracts
  for each row execute function private.audit_row('monthly_salary');
create trigger audit_staff_evaluations after insert or update or delete on public.staff_evaluations
  for each row execute function private.audit_row('strengths', 'improvements');
create trigger audit_grades after update or delete on public.grades
  for each row execute function private.audit_row();
create trigger audit_attendance_records after update or delete on public.attendance_records
  for each row execute function private.audit_row();
create trigger audit_invoices after insert or update or delete on public.invoices
  for each row execute function private.audit_row();
create trigger audit_payments after update or delete on public.payments
  for each row execute function private.audit_row();
create trigger audit_expenses after insert or update or delete on public.expenses
  for each row execute function private.audit_row();
create trigger audit_budgets after insert or update or delete on public.budgets
  for each row execute function private.audit_row();
create trigger audit_schools after update on public.schools
  for each row execute function private.audit_row();
create trigger audit_documents after insert or update or delete on public.documents
  for each row execute function private.audit_row();

-- role_permissions has no school_id column: resolve it from the role.
create or replace function private.audit_role_permissions_school() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.audit_logs set school_id = (select school_id from public.roles where id = coalesce(new.role_id, old.role_id))
  where id = (select max(id) from public.audit_logs where entity_type = 'role_permissions') and school_id is null;
  return coalesce(new, old);
end;
$$;
create trigger audit_role_permissions_school after insert or update or delete on public.role_permissions
  for each row execute function private.audit_role_permissions_school();
