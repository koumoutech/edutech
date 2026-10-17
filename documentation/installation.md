# Guide d'installation (développement local)

## Prérequis

- Node.js ≥ 20.9 (22 recommandé) et pnpm 10 (`corepack enable`).
- Un projet Supabase : soit hébergé (supabase.com), soit local via la CLI Supabase (`supabase start`, qui nécessite Docker).
- Pour les tests de base de données sans Supabase : PostgreSQL 16 et `psql`.

## 1. Dépendances

```bash
pnpm install
```

## 2. Variables d'environnement

```bash
cp .env.example .env.local
```

Renseignez au minimum :

| Variable                                                    | Où la trouver                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API                                      |
| `SUPABASE_SERVICE_ROLE_KEY`                                 | même page. **Secret serveur**, à ne jamais préfixer par `NEXT_PUBLIC_` |
| `SECURITY_HASH_SALT`                                        | `openssl rand -base64 32`                                              |
| `SETUP_TOKEN`                                               | `openssl rand -base64 32` (pour l'initialisation uniquement)           |
| `CRON_SECRET`                                               | `openssl rand -base64 32`                                              |

Sans variables Supabase, l'application démarre en mode « configuration requise » : les pages publiques fonctionnent et l'espace connecté est inaccessible.

## 3. Base de données

Appliquez les migrations **dans l'ordre** :

```bash
# Avec la CLI Supabase (projet lié ou local)
supabase db push            # ou : supabase migration up
```

Vous pouvez aussi exécuter chaque fichier de `supabase/migrations/` dans l'éditeur SQL de Supabase, dans l'ordre des noms.

### Réglages Supabase Auth

- **Site URL** : `http://localhost:3000`, ou l'URL publique en préproduction et en production.
- **Redirect URLs** : `http://localhost:3000/auth/callback`, avec l'équivalent pour chaque environnement.
- Désactivez les **inscriptions publiques** (Auth → Providers → Email → « Allow new users to sign up » : off). Les comptes sont créés uniquement sur invitation.
- Activez la confirmation d'e-mail et une longueur minimale de mot de passe de 10 caractères.
- Les modèles d'e-mail (invitation, réinitialisation) doivent pointer vers `{{ .SiteURL }}/auth/callback?...`.

## 4. Lancer l'application

```bash
pnpm dev
```

Ouvrez http://localhost:3000.

## 5. Créer le premier administrateur (procédure sécurisée)

1. Vérifiez que `SETUP_TOKEN` est défini côté serveur.
2. Ouvrez `/setup` et saisissez le jeton, votre nom, votre e-mail et un mot de passe robuste.
3. La page ne fonctionne **que tant qu'aucun superadministrateur n'existe**. Elle est limitée à 5 essais par heure et par IP, et le jeton est comparé en temps constant.
4. **Retirez `SETUP_TOKEN`** de l'environnement une fois le compte créé.
5. Connectez-vous, ouvrez `/platform`, créez l'établissement : vous en devenez administrateur. Invitez ensuite l'équipe depuis **Paramètres → Utilisateurs**.

## 6. Données de démonstration (facultatif, jamais en production)

```bash
psql "$DATABASE_URL" -f supabase/seed.sql      # refuse de s'exécuter si un établissement réel existe
APP_ENV=development pnpm demo:credentials      # génère des mots de passe ALÉATOIRES pour les 12 comptes démo
```

Les comptes de démonstration n'ont **aucun mot de passe** tant que le script n'a pas été lancé. Les mots de passe sont affichés une seule fois et ne sont stockés nulle part dans le dépôt. Relancer le script les fait tourner.

## 7. Vérifications

```bash
pnpm lint && pnpm typecheck && pnpm test     # qualité + tests unitaires
TEST_DATABASE_URL=postgres://postgres@localhost:5432/edudigi_test pnpm test:db   # RLS sur PostgreSQL jetable
pnpm build && pnpm test:e2e                  # E2E (Chromium)
```

`scripts/db-test-setup.sh` **supprime et recrée** la base indiquée par `TEST_DATABASE_URL`. Utilisez une base dédiée aux tests.

## 8. Types de la base

Après une modification du schéma :

```bash
TEST_DATABASE_URL=postgres://… pnpm db:types   # régénère src/types/database.ts
```

La CI échoue si les types ne correspondent plus aux migrations.
