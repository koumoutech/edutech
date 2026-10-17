-- =============================================================================
-- EduDigi — DEMONSTRATION DATA (fictitious). For local / demo environments ONLY.
--
-- * Creates ONE isolated tenant flagged schools.is_demo = true.
-- * Refuses to run when the database already contains a non-demo school, so demo
--   data can never be mixed with production data.
-- * Demo accounts are created WITHOUT password: they cannot sign in until an
--   operator runs `pnpm demo:credentials` (random one-time passwords, never committed).
-- * All names, grades, invoices and payments are generated and fictitious.
-- =============================================================================

do $$
begin
  if exists (select 1 from public.schools where not is_demo) then
    raise exception 'Seed refused: this database contains non-demo schools.';
  end if;
end $$;

do $$
declare
  v_school constant uuid := '00000000-0000-4000-a000-000000000001';
  v_admin constant uuid := '00000000-0000-4000-b000-000000000001';
  v_year uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid;
  v_cycle_col uuid; v_cycle_lyc uuid;
  v_lvl uuid[] := '{}';
  v_class uuid[] := '{}';
  v_subj uuid[] := '{}';
  v_teacher uuid[] := '{}';
  v_staff uuid;
  v_room uuid[] := '{}';
  v_role record;
  v_users jsonb := '[
    {"id":"00000000-0000-4000-b000-000000000001","email":"admin@demo.edudigi.local","name":"Awa Koné","role":"school_admin"},
    {"id":"00000000-0000-4000-b000-000000000002","email":"directeur@demo.edudigi.local","name":"Moussa Traoré","role":"director"},
    {"id":"00000000-0000-4000-b000-000000000003","email":"etudes@demo.edudigi.local","name":"Fatou Diallo","role":"academic_director"},
    {"id":"00000000-0000-4000-b000-000000000004","email":"secretariat@demo.edudigi.local","name":"Aminata Ouattara","role":"secretary"},
    {"id":"00000000-0000-4000-b000-000000000005","email":"comptable@demo.edudigi.local","name":"Ibrahim Bamba","role":"accountant"},
    {"id":"00000000-0000-4000-b000-000000000006","email":"prof.maths@demo.edudigi.local","name":"Jean Kouassi","role":"teacher"},
    {"id":"00000000-0000-4000-b000-000000000007","email":"prof.francais@demo.edudigi.local","name":"Mariam Cissé","role":"teacher"},
    {"id":"00000000-0000-4000-b000-000000000008","email":"surveillant@demo.edudigi.local","name":"Koffi Yao","role":"supervisor"},
    {"id":"00000000-0000-4000-b000-000000000009","email":"rh@demo.edudigi.local","name":"Salimata Sanogo","role":"hr_manager"},
    {"id":"00000000-0000-4000-b000-000000000010","email":"parent@demo.edudigi.local","name":"Adjoua N''Guessan","role":"parent"},
    {"id":"00000000-0000-4000-b000-000000000011","email":"eleve@demo.edudigi.local","name":"Yann N''Guessan","role":"student"},
    {"id":"00000000-0000-4000-b000-000000000012","email":"parent2@demo.edudigi.local","name":"Seydou Coulibaly","role":"parent"}
  ]'::jsonb;
  u jsonb;
  v_first_f text[] := array['Aïcha','Fatoumata','Mariam','Awa','Grâce','Esther','Inès','Nadia','Prisca','Rokia','Salimata','Tania','Yasmine','Zénab','Clarisse'];
  v_first_m text[] := array['Yann','Ibrahim','Moussa','Kevin','Arnaud','Cédric','Daouda','Elie','Franck','Hervé','Junior','Lamine','Oumar','Patrick','Serge'];
  v_last text[] := array['Kouamé','Traoré','Koné','Diallo','Ouattara','Bamba','Yao','Coulibaly','Cissé','Sanogo','Touré','Kouassi','N''Guessan','Fofana','Diabaté','Konaté','Doumbia','Camara'];
  v_student uuid;
  v_guardian uuid;
  v_i integer;
  v_c integer;
  v_cs record;
  v_assess uuid;
  v_day date;
  v_session uuid;
  v_r double precision;
  v_amt numeric;
  v_inv uuid;
  v_tuition uuid;
  v_reg uuid;
  v_cash uuid;
  v_momo uuid;
  v_fs_tuition uuid[] := '{}';
  v_fs_reg uuid;
  v_n integer;
  v_status text;
  v_slots time[] := array['07:30','08:30','09:30','10:30','11:30','14:00','15:00']::time[];
