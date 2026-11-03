# Remboursements depuis les incidents de commande

## Parcours

Dans la file web `/superowner/zupeat/support-tickets/incidents-commandes`,
« Examiner le remboursement » est visible pour le superowner et les membres
ayant `billing: write` sur EAT. Le contrôle serveur applique cette même
permission et les règles MFA existantes. Le droit de répondre aux tickets ne
donne pas celui de déplacer de l'argent.

Pour une commande **terminée**, payée en ligne en EUR et un dossier ayant une
demande de remboursement non refusée, l'opérateur choisit :

- des articles et quantités, calculés d'après les montants TTC enregistrés à la
  commande et leur part de remise ; frais et pourboire sont exclus ;
- le solde complet encore encaissé, frais et pourboire compris.

Le motif et la confirmation du montant sont obligatoires. Le serveur recalcule
le montant ; `expectedAmountCents` confirme une proposition et ne permet pas
de fixer un montant libre. Une proposition périmée exige une nouvelle
confirmation. La remise est répartie au centime par la méthode des plus grands
restes entre lignes, puis entre unités. Les quantités déjà remboursées sont
décomptées, y compris depuis un autre dossier de la même commande.

Une décision est figée par dossier. Un paiement peut avoir plusieurs décisions
issues de dossiers différents, tant que leur cumul reste disponible. Un même
dossier ne permet pas de remplacer une décision par un autre montant. Un autre
dossier ne peut pas engager le solde tant qu'une opération précédente est en
cours ou nécessite un examen. Un remboursement externe ou historique incohérent
impose une vérification, plutôt qu'un calcul automatique de compensation.

Les commandes en cours passent d'abord par leur traitement habituel ; le refus
commerçant conserve son moteur de remboursement total. Une réponse au ticket
ne déclenche aucun paiement. Un dossier ayant déjà une décision de
remboursement ne peut ensuite être marqué « refusé ».

Les suivis web client et invité affichent le montant et le statut : demandé,
en cours, attente Stripe, vérification, effectué ou intervention du support.
La réponse au ticket et la réussite financière restent deux informations
distinctes. La lecture continue pendant l'examen d'un remboursement même si
le ticket a déjà reçu une réponse. Les applications natives n'ont pas de
nouveau formulaire de remboursement dans cette évolution.

## Traitement financier

Les endpoints financiers sont sous `/api/superowner/orders/issues/:id/refund` :
`GET` pour l'aperçu, `POST` pour la décision, `POST .../retry` pour une
vérification humaine conservant la décision initiale. Ils utilisent le droit
Facturation existant. Les réponses publiques ne contiennent ni identifiant
Stripe, ni clé d'idempotence, ni motif interne.

Le serveur verrouille la commande, relit les paiements et décisions, puis
enregistre `RefundOperation`, son premier événement et l'audit dans une même
transaction. Il répond `202`. Le worker de remboursement existant traite la
demande après le commit, toutes les dix secondes lorsqu'il est actif. Il n'y
a aucun appel Stripe dans cette transaction.

La clé Stripe est stable par dossier. Les workers utilisent le bail et la
version existants ; une réponse perdue se retrouve par la référence ou les
métadonnées Stripe, en parcourant toutes les pages. Un résultat ambigu après
23 heures ne permet plus de créer à l'aveugle. Un échec ne remet jamais à zéro
la date initiale ni la clé. La reprise humaine relit le résultat ; elle ne
promet pas qu'un refus bancaire puisse réussir en rejouant la même demande.

Le cumul réussi du paiement est monotone. Un succès partiel conserve le statut
`SUCCEEDED` du paiement et de la commande ; `REFUNDED` exige que le cumul
atteigne le paiement entier. Les webhooks réveillent la réconciliation, y
compris après un premier remboursement partiel réussi. Une restitution externe
inattendue bloque toute nouvelle création pour cette décision.

Les reversements commerçants conservent la règle existante d'ajustement au
prorata du remboursement cumulé, avec reprise unique sur un relevé ultérieur.
Cette évolution n'ajoute pas de décision d'imputabilité commerçant/livreur ni
de retrait de rémunération livreur. Elle n'émet pas de nouvel avoir fiscal.

## Données et déploiement

La migration `20261103160000_support_refunds` conserve les anciennes opérations
comme `FULL_ORDER`, leurs montants, leurs clés et leur historique. Elle remplace
l'unicité par paiement par un index, ajoute l'unicité par dossier et les
informations de calcul. Les anciens appels retrouvent le remboursement total
par sa clé historique `a03-remboursement-<paymentId>`.

**Arrêter les anciens workers avant la migration et déployer le backend et le
client Prisma correspondants ensemble.** Les anciennes versions supposent une
seule opération par paiement. Appliquer d'abord la migration en recette sur une
copie représentative, puis vérifier le worker, les webhooks et les droits.

L'export client inclut le résumé financier lié au dossier. L'effacement du
dossier personnel met sa relation financière à null et conserve l'opération
avec le paiement selon la rétention comptable existante. Une reprise reste
possible par l'API financière existante
`POST /api/superowner/orders/:id/refund/retry`, avec `raison` et l'`operationId`
retrouvé dans la revue financière ; l'appartenance au paiement est vérifiée.
L'inventaire des champs a été régénéré.

## Vérifications

Les tests de services couvrent remises et centimes, quantités, paiements non
éligibles, proposition périmée, doublons, payload immuable, reprise après panne,
réconciliation Stripe, pagination, bail perdu et cumul monotone. Les chaînes
Express des nouveaux endpoints sont exécutées en mémoire avec le vrai garde
Facturation, sans ouvrir de port. Les tests web couvrent la confirmation, le
solde, la reprise identique après réponse perdue, les droits et les statuts.

La migration SQL est exécutée sur PGlite avec les tables initiales minimales :
préservation d'une opération historique, plusieurs opérations par paiement,
unicité du dossier, contrainte sur le cumul initial et conservation financière
après effacement du dossier. Ce n'est pas une migration de base représentative.

Les scénarios PostgreSQL supplémentaires sont dans `refund.integration.test.ts`,
activés par `REFUND_INTEGRATION=true` sur une base dédiée dont le nom contient
`test`. Ils couvrent les demandes et workers concurrents, deux dossiers sur un
même solde, article puis solde, webhook retardé, rollback de l'audit et conflit
entre refus et remboursement. Ils restent à exécuter sur PostgreSQL en CI ou
recette. Le build Next reste à valider dans un environnement où son cache natif
SWC fonctionne. Aucun remboursement réel, appel Stripe distant, déploiement ni
migration de production n'a été effectué pendant ce développement.
