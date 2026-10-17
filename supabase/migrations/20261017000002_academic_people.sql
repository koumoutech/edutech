-- =============================================================================
-- EduDigi — Academic structure, students, guardians, staff, timetable.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Academic years and periods
-- -----------------------------------------------------------------------------
create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  status text not null default 'open' check (status in ('planned', 'open', 'closed')),
  created_at timestamptz not null default now(),
  unique (school_id, name),
  unique (school_id, id),
  check (ends_on > starts_on)
);
create unique index academic_years_one_current on public.academic_years (school_id) where is_current;

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  academic_year_id uuid not null,
  name text not null,
  position smallint not null check (position between 1 and 12),
  starts_on date not null,
  ends_on date not null,
  weight numeric(5, 2) not null default 1 check (weight > 0),
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (academic_year_id, position),
  unique (school_id, id),
  foreign key (school_id, academic_year_id) references public.academic_years (school_id, id) on delete cascade,
  check (ends_on > starts_on)
);

-- -----------------------------------------------------------------------------
-- Cycles, levels, subjects, rooms
-- -----------------------------------------------------------------------------
create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  position smallint not null default 1,
  unique (school_id, name),
  unique (school_id, id)
);

create table public.levels (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  cycle_id uuid,
  name text not null,
  short_name text,
  position smallint not null default 1,
  unique (school_id, name),
  unique (school_id, id),
  foreign key (school_id, cycle_id) references public.cycles (school_id, id) on delete set null (cycle_id)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9_-]{1,16}$'),
  name text not null,
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active boolean not null default true,
  unique (school_id, code),
  unique (school_id, id)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  building text,
  capacity integer check (capacity is null or capacity > 0),
  is_active boolean not null default true,
  unique (school_id, name),
  unique (school_id, id)
);

-- -----------------------------------------------------------------------------
-- Staff (teachers and personnel)
-- -----------------------------------------------------------------------------
create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  employee_number text not null,
  first_name text not null,
  last_name text not null,
  gender text check (gender in ('F', 'M', 'X')),
  email text,
  phone text,
  job_title text not null default 'Enseignant',
  department text,
  is_teacher boolean not null default false,
  hire_date date,
  status text not null default 'active' check (status in ('active', 'on_leave', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (school_id, employee_number),
  unique (school_id, id),
  unique (school_id, user_id)
);
create index staff_members_name_idx on public.staff_members (school_id, last_name, first_name);
create trigger staff_members_updated_at before update on public.staff_members
  for each row execute function private.set_updated_at();

create table public.staff_qualifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  staff_id uuid not null,
  title text not null,
  institution text,
  obtained_on date,
  created_at timestamptz not null default now(),
  foreign key (school_id, staff_id) references public.staff_members (school_id, id) on delete cascade
);

create table public.staff_contracts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  staff_id uuid not null,
  contract_type text not null check (contract_type in ('permanent', 'fixed_term', 'part_time', 'internship', 'volunteer', 'civil_servant')),
  starts_on date not null,
  ends_on date,
  monthly_salary numeric(14, 2) check (monthly_salary is null or monthly_salary >= 0),
  weekly_hours numeric(5, 2),
  status text not null default 'active' check (status in ('draft', 'active', 'ended', 'terminated')),
  notes text,
  created_at timestamptz not null default now(),
  foreign key (school_id, staff_id) references public.staff_members (school_id, id) on delete cascade,
  check (ends_on is null or ends_on >= starts_on)
);

create table public.staff_evaluations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  staff_id uuid not null,
  period_label text not null,
  score numeric(4, 1) check (score is null or score between 0 and 20),
  strengths text,
  improvements text,
  evaluator_id uuid references auth.users (id) on delete set null,
  evaluated_on date not null default current_date,
  created_at timestamptz not null default now(),
  foreign key (school_id, staff_id) references public.staff_members (school_id, id) on delete cascade
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  staff_id uuid not null,
  kind text not null check (kind in ('annual_leave', 'sick_leave', 'maternity', 'paternity', 'training', 'unpaid', 'absence', 'other')),
  starts_on date not null,
  ends_on date not null,
  half_day boolean not null default false,
  reason text,
  document_id uuid,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  substitute_staff_id uuid,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (school_id, staff_id) references public.staff_members (school_id, id) on delete cascade,
  foreign key (school_id, substitute_staff_id) references public.staff_members (school_id, id) on delete set null (substitute_staff_id),
  check (ends_on >= starts_on)
);
create index leave_requests_school_idx on public.leave_requests (school_id, status, starts_on);

