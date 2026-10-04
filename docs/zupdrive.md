# ZupDrive — marche à suivre pour les chauffeurs

**État au 4 octobre 2026 :** les dossiers chauffeurs et sociétés, véhicules,
invitations, tarifs, devis, courses et notes de la V1 sont écrits. Le paiement
en ligne et les règles de facturation des courses relèvent de la V2. La
présentation publique annonce encore « Bientôt disponible ». Ce document
décrit les parcours et le code ; les validations et le travail restant sont
dans [l'état du projet](etat-projet.md).

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

- **`/superowner/zupdrive`** : tableau de bord ZupDrive (dossiers à examiner, courses en cours, dernières courses), onglet ZupDrive de l'administration.
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

## Sociétés de taxi / VTC et leurs chauffeurs

Un chauffeur ZupDrive roule **soit en indépendant** (avec sa propre licence, son entreprise et son véhicule : tout ce qui précède), **soit pour une société**, et pour une seule à la fois. La société détient les licences et les véhicules, et ses chauffeurs roulent pour elle. Leurs courses lui sont attribuées ; le reversement viendra avec le paiement en ligne (V2).

Code : `backend/src/modules/zupdrive/societe-drive.service.ts` (métier), `societe.routes.ts` (gérant), `chauffeur.admin.routes.ts` (équipe) et `pieces-drive.ts` (versions de pièces, communes aux chauffeurs, sociétés et véhicules). Modèles : `SocieteDrive`, `VehiculeDrive`, `InvitationSocieteDrive`, et `societeId` / `vehiculeId` sur `ChauffeurDrive` et `CourseDrive`. Migration `0038_zupdrive_societes`, purement additive.

### Qui porte quelle pièce

| Dossier | Pièces |
|---|---|
| Société | TVA (exigée), identité des associés (facultative) |
| Véhicule de la société | licence, assurance transport rémunéré, contrôle technique, immatriculation (toutes exigées) |
| Chauffeur de société | carte d'identité, permis ; plus le bestuurderspas en Flandre et l'extrait de casier judiciaire à Bruxelles |
| Chauffeur indépendant | inchangé (voir « Pièces exigées ») |

> **À faire confirmer** par un professionnel du secteur : cette répartition est une hypothèse de départ (une licence LVC ou une vergunning étant délivrée pour un véhicule). Elle ne se lit qu'à un endroit, en tête de `chauffeur-onboarding.service.ts` (`TYPES_PIECE_SOCIETE`, `TYPES_PIECE_VEHICULE`, `TYPES_PIECE_CHAUFFEUR_SOCIETE`, `piecesExigees`).

Une pièce appartient à **exactement un** dossier : chauffeur, société ou véhicule (contrainte `CHECK` en base). Renouvellement, versions, relances et expiration suivent les mêmes règles que pour les chauffeurs ; les relances d'une pièce de société ou de véhicule vont au gérant.

### Règles
- **Société** : un compte ZupOne en est le gérant, et un gérant n'a qu'une société. Son numéro BCE est contrôlé (modulo 97) et unique sur ZupDrive. Son dossier suit le même cycle qu'un dossier chauffeur (`BROUILLON → SOUMIS → VALIDE`, `REFUSE`, `SUSPENDU`) ; l'équipe ne peut la valider que si sa pièce de TVA est validée. Suspendre une société met tous ses chauffeurs hors ligne.
- **Véhicule** : plaque normalisée, unique parmi les véhicules non retirés (index partiel). Il est **conforme** quand chaque pièce exigée a une version validée et en cours de validité. Cet état est **calculé par le serveur** après chaque examen et chaque expiration (`recalculerVehicule`), jamais saisi. Un véhicule qui cesse d'être conforme met son chauffeur hors ligne ; il redevient conforme dès que l'équipe valide la version à jour. Un véhicule retiré reste dans l'historique des courses. Un véhicule dont une pièce est déjà validée ne se modifie plus : on en inscrit un nouveau.
- **Invitation** : la société invite par adresse e-mail (idempotent : au plus une invitation en attente par adresse ; 50 en attente au plus ; 30 envois par heure). Le chauffeur accepte ou refuse depuis `/chauffeur` : **personne n'est rattaché sans son accord**. Sans dossier chauffeur, l'acceptation en ouvre un.
- **Une société à la fois** : garanti en base (rattachement conditionné à « sans société », dans une transaction). Refusé aussi pour un chauffeur suspendu ou en course.
- **Chauffeur de société** : sa région devient celle de la société ; il ne renseigne que son nom et son téléphone, la société fixe le reste. Il ne peut se mettre en ligne (ni recevoir ou accepter une course) que si son dossier est validé, **sa société validée** et **le véhicule qu'elle lui attribue conforme**. Un véhicule, un chauffeur (index unique). Pas de changement de véhicule pendant une course.
- **Changer de rattachement** (rejoindre ou quitter une société) change les pièces exigées. Si le chauffeur ne remplit plus les conditions de son état (validé ou dossier envoyé), il repasse en `BROUILLON` avec un motif qui dit quoi compléter. Exemple : un chauffeur de société qui la quitte sans licence à lui.
- **Courses** : à l'acceptation, la course fige `societeId` et `vehiculeId`, relus dans la transaction. Changer de société ensuite ne change pas l'historique. Le passager voit la marque et la plaque du véhicule de la course, jamais la société ni ses identifiants.
- **Cloisonnement** : les routes du gérant partent toujours de SA société (par son compte), jamais d'un identifiant de société envoyé par le client. Un véhicule, un chauffeur ou une invitation d'une autre société répond 404. Les pièces de la société et de ses véhicules ne sont lisibles (`/api/files`) que par son gérant et par l'équipe.
- **Suppression du compte du gérant** : sa société et l'historique de ses courses restent (relation `Restrict`) ; son compte ZupOne n'est pas entièrement effacé.

### API gérant — futur `manager.zupdrive.com`

Toutes les routes exigent une session. L'espace du gérant (pages) est la phase 2 ; d'ici là, l'API est complète.

| Méthode | Route | Effet |
|---|---|---|
| GET / POST / PATCH | `/api/zupdrive/societe/me` | La société du compte (`null` sans société), l'ouvrir (idempotent), la modifier |
| POST | `/api/zupdrive/societe/me/documents` | Pièce de la société (multipart `file`, `type`, `dateExpiration?`) |
| POST | `/api/zupdrive/societe/me/submit` | Envoyer le dossier (idempotent) |
| POST | `/api/zupdrive/societe/me/vehicules` | Inscrire un véhicule (`marque`, `modele`, `plaque`, `numeroLicence?`) |
| PATCH | `/api/zupdrive/societe/me/vehicules/:id` | Corriger un véhicule sans pièce validée |
| POST | `/api/zupdrive/societe/me/vehicules/:id/retirer` | Retirer un véhicule (refusé en pleine course) |
| POST | `/api/zupdrive/societe/me/vehicules/:id/documents` | Pièce du véhicule |
| POST | `/api/zupdrive/societe/me/invitations` | Inviter un chauffeur (`email`) |
| POST | `/api/zupdrive/societe/me/invitations/:id/annuler` | Annuler une invitation en attente |
| PUT | `/api/zupdrive/societe/me/chauffeurs/:id/vehicule` | Attribuer (`vehiculeId`) ou retirer (`null`) un véhicule |
| POST | `/api/zupdrive/societe/me/chauffeurs/:id/detacher` | Se séparer d'un chauffeur (refusé en pleine course) |
| GET | `/api/zupdrive/societe/me/courses?limit=&offset=` | Les courses faites pour la société |

### API chauffeur (ajouts)

| Méthode | Route | Effet |
|---|---|---|
| GET | `/api/zupdrive/chauffeur/me/invitations` | Les invitations en attente adressées à l'e-mail du compte |
| POST | `/api/zupdrive/chauffeur/me/invitations/:id/accepter` | Rejoindre la société |
| POST | `/api/zupdrive/chauffeur/me/invitations/:id/refuser` | Refuser |
| POST | `/api/zupdrive/chauffeur/me/quitter-societe` | Redevenir indépendant (refusé en pleine course) |

`GET /api/zupdrive/chauffeur/me` renvoie en plus `societe` et `vehicule`. Nouveaux refus possibles de `POST …/me/disponibilite` et de l'acceptation d'une course : `COMPANY_NOT_ACTIVE`, `VEHICLE_NOT_READY` (403).

### API équipe (section `chauffeurs` de la plateforme DRIVE)

| Méthode | Route | Effet |
|---|---|---|
| GET | `/api/zupdrive/admin/societes?statut=` | Liste paginée, avec les compteurs par statut |
| GET | `/api/zupdrive/admin/societes/:id` | Dossier complet : société, véhicules, chauffeurs, invitations |
| PATCH | `/api/zupdrive/admin/societes/:id/documents/:documentId` | Statuer sur une pièce de la société ou de l'un de ses véhicules (`ZUPDRIVE_REVIEW_SOCIETE_DOCUMENT`) |
| POST | `/api/zupdrive/admin/societes/:id/(approve\|reject\|suspend\|reactivate)` | Décisions, avec motif pour refuser ou suspendre (`ZUPDRIVE_*_SOCIETE`) |

Pas de nouvelle permission à cocher : les sociétés relèvent de la section « Chauffeurs ».

### Frontend
- **`/superowner/zupdrive/societes`** (menu « ZupDrive › Sociétés ») : la file de validation. Chaque pièce de la société et de chaque véhicule s'examine dans la page, la conformité de chaque véhicule s'affiche, et les chauffeurs rattachés et les invitations en attente sont listés. `/superowner/zupdrive/societes/:id` ouvre un dossier directement (lien des notifications).
- **Tableau de bord ZupDrive** : sociétés à examiner et sociétés validées.
- **`/chauffeur`** : les invitations reçues (accepter, refuser) ; une fois rattaché, la société, le véhicule attribué et « Quitter la société ». Le profil se réduit au nom et au téléphone.
- **Vérification E2E** : `frontend/scripts/verif-zupdrive-societe.mjs`.

## Courses (V1)

Le passager commande un trajet à **prix fixe** sur `zupdrive.com/trajet`, avec son compte ZupOne. La course est proposée au chauffeur le plus proche, qui l'accepte depuis `driver.zupdrive.com/chauffeur/courses` et la mène à terme. La V1 ne comporte **pas de paiement en ligne** : il viendra en V2, une fois la facturation tranchée (qui facture le passager, TVA, commission).

Code : `backend/src/modules/zupdrive/` (`tarification-drive.service.ts`, `course-drive.service.ts`, `course-drive.jobs.ts`, `course-drive.routes.ts`). Modèles : `TarifDrive`, `CourseDrive`, `PropositionCourseDrive`, et `enLigne` / position sur `ChauffeurDrive`. Migration `0031_zupdrive_courses`.

### Prix
- Le tarif est fixé **par région** dans le manager (ZupDrive › Tarifs), en centimes entiers. Il comprend une prise en charge, un prix au km, un prix à la minute et un minimum. Une région n'accepte de commandes que si son tarif est « actif ». Chaque modification est journalisée (`ZUPDRIVE_SET_TARIF`).
- Formule : `max(minimum, priseEnCharge + parKm × km + parMinute × minutes)`, calculée sur les mètres et les secondes exacts, puis **arrondie une seule fois au centime**, sur le total.
- **Devis signé** : le serveur calcule le devis et le signe (HMAC, `devis-signe.ts`), lié au compte du passager et valable 10 minutes. La commande reprend ce devis tel quel, donc le prix vu est le prix payé, même si l'itinéraire a changé entre-temps (circulation). Un devis retouché ou émis pour un autre compte est refusé (`INVALID_QUOTE`). Un devis expiré est refusé aussi (`QUOTE_EXPIRED`), et la page en redemande un. Une fois commandé, le prix est figé dans la course, avec une copie du tarif appliqué et la source de l'itinéraire.
- **Région** : elle est déduite du code postal belge (Bruxelles 1000–1299 ; Wallonie 1300–1499 et 4000–7999 ; Flandre 1500–3999 et 8000–9999). Départ et destination doivent être dans la même région, puisqu'une licence ne vaut que dans sa région.
- **Distance et durée** (`itineraire.service.ts`, variable `ROUTING_PROVIDER`) :
  - `estimation` (par défaut) : vol d'oiseau × 1,3, à 25 km/h, sans service externe ;
  - `osrm` : la vraie route, calculée par un serveur **OSRM** (`OSRM_API_URL`), un moteur libre et gratuit basé sur OpenStreetMap. Il fournit aussi le tracé affiché sur la carte ;
  - si OSRM ne répond pas, ou pas en 3 secondes, l'estimation prend le relais : un devis n'est jamais bloqué.

### Attribution
- La course est proposée à un seul chauffeur à la fois : le plus proche du départ (15 km au plus) parmi ceux qui sont `VALIDE`, en ligne, de la même région, avec une position de moins de 2 minutes, sans course ni proposition en cours, et pas encore sollicités pour cette course.
- Il a **20 secondes** pour accepter. S'il refuse ou ne répond pas, la course passe au suivant. Sans preneur après **5 minutes**, la course passe `SANS_CHAUFFEUR` et le passager est prévenu. Un job tourne toutes les 5 secondes (`courses-drive`).
- L'acceptation se fait dans une transaction, par écritures conditionnelles : le premier qui accepte l'emporte, et une double acceptation n'attribue la course qu'une fois.
- Le chauffeur passe en ligne depuis sa page, qui envoie la position du téléphone toutes les 15 secondes au plus. Un chauffeur suspendu est mis hors ligne.

### États
`RECHERCHE → ACCEPTEE → ARRIVEE → EN_COURS → TERMINEE`, ou `ANNULEE`, ou `SANS_CHAUFFEUR`.
- Le passager peut annuler jusqu'à l'arrivée du chauffeur, mais plus une fois à bord. Le chauffeur peut annuler avec un motif avant que le passager soit à bord ; le passager est alors prévenu et peut recommander.
- La commande est idempotente (`cleIdempotence`), et un passager ne peut avoir qu'un trajet actif à la fois.
- Le passager voit le prénom du chauffeur, son véhicule et sa plaque, et sur une **carte** (`CarteCourseDrive`, fonds OpenStreetMap) le départ, la destination, le tracé de la route et le chauffeur pendant son approche. La position du chauffeur n'est plus exposée une fois le passager à bord. Le chauffeur voit le prénom du passager.
- L'état fait foi en base. Les écrans le relisent toutes les 3 à 4 secondes pendant une course, et les notifications ne sont qu'un signal.
- La suppression d'un compte est refusée pendant un trajet actif. Une fois le compte supprimé, ses courses restent dans l'historique sans la personne (`passagerId` à null).

### API
| Qui | Route | Effet |
|---|---|---|
| Passager | `POST /api/zupdrive/courses/devis` | Distance, durée, prix, tracé, devis signé |
| Passager | `POST /api/zupdrive/courses` | Commander un devis signé (`devis`, `cleIdempotence`) |
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

### Notes

Après une course terminée, **le passager note son chauffeur et le chauffeur note son passager**, de 1 à 5 étoiles, avec un commentaire facultatif (`NoteCourseDrive`, `note-course-drive.service.ts`, migration `0032_zupdrive_notes`).

- Seules les deux personnes de la course notent. Chacune le fait une fois, sur une course `TERMINEE`, dans les **7 jours**. Une note ne se modifie pas (contrainte unique par course et par sens).
- **Moyennes** : elles sont recalculées depuis les notes, jamais entretenues à part. Un compte jamais noté n'a pas de note (« Nouveau chauffeur », « Nouveau passager »), plutôt qu'un 5/5 qu'il n'a pas gagné.
- **Qui voit quoi** :
  - le passager voit la moyenne de son chauffeur ;
  - le chauffeur voit la sienne, et la moyenne du passager dans une proposition ;
  - **les commentaires ne sont lus que par l'équipe ZupDrive**, qui voit les notes et les commentaires dans ZupDrive › Courses, et la moyenne de chaque chauffeur dans la file des chauffeurs.
- **Alerte** : une note de 1 ou 2 prévient l'équipe, avec le commentaire et un lien.
- Si le compte du passager est supprimé, sa note reste, pour que la moyenne du chauffeur ne bouge pas.
- API : `POST /api/zupdrive/courses/:id/note` (passager) et `POST /api/zupdrive/chauffeur/me/courses/:id/note` (chauffeur), avec `{ note, commentaire? }`.
- Les notes des livreurs ZupEat sont distinctes : autre métier, autres règles.

### Héberger OSRM (itinéraire réel)

OSRM est gratuit, mais il lui faut les données de la région, préparées une fois (une dizaine de minutes pour la Belgique) :

```bash
mkdir -p osrm && cd osrm
wget https://download.geofabrik.de/europe/belgium-latest.osm.pbf
docker run --rm -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/belgium-latest.osm.pbf
docker run --rm -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-partition /data/belgium-latest.osrm
docker run --rm -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-customize /data/belgium-latest.osrm
docker run -d --name osrm -p 5000:5000 -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-routed --algorithm mld /data/belgium-latest.osrm
```

Ensuite, dans `.env.production` : `ROUTING_PROVIDER=osrm` et `OSRM_API_URL` (l'adresse du conteneur, joignable depuis l'API). Pour suivre l'évolution des routes, refaire la préparation de temps en temps, par exemple chaque mois. Le serveur public de démonstration d'OSRM n'est pas fait pour la production.