begin
  perform setseed(0.42);

  insert into public.schools (id, slug, name, short_name, school_type, sector, city, country, phone, email, currency, timezone, is_demo, brand_color)
  values (v_school, 'demo-les-palmiers', 'Groupe Scolaire Les Palmiers (démo)', 'GSP', 'mixed', 'private', 'Abidjan', 'CI',
          '+225 00 00 00 00', 'contact@demo.edudigi.local', 'XOF', 'Africa/Abidjan', true, '#16834A');
  perform private.seed_school_defaults(v_school);

  -- Demo accounts (no password: cannot authenticate until credentials are generated locally).
  for u in select * from jsonb_array_elements(v_users) loop
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at)
    values ((u ->> 'id')::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u ->> 'email',
            jsonb_build_object('full_name', u ->> 'name'), '{"provider":"email","providers":["email"],"demo":true}', now());
    insert into public.memberships (school_id, user_id, role_id)
    select v_school, (u ->> 'id')::uuid, r.id from public.roles r where r.school_id = v_school and r.key = u ->> 'role';
  end loop;

  -- Act as the demo administrator so business RPCs apply their normal checks.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- Academic year & terms
  insert into public.academic_years (school_id, name, starts_on, ends_on, is_current, status)
  values (v_school, '2026-2027', '2026-09-07', '2027-07-02', true, 'open') returning id into v_year;
  insert into public.terms (school_id, academic_year_id, name, position, starts_on, ends_on)
  values (v_school, v_year, '1er trimestre', 1, '2026-09-07', '2026-12-18') returning id into v_t1;
  insert into public.terms (school_id, academic_year_id, name, position, starts_on, ends_on)
  values (v_school, v_year, '2e trimestre', 2, '2027-01-05', '2027-03-26') returning id into v_t2;
  insert into public.terms (school_id, academic_year_id, name, position, starts_on, ends_on)
  values (v_school, v_year, '3e trimestre', 3, '2027-04-06', '2027-07-02') returning id into v_t3;

  insert into public.cycles (school_id, name, position) values (v_school, 'Collège', 1) returning id into v_cycle_col;
  insert into public.cycles (school_id, name, position) values (v_school, 'Lycée', 2) returning id into v_cycle_lyc;
  insert into public.levels (school_id, cycle_id, name, short_name, position) values (v_school, v_cycle_col, 'Sixième', '6e', 1);
  insert into public.levels (school_id, cycle_id, name, short_name, position) values (v_school, v_cycle_col, 'Cinquième', '5e', 2);
  insert into public.levels (school_id, cycle_id, name, short_name, position) values (v_school, v_cycle_col, 'Troisième', '3e', 3);
  insert into public.levels (school_id, cycle_id, name, short_name, position) values (v_school, v_cycle_lyc, 'Seconde', '2nde', 4);
  v_lvl := array(select id from public.levels where school_id = v_school order by position);

  insert into public.subjects (school_id, code, name, color) values
    (v_school, 'MATH', 'Mathématiques', '#16834A'), (v_school, 'FR', 'Français', '#0B5D35'),
    (v_school, 'ANG', 'Anglais', '#F5C542'), (v_school, 'HG', 'Histoire-Géographie', '#6B756F'),
    (v_school, 'SVT', 'Sciences de la vie et de la Terre', '#2E9E62'), (v_school, 'PC', 'Physique-Chimie', '#3A7D5C'),
    (v_school, 'EPS', 'Éducation physique', '#D9A21B');
  v_subj := array(select id from public.subjects where school_id = v_school order by code);
  -- order by code: ANG, EPS, FR, HG, MATH, PC, SVT

  insert into public.rooms (school_id, name, building, capacity) values
    (v_school, 'Salle 101', 'Bâtiment A', 45), (v_school, 'Salle 102', 'Bâtiment A', 45), (v_school, 'Salle 201', 'Bâtiment B', 40),
    (v_school, 'Salle 202', 'Bâtiment B', 40), (v_school, 'Laboratoire', 'Bâtiment B', 30), (v_school, 'Terrain', 'Extérieur', 200);
  v_room := array(select id from public.rooms where school_id = v_school order by name);

  insert into public.bell_periods (school_id, label, starts_at, ends_at, is_break, position) values
    (v_school, 'M1', '07:30', '08:25', false, 1), (v_school, 'M2', '08:30', '09:25', false, 2),
    (v_school, 'M3', '09:30', '10:25', false, 3), (v_school, 'Récréation', '10:25', '10:30', true, 4),
    (v_school, 'M4', '10:30', '11:25', false, 5), (v_school, 'M5', '11:30', '12:25', false, 6),
    (v_school, 'Pause déjeuner', '12:25', '14:00', true, 7), (v_school, 'S1', '14:00', '14:55', false, 8),
    (v_school, 'S2', '15:00', '15:55', false, 9);

  -- Staff
  insert into public.staff_members (school_id, user_id, employee_number, first_name, last_name, gender, email, job_title, department, is_teacher, hire_date) values
    (v_school, '00000000-0000-4000-b000-000000000002', 'EMP-001', 'Moussa', 'Traoré', 'M', 'directeur@demo.edudigi.local', 'Directeur', 'Direction', false, '2015-09-01'),
    (v_school, '00000000-0000-4000-b000-000000000003', 'EMP-002', 'Fatou', 'Diallo', 'F', 'etudes@demo.edudigi.local', 'Directrice des études', 'Direction', false, '2017-09-01'),
    (v_school, '00000000-0000-4000-b000-000000000004', 'EMP-003', 'Aminata', 'Ouattara', 'F', 'secretariat@demo.edudigi.local', 'Secrétaire', 'Administration', false, '2019-01-15'),
    (v_school, '00000000-0000-4000-b000-000000000005', 'EMP-004', 'Ibrahim', 'Bamba', 'M', 'comptable@demo.edudigi.local', 'Comptable', 'Finances', false, '2018-03-01'),
    (v_school, '00000000-0000-4000-b000-000000000008', 'EMP-005', 'Koffi', 'Yao', 'M', 'surveillant@demo.edudigi.local', 'Surveillant général', 'Vie scolaire', false, '2020-09-01'),
    (v_school, '00000000-0000-4000-b000-000000000009', 'EMP-006', 'Salimata', 'Sanogo', 'F', 'rh@demo.edudigi.local', 'Responsable RH', 'Administration', false, '2021-02-01');
  insert into public.staff_members (school_id, user_id, employee_number, first_name, last_name, gender, email, job_title, department, is_teacher, hire_date) values
    (v_school, '00000000-0000-4000-b000-000000000006', 'ENS-001', 'Jean', 'Kouassi', 'M', 'prof.maths@demo.edudigi.local', 'Professeur de mathématiques', 'Sciences', true, '2016-09-01'),
    (v_school, '00000000-0000-4000-b000-000000000007', 'ENS-002', 'Mariam', 'Cissé', 'F', 'prof.francais@demo.edudigi.local', 'Professeure de français', 'Lettres', true, '2018-09-01'),
    (v_school, null, 'ENS-003', 'Paul', 'Kra', 'M', null, 'Professeur d''anglais', 'Langues', true, '2019-09-01'),
    (v_school, null, 'ENS-004', 'Rose', 'Aka', 'F', null, 'Professeure d''histoire-géographie', 'Lettres', true, '2020-09-01'),
    (v_school, null, 'ENS-005', 'Didier', 'Gnagne', 'M', null, 'Professeur de SVT', 'Sciences', true, '2017-09-01'),
    (v_school, null, 'ENS-006', 'Brice', 'Zadi', 'M', null, 'Professeur de physique-chimie', 'Sciences', true, '2022-09-01'),
    (v_school, null, 'ENS-007', 'Linda', 'Ehui', 'F', null, 'Professeure d''EPS', 'Sport', true, '2021-09-01');
  -- teachers indexed by subject order (ANG, EPS, FR, HG, MATH, PC, SVT)
  v_teacher := array[
    (select id from public.staff_members where school_id = v_school and employee_number = 'ENS-003'),
    (select id from public.staff_members where school_id = v_school and employee_number = 'ENS-007'),
    (select id from public.staff_members where school_id = v_school and employee_number = 'ENS-002'),
    (select id from public.staff_members where school_id = v_school and employee_number = 'ENS-004'),
    (select id from public.staff_members where school_id = v_school and employee_number = 'ENS-001'),
    (select id from public.staff_members where school_id = v_school and employee_number = 'ENS-006'),
    (select id from public.staff_members where school_id = v_school and employee_number = 'ENS-005')];

  insert into public.staff_contracts (school_id, staff_id, contract_type, starts_on, monthly_salary, weekly_hours, status)
  select v_school, id, case when is_teacher then 'permanent' else 'permanent' end, coalesce(hire_date, '2020-09-01'),
         case when is_teacher then 450000 else 380000 end, case when is_teacher then 20 else 40 end, 'active'
  from public.staff_members where school_id = v_school;

  insert into public.leave_requests (school_id, staff_id, kind, starts_on, ends_on, reason, status, created_by)
  values (v_school, v_teacher[1], 'sick_leave', current_date + 3, current_date + 5, 'Rendez-vous médical (fictif)', 'pending', v_admin),
         (v_school, v_teacher[4], 'training', current_date + 10, current_date + 11, 'Formation pédagogique (fictive)', 'pending', v_admin);

  -- Classes (one per level, two for 6e)
  insert into public.classes (school_id, academic_year_id, level_id, name, capacity, room_id, homeroom_staff_id) values
    (v_school, v_year, v_lvl[1], '6e A', 40, v_room[1], v_teacher[5]),
    (v_school, v_year, v_lvl[1], '6e B', 40, v_room[2], v_teacher[3]),
    (v_school, v_year, v_lvl[2], '5e A', 40, v_room[3], v_teacher[4]),
    (v_school, v_year, v_lvl[3], '3e A', 40, v_room[4], v_teacher[7]),
    (v_school, v_year, v_lvl[4], '2nde A', 40, v_room[5], v_teacher[6]);
  v_class := array(select id from public.classes where school_id = v_school order by name);
  -- order by name: 2nde A, 3e A, 5e A, 6e A, 6e B

  -- Teaching assignments with coefficients
  insert into public.class_subjects (school_id, class_id, subject_id, teacher_id, coefficient, weekly_hours)
  select v_school, c, v_subj[s], v_teacher[s],
         case v_subj_code when 'MATH' then 4 when 'FR' then 4 when 'ANG' then 2 when 'HG' then 2 when 'PC' then 2 when 'SVT' then 2 else 1 end,
         case v_subj_code when 'MATH' then 5 when 'FR' then 5 else 2 end
  from unnest(v_class) c,
       generate_series(1, 7) s,
       lateral (select code as v_subj_code from public.subjects where id = v_subj[s]) sc;

  -- Timetable: spread each class's subjects across the week without conflicts.
  v_c := 0;
  for v_cs in
    select cs.id, cs.class_id, cs.teacher_id, row_number() over (partition by cs.class_id order by cs.subject_id) as k,
           (select array_position(v_class, cs.class_id)) as ci
    from public.class_subjects cs where cs.school_id = v_school
  loop
    -- slot index rotates with the class to avoid teacher overlaps
    for v_i in 1..2 loop
      begin
        insert into public.timetable_entries (school_id, class_subject_id, class_id, teacher_id, room_id, weekday, starts_at, ends_at)
        values (v_school, v_cs.id, v_cs.class_id, v_cs.teacher_id,
                v_room[1 + ((v_cs.ci - 1) % 5)],
                1 + ((v_cs.k + v_i * 2) % 5)::smallint,
                v_slots[1 + ((v_cs.k + v_cs.ci + v_i) % 7)],
                v_slots[1 + ((v_cs.k + v_cs.ci + v_i) % 7)] + interval '55 minutes');
      exception when exclusion_violation then
        null; -- skip conflicting slot in demo generation
      end;
    end loop;
  end loop;

  -- Students, guardians and enrollments
  for v_c in 1..array_length(v_class, 1) loop
    for v_i in 1..14 loop
      v_n := (v_c - 1) * 14 + v_i;
      insert into public.students (school_id, matricule, first_name, last_name, gender, birth_date, birth_place, nationality, status, admission_date)
      values (v_school, '26-' || lpad(v_n::text, 5, '0'),
              case when v_i % 2 = 0 then v_first_f[1 + (v_n % 15)] else v_first_m[1 + (v_n % 15)] end,
              v_last[1 + ((v_n * 7) % 18)],
              case when v_i % 2 = 0 then 'F' else 'M' end,
              date '2016-01-01' - ((v_c * 365) + (v_n * 13) % 300),
              'Abidjan', 'Ivoirienne', 'active', '2026-09-07')
      returning id into v_student;

      insert into public.guardians (school_id, first_name, last_name, phone, email, profession)
      values (v_school, case when v_i % 3 = 0 then 'Mme' else 'M.' end || ' ' || v_first_m[1 + ((v_n + 3) % 15)],
              v_last[1 + ((v_n * 7) % 18)], '+225 07 ' || lpad((v_n * 37 % 100)::text, 2, '0') || ' ' || lpad((v_n * 53 % 100)::text, 2, '0') || ' 00',
              null, 'Commerçant(e)')
      returning id into v_guardian;
      insert into public.student_guardians (school_id, student_id, guardian_id, relationship, is_legal_guardian, is_emergency_contact, is_billing_contact)
      values (v_school, v_student, v_guardian, case when v_i % 3 = 0 then 'mother' else 'father' end, true, true, true);

      insert into public.enrollments (school_id, student_id, academic_year_id, class_id, kind, status, enrolled_on)
      values (v_school, v_student, v_year, v_class[v_c], case when v_i % 4 = 0 then 'new' else 're_enrollment' end, 'active', '2026-09-07');

      if v_i % 5 <> 0 then
        insert into public.documents (school_id, category, title, student_id, document_type_id)
        select v_school, 'student_file', rdt.name, v_student, rdt.id
        from public.required_document_types rdt where rdt.school_id = v_school and rdt.applies_to = 'student' and rdt.is_mandatory;
      end if;
    end loop;
  end loop;

  -- Link the demo parent/student accounts: parent has two children (6e A and 3e A), student account = first child.
  update public.students set user_id = '00000000-0000-4000-b000-000000000011', first_name = 'Yann', last_name = 'N''Guessan'
  where id = (select e.student_id from public.enrollments e where e.class_id = v_class[4] order by e.student_id limit 1);
  insert into public.guardians (school_id, user_id, first_name, last_name, phone, email, profession)
  values (v_school, '00000000-0000-4000-b000-000000000010', 'Adjoua', 'N''Guessan', '+225 07 11 22 33 44', 'parent@demo.edudigi.local', 'Infirmière')
  returning id into v_guardian;
  insert into public.student_guardians (school_id, student_id, guardian_id, relationship, is_legal_guardian, is_emergency_contact, is_billing_contact)
  values (v_school, (select id from public.students where user_id = '00000000-0000-4000-b000-000000000011'), v_guardian, 'mother', true, true, true);
  update public.students set last_name = 'N''Guessan', first_name = 'Grâce'
  where id = (select e.student_id from public.enrollments e where e.class_id = v_class[2] order by e.student_id limit 1);
  insert into public.student_guardians (school_id, student_id, guardian_id, relationship, is_legal_guardian, is_emergency_contact, is_billing_contact)
  values (v_school, (select e.student_id from public.enrollments e where e.class_id = v_class[2] order by e.student_id limit 1), v_guardian, 'mother', true, true, true);
  insert into public.guardians (school_id, user_id, first_name, last_name, phone, email)
  values (v_school, '00000000-0000-4000-b000-000000000012', 'Seydou', 'Coulibaly', '+225 05 55 66 77 88', 'parent2@demo.edudigi.local')
  returning id into v_guardian;
  insert into public.student_guardians (school_id, student_id, guardian_id, relationship)
  values (v_school, (select e.student_id from public.enrollments e where e.class_id = v_class[5] order by e.student_id limit 1), v_guardian, 'father');

  insert into public.student_health (school_id, student_id, blood_group, allergies)
  select v_school, id, 'O+', 'Arachides (fictif)' from public.students where user_id = '00000000-0000-4000-b000-000000000011';

  -- Assessments and grades for the first term (two per subject per class), validated/published.
  for v_cs in select cs.id, cs.class_id, s.code, s.name from public.class_subjects cs join public.subjects s on s.id = cs.subject_id
              where cs.school_id = v_school loop
    for v_i in 1..2 loop
      insert into public.assessments (school_id, class_subject_id, term_id, assessment_type_id, title, held_on, max_score, coefficient)
      values (v_school, v_cs.id, v_t1,
              (select id from public.assessment_types where school_id = v_school and name = case v_i when 1 then 'Interrogation' else 'Devoir surveillé' end),
              case v_i when 1 then 'Interrogation n°1 — ' else 'Devoir n°1 — ' end || v_cs.name,
              date '2026-10-05' + (v_i * 6), 20, v_i)
      returning id into v_assess;
      insert into public.grades (school_id, assessment_id, student_id, score, is_absent)
      select v_school, v_assess, e.student_id,
             case when random() < 0.04 then null else round((6 + random() * 12 + case when v_cs.code in ('EPS') then 2 else 0 end)::numeric * 4) / 4 end,
             false
      from public.enrollments e where e.class_id = v_cs.class_id and e.status = 'active';
      update public.grades set is_absent = true where assessment_id = v_assess and score is null;
      perform set_config('app.assessment_transition', 'on', true);
      update public.assessments set status = case when v_i = 1 then 'published' else 'validated' end,
        validated_by = v_admin, validated_at = now(), published_at = case when v_i = 1 then now() end
      where id = v_assess;
      perform set_config('app.assessment_transition', 'off', true);
    end loop;
    -- An upcoming assessment in draft
    insert into public.assessments (school_id, class_subject_id, term_id, assessment_type_id, title, held_on, max_score, coefficient)
    values (v_school, v_cs.id, v_t1, (select id from public.assessment_types where school_id = v_school and name = 'Composition'),
            'Composition du 1er trimestre — ' || v_cs.name, '2026-12-08', 20, 3);
  end loop;

  -- Attendance over the last 10 school days (bounded by the term start).
  for v_c in 1..array_length(v_class, 1) loop
    for v_i in 0..13 loop
      v_day := current_date - v_i;
      continue when extract(isodow from v_day) > 5 or v_day < date '2026-09-07';
      insert into public.attendance_sessions (school_id, class_id, date, kind, taken_by)
      values (v_school, v_class[v_c], v_day, 'daily', '00000000-0000-4000-b000-000000000008')
      returning id into v_session;
      insert into public.attendance_records (school_id, session_id, student_id, status, minutes_late)
      select v_school, v_session, e.student_id, st, case when st = 'late' then 10 + (random() * 20)::int end
      from public.enrollments e,
           lateral (select case when r < 0.06 then 'absent' when r < 0.10 then 'late' else 'present' end as st
                    from (select random() + 0 * extract(epoch from now()) + 0 * length(e.student_id::text) as r) z) x
      where e.class_id = v_class[v_c] and e.status = 'active';
    end loop;
  end loop;

  insert into public.absence_justifications (school_id, student_id, from_date, to_date, reason, status, submitted_by)
  select v_school, s.id, current_date - 2, current_date - 2, 'Consultation médicale (fictive)', 'pending', '00000000-0000-4000-b000-000000000010'
  from public.students s where s.user_id = '00000000-0000-4000-b000-000000000011';

  -- Finance: fee schedules, invoices, payments
  select id into v_tuition from public.fee_types where school_id = v_school and category = 'tuition';
  select id into v_reg from public.fee_types where school_id = v_school and category = 'registration';
  select id into v_cash from public.payment_methods where school_id = v_school and kind = 'cash';
  select id into v_momo from public.payment_methods where school_id = v_school and kind = 'mobile_money';
  insert into public.fee_schedules (school_id, academic_year_id, fee_type_id, level_id, amount)
  values (v_school, v_year, v_reg, null, 25000) returning id into v_fs_reg;
  for v_i in 1..array_length(v_lvl, 1) loop
    insert into public.fee_schedules (school_id, academic_year_id, fee_type_id, level_id, amount, installments)
    values (v_school, v_year, v_tuition, v_lvl[v_i], 150000 + v_i * 25000,
            '[{"due_on":"2026-10-15","percent":40},{"due_on":"2027-01-15","percent":30},{"due_on":"2027-04-15","percent":30}]')
    returning id into v_staff;
    v_fs_tuition := v_fs_tuition || v_staff;
  end loop;

  insert into public.discounts (school_id, name, kind, value, is_scholarship, applies_to_category)
  values (v_school, 'Réduction fratrie', 'percent', 10, false, 'tuition'), (v_school, 'Bourse d''excellence', 'percent', 50, true, 'tuition');
  insert into public.student_discounts (school_id, student_id, discount_id, academic_year_id, reason)
  select v_school, sg.student_id, d.id, v_year, 'Fratrie inscrite (fictif)'
  from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id, public.discounts d
  where g.user_id = '00000000-0000-4000-b000-000000000010' and d.school_id = v_school and d.name = 'Réduction fratrie';

  for v_c in 1..array_length(v_class, 1) loop
    perform public.generate_class_invoices(v_school, v_class[v_c], v_fs_tuition || v_fs_reg, current_date + 30, true);
  end loop;
  -- Back-date the invoices so that the demo shows overdue balances.
  perform set_config('app.finance_rpc', 'on', true);
  update public.invoices set issue_date = date '2026-09-10', due_date = date '2026-10-05' where school_id = v_school;
  perform set_config('app.finance_rpc', 'off', true);

  -- Payments: most families paid registration, many paid partially.
  v_i := 0;
  for v_inv in select id from public.invoices where school_id = v_school order by number loop
    v_i := v_i + 1;
    v_r := random();
    if v_r < 0.85 then
      v_amt := case when v_r < 0.35 then (select balance from public.invoices where id = v_inv)
                    else round((select balance from public.invoices where id = v_inv) * (0.3 + v_r::numeric * 0.4) / 1000) * 1000 end;
      perform public.record_payment(
        v_school, (select student_id from public.invoices where id = v_inv), v_amt,
        case when v_i % 3 = 0 then v_momo else v_cash end,
        case when v_i % 3 = 0 then 'MM-DEMO-' || lpad(v_i::text, 6, '0') end,
        null::text, now() - make_interval(days => (v_i % 40)),
        jsonb_build_array(jsonb_build_object('invoice_id', v_inv, 'amount', v_amt)));
    end if;
  end loop;

  -- Expenses and budgets
  insert into public.suppliers (school_id, name, contact_name, phone) values
    (v_school, 'Librairie du Plateau (fictif)', 'M. Kouadio', '+225 01 00 00 01'),
    (v_school, 'Électricité Services (fictif)', 'Service client', '+225 01 00 00 02');
  insert into public.budgets (school_id, academic_year_id, category_id, amount)
  select v_school, v_year, id, case name when 'Salaires' then 60000000 when 'Fournitures' then 3000000 when 'Maintenance' then 2500000
                                         when 'Énergie et eau' then 2400000 else 1000000 end
  from public.expense_categories where school_id = v_school;
  insert into public.expenses (school_id, category_id, supplier_id, academic_year_id, description, amount, spent_on, method_id, status, approved_by, approved_at, requested_by)
  select v_school, ec.id, (select id from public.suppliers where school_id = v_school order by name limit 1), v_year,
         'Dépense ' || lower(ec.name) || ' (fictive)', 50000 + (random() * 400000)::int, current_date - (g * 9), v_cash,
         case when g % 4 = 0 then 'pending' else 'approved' end,
         case when g % 4 = 0 then null else v_admin end, case when g % 4 = 0 then null else now() end, v_admin
  from public.expense_categories ec, generate_series(1, 4) g
  where ec.school_id = v_school and ec.name <> 'Salaires';

  -- Announcements
  insert into public.announcements (school_id, title, body, audience_roles, status, is_pinned, priority, published_at)
  values
    (v_school, 'Réunion parents-professeurs', 'La réunion parents-professeurs du premier trimestre aura lieu le samedi 14 novembre à 9 h dans la grande salle. (annonce de démonstration)', '{}', 'published', true, 'important', now() - interval '2 days'),
    (v_school, 'Conseil des enseignants', 'Les conseils de classe débuteront le 15 décembre. Merci de finaliser la saisie des notes. (démonstration)', array['teacher', 'academic_director', 'director'], 'published', false, 'normal', now() - interval '1 day'),
    (v_school, 'Sortie pédagogique (brouillon)', 'Brouillon en préparation pour la sortie au musée.', '{}', 'draft', false, 'normal', null);

  insert into public.admin_requests (school_id, requester_id, student_id, kind, subject, details, status)
  select v_school, '00000000-0000-4000-b000-000000000010', s.id, 'certificate', 'Certificat de scolarité', 'Pour un dossier de bourse (fictif).', 'open'
  from public.students s where s.user_id = '00000000-0000-4000-b000-000000000011';

  perform set_config('request.jwt.claims', '', true);
end $$;
