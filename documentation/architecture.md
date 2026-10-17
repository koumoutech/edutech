# Architecture et plan technique

## 1. Vue d'ensemble

EduDigi est un SaaS **multi-établissements** (multi-tenant) de gestion scolaire, de la maternelle au lycée, public ou privé.

| Couche     | Technologie                                                                                                                                         | Rôle                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Interface  | Next.js 16 (App Router, Server Components, Server Actions), React 19, TypeScript strict, Tailwind CSS 4, primitives Radix, Lucide, Motion, Recharts | Rendu serveur, formulaires, tableaux de bord                |
| Validation | Zod 4 (côté serveur **et** client), React Hook Form                                                                                                 | Toute entrée est revalidée côté serveur                     |
| Données    | Supabase : PostgreSQL 16, Auth, Storage, RLS                                                                                                        | Persistance, authentification, autorisation au niveau ligne |
| Documents  | pdf-lib (côté serveur)                                                                                                                              | Bulletins, reçus, certificats                               |
| IA         | API Claude via `@anthropic-ai/sdk` (côté serveur uniquement)                                                                                        | Assistant à outils contrôlés                                |
| Tests      | Vitest (unitaires + base de données), Playwright (E2E)                                                                                              | Voir `rapport.md`                                           |

```
Navigateur ──HTTPS──► Next.js (proxy.ts : rafraîchissement de session, redirections optimistes)
                         │
                         ├─ Server Components / Server Actions / Route Handlers
                         │     └─ services métier (src/server/services/*)
                         │           ├─ vérifient session + permission (assertCan)
                         │           └─ client Supabase **de l'utilisateur** (JWT) ─► PostgREST ─► PostgreSQL + RLS
                         │
                         ├─ Client privilégié (service role) : usages limités et documentés (securite.md §4)
                         └─ Assistant IA ─► outils métier (mêmes services, même RLS) ─► API Claude
```

## 2. Principes

1. **Trois barrières d'autorisation** : l'interface masque ce qui n'est pas permis (confort uniquement), les services serveur vérifient la permission (`assertCan`), et la base applique la RLS ainsi que des fonctions `SECURITY DEFINER` dotées de contrôles explicites. Une interface contournée ne donne donc accès à rien.
2. **Le moindre privilège** : les requêtes métier passent par le client Supabase de l'utilisateur, jamais par la clé de service.
3. **Les invariants vivent en base** : machines à états, notes validées verrouillées, cohérence des paiements, capacité des classes, conflits d'emploi du temps. Ils sont garantis par des contraintes et des triggers, quel que soit le client.
4. **Le cloisonnement des établissements** : chaque table métier porte un `school_id`. Les clés étrangères composites `(school_id, x)` empêchent de référencer une ligne d'un autre établissement, et les colonnes `id`, `school_id` et `user_id` sont non modifiables par l'API.
5. **L'audit** : un trigger générique écrit `audit_logs` pour les tables sensibles, avec masquage des champs sensibles.

## 3. Arborescence

```
src/
  app/                    routes (App Router)
    page.tsx              landing publique
    (auth)/               connexion, mot de passe oublié, initialisation (/setup)
    app/                  espace authentifié (tableaux de bord et modules)
    platform/             console superadministrateur
    api/                  exports CSV, PDF, URL signées, worker de notifications
  components/             UI réutilisable (ui/, charts/, dialogues…)
  features/<module>/      composants client et Server Actions d'un module
  lib/                    code partagé client/serveur (authz, utils, csv…)
  server/
    auth/                 session, contexte, sécurité (rate limiting, empreintes)
    services/             logique métier (un fichier par domaine)
    repositories/         requêtes partagées
    ai/                   assistant (outils, boucle, références)
    pdf/                  génération PDF
    messaging/            envoi e-mail / SMS
    supabase/             clients serveur (utilisateur / privilégié)
  proxy.ts                rafraîchissement de session (ex-middleware)
  types/database.ts       types générés depuis le schéma
supabase/
  migrations/             migrations SQL versionnées (ordre chronologique)
  seed.sql                données de démonstration fictives (isolées)
tests/
  unit/                   tests unitaires (Vitest)
  db/                     tests RLS et règles métier sur un vrai PostgreSQL
e2e/                      tests Playwright
documentation/            cette documentation
```

