# EduDigi — plateforme de gestion scolaire

SaaS multi-établissements de la maternelle au lycée, pour le public comme pour le privé. Il couvre les élèves, les classes, le personnel, l'emploi du temps, les notes et bulletins, les présences, les finances, l'espace parents, la communication, les documents, les rapports et un assistant IA à outils contrôlés.

Le nom du produit est configurable (`NEXT_PUBLIC_APP_NAME`, puis la console `/platform`).

**Stack** : Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 · Radix · Recharts · Zod · Supabase (PostgreSQL, Auth, RLS, Storage, Realtime) · pdf-lib · API Claude · Vitest · Playwright.

## Démarrage rapide

```bash
pnpm install
cp .env.example .env.local        # renseigner Supabase et les secrets serveur
supabase db push                  # appliquer supabase/migrations/
pnpm dev                          # http://localhost:3000
```

Créez ensuite le premier administrateur sur `/setup`, avec `SETUP_TOKEN` (voir [installation](documentation/installation.md)).

## Commandes

| Commande                                             | Rôle                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start`             | développement / build / production                                           |
| `pnpm lint` · `pnpm typecheck` · `pnpm format:check` | qualité                                                                      |
| `pnpm test`                                          | tests unitaires                                                              |
| `TEST_DATABASE_URL=… pnpm test:db`                   | migrations et tests RLS sur une base PostgreSQL **jetable**                  |
| `pnpm test:e2e`                                      | tests Playwright (après `pnpm build`)                                        |
| `pnpm db:types`                                      | régénère `src/types/database.ts`                                             |
| `pnpm demo:credentials`                              | mots de passe aléatoires pour les comptes de démonstration (hors production) |

## Documentation

- [Architecture et modèle de données](documentation/architecture.md)
- [Mise en ligne rapide (Supabase + Vercel)](documentation/mise-en-ligne.md)
- [Installation](documentation/installation.md)
- [Déploiement, migrations et rollback](documentation/deploiement.md)
- [Sécurité](documentation/securite.md)
- [Sauvegarde et restauration](documentation/sauvegardes.md)
- [Assistant IA](documentation/assistant-ia.md)
- [Modules fonctionnels](documentation/modules.md)
- [Modèles de documents](documentation/modeles-documents.md)
- [Rapport de livraison : réalisé, tests exécutés, limites](documentation/rapport.md)

## Sécurité en bref

- Les permissions sont vérifiées côté serveur et la RLS PostgreSQL s'applique sur toutes les tables. La visibilité d'un bouton n'est jamais une autorisation.
- La clé de service et la clé IA restent côté serveur, pour des usages limités et documentés.
- Il n'y a pas d'inscription publique : les comptes sont créés sur invitation. Le premier administrateur est créé par une procédure à jeton à usage unique.
- Les données de démonstration sont fictives, isolées, et n'ont pas de mot de passe permanent.
