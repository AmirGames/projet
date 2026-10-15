# A03 — Contrôles d'accès aux commandes (13 octobre 2026)

## Relecture documentaire — 13 octobre 2026

Ce document décrit des correctifs et tests **ajoutés au code**, mais il ne suffit pas à établir que toutes les routes de commande sont sécurisées. Vérifier sur le SHA de fusion : (1) les chemins GET sans filtre de boutique, (2) les changements d'état autorisés selon rôle et état courant, (3) les appels depuis manager.zupeat.com et l'application livreur, (4) les commandes invitées, (5) les accès d'organisation A vers B. Les mocks Prisma prouvent le comportement du montage testé, pas l'isolation réelle en PostgreSQL. Ajouter une suite d'intégration HTTP/PostgreSQL dédiée, puis une commande complète en pilote fermé. Reporter dans [l'état projet](etat-projet.md) SHA, run CI, environnement, tests échoués et risques résiduels ; ne pas annoncer une validation de production sans ces preuves.


## Correctif initial
Analyse statique de `backend/src/modules/orders/order.routes.ts` : plusieurs routes de consultation, de changement de statut, de suppression et de dispatch exigeaient une authentification, **sans vérifier que l'appelant pouvait gérer la boutique de la commande**. La lecture de `OrderService.updateStatus` et `delete` n'a pas révélé de contrôle métier d'appartenance interne.

Correctifs appliqués :
- `GET /orders?storeId=...`, `GET /orders/store/:storeId` et `GET /orders/status/:storeId` : `exigerBoutique(..., "read")`.
- `GET /orders?orgId=...` : accès limité aux administrateurs de cette organisation et superowners ; une autorisation sur une seule boutique ne donne pas accès aux commandes de toutes les boutiques.
- `PATCH /orders/:id/status`, `DELETE /orders/:id`, `POST /orders/:id/dispatch` : retrouver le `storeId` en base, puis `exigerBoutique(..., "manage")` avant toute action.

## Vérifications obligatoires avant fusion
- Tests HTTP multi-organisations A/B : refus de lire, modifier, supprimer ou dispatcher une commande étrangère ; droits légitimes ADMIN, STORE_MANAGER, STORE_STAFF, superowner.
- Vérifier que les interfaces frontend/mobile ne dépendent pas d'une lecture agrégée de toute l'organisation pour les STORE_MANAGER ; si nécessaire, implémenter un filtrage boutique côté serveur.
- Vérifier la sémantique métier de la suppression physique et des annulations, ainsi que les droits spécifiques des opérations financières.
- Compiler TypeScript et exécuter la CI sur le SHA de la PR.
- Revoir **toutes** les autres routes de `order.routes.ts`, les routes de livraison et les contrôles d'état avant de considérer A03 terminée.

**Statut : correctifs proposés dans une branche, pas encore testés ni déployés.** Aucun test exécuté dans cette session. Ne pas fusionner avant vérification.

## Régression ajoutée — 13 octobre 2026
Fichier : `backend/src/modules/orders/__tests__/a03-cloisonnement-routes.test.ts`. Tests HTTP avec mocks Prisma pour empêcher l'organisation A de lire les commandes de B, consulter ses agrégats, changer le statut, supprimer ou dispatcher une commande de B. Cas complémentaires : refus des mutations pour STORE_STAFF, lecture autorisée pour STORE_STAFF affecté à la boutique. **La CI doit confirmer l'exécution et la réussite ; il ne s'agit pas d'un test réel de paiement/livraison.**

## Suite A03 — archivage des commandes
Le service `OrderService.delete` ne fait plus de suppression physique. Il archive uniquement les commandes `COMPLETED` ou `REJECTED` en renseignant `deletedAt`, avec une mise à jour conditionnelle pour éviter une course entre lecture et écriture. Les commandes actives renvoient HTTP 409. La route DELETE répond désormais « Commande archivée ». Les données historiques restent en base.

**À vérifier avant fusion :** tests ciblés de suppression (états actifs, états terminaux, double archivage, conflit concurrent), absence de régression sur les agrégats et la consultation historique, puis CI complète. Les parcours réels Stripe, acceptation/refus, livreur et coupure réseau restent à valider ; cette étape ne constitue pas encore une certification du MVP.
