# ZupDrive — routes d'administration, support et supervision

Référence des routeurs ZupDrive montés par `backend/src/modules/zupdrive/zupdrive-montage.ts`
(ordre de montage, préfixes) et des garde-fous qui les protègent. Les routes chauffeur, société,
courses et paiement de base sont décrites dans `docs/zupdrive.md`.

## Conventions

| Terme | Sens |
|---|---|
| **Jeton** | `Authorization: Bearer <jeton d'accès>`. L'identité (`req.userId`) vient du jeton, jamais du corps, de la query ou d'un en-tête. Sans jeton : `401`. |
| **Équipe (section, niveau)** | Compte de l'équipe (`isSystemAdmin`) dont le rôle sur la plateforme **DRIVE** a la section demandée : lecture suffit pour `GET`, écriture (`write`) pour le reste. Le superowner passe partout. Sinon : `403`. Sections : `chauffeurs`, `courses-drive` (voir `SECTIONS` dans `permissions-plateforme.service.ts`). |
| **Superowner** | Chemin qu'aucune section ne couvre : réservé au superowner (`adminAuth` sans section). |
| **Compte** | Tout compte authentifié ; la route filtre sur le compte du jeton (« chacun chez soi »). |
| **Chauffeur** | Compte ayant un dossier `ChauffeurDrive` (`userId` du jeton). Sinon `403`/`404`. |

Le rôle codé en dur `ADMIN_ZUPDRIVE` (`UnifiedRolesService`) n'est plus utilisé par les routeurs montés : il était attribué à tout
rôle DRIVE autre que `SUPPORT`, même sans aucune permission, ce qui contournait les sections.

Toute écriture d'administration appelle `journaliser(req, action, cible, détails)` (table `SystemAuditLog` : qui, quoi, sur quelle ressource,
valeurs utiles). Jamais de secret, de clé ou de valeur de paramètre dans le journal.

Erreurs communes : `400` entrée invalide (Zod), `401` jeton absent/invalide, `403` droit insuffisant, `404` ressource inconnue (ou appartenant à un autre compte),
`429` limiteur de cadence, `503` service non configuré. Les erreurs internes ne sont jamais détaillées au client.

> Les routes `/api/zupdrive/admin/*` déjà montées (`chauffeur.admin`) posent un garde sur **tout** ce préfixe : un chemin que `ROUTES.zupdrive`
> n'attribue pas à une section y est réservé au superowner, quel que soit le routeur qui le sert. C'est pourquoi `driver-management`
> (section `chauffeurs`) est monté **avant** `chauffeur.admin`, et pourquoi les autres routeurs ont leur propre préfixe.

## Routeurs montés

| Préfixe | Routeur | Accès |
|---|---|---|
| `/api/zupdrive/admin` (avant `chauffeur.admin`) | `zupdrive-driver-management` | Équipe `chauffeurs` |
| `/api/zupdrive/notifications` | `zupdrive-notifications` | Chauffeur (alertes) ; Équipe `courses-drive` (admin) |
| `/api/zupdrive/notifications/webhooks/status` | `zupdrive-notifications-webhook` (dans `app.ts`) | Signature HMAC |
| `/api/zupdrive/support` | `zupdrive-support` | Compte (ses tickets) ; Équipe `courses-drive` (admin) |
| `/api/zupdrive/webhooks` | `zupdrive-webhooks` | Superowner |
| `/api/zupdrive/compliance` | `zupdrive-compliance` | Équipe `chauffeurs` |
| `/api/zupdrive/compliance-checks` | `zupdrive-compliance-checks` | Équipe `chauffeurs` |
| `/api/zupdrive/analytics` | `zupdrive-analytics` | Équipe `courses-drive` |
| `/api/zupdrive/reporting` | `zupdrive-reporting` | Équipe `courses-drive` |
| `/api/zupdrive/finance` | `zupdrive-payment-driver` | Chauffeur ; Équipe `courses-drive` (lectures) ; Superowner (traiter un versement, commission) |
| `/api/zupdrive` (en dernier) | `zupdrive-monitoring` | Chauffeur (`/notifications`, `/metrics`, `/earnings-realtime`) ; `/admin/*` : Équipe, mais superowner seul en pratique (garde de `chauffeur.admin`) |

