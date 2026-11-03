# ZupDrive — parcours chauffeurs et sociétés taxi

**État au 3 novembre 2026.** Le MVP vise un pilote fermé dans la commune de
Namur. Il inclut les chauffeurs indépendants et les sociétés taxi, avec les
classes Standard (1–4 passagers) et XL (5–6). Les espaces de dossier sont
`/chauffeur` et `/societe`; le portail d'administration examine les pièces et
les véhicules.

Le pilote n'est pas ouvert en production. Les pages légales sont encore des
brouillons, l'agrément SPW de l'opérateur n'est pas obtenu, l'entité juridique
exploitante n'est pas encore désignée et Stripe/3DS n'a pas été essayé sur
l'environnement cible. Les verrouillages de production restent actifs.

Les conditions officielles applicables aux chauffeurs et aux véhicules de
Namur, les preuves à recueillir et les confirmations encore attendues de la
Ville/SPW sont détaillées dans le [périmètre du MVP](zupdrive-mvp-scope.md).
Cette fiche décrit le parcours et le code; les anciennes estimations de coûts
et instructions valables pour d'autres régions ne s'appliquent pas au pilote.
Voir aussi [l'état du projet](etat-projet.md).

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
| GET / PUT | `/api/zupdrive/chauffeur/me/bank-account` | Compte des versements (fin de l'IBAN seulement en lecture) — voir `docs/zupdrive-api-admin.md` |

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

Un chauffeur ZupDrive roule **soit en indépendant** (avec sa propre licence, son entreprise et son véhicule : tout ce qui précède), **soit pour une société**, et pour une seule à la fois. La société détient les licences et les véhicules, et ses chauffeurs roulent pour elle. Leurs courses lui sont attribuées ; le reversement à la société reste à définir (le versement actuel est celui du chauffeur, voir [`zupdrive-api-admin.md`](./zupdrive-api-admin.md)).

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

### API gérant — utilisée par le portail `/societe`

Toutes les routes exigent une session. Le portail du gérant est disponible sur `/societe` : ouverture et édition du dossier, dépôt des pièces, gestion des véhicules, invitations et affectations des chauffeurs, puis historique des courses. Après inscription ou connexion depuis ce portail, le retour se fait vers `/societe`.

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

La gestion des chauffeurs (suspension, infractions, pièces), les notifications, le support, les webhooks, la conformité, les statistiques,
les versements et la supervision sont décrits dans [`zupdrive-api-admin.md`](./zupdrive-api-admin.md) (routes, droits, journal, règles financières). Les webhooks sortants restent désactivés tant que les événements métier ne sont pas reliés atomiquement ; voir le [contrat A11 et sa procédure de reprise](./WEBHOOKS-ZUPDRIVE-A11.md).

### Frontend
- **`/superowner/zupdrive/societes`** (menu « ZupDrive › Sociétés ») : la file de validation. Chaque pièce de la société et de chaque véhicule s'examine dans la page, la conformité de chaque véhicule s'affiche, et les chauffeurs rattachés et les invitations en attente sont listés. `/superowner/zupdrive/societes/:id` ouvre un dossier directement (lien des notifications).
- **Tableau de bord ZupDrive** : sociétés à examiner et sociétés validées.
- **`/chauffeur`** : les invitations reçues (accepter, refuser) ; une fois rattaché, la société, le véhicule attribué et « Quitter la société ». Le profil se réduit au nom et au téléphone.
- **Vérification E2E** : `npm run verif:zupdrive:societe` lance `frontend/scripts/verif-zupdrive-societe.mjs` contre le site et l'API locaux. Cette recette modifie des comptes et téléverse des pièces : elle refuse de tourner sans `ZUPDRIVE_E2E_ALLOW_DISPOSABLE_DB=1` et une URL locale nommée exactement `zupdrive_e2e`. Le 2 novembre 2026, elle passe **38/38 contrôles** sans erreur console. Elle couvre le portail du gérant, les pièces société, la flotte, les invitations, l'accord du chauffeur, la validation interne, l'affectation et le retrait du chauffeur.

## Courses — pilote Namur

Le passager commande un trajet à prix annoncé sur le web ou dans l'app mobile,
avec son compte ZupOne. La course est attribuée à un chauffeur éligible, qui
l'accepte puis la mène à terme. L'intégration Stripe et les remboursements sont
présents dans le code; le paiement de production est obligatoire par
configuration, après validation des essais Stripe TEST, 3DS et webhook sur
l'environnement cible. Les reversements aux chauffeurs, la facturation et la
TVA restent à confirmer avant les courses payantes. Voir
[`zupdrive-api-admin.md`](./zupdrive-api-admin.md#paiement-dune-course--apizupdrivepayment-et-webhook-stripe)
et le [périmètre du MVP](./zupdrive-mvp-scope.md).

Code : `backend/src/modules/zupdrive/` (`tarification-drive.service.ts`, `course-drive.service.ts`, `course-drive.jobs.ts`, `course-drive.routes.ts`). Modèles : `TarifDrive`, `CourseDrive`, `PropositionCourseDrive`, et `enLigne` / position sur `ChauffeurDrive`. Migration `0031_zupdrive_courses`.

### Prix
- Pour le pilote Namur, l'API impose **1,90 €/km et 8,20 € minimum**, sans prise en charge, attente ni majoration dynamique. Standard et XL utilisent le même barème. L'équipe ne peut pas activer un tarif wallon qui s'en écarte; la configuration est journalisée (`ZUPDRIVE_SET_TARIF`). La Ville doit encore confirmer la publication et l'application du règlement aux courses de plateforme.
- Le pilote de lancement vise la commune de Namur : l'API devis et commande vérifie le code postal au départ et à l'arrivée ainsi que les coordonnées contre le polygone officiel versionné dans `backend/src/modules/zupdrive/data/limite-commune-namur.json` (GeoJSON, AGDP / SPF Finances, via le Géoportail de la Wallonie, CC BY 4.0). Liste, attribution et limites : [cadrage MVP](./zupdrive-mvp-scope.md).
- Formule : `max(minimum, priseEnCharge + parKm × km + parMinute × minutes)`, calculée sur les mètres et les secondes exacts, puis **arrondie une seule fois au centime**, sur le total.
- **Devis signé** : le serveur calcule le devis et le signe (HMAC, `devis-signe.ts`), lié au compte du passager et valable 10 minutes. La commande reprend ce devis tel quel, donc le prix vu est le prix payé, même si l'itinéraire a changé entre-temps (circulation). Un devis retouché ou émis pour un autre compte est refusé (`INVALID_QUOTE`). Un devis expiré est refusé aussi (`QUOTE_EXPIRED`), et la page en redemande un. Une fois commandé, le prix est figé dans la course, avec une copie du tarif appliqué et la source de l'itinéraire.
- **Zone** : le pilote accepte uniquement un départ et une arrivée dans la commune de Namur, vérifiés par code postal et coordonnées. Les autres régions et communes ne sont pas ouvertes pour ce pilote.
- **Distance et durée** (`itineraire.service.ts`, variable `ROUTING_PROVIDER`) :
  - `estimation` : vol d'oiseau × 1,3, à 25 km/h, pour développement et démonstration seulement ;
  - `osrm` : la vraie route, calculée par un serveur **OSRM** (`OSRM_API_URL`), un moteur libre et gratuit basé sur OpenStreetMap. Il fournit aussi le tracé affiché sur la carte ;
  - en production, OSRM est obligatoire et le devis échoue si l'itinéraire routier n'est pas disponible; une estimation ne remplace jamais une route réelle pour établir le prix du pilote.

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
- **Paiement en ligne** : avec `ZUPDRIVE_PAIEMENT_OBLIGATOIRE=true`, la course reste en recherche sans être proposée à un chauffeur tant que le webhook Stripe n'a pas confirmé son paiement ; la page de suivi affiche alors le formulaire carte. Faute de paiement dans les 5 minutes de la recherche, elle passe « sans chauffeur » comme les autres. Par défaut (`false`), la recherche démarre sans paiement et la page n'affiche rien.
- La suppression d'un compte est refusée pendant un trajet actif. Une fois le compte supprimé, ses courses restent dans l'historique sans la personne (`passagerId` à null).

### API
| Qui | Route | Effet |
|---|---|---|
| Passager | `POST /api/zupdrive/courses/devis` | Reçoit deux preuves d'adresse signées par `GET /api/addresses/search?...&usage=zupdrive`, vérifie la zone côté serveur, puis renvoie distance, durée, prix, tracé et devis signé. Les coordonnées fournies séparément par le client ne sont pas acceptées. |
| Passager | `POST /api/zupdrive/courses` | Commander un devis signé (`devis`, `cleIdempotence`) |
| Passager | `GET /api/zupdrive/courses`, `GET …/:id`, `POST …/:id/annuler` | Suivre, annuler. La course porte `paiement: { obligatoire, statut }` (statut du paiement enregistré par le webhook Stripe) |
| Passager | `GET /api/zupdrive/adresses`, `PUT`/`DELETE …/:type` (`DOMICILE` ou `TRAVAIL`) | Ses adresses favorites (`AdresseFavoriteDrive`, une par type). Le serveur n'enregistre qu'une preuve valide et masque les favoris créés avant ce contrôle jusqu'à ce qu'ils soient re-sélectionnés. Supprimées avec le compte, incluses dans l'export RGPD |
| Passager | `POST /api/zupdrive/sos` (`courseId`, position facultative) | Alerte SOS pendant un trajet `ACCEPTEE`, `ARRIVEE` ou `EN_COURS` : alerte enregistrée d'abord (une par course, rejouable), puis ticket CRITIQUE de support, cloche de l'administration et e-mail à la personne de confiance. Aucune intervention sur place n'est promise : en Belgique, l'app indique le 101 pour la police et le 112 pour l'ambulance et les pompiers |
| Passager | `GET`/`PUT`/`DELETE /api/zupdrive/sos/contact` | Sa personne de confiance (nom, e-mail ; `consentement: true` exigé : le passager confirme l'avoir informée). Supprimée avec le compte, incluse dans l'export |
| Passager | `GET`/`POST /api/zupdrive/courses/:id/messages` (`texte` ≤ 500, `cleIdempotence`) | Chat avec son chauffeur : écriture seulement pendant `ACCEPTEE`, `ARRIVEE` ou `EN_COURS`, lecture ensuite (`?depuis=` pour la relecture). Participants de la course seulement, 200 messages au plus, relu toutes les 4 s (pas de temps réel). Supprimé à l'effacement du passager, purgé avec l'historique des courses terminées (90 jours) |
| Chauffeur | `GET`/`POST /api/zupdrive/chauffeur/me/courses/:id/messages` | Le même fil, côté chauffeur (pas encore d'écran chauffeur) |
| Passager | `POST /api/zupdrive/payment/intent` | Payer la course (page de suivi, carte Stripe) ; voir [`zupdrive-api-admin.md`](./zupdrive-api-admin.md) |
| Chauffeur | `GET /api/zupdrive/chauffeur/me/courses` | En ligne ?, proposition ouverte, course, historique |
| Chauffeur | `GET …/me/stats`, `GET …/me/infractions` | Mes statistiques, mes infractions |
| Chauffeur | `POST …/me/disponibilite`, `POST …/me/position` | En ligne / hors ligne, position (éligibilité basée sur position fraîche) |
| Chauffeur | `POST …/me/propositions/:id/(accepter\|refuser)` | Répondre avec l’ID de proposition, distinct de l’ID de course ; acceptation transactionnelle, un gagnant en cas de concurrence |
| Chauffeur | `POST …/me/courses/:id/(arrive\|demarrer\|terminer\|annuler)` | Étapes |
| Équipe (`courses-drive`) | `GET/PUT /api/zupdrive/admin/tarifs[/:region]`, `GET /api/zupdrive/admin/courses` | Tarifs, liste des courses |

La section de permissions **`courses-drive`** (« Courses et tarifs ») est nouvelle. Comme pour « Chauffeurs », il faut la cocher une fois dans les rôles ZupDrive déjà existants.

### Vérifications
- `backend/src/modules/zupdrive/__tests__/course-drive.integration.test.ts` : 18 tests contre PostgreSQL (`set -a; . ./.env; set +a; npx jest …`).
- `frontend/scripts/verif-zupdrive-courses.mjs` : une course de bout en bout dans trois navigateurs (équipe, chauffeur, passager). Seule la recherche d'adresses, qui dépend d'un service externe, y est simulée.

### App mobile chauffeur — A06 (11 octobre 2026)

L’application mobile utilise le login commun `POST /api/auth/login` (e-mail/mot de passe) et le renouvellement de session commun `/api/auth/refresh` ; aucun OTP chauffeur spécifique n’existe. Son tableau est `GET /api/zupdrive/chauffeur/me/courses`, jamais l’historique passager `GET /api/zupdrive/courses`. Le dossier vient de `/chauffeur/me`, les propositions sont acceptées par ID de proposition dans `/chauffeur/me/propositions/:id/accepter`, les étapes sont `/chauffeur/me/courses/:id/{arrive,demarrer,terminer}`, et les revenus chauffeur sont `GET /api/zupdrive/payment/earnings`.

La disponibilité est refusée par l’API tant que le dossier, la société (le cas échéant) et le véhicule ne sont pas prêts. L’app masque ses actions si le dossier n’est pas `VALIDE`, relit le tableau pendant qu’elle est en ligne et partage sa position toutes les 15 secondes au premier plan seulement. Une proposition dure 20 secondes. Le serveur garantit l’acceptation concurrente dans une transaction ; un 409 côté perdant n’est pas un succès. Les données de proposition ne comprennent que le prénom, les coordonnées du trajet et la moyenne du passager ; le cloisonnement reste vérifié côté serveur.

Le parcours natif réel, les droits avec PostgreSQL et le cas de deux chauffeurs ne sont pas attestés par une compilation ou par les tests d’URL. L’app reste **hors périmètre du pilote** jusqu’aux preuves du [guide mobile chauffeur](./validation-mobile-zupdrive-driver.md) et à leur inscription dans [`etat-projet.md`](./etat-projet.md).

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

OSRM est gratuit, mais il lui faut les données de la région préparées une fois.
La durée dépend du VPS et du volume de données :

```bash
mkdir -p osrm && cd osrm
wget https://download.geofabrik.de/europe/belgium-latest.osm.pbf
docker run --rm -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/belgium-latest.osm.pbf
docker run --rm -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-partition /data/belgium-latest.osrm
docker run --rm -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-customize /data/belgium-latest.osrm
```

Après le premier démarrage de la stack (`./deploy/zup.sh up`), joignez le
conteneur OSRM au réseau Docker interne de l'application. Ne publiez aucun port
OSRM sur Internet :

```bash
docker network inspect zupone_default >/dev/null
docker rm -f osrm 2>/dev/null || true
docker run -d --name osrm --restart unless-stopped \
  --network zupone_default --network-alias osrm \
  -v "$PWD:/data:ro" ghcr.io/project-osrm/osrm-backend \
  osrm-routed --algorithm mld /data/belgium-latest.osrm
```

Dans `.env.production`, configurez `ROUTING_PROVIDER=osrm` et
`OSRM_API_URL=http://osrm:5000`. Le profil de production refuse un devis si
OSRM ne répond pas; aucun repli sur une distance estimée n'est effectué.
Rafraîchissez périodiquement les données depuis Geofabrik et redémarrez le
conteneur après leur préparation. Le serveur public de démonstration d'OSRM
n'est pas fait pour la production. Après `./deploy/zup.sh down`, relancez
également OSRM avec la commande ci-dessus avant la recette du pilote.
