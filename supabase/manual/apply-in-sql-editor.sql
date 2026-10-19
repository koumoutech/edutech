-- =============================================================================
-- À exécuter UNE FOIS dans Supabase → SQL Editor (projet « edudigi »).
--
-- Ces instructions font partie des migrations 008 et 017 du dépôt, mais l'outil
-- d'automatisation les considère comme « destructives » (elles contiennent un
-- DELETE dans le corps d'une fonction, ou un DROP CONSTRAINT) et exige une
-- confirmation humaine. Elles ne suppriment aucune donnée à l'exécution :
--   1. public.remove_role        : retrait d'un rôle à un utilisateur
--   2. public.save_report_cards  : génération / régénération des bulletins
--   3. login_events_event_check  : autorise les événements de double authentification
-- Le script est idempotent (peut être relancé sans risque).
-- =============================================================================

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
revoke execute on function public.remove_role(uuid, uuid, uuid) from public, anon;
revoke execute on function public.save_report_cards(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.remove_role(uuid, uuid, uuid) to authenticated;
grant execute on function public.save_report_cards(uuid, uuid, uuid, jsonb) to authenticated;

alter table public.login_events drop constraint if exists login_events_event_check;
alter table public.login_events add constraint login_events_event_check check (event in (
  'login_success', 'login_failure', 'logout', 'password_reset_requested', 'password_changed', 'locked_out',
  'session_revoked', 'mfa_enabled', 'mfa_disabled', 'mfa_failure', 'mfa_success'
));
