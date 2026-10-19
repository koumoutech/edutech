# Rapport de livraison

État au 18 octobre 2026, branche `claude/nifty-curie-6zs6ib`.

## 1. Réalisé

| Domaine          | Contenu                                                                                                                                                                     | Où                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Base de données  | 17 migrations versionnées : schéma normalisé multi-établissements, RLS sur toutes les tables, fonctions métier, triggers d'invariants, audit, Storage et Realtime           | `supabase/migrations/`                             |
| Droits           | Catalogue de permissions avec portées, 13 rôles types, rôles personnalisés, matrice éditable                                                                                | migration 007, `/app/settings/roles`               |
| Authentification | Connexion, mot de passe oublié, définition du mot de passe, invitations, initialisation sécurisée du premier administrateur, suspension, déconnexion globale, rate limiting | `src/features/auth`, `src/server/auth`             |
| Interface        | Landing publique (chiffres marqués illustratifs), tableaux de bord par rôle, modes clair et sombre, mobile d'abord, animations désactivées si « mouvement réduit »          | `src/app`, `src/components`                        |
| Modules A à M    | Élèves, classes, personnel, emploi du temps, évaluations, notes et bulletins, présences, congés, finances, espace parents, communication, documents, rapports, paramètres   | voir `modules.md`                                  |
| Plateforme       | Console superadministrateur : établissements, identité du produit configurable                                                                                              | `/platform`                                        |
| Assistant IA     | Outils métier contrôlés, pseudonymisation, boucle bornée, confirmation explicite des brouillons, audit sans contenu                                                         | `src/server/ai`, `/app/assistant`                  |
| Documents        | Bulletins, reçus, certificats PDF, modèles personnalisables, exports CSV protégés                                                                                           | `src/server/pdf`, `/api/*`                         |
| Démo             | Établissement fictif isolé, 70 élèves, comptes sans mot de passe, script de mots de passe aléatoires                                                                        | `supabase/seed.sql`, `scripts/demo-credentials.ts` |
| Qualité          | ESLint, Prettier, TypeScript strict, Vitest (unitaire et base), Playwright, CI GitHub Actions                                                                               | `.github/workflows/ci.yml`                         |
| Documentation    | Architecture, installation, déploiement et rollback, sécurité, sauvegardes, IA, modules, modèles de documents                                                               | `documentation/`                                   |

## 2. Tests réellement exécutés

Toutes ces commandes ont été lancées dans l'environnement de développement le 18/10/2026 et sont revenues sans erreur.

| Vérification    | Commande                                                     | Résultat                                                              |
| --------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| Formatage       | `pnpm format:check`                                          | conforme                                                              |
| Lint            | `pnpm lint` (0 avertissement toléré)                         | 0 erreur                                                              |
| Types           | `pnpm typecheck`                                             | 0 erreur                                                              |
| Unitaires       | `pnpm test`                                                  | **74 tests réussis** (11 fichiers)                                    |
| Base de données | `scripts/db-test-setup.sh --seed` puis `vitest --project db` | **55 tests réussis** : migrations et seed appliqués sur PostgreSQL 16 |
| Build           | `pnpm build`                                                 | réussi (toutes les routes)                                            |
| E2E             | `pnpm test:e2e` (Chromium, profils bureau et mobile)         | **36 tests réussis**                                                  |

### Ce que couvrent les tests

- **Unitaires** :
  - calcul des moyennes et barèmes ;
  - import CSV et neutralisation des formules ;
  - détection des types de fichiers ;
  - classes et capacité ;
  - rendu des modèles et PDF ;
  - finances (répartition des paiements) ;
  - conflits d'emploi du temps ;
  - livraison e-mail/SMS (échappement HTML, tentatives) ;
  - assistant IA : autorisations, refus sans accès base, pseudonymisation, refus du modèle, limite d'étapes, audit sans arguments ;
  - helpers de sécurité : redirections, comparaison en temps constant ;
  - double authentification : code invalide, limitation des essais, redirection sûre, désactivation soumise à un code valide.
