# Mise en ligne rapide (Supabase + Vercel)

Ce guide met l'application en ligne en une quinzaine de minutes, à partir d'un projet Supabase dont les migrations ont déjà été appliquées.

## 1. Base de données (Supabase)

1. Vérifiez que toutes les migrations de `supabase/migrations/` sont appliquées : Database → Migrations.
2. Ouvrez **SQL Editor**, collez le contenu de `supabase/manual/apply-in-sql-editor.sql` et exécutez-le. Ce script est sans risque et peut être relancé.
3. **Authentication → Sign In / Providers → Email** :
   - désactivez « Allow new users to sign up » : les comptes sont créés uniquement sur invitation ;
   - gardez « Confirm email » activé ;
   - longueur minimale du mot de passe : 10.
4. **Authentication → Multi-Factor** : vérifiez que **TOTP** est activé.
5. **Project Settings → API Keys** : notez l'URL du projet, la clé publique (anon) et la clé **service_role**. Cette dernière est secrète et ne doit jamais être partagée ni commitée.

## 2. Hébergement (Vercel)

1. Sur vercel.com : **Add New → Project**, importez le dépôt GitHub `edutech`. Le framework Next.js est détecté automatiquement.
2. Ajoutez les **variables d'environnement** (Production et Preview) :

| Variable                                           | Valeur                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                         | URL du projet Supabase                                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                    | clé publique (anon)                                              |
| `SUPABASE_SERVICE_ROLE_KEY`                        | clé service_role (cochez « Sensitive »)                          |
| `NEXT_PUBLIC_APP_URL`                              | l'URL Vercel, par ex. `https://edutech-xxx.vercel.app`           |
| `APP_ENV`                                          | `production`                                                     |
| `SECURITY_HASH_SALT`, `SETUP_TOKEN`, `CRON_SECRET` | trois valeurs aléatoires différentes : `openssl rand -base64 32` |
| `AI_PROVIDER`                                      | `disabled` (à activer plus tard, voir `assistant-ia.md`)         |
| `EMAIL_PROVIDER`                                   | `log` (ou `resend` avec `RESEND_API_KEY`)                        |

3. Cliquez sur **Deploy**.
   - `vercel.json` programme l'envoi des e-mails et SMS en file d'attente **une fois par jour**, seule fréquence autorisée par l'offre gratuite (Hobby).
   - Sur l'offre Pro, passez la planification à `*/5 * * * *` pour des envois toutes les 5 minutes, ou utilisez un service de cron externe qui appelle `GET /api/jobs/outbound` avec l'en-tête `Authorization: Bearer <CRON_SECRET>`.
   - Les notifications dans l'application sont, elles, immédiates.
4. Revenez dans Supabase → **Authentication → URL Configuration** :
   - **Site URL** : l'URL Vercel ;
   - **Redirect URLs** : `https://<votre-url>/auth/callback`.

## 3. Premier administrateur

1. Ouvrez `https://<votre-url>/setup`, saisissez le `SETUP_TOKEN`, votre nom, votre e-mail et un mot de passe d'au moins 10 caractères, avec lettres et chiffres.
2. Retirez `SETUP_TOKEN` des variables Vercel, puis redéployez.
3. Connectez-vous, ouvrez `/platform` et créez votre établissement.
4. Configurez l'établissement dans **Paramètres** (année, trimestres, niveaux, classes, matières, frais), puis invitez votre équipe dans **Paramètres → Utilisateurs**.
5. Activez la double authentification dans **Mon profil**.

## 4. Données de démonstration (facultatif)

Ne chargez la démo **que dans un projet Supabase dédié**, jamais dans la production :

1. Exécutez `supabase/seed.sql` dans l'éditeur SQL. Le script refuse de s'exécuter si un établissement réel existe.
2. Générez ensuite des mots de passe aléatoires pour les comptes de démonstration :

```bash
NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… APP_ENV=development pnpm demo:credentials
```