### Collisions examinées

Aucune route n'est servie deux fois ni masquée par une route à paramètre (test `zupdrive-montage.test.ts`, qui vérifie aussi que chaque route
exige un jeton). Points d'attention :

- `admin/dashboard` : `zupdrive-admin-dashboard` est monté sur `/api/zupdrive/admin/dashboard`, `zupdrive-monitoring` sert `GET /api/zupdrive/admin/dashboard` (chemin exact) ; ils ne se recouvrent pas.
- `payment` : `GET /payment/earnings` était masquée par `GET /payment/:courseId` ; `/earnings` est maintenant déclarée avant. `zupdrive-payment-driver` garde son préfixe `/finance`, distinct de `/payment`.
- `suspend` / `reactivate` existent deux fois : `POST /admin/chauffeurs/:id/suspend` (dossier, `chauffeur.admin`) et `POST /admin/drivers/:id/suspend` (`driver-management`, utilisé par les pages superowner). Les deux écrivent `statut = SUSPENDU` et sont journalisées.

## `driver-management` — `/api/zupdrive/admin` (Équipe `chauffeurs`)

| Méthode | Route | Entrée | Réponse | Journal |
|---|---|---|---|---|
| GET | `/drivers` | query `status?`, `minRating?`, `region?`, `limit` (1-100, 50), `offset` | `{ drivers[], total }` | — |
| POST | `/drivers/:id/suspend` | `{ reason }` (5-500) | `{ success }` ; 404 chauffeur inconnu | `ZUPDRIVE_SUSPEND_CHAUFFEUR` |
| POST | `/drivers/:id/reactivate` | — | `{ success }` ; 400 si non suspendu | `ZUPDRIVE_REACTIVATE_CHAUFFEUR` |
| POST | `/drivers/:id/validate-document` | `{ type: PERMIS\|ASSURANCE\|INSPECTION\|IDENTITE, expiresAt }` | `{ success }` ; 404 pièce non déposée | `ZUPDRIVE_VALIDATE_CHAUFFEUR_DOCUMENT` |
| GET | `/drivers/:id/infractions` | — | liste | — |
| POST | `/drivers/:id/report-infraction` | `{ type, description (10-1000), severity: BASSE\|MOYENNE\|HAUTE }` | `{ infractionId }` ; `HAUTE` suspend automatiquement | `ZUPDRIVE_REPORT_INFRACTION` (`suspensionAutomatique`) |
| POST | `/infractions/:id/resolve` | `{ resolution (10-1000) }` | `{ success }` | `ZUPDRIVE_RESOLVE_INFRACTION` |
| GET | `/drivers/:id/stats` | — | statistiques du chauffeur | — |

## `notifications` — `/api/zupdrive/notifications`

Chauffeur (jeton ; le chauffeur est celui du jeton, un `?driverId=` ou un `driverId` dans le corps est ignoré) :

| Méthode | Route | Réponse | Erreurs |
|---|---|---|---|
| GET | `/alerts/unread` | alertes non lues du chauffeur | 403 sans dossier chauffeur |
| PATCH | `/alerts/read-all` | `{ success }` | 403 |
| PATCH | `/alerts/:id/read` | `{ success }` | 404 si l'alerte appartient à un autre chauffeur |

Équipe `courses-drive` (écritures journalisées) :

