-- =============================================================================
-- EduDigi — Assessments, grades, report cards, attendance.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Grading policies (configurable per school / level / education system)
-- -----------------------------------------------------------------------------
create table public.grading_policies (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  level_id uuid,
  education_system text not null default 'francophone',
  scale_max numeric(6, 2) not null default 20 check (scale_max > 0),
  passing_mark numeric(6, 2) not null default 10,
  decimals smallint not null default 2 check (decimals between 0 and 4),
  rounding text not null default 'half_up' check (rounding in ('half_up', 'down', 'up')),
  missing_policy text not null default 'exclude' check (missing_policy in ('exclude', 'zero')),
  excused_policy text not null default 'exclude' check (excused_policy in ('exclude', 'zero')),
  ranking_enabled boolean not null default true,
  use_term_weights boolean not null default false,
  mentions jsonb not null default '[{"min":16,"label":"Très bien"},{"min":14,"label":"Bien"},{"min":12,"label":"Assez bien"},{"min":10,"label":"Passable"},{"min":0,"label":"Insuffisant"}]'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (school_id, name),
  foreign key (school_id, level_id) references public.levels (school_id, id) on delete cascade,
  check (passing_mark <= scale_max)
);
create unique index grading_policies_one_default on public.grading_policies (school_id) where is_default;
create unique index grading_policies_one_per_level on public.grading_policies (school_id, level_id) where level_id is not null;

create table public.assessment_types (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  default_coefficient numeric(5, 2) not null default 1 check (default_coefficient > 0),
  unique (school_id, name),
  unique (school_id, id)
);

create table public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  term_id uuid not null,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'planned' check (status in ('planned', 'ongoing', 'closed')),
  created_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, term_id) references public.terms (school_id, id) on delete cascade,
  check (ends_on >= starts_on)
);

-- -----------------------------------------------------------------------------
-- Assessments and grades
-- -----------------------------------------------------------------------------
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  class_subject_id uuid not null,
  term_id uuid not null,
  assessment_type_id uuid,
  exam_session_id uuid,
  title text not null check (char_length(title) between 1 and 160),
  held_on date not null default current_date,
  max_score numeric(6, 2) not null default 20 check (max_score > 0),
  coefficient numeric(5, 2) not null default 1 check (coefficient > 0),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'validated', 'published')),
  validated_by uuid references auth.users (id) on delete set null,
  validated_at timestamptz,
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, class_subject_id) references public.class_subjects (school_id, id) on delete cascade,
  foreign key (school_id, term_id) references public.terms (school_id, id) on delete restrict,
  foreign key (school_id, assessment_type_id) references public.assessment_types (school_id, id) on delete set null (assessment_type_id),
  foreign key (school_id, exam_session_id) references public.exam_sessions (school_id, id) on delete set null (exam_session_id)
);
create index assessments_cs_term_idx on public.assessments (class_subject_id, term_id);
create trigger assessments_updated_at before update on public.assessments
  for each row execute function private.set_updated_at();

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  assessment_id uuid not null,
  student_id uuid not null,
  score numeric(6, 2) check (score is null or score >= 0),
  is_absent boolean not null default false,
  is_excused boolean not null default false,
  comment text check (comment is null or char_length(comment) <= 500),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, student_id),
  foreign key (school_id, assessment_id) references public.assessments (school_id, id) on delete cascade,
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade,
  check (not (is_absent and score is not null))
);
create index grades_student_idx on public.grades (student_id);

create table public.grade_revisions (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.schools (id) on delete cascade,
  grade_id uuid not null references public.grades (id) on delete cascade,
  assessment_id uuid not null,
  student_id uuid not null,
  old_score numeric(6, 2),
  new_score numeric(6, 2),
  old_is_absent boolean,
  new_is_absent boolean,
  assessment_status text not null,
  reason text,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index grade_revisions_grade_idx on public.grade_revisions (grade_id, changed_at desc);

-- Grades: validate score range, block edits on locked assessments, keep a revision history.
create or replace function private.grades_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_assessment public.assessments;
begin
  select * into v_assessment from public.assessments where id = new.assessment_id;
  if new.score is not null and new.score > v_assessment.max_score then
    raise exception 'SCORE_OUT_OF_RANGE: la note dépasse le barème (%)', v_assessment.max_score using errcode = 'P0001';
  end if;
  if v_assessment.status in ('validated', 'published')
     and coalesce(current_setting('app.grade_correction', true), '') <> 'on' then
    raise exception 'GRADE_LOCKED: les notes validées ne peuvent être modifiées que par la procédure de correction' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;
create trigger grades_guard before insert or update on public.grades
  for each row execute function private.grades_guard();

create or replace function private.grades_history() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
begin
  if old.score is not distinct from new.score and old.is_absent = new.is_absent then
    return new;
  end if;
  select status into v_status from public.assessments where id = new.assessment_id;
  insert into public.grade_revisions (school_id, grade_id, assessment_id, student_id, old_score, new_score,
    old_is_absent, new_is_absent, assessment_status, reason, changed_by)
  values (new.school_id, new.id, new.assessment_id, new.student_id, old.score, new.score,
    old.is_absent, new.is_absent, v_status, nullif(current_setting('app.audit_reason', true), ''), auth.uid());
  return new;
end;
$$;
create trigger grades_history after update on public.grades
  for each row execute function private.grades_history();

create or replace function private.grades_block_locked_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.assessments a where a.id = old.assessment_id and a.status in ('validated', 'published')) then
    raise exception 'GRADE_LOCKED' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
