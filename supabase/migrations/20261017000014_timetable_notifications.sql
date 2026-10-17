-- =============================================================================
-- EduDigi — Timetable change notifications (substitutions, cancellations, moves).
-- Notifies the teachers involved, the students of the class and their families.
-- =============================================================================
create or replace function public.notify_timetable_change(p_entry uuid, p_title text, p_body text default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  e public.timetable_entries;
  v_user uuid;
  v_student uuid;
  v_count integer := 0;
begin
  select * into e from public.timetable_entries where id = p_entry;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_perm(e.school_id, 'timetable.manage');

  for v_user in
    select st.user_id from public.staff_members st where st.id = e.teacher_id and st.user_id is not null
    union
    select st.user_id from public.timetable_substitutions ts join public.staff_members st on st.id = ts.substitute_teacher_id
    where ts.timetable_entry_id = e.id and st.user_id is not null and ts.date >= current_date
  loop
    perform private.notify(e.school_id, v_user, 'timetable.changed', left(p_title, 200), p_body, '/app/timetable');
    v_count := v_count + 1;
  end loop;

  for v_student in select en.student_id from public.enrollments en where en.class_id = e.class_id and en.status = 'active' loop
    perform private.notify_student_family(e.school_id, v_student, 'timetable.changed', left(p_title, 200), p_body, '/app/timetable');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.notify_timetable_change(uuid, text, text) from public, anon;
grant execute on function public.notify_timetable_change(uuid, text, text) to authenticated;