| Méthode | Route | Entrée | Journal |
|---|---|---|---|
| POST | `/admin/templates` | `{ key, name, type: EMAIL\|SMS\|PUSH, subject?, body, variables[], active }` → 201 | `ZUPDRIVE_UPSERT_NOTIFICATION_TEMPLATE` |
| GET | `/admin/templates`, `/admin/templates/:key` | query `activeOnly` | — |
| POST | `/admin/send` | `{ recipientId, recipientType, templateKey, type, recipient, variables? }` → 201 | `ZUPDRIVE_SEND_NOTIFICATION` (sans l'adresse du destinataire) |
| POST | `/admin/trigger-event` | `{ type, driverId, variables }` | `ZUPDRIVE_TRIGGER_NOTIFICATION_EVENT` |
| POST | `/admin/alerts` | `{ driverId, type, severity, title, message, triggerAction? }` → 201 | `ZUPDRIVE_CREATE_ALERT` |
| GET | `/admin/history`, `/admin/stats` | filtres, pagination | — |

### Webhook d'accusés — `POST /api/zupdrive/notifications/webhooks/status`

Appelé par le fournisseur d'envoi. Monté dans `app.ts` **avant** le lecteur JSON (la signature porte sur le corps brut), avec son propre limiteur
(`limiterWebhookNotificationsDrive`, 300/min/IP).

- En-têtes : `X-Zupdrive-Timestamp` (secondes) et `X-Zupdrive-Signature` = `hex(HMAC-SHA256(secret, "<timestamp>.<corps brut>"))`. Tolérance 5 minutes (rejeu).
- Secret : variable `ZUPDRIVE_NOTIFICATIONS_WEBHOOK_SECRET` (≥ 32 caractères). Absente : `503`, rien n'est accepté.
- Corps : `{ notificationLogId, status: SENT|FAILED|BOUNCED, errorMessage? }`.
- Réponse : `{ success: true, applied: boolean }`. Idempotent et résistant au désordre : un statut ne peut qu'avancer (`PENDING < SENT < FAILED < BOUNCED`), un doublon ou un accusé en retard renvoie `applied: false`.
- Erreurs : `401` signature invalide ou horodatage périmé, `400` corps invalide, `404` notification inconnue, `503` non configuré.

## `support` — `/api/zupdrive/support`

Compte authentifié (le déclarant est le compte du jeton ; `reporterId`, `reporterType`, `authorId`, `authorType` du corps sont ignorés) :

| Méthode | Route | Entrée | Réponse / erreurs |
|---|---|---|---|
| POST | `/tickets` | `{ category, priority, subject (5-200), description (10-2000) }` | 201 ticket ; `reporterType` = `CHAUFFEUR` si le compte a un dossier chauffeur, sinon `PASSAGER` ; limite 10/h/compte |
| GET | `/tickets` | query `limit`, `offset` | `{ tickets[], total }` : uniquement les tickets du compte |
| GET | `/tickets/:id` | — | ticket + messages ; 404 si le ticket est celui d'un autre compte |
| POST | `/tickets/:id/messages` | `{ message (1-5000), attachmentUrl? (https) }` | 201 message ; 404 si ticket d'un autre compte ; limite 30/min/compte |

Équipe `courses-drive` :

| Méthode | Route | Entrée | Journal |
|---|---|---|---|
| GET | `/admin/tickets`, `/admin/tickets/:id`, `/admin/metrics` | filtres (`status`, `priority`, `category`, `assignedTo`, `reporterId`), pagination | — |
| POST | `/admin/tickets/:id/messages` | `{ message, attachmentUrl? }` ; auteur = jeton, type `AGENT` | `ZUPDRIVE_SUPPORT_REPLY` |
| POST | `/admin/tickets/:id/assign` | `{ agentId }` | `ZUPDRIVE_SUPPORT_ASSIGN` |
| PATCH | `/admin/tickets/:id/status` | `{ status, resolution? }` | `ZUPDRIVE_SUPPORT_SET_STATUS` |
| POST | `/admin/tickets/:id/escalate` | `{ newPriority }` (doit être plus élevée, sinon 400) | `ZUPDRIVE_SUPPORT_ESCALATE` |
| POST | `/admin/tickets/:id/close` | `{ resolution (10-2000) }` | `ZUPDRIVE_SUPPORT_CLOSE` |

## `webhooks` — `/api/zupdrive/webhooks` (Superowner)

| Méthode | Route | Entrée | Notes | Journal |
|---|---|---|---|---|
| POST | `/admin/endpoints` | `{ url, events[], maxRetries?, initialDelayMs?, backoffMultiplier? }` | URL validée par `destinationWebhook` (HTTPS public, anti-SSRF). Le **secret HMAC** (64 hex, `crypto.randomBytes`) est renvoyé **une seule fois**, stocké chiffré (`privacy/crypto`) | `ZUPDRIVE_CREATE_WEBHOOK_ENDPOINT` (sans secret) |
| GET | `/admin/endpoints` | `activeOnly` | jamais de secret | — |
| PATCH | `/admin/endpoints/:endpointId` | `{ url?, events?, active? }` | 404 inconnu ; nouvelle URL revalidée | `ZUPDRIVE_UPDATE_WEBHOOK_ENDPOINT` |
| DELETE | `/admin/endpoints/:endpointId` | — | 404 inconnu | `ZUPDRIVE_DELETE_WEBHOOK_ENDPOINT` |
| POST | `/admin/events` | `{ eventType, resourceType, resourceId, data }` | crée l'événement et planifie les livraisons (`WebhookDeliveryDrive`) | `ZUPDRIVE_TRIGGER_WEBHOOK_EVENT` |
| GET | `/admin/deliveries` | `webhookId?`, `status?`, pagination | historique | — |
| POST | `/admin/providers` | `{ provider, type, apiKey, webhookSigningKey?, config? }` | clés chiffrées, jamais renvoyées (`apiKeyConfigured`) | `ZUPDRIVE_CREATE_PROVIDER_INTEGRATION` |
| GET | `/admin/providers` | `activeOnly` | — | — |
| PATCH | `/admin/providers/:integrationId` | `{ apiKey?, webhookSigningKey?, active?, config? }` | 404 inconnu | `ZUPDRIVE_UPDATE_PROVIDER_INTEGRATION` (booléens « clé changée », jamais la clé) |
| GET | `/admin/stats` | — | — | — |

La livraison effective des événements (job, signature sortante) n'existe pas encore : `scheduleWebhookDelivery` enregistre la livraison `PENDING`.

## `compliance` — `/api/zupdrive/compliance` (Équipe `chauffeurs`)

| Méthode | Route | Entrée | Journal |
|---|---|---|---|
| GET | `/admin/audit-logs` | filtres `resourceId`, `resourceType`, `actorId`, `action`, `startDate`, `endDate`, pagination | — |
| POST | `/admin/checks` | `{ chauffeurId, type, expiresAt, notes? }` → 201 ; 404 chauffeur inconnu | `ZUPDRIVE_CREATE_COMPLIANCE_CHECK` |
| GET | `/admin/checks/:chauffeurId` | — | — |
| PATCH | `/admin/checks/:checkId` | `{ status, findings?, notes? }` ; `completedBy` = jeton ; 404 inconnu | `ZUPDRIVE_UPDATE_COMPLIANCE_CHECK` |
| GET | `/admin/expiring-documents` | `daysThreshold` | — |
| POST | `/admin/reports` | `{ reportType }` ; `generatedBy` = jeton → 201 | `ZUPDRIVE_GENERATE_COMPLIANCE_REPORT` |
| GET | `/admin/reports` | pagination | — |

Retirés : `POST /admin/audit-logs` (l'acteur venait du corps : entrée falsifiable) et `/admin/document-verification*` (workflow sur la table en doublon
`DocumentVerificationWorkflow`, sans effet sur `DocumentChauffeurDrive`).

## `compliance-checks` — `/api/zupdrive/compliance-checks` (Équipe `chauffeurs`)

| Méthode | Route | Notes | Journal |
|---|---|---|---|
| POST | `/admin/compliance/:chauffeurId/run-checks` | enregistre un `ComplianceReportDrive` ; `autoDecision` n'est **qu'une recommandation** (le dossier du chauffeur n'est pas modifié) | `ZUPDRIVE_RUN_COMPLIANCE_CHECKS` |
| GET | `/admin/compliance/:chauffeurId/latest`, `/history?limit` (1-50) | 404 sans rapport | — |
| GET | `/admin/compliance/flagged-for-review`, `/dashboard` | niveaux `HIGH`/`CRITICAL` | — |
| GET | `/admin/compliance/:reportId/export?format=json\|pdf` | `pdf` : 501 | — |

## `analytics` — `/api/zupdrive/analytics` (Équipe `courses-drive`, lecture seule)

`GET /period`, `/drivers` (+`limit`), `/regions`, `/payments` : query `startDate`, `endDate` (ISO 8601, `fin ≥ début`, au plus 366 jours, sinon `400`).
`GET /compare` : `period1Start/End`, `period2Start/End`, mêmes bornes. `GET /dashboard` : synthèse. Les réponses financières sont filtrées pour un rôle sans la permission `billing`.

## `finance` — `/api/zupdrive/finance`

Chauffeur (le chauffeur est celui du jeton) :

| Méthode | Route | Notes |
|---|---|---|
| GET | `/earnings?period=today\|week\|month` | revenus du chauffeur |
| GET | `/financial-dashboard` | synthèse |
| GET | `/payouts/history?limit` | historique |
| POST | `/payouts/request` | prépare les versements des paiements `SUCCEEDED` pas encore versés ; idempotent (`paymentId` unique) ; 400 « Aucun revenu à verser » ; limite 10/h/compte |
| GET | `/payouts/:payoutId` | 404 si le versement est celui d'un autre chauffeur |
| POST | `/earnings/calculate` | `{ courseId }` |

Équipe `courses-drive` (lecture) : `GET /admin/payouts/pending`, `/admin/driver/:chauffeurId/payouts`, `/admin/financial-dashboard`.

Superowner (journalisés) :

| Méthode | Route | Journal |
|---|---|---|
| POST | `/admin/courses/:courseId/refund` : voir « Remboursement » ci-dessus | `ZUPDRIVE_REFUND_COURSE` |
| POST | `/admin/payouts/:payoutId/process` : rattache le versement `PENDING` au lot de sa semaine ; 404 / 400 / 409 (déjà rattaché, lot soumis) | `ZUPDRIVE_PROCESS_PAYOUT` |
| POST | `/admin/settings/commission` : `{ commissionPercentage }` entier 0-100 | `ZUPDRIVE_UPDATE_COMMISSION` (`avant`, `apres`) |

### Règles financières

- Montants en centimes entiers. `commission = Math.round(prix × pourcentage / 100)`, part chauffeur = `prix − commission` (`commission-drive.ts`, une seule règle pour le paiement, les versements, la supervision et les rapports). Pourcentage : `PlatformSettingsDrive` ligne `default` (20 par défaut).
- La répartition est **figée à la création du paiement** (`PaymentIntentDrive.platformCommissionCentimes` / `driverEarningsCentimes`) : changer le pourcentage n'affecte que les paiements créés ensuite ; un paiement existant et son versement gardent leur montant. Une correction se fait par une opération corrective, jamais en réécrivant l'historique.
- Semaine d'un lot : lundi 00:00 **UTC** → lundi suivant (`semaine-versement.ts`), identique pour le webhook de paiement et `preparePayout`. Le lot regroupe les versements `PENDING` non rattachés dont `periodStart` tombe dans la semaine ; un lot déjà soumis à Stripe refuse tout nouveau versement (409).
- `handlePaymentSucceeded` est rejouable : paiement `SUCCEEDED` et versement créés dans une transaction, `upsert` sur `paymentId` unique.

## Paiement d'une course — `/api/zupdrive/payment` et webhook Stripe

Passager (jeton ; l'identité est `req.userId`, la course doit être la sienne, sinon `404`) :

| Méthode | Route | Notes |
|---|---|---|
| POST | `/payment/intent` | `{ courseId }` ; le montant est celui de la course en base, jamais celui du client. Course `RECHERCHE` seulement (409 sinon). Rejouer la demande rend le même paiement non réglé (même `clientSecret`) ; course déjà payée ou intention annulée : `409 PAYMENT_ALREADY_EXISTS`. Limite 10 / 10 min / compte. |
| GET | `/payment/:courseId` | `{ courseId, payment: { id, status, amountCentimes, currency, confirmedAt } \| null }`, relu en base |
| GET | `/payment/earnings` | revenus du chauffeur du jeton |

`GET /realtime/stats` est réservé à l'équipe (`courses-drive`).

**Paiement obligatoire** (`ZUPDRIVE_PAIEMENT_OBLIGATOIRE`, faux par défaut) : vrai, `proposerAuSuivant` ne sollicite aucun chauffeur tant que le `PaymentIntentDrive` de la course n'est pas `SUCCEEDED` (le webhook en est la seule source) ; la course reste `RECHERCHE` et expire au bout de `RECHERCHE_MAX_MS` (5 min) en `SANS_CHAUFFEUR`, sans rien à rembourser puisque rien n'a été payé. Aucun nouvel état de course. La réponse de `GET /api/zupdrive/courses/:id` porte `paiement: { obligatoire, statut }`. Après le paiement, le balayage (toutes les 5 s) lance la recherche.

**La confirmation vient uniquement du webhook Stripe** (`POST /api/payments/webhook`, déjà en place pour ZupEat : signature sur le corps brut, journal `StripeEvent` idempotent). `payment.service.traiterEvenement` aiguille les intentions qui portent `metadata.courseId` et pas `orderId` vers `ZupDrivePaymentService` :

| Événement Stripe | Effet sur `PaymentIntentDrive` |
|---|---|
| `payment_intent.succeeded` | contrôle de l'état, de la devise et du montant reçu (= `amountCentimes` en base, sinon `409 PAYMENT_AMOUNT_MISMATCH`, journalisé et rejoué par Stripe) et de `metadata.courseId` ; puis `SUCCEEDED` + `confirmedAt` (une seule fois) |
| `payment_intent.payment_failed` | statut de l'intention en majuscules, sans jamais défaire un `SUCCEEDED` |
| `payment_intent.canceled` | `CANCELED` + motif, même règle |

Une intention inconnue de la base est ignorée sans erreur. Le paiement peut être confirmé avant qu'un chauffeur accepte (paiement d'avance) : le webhook ne dépend pas de la course.

**Versement du chauffeur** (`creerVersementSiDu`) : créé quand le paiement est `SUCCEEDED` **et** la course `TERMINEE` avec un chauffeur, quel que soit l'ordre d'arrivée (webhook après la fin de course, ou fin de course — `CourseDriveService.avancer(terminer)` — après un paiement d'avance). Un seul versement par paiement (`paymentId` unique, `upsert`), montant = revenu chauffeur figé sur le paiement, semaine UTC des lots. `preparePayout` (« demander mes versements ») rattrape les cas où l'un des deux appels a échoué, et ne prend que les courses terminées.

**Remboursement** : une course payée qui n'aboutit pas (`ANNULEE` par le passager ou le chauffeur, `SANS_CHAUFFEUR`) rend la totalité au passager. Aucun frais d'annulation n'existe aujourd'hui ; s'il en existe un jour, ce sera une règle à part. `ZupDrivePaymentService.rembourserCourse` est appelé à l'annulation et à la fin de la recherche (best-effort : un échec ne défait pas l'annulation), à la réception d'un paiement arrivé après l'annulation, et par le balayage des courses (toutes les 5 s, 20 paiements au plus) qui reprend ce qui n'est pas parti. Il est rejouable : les remboursements existants sont relus chez Stripe, un remboursement réussi ou en attente est repris, une nouvelle demande n'a lieu qu'après un échec (autre clé d'idempotence). L'état en base suit ce que Stripe a réellement rendu (`charge.refunded`, `refund.updated`, `refund.failed` aiguillés vers ZupDrive) :

| Statut `PaymentIntentDrive` | Sens |
|---|---|
| `SUCCEEDED` | encaissé |
| `REFUND_REQUESTED` | remboursement demandé, pas encore rendu |
| `REFUNDED` | tout le montant est rendu |
| `REFUND_FAILED` | Stripe n'a pas pu rembourser ; repris par le balayage ou par l'équipe |

Aucun de ces statuts n'est remplacé par un événement en retard (échec, annulation, second `succeeded`). Refus (`409 COURSE_NOT_REFUNDABLE`) pour une course terminée ou dont le chauffeur a déjà un versement : cela demande une opération corrective, pas un remboursement. Un remboursement partiel fait depuis le tableau de bord Stripe ne change pas le statut.

Reprise manuelle (superowner, journalisée `ZUPDRIVE_REFUND_COURSE`) : `POST /api/zupdrive/finance/admin/courses/:courseId/refund` `{ motif }` (5-500) → `{ success, status }` ; `404 NOTHING_TO_REFUND` si le paiement n'existe pas, n'a jamais été réglé ou est déjà remboursé ; `502 REFUND_FAILED` si Stripe échoue encore.

## `monitoring` — `/api/zupdrive`

Chauffeur : `GET /notifications?limit` (1-100), `POST /notifications/:id/read` (404 si la notification est celle d'un autre compte), `POST /notifications/mark-all-read`, `GET /metrics`, `GET /earnings-realtime`.
Équipe (superowner seul tant que `chauffeur.admin` garde `/api/zupdrive/admin`) : `GET /admin/dashboard` et `/admin/health` (`courses-drive`), `/admin/driver/:chauffeurId/metrics`,
`/admin/payout-failure-alerts` (`courses-drive`), `/admin/alerts?type=all|compliance|rating|suspension`, `/admin/compliance-alerts`, `/admin/document-expiration-alerts` (`chauffeurs`).
`GET /ws` a été retiré : il renvoyait le jeton d'accès dans une URL.

## `reporting` — `/api/zupdrive/reporting` (Équipe `courses-drive`)

`POST /admin/driver-performance` (`{ driverId, startDate, endDate }`), `POST /admin/financial` (`{ startDate, endDate }`), `POST /admin/compliance` (`{ includeRecommendations? }`) génèrent un rapport à la volée.
Rapports programmés : `POST /admin/scheduled` (`{ name, reportType, frequency, recipients[], format }` → 201, `ZUPDRIVE_CREATE_SCHEDULED_REPORT`), `GET /admin/scheduled`, `PATCH /admin/scheduled/:reportId` (404 inconnu, `ZUPDRIVE_UPDATE_SCHEDULED_REPORT`).
Règle du rapport financier : `netProfit` = commissions des paiements confirmés − remboursements − frais (frais de paiement non enregistrés : 0). Les versements aux chauffeurs ne sont pas retirés (ils sont la part du prix hors commission).
La génération et l'envoi automatiques des rapports programmés n'existent pas encore.

## Routeurs non montés

| Routeur | Raison |
|---|---|
| `zupdrive-platform-config` | Écrit `CommissionConfig`, `RegionalConfig`, `PricingRule` et `PlatformSettings`, qu'aucun code de tarification ou de paiement ne lit : la commission réelle est `PlatformSettingsDrive` et les tarifs `TarificationDriveService` (`/admin/tarifs`). Le monter laisserait changer une commission « sans effet ». Journalisation ajoutée ; `POST /calculate-price` accepte un `surgeMultiplier` du client. |
| `zupdrive-chauffeur-onboarding` | Doublon de `/api/zupdrive/chauffeur` + `/admin/chauffeurs/:id/approve` via `UnifiedRolesService` : `approveChauffeur` ne vérifie pas les pièces exigées (`piecesExigees`), `submit` ne vérifie pas la complétude. Le monter contournerait les règles d'inscription. |
| `zupdrive-document-validation` | Doublon du dépôt de pièces (`/chauffeur/me/documents`) et de leur examen (`PATCH /admin/chauffeurs/:id/documents/:id`) : accepte une URL de fichier fournie par le client, types en majuscules (`PERMIS`) alors que la référence est en minuscules (`permis`), approbation sans contrôle d'appartenance. |
| `zupdrive-driver-rating` | **Supprimé** : `submitRating` écrivait `RatingCourseDrive` alors que la moyenne vient de `NoteCourseDrive` (notes non comptées), `POST /courses/:id/note` existe déjà, et la réputation et les avis de n'importe quel chauffeur étaient lisibles par tout compte. Le modèle `RatingCourseDrive` reste au schéma (aucun écrivain) ; une contrainte unique `(courseId, passengerId)` n'a donc pas lieu d'être tant qu'on n'y écrit pas. |
