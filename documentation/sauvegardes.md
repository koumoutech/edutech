# Sauvegarde et restauration

## 1. Ce qu'il faut sauvegarder

| Élément            | Contenu                                                                                           | Méthode                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Base PostgreSQL    | toutes les données métier, l'audit et les comptes (schéma `auth`)                                 | sauvegardes Supabase quotidiennes et **PITR** (restauration à un instant donné, offre payante) ; export `pg_dump` complémentaire |
| Storage            | pièces justificatives, documents générés, logos (buckets `documents`, `school-assets`, `avatars`) | copie périodique des buckets (script S3-compatible, voir §2.3)                                                                   |
| Configuration      | variables d'environnement, réglages Auth et SMTP                                                  | coffre de secrets de l'organisation (jamais dans git)                                                                            |
| Code et migrations | dépôt git                                                                                         | hébergement git, tags de version                                                                                                 |

## 2. Procédures de sauvegarde

### 2.1 Automatique (Supabase)

Activez **Point-in-Time Recovery** sur le projet de production : Database → Backups. Vérifiez la durée de rétention choisie (7 jours minimum recommandés).

### 2.2 Export logique (hebdomadaire et avant chaque migration de production)

```bash
# Chaîne de connexion « direct connection » (Project Settings → Database), stockée dans un coffre
pg_dump "$PROD_DB_URL" --format=custom --no-owner --no-privileges \
  --schema=public --schema=private --schema=auth --schema=storage \
  --file="edudigi-$(date -u +%Y%m%dT%H%MZ).dump"
```

- Chiffrez le fichier (`age` ou `gpg`) avant de le déposer sur un stockage externe, dans une autre région et avec un accès restreint.
- Durée de conservation suggérée : 4 sauvegardes hebdomadaires et 12 mensuelles.

### 2.3 Fichiers (Storage)

Supabase Storage expose une API compatible S3 (Storage → Settings → S3 Access Keys). Exemple :

```bash
aws s3 sync s3://documents ./backup/documents --endpoint-url "$SUPABASE_S3_ENDPOINT"
```

Les métadonnées (`public.documents`) sont dans la base. Fichiers et base doivent être restaurés **au même point** pour rester cohérents.

## 3. Restauration

### 3.1 Incident récent (PITR)

1. Déterminez l'heure UTC juste **avant** l'incident, en vous appuyant sur l'audit (`audit_logs`) et les journaux.
2. Supabase → Database → Backups → Point in time : restaurez vers cette heure. La restauration remplace la base du projet et provoque une interruption.
3. Mettez l'application en maintenance pendant l'opération.
4. Contrôlez le résultat : connexion, effectifs, dernières factures et derniers paiements, dernières notes validées.

### 3.2 Depuis un export `pg_dump`

Testez **d'abord dans un projet vierge** (préproduction) :

```bash
pg_restore --clean --if-exists --no-owner --no-privileges -d "$TARGET_DB_URL" edudigi-AAAAMMJJ.dump
```

Ensuite :

1. Vérifiez que les migrations de la base restaurée correspondent à la version de l'application déployée (`supabase migration list`).
2. Restaurez les fichiers Storage du même jour.
3. Si vous restaurez en production : maintenance, restauration, contrôles, puis réouverture.

### 3.3 Restauration partielle (une table, un élève)

Restaurez l'export dans une base temporaire, extrayez les lignes concernées (`COPY … TO`), puis réinsérez-les via une migration ou un script revu. Les factures et paiements ne se « réécrivent » jamais : on corrige par des écritures (contre-passation) pour conserver la piste d'audit.

## 4. Tests de restauration

- Au moins une fois par trimestre : restaurez le dernier export dans un projet de test, lancez `pnpm test:db` sur une copie, et vérifiez manuellement trois écrans.
- Consignez la date, la durée et le résultat. Une sauvegarde jamais restaurée n'est pas une sauvegarde vérifiée.
