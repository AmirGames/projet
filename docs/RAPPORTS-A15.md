# Rapports et revenus bornés — A15

**État au 12 octobre 2026 — branche A15, changements locaux non commités.**

## Contrats

Les rapports de ventes, revenus par date, produits et clients acceptent les
dates `startDate` et `endDate` en ISO-8601 ou `YYYY-MM-DD`. Les dates simples
sont interprétées comme des jours UTC inclusifs. Sans dates, l'API couvre les
90 derniers jours. Une période ne peut excéder 366 jours. Les listes acceptent
`limit` (50 par défaut, 1 à 100) et `offset` (0 par défaut, maximum 100000) et
renvoient `pagination: { total, limit, offset, hasMore }`. Les ventes ordonnent
par `createdAt DESC, id DESC`; produits par ventes décroissantes puis ID; clients
par dépenses décroissantes puis adresse normalisée. La pagination par offset
est stable tant que les données ne changent pas entre deux requêtes; insérer ou
modifier des lignes peut décaler les pages. Les consommations hors interface
mobile doivent demander `offset` explicitement.

`GET /api/drivers/earnings` conserve la réponse des cartes de synthèse (totaux
jour, semaine, mois, historique, nombres et pourboires) calculée sur l'ensemble
des données en PostgreSQL. `deliveries` contient 30 lignes par défaut; `limit`
accepte 1–100 et `offset` jusqu'à 100000. Ordre : livraison la plus récente,
puis ID. La semaine et les jours/mois de synthèse suivent le calendrier de
Bruxelles, avec prise en compte du changement d'heure. Le gain fixe à
l'attribution (ou le repli historique sur les frais) et les pourboires payés
après la livraison restent distincts; le pourboire à la commande est déjà dans
le gain et n'est jamais ajouté deux fois.

Les erreurs de requête sont des HTTP 400 avec les codes
`INVALID_REPORT_DATE`, `REPORT_PERIOD_OUT_OF_RANGE` ou `INVALID_PAGINATION`.
Les exports CSV sont limités à 31 jours et 5000 lignes; une exportation qui
dépasse ce plafond répond HTTP 413 `REPORT_EXPORT_TOO_LARGE`, sans fichier
partiel. Les clients web et mobile doivent afficher le message d'erreur et
demander un filtre moins large. Les réponses sont soumises aux mêmes gardes
d'authentification et de cloisonnement organisation/boutique; aucun cache de
permissions n'a été ajouté. Le middleware de cloisonnement relit les
appartenances en base à chaque requête sensible.

Les sommes des rapports commerçant utilisent `GREATEST(0, total - frais -
service)` par commande en Decimal/PostgreSQL, excluent les commandes non
transmises au commerçant, et préservent la TVA et les frais séparément. Le
revenu journalier garde le regroupement UTC de l'ancienne API. Les produits,
clients, ventes et revenus par jour sont agrégés côté PostgreSQL; l'application
ne matérialise que la page demandée. Aucune migration/index n'est ajouté dans
cette étape : les index existants sur `Order(storeId)`, `Order(createdAt)`,
`Order(status)`, `Order(paymentStatus)` et `OrderDelivery(driverId)` sont
identifiés, mais aucun plan représentatif n'a pu être obtenu pour justifier un
nouvel index.

## Mesures et limites de capacité

**Aucune mesure SQL `EXPLAIN (ANALYZE, BUFFERS)`, mémoire, latence ou débit n'a
été exécutée dans cette session.** PostgreSQL n'est pas accessible dans
l'environnement courant; les suites Jest sont également empêchées de démarrer
par `EPERM` lors du `realpath` du répertoire temporaire Windows. Aucun résultat
de charge, capacité ou CI n'est revendiqué. Taille du jeu, CPU, RAM, version
PostgreSQL, réglages, p50/p95/p99 et débit sont donc à renseigner par
l'environnement de test avant toute conclusion.

### Protocole de charge à exécuter

1. Restaurer une base de test représentative sans données personnelles : au
   moins 1 million de commandes réparties sur 1000 boutiques/100 organisations,
   100 000 clients, 500 000 lignes de commande, 100 000 courses et 50 000
   pourboires. Mélanger annulations, commandes sans `submittedAt`, commandes
   ayant changé de date, paiements échoués, et les deux formes de pourboires.
2. Noter le SHA testé, `SELECT version()`, CPU/RAM du serveur et de PostgreSQL,
   stockage, pool Prisma, nombre de connexions, cardinalités et statistiques
   `ANALYZE`. Réchauffer puis mesurer p50/p95/p99 et lignes lues avec
   `EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)` pour les requêtes de ventes,
   période, top produits, clients et revenus livreurs; comparer au SHA parent.
3. Pour chaque requête, vérifier les plans avec boutiques de cardinalité basse
   et haute, une organisation multi-boutique, période de 7/90/366 jours, ainsi
   que l'historique de livreur le plus volumineux. Comparer les montants au
   résultat de référence non paginé, notamment annulation, date replanifiée,
   Decimal, anciens `driverPayout` nuls et pourboires après livraison.
4. Générer 1/5/20 requêtes concurrentes par seconde pendant 10 minutes, puis
   2 fois la charge attendue pendant 5 minutes. Cibles provisoires à valider
   avec le SLO produit : p95 < 300 ms et p99 < 800 ms par rapport, erreurs
   < 0,1 %, mémoire du processus stable à ±10 % après échauffement. Réviser ces
   cibles avec une instance de recette équivalente à la production.
5. Vérifier l'accès croisé refusé pour deux organisations, ainsi que la
   révocation d'une appartenance entre deux appels consécutifs. Pas de cache
   d'autorisation à invalider dans cette version.

Ces dimensions sont un protocole et des objectifs proposés, pas des résultats
de performance ni une affirmation de capacité. Si les plans montrent un scan
coûteux, ajouter seulement l'index correspondant dans une migration additive,
puis répéter le protocole avant/après.

## Commandes et exploitation

À partir de `backend/` :

```powershell
npx prisma validate
npx tsc --noEmit
npx eslint src/modules/reports src/modules/drivers/driver-account.service.ts src/modules/drivers/drivers.routes.ts --max-warnings 0
npx jest src/modules/reports/__tests__/reports.service.test.ts --runInBand
npm run build
```

Exécuter les tests SQL et la charge uniquement sur une base dédiée et anonymisée.
Les types, lint, build et tests de la CI doivent être exécutés avant intégration.
Ne pas exécuter le protocole contre la base de production. Aucun paramètre de
configuration ou migration n'est requis.

## Registre de preuve

| État | Date | SHA / environnement | Preuve |
|---|---|---|---|
| Développé | 12 octobre 2026 | branche A15 issue de `0dad7379e89128ee143a226341e46b6ed2bb005c`; changements non commités | Code et présent document |
| Testé localement | 12 octobre 2026, partiel | Windows, Node 24.21.0, npm 12.0.2, Prisma/client 7.10.0 | Backend : typecheck, lint, build et 130 tests ciblés réussis (rapports, revenus, cloisonnement). Frontend : typecheck, lint de l'écran rapports, JSON et liens réussis. Lint global frontend échoue sur 6 avertissements dans les fichiers générés `coverage/`; build bloqué par le binding natif SWC absent. App commerçant mobile : types bloqués par les types Jest manquants, lint par ESLint absent. SQL/charge non exécutés |
| Intégré | Non intégré | SHA de merge absent | Aucune preuve |
| Déployé | Non déployé | Aucun environnement A15 | Aucune preuve |
| Validé en exploitation | Non validé | Aucune instance équivalente instrumentée | Aucune preuve |
