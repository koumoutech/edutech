-- =============================================================================
-- EduDigi — Permission catalogue, default roles and school defaults.
-- =============================================================================

insert into public.permissions (key, resource, action, label, sensitive) values
  ('school.manage',          'school',       'manage',   'Administrer l''établissement', true),
  ('users.read',             'users',        'read',     'Consulter les utilisateurs', false),
  ('users.create',           'users',        'create',   'Inviter des utilisateurs', true),
  ('users.manage',           'users',        'manage',   'Gérer les comptes et rôles attribués', true),
  ('roles.manage',           'roles',        'manage',   'Gérer les rôles et permissions', true),
  ('audit.read',             'audit',        'read',     'Consulter le journal d''audit', true),
  ('academics.manage',       'academics',    'manage',   'Gérer années, niveaux, classes, matières', false),
  ('students.read',          'students',     'read',     'Consulter les élèves', false),
  ('students.create',        'students',     'create',   'Inscrire des élèves', false),
  ('students.update',        'students',     'update',   'Modifier les dossiers élèves', false),
  ('students.delete',        'students',     'delete',   'Archiver des élèves', true),
  ('students.export',        'students',     'export',   'Exporter les élèves', true),
  ('health.read',            'health',       'read',     'Consulter les données médicales', true),
  ('guardians.read',         'guardians',    'read',     'Consulter les responsables légaux', false),
  ('guardians.manage',       'guardians',    'manage',   'Gérer les responsables et rattachements', true),
  ('enrollments.manage',     'enrollments',  'manage',   'Gérer inscriptions, affectations et transferts', false),
  ('staff.read',             'staff',        'read',     'Consulter le personnel', false),
  ('staff.manage',           'staff',        'manage',   'Gérer le personnel', false),
  ('hr.read',                'hr',           'read',     'Consulter les dossiers RH', true),
  ('hr.manage',              'hr',           'manage',   'Gérer contrats et évaluations', true),
  ('leaves.read',            'leaves',       'read',     'Consulter les congés et absences du personnel', false),
  ('leaves.create',          'leaves',       'create',   'Déclarer une absence ou demander un congé', false),
  ('leaves.validate',        'leaves',       'validate', 'Valider les congés', false),
  ('timetable.read',         'timetable',    'read',     'Consulter les emplois du temps', false),
  ('timetable.manage',       'timetable',    'manage',   'Gérer les emplois du temps', false),
  ('assessments.read',       'assessments',  'read',     'Consulter les évaluations', false),
  ('assessments.create',     'assessments',  'create',   'Créer des évaluations', false),
  ('assessments.update',     'assessments',  'update',   'Modifier des évaluations', false),
  ('assessments.delete',     'assessments',  'delete',   'Supprimer des évaluations', false),
  ('assessments.validate',   'assessments',  'validate', 'Valider des évaluations', false),
  ('assessments.publish',    'assessments',  'publish',  'Publier des résultats', false),
  ('grades.read',            'grades',       'read',     'Consulter les notes', false),
  ('grades.create',          'grades',       'create',   'Saisir les notes', false),
  ('grades.validate',        'grades',       'validate', 'Corriger des notes validées', true),
  ('grades.export',          'grades',       'export',   'Exporter les notes', true),
  ('report_cards.read',      'report_cards', 'read',     'Consulter les bulletins', false),
  ('report_cards.create',    'report_cards', 'create',   'Générer les bulletins', false),
  ('report_cards.validate',  'report_cards', 'validate', 'Valider les bulletins', false),
  ('report_cards.publish',   'report_cards', 'publish',  'Publier les bulletins', false),
  ('attendance.read',        'attendance',   'read',     'Consulter les présences', false),
  ('attendance.create',      'attendance',   'create',   'Faire l''appel', false),
  ('attendance.update',      'attendance',   'update',   'Modifier les présences', false),
  ('attendance.export',      'attendance',   'export',   'Exporter les présences', true),
  ('justifications.create',  'justifications','create',  'Justifier une absence', false),
  ('justifications.validate','justifications','validate','Valider les justificatifs', false),
  ('finance.read',           'finance',      'read',     'Consulter les finances', true),
  ('finance.manage',         'finance',      'manage',   'Paramétrer frais, réductions et modes de paiement', true),
  ('invoices.create',        'invoices',     'create',   'Créer et émettre des factures', true),
  ('payments.create',        'payments',     'create',   'Encaisser des paiements', true),
  ('payments.validate',      'payments',     'validate', 'Rapprocher, annuler et rembourser', true),
  ('finance.export',         'finance',      'export',   'Exporter les données financières', true),
  ('expenses.read',          'expenses',     'read',     'Consulter les dépenses', true),
  ('expenses.create',        'expenses',     'create',   'Saisir des dépenses', true),
  ('expenses.validate',      'expenses',     'validate', 'Approuver des dépenses', true),
  ('budgets.manage',         'budgets',      'manage',   'Gérer les budgets', true),
  ('announcements.read',     'announcements','read',     'Lire les annonces', false),
  ('announcements.create',   'announcements','create',   'Rédiger des annonces', false),
  ('announcements.publish',  'announcements','publish',  'Publier des annonces', false),
  ('messages.create',        'messages',     'create',   'Envoyer des messages', false),
  ('documents.read',         'documents',    'read',     'Consulter les documents', false),
  ('documents.create',       'documents',    'create',   'Générer et téléverser des documents', false),
  ('documents.delete',       'documents',    'delete',   'Supprimer des documents', true),
  ('templates.manage',       'templates',    'manage',   'Gérer les modèles de documents', false),
  ('requests.create',        'requests',     'create',   'Soumettre des demandes', false),
  ('requests.manage',        'requests',     'manage',   'Traiter les demandes administratives', false),
  ('reports.read',           'reports',      'read',     'Consulter les rapports', false),
  ('reports.export',         'reports',      'export',   'Exporter les rapports', true),
  ('ai.use',                 'ai',           'read',     'Utiliser l''assistant IA', false);

