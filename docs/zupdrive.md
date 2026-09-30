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
Modèles Prisma : `ChauffeurDrive` (un par compte ZupOne) et `DocumentChauffeurDrive` (les versions de chaque pièce), migration `0027_zupdrive_chauffeurs`.

**Chauffeur ≠ livreur.** Un **chauffeur** (ZupDrive) transporte des personnes, avec une licence LVC. Un **livreur** (ZupEat) livre des repas et des commandes. Ce sont deux métiers, deux dossiers et deux validations sans aucun lien : rien, dans le code ou dans les pages de ZupDrive, ne renvoie au métier de livreur. Côté code, le livreur est le modèle Prisma `Courier` (table historique `Driver`). L'espace `/driver` et les routes `/api/drivers` gardent leur nom historique, mais désignent eux aussi les **livreurs** ZupEat, pas les chauffeurs.

**Compte unique ZupOne.** Le dossier chauffeur (`ChauffeurDrive`) est rattaché au compte ZupOne (`User`).

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
- **Domaine** : `/chauffeur` est l'espace `chauffeur`, servi sur **`driver.zupdrive.com`** (`NEXT_PUBLIC_DOMAINE_CHAUFFEUR`), dont il est la page d'accueil. `/devenir-chauffeur` reste sur la vitrine `zupdrive.com`. Son bouton mène à `driver.zupdrive.com/chauffeur`, et la connexion sur zupdrive.com ou driver.zupdrive.com aussi. Sans domaine chauffeur configuré, `/chauffeur` reste servi partout.
- **Vérification E2E** : `frontend/scripts/verif-zupdrive-chauffeur.mjs` (demande `DATABASE_URL` pour créer les comptes de l'équipe).

### Espace manager — file de validation

- **`/superowner/zupdrive/chauffeurs`**, menu « ZupDrive › Chauffeurs ». Les filtres sont À examiner, Validés, Refusés, Suspendus, En cours et Tous. En ouvrant un dossier, on voit le profil, la TVA et le véhicule. Chaque pièce peut être consultée, validée, ou refusée avec un motif obligatoire. La décision sur le dossier est ensuite : valider (possible seulement si toutes les pièces exigées sont validées), refuser avec motif, suspendre avec motif, ou rétablir. La file se met à jour en temps réel (famille `zupdrive`).
- **`/superowner/zupdrive/chauffeurs/:id`** ouvre directement un dossier : c'est le lien des notifications « Nouveau dossier chauffeur ».
- **Droits** : la section `chauffeurs` vient uniquement du rôle **ZupDrive** du membre. Un membre ZupDrive seul voit « Chauffeurs » sans « Livreurs ». Un membre ZupEat seul voit l'inverse.
- **`GET /api/superowner/me/permissions/plateformes`** renvoie les droits du compte sur chaque plateforme en un appel (`null` pour une plateforme sans rôle). La route `GET /api/superowner/me/permissions?plateforme=…` garde son 403 pour une plateforme sans rôle, car l'application mobile d'administration ZupEat s'en sert pour refuser un compte.

### Relances d'expiration des pièces

Un job horaire (`chauffeur.jobs.ts` → `ChauffeurExpirationService.surveiller`, tâche de surveillance « pieces-chauffeurs ») suit toutes les pièces qui ont une date d'expiration : assurance, contrôle technique, licence, etc.

- **30 jours avant**, puis **10 jours avant** : le chauffeur est relancé dans son espace (notification) et par courriel. Chaque relance part une seule fois ; elle est enregistrée dans `rappel30JoursLe` / `rappel10JoursLe` avant l'envoi, par une écriture conditionnelle. Doublons, redémarrages et plusieurs serveurs n'envoient donc jamais deux fois la même relance, et un courriel en échec n'est pas renvoyé.
- **Pièce déposée tardivement** : une pièce qui expire dans moins de 10 jours ne reçoit que la relance des 10 jours.
- **Nouvelle version** : ses relances partent de zéro, puisque son échéance est nouvelle. Tant qu'elle attend l'examen, l'ancienne version n'est pas relancée (le chauffeur a déjà fait le nécessaire). Si elle est refusée, les relances de l'ancienne reprennent.
- **Le jour de l'échéance**, la pièce passe `EXPIRED` et le chauffeur est prévenu.
- **Suspension automatique** (transport de personnes) : si la pièce expirée est une **pièce exigée** pour sa région (licence, assurance, contrôle technique, permis, immatriculation…), un chauffeur `VALIDE` passe `SUSPENDU`. Le motif nomme la pièce et sa date d'expiration, et `suspenduPourExpirationLe` est posé. Le chauffeur et l'équipe sont prévenus. Les relances d'une pièce exigée annoncent cette suspension. Une pièce facultative (identité des associés) ne suspend jamais.
  - La suspension est calculée à partir de l'état en base à chaque passage : un chauffeur resté `VALIDE` avec une pièce exigée expirée est rattrapé, même après un passage interrompu ou une réactivation manuelle.
  - Le chauffeur suspendu pour expiration **peut déposer la pièce à jour** depuis `/chauffeur`. Il est **rétabli automatiquement** dès que l'équipe a validé toutes ses pièces exigées ; le journal de cette validation note le rétablissement.
  - Une suspension **décidée par l'équipe** (motif libre) ne pose pas ce marqueur : le dossier reste figé et aucun dépôt ne la lève.
  - Comme la suspension n'a pas d'auteur humain, la table d'audit (qui exige un administrateur) ne l'enregistre pas. La trace est portée par le dossier (`motifStatut`, `suspenduPourExpirationLe`), les logs serveur et la notification envoyée à l'équipe.
- Seules les pièces `APPROVED` ou `PENDING` sont suivies : une pièce refusée est déjà à refaire.

### Renouvellement d'une pièce : l'ancienne version reste en vigueur

Une pièce peut exister en plusieurs versions (`DocumentChauffeurDrive`, sans contrainte d'unicité par type).

- **Au dépôt**, la version validée (ou expirée) n'est jamais écrasée. La nouvelle version est créée à côté, en attente d'examen. Si une version en attente ou refusée existe déjà, c'est elle qui est remplacée : il y a au plus une version en vigueur et une version déposée par type.
- **Si l'équipe valide la nouvelle version**, l'ancienne est archivée (`archiveeLe`) dans la même transaction. Elle est conservée pour l'historique, mais ne compte plus nulle part : dossier, relances, suspension.
- **Si l'équipe refuse la nouvelle version**, l'ancienne reste en vigueur, avec son échéance. Le chauffeur reste validé jusqu'à cette date, puis il est suspendu s'il n'a toujours pas de version validée.
- **Si l'ancienne expire avant la validation de la nouvelle**, le chauffeur est suspendu, puis rétabli dès que la nouvelle version est validée.
- **Une version expirée ne peut pas être validée**, et une version archivée ne s'examine plus.
- **À l'écran**, le chauffeur voit la nouvelle version et « Version en vigueur : valable jusqu'au … ». L'équipe voit les deux, marquées « renouvellement » et « version en vigueur ». L'API signale `renouvellement: true` sur la nouvelle version.

---

## Courses (V1)

Le passager commande un trajet à **prix fixe** sur `zupdrive.com/trajet`, avec son compte ZupOne. La course est proposée au chauffeur le plus proche, qui l'accepte depuis `driver.zupdrive.com/chauffeur/courses` et la mène à terme. La V1 ne comporte **pas de paiement en ligne** : il viendra en V2, une fois la facturation tranchée (qui facture le passager, TVA, commission).

Code : `backend/src/modules/zupdrive/` (`tarification-drive.service.ts`, `course-drive.service.ts`, `course-drive.jobs.ts`, `course-drive.routes.ts`). Modèles : `TarifDrive`, `CourseDrive`, `PropositionCourseDrive`, et `enLigne` / position sur `ChauffeurDrive`. Migration `0031_zupdrive_courses`.

### Prix
- Le tarif est fixé **par région** dans le manager (ZupDrive › Tarifs), en centimes entiers. Il comprend une prise en charge, un prix au km, un prix à la minute et un minimum. Une région n'accepte de commandes que si son tarif est « actif ». Chaque modification est journalisée (`ZUPDRIVE_SET_TARIF`).
- Formule : `max(minimum, priseEnCharge + parKm × km + parMinute × minutes)`, calculée sur les mètres et les secondes exacts, puis **arrondie une seule fois au centime**, sur le total.
- Le prix est calculé par le serveur au devis, puis recalculé à la commande. S'il diffère du prix affiché au passager, la commande est refusée (`PRICE_CHANGED`) et la page montre le nouveau prix. Une fois commandé, le prix est figé dans la course, avec une copie du tarif appliqué.
- **Région** : elle est déduite du code postal belge (Bruxelles 1000–1299 ; Wallonie 1300–1499 et 4000–7999 ; Flandre 1500–3999 et 8000–9999). Départ et destination doivent être dans la même région, puisqu'une licence ne vaut que dans sa région.
- **Distance et durée** : il n'existe pas encore de service d'itinéraire. La distance routière est estimée à vol d'oiseau × 1,3, et la durée à 25 km/h (`COEFFICIENT_DETOUR`, `VITESSE_MOYENNE_KMH`). Seule `estimerTrajet` changera le jour où un vrai calcul d'itinéraire existera.

### Attribution
- La course est proposée à un seul chauffeur à la fois : le plus proche du départ (15 km au plus) parmi ceux qui sont `VALIDE`, en ligne, de la même région, avec une position de moins de 2 minutes, sans course ni proposition en cours, et pas encore sollicités pour cette course.
- Il a **20 secondes** pour accepter. S'il refuse ou ne répond pas, la course passe au suivant. Sans preneur après **5 minutes**, la course passe `SANS_CHAUFFEUR` et le passager est prévenu. Un job tourne toutes les 5 secondes (`courses-drive`).
- L'acceptation se fait dans une transaction, par écritures conditionnelles : le premier qui accepte l'emporte, et une double acceptation n'attribue la course qu'une fois.
- Le chauffeur passe en ligne depuis sa page, qui envoie la position du téléphone toutes les 15 secondes au plus. Un chauffeur suspendu est mis hors ligne.

### États
`RECHERCHE → ACCEPTEE → ARRIVEE → EN_COURS → TERMINEE`, ou `ANNULEE`, ou `SANS_CHAUFFEUR`.
- Le passager peut annuler jusqu'à l'arrivée du chauffeur, mais plus une fois à bord. Le chauffeur peut annuler avec un motif avant que le passager soit à bord ; le passager est alors prévenu et peut recommander.
- La commande est idempotente (`cleIdempotence`), et un passager ne peut avoir qu'un trajet actif à la fois.
- Le passager voit le prénom du chauffeur, son véhicule et sa plaque. La position du chauffeur n'est exposée par l'API que pendant son approche ; l'écran du passager ne l'affiche pas encore (pas de carte). Le chauffeur voit le prénom du passager.
- L'état fait foi en base. Les écrans le relisent toutes les 3 à 4 secondes pendant une course, et les notifications ne sont qu'un signal.
- La suppression d'un compte est refusée pendant un trajet actif. Une fois le compte supprimé, ses courses restent dans l'historique sans la personne (`passagerId` à null).

### API
| Qui | Route | Effet |
|---|---|---|
| Passager | `POST /api/zupdrive/courses/devis` | Distance, durée, prix |
| Passager | `POST /api/zupdrive/courses` | Commander (`cleIdempotence`, `prixAnnonceCentimes`) |
| Passager | `GET /api/zupdrive/courses`, `GET …/:id`, `POST …/:id/annuler` | Suivre, annuler |
| Chauffeur | `GET /api/zupdrive/chauffeur/me/courses` | En ligne ?, proposition ouverte, course, historique |
| Chauffeur | `POST …/me/disponibilite`, `POST …/me/position` | En ligne / hors ligne, position |
| Chauffeur | `POST …/me/propositions/:id/(accepter\|refuser)` | Répondre à une proposition |
| Chauffeur | `POST …/me/courses/:id/(arrive\|demarrer\|terminer\|annuler)` | Étapes |
| Équipe (`courses-drive`) | `GET/PUT /api/zupdrive/admin/tarifs[/:region]`, `GET /api/zupdrive/admin/courses` | Tarifs, liste des courses |

La section de permissions **`courses-drive`** (« Courses et tarifs ») est nouvelle. Comme pour « Chauffeurs », il faut la cocher une fois dans les rôles ZupDrive déjà existants.

### Vérifications
- `backend/src/modules/zupdrive/__tests__/course-drive.integration.test.ts` : 18 tests contre PostgreSQL (`set -a; . ./.env; set +a; npx jest …`).
- `frontend/scripts/verif-zupdrive-courses.mjs` : une course de bout en bout dans trois navigateurs (équipe, chauffeur, passager). Seule la recherche d'adresses, qui dépend d'un service externe, y est simulée.