create trigger grades_block_locked_delete before delete on public.grades
  for each row execute function private.grades_block_locked_delete();

-- Assessment status machine: draft → submitted → validated → published (and back to draft from submitted).
create or replace function private.assessments_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if old.status in ('validated', 'published') and coalesce(current_setting('app.assessment_transition', true), '') <> 'on' then
      if (old.max_score, old.coefficient, old.class_subject_id, old.term_id, old.status)
         is distinct from (new.max_score, new.coefficient, new.class_subject_id, new.term_id, new.status) then
        raise exception 'ASSESSMENT_LOCKED: évaluation validée' using errcode = 'P0001';
      end if;
    end if;
    if new.status in ('validated', 'published') and old.status not in ('validated', 'published')
       and coalesce(current_setting('app.assessment_transition', true), '') <> 'on' then
      raise exception 'ASSESSMENT_TRANSITION_REQUIRES_RPC' using errcode = 'P0001';
    end if;
  elsif new.status in ('validated', 'published') then
    raise exception 'ASSESSMENT_TRANSITION_REQUIRES_RPC' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger assessments_guard before insert or update on public.assessments
  for each row execute function private.assessments_guard();

create or replace function private.assessments_block_locked_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status in ('validated', 'published') then
    raise exception 'ASSESSMENT_LOCKED' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
create trigger assessments_block_locked_delete before delete on public.assessments
  for each row execute function private.assessments_block_locked_delete();

-- -----------------------------------------------------------------------------
-- Report cards (bulletins)
-- -----------------------------------------------------------------------------
create table public.report_cards (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  term_id uuid not null,
  class_id uuid not null,
  average numeric(6, 2),
  rank integer,
  class_size integer,
  class_average numeric(6, 2),
  mention text,
  absences_count integer not null default 0,
  lates_count integer not null default 0,
  appreciation text check (appreciation is null or char_length(appreciation) <= 1000),
  decision text,
  status text not null default 'draft' check (status in ('draft', 'validated', 'published')),
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users (id) on delete set null default auth.uid(),
  validated_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  unique (student_id, term_id),
  unique (school_id, id),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade,
  foreign key (school_id, term_id) references public.terms (school_id, id) on delete cascade,
  foreign key (school_id, class_id) references public.classes (school_id, id) on delete cascade
);
create index report_cards_class_term_idx on public.report_cards (class_id, term_id);

create table public.report_card_lines (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  report_card_id uuid not null,
  subject_id uuid not null,
  subject_name text not null,
  teacher_name text,
  coefficient numeric(5, 2) not null,
  average numeric(6, 2),
  class_average numeric(6, 2),
  min_average numeric(6, 2),
  max_average numeric(6, 2),
  rank integer,
  teacher_comment text,
  position smallint not null default 0,
  unique (report_card_id, subject_id),
  foreign key (school_id, report_card_id) references public.report_cards (school_id, id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- Student attendance
-- -----------------------------------------------------------------------------
create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  class_id uuid not null,
  date date not null,
  timetable_entry_id uuid,
  class_subject_id uuid,
  kind text not null default 'daily' check (kind in ('daily', 'lesson')),
  taken_by uuid references auth.users (id) on delete set null default auth.uid(),
  taken_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, class_id) references public.classes (school_id, id) on delete cascade,
  foreign key (school_id, timetable_entry_id) references public.timetable_entries (school_id, id) on delete set null (timetable_entry_id),
  foreign key (school_id, class_subject_id) references public.class_subjects (school_id, id) on delete set null (class_subject_id)
);
create unique index attendance_sessions_unique on public.attendance_sessions
  (class_id, date, coalesce(timetable_entry_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.absence_justifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  from_date date not null,
  to_date date not null,
  reason text not null check (char_length(reason) between 3 and 1000),
  document_id uuid,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  submitted_by uuid references auth.users (id) on delete set null default auth.uid(),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  unique (school_id, id),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade,
  check (to_date >= from_date)
);
create index absence_justifications_student_idx on public.absence_justifications (student_id, status);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  session_id uuid not null,
  student_id uuid not null,
  status text not null check (status in ('present', 'absent', 'late', 'excused')),
  minutes_late integer check (minutes_late is null or minutes_late between 0 and 600),
  note text check (note is null or char_length(note) <= 300),
  justification_id uuid,
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, student_id),
  foreign key (school_id, session_id) references public.attendance_sessions (school_id, id) on delete cascade,
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade,
  foreign key (school_id, justification_id) references public.absence_justifications (school_id, id) on delete set null (justification_id)
);
create index attendance_records_student_idx on public.attendance_records (student_id, status);

create table public.attendance_record_history (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.schools (id) on delete cascade,
  record_id uuid not null references public.attendance_records (id) on delete cascade,
  old_status text,
  new_status text,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);

create or replace function private.attendance_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status then
    insert into public.attendance_record_history (school_id, record_id, old_status, new_status, changed_by)
    values (new.school_id, new.id, old.status, new.status, auth.uid());
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger attendance_records_history before update on public.attendance_records
  for each row execute function private.attendance_history();