-- Default role templates. scope: s = school, a = assigned, l = linked, m = self (me).
create table private.role_templates (
  key text primary key,
  name text not null,
  description text not null,
  is_privileged boolean not null default false,
  position smallint not null
);

create table private.role_template_permissions (
  role_key text not null references private.role_templates (key) on delete cascade,
  permission_key text not null references public.permissions (key),
  scope text not null,
  primary key (role_key, permission_key)
);

insert into private.role_templates (key, name, description, is_privileged, position) values
  ('school_admin',      'Administrateur d''établissement', 'Accès complet à l''établissement', true, 1),
  ('director',          'Directeur',                     'Pilotage, validation et décisions', true, 2),
  ('academic_director', 'Directeur des études',          'Responsable pédagogique', false, 3),
  ('secretary',         'Secrétaire',                    'Inscriptions, dossiers et documents', false, 4),
  ('accountant',        'Comptable',                     'Facturation, encaissements et dépenses', false, 5),
  ('teacher',           'Enseignant',                    'Classes et matières attribuées', false, 6),
  ('supervisor',        'Surveillant',                   'Présences et vie scolaire', false, 7),
  ('hr_manager',        'Responsable RH',                'Personnel, contrats et congés', false, 8),
  ('librarian',         'Bibliothécaire',                'Bibliothèque et ressources', false, 9),
  ('admin_staff',       'Personnel administratif',       'Accueil et demandes administratives', false, 10),
  ('it_manager',        'Responsable informatique',      'Comptes utilisateurs et sécurité', true, 11),
  ('student',           'Élève',                         'Accès à ses propres données', false, 12),
  ('parent',            'Parent / tuteur',               'Accès aux enfants rattachés', false, 13);

-- school_admin: every permission, school-wide
insert into private.role_template_permissions (role_key, permission_key, scope)
select 'school_admin', key, 'school' from public.permissions;

-- director: everything except role management
insert into private.role_template_permissions (role_key, permission_key, scope)
select 'director', key, 'school' from public.permissions where key not in ('roles.manage');

