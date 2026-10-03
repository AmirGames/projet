# Paiements, remboursements, webhooks et abus — 3 octobre 2026

Branche : `claude/awesome-ride-m9lci8`. Début de l'audit au commit `2b47c983`.
Pendant le travail, une partie des corrections a été intégrée au commit
`5a624085` (« Update Socket.IO »). Les derniers compléments transactionnels
et leurs tests sont encore locaux au moment de la rédaction. Ce rapport
ne confirme pas leur déploiement.

## Corrections

### Paiements et pourboires

- `marquerPaye` journalisait un montant incorrect puis enregistrait quand même
  la commande comme payée. Il refuse désormais un montant encaissé différent
  du montant attendu, une devise incorrecte ou un état autre que `succeeded`,
  sans annoncer la commande ni écrire son succès.
- Les métadonnées Stripe ne peuvent plus désigner seules une commande :
  l'intention doit correspondre au paiement enregistré en base. Une métadonnée
  contradictoire est refusée, une intention inconnue est ignorée.
- Les intentions `processing`, `requires_capture` ou `succeeded` pouvaient
  être remplacées alors que le webhook n'avait pas encore actualisé la base.
  Toute intention non annulée est maintenant réutilisée. Un montant différent
  bloque la création d'une autre intention active.
- Les créations de paiement et pourboire ont une clé d'idempotence stable,
  liée à la commande et à l'intention annulée précédente. Deux premières
  demandes concurrentes ne fournissent pas deux clés différentes.
- Pour un pourboire encore ouvert, changer de montant modifie la même
  intention Stripe. Une intention déjà en traitement ou encaissée ne peut
  pas changer de montant et n'est pas remplacée.
- Le marquage d'une commande payée et son paiement passent par une transaction.
  La mise à jour conditionnelle refuse de réécrire une commande devenue
  `REFUNDED` depuis la lecture. La création d'intention ne remet pas
  inconditionnellement les paiements réussis ou remboursés en attente.
- La transmission au commerçant exige maintenant `paymentStatus: SUCCEEDED`,
  en plus des conditions métier existantes.
- Le marquage d'un pourboire payé et l'incrément du crédit du livreur sont
  transactionnels : un crédit échoué ne doit pas laisser un pourboire déjà
  marqué payé que le rejeu ignorerait.

### Remboursements

- Un échec d'un ancien remboursement ne remet plus en « payé » un remboursement
  plus récent : son identifiant doit correspondre à celui enregistré.
- Un événement `charge.refunded` relit la charge actuelle chez Stripe avant
  de noter son cumul. Un ancien événement partiel ne remplace donc pas le
  montant du remboursement final par son ancien instantané.
- Un remboursement échoué relit aussi la charge actuelle : les remboursements
  partiels réussis restent comptabilisés au lieu d'être effacés.
- Un refus immédiat de Stripe (`failed` ou `canceled`) ne marque plus la commande
  remboursée. L'identifiant échoué est conservé ; une nouvelle tentative utilise
  une nouvelle clé, tout en conservant l'idempotence des répétitions de cette
  tentative.
- Les écritures de remboursement sur la commande et le paiement sont
  transactionnelles et prennent les lignes dans le même ordre que le succès
  du paiement.

L'état interne `REFUNDED` après une création Stripe encore `pending` conserve
la convention existante : remboursement demandé, pas preuve du versement final
au client. Le statut Stripe retourné reste disponible ; les événements d'échec
recalculent l'état réel.

### Webhooks sortants

La fonction autorisait des URL internes et suivait les redirections de `fetch`.
Une permission de configuration de webhook pouvait donc servir à provoquer
des requêtes depuis le backend vers son réseau interne.

Le nouveau transport exige HTTPS en production, refuse les credentials et
fragments dans l'URL et n'autorise que des adresses IP publiques. Il contrôle
toutes les adresses DNS, à la création et à chaque tentative, puis épingle
l'adresse validée dans la connexion HTTPS avec le nom d'hôte original pour TLS.
Il ne suit aucune redirection et ne télécharge pas le corps de réponse.
La résolution DNS et la requête ont chacune une limite de cinq secondes.
IPv4/IPv6 privées, loopback, link-local, metadata, mapped IPv4, documentation
et mécanismes de transition identifiés sont refusés.

Seul le récepteur loopback des vérifications peut utiliser HTTP hors production.
Les abonnements existants pointant vers des destinations interdites échoueront
désormais et suivront la politique de relance existante. Les webhooks externes
publics, signatures HMAC et identifiants stables des envois sont conservés.

