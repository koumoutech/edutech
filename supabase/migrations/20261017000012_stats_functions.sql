-- =============================================================================
-- EduDigi — Academic statistics for dashboards and the AI assistant.
-- All functions are SECURITY INVOKER: RLS restricts the grades each caller sees
-- (a teacher only aggregates their classes, a parent only published grades...).
-- Scores are normalised to the school's default scale; absences are excluded.
-- =============================================================================

create or replace function private.default_scale(p_school uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select scale_max from public.grading_policies where school_id = p_school and is_default), 20);
$$;

create or replace function private.default_passing(p_school uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select passing_mark from public.grading_policies where school_id = p_school and is_default), 10);
$$;

-- Weighted average per student for a term (assessment coefficient × subject coefficient).
create or replace function public.stats_student_averages(p_school uuid, p_term uuid, p_finalized_only boolean default true)
returns table (student_id uuid, class_id uuid, average numeric, graded bigint)
language sql stable security invoker set search_path = '' as $$
  select g.student_id, cs.class_id,
    round(sum(g.score / a.max_score * private.default_scale(p_school) * a.coefficient * cs.coefficient)
          / nullif(sum(a.coefficient * cs.coefficient), 0), 2),
    count(*)
  from public.grades g
  join public.assessments a on a.id = g.assessment_id
  join public.class_subjects cs on cs.id = a.class_subject_id
  where g.school_id = p_school and a.term_id = p_term and g.score is not null and not g.is_absent
    and (not p_finalized_only or a.status in ('validated', 'published'))
  group by g.student_id, cs.class_id;
$$;

create or replace function public.stats_class_performance(p_school uuid, p_term uuid, p_finalized_only boolean default true)
returns table (class_id uuid, class_name text, average numeric, students bigint, below_passing bigint)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.name, round(avg(sa.average), 2), count(sa.student_id),
    count(sa.student_id) filter (where sa.average < private.default_passing(p_school))
  from public.stats_student_averages(p_school, p_term, p_finalized_only) sa
  join public.classes c on c.id = sa.class_id
  group by c.id, c.name
  order by c.name;
$$;

create or replace function public.stats_students_at_risk(p_school uuid, p_term uuid, p_limit integer default 10)
returns table (student_id uuid, first_name text, last_name text, class_name text, average numeric)
language sql stable security invoker set search_path = '' as $$
  select s.id, s.first_name, s.last_name, c.name, sa.average
  from public.stats_student_averages(p_school, p_term, false) sa
  join public.students s on s.id = sa.student_id
  join public.classes c on c.id = sa.class_id
  where sa.average < private.default_passing(p_school)
  order by sa.average
  limit least(greatest(p_limit, 1), 100);
$$;

-- Average per term of the year (temporal comparison). Terms without grades are omitted.
create or replace function public.stats_term_averages(p_school uuid, p_year uuid)
returns table (term_id uuid, term_name text, term_position smallint, average numeric, students bigint)
language sql stable security invoker set search_path = '' as $$
  select t.id, t.name, t.position, round(avg(sa.average), 2), count(sa.student_id)
  from public.terms t
  cross join lateral public.stats_student_averages(p_school, t.id, true) sa
  where t.academic_year_id = p_year and t.school_id = p_school
  group by t.id, t.name, t.position
  order by t.position;
$$;

-- Per-subject averages of one student (what the caller is allowed to see).
create or replace function public.stats_student_subjects(p_school uuid, p_student uuid, p_term uuid)
returns table (subject_id uuid, subject_name text, coefficient numeric, average numeric, grades bigint)
language sql stable security invoker set search_path = '' as $$
  select su.id, su.name, cs.coefficient,
    round(sum(g.score / a.max_score * private.default_scale(p_school) * a.coefficient) / nullif(sum(a.coefficient), 0), 2),
    count(*)
  from public.grades g
  join public.assessments a on a.id = g.assessment_id
  join public.class_subjects cs on cs.id = a.class_subject_id
  join public.subjects su on su.id = cs.subject_id
  where g.school_id = p_school and g.student_id = p_student and a.term_id = p_term
    and g.score is not null and not g.is_absent
  group by su.id, su.name, cs.coefficient
  order by su.name;
$$;

revoke execute on function public.stats_student_averages(uuid, uuid, boolean) from public, anon;
revoke execute on function public.stats_class_performance(uuid, uuid, boolean) from public, anon;
revoke execute on function public.stats_students_at_risk(uuid, uuid, integer) from public, anon;
revoke execute on function public.stats_term_averages(uuid, uuid) from public, anon;
revoke execute on function public.stats_student_subjects(uuid, uuid, uuid) from public, anon;
grant execute on function public.stats_student_averages(uuid, uuid, boolean) to authenticated;
grant execute on function public.stats_class_performance(uuid, uuid, boolean) to authenticated;
grant execute on function public.stats_students_at_risk(uuid, uuid, integer) to authenticated;
grant execute on function public.stats_term_averages(uuid, uuid) to authenticated;
grant execute on function public.stats_student_subjects(uuid, uuid, uuid) to authenticated;