- **Base de données (RLS)** :
  - isolation entre établissements ;
  - accès anonyme refusé ;
  - parents limités à leurs enfants ;
  - élèves limités à eux-mêmes ;
  - données de santé ;
  - enseignants limités à leurs classes ;
  - notes validées verrouillées et corrections motivées ;
  - visibilité des notes publiées uniquement ;
  - finances (factures, paiements, trop-perçu) ;
  - fichiers privés ;
  - rôles privilégiés et dernier administrateur ;
  - invitations ;
  - présences ;
  - conversations IA privées et audit IA ;
  - absence d'escalade de privilèges par les rôles ;
  - colonnes calculées et colonnes « auteur » non falsifiables ;
  - workflow des dépenses ;
  - réglages réservés à la plateforme ;
  - pointage du personnel ;
  - double authentification (aucune donnée en `aal1` lorsqu'un facteur existe).
- **E2E** :
  - pages publiques et absence de débordement horizontal sur mobile ;
  - formulaire de connexion accessible ;
  - pages légales et 404 ;
  - en-têtes de sécurité ;
  - absence d'erreur console (compatibilité CSP et hydratation) ;
  - redirection vers la connexion des pages protégées ;
  - refus des exports anonymes ;
  - refus du worker sans secret.

## 2 bis. Projet Supabase « edudigi » (19/10/2026)

- Projet créé dans l'organisation KOUMOU Tech, région `eu-west-3` (Paris).
- Toutes les migrations ont été appliquées, à trois instructions près : elles sont jugées « destructives » par l'outil d'automatisation et doivent être exécutées à la main via `supabase/manual/apply-in-sql-editor.sql`.
  - Ce script a été validé sur PostgreSQL : deux exécutions successives, puis 55 tests RLS réussis.
- La suppression de la politique `roles_manage` a été remplacée, sur ce projet, par un `alter policy` équivalent (rôles système non modifiables).
- Conseiller sécurité Supabase :
  - `set_updated_at` corrigé (`search_path` fixé) ;
  - les avertissements « SECURITY DEFINER exécutable » sont attendus : ce sont les RPC métier, toutes contrôlées.
- Conseiller performance : optimisations possibles (`auth.uid()` encapsulé dans les politiques, index de clés étrangères), non bloquantes.
- L'application n'a pas pu être testée contre ce projet depuis l'environnement de développement : le réseau sortant vers `supabase.co` y est bloqué.

## 3. Non vérifié, à faire par l'exploitant

- **Pile Supabase complète** (Auth, PostgREST, Storage, Realtime) : elle n'a pas pu être lancée dans l'environnement de développement (téléchargements bloqués). Les tests de base tournent sur PostgreSQL 16 avec une **émulation** des schémas `auth` et `storage` (`tests/db/supabase-shim.sql`). Les requêtes applicatives sont typées à partir du schéma réel, mais n'ont pas été exécutées contre PostgREST.
- **Parcours E2E connectés** (saisie de notes, paiement, etc.) : non automatisés, car ils nécessitent un projet Supabase. Une recette manuelle avec les comptes de démonstration est à faire en préproduction.
- **Assistant IA** : aucun appel réel à l'API Claude, faute de clé. Le comportement a été testé avec un client simulé. Voir la recette dans `assistant-ia.md` §6.
- **E-mail et SMS réels** (Resend, Twilio) : seul le mode `log` a été exécuté.
- **Workflow CI** : écrit, mais pas encore exécuté sur GitHub au moment de ce rapport.
- **Performance et charge, audit d'accessibilité complet, test d'intrusion** : non réalisés.

## 4. Limites connues et écarts

1. **Double authentification** : le parcours TOTP s'appuie sur l'API MFA de Supabase Auth. Il est testé avec un client simulé et l'application en base est testée sur PostgreSQL, mais il n'a pas été exécuté contre un vrai Supabase Auth. Il faut activer TOTP dans Supabase (Auth → MFA).
2. **TanStack Table** : non utilisé. Les tableaux sont des composants maison avec pagination, filtres et tri **côté serveur**, plus adaptés aux volumes multi-établissements. La dépendance a été retirée.
3. **Paiement en ligne** : non intégré. Les paiements, y compris mobile money, sont **enregistrés** par la comptabilité avec une référence de transaction obligatoire. Il n'y a pas de passerelle de paiement.
4. **File d'envoi** : livraison « au moins une fois ». Un message réservé par un worker interrompu est automatiquement remis en file après un bail de 10 minutes, en comptant une tentative.
5. **CSP** : `script-src 'unsafe-inline'` est requis par le pré-rendu partiel de Next.js (voir `securite.md` §3).
6. **PDF** : polices standard WinAnsi. Les caractères hors Latin-1 sont translittérés.
7. **Langue** : interface en français uniquement.
8. **Rate limiting sans clé de service** : en développement uniquement, il bascule sur un compteur en mémoire par instance.

## 5. Prochaines étapes recommandées

1. Créer un projet Supabase de préproduction et appliquer les migrations.
2. Initialiser l'administrateur, charger la démo et faire la recette manuelle par rôle.
3. Lancer la CI sur GitHub et corriger d'éventuels écarts d'environnement.
4. Ajouter des E2E connectés contre la préproduction (Playwright avec `E2E_BASE_URL`).
5. Activer TOTP dans Supabase Auth et tester la double authentification avec un compte réel.
6. Faire la recette de l'assistant IA avec une clé de préproduction, signer le DPA, puis l'activer.
7. Réaliser un test d'intrusion avant l'ouverture en production.