### Limitation des abus

- Les protections existantes de possession de commande et de carte ont été
  conservées et leurs tests rejoués.
- Le budget IP+destinataire de connexion pouvait être contourné en changeant
  d'adresse cible. Une limite supplémentaire de 50 essais par IP et quinze
  minutes couvre la connexion.
- Un budget commun de 20 courriels par IP et quinze minutes couvre les demandes
  de réinitialisation et les renvois de vérification, en complément des limites
  spécifiques existantes.
- La préparation et l'enregistrement de cartes sont limités à 20 demandes par
  minute par compte authentifié. Un `userId` injecté dans le corps ne change pas
  le compteur.

Les budgets utilisent le stockage Redis existant quand il est disponible et
sa solution de repli mémoire. Le déploiement indique `TRUST_PROXY: 1` derrière
Caddy ; aucune modification du pare-feu ou des secrets n'a été faite.

## Fichiers travaillés

- `backend/src/modules/payments/payment.service.ts`
- `backend/src/modules/payments/payment-methods-api.routes.ts`
- `backend/src/modules/orders/pourboire.service.ts`
- `backend/src/modules/webhooks/webhook.service.ts`
- `backend/src/modules/webhooks/webhook-destination.ts` (nouveau)
- `backend/src/middleware/throttle.ts`
- `backend/src/modules/auth/auth.routes.ts`
- `backend/src/modules/payments/__tests__/payment.test.ts`
- `backend/src/modules/payments/__tests__/payment-methods-idor.test.ts`
- `backend/src/modules/orders/pourboire-security.test.ts` (nouveau)
- `backend/src/modules/webhooks/webhook-destination.test.ts` (nouveau)
- `backend/src/middleware/__tests__/throttle.test.ts`

## Validation

Huit suites sélectionnées : **139/139 tests réussis**, couvrant paiements,
possession, cartes, pourboires, destinations de webhook, limitation de cadence,
sessions et Socket.IO. Après l'ajout du filtre final de transmission : les
**33 tests de paiement** ont été rejoués et ont réussi.

`npm run build` : génération Prisma, TypeScript et bundles réussis.
`git diff --check` : réussi. Un avertissement SMTP `QUERYWRAP` préexistant demeure
dans la suite de sessions ; les tests passent.

Les tests utilisent une base et des appels Stripe simulés. La vérification
cryptographique des événements utilise la véritable bibliothèque Stripe avec
une clé de test factice. Les transports Socket.IO et le récepteur HTTP loopback
du webhook sont réels. Le DNS du test de rebinding et la connexion HTTPS épinglée
sont simulés.

## Sondes du déploiement existant

- Socket.IO : **6/6**, santé HTTP, WebSocket/polling publics, refus de suivi
  anonyme et de jeton invalide. Rapport `audit-socket-1791040293410.json`.
- Paiements : **4/4**, création/confirmation sans possession sur identifiant
  inexistant : 404 ; remboursement sans session : 401 ; webhook sans signature :
  400 `STRIPE_SIGNATURE_MISSING`. Rapport `audit-paiements-production-20261003.json`.

Aucune commande réelle, carte, charge, restitution d'argent ou destination
de webhook réelle n'a été créée ou modifiée par ces sondes. Elles ne prouvent
pas le fonctionnement d'un encaissement ou remboursement complet en production.

## Limites de l'audit

- Aucun PostgreSQL/Redis réel local ni Stripe sandbox exploitable ici : les
  migrations et scénarios de concurrence réelle restent à vérifier dans un
  environnement de test isolé. Les assertions de transactions ne constituent
  pas un test réel de rollback PostgreSQL.
- L'idempotence Stripe ne remplace pas une journalisation durable des tentatives
  pour un incident prolongé entre l'appel externe et sa sauvegarde en base.
  Une réconciliation financière demeure nécessaire pour ces incidents.
- Les annonces, e-mails et webhooks après écriture métier n'utilisent pas tous
  une outbox transactionnelle : aucune garantie de livraison exactement une
  fois n'est annoncée.
- Aucun test de charge ou attaque distribuée n'a été lancé. Les limites
  applicatives ne constituent pas à elles seules une protection DDoS.
- L'absence de signature est refusée en production ; la validité du secret
  par rapport au compte Stripe et la livraison d'un véritable événement signé
  n'ont pas été vérifiées sur ce VPS.

