# Sécurité

Ce document décrit les mesures **effectivement implémentées** et ce qui reste à la charge de l'exploitant. La liste des vérifications réellement exécutées figure dans `rapport.md`.

## 1. Modèle d'autorisation

| Barrière        | Implémentation                                                                                                                             | Rôle                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Interface       | `lib/authz.ts`, `features/navigation/nav.ts`                                                                                               | Confort uniquement : masquer les actions non permises. **Jamais une protection.**        |
| Serveur         | `assertCan` / `requirePermission` dans chaque service, Server Action et Route Handler                                                      | Refus explicite (`FORBIDDEN`) avant toute requête                                        |
| Base de données | RLS sur **toutes** les tables exposées, fonctions `private.*` (`SECURITY DEFINER`, `search_path=''`), RPC métier avec contrôles explicites | Garantie finale, y compris si l'API PostgREST est appelée directement avec un JWT valide |

La RLS est testée scénario par scénario dans `tests/db/rls.test.ts`. Ces tests couvrent :

- l'isolation entre établissements ;
- l'accès d'un parent à ses seuls enfants ;
- le périmètre d'un enseignant limité à ses classes ;
- la protection des données de santé et des notes validées ;
- les finances et les fichiers privés ;
- les rôles et les invitations ;
- les présences ;
- l'assistant IA.

Les autres invariants sont garantis en base :

- **Colonnes immuables** : `id`, `school_id` et `user_id` ne peuvent pas être modifiés via l'API (`REVOKE UPDATE`).
- **Clés étrangères composites** `(school_id, …)` : elles empêchent tout référencement inter-établissements.
- **Rôles privilégiés** : seul un administrateur peut les attribuer. Le dernier administrateur ne peut pas être retiré (`LAST_ADMIN`).
- **Comptes** : aucune inscription publique. L'accès se fait par une invitation à jeton aléatoire, stocké sous forme de hachage, à usage unique, avec expiration et liée à l'e-mail invité.

## 2. Authentification

- Supabase Auth : mot de passe d'au moins 10 caractères, avec lettres et chiffres (`schemas/auth.ts`).
- La session est validée côté serveur avec `auth.getUser()` à chaque requête. `proxy.ts` ne fait que rafraîchir les cookies et rediriger ; ce n'est **pas** une barrière d'autorisation.
- Limitation des tentatives (table `rate_limits`, fonction atomique `consume_rate_limit`) :
  - connexion : 5 essais par e-mail et 30 par IP sur 15 minutes, puis blocage de 15 minutes ;
  - mot de passe oublié : 3 demandes par e-mail et 10 par IP par heure, avec une réponse identique que le compte existe ou non ;
  - initialisation `/setup` : 5 essais par IP et par heure ;
  - assistant IA : 20 questions par utilisateur sur 10 minutes et 400 par établissement et par heure.
- Les journaux de connexion (`login_events`) ne contiennent que des **empreintes** (HMAC salé par `SECURITY_HASH_SALT`) de l'e-mail et de l'IP, jamais le mot de passe.
- L'utilisateur peut se déconnecter de tous ses appareils depuis son profil.
- Un compte suspendu (`memberships.status`, `profiles.is_active`) perd l'accès immédiatement, car la RLS vérifie l'appartenance active.

## 3. Protection des applications web