create table public.staff_attendance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  staff_id uuid not null,
  date date not null,
  status text not null check (status in ('present', 'absent', 'late', 'on_leave')),
  minutes_late integer check (minutes_late is null or minutes_late >= 0),
  note text,
  recorded_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (staff_id, date),
  foreign key (school_id, staff_id) references public.staff_members (school_id, id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- Classes, groups and teaching assignments
-- -----------------------------------------------------------------------------
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  academic_year_id uuid not null,
  level_id uuid not null,
  name text not null,
  capacity integer not null default 40 check (capacity between 1 and 200),
  room_id uuid,
  homeroom_staff_id uuid,
  created_at timestamptz not null default now(),
  unique (academic_year_id, name),
  unique (school_id, id),
  foreign key (school_id, academic_year_id) references public.academic_years (school_id, id) on delete cascade,
  foreign key (school_id, level_id) references public.levels (school_id, id) on delete restrict,
  foreign key (school_id, room_id) references public.rooms (school_id, id) on delete set null (room_id),
  foreign key (school_id, homeroom_staff_id) references public.staff_members (school_id, id) on delete set null (homeroom_staff_id)
);
create index classes_school_year_idx on public.classes (school_id, academic_year_id);

create table public.class_groups (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  class_id uuid not null,
  name text not null,
  unique (class_id, name),
  unique (school_id, id),
  foreign key (school_id, class_id) references public.classes (school_id, id) on delete cascade
);

-- Teaching assignment: one subject taught in one class by (at most) one main teacher.
create table public.class_subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  teacher_id uuid,
  coefficient numeric(5, 2) not null default 1 check (coefficient > 0),
  weekly_hours numeric(4, 1) check (weekly_hours is null or weekly_hours >= 0),
  created_at timestamptz not null default now(),
  unique (class_id, subject_id),
  unique (school_id, id),
  foreign key (school_id, class_id) references public.classes (school_id, id) on delete cascade,
  foreign key (school_id, subject_id) references public.subjects (school_id, id) on delete restrict,
  foreign key (school_id, teacher_id) references public.staff_members (school_id, id) on delete set null (teacher_id)
);
create index class_subjects_teacher_idx on public.class_subjects (teacher_id);

-- -----------------------------------------------------------------------------
-- Students, guardians, enrollments
-- -----------------------------------------------------------------------------
create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  matricule text not null check (matricule ~ '^[A-Z0-9-]{3,32}$'),
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  gender text check (gender in ('F', 'M', 'X')),
  birth_date date,
  birth_place text,
  nationality text,
  address text,
  phone text,
  email text,
  photo_path text,
  previous_school text,
  status text not null default 'active' check (status in ('applicant', 'active', 'transferred', 'graduated', 'withdrawn', 'archived')),
  admission_date date default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (school_id, matricule),
  unique (school_id, id),
  unique (school_id, user_id)
);
create index students_name_idx on public.students (school_id, last_name, first_name);
create index students_status_idx on public.students (school_id, status);
create trigger students_updated_at before update on public.students
  for each row execute function private.set_updated_at();

-- Medical data is split out and protected by the dedicated `health.read` permission.
create table public.student_health (
  student_id uuid primary key,
  school_id uuid not null,
  blood_group text,
  allergies text,
  conditions text,
  medications text,
  doctor_contact text,
  updated_at timestamptz not null default now(),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade
);

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  first_name text not null,
  last_name text not null,
  phone text,
  email text,
  profession text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, user_id)
);
create index guardians_name_idx on public.guardians (school_id, last_name, first_name);
create trigger guardians_updated_at before update on public.guardians
  for each row execute function private.set_updated_at();

create table public.student_guardians (
  school_id uuid not null,
  student_id uuid not null,
  guardian_id uuid not null,
  relationship text not null check (relationship in ('mother', 'father', 'tutor', 'grandparent', 'sibling', 'other')),
  is_legal_guardian boolean not null default true,
  is_emergency_contact boolean not null default false,
  can_pickup boolean not null default true,
  receives_notifications boolean not null default true,
  is_billing_contact boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (student_id, guardian_id),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade,
  foreign key (school_id, guardian_id) references public.guardians (school_id, id) on delete cascade
);
create index student_guardians_guardian_idx on public.student_guardians (guardian_id);

-- Emergency contacts who are not legal guardians.
create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  full_name text not null,
  relationship text,
  phone text not null,
  priority smallint not null default 1,
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  academic_year_id uuid not null,
  class_id uuid,
  kind text not null default 'new' check (kind in ('new', 're_enrollment', 'transfer_in')),
  status text not null default 'active' check (status in ('pending', 'active', 'transferred', 'completed', 'withdrawn')),
  enrolled_on date not null default current_date,
  left_on date,
  leave_reason text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade,
  foreign key (school_id, academic_year_id) references public.academic_years (school_id, id) on delete cascade,
  foreign key (school_id, class_id) references public.classes (school_id, id) on delete set null (class_id)
);
create unique index enrollments_one_active_per_year on public.enrollments (student_id, academic_year_id)
  where status in ('pending', 'active');
