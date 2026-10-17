# Modèles de documents

## Documents générés par l'application

| Document                    | Génération                                                                | Accès                                                       |
| --------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Bulletin trimestriel        | `/api/report-cards/[id]` (PDF) : moyennes, rangs, appréciations, décision | personnel autorisé ; famille et élève **après publication** |
| Reçu de paiement            | `/api/receipts/[id]` (PDF numéroté)                                       | finances ; famille pour ses propres paiements               |
| Certificats et attestations | **Documents → Générer un document**, à partir des modèles ci-dessous      | personnel (`documents.create`)                              |
| Exports CSV                 | élèves, notes, présences, factures (`/api/export/*`)                      | permission `*.export`, journalisés                          |

Les PDF sont produits côté serveur (pdf-lib), en texte brut. Aucun HTML n'est interprété.

## Modèles fournis (créés pour chaque nouvel établissement)

| Type                     | Nom                     |
| ------------------------ | ----------------------- |
| `enrollment_certificate` | Certificat de scolarité |
| `attendance_certificate` | Attestation d'assiduité |
| `convocation`            | Convocation des parents |
| `transfer_certificate`   | Certificat de radiation |

Les modèles se modifient dans **Documents → Modèles**, avec la permission `templates.manage`.

## Champs disponibles

Seuls les champs suivants sont remplacés. Un champ inconnu est **refusé à l'enregistrement** du modèle.

| Champ                     | Contenu                                 |
| ------------------------- | --------------------------------------- |
| `{{school_name}}`         | Nom de l'établissement                  |
| `{{school_city}}`         | Ville de l'établissement                |
| `{{signatory_name}}`      | Nom du signataire                       |
| `{{signatory_title}}`     | Fonction du signataire                  |
| `{{student_full_name}}`   | Nom complet de l'élève                  |
| `{{student_first_name}}`  | Prénom                                  |
| `{{student_last_name}}`   | Nom                                     |
| `{{student_birth_date}}`  | Date de naissance                       |
| `{{student_birth_place}}` | Lieu de naissance                       |
| `{{student_matricule}}`   | Matricule                               |
| `{{class_name}}`          | Classe                                  |
| `{{academic_year}}`       | Année scolaire                          |
| `{{absences_count}}`      | Nombre d'absences enregistrées          |
| `{{today}}`               | Date du jour                            |
| `{{custom_message}}`      | Texte libre saisi lors de la génération |

Une valeur vide est rendue « — ».

## Exemple : certificat de scolarité

```
CERTIFICAT DE SCOLARITÉ

Je soussigné(e), {{signatory_name}}, {{signatory_title}} de {{school_name}}, certifie que
l'élève {{student_full_name}}, né(e) le {{student_birth_date}} à {{student_birth_place}},
matricule {{student_matricule}}, est régulièrement inscrit(e) en classe de {{class_name}}
pour l'année scolaire {{academic_year}}.

En foi de quoi, le présent certificat lui est délivré pour servir et valoir ce que de droit.
```

Chaque document généré est enregistré dans l'espace privé (`documents`, catégorie `certificate`), rattaché à l'élève et journalisé.