insert into private.role_template_permissions (role_key, permission_key, scope)
select r.role_key, r.perm, case r.scope when 's' then 'school' when 'a' then 'assigned' when 'l' then 'linked' else 'self' end
from (values
  -- Academic director
  ('academic_director', 'academics.manage', 's'), ('academic_director', 'students.read', 's'),
  ('academic_director', 'students.update', 's'), ('academic_director', 'students.export', 's'),
  ('academic_director', 'guardians.read', 's'), ('academic_director', 'enrollments.manage', 's'),
  ('academic_director', 'staff.read', 's'), ('academic_director', 'leaves.read', 's'),
  ('academic_director', 'timetable.read', 's'), ('academic_director', 'timetable.manage', 's'),
  ('academic_director', 'assessments.read', 's'), ('academic_director', 'assessments.create', 's'),
  ('academic_director', 'assessments.update', 's'), ('academic_director', 'assessments.delete', 's'),
  ('academic_director', 'assessments.validate', 's'), ('academic_director', 'assessments.publish', 's'),
  ('academic_director', 'grades.read', 's'), ('academic_director', 'grades.create', 's'),
  ('academic_director', 'grades.validate', 's'), ('academic_director', 'grades.export', 's'),
  ('academic_director', 'report_cards.read', 's'), ('academic_director', 'report_cards.create', 's'),
  ('academic_director', 'report_cards.validate', 's'), ('academic_director', 'report_cards.publish', 's'),
  ('academic_director', 'attendance.read', 's'), ('academic_director', 'attendance.update', 's'),
  ('academic_director', 'attendance.export', 's'), ('academic_director', 'justifications.validate', 's'),
  ('academic_director', 'announcements.read', 's'), ('academic_director', 'announcements.create', 's'),
  ('academic_director', 'announcements.publish', 's'), ('academic_director', 'messages.create', 's'),
  ('academic_director', 'documents.read', 's'), ('academic_director', 'documents.create', 's'),
  ('academic_director', 'requests.create', 's'), ('academic_director', 'reports.read', 's'),
  ('academic_director', 'reports.export', 's'), ('academic_director', 'ai.use', 's'),
  ('academic_director', 'leaves.create', 'm'), ('academic_director', 'hr.read', 'm'),
  -- Secretary
  ('secretary', 'students.read', 's'), ('secretary', 'students.create', 's'), ('secretary', 'students.update', 's'),
  ('secretary', 'students.export', 's'), ('secretary', 'health.read', 's'), ('secretary', 'guardians.read', 's'),
  ('secretary', 'guardians.manage', 's'), ('secretary', 'enrollments.manage', 's'), ('secretary', 'staff.read', 's'),
  ('secretary', 'users.read', 's'), ('secretary', 'timetable.read', 's'), ('secretary', 'assessments.read', 's'),
  ('secretary', 'report_cards.read', 's'), ('secretary', 'attendance.read', 's'),
  ('secretary', 'justifications.validate', 's'), ('secretary', 'announcements.read', 's'),
  ('secretary', 'announcements.create', 's'), ('secretary', 'messages.create', 's'),
  ('secretary', 'documents.read', 's'), ('secretary', 'documents.create', 's'), ('secretary', 'documents.delete', 's'),
  ('secretary', 'templates.manage', 's'), ('secretary', 'requests.create', 's'), ('secretary', 'requests.manage', 's'),
  ('secretary', 'reports.read', 's'), ('secretary', 'ai.use', 's'),
  ('secretary', 'leaves.create', 'm'), ('secretary', 'leaves.read', 'm'), ('secretary', 'hr.read', 'm'),
  -- Accountant
  ('accountant', 'finance.read', 's'), ('accountant', 'finance.manage', 's'), ('accountant', 'invoices.create', 's'),
  ('accountant', 'payments.create', 's'), ('accountant', 'payments.validate', 's'), ('accountant', 'finance.export', 's'),
  ('accountant', 'expenses.read', 's'), ('accountant', 'expenses.create', 's'), ('accountant', 'expenses.validate', 's'),
  ('accountant', 'budgets.manage', 's'), ('accountant', 'students.read', 's'), ('accountant', 'guardians.read', 's'),
  ('accountant', 'documents.read', 's'), ('accountant', 'documents.create', 's'), ('accountant', 'reports.read', 's'),
  ('accountant', 'reports.export', 's'), ('accountant', 'announcements.read', 's'), ('accountant', 'messages.create', 's'),
  ('accountant', 'requests.create', 's'), ('accountant', 'ai.use', 's'), ('accountant', 'timetable.read', 's'),
  ('accountant', 'leaves.create', 'm'), ('accountant', 'leaves.read', 'm'), ('accountant', 'hr.read', 'm'),
  ('accountant', 'staff.read', 'm'),
  -- Teacher
  ('teacher', 'students.read', 'a'), ('teacher', 'guardians.read', 'a'), ('teacher', 'timetable.read', 's'),
  ('teacher', 'assessments.read', 'a'), ('teacher', 'assessments.create', 'a'), ('teacher', 'assessments.update', 'a'),
  ('teacher', 'assessments.delete', 'a'), ('teacher', 'grades.read', 'a'), ('teacher', 'grades.create', 'a'),
  ('teacher', 'report_cards.read', 'a'), ('teacher', 'attendance.read', 'a'), ('teacher', 'attendance.create', 'a'),
  ('teacher', 'attendance.update', 'a'), ('teacher', 'documents.read', 'a'), ('teacher', 'announcements.read', 's'),
  ('teacher', 'messages.create', 's'), ('teacher', 'requests.create', 's'), ('teacher', 'reports.read', 'a'),
  ('teacher', 'ai.use', 's'), ('teacher', 'leaves.create', 'm'), ('teacher', 'leaves.read', 'm'),
  ('teacher', 'staff.read', 'm'), ('teacher', 'hr.read', 'm'),
  -- Supervisor
  ('supervisor', 'students.read', 's'), ('supervisor', 'guardians.read', 's'), ('supervisor', 'attendance.read', 's'),
  ('supervisor', 'attendance.create', 's'), ('supervisor', 'attendance.update', 's'),
  ('supervisor', 'justifications.validate', 's'), ('supervisor', 'timetable.read', 's'),
  ('supervisor', 'announcements.read', 's'), ('supervisor', 'messages.create', 's'), ('supervisor', 'requests.create', 's'),
  ('supervisor', 'reports.read', 's'), ('supervisor', 'ai.use', 's'), ('supervisor', 'leaves.create', 'm'),
  ('supervisor', 'leaves.read', 'm'), ('supervisor', 'hr.read', 'm'), ('supervisor', 'staff.read', 'm'),
  -- HR manager
  ('hr_manager', 'staff.read', 's'), ('hr_manager', 'staff.manage', 's'), ('hr_manager', 'hr.read', 's'),
  ('hr_manager', 'hr.manage', 's'), ('hr_manager', 'leaves.read', 's'), ('hr_manager', 'leaves.create', 's'),
  ('hr_manager', 'leaves.validate', 's'), ('hr_manager', 'users.read', 's'), ('hr_manager', 'timetable.read', 's'),
  ('hr_manager', 'announcements.read', 's'), ('hr_manager', 'announcements.create', 's'),
  ('hr_manager', 'messages.create', 's'), ('hr_manager', 'requests.create', 's'), ('hr_manager', 'reports.read', 's'),
  ('hr_manager', 'ai.use', 's'),
  -- Librarian
  ('librarian', 'students.read', 's'), ('librarian', 'timetable.read', 's'), ('librarian', 'announcements.read', 's'),
  ('librarian', 'messages.create', 's'), ('librarian', 'requests.create', 's'), ('librarian', 'ai.use', 's'),
  ('librarian', 'leaves.create', 'm'), ('librarian', 'leaves.read', 'm'), ('librarian', 'staff.read', 'm'),
  ('librarian', 'hr.read', 'm'),
  -- Administrative staff
  ('admin_staff', 'students.read', 's'), ('admin_staff', 'guardians.read', 's'), ('admin_staff', 'documents.read', 's'),
  ('admin_staff', 'requests.create', 's'), ('admin_staff', 'requests.manage', 's'), ('admin_staff', 'timetable.read', 's'),
  ('admin_staff', 'announcements.read', 's'), ('admin_staff', 'messages.create', 's'), ('admin_staff', 'ai.use', 's'),
  ('admin_staff', 'leaves.create', 'm'), ('admin_staff', 'leaves.read', 'm'), ('admin_staff', 'staff.read', 'm'),
  ('admin_staff', 'hr.read', 'm'),
  -- IT manager
  ('it_manager', 'users.read', 's'), ('it_manager', 'users.create', 's'), ('it_manager', 'users.manage', 's'),
  ('it_manager', 'roles.manage', 's'), ('it_manager', 'audit.read', 's'), ('it_manager', 'school.manage', 's'),
  ('it_manager', 'announcements.read', 's'), ('it_manager', 'messages.create', 's'), ('it_manager', 'requests.create', 's'),
  ('it_manager', 'ai.use', 's'), ('it_manager', 'leaves.create', 'm'), ('it_manager', 'leaves.read', 'm'),
  ('it_manager', 'staff.read', 'm'), ('it_manager', 'hr.read', 'm'),
  -- Student
  ('student', 'students.read', 'm'), ('student', 'timetable.read', 'm'), ('student', 'assessments.read', 'm'),
  ('student', 'grades.read', 'm'), ('student', 'report_cards.read', 'm'), ('student', 'attendance.read', 'm'),
  ('student', 'documents.read', 'm'), ('student', 'requests.create', 'm'), ('student', 'announcements.read', 's'),
  ('student', 'messages.create', 's'), ('student', 'ai.use', 's'),
  -- Parent
  ('parent', 'students.read', 'l'), ('parent', 'timetable.read', 'l'), ('parent', 'assessments.read', 'l'),
  ('parent', 'grades.read', 'l'), ('parent', 'report_cards.read', 'l'), ('parent', 'attendance.read', 'l'),
  ('parent', 'justifications.create', 'l'), ('parent', 'finance.read', 'l'), ('parent', 'documents.read', 'l'),
  ('parent', 'health.read', 'l'), ('parent', 'requests.create', 'l'), ('parent', 'announcements.read', 's'),
  ('parent', 'messages.create', 's'), ('parent', 'ai.use', 's')
) as r(role_key, perm, scope);

