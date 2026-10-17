-- =============================================================================
-- EduDigi — Contextual access helpers and Row Level Security policies.
-- Every table exposed through the Data API has RLS enabled. Policies combine:
--   * tenant membership (school_id),
--   * RBAC permission keys,
--   * permission scope (school / assigned / linked / self).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Identity helpers
-- -----------------------------------------------------------------------------
create or replace function private.my_staff_id(p_school uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.staff_members s
  where s.school_id = p_school and s.user_id = auth.uid() and s.deleted_at is null
  limit 1;
$$;

create or replace function private.my_guardian_id(p_school uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select g.id from public.guardians g where g.school_id = p_school and g.user_id = auth.uid() limit 1;
$$;

create or replace function private.my_student_id(p_school uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.students s where s.school_id = p_school and s.user_id = auth.uid() limit 1;
$$;

-- Teacher of a subject in the class, or homeroom teacher of the class.
create or replace function private.teaches_class(p_class uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.class_subjects cs
    join public.staff_members st on st.id = cs.teacher_id
    where cs.class_id = p_class and st.user_id = auth.uid() and st.deleted_at is null
  ) or exists (
    select 1 from public.classes c
    join public.staff_members st on st.id = c.homeroom_staff_id
    where c.id = p_class and st.user_id = auth.uid() and st.deleted_at is null
  );
$$;

-- Strict: the user is the teacher of this exact subject in this class.
create or replace function private.teaches_class_subject(p_class_subject uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.class_subjects cs
    join public.staff_members st on st.id = cs.teacher_id
    where cs.id = p_class_subject and st.user_id = auth.uid() and st.deleted_at is null
  );
$$;

create or replace function private.is_guardian_of(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.student_guardians sg
    join public.guardians g on g.id = sg.guardian_id
    where sg.student_id = p_student and g.user_id = auth.uid()
  );
$$;

create or replace function private.is_student_self(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.students s where s.id = p_student and s.user_id = auth.uid());
$$;

-- The student is actively enrolled in a class the user teaches.
create or replace function private.student_in_my_classes(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enrollments e
    where e.student_id = p_student and e.status = 'active' and e.class_id is not null
      and private.teaches_class(e.class_id)
  );
$$;

-- The class contains a child of the guardian (linked) or the student himself (self).
create or replace function private.class_has_my_child(p_class uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enrollments e
    where e.class_id = p_class and e.status = 'active' and private.is_guardian_of(e.student_id)
  );
$$;

create or replace function private.class_has_me(p_class uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enrollments e
    join public.students s on s.id = e.student_id
    where e.class_id = p_class and e.status = 'active' and s.user_id = auth.uid()
  );
$$;

-- -----------------------------------------------------------------------------
-- Scoped access helpers
-- -----------------------------------------------------------------------------
create or replace function private.can_access_student(p_school uuid, p_student uuid, p_perm text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_scopes text[] := private.perm_scopes(p_school, p_perm);
begin
  if cardinality(v_scopes) = 0 then
    return false;
  end if;
  if 'school' = any (v_scopes) then
    return true;
  end if;
  if 'assigned' = any (v_scopes) and private.student_in_my_classes(p_student) then
    return true;
  end if;
  if 'linked' = any (v_scopes) and private.is_guardian_of(p_student) then
    return true;
  end if;
  if 'self' = any (v_scopes) and private.is_student_self(p_student) then
    return true;
  end if;
  return false;
end;
$$;

-- p_strict = true requires teaching this subject (write access); false accepts homeroom/any subject in the class.
create or replace function private.can_access_class_subject(p_school uuid, p_class_subject uuid, p_perm text, p_strict boolean default false)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_scopes text[] := private.perm_scopes(p_school, p_perm);
  v_class uuid;
begin
  if cardinality(v_scopes) = 0 then
    return false;
  end if;
  if 'school' = any (v_scopes) then
    return true;
  end if;
  select class_id into v_class from public.class_subjects where id = p_class_subject and school_id = p_school;
  if v_class is null then
    return false;
  end if;
  if 'assigned' = any (v_scopes) then
    if private.teaches_class_subject(p_class_subject) then
      return true;
    end if;
    if not p_strict and private.teaches_class(v_class) then
      return true;
    end if;
  end if;
  if not p_strict and 'linked' = any (v_scopes) and private.class_has_my_child(v_class) then
    return true;
  end if;
  if not p_strict and 'self' = any (v_scopes) and private.class_has_me(v_class) then
    return true;
  end if;
  return false;
end;
$$;

create or replace function private.can_access_class(p_school uuid, p_class uuid, p_perm text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_scopes text[] := private.perm_scopes(p_school, p_perm);
begin
  if cardinality(v_scopes) = 0 then
    return false;
  end if;
  if 'school' = any (v_scopes) then
    return true;
  end if;
  if 'assigned' = any (v_scopes) and private.teaches_class(p_class) then
    return true;
  end if;
  if 'linked' = any (v_scopes) and private.class_has_my_child(p_class) then
    return true;
  end if;
  if 'self' = any (v_scopes) and private.class_has_me(p_class) then
    return true;
  end if;
  return false;
end;
$$;

create or replace function private.can_access_staff(p_school uuid, p_staff uuid, p_perm text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_scopes text[] := private.perm_scopes(p_school, p_perm);
begin
  if 'school' = any (v_scopes) then
    return true;
  end if;
  if 'self' = any (v_scopes) and exists (
    select 1 from public.staff_members s where s.id = p_staff and s.user_id = auth.uid()
  ) then
    return true;
  end if;
  return false;
end;
$$;

-- Grades: students and guardians only see grades of published assessments.
create or replace function private.can_read_grade(p_school uuid, p_assessment uuid, p_student uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_scopes text[] := private.perm_scopes(p_school, 'grades.read');
  v_assessment record;
begin
  if cardinality(v_scopes) = 0 then
    return false;
  end if;
  if 'school' = any (v_scopes) then
    return true;
  end if;
  select class_subject_id, status into v_assessment from public.assessments where id = p_assessment;
  if 'assigned' = any (v_scopes) and private.can_access_class_subject(p_school, v_assessment.class_subject_id, 'grades.read', false) then
    return true;
  end if;
  if v_assessment.status <> 'published' then
    return false;
  end if;
  if 'linked' = any (v_scopes) and private.is_guardian_of(p_student) then
    return true;
  end if;
  if 'self' = any (v_scopes) and private.is_student_self(p_student) then
    return true;
  end if;
  return false;
end;
$$;

create or replace function private.can_write_grades(p_school uuid, p_assessment uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cs uuid;
begin
  select class_subject_id into v_cs from public.assessments where id = p_assessment and school_id = p_school;
  if v_cs is null then
    return false;
  end if;
  return private.can_access_class_subject(p_school, v_cs, 'grades.create', true);
end;
$$;

-- Report cards and invoices: families only see published / issued documents.
create or replace function private.can_read_family_scoped(p_school uuid, p_student uuid, p_perm text, p_family_visible boolean)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_scopes text[] := private.perm_scopes(p_school, p_perm);
begin
  if 'school' = any (v_scopes) then
    return true;
  end if;
  if 'assigned' = any (v_scopes) and private.student_in_my_classes(p_student) then
    return true;
  end if;
  if not p_family_visible then
    return false;
  end if;
  if 'linked' = any (v_scopes) and private.is_guardian_of(p_student) then
    return true;
  end if;
  if 'self' = any (v_scopes) and private.is_student_self(p_student) then
    return true;
  end if;
  return false;
end;
$$;

create or replace function private.can_read_document(p_doc uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  d public.documents;
  v_scopes text[];
begin
  select * into d from public.documents where id = p_doc;
  if not found or d.deleted_at is not null then
    return false;
  end if;
  if d.uploaded_by = auth.uid() then
    return true;
  end if;
  if d.staff_id is not null then
    return private.has_perm(d.school_id, 'hr.read')
      or exists (select 1 from public.staff_members s where s.id = d.staff_id and s.user_id = auth.uid());
  end if;
  if d.student_id is not null then
    v_scopes := private.perm_scopes(d.school_id, 'documents.read');
    if 'school' = any (v_scopes) then
      return true;
    end if;
    if 'assigned' = any (v_scopes) and private.student_in_my_classes(d.student_id) then
      return true;
    end if;
    if d.visible_to_family and 'linked' = any (v_scopes) and private.is_guardian_of(d.student_id) then
      return true;
    end if;
    if d.visible_to_family and 'self' = any (v_scopes) and private.is_student_self(d.student_id) then
      return true;
    end if;
    return false;
  end if;
  return private.has_perm(d.school_id, 'documents.read');
end;
$$;

create or replace function private.has_role_key(p_school uuid, p_keys text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.roles r on r.id = m.role_id
    where m.school_id = p_school and m.user_id = auth.uid() and m.status = 'active' and r.key = any (p_keys)
  );
$$;

create or replace function private.can_see_announcement(p_school uuid, p_roles text[], p_classes uuid[]) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_class uuid;
begin
  if not private.is_member(p_school) then
    return false;
  end if;
  if cardinality(p_roles) > 0 and not private.has_role_key(p_school, p_roles) then
    return false;
  end if;
  if cardinality(p_classes) = 0 then
    return true;
  end if;
  foreach v_class in array p_classes loop
    if private.has_perm(p_school, 'announcements.create')
       or private.teaches_class(v_class) or private.class_has_my_child(v_class) or private.class_has_me(v_class) then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

create or replace function private.is_my_guardian_record(p_guardian uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.guardians g where g.id = p_guardian and g.user_id = auth.uid());
$$;

create or replace function private.guardian_of_my_students(p_guardian uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.student_guardians sg
    where sg.guardian_id = p_guardian and private.student_in_my_classes(sg.student_id)
  );
$$;

create or replace function private.is_thread_participant(p_thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.message_participants p where p.thread_id = p_thread and p.user_id = auth.uid());
$$;

-- Grades may only be recorded for students actively enrolled in the assessment's class.
create or replace function private.grades_enrollment_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.assessments a
    join public.class_subjects cs on cs.id = a.class_subject_id
    join public.enrollments e on e.class_id = cs.class_id and e.student_id = new.student_id
    where a.id = new.assessment_id and e.status in ('active', 'completed', 'transferred')
  ) then
    raise exception 'STUDENT_NOT_IN_CLASS: l''élève n''est pas inscrit dans cette classe' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger grades_enrollment_check before insert on public.grades
  for each row execute function private.grades_enrollment_check();

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'academic_years', 'terms', 'cycles', 'levels', 'subjects', 'rooms', 'staff_members', 'staff_qualifications',
    'staff_contracts', 'staff_evaluations', 'leave_requests', 'staff_attendance', 'classes', 'class_groups',
    'class_subjects', 'students', 'student_health', 'guardians', 'student_guardians', 'emergency_contacts',
    'enrollments', 'class_group_members', 'required_document_types', 'bell_periods', 'timetable_entries',
    'timetable_substitutions', 'grading_policies', 'assessment_types', 'exam_sessions', 'assessments', 'grades',
    'grade_revisions', 'report_cards', 'report_card_lines', 'attendance_sessions', 'absence_justifications',
    'attendance_records', 'attendance_record_history', 'fee_types', 'fee_schedules', 'discounts',
    'student_discounts', 'payment_methods', 'invoices', 'invoice_lines', 'invoice_installments', 'payments',
    'payment_allocations', 'refunds', 'suppliers', 'expense_categories', 'expenses', 'budgets', 'announcements',
    'notifications', 'notification_preferences', 'outbound_messages', 'message_threads', 'message_participants',
    'messages', 'document_templates', 'documents', 'admin_requests', 'ai_conversations', 'ai_messages',
    'ai_tool_invocations'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Reference data readable by every member, writable with a management permission
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select * from (values
    ('academic_years', 'academics.manage'),
    ('terms', 'academics.manage'),
    ('cycles', 'academics.manage'),
    ('levels', 'academics.manage'),
    ('subjects', 'academics.manage'),
    ('rooms', 'academics.manage'),
    ('classes', 'academics.manage'),
    ('class_groups', 'academics.manage'),
    ('class_subjects', 'academics.manage'),
    ('bell_periods', 'timetable.manage'),
    ('grading_policies', 'academics.manage'),
    ('assessment_types', 'academics.manage'),
    ('exam_sessions', 'academics.manage'),
    ('required_document_types', 'academics.manage'),
    ('fee_types', 'finance.manage'),
    ('fee_schedules', 'finance.manage'),
    ('discounts', 'finance.manage'),
    ('payment_methods', 'finance.manage'),
    ('staff_members', 'staff.manage')
  ) as v(tbl, perm) loop
    execute format('create policy %I on public.%I for select to authenticated using (private.is_member(school_id))',
      r.tbl || '_member_read', r.tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.has_perm(school_id, %L))',
      r.tbl || '_manage_insert', r.tbl, r.perm);
    execute format('create policy %I on public.%I for update to authenticated using (private.has_perm(school_id, %L)) with check (private.has_perm(school_id, %L))',
      r.tbl || '_manage_update', r.tbl, r.perm, r.perm);
    execute format('create policy %I on public.%I for delete to authenticated using (private.has_perm(school_id, %L))',
      r.tbl || '_manage_delete', r.tbl, r.perm);
  end loop;
end $$;

-- System roles cannot be renamed or deleted; custom roles are managed with roles.manage.
drop policy roles_manage on public.roles;
create policy roles_insert on public.roles
  for insert to authenticated with check (private.has_perm(school_id, 'roles.manage') and not is_system);
create policy roles_update on public.roles
  for update to authenticated using (private.has_perm(school_id, 'roles.manage') and not is_system)
  with check (private.has_perm(school_id, 'roles.manage') and not is_system);
create policy roles_delete on public.roles
  for delete to authenticated using (private.has_perm(school_id, 'roles.manage') and not is_system);

-- -----------------------------------------------------------------------------
-- Timetable
-- -----------------------------------------------------------------------------
create policy timetable_entries_read on public.timetable_entries
  for select to authenticated using (private.can_access_class(school_id, class_id, 'timetable.read'));
create policy timetable_entries_write on public.timetable_entries
  for all to authenticated using (private.has_perm(school_id, 'timetable.manage'))
  with check (private.has_perm(school_id, 'timetable.manage'));

create policy timetable_substitutions_read on public.timetable_substitutions
  for select to authenticated using (
    exists (select 1 from public.timetable_entries te where te.id = timetable_entry_id
            and private.can_access_class(te.school_id, te.class_id, 'timetable.read'))
  );
create policy timetable_substitutions_write on public.timetable_substitutions
  for all to authenticated using (private.has_perm(school_id, 'timetable.manage'))
  with check (private.has_perm(school_id, 'timetable.manage'));

-- -----------------------------------------------------------------------------
-- Students and families
-- -----------------------------------------------------------------------------
create policy students_read on public.students
  for select to authenticated using (private.can_access_student(school_id, id, 'students.read'));
create policy students_insert on public.students
  for insert to authenticated with check (private.has_perm(school_id, 'students.create'));
create policy students_update on public.students
  for update to authenticated using (private.has_perm(school_id, 'students.update'))
  with check (private.has_perm(school_id, 'students.update'));
create policy students_delete on public.students
  for delete to authenticated using (private.has_perm(school_id, 'students.delete'));

create policy student_health_read on public.student_health
  for select to authenticated using (private.can_access_student(school_id, student_id, 'health.read'));
create policy student_health_write on public.student_health
  for all to authenticated
  using (private.has_perm(school_id, 'health.read') and private.has_perm(school_id, 'students.update'))
  with check (private.has_perm(school_id, 'health.read') and private.has_perm(school_id, 'students.update'));

create policy guardians_read on public.guardians
  for select to authenticated using (
    user_id = auth.uid()
    or private.has_perm(school_id, 'guardians.read')
    or ('assigned' = any (private.perm_scopes(school_id, 'guardians.read')) and private.guardian_of_my_students(id))
  );
create policy guardians_manage on public.guardians
  for all to authenticated using (private.has_perm(school_id, 'guardians.manage'))
  with check (private.has_perm(school_id, 'guardians.manage'));
create policy guardians_self_update on public.guardians
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy student_guardians_read on public.student_guardians
  for select to authenticated using (
    private.can_access_student(school_id, student_id, 'students.read')
    or private.is_my_guardian_record(guardian_id)
  );
create policy student_guardians_manage on public.student_guardians
  for all to authenticated using (private.has_perm(school_id, 'guardians.manage'))
  with check (private.has_perm(school_id, 'guardians.manage'));

create policy emergency_contacts_read on public.emergency_contacts
  for select to authenticated using (private.can_access_student(school_id, student_id, 'students.read'));
create policy emergency_contacts_manage on public.emergency_contacts
  for all to authenticated using (private.has_perm(school_id, 'students.update'))
  with check (private.has_perm(school_id, 'students.update'));

create policy enrollments_read on public.enrollments
  for select to authenticated using (private.can_access_student(school_id, student_id, 'students.read'));
create policy enrollments_manage on public.enrollments
  for all to authenticated using (private.has_perm(school_id, 'enrollments.manage'))
  with check (private.has_perm(school_id, 'enrollments.manage'));

create policy class_group_members_read on public.class_group_members
  for select to authenticated using (private.can_access_student(school_id, student_id, 'students.read'));
create policy class_group_members_manage on public.class_group_members
  for all to authenticated using (private.has_perm(school_id, 'academics.manage'))
  with check (private.has_perm(school_id, 'academics.manage'));

-- -----------------------------------------------------------------------------
-- Staff / HR
-- -----------------------------------------------------------------------------
create policy staff_qualifications_read on public.staff_qualifications
  for select to authenticated using (private.can_access_staff(school_id, staff_id, 'staff.read'));
create policy staff_qualifications_manage on public.staff_qualifications
  for all to authenticated using (private.has_perm(school_id, 'staff.manage'))
  with check (private.has_perm(school_id, 'staff.manage'));

create policy staff_contracts_read on public.staff_contracts
  for select to authenticated using (private.can_access_staff(school_id, staff_id, 'hr.read'));
create policy staff_contracts_manage on public.staff_contracts
  for all to authenticated using (private.has_perm(school_id, 'hr.manage'))
  with check (private.has_perm(school_id, 'hr.manage'));

create policy staff_evaluations_read on public.staff_evaluations
  for select to authenticated using (private.can_access_staff(school_id, staff_id, 'hr.read'));
create policy staff_evaluations_manage on public.staff_evaluations
  for all to authenticated using (private.has_perm(school_id, 'hr.manage'))
  with check (private.has_perm(school_id, 'hr.manage'));

create policy leave_requests_read on public.leave_requests
  for select to authenticated using (private.can_access_staff(school_id, staff_id, 'leaves.read'));
create policy leave_requests_insert on public.leave_requests
  for insert to authenticated with check (
    status = 'pending' and (
      private.has_perm(school_id, 'leaves.create')
      or ('self' = any (private.perm_scopes(school_id, 'leaves.create')) and staff_id = private.my_staff_id(school_id))
    )
  );
-- Review/cancellation goes through public.review_leave_request / public.cancel_leave_request.

create policy staff_attendance_read on public.staff_attendance
  for select to authenticated using (private.can_access_staff(school_id, staff_id, 'staff.read'));
create policy staff_attendance_manage on public.staff_attendance
  for all to authenticated using (private.has_perm(school_id, 'staff.manage'))
  with check (private.has_perm(school_id, 'staff.manage'));

-- -----------------------------------------------------------------------------
-- Assessments, grades, report cards
-- -----------------------------------------------------------------------------
create policy assessments_read on public.assessments
  for select to authenticated using (private.can_access_class_subject(school_id, class_subject_id, 'assessments.read', false));
create policy assessments_insert on public.assessments
  for insert to authenticated with check (private.can_access_class_subject(school_id, class_subject_id, 'assessments.create', true));
create policy assessments_update on public.assessments
  for update to authenticated
  using (private.can_access_class_subject(school_id, class_subject_id, 'assessments.update', true))
  with check (private.can_access_class_subject(school_id, class_subject_id, 'assessments.update', true));
create policy assessments_delete on public.assessments
  for delete to authenticated using (private.can_access_class_subject(school_id, class_subject_id, 'assessments.delete', true));

create policy grades_read on public.grades
  for select to authenticated using (private.can_read_grade(school_id, assessment_id, student_id));
create policy grades_insert on public.grades
  for insert to authenticated with check (private.can_write_grades(school_id, assessment_id));
create policy grades_update on public.grades
  for update to authenticated using (private.can_write_grades(school_id, assessment_id))
  with check (private.can_write_grades(school_id, assessment_id));
create policy grades_delete on public.grades
  for delete to authenticated using (private.can_write_grades(school_id, assessment_id));

create policy grade_revisions_read on public.grade_revisions
  for select to authenticated using (
    private.has_perm(school_id, 'grades.validate')
    or exists (select 1 from public.assessments a where a.id = assessment_id
               and private.can_access_class_subject(a.school_id, a.class_subject_id, 'grades.create', true))
  );

create policy report_cards_read on public.report_cards
  for select to authenticated using (
    private.can_read_family_scoped(school_id, student_id, 'report_cards.read', status = 'published')
  );
create policy report_cards_update on public.report_cards
  for update to authenticated
  using (status = 'draft' and private.has_perm(school_id, 'report_cards.create'))
  with check (status = 'draft' and private.has_perm(school_id, 'report_cards.create'));

create policy report_card_lines_read on public.report_card_lines
  for select to authenticated using (
    exists (select 1 from public.report_cards rc where rc.id = report_card_id
            and private.can_read_family_scoped(rc.school_id, rc.student_id, 'report_cards.read', rc.status = 'published'))
  );
create policy report_card_lines_update on public.report_card_lines
  for update to authenticated using (
    exists (select 1 from public.report_cards rc where rc.id = report_card_id and rc.status = 'draft'
            and (private.has_perm(rc.school_id, 'report_cards.create')
                 or exists (select 1 from public.class_subjects cs where cs.class_id = rc.class_id
                            and cs.subject_id = report_card_lines.subject_id and private.teaches_class_subject(cs.id))))
  );

-- -----------------------------------------------------------------------------
-- Attendance
-- -----------------------------------------------------------------------------
create policy attendance_sessions_read on public.attendance_sessions
  for select to authenticated using (private.can_access_class(school_id, class_id, 'attendance.read'));
create policy attendance_sessions_write on public.attendance_sessions
  for insert to authenticated with check (private.can_access_class(school_id, class_id, 'attendance.create'));
create policy attendance_sessions_update on public.attendance_sessions
  for update to authenticated using (private.can_access_class(school_id, class_id, 'attendance.update'))
  with check (private.can_access_class(school_id, class_id, 'attendance.update'));

create policy attendance_records_read on public.attendance_records
  for select to authenticated using (private.can_access_student(school_id, student_id, 'attendance.read'));
create policy attendance_records_insert on public.attendance_records
  for insert to authenticated with check (
    exists (select 1 from public.attendance_sessions s where s.id = session_id
            and private.can_access_class(s.school_id, s.class_id, 'attendance.create'))
  );
create policy attendance_records_update on public.attendance_records
  for update to authenticated using (
    exists (select 1 from public.attendance_sessions s where s.id = session_id
            and private.can_access_class(s.school_id, s.class_id, 'attendance.update'))
  ) with check (
    exists (select 1 from public.attendance_sessions s where s.id = session_id
            and private.can_access_class(s.school_id, s.class_id, 'attendance.update'))
  );

create policy attendance_record_history_read on public.attendance_record_history
  for select to authenticated using (private.has_perm(school_id, 'attendance.update'));

create policy absence_justifications_read on public.absence_justifications
  for select to authenticated using (
    submitted_by = auth.uid() or private.can_access_student(school_id, student_id, 'attendance.read')
  );
create policy absence_justifications_insert on public.absence_justifications
  for insert to authenticated with check (
    status = 'pending' and submitted_by = auth.uid()
    and private.can_access_student(school_id, student_id, 'justifications.create')
  );
-- Review goes through public.review_absence_justification.

-- -----------------------------------------------------------------------------
-- Finance
-- -----------------------------------------------------------------------------
create policy student_discounts_read on public.student_discounts
  for select to authenticated using (private.can_access_student(school_id, student_id, 'finance.read'));
create policy student_discounts_manage on public.student_discounts
  for all to authenticated using (private.has_perm(school_id, 'finance.manage'))
  with check (private.has_perm(school_id, 'finance.manage'));

create policy invoices_read on public.invoices
  for select to authenticated using (
    private.can_read_family_scoped(school_id, student_id, 'finance.read', status <> 'draft')
  );
create policy invoices_insert on public.invoices
  for insert to authenticated with check (private.has_perm(school_id, 'invoices.create'));
create policy invoices_update on public.invoices
  for update to authenticated using (private.has_perm(school_id, 'invoices.create'))
  with check (private.has_perm(school_id, 'invoices.create'));
create policy invoices_delete on public.invoices
  for delete to authenticated using (status = 'draft' and private.has_perm(school_id, 'invoices.create'));

create policy invoice_lines_read on public.invoice_lines
  for select to authenticated using (
    exists (select 1 from public.invoices i where i.id = invoice_id)
  );
create policy invoice_lines_write on public.invoice_lines
  for all to authenticated using (private.has_perm(school_id, 'invoices.create'))
  with check (private.has_perm(school_id, 'invoices.create'));

create policy invoice_installments_read on public.invoice_installments
  for select to authenticated using (exists (select 1 from public.invoices i where i.id = invoice_id));
create policy invoice_installments_write on public.invoice_installments
  for all to authenticated using (private.has_perm(school_id, 'invoices.create'))
  with check (private.has_perm(school_id, 'invoices.create'));

create policy payments_read on public.payments
  for select to authenticated using (private.can_read_family_scoped(school_id, student_id, 'finance.read', true));
create policy payments_reconcile on public.payments
  for update to authenticated using (private.has_perm(school_id, 'payments.validate'))
  with check (private.has_perm(school_id, 'payments.validate'));

create policy payment_allocations_read on public.payment_allocations
  for select to authenticated using (exists (select 1 from public.payments p where p.id = payment_id));

create policy refunds_read on public.refunds
  for select to authenticated using (private.has_perm(school_id, 'finance.read'));

create policy suppliers_read on public.suppliers
  for select to authenticated using (private.has_any_perm(school_id, 'expenses.read'));
create policy suppliers_manage on public.suppliers
  for all to authenticated using (private.has_perm(school_id, 'expenses.create'))
  with check (private.has_perm(school_id, 'expenses.create'));

create policy expense_categories_read on public.expense_categories
  for select to authenticated using (private.has_any_perm(school_id, 'expenses.read') or private.has_perm(school_id, 'budgets.manage'));
create policy expense_categories_manage on public.expense_categories
  for all to authenticated using (private.has_perm(school_id, 'finance.manage'))
  with check (private.has_perm(school_id, 'finance.manage'));

create policy expenses_read on public.expenses
  for select to authenticated using (private.has_perm(school_id, 'expenses.read') or requested_by = auth.uid());
create policy expenses_insert on public.expenses
  for insert to authenticated with check (
    status = 'pending' and requested_by = auth.uid() and private.has_perm(school_id, 'expenses.create')
  );
create policy expenses_update on public.expenses
  for update to authenticated using (private.has_perm(school_id, 'expenses.validate'))
  with check (private.has_perm(school_id, 'expenses.validate'));

create policy budgets_read on public.budgets
  for select to authenticated using (private.has_perm(school_id, 'finance.read') or private.has_perm(school_id, 'budgets.manage'));
create policy budgets_manage on public.budgets
  for all to authenticated using (private.has_perm(school_id, 'budgets.manage'))
  with check (private.has_perm(school_id, 'budgets.manage'));

-- -----------------------------------------------------------------------------
-- Communication
-- -----------------------------------------------------------------------------
create policy announcements_read on public.announcements
  for select to authenticated using (
    private.has_perm(school_id, 'announcements.create')
    or (status = 'published' and (expires_at is null or expires_at > now())
        and private.can_see_announcement(school_id, audience_roles, audience_class_ids))
  );
create policy announcements_insert on public.announcements
  for insert to authenticated with check (
    private.has_perm(school_id, 'announcements.create')
    and (status <> 'published' or private.has_perm(school_id, 'announcements.publish'))
  );
create policy announcements_update on public.announcements
  for update to authenticated using (private.has_perm(school_id, 'announcements.create'))
  with check (
    private.has_perm(school_id, 'announcements.create')
    and (status <> 'published' or private.has_perm(school_id, 'announcements.publish'))
  );
create policy announcements_delete on public.announcements
  for delete to authenticated using (private.has_perm(school_id, 'announcements.publish'));

create policy notifications_own_read on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy notifications_own_update on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_own_delete on public.notifications
  for delete to authenticated using (user_id = auth.uid());

create policy notification_preferences_own on public.notification_preferences
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy message_threads_read on public.message_threads
  for select to authenticated using (private.is_thread_participant(id));
create policy message_participants_read on public.message_participants
  for select to authenticated using (private.is_thread_participant(thread_id));
create policy message_participants_update on public.message_participants
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy messages_read on public.messages
  for select to authenticated using (private.is_thread_participant(thread_id));
create policy messages_insert on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid() and private.is_thread_participant(thread_id) and private.is_member(school_id)
    and exists (select 1 from public.message_threads t where t.id = thread_id and t.school_id = messages.school_id)
  );

-- -----------------------------------------------------------------------------
-- Documents and requests
-- -----------------------------------------------------------------------------
create policy document_templates_read on public.document_templates
  for select to authenticated using (private.has_any_perm(school_id, 'documents.create') or private.has_perm(school_id, 'templates.manage'));
create policy document_templates_manage on public.document_templates
  for all to authenticated using (private.has_perm(school_id, 'templates.manage'))
  with check (private.has_perm(school_id, 'templates.manage'));

create policy documents_read on public.documents
  for select to authenticated using (private.can_read_document(id));
create policy documents_insert on public.documents
  for insert to authenticated with check (
    uploaded_by = auth.uid() and deleted_at is null and (
      private.has_perm(school_id, 'documents.create')
      or (category = 'justification' and student_id is not null
          and private.can_access_student(school_id, student_id, 'justifications.create'))
      or (category = 'hr' and staff_id is not null and staff_id = private.my_staff_id(school_id))
      or (category = 'hr' and private.has_perm(school_id, 'hr.manage'))
    )
  );
create policy documents_update on public.documents
  for update to authenticated using (private.has_perm(school_id, 'documents.delete'))
  with check (private.has_perm(school_id, 'documents.delete'));

create policy admin_requests_read on public.admin_requests
  for select to authenticated using (requester_id = auth.uid() or private.has_perm(school_id, 'requests.manage'));
create policy admin_requests_insert on public.admin_requests
  for insert to authenticated with check (
    requester_id = auth.uid() and status = 'open'
    and private.has_any_perm(school_id, 'requests.create')
    and (student_id is null or private.can_access_student(school_id, student_id, 'students.read'))
  );
create policy admin_requests_manage on public.admin_requests
  for update to authenticated using (private.has_perm(school_id, 'requests.manage'))
  with check (private.has_perm(school_id, 'requests.manage'));
create policy admin_requests_cancel_own on public.admin_requests
  for update to authenticated using (requester_id = auth.uid() and status = 'open')
  with check (requester_id = auth.uid() and status in ('open', 'cancelled'));

-- -----------------------------------------------------------------------------
-- AI assistant
-- -----------------------------------------------------------------------------
create policy ai_conversations_own on public.ai_conversations
  for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and private.has_any_perm(school_id, 'ai.use'));
create policy ai_messages_own on public.ai_messages
  for all to authenticated using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid() and c.school_id = ai_messages.school_id)
  );
create policy ai_tool_invocations_insert on public.ai_tool_invocations
  for insert to authenticated with check (user_id = auth.uid() and private.is_member(school_id));
create policy ai_tool_invocations_read on public.ai_tool_invocations
  for select to authenticated using (private.has_perm(school_id, 'audit.read'));

-- -----------------------------------------------------------------------------
-- Column-level hardening
-- Identity and tenant columns are immutable for API users: a row can never be
-- moved to another school, and account links (user_id) are only set by the
-- invitation workflow (SECURITY DEFINER functions).
-- -----------------------------------------------------------------------------
do $$
declare
  t record;
  v_cols text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    select string_agg(quote_ident(a.attname), ', ') into v_cols
    from pg_attribute a
    where a.attrelid = ('public.' || quote_ident(t.relname))::regclass
      and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
      and a.attname not in ('id', 'school_id', 'user_id', 'created_at', 'created_by', 'is_system', 'uploaded_by', 'requester_id', 'sender_id', 'submitted_by', 'requested_by', 'received_by');
    execute format('revoke update on public.%I from authenticated', t.relname);
    if v_cols is not null then
      execute format('grant update (%s) on public.%I to authenticated', v_cols, t.relname);
    end if;
  end loop;
end $$;

revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

revoke update on public.message_participants from authenticated;
grant update (last_read_at) on public.message_participants to authenticated;

revoke update on public.payments from authenticated;
grant update (reconciled, reconciled_at, reconciled_by, notes) on public.payments to authenticated;

revoke insert, update, delete on public.payment_allocations, public.refunds, public.grade_revisions,
  public.attendance_record_history, public.outbound_messages, public.report_card_lines from authenticated;
grant update (teacher_comment) on public.report_card_lines to authenticated;
revoke insert, delete on public.report_cards from authenticated;
revoke all on public.outbound_messages from authenticated;
revoke insert, update, delete on public.message_threads, public.message_participants from authenticated;
grant update (last_read_at) on public.message_participants to authenticated;

-- Self-service updates are restricted to harmless columns.
revoke update on public.guardians from authenticated;
grant update (first_name, last_name, phone, email, profession, address) on public.guardians to authenticated;
revoke update on public.profiles from authenticated;
grant update (full_name, phone, avatar_path, locale, theme, last_school_id) on public.profiles to authenticated;
