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
| `/api/zupdrive/finance` | `zupdrive-payment-driver` | Chauffeur ; Équipe `courses-drive` (lectures) ; Superowner (traiter un versement, commission) |
| `/api/zupdrive` (en dernier) | `zupdrive-monitoring` | Chauffeur (`/notifications`, `/metrics`, `/earnings-realtime`) ; `/admin/*` : Équipe, mais superowner seul en pratique (garde de `chauffeur.admin`) |

### Collisions examinées

Aucune route n'est servie deux fois ni masquée par une route à paramètre (test `zupdrive-montage.test.ts`, qui vérifie aussi que chaque route
exige un jeton). Points d'attention :

- `admin/dashboard` : `zupdrive-admin-dashboard` est monté sur `/api/zupdrive/admin/dashboard`, `zupdrive-monitoring` sert `GET /api/zupdrive/admin/dashboard` (chemin exact) ; ils ne se recouvrent pas.
- `payment` : `GET /api/zupdrive/payment/earnings` est **masquée** par `GET /payment/:courseId` (défaut préexistant, voir la PR). `zupdrive-payment-driver` a donc son préfixe `/finance`.
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
| POST | `/admin/payouts/:payoutId/process` : rattache le versement `PENDING` au lot de sa semaine ; 404 / 400 / 409 (déjà rattaché, lot soumis) | `ZUPDRIVE_PROCESS_PAYOUT` |
| POST | `/admin/settings/commission` : `{ commissionPercentage }` entier 0-100 | `ZUPDRIVE_UPDATE_COMMISSION` (`avant`, `apres`) |

### Règles financières

- Montants en centimes entiers. `commission = Math.round(prix × pourcentage / 100)`, part chauffeur = `prix − commission` (`commission-drive.ts`, une seule règle pour le paiement, les versements, la supervision et les rapports). Pourcentage : `PlatformSettingsDrive` ligne `default` (20 par défaut).
- La répartition est **figée à la création du paiement** (`PaymentIntentDrive.platformCommissionCentimes` / `driverEarningsCentimes`) : changer le pourcentage n'affecte que les paiements créés ensuite ; un paiement existant et son versement gardent leur montant. Une correction se fait par une opération corrective, jamais en réécrivant l'historique.
- Semaine d'un lot : lundi 00:00 **UTC** → lundi suivant (`semaine-versement.ts`), identique pour le webhook de paiement et `preparePayout`. Le lot regroupe les versements `PENDING` non rattachés dont `periodStart` tombe dans la semaine ; un lot déjà soumis à Stripe refuse tout nouveau versement (409).
- `handlePaymentSucceeded` est rejouable : paiement `SUCCEEDED` et versement créés dans une transaction, `upsert` sur `paymentId` unique.

## `monitoring` — `/api/zupdrive`

Chauffeur : `GET /notifications?limit` (1-100), `POST /notifications/:id/read` (404 si la notification est celle d'un autre compte), `POST /notifications/mark-all-read`, `GET /metrics`, `GET /earnings-realtime`.
Équipe (superowner seul tant que `chauffeur.admin` garde `/api/zupdrive/admin`) : `GET /admin/dashboard` et `/admin/health` (`courses-drive`), `/admin/driver/:chauffeurId/metrics`,
`/admin/payout-failure-alerts` (`courses-drive`), `/admin/alerts?type=all|compliance|rating|suspension`, `/admin/compliance-alerts`, `/admin/document-expiration-alerts` (`chauffeurs`).
`GET /ws` a été retiré : il renvoyait le jeton d'accès dans une URL.

## Routeurs non montés

| Routeur | Raison |
|---|---|
| `zupdrive-platform-config` | Écrit `CommissionConfig`, `RegionalConfig`, `PricingRule` et `PlatformSettings`, qu'aucun code de tarification ou de paiement ne lit : la commission réelle est `PlatformSettingsDrive` et les tarifs `TarificationDriveService` (`/admin/tarifs`). Le monter laisserait changer une commission « sans effet ». Journalisation ajoutée ; `POST /calculate-price` accepte un `surgeMultiplier` du client. |
| `zupdrive-reporting` | `netProfit` du rapport financier compte des sommes en double : règle comptable à fournir. Journalisation ajoutée. |
| `zupdrive-chauffeur-onboarding` | Doublon de `/api/zupdrive/chauffeur` + `/admin/chauffeurs/:id/approve` via `UnifiedRolesService` : `approveChauffeur` ne vérifie pas les pièces exigées (`piecesExigees`), `submit` ne vérifie pas la complétude. Le monter contournerait les règles d'inscription. |
| `zupdrive-document-validation` | Doublon du dépôt de pièces (`/chauffeur/me/documents`) et de leur examen (`PATCH /admin/chauffeurs/:id/documents/:id`) : accepte une URL de fichier fournie par le client, types en majuscules (`PERMIS`) alors que la référence est en minuscules (`permis`), approbation sans contrôle d'appartenance. |
| `zupdrive-driver-rating` | `submitRating` écrit `RatingCourseDrive` mais la moyenne vient de `NoteCourseDrive` (notes non comptées) ; `POST /courses/:id/note` existe déjà ; réputation et avis de n'importe quel chauffeur lisibles par tout compte. |