Références de conception : [idempotence Stripe](https://docs.stripe.com/api/idempotent_requests)
et [événements et livraison des webhooks](https://docs.stripe.com/webhooks).

## Contrôles après le déploiement annoncé

Le dépôt local est propre au commit `2b4cf3c0` et contient les derniers
compléments transactionnels. Le déploiement sur le VPS a été confirmé par
l'utilisateur ; les sondes ne donnent pas elles-mêmes le SHA du backend distant.

Sondes rejouées sur l'API : **10/10 réussies**, soit les six contrôles Socket.IO
et les quatre refus de paiement/remboursement/webhook décrits ci-dessus.
Rapports : `audit-socket-1791061394411.json` et
`audit-paiements-production-1791061414983.json`.

Reste à valider dans un environnement de test isolé : encaissement Stripe,
remboursement, livraison/rejeu d'événements réellement signés et concurrence
sur PostgreSQL réel. Les sondes de refus ne remplacent pas ces scénarios.

## Validation réelle Stripe test et PostgreSQL — terminée

À la demande de l'utilisateur, ces scénarios ont ensuite été exécutés sur le
même code (`2b4cf3c0`), avec une clé Stripe locale dont `livemode=false` a été
vérifié par l'API Stripe, PostgreSQL 18 réel et une base neuve dédiée.
Cette validation remplace la limitation précédente « PostgreSQL/Stripe non
disponibles ici » pour les scénarios ci-dessous.

**Résultat final : 33 contrôles réussis, aucun échec.** Rapport de référence :
`audit-stripe-sandbox-1791062125334.json`.

- Deux appels HTTP simultanés ont créé une seule intention Stripe et une seule
  ligne de paiement PostgreSQL.
- Deux paiements de 2 € ont été encaissés en mode test avec `pm_card_visa`.
  Aucun moyen de paiement réel ni opération live n'a été utilisé.
- Stripe CLI a relayé les véritables événements du compte de test vers l'API
  locale. Leur signature a été vérifiée par le handler réel, avec réponse 200.
- Le statut payé et la transmission ont été contrôlés en base. Le rejeu des
  octets et de la signature reçus n'a pas doublé la transmission au commerçant.
- Les remboursements ont été déclenchés par la vraie route d'administration,
  avec JWT et session de fixture. Stripe test confirme `succeeded`, 200 centimes
  restitués pour chaque paiement, et une seule restitution par intention.
- Le rejeu du succès initial après remboursement a conservé `REFUNDED`.
- Deux demandes de remboursement simultanées n'ont produit qu'une restitution
  Stripe, avec des réponses applicatives autorisées (200 ou 409).
- Un trigger temporaire a provoqué une vraie erreur PostgreSQL sur l'écriture
  du paiement. Le webhook a répondu 500 ; commande, paiement et transmission
  sont restés en attente, prouvant le rollback de la transaction réelle.
- Après retrait du trigger, le rejeu du même webhook signé a réussi et réparé
  le paiement, qui a ensuite été remboursé.

Les commandes et le compte d'administration étaient des fixtures créées
directement dans cette base dédiée. Cette exécution valide le parcours des
routes de paiement/remboursement et du handler Stripe ; elle ne constitue pas
un test du formulaire de commande ou de l'interface graphique complète.

**Nettoyage confirmé :** les deux paiements de test sont intégralement
remboursés, les processus locaux ont été arrêtés et la base temporaire a été
supprimée. Les bases existantes et le VPS n'ont pas été modifiés. Les objets
Stripe de test restent dans l'historique du compte, avec leurs remboursements.

Outillage reproductible ajouté :
`backend/scripts/security/audit-stripe-sandbox.mjs` et
`backend/scripts/security/stripe-sandbox-server.ts`.
Depuis `backend` : `node scripts/security/audit-stripe-sandbox.mjs --run`.
Le runner exige une clé test et un PostgreSQL local, crée une base neuve,
applique les migrations et nettoie ses fixtures. Il ne lance pas le reset
général des vérifications et n'affiche aucun secret.

Les premières tentatives ont corrigé uniquement la préparation de ce nouveau
runner (options locales vides, hash bcrypt requis, format du jeton de suivi).
Aucune correction supplémentaire du code de production n'a été nécessaire
pour réussir les 33 scénarios finaux.

La réception d'un événement signé sur le **VPS de production**, avec son
secret propre et son endpoint configuré dans Stripe, demeure distincte de
cette validation locale. Elle n'a pas été exécutée ici.
