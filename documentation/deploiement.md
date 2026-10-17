# Déploiement : développement, préproduction, production

## 1. Environnements

| Environnement | Application                           | Base Supabase                                                                             | Données                                                                         | `APP_ENV`     |
| ------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------- |
| Développement | `pnpm dev` (poste local)              | projet « dev » ou `supabase start`                                                        | démo (`seed.sql`) autorisée                                                     | `development` |
| Préproduction | déploiement « Preview » / « Staging » | projet Supabase **distinct**                                                              | démo ou jeu anonymisé, **jamais** de données réelles copiées sans anonymisation | `staging`     |
| Production    | déploiement « Production »            | projet Supabase **dédié**, sauvegardes et restauration à un instant donné (PITR) activées | réelles uniquement, **jamais** de seed                                          | `production`  |

Chaque environnement a ses **propres** clés : URL et clés Supabase, `SETUP_TOKEN`, `CRON_SECRET`, `SECURITY_HASH_SALT` et clé IA. Aucune clé n'est partagée entre environnements.

## 2. Hébergement de l'application (exemple Vercel)

1. Importez le dépôt. Le framework est détecté automatiquement (Next.js) et la commande de build est `pnpm build`.
2. Définissez les variables de `.env.example` pour chaque environnement (Production / Preview), en ne marquant comme « Sensitive » que les secrets serveur.
3. Le fichier `vercel.json` déclare un cron toutes les 5 minutes sur `/api/jobs/outbound`. Vercel envoie `Authorization: Bearer $CRON_SECRET` : définissez `CRON_SECRET`.
4. Domaine : configurez le domaine, puis reportez l'URL dans `NEXT_PUBLIC_APP_URL` ainsi que dans **Supabase → Auth → URL Configuration** (Site URL et Redirect URLs `…/auth/callback`).

Tout autre hébergeur Node.js ≥ 20 convient (`pnpm build && pnpm start`). Il faut alors un planificateur externe qui appelle `GET /api/jobs/outbound` avec l'en-tête `Authorization`.

## 3. Migrations

Les migrations sont versionnées dans `supabase/migrations/`, appliquées dans l'ordre et **jamais modifiées une fois en production** : une correction passe toujours par une nouvelle migration.

```bash
supabase link --project-ref <ref-preprod>
supabase db push            # applique les migrations manquantes
```

Procédure de mise en production :

1. La CI doit être verte : lint, types, tests unitaires, migrations et RLS sur PostgreSQL jetable, build, E2E.
2. Appliquez les migrations en **préproduction**, puis lancez la recette fonctionnelle (rôles direction, enseignant, parent, comptable).
3. **Sauvegardez la production** (instantané manuel ou point PITR noté), voir `sauvegardes.md`.
4. Appliquez les migrations en production avec `supabase db push` sur le projet prod. Les migrations doivent rester **compatibles avec la version précédente de l'application** : ajouts de colonnes nullables, nouvelles fonctions. Les suppressions se font dans une migration ultérieure.
5. Déployez l'application.
6. Faites un contrôle rapide : connexion, tableau de bord, une lecture par module, puis `/api/jobs/outbound` dans les journaux du cron.

## 4. Retour arrière (rollback)

| Problème                                    | Action                                                                                                                                                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Régression applicative                      | Revenez au déploiement précédent : « Instant Rollback » / « Promote » sur Vercel, ou redéploiement du tag précédent. Les migrations étant rétrocompatibles, l'ancienne version fonctionne avec le nouveau schéma. |
| Migration défectueuse sans perte de données | Écrivez une **migration corrective** (`DROP`/`ALTER` inverse) et passez-la en préproduction, puis en production.                                                                                                  |
| Corruption ou perte de données              | Restaurez à un instant donné (PITR) juste avant la migration ou l'incident (`sauvegardes.md` §3), puis réappliquez les écritures légitimes postérieures si nécessaire.                                            |

Avant chaque migration de production, notez l'heure exacte (UTC) : c'est votre point de restauration.

## 5. Premier démarrage en production

1. Désactivez les inscriptions publiques dans Supabase Auth et configurez le SMTP.
2. Définissez `SETUP_TOKEN`, ouvrez `/setup` et créez le superadministrateur, puis **retirez `SETUP_TOKEN`** et redéployez.
3. Dans `/platform`, créez l'établissement (sans cocher « démonstration »).
4. Configurez l'établissement dans Paramètres (années, trimestres, niveaux, classes, matières, barèmes, frais), puis invitez l'équipe.
5. L'assistant IA reste désactivé (`AI_PROVIDER=disabled`) tant que l'accord de traitement n'est pas validé. Voir `assistant-ia.md`.

## 6. Supervision

- Surveillez les journaux de l'hébergeur : erreurs 5xx, `[ai] provider error`, `[rate-limit] database error`.
- Supabase : surveillez la taille de la base, les connexions et les journaux Auth.
- Vérifiez régulièrement la file `outbound_messages` : il ne doit pas y avoir de messages bloqués en `sending` (voir les limites connues dans `rapport.md`).