create index enrollments_class_idx on public.enrollments (class_id) where status = 'active';
create trigger enrollments_updated_at before update on public.enrollments
  for each row execute function private.set_updated_at();

create table public.class_group_members (
  group_id uuid not null,
  school_id uuid not null,
  student_id uuid not null,
  primary key (group_id, student_id),
  foreign key (school_id, group_id) references public.class_groups (school_id, id) on delete cascade,
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade
);

-- Enforce class capacity at the database level.
create or replace function private.check_class_capacity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_capacity integer;
  v_count integer;
begin
  if new.class_id is null or new.status <> 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.class_id is not distinct from new.class_id and old.status = 'active' then
    return new;
  end if;
  select capacity into v_capacity from public.classes where id = new.class_id for update;
  select count(*) into v_count from public.enrollments
    where class_id = new.class_id and status = 'active' and id <> new.id;
  if v_count >= v_capacity then
    raise exception 'CLASS_FULL: la classe a atteint sa capacité (%)', v_capacity using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger enrollments_capacity before insert or update on public.enrollments
  for each row execute function private.check_class_capacity();

-- Ensure the class belongs to the enrollment's academic year.
create or replace function private.check_enrollment_class_year() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.class_id is not null and not exists (
    select 1 from public.classes c where c.id = new.class_id and c.academic_year_id = new.academic_year_id
  ) then
    raise exception 'CLASS_YEAR_MISMATCH: la classe n''appartient pas à cette année scolaire' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger enrollments_class_year before insert or update on public.enrollments
  for each row execute function private.check_enrollment_class_year();

-- Required supporting documents for a complete enrollment file.
create table public.required_document_types (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  applies_to text not null default 'student' check (applies_to in ('student', 'staff')),
  is_mandatory boolean not null default true,
  unique (school_id, name),
  unique (school_id, id)
);

-- -----------------------------------------------------------------------------
-- Timetable
-- -----------------------------------------------------------------------------
create table public.bell_periods (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  label text not null,
  starts_at time not null,
  ends_at time not null,
  is_break boolean not null default false,
  position smallint not null,
  unique (school_id, position),
  check (ends_at > starts_at)
);

create table public.timetable_entries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  class_subject_id uuid not null,
  class_id uuid not null,
  teacher_id uuid,
  room_id uuid,
  weekday smallint not null check (weekday between 1 and 7),
  starts_at time not null,
  ends_at time not null,
  minutes int4range generated always as (
    int4range(
      (extract(hour from starts_at) * 60 + extract(minute from starts_at))::int,
      (extract(hour from ends_at) * 60 + extract(minute from ends_at))::int
    )
  ) stored,
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, class_subject_id) references public.class_subjects (school_id, id) on delete cascade,
  foreign key (school_id, class_id) references public.classes (school_id, id) on delete cascade,
  foreign key (school_id, teacher_id) references public.staff_members (school_id, id) on delete set null (teacher_id),
  foreign key (school_id, room_id) references public.rooms (school_id, id) on delete set null (room_id),
  check (ends_at > starts_at),
  -- Conflict detection: a class, a teacher or a room cannot be booked twice at the same time.
  constraint timetable_no_class_overlap exclude using gist (class_id with =, weekday with =, minutes with &&),
  constraint timetable_no_teacher_overlap exclude using gist (teacher_id with =, weekday with =, minutes with &&) where (teacher_id is not null),
  constraint timetable_no_room_overlap exclude using gist (room_id with =, weekday with =, minutes with &&) where (room_id is not null)
);
create index timetable_entries_class_idx on public.timetable_entries (class_id, weekday);
create index timetable_entries_teacher_idx on public.timetable_entries (teacher_id, weekday);
create trigger timetable_entries_updated_at before update on public.timetable_entries
  for each row execute function private.set_updated_at();

create or replace function private.timetable_entry_consistency() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_cs record;
begin
  select class_id, teacher_id into v_cs from public.class_subjects where id = new.class_subject_id;
  if v_cs.class_id <> new.class_id then
    raise exception 'TIMETABLE_CLASS_MISMATCH' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' and new.teacher_id is null then
    new.teacher_id := v_cs.teacher_id;
  end if;
  return new;
end;
$$;
create trigger timetable_entries_consistency before insert or update on public.timetable_entries
  for each row execute function private.timetable_entry_consistency();

create table public.timetable_substitutions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  timetable_entry_id uuid not null,
  date date not null,
  substitute_teacher_id uuid,
  is_cancelled boolean not null default false,
  room_id uuid,
  reason text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (timetable_entry_id, date),
  foreign key (school_id, timetable_entry_id) references public.timetable_entries (school_id, id) on delete cascade,
  foreign key (school_id, substitute_teacher_id) references public.staff_members (school_id, id) on delete set null (substitute_teacher_id),
  foreign key (school_id, room_id) references public.rooms (school_id, id) on delete set null (room_id)
);
