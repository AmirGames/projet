# A03 — Contrôles d'accès aux commandes (13 octobre 2026)

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
