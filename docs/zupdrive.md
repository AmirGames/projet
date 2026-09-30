# ZupDrive — marche à suivre pour les chauffeurs

ZupDrive est le domaine lié à la gestion des chauffeurs disposant d'une licence LVC ou d'une licence de transport rémunéré de personnes (Belgique).

Architecture prévue : `zupdrive.com`, `manager.zupdrive.com`, `driver.zupdrive.com`.

## 1. Créer un compte

Inscrivez-vous en ligne pour créer un compte ZupDrive.

## 2. Enregistrer l'entreprise et obtenir un numéro de TVA (BCE)

Prenez rendez-vous auprès d'un guichet d'entreprise et obtenez votre numéro d'entreprise auprès de la Banque Carrefour des Entreprises (BCE). Faites la demande de numéro de TVA auprès d'un guichet d'entreprise compétent via un formulaire.

- Durée : 1 à 3 semaines
- Coût : 89,50 EUR

## 3. Trouver un véhicule conforme

Obtenez une assurance voiture professionnelle : pour obtenir la licence, l'assurance doit couvrir le transport rémunéré.

- Temps nécessaire : quelques semaines
- Coût : dépend de la voiture et du risque du partenaire
- Plaque d'immatriculation T-X (Flandre) ou T-L (Bruxelles et Wallonie) : 35 EUR

Le véhicule doit répondre aux exigences réglementaires.

## 4. Demander la licence LVC ou de transport rémunéré de personnes

Une fois le véhicule, l'assurance et le numéro de TVA obtenus :

| Région | Organisme | Coût |
|---|---|---|
| Bruxelles | Bruxelles Mobilité | 650 €/an |
| Wallonie | SPF Mobilité et Transports | 350 €/an |
| Flandre | Commune | 250–350 €/an |

## 5. Téléverser les documents

Via l'application ou le site `driver.zupdrive.com` :

- Carte d'identité
- Bestuurderspas (Flandre)
- Permis de conduire avec sélection médicale
- Numéro de TVA
- Licence LVC ou *vergunning voor individueel bezoldigd personenvervoer*
- Document de contrôle technique
- Assurance automobile pour transport rémunéré
- Certificat d'immatriculation (recto/verso)
- Documents d'identité de toutes les personnes possédant des parts dans la société
- Extrait de casier judiciaire (Bruxelles)

Des documents supplémentaires peuvent être requis en fonction de la licence.

---

## Côté technique — inscription et validation des chauffeurs

Module backend : `backend/src/modules/zupdrive/` (service `chauffeur-onboarding.service.ts`).
Modèles Prisma : `ChauffeurDrive` (un par compte ZupOne) et `DocumentChauffeurDrive` (une pièce par type), migration `0027_zupdrive_chauffeurs`.

**Compte unique ZupOne.** Le dossier chauffeur est rattaché au compte ZupOne (`User`). Il est distinct du profil livreur ZupEat (`Driver`) : un chauffeur qui veut aussi livrer passe par « Devenir livreur » et remplit ce formulaire, validé séparément.

### États du dossier

```text
BROUILLON ──soumettre──▶ SOUMIS ──valider──▶ VALIDE ──suspendre──▶ SUSPENDU
    ▲                      │                   ▲                      │
    └──(corrige)── REFUSE ◀┘ refuser           └──────réactiver───────┘
```

- Le chauffeur modifie son profil en `BROUILLON` ou `REFUSE`. En `SOUMIS`, le dossier est figé.
- La soumission exige un profil complet : téléphone, région, numéro BCE valide (contrôle modulo 97), numéro de licence et véhicule. Toutes les pièces exigées doivent aussi être déposées.
- La validation exige un dossier `SOUMIS` dont toutes les pièces exigées sont `APPROVED`. Tout refus (de pièce ou de dossier) porte un motif.
- Un chauffeur `VALIDE` peut renouveler une pièce (assurance, contrôle technique…). Elle repart en examen, mais son compte reste validé.

### Pièces exigées

Pour toutes les régions : `identite`, `permis`, `tva`, `licence`, `controle_technique`, `assurance`, `immatriculation`.

S'y ajoutent `bestuurderspas` en Flandre et `casier_judiciaire` à Bruxelles. La pièce `actionnaires` est facultative.

Les fichiers sont stockés dans le dossier privé `chauffeurs/`. Ils sont servis par `/api/files` au chauffeur lui-même et à l'équipe ayant la section « chauffeurs ».

### API chauffeur — `driver.zupdrive.com`

Toutes les routes exigent une session. Le dossier manipulé est toujours celui du compte connecté : aucune route ne prend d'identifiant de dossier.

| Méthode | Route | Effet |
|---|---|---|
| GET | `/api/zupdrive/chauffeur/me` | Dossier + ce qui manque (`null` si pas commencé) |
| POST | `/api/zupdrive/chauffeur/me` | Ouvre le dossier (idempotent) |
| PATCH | `/api/zupdrive/chauffeur/me` | Met à jour le profil |
| POST | `/api/zupdrive/chauffeur/me/documents` | Dépose une pièce (multipart `file`, `type`, `dateExpiration?`) |
| POST | `/api/zupdrive/chauffeur/me/submit` | Soumet le dossier (idempotent) |

### API équipe ZupDrive

Gardée par les permissions de la **plateforme DRIVE** (section `chauffeurs`) : un rôle ZupEat seul n'y donne pas accès. Le Support peut lire, l'Administrateur peut décider. Chaque décision est journalisée (`ZUPDRIVE_*`).

| Méthode | Route | Effet |
|---|---|---|
| GET | `/api/zupdrive/admin/chauffeurs?statut=` | Liste paginée |
| GET | `/api/zupdrive/admin/chauffeurs/:id` | Dossier complet |
| PATCH | `/api/zupdrive/admin/chauffeurs/:id/documents/:documentId` | `{ approuve, note? }` |
| POST | `/api/zupdrive/admin/chauffeurs/:id/approve` | Valide le dossier |
| POST | `/api/zupdrive/admin/chauffeurs/:id/reject` | `{ motif }` |
| POST | `/api/zupdrive/admin/chauffeurs/:id/suspend` | `{ motif }` |
| POST | `/api/zupdrive/admin/chauffeurs/:id/reactivate` | Rétablit un chauffeur suspendu |

### Frontend

- **`/devenir-chauffeur`** (Belgique) : le bouton « Créer mon dossier chauffeur » mène à `/chauffeur`. En France, la candidature reste un simple contact par email.
- **`/chauffeur`** : le dossier du compte connecté. On y remplit le profil, dépose les pièces, suit le statut de chaque pièce et envoie le dossier. Sans session, la page invite à se connecter ou à créer un compte ZupOne. Les textes sont dans l'espace de noms `chauffeurDrive` de `messages/*.json`.
- **Domaine** : `/chauffeur` appartient pour l'instant à l'espace `drive` (`NEXT_PUBLIC_DOMAINE_DRIVE`, zupdrive.com). La connexion sur ce domaine mène à `/chauffeur`. Le passage sur `driver.zupdrive.com` demandera un domaine dédié : variable d'environnement, CORS, reverse proxy et certificat.
- **Pour livrer** : un chauffeur passe par `/devenir-livreur`, qui mène au dossier livreur ZupEat, validé à part.
- **Vérification E2E** : `frontend/scripts/verif-zupdrive-chauffeur.mjs` (demande `DATABASE_URL` pour créer les comptes de l'équipe).
