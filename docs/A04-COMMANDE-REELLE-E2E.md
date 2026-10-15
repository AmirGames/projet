# A04 — Validation d'une commande réelle ZupEat

## État au 13 octobre 2026

Première livraison technique : tests unitaires `backend/src/modules/orders/__tests__/a04-order-lifecycle.test.ts` sur les transitions d'état et les échéances de réponse. **Ne pas confondre avec un test E2E** : aucune commande réelle, transaction Stripe, connexion commerçant ou remise livreur n'est exécutée par cette suite.

## Scénarios à exécuter en environnement de test isolé

| Scénario | Attendu |
| --- | --- |
| Panier client → création | Prix calculés côté serveur ; commande persistée une seule fois |
| Paiement Stripe TEST + webhook signé | Passage à l'état transmis une seule fois ; double webhook idempotent |
| Restaurant accepte + durée de préparation | PENDING → ACCEPTED, horaire prévu et notification client |
| Restaurant refuse | REJECTED, remboursement initié si paiement encaissé, notification client |
| Aucune réponse du restaurant | Refus automatique à échéance, sans double remboursement |
| Préparation → prêt | ACCEPTED → PREPARING → READY, événements temps réel |
| Attribution livreur | Une seule course et un seul livreur malgré relances concurrentes |
| Prise en charge → remise au client | Preuve de remise, état final et calcul de reversement |
| Perte de connexion du client ou du restaurant | Reprise après reconnexion, état récupéré du serveur, pas de commande dupliquée |
| Annulation et remboursement | Vérifier l'état du paiement, l'outbox et les droits d'annulation |
| Accès entre deux organisations | Aucun accès aux commandes ou courses d'une autre organisation |

## Prérequis

- Utiliser uniquement Stripe TEST et des comptes fictifs (client, commerçant approuvé, livreur).
- Préparer une boutique test ouverte, produits disponibles, zone de livraison et livreur test.
- Isoler PostgreSQL et Redis des données de production ; ne pas déclencher de vrai reversement SEPA.
- Conserver des identifiants de commandes, événements webhook et captures des assertions dans un rapport d'exécution.
- Vérifier les statuts d'erreur et les doublons dans les tables paiements, commandes, courses et remboursements.

## Critères de sortie

A04 ne sera déclaré validé qu'après exécution du parcours complet avec preuves de paiement TEST, refus/remboursement, dispatch/livraison, reprise après coupure et absence de doublons. Les tests unitaires actuels vérifient uniquement des garde-fous de la logique métier.