| Menace                    | Mesure                                                                                                                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| XSS                       | Échappement React. Aucun `dangerouslySetInnerHTML` sur un contenu utilisateur. Les réponses de l'IA sont rendues par un parseur maison qui ne produit que des nœuds texte. CSP stricte : `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`.                           |
| CSRF                      | Server Actions (vérification d'origine par Next.js) et cookies `SameSite=Lax`. Les routes `GET` ne modifient rien, sauf `/api/jobs/outbound`, protégée par un secret.                                                                                                                |
| Injection SQL             | Requêtes paramétrées (PostgREST, RPC). Aucune concaténation SQL. L'IA n'a **aucun** accès SQL.                                                                                                                                                                                       |
| Clickjacking              | `X-Frame-Options: DENY` et `frame-ancestors 'none'`.                                                                                                                                                                                                                                 |
| Redirections ouvertes     | `safeNextPath` n'autorise que des chemins internes en liste blanche (test unitaire).                                                                                                                                                                                                 |
| Fichiers malveillants     | Taille maximale de 10 Mo, type détecté par **signature binaire** (magic bytes) et non par l'extension ou le type déclaré, liste blanche PDF/PNG/JPEG/WebP, nom de fichier assaini, bucket privé, accès par URL signée de courte durée après contrôle d'accès à la ligne `documents`. |
| Injection de formules CSV | Les cellules commençant par `= + - @` sont préfixées (`lib/csv.ts`, test unitaire).                                                                                                                                                                                                  |
| Abus d'API                | Rate limiting (§2). Pagination et limites sur toutes les listes. Exports journalisés (`log_export`).                                                                                                                                                                                 |
| Fuite d'information       | Les erreurs PostgreSQL sont converties en messages génériques (`fromDbError`) et aucun détail interne n'est renvoyé au client ni à l'IA.                                                                                                                                             |

En-têtes envoyés sur toutes les réponses (`next.config.ts`) :

- `Content-Security-Policy` ;
- `X-Content-Type-Options` ;
- `X-Frame-Options` ;
- `Referrer-Policy` ;
- `Permissions-Policy` ;
- `Cross-Origin-Opener-Policy` ;
- `Strict-Transport-Security` (en production) ;
- `Cache-Control: private, no-store` sur `/api/*`.

Ces en-têtes sont vérifiés par les tests E2E.

> **Compromis CSP** : `script-src` inclut `'unsafe-inline'`, car le pré-rendu partiel de Next.js insère des scripts d'amorçage en ligne. Un nonce forcerait le rendu dynamique de toutes les pages. Le risque est atténué par l'absence de rendu HTML non fiable.

## 4. Clé de service (service role) : usages autorisés

La clé `SUPABASE_SERVICE_ROLE_KEY` contourne la RLS. Elle n'est utilisée **que** par `createAdminClient()` (`server/supabase/admin.ts`, avec `import "server-only"`), dans les cas suivants :

1. **L'administration Auth** : créer ou inviter un compte, et suspendre au niveau Auth. L'action est toujours déclenchée par une Server Action qui vérifie au préalable `users.create` / `users.manage` via le client utilisateur.
2. **La télémétrie de sécurité** : `login_events` et `rate_limits`, avant qu'une session n'existe.
3. **L'initialisation** du premier superadministrateur, protégée par `SETUP_TOKEN`, active uniquement s'il n'existe aucun superadministrateur, avec rate limiting.
4. **Le worker de notifications** `/api/jobs/outbound`, protégé par `CRON_SECRET` (comparaison en temps constant). Il ne lit et n'écrit que la file `outbound_messages`.
5. **Le script `demo-credentials`**, exécuté hors application, qui refuse de tourner en production ou si un établissement réel existe.

Aucune donnée métier n'est lue ni écrite au nom d'un utilisateur avec cette clé.

## 5. Secrets

- Les secrets vivent uniquement dans les variables d'environnement protégées de l'hébergeur. Seules les variables `NEXT_PUBLIC_*` atteignent le navigateur, et aucune n'est secrète.
- `server/env.ts` valide la configuration et n'est importable que côté serveur (`server-only`).
- `.env*` est ignoré par git, à l'exception de `.env.example`, qui ne contient aucune valeur.
- Rotation : changez la clé chez le fournisseur, mettez à jour la variable et redéployez. Pour `SECURITY_HASH_SALT`, la rotation invalide les compteurs de rate limiting en cours, ce qui est sans gravité.

## 6. Journalisation et données personnelles

- `audit_logs` contient l'auteur, l'action, l'entité et un différentiel des colonnes. Les colonnes sensibles (santé, jetons, etc.) sont remplacées par `[redacted]`. L'accès requiert `audit.read`.
- Les journaux applicatifs (`console.error`) ne contiennent que des codes d'erreur, jamais de mot de passe, de clé, de contenu de requête IA ni de données d'élève.
- L'assistant IA journalise uniquement le nom de l'outil, le résultat (ok/denied/invalid/error), le nombre d'enregistrements et la durée (`ai_tool_invocations`).
- Les données de santé sont dans une table séparée, `student_health`, accessible avec `health.read` uniquement.
- Les familles ne voient que leurs enfants rattachés. Les notes ne leur sont visibles qu'une fois **publiées**.

## 7. Données de démonstration

- Le fichier `supabase/seed.sql` contient des données fictives regroupées dans un établissement marqué `is_demo`.
- Le seed refuse de s'exécuter si un établissement réel existe.
- Les comptes de démonstration n'ont pas de mot de passe : `pnpm demo:credentials` en génère des aléatoires à la demande. Il n'y a **aucun mot de passe administrateur public permanent**.

## 8. Responsabilités de l'exploitant

- Désactiver les inscriptions publiques dans Supabase Auth et configurer un SMTP authentifié (SPF/DKIM).
- Activer la MFA pour les comptes du tableau de bord Supabase et de l'hébergeur.
- Activer les sauvegardes et la restauration à un instant donné (voir `sauvegardes.md`).
- Faire relire et signer l'accord de traitement avant d'activer `AI_ALLOW_PERSONAL_DATA`.
- Réaliser un test d'intrusion avant la mise en production. Aucun audit externe n'a été réalisé à ce jour.