-- -----------------------------------------------------------------------------
-- Seeds the configuration every new school starts with.
-- -----------------------------------------------------------------------------
create or replace function private.seed_school_defaults(p_school uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.roles (school_id, key, name, description, is_system, is_privileged)
  select p_school, t.key, t.name, t.description, true, t.is_privileged
  from private.role_templates t
  on conflict (school_id, key) do nothing;

  insert into public.role_permissions (role_id, permission_key, scope)
  select r.id, tp.permission_key, tp.scope
  from private.role_template_permissions tp
  join public.roles r on r.school_id = p_school and r.key = tp.role_key
  on conflict do nothing;

  insert into public.grading_policies (school_id, name, is_default)
  values (p_school, 'Barème standard sur 20', true)
  on conflict do nothing;

  insert into public.assessment_types (school_id, name, default_coefficient) values
    (p_school, 'Interrogation', 1), (p_school, 'Devoir surveillé', 2), (p_school, 'Composition', 3),
    (p_school, 'Travaux pratiques', 1), (p_school, 'Oral', 1)
  on conflict do nothing;

  insert into public.payment_methods (school_id, name, kind, requires_reference) values
    (p_school, 'Espèces', 'cash', false), (p_school, 'Mobile Money', 'mobile_money', true),
    (p_school, 'Virement bancaire', 'bank_transfer', true), (p_school, 'Chèque', 'cheque', true),
    (p_school, 'Carte bancaire', 'card', true)
  on conflict do nothing;

  insert into public.fee_types (school_id, name, category) values
    (p_school, 'Frais d''inscription', 'registration'), (p_school, 'Frais de scolarité', 'tuition'),
    (p_school, 'Frais d''examen', 'exam'), (p_school, 'Cantine', 'canteen'), (p_school, 'Transport', 'transport')
  on conflict do nothing;

  insert into public.expense_categories (school_id, name) values
    (p_school, 'Salaires'), (p_school, 'Fournitures'), (p_school, 'Maintenance'), (p_school, 'Énergie et eau'),
    (p_school, 'Transport'), (p_school, 'Activités'), (p_school, 'Autres')
  on conflict do nothing;

  insert into public.required_document_types (school_id, name, applies_to, is_mandatory) values
    (p_school, 'Extrait d''acte de naissance', 'student', true), (p_school, 'Photo d''identité', 'student', true),
    (p_school, 'Certificat de scolarité précédent', 'student', false), (p_school, 'Carnet de vaccination', 'student', false),
    (p_school, 'Diplôme', 'staff', true), (p_school, 'Pièce d''identité', 'staff', true)
  on conflict do nothing;

  insert into public.document_templates (school_id, kind, name, title, body) values
    (p_school, 'enrollment_certificate', 'Certificat de scolarité', 'CERTIFICAT DE SCOLARITÉ',
     E'Je soussigné(e), {{signatory_name}}, {{signatory_title}} de {{school_name}}, certifie que l''élève {{student_full_name}}, né(e) le {{student_birth_date}} à {{student_birth_place}}, matricule {{student_matricule}}, est régulièrement inscrit(e) en classe de {{class_name}} pour l''année scolaire {{academic_year}}.\n\nEn foi de quoi, le présent certificat lui est délivré pour servir et valoir ce que de droit.'),
    (p_school, 'attendance_certificate', 'Attestation d''assiduité', 'ATTESTATION D''ASSIDUITÉ',
     E'La direction de {{school_name}} atteste que l''élève {{student_full_name}} (matricule {{student_matricule}}), inscrit(e) en {{class_name}}, a suivi les cours de l''année scolaire {{academic_year}}.\n\nNombre d''absences enregistrées : {{absences_count}}.'),
    (p_school, 'convocation', 'Convocation des parents', 'CONVOCATION',
     E'Madame, Monsieur,\n\nVous êtes prié(e) de vous présenter à {{school_name}} au sujet de l''élève {{student_full_name}} ({{class_name}}).\n\n{{custom_message}}'),
    (p_school, 'transfer_certificate', 'Certificat de radiation', 'CERTIFICAT DE RADIATION',
     E'La direction de {{school_name}} certifie que l''élève {{student_full_name}}, matricule {{student_matricule}}, a quitté l''établissement. Il/elle était inscrit(e) en {{class_name}} pour l''année scolaire {{academic_year}}.')
  on conflict do nothing;
end;
$$;