## 4. Modèle de données (résumé)

Les migrations sont commentées table par table. Voici les tables principales, par domaine.

| Domaine            | Tables principales                                                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plateforme         | `platform_settings`, `platform_admins`, `schools`, `school_counters`                                                                                                                                                   |
| Identité et droits | `profiles`, `permissions`, `roles`, `role_permissions` (avec une portée), `memberships`, `invitations`, `login_events`, `rate_limits`, `audit_logs`                                                                    |
| Structure scolaire | `academic_years`, `terms`, `cycles`, `levels`, `subjects`, `rooms`, `classes`, `class_subjects`, `bell_periods`                                                                                                        |
| Personnes          | `students`, `student_health` (accès restreint), `guardians`, `student_guardians`, `enrollments`, `staff_members`, `staff_contracts`, `staff_qualifications`, `staff_evaluations`, `leave_requests`, `staff_attendance` |
| Pédagogie          | `timetable_entries` (contraintes d'exclusion), `assessments`, `grades`, `grade_revisions`, `grading_policies`, `report_cards`, `attendance_sessions`, `attendance_records`, `absence_justifications`                   |
| Finances           | `fee_schedules`, `invoices`, `invoice_lines`, `payments`, `payment_allocations`, `payment_methods`, `expenses`, `expense_categories`, `budgets`                                                                        |
| Communication      | `announcements`, `notifications`, `notification_preferences`, `outbound_messages`, `message_threads`, `message_participants`, `messages`, `admin_requests`                                                             |
| Documents          | `documents` (métadonnées, fichier dans Storage), `document_templates`, `required_document_types`                                                                                                                       |
| IA                 | `ai_conversations`, `ai_messages`, `ai_tool_invocations` (audit sans contenu)                                                                                                                                          |

## 5. Rôles, permissions et portées

Une permission s'écrit `ressource.action`, par exemple `grades.validate` ou `finance.read`. Elle est accordée à un rôle avec une **portée** :

| Portée     | Signification               | Exemple                          |
| ---------- | --------------------------- | -------------------------------- |
| `school`   | tout l'établissement        | direction, comptable             |
| `assigned` | classes/matières attribuées | enseignant                       |
| `linked`   | enfants rattachés           | parent                           |
| `self`     | soi-même                    | élève, personnel pour ses congés |

Les rôles livrés sont : `school_admin`, `director`, `academic_director`, `secretary`, `accountant`, `teacher`, `supervisor`, `hr_manager`, `librarian`, `admin_staff`, `it_manager`, `student` et `parent`. Un établissement peut créer ses propres rôles et ajuster la matrice dans **Paramètres → Rôles**. Les rôles privilégiés ne peuvent être attribués que par un administrateur.

Les fonctions `private.has_perm`, `private.perm_scopes` et `private.can_access_*` évaluent ces règles dans les politiques RLS.

## 6. Flux clés

- **Inscription d'un élève** : `create_student` → `enroll_student` (contrôle de capacité et d'année) → génération éventuelle des factures de la classe.
- **Notes** : saisie (brouillon) → soumission → validation (verrouillage) → publication. Toute correction d'une note validée passe par `correct_grade`, avec un motif obligatoire et une trace dans `grade_revisions`.
- **Bulletins** : calcul serveur des moyennes pondérées et des rangs → appréciations → validation → publication → PDF.
- **Paiements** : `record_payment` répartit le montant sur les factures ouvertes (sans trop-perçu) → reçu PDF numéroté. Une erreur se corrige par contre-passation (`reverse_payment`) ou remboursement, jamais par suppression.
- **Absences** : appel (`save_attendance`) → notification des familles → justificatif → validation.
- **Notifications** : une notification in-app est créée, puis la file `outbound_messages` est traitée par `/api/jobs/outbound` (cron), avec des tentatives exponentielles.
