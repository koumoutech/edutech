# Modules fonctionnels

Pour chaque module : écrans, règles appliquées côté serveur et permissions principales. Les permissions s'ajustent dans **Paramètres → Rôles**.

## Tableaux de bord (`/app`)

Le tableau de bord dépend du rôle principal : direction, études, enseignant, secrétariat, comptabilité, RH, personnel, famille ou élève. Toutes les données sont réelles et calculées par des fonctions SQL soumises à la RLS. Il comprend :

- des alertes « à traiter » ;
- des graphiques Recharts, avec légende et bascule en vue tableau ;
- un état vide explicite quand il n'y a pas de données.

## A. Élèves (`/app/students`)

- Liste paginée avec recherche, filtres classe/statut et export CSV (`students.export`, journalisé).
- Fiche à onglets : profil, responsables, informations médicales (`health.read` uniquement), scolarité, présences, documents, finances.
- Création avec matricule auto-numéroté par établissement, modification, inscription, changement de classe, retrait ou archivage avec motif.
- Import CSV avec modèle téléchargeable, validation ligne à ligne et rapport d'erreurs.
- Dossier incomplet : les pièces obligatoires configurables manquantes sont signalées.

## B. Classes et structure (`/app/classes`, `/app/settings/academics`)

- Années, trimestres, cycles, niveaux, classes (capacité contrôlée en base), matières avec coefficients, salles et créneaux horaires.
- Fiche classe : effectif, enseignants par matière, élèves.

## C. Personnel (`/app/staff`)

- Fiches, affectations, contrats et évaluations (`hr.read` / `hr.manage`), avec les congés associés.

## D. Emploi du temps (`/app/timetable`)

- Grille hebdomadaire par classe, enseignant ou salle.
- Conflits classe/enseignant/salle **refusés par la base** (contraintes d'exclusion).
- Remplacements et annulations, avec notification aux personnes concernées (`notify_timetable_change`).

## E. Évaluations, notes et bulletins (`/app/assessments`, `/app/report-cards`)

- Les évaluations ont un coefficient et un barème. Leur cycle de vie est brouillon → soumise → validée → publiée, et chaque transition est contrôlée en base.
- La saisie en grille est limitée aux enseignants de la classe et de la matière (`assigned`). Les absents et dispensés sont gérés.
- Notes validées **verrouillées** : une correction exige un motif et laisse une trace (`grade_revisions`, audit).
- Bulletins :
  - calcul serveur des moyennes pondérées, rangs et moyennes de classe ;
  - appréciations et décision du conseil ;
  - validation puis publication, PDF.
- Les familles ne voient que les notes et bulletins **publiés**.

## F. Présences des élèves (`/app/attendance`)

- Appel par séance ou par jour (présent, absent, retard, excusé), avec notification des familles en cas d'absence.
- Justificatifs : dépôt par la famille (pièce jointe vérifiée), puis validation ou refus par la vie scolaire.
- Synthèses et export CSV.

## G. Absences et congés du personnel (`/app/staff/leaves`)

- Demande avec type, dates et motif, puis validation ou refus avec commentaire et annulation, chaque étape étant notifiée.
- **Pointage quotidien** (`/app/staff/attendance`) : présent, absent, retard (en minutes) ou congé, avec une remarque. Les congés approuvés sont pré-renseignés, la saisie d'une date future est refusée, la synthèse est mensuelle par personne, la saisie est réservée à `staff.manage` et la lecture à `staff.read` (établissement).

## H. Finances (`/app/finance`)

- Paramètres : frais par niveau et par période, réductions et bourses, modes de paiement, types de frais, fournisseurs et catégories de dépenses.
- Factures :
  - création manuelle ou génération par classe ;
  - émission avec numérotation séquentielle ;
  - une facture n'est modifiable qu'en brouillon ;
  - l'annulation exige un motif et l'absence de paiement.
- Paiements :
  - répartition automatique sur les factures ouvertes, sans trop-perçu ;
  - référence obligatoire pour les paiements électroniques ;
  - reçu PDF numéroté ;
  - contre-passation et remboursement tracés, sans suppression.
- Dépenses : saisie, puis approbation (`expenses.validate`), puis paiement. Budgets par catégorie.
- Tableau de bord : facturé, encaissé, restant dû, retards, flux mensuels. Export CSV.
- L'espace famille ne montre que les factures des enfants rattachés.

## I. Espace parents (`/app/children`)

- Enfants rattachés : notes et bulletins publiés, présences, emploi du temps, factures, documents partagés.
- Dépôt de justificatifs, demandes administratives, messages à l'équipe.

## J. Communication

- **Annonces** : ciblées par rôle et par classe, avec priorité, épinglage et expiration. Publication avec notifications.
- **Notifications** : centre de notifications et préférences par type et canal (in-app, e-mail, SMS). E-mail et SMS passent par une file avec tentatives (Resend, Twilio).
- **Messagerie** : fils de discussion entre le personnel et les familles. L'annuaire est limité aux interlocuteurs autorisés (`message_directory`). Mise à jour en temps réel.
- **Demandes administratives** : certificat, rendez-vous, réclamation… avec suivi du statut et notification.

## K. Documents (`/app/documents`)

- Stockage privé : chaque type de fichier est vérifié, l'accès se fait par URL signée après contrôle des droits.
- Modèles personnalisables avec des champs en liste blanche (voir `modeles-documents.md`). Génération de certificats PDF.

## L. Rapports (`/app/reports`)

- Effectifs par niveau, réussite par classe, comparaison entre périodes, absences et élèves les plus absents, personnel, recouvrement, recettes et dépenses mensuelles, dépenses par rapport au budget.
- Export des notes en CSV.

## M. Paramètres (`/app/settings`)

- Établissement : identité, logo, coordonnées, barèmes de notation.
- Utilisateurs : invitations par e-mail, attribution et retrait de rôles, suspension.
- Matrice des rôles et des permissions avec leurs portées, et rôles personnalisés.
- Journal d'audit filtrable.
- Profil : nom, téléphone, thème, déconnexion de tous les appareils.

## Plateforme (`/platform`)

Console du superadministrateur :

- création d'établissements (tenants) ;
- identité du produit : nom, accroche, e-mail de support.

Le superadministrateur n'a **aucun accès** aux données scolaires sans appartenir à l'établissement.

## Assistant IA (`/app/assistant`)

Voir `assistant-ia.md`.
