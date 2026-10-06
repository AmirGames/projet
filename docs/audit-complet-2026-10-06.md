# Audit complet du projet ZupEat / ZupOne

Date : 6 octobre 2026. Commit audité : `a4fc20d` (branche `claude/analyse-ca-hoh6i9`, PR #156 incluse).

## Méthode et limites

Le dépôt compte environ 1 250 fichiers suivis et 170 000 lignes de code :

| Zone | Fichiers | Lignes |
|---|---|---|
| backend | 343 | ~70 400 |
| frontend | 455 | ~78 500 |
| mobile (4 apps) | 119 | ~22 800 |

**Ce qui a été fait :**
- Inventaire complet par module : taille, tests, routes.
- Recensement des routes backend, avec leur protection d'authentification.
- Lecture ciblée des zones à risque : `app.ts`, middleware de cloisonnement, temps réel, paiements et webhook Stripe, commandes, boutiques, rate limiting, CORS, env, Dockerfiles, compose de production, Caddy, CI, sauvegardes.
- Recherches transverses : `any`, SQL brut, secrets, `dangerouslySetInnerHTML`, stockage des jetons.
- Rapprochement avec l'audit externe du commit `310de4c`, dont j'ai revérifié les constats F1 à F4 dans le code.

**Ce qui n'a pas été fait :**
- Je n'ai pas lu chaque fichier ligne par ligne. 170 000 lignes ne s'auditent pas ainsi : j'ai priorisé par risque.
- Aucun test n'a été exécuté, et aucune base ni production n'a été touchée.
- Les constats sont **« confirmé par lecture »** sauf mention contraire. Rien n'a été exploité.
- L'état réel du VPS n'est pas inspecté (SHA déployé, rôles SQL, sauvegardes effectives).

---

## 1. Points forts

**Architecture**
- Backend organisé par domaine (29 modules), routes minces, services métier, sans `index.ts` barrel, comme le prévoit CLAUDE.md.
- Argent en `Decimal` Prisma (62 champs) : pas de flottants pour les montants. Les 36 `Float` sont essentiellement des coordonnées GPS.
- Schéma très riche : 86 modèles, 167 index, 47 migrations. La CI applique les migrations sur une base vide et détecte la dérive du schéma.
- Zéro SQL brut `$queryRawUnsafe` / `$executeRawUnsafe`, donc pas de surface d'injection SQL directe.
- Aucun `TODO` / `FIXME` oublié dans le backend. Aucun secret en dur : seuls des placeholders dans `deploy/env.production.example`, et `.env*` non suivis.

**Sécurité**
- Cloisonnement multi-tenant à deux niveaux : middleware global (`cloisonnement`) plus contrôles locaux dans les services. Il refuse en cas d'erreur de lecture (fail-closed) et journalise.
- JWT d'accès 15 min, refresh 7 jours, secrets distincts imposés par la validation Zod de l'env (`JWT_SECRET` ≥ 32 caractères).
- Webhook Stripe : signature vérifiée sur le corps brut, monté avant le parseur JSON, avec limiteur dédié. `marquerPaye` contrôle le statut, la devise et le montant exact (en centimes) contre le total de la commande. Il refuse un paiement lié à une autre commande, ne ressuscite pas une commande remboursée, et rembourse automatiquement un paiement arrivé après un refus.
- Rate limiting maison, partagé via Redis. En production, il **échoue fermé** (503) si Redis est absent, avec une clé par route et par IP, par e-mail ou par token.
- Suivi de commande invité par jeton haché (`trackingTokenHash`), réponse 404 uniforme pour ne pas confirmer l'existence d'une commande, `Cache-Control: no-store`.
- Données sensibles : chiffrement applicatif de champs (extension Prisma, trousseau de clés versionné), documents privés servis par liens signés liés à la session, antivirus ClamAV, politique de rétention RGPD (`retention.service.ts`), export RGPD avec liste de champs interdits.
- Plan de sauvegarde chiffré (`age`) dans `deploy/zup.sh`.
- Assistant IA encadré : outils structurés, confirmation enregistrée et limitée dans le temps, relais Next signé. Caddy bloque `/api/assistant` côté public.

**Qualité et exploitation**
- ~89 fichiers de tests, avec des cas négatifs et de reprise métier. 41 scripts E2E `verif-*.mjs` côté frontend.
- Leader de tâches de fond par bail PostgreSQL, outbox persistante, reprise des arrêtés de reversement par bénéficiaire.
- Documentation abondante et franche (CLAUDE.md, ARCHITECTURE.md, audits datés dans `docs/`).
- i18n complète fr/en (6 263 lignes chacune, parité exacte). Aucun `dangerouslySetInnerHTML` dans le frontend.
- Caddy fournit le HTTPS automatique, les instances de l'API sont équilibrées avec affinité de session, ClamAV tourne en conteneur, la base n'est pas exposée.

## 2. Points faibles

1. **Écarts entre chemins qui devraient appliquer la même règle** (HTTP contre socket, statut générique contre parcours livraison, rôle manager contre staff). C'est le risque structurel principal, déjà identifié par l'audit externe.
2. **Couverture de tests très inégale.** Modules **sans aucun test** : `admin` (7 fichiers), `catalog` (17), `superowner` (13), `marketing` (5), `legal`, `plans`, `reports`, `support`, `maps`. Modules à faible couverture : `merchants` (2 tests pour 15 fichiers), `privacy` (2 pour 12), `payouts` (1 pour 5).
3. **Mobile quasi sans tests** : 1 test sur 116 fichiers (livreur). Aucun pour customer, merchant et admin. Aucune CI mobile.
4. **Fichiers géants** : `drivers.routes.ts` (1 934 lignes, 40 routes), `surveillance-courses.service.ts` (1 673), `dispatch.service.ts` (1 493), `auth.routes.ts` (1 215), `client.routes.ts` (1 022). Côté frontend : `store/[slug]/page.tsx` (1 441), `TunnelCommande.tsx` (1 354). Ils concentrent les invariants et rendent la revue difficile.
5. **Typage lâche** : 313 `any` / `as any` dans le backend (vu notamment dans `updateOrderStatus`). L'audit externe compte 793 avertissements ESLint non bloquants.
6. **Idempotence du webhook portée par l'état**, pas par l'identifiant d'événement. Il n'existe pas de table d'événements Stripe traités, contrairement à ce que demande CLAUDE.md (« journalisés »). `charge.dispute.*` n'est pas géré.
7. **Jetons du site dans `localStorage`** (`accessToken`) : lisibles par tout XSS (à pondérer, vu l'absence de `dangerouslySetInnerHTML`).
8. **Conteneurs en root** : aucun `USER` dans `backend/Dockerfile` ni `frontend/Dockerfile`.
9. **Migrations lancées au démarrage de l'API** (`prisma migrate deploy` dans le `CMD`) avec le même rôle SQL que l'exécution, et plusieurs instances possibles (`--scale backend=N`) qui lancent donc des migrations concurrentes.
10. **Redis sans persistance** (`--save "" --appendonly no`) : acceptable pour du temps réel, à surveiller si des limiteurs ou des verrous y reposent.
11. **Fichiers hors sujet suivis dans git** : `output/` (9 Mo de PNG Instagram), `MERCHANT_APP_DESIGN.html`.
12. **Dépendances** : 26 alertes `npm audit` côté backend et 43 côté frontend à l'installation (surtout des chaînes d'outils, à trier par exposition réelle).

## 3. Failles

Classement : **P0** = à corriger immédiatement, **P1** = prioritaire, **P2** = important. Toutes les entrées sont confirmées par lecture du code, sans exploitation réelle.

### P0 — `GET /api/stores/:id` public : fuite de commandes clients
- `backend/src/modules/stores/store.routes.ts:169` : la route n'a **aucune authentification**.
- `StoreService.getById` (`store.service.ts:99`) fait `include: { orders: { take: 10, orderBy: createdAt desc }, … }` **sans `select`**.
- Résultat : n'importe quel visiteur, avec un simple `storeId`, reçoit les 10 dernières commandes de la boutique, **complètes** : `customerName`, `customerEmail`, `customerPhone`, `deliveryAddress`, coordonnées GPS, `notes`, `promoCode`, `trackingTokenHash`. Le middleware de cloisonnement laisse passer toute requête sans en-tête `Authorization`.
- Le commentaire de la vitrine par slug (`getBySlug`) montre que le même type de fuite avait déjà été corrigé ailleurs : celle-ci a été oubliée.
- Le `storeId` n'est pas secret (cuid visible côté vitrine et applications).
- C'est une fuite de données personnelles tierces (RGPD).
- **Correction :** supprimer `orders` de `getById` et utiliser un `select` explicite public. Réserver la version complète aux routes authentifiées de gestion. Ajouter un test « visiteur anonyme ne reçoit aucune donnée de commande ».

### P0/P1 — `GET /api/stores/org/:orgId` public
- Même fichier, ligne 196 : pas d'authentification. `getByOrgId` renvoie toutes les boutiques d'une organisation avec `products: { deletedAt: null }`. Cela inclut les produits **brouillons ou inactifs**, tous les champs de la boutique, ses catégories et son thème. Un `orgId` suffit.
- **Correction :** exiger `authMiddleware` et l'appartenance à l'organisation, ou renvoyer un `select` public minimal.
- Vérifier aussi que `getById` filtre `deletedAt` (ce n'est pas le cas) : une boutique supprimée reste lisible.

### P1 — Temps réel : les boutiques ne sont pas cloisonnées (audit F1, confirmé)
- `accesCommande` (`realtime/socket-access.ts`) accepte tout membre de l'organisation sans regarder le rôle ni `storeIds`.
- `emitMerchantEvent` et `emitOrgEvent` (`realtime/socket.ts`) notifient tous les membres de l'organisation.
- Un employé limité à la boutique A reçoit les événements de la boutique B de la même organisation.
- **Correction :** une seule fonction « périmètre de boutiques » partagée entre HTTP et socket. ADMIN voit toute l'organisation. MANAGER et STAFF voient leurs `storeIds`.

### P1 — Secret client Stripe dans les réponses de gestion (F2, confirmé)
- `order-management.service.ts` charge `payments: true` (lignes 116 et 163). L'extension de chiffrement le déchiffre en lecture, donc `stripeClientSecret` part dans le JSON au commerçant.
- Ce n'est pas la clé globale Stripe, mais une capacité de paiement inutile pour le commerçant.
- **Correction :** `select` explicite des champs du paiement, sans secret.

### P1 — Transitions de statut incomplètes (F3, confirmé)
- `verifierTransition` ne bloque que `PENDING`, `REJECTED` et `COMPLETED` comme point de départ. `READY→PREPARING` et `ACCEPTED→COMPLETED` passent.
- Aucune vérification de l'état de la course ni de la preuve de livraison avant de terminer une livraison plateforme.
- **Correction :** matrice de transitions selon le mode de livraison et l'acteur. La clôture d'une livraison plateforme passe uniquement par la validation de livraison.

### P1 — STAFF peut modifier les réglages légaux et commerciaux (F4, confirmé)
- `PUT /api/store-settings/:storeId` n'a que `authMiddleware`. Le middleware global ne réserve aux managers que `/api/staff` et les mutations de `products` et `categories`.
- Un STAFF affecté à la boutique peut changer `legalName`, `vatNumber`, `currency` et le mode de livraison.

### P2 — Pourboire : routes publiques sans limiteur
- `GET/POST /api/orders/:id/pourboire` : seul l'identifiant de commande (cuid) protège l'accès, alors que le suivi de la même commande exige un jeton `?t=`.
- Le POST crée un PaymentIntent Stripe sans limiteur dédié ni jeton. Le montant est borné à 1 000 €.
- Le GET révèle le prénom du livreur et l'état de la livraison.
- **Correction :** exiger le jeton de suivi (ou la session du propriétaire) et poser un limiteur.

### P2 — Routes publiques sans limiteur dédié
- `/api/maps/*` : `nearby-stores` charge toutes les boutiques actives, avec un rayon (`radius`) non borné.
- `/api/addresses/search` et `/reverse` : relais vers un fournisseur externe, sans `try/catch` explicite (Express 5 les remonte au gestionnaire d'erreurs, à confirmer).
- Seul le limiteur global de 120 requêtes par minute et par IP s'applique.
- **Correction :** limiteur dédié, avec rayon borné et pagination.

### P2 — Autres
- **Énumération d'e-mails** à l'inscription (409 `EMAIL_EXISTS`) : voir F10 de l'audit externe.
- **Pas d'événement `charge.dispute.*`** : un litige carte n'a aucun effet visible dans la base ni sur les reversements.
- **Pas de CSP ni de HSTS** trouvés dans `frontend/proxy.ts` ou `next.config.js`. Caddy n'en ajoute pas non plus dans le fichier fourni (helmet ne protège que l'API). À vérifier en production.
- **Rôle SQL unique** pour l'API et les migrations (voir point faible n° 9). Les garanties d'un journal en ajout seul dépendent des privilèges SQL, pas seulement des triggers.
- **Conteneurs en root** (voir point faible n° 8).
- **Client créé à la main invisible** jusqu'à sa première commande (F5, non reproduit).

## 4. Améliorations

**Immédiat (jours)**
1. Corriger les deux routes publiques de boutiques (P0 ci-dessus), avec test de non-régression.
2. Retirer `stripeClientSecret` des réponses commerçant (DTO ou `select`).
3. Unifier le périmètre de boutiques entre HTTP et socket, y compris `emitOrgEvent`.
4. Limiteur et jeton sur `pourboire` ; limiteur et bornes sur `maps` et `addresses`.

**Court terme (semaines)**
5. Matrice de transitions de commande, avec tests par acteur, mode de livraison et deux boutiques d'une même organisation.
6. Matrice de droits STAFF contre MANAGER pour les réglages.
7. Table `StripeEvent` (identifiant d'événement, type, date de traitement, résultat) : déduplication explicite et journalisation. Gérer `charge.dispute.created/closed`.
8. CI : activer les intégrations RGPD et assistant sur bases dédiées, ajouter un job `typecheck` pour les 4 apps mobiles, corriger l'erreur TS2591 de l'app admin, rendre `SafetyCheck` autonome.
9. Dockerfiles : utilisateur non-root, `HEALTHCHECK`.
10. Séparer le rôle SQL des migrations de celui d'exécution, et lancer les migrations dans une étape de déploiement unique, pas dans le `CMD` de chaque instance.
11. En-têtes de sécurité du site : CSP, HSTS, `frame-ancestors`, `Referrer-Policy`.
12. Exposer la révision de build (SHA) dans `/health` ou dans une attestation de déploiement.

**Moyen terme**
13. Tests pour les modules à zéro : `catalog`, `admin`, `superowner`, `marketing`, `plans`, `reports`, `support`, `maps`.
14. Découper `drivers.routes.ts` (40 routes), `dispatch`, `surveillance-courses` et `TunnelCommande` par responsabilité.
15. Geler le nombre d'avertissements ESLint, puis le réduire. Éliminer les `any` sur les contrats sensibles (commande, paiement, droits).
16. Jetons web : passer à un cookie `HttpOnly` + `SameSite`, ou le justifier explicitement par le modèle de menace.
17. Retirer `output/` et `MERCHANT_APP_DESIGN.html` du dépôt (ou les déplacer vers un stockage de médias).
18. Exercice de restauration de sauvegarde documenté et planifié ; tests de bout en bout sur au moins le parcours livreur sur appareil réel.
19. Trier `npm audit` par exposition (outil de build ou production) et mettre à jour sans `--force`.

## 5. Idées

**Produit**
- **Suivi client enrichi** : ETA recalculée en direct, notifications push (déjà présentes côté mobile) avec un lien de suivi unique par commande.
- **Programme de fidélité et promotions ciblées** : le module `marketing` et les codes promo existent déjà, il manque des segments (clients inactifs, premier achat).
- **Commande planifiée et abonnements** : repas récurrents pour les commerçants à forte rotation.
- **Pourboire au moment de la commande** et partage équitable entre livreur et boutique, avec relevé clair.
- **Tableau de bord commerçant** : marge par produit, heures de pointe, taux de refus, délai moyen de préparation (les données de `reports` existent).
- **Marketplace ZupDrive ↔ ZupEat** : un seul compte client pour les deux marques, avec le cloisonnement actuel conservé.
- **Assistant ZupOne en lecture seule pour les clients** (« où est ma commande ? ») : le périmètre des outils est déjà encadré.

**Technique**
- **Politique centralisée d'autorisation** (une matrice rôle × action × ressource) utilisée par HTTP, socket, assistant et jobs. C'est l'investissement qui évite le plus de futurs écarts du type F1 à F4.
- **Contrats d'API partagés** : générer un schéma OpenAPI depuis les schémas Zod et produire les types du web et des 4 apps mobiles. Cela détecte les changements cassants avant le mobile.
- **Tests de contrat « visiteur anonyme »** : un test automatique qui appelle chaque route publique sans jeton et échoue si la réponse contient un champ d'une liste noire (`customerEmail`, `stripeClientSecret`, `trackingTokenHash`, etc.).
- **Test de balayage des routes** : un test qui parcourt la table des routes Express et exige que toute route sans `authMiddleware` soit déclarée dans une liste blanche explicite (aurait détecté le P0).
- **Observabilité** : traçage par identifiant de requête de bout en bout (HTTP → job → webhook), tableaux de bord sur les files d'outbox et les échecs de webhook.
- **Environnement de préproduction** déployé par la même chaîne que la production, avec les parcours `verif-*.mjs` exécutés après chaque déploiement.

---

## Ordre de travail recommandé

1. Les deux routes publiques de boutiques (P0, quelques lignes, risque RGPD réel).
2. `stripeClientSecret` (F2).
3. Périmètre de boutiques du temps réel (F1).
4. Transitions de commande (F3) et droits STAFF (F4), une fois les règles métier tranchées.
5. CI mobile, intégrations RGPD/assistant et test de balayage des routes publiques.
6. Le reste, par ordre de risque.
