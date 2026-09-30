# CLAUDE.md

Ce fichier fournit les règles et le contexte nécessaires à Claude Code pour travailler sur le dépôt **ZupEat**, première plateforme opérationnelle du groupe **ZupOne**.

> **Règle principale :** avant toute modification importante, comprendre l'architecture existante, les règles métier et les dépendances entre domaines. Ne pas réécrire ou simplifier une partie du système sans vérifier ses impacts.

## 1. Projet

- **ZupOne** : le groupe / écosystème auquel appartiennent les plateformes. Ce n'est pas la plateforme de commande elle-même.
- **ZupEat** : plateforme de commande en ligne multi-commerçants. Le client découvre un commerce, consulte son catalogue, commande avec ou sans compte et paie en ligne ; le commerçant gère son établissement, son catalogue et ses commandes ; une livraison est affectée et suivie ; le livreur reçoit et réalise la course ; l'administration supervise la plateforme ; les paiements et reversements sont gérés.
- **Chauffeur ≠ livreur — ne jamais confondre.** Le **livreur** (ZupEat) livre des repas et des commandes : modèle Prisma `Driver`, espace `/driver`, `delivery.zupeat.com`, `/devenir-livreur`. Le **chauffeur** (ZupDrive) transporte des personnes : modèle `ChauffeurDrive`, `/chauffeur`, `driver.zupdrive.com`, `/devenir-chauffeur`. Deux métiers, deux dossiers et deux validations, sans renvoi de l'un à l'autre. Attention : en anglais, « driver » désigne ici le livreur dans le code ZupEat.
- **ZupDrive** : domaine lié à la gestion des chauffeurs disposant d'une licence LVC ou d'une licence de transport rémunéré de personnes. Procédure d'inscription des chauffeurs (BCE, licence, documents) : voir `docs/zupdrive.md`.

Domaines (actuels/prévus) — ne pas créer arbitrairement de nouveaux domaines, sous-domaines ou espaces applicatifs sans vérifier l'architecture globale :

```text
zupone.com   └── manager.zupone.com
zupeat.com   ├── manager.zupeat.com   └── delivery.zupeat.com
zupdrive.com ├── manager.zupdrive.com └── driver.zupdrive.com
```

Écosystème (ça évoluera au fur et à mesure) : ZupOne regroupe ZupEat (apps Customer, Merchant, Delivery → ZupEat API → PostgreSQL via Prisma, Redis), ZupDrive (Driver) et d'autres services. Les applications clientes et mobiles restent clientes de l'API et ne contournent jamais les règles métier ou de sécurité du backend.

## 2. Langue et conventions

Documentation, commentaires et noms métier majoritairement en **français** : conserver cette convention. Les noms techniques imposés par les frameworks ou déjà en place peuvent rester en anglais (`merchant`, `store`, `order`, `payment`, `driver`, `delivery`, `webhook`).

## 3. Architecture générale

- `backend/` — Node.js, Express, TypeScript, Prisma, PostgreSQL, Redis, Jest, Zod, esbuild. API sur `http://localhost:3001`.
- `frontend/` — Next.js 16 (App Router), React 19, Tailwind CSS 3, next-intl. Sur `http://localhost:3000`.
- `mobile/apps/{customer,delivery,merchant}` — applications Expo ; chacune a ses propres règles (AGENTS.md/CLAUDE.md) à consulter avant modification importante.
- `deploy/` — infrastructure de déploiement (Scaleway).

**À lire avant modification importante :** `backend/ARCHITECTURE.md`, `frontend/ARCHITECTURE.md`, `CONNAISSANCES-PROJET.md`, et les documents de la racine sur les paiements, webhooks, comptabilité, déploiement, livraison, sécurité et base de données. Ne jamais considérer un fichier isolé comme représentant toute l'architecture.

## 4. Commandes

Services locaux (PostgreSQL :5432, Redis :6379, Mailpit :8025) : `./start.sh` / `./stop.sh`.

```bash
# backend/
npm run dev                  # API :3001
npx tsc --noEmit
npm run lint
npm run build
npm test                     # exige un .env complet et une base réelle
npx jest chemin/du/fichier.test.ts -t "nom du test"
npx prisma migrate dev       # après modification de prisma/schema.prisma
npm run create-superowner

# frontend/
npm run dev                  # :3000
npx tsc --noEmit && npm run lint && npm run build
VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 node scripts/verif-<nom>.mjs

# chaque app mobile
npm start && npm run lint
```

Les `scripts/verif-*.mjs` vérifient le comportement réel (E2E) contre le frontend et l'API. Une fonctionnalité importante doit idéalement en avoir un, qui teste les comportements utilisateur réels et pas seulement un HTTP 200.

## 5. Architecture backend

Organisé **par domaine métier**, pas par type de fichier : `src/modules/<domaine>/` regroupe routes, services, jobs, middlewares et tests (auth, merchants, stores, catalog, orders, payments, payouts, delivery, drivers, realtime, superowner… d'autres existent).

- **Route mince** : HTTP → validation Zod → auth/autorisation → service métier → Prisma/infrastructure → réponse. La logique métier va dans les services, centralisée pour éviter des comportements différents selon les routes.
- **Imports explicites** : pas de `index.ts` barrel (cycles, imports inutiles, problèmes Jest, navigation). En déplaçant un fichier, vérifier les `jest.mock(...)` et tous les imports relatifs.
- **`utils/` reste indépendant** : n'importe jamais un module métier. Sens des dépendances : route → métier → infrastructure, sans cycle.
- **Erreurs** : utiliser `ApiError` pour les erreurs métier/API. Ne pas exposer les erreurs internes au client (pas de `res.status(500).json(error)` avec des détails internes).

## 6. Sécurité et cloisonnement

- **Multi-tenant — « Chacun chez soi. »** Un utilisateur ne doit jamais accéder ou modifier les données d'un autre commerçant en changeant un `id`, `storeId`, `merchantId`, `orderId` ou `userId`. `GET /orders/123` ne signifie jamais qu'on peut consulter la commande 123 : le backend vérifie que la ressource appartient au contexte autorisé, même si le frontend masque déjà les données.
- Ne jamais faire confiance au frontend, aux paramètres ou IDs envoyés par le client, aux rôles déclarés côté frontend, ni aux applications mobiles. Le frontend n'est jamais une frontière de sécurité.
- **Authentification ≠ autorisation.** Rôles contrôlés côté backend (customer, merchant, store manager, delivery, driver, superowner). Pour chaque endpoint sensible, vérifier : identité, rôle, appartenance à la ressource, état métier, permissions.
- **Validation** : toute donnée externe est non fiable (body, query, params, headers, cookies, fichiers, webhooks, mobile, frontend). Valider avec Zod ; le typage TypeScript ne sécurise pas les données à l'exécution.
- **Administration** : toute action d'administration qui modifie des données appelle `journaliser(...)` (qui, quoi, sur quelle ressource, quand, anciennes/nouvelles valeurs si nécessaire). Ne jamais la contourner.
- **Secrets** : ne jamais exposer secrets, clés privées, credentials Stripe/PostgreSQL, tokens internes. Une variable serveur ne devient pas `NEXT_PUBLIC_...` sans justification. Ne jamais committer `.env*`.
- **Logs** : jamais de mot de passe, token, secret, clé API privée, données bancaires sensibles.
- **Rate limiting** : protéger login, register, password reset, OTP, paiement, webhooks, admin, création de commandes — sans ajouter de limite arbitraire sans vérifier l'impact sur le mobile.
- **CORS** : vérifier CORS / `allowedDevOrigins` avant modification ; jamais `*` en production, origines explicites.
- **Variables d'environnement** : une nouvelle variable est ajoutée à la validation de configuration, documentée, ajoutée à `.env.example` (sans vraie valeur) si approprié, puis vérifiée en dev, build et déploiement.

## 7. Règles métier critiques

- **Commandes** : client → panier → commande → paiement → confirmation → commerçant → préparation → livraison → livreur → terminée. Les transitions d'état sont contrôlées : une commande annulée ne redevient pas payée sans règle explicite, même si un endpoint est appelé directement.
- **États** : avant d'ajouter un état, rechercher les états, transitions et conditions existants, et vérifier frontend, mobile, jobs, notifications, statistiques, paiements/reversements. Pas plusieurs noms pour le même état.
- **Paiements Stripe** : le frontend n'est jamais la source de vérité. La confirmation passe par le serveur, notamment les **webhooks Stripe** (client → création commande → Stripe → webhook → backend → validation → commande confirmée). Jamais « frontend dit payé → commande payée ».
- **Webhooks** : vérifiés, idempotents, résistants aux doublons, aux appels hors ordre et aux retries, journalisés. Un même événement peut arriver plusieurs fois sans produire plusieurs effets métier.
- **Idempotence** : pour webhooks, paiements, création de commande, payouts, jobs, notifications, affectation de livraison, se demander : *que se passe-t-il si cette requête est reçue deux fois ?*
- **Montants** : pas de calcul flottant naïf ; entiers dans la plus petite unité (10,99 € → 1099 cents). Documenter currency, amount, fees, taxes, commission, merchant/delivery/platform amount. Règles d'arrondi explicites et cohérentes, jamais arbitraires.
- **Reversements** : séparés de la logique de commande (Order → Payment → Financial transaction → Payout). Les virements SEPA hebdomadaires ne sont pas une simple modification de solde. Traçabilité conservée : jamais supprimer un mouvement financier pour corriger une erreur, créer une opération corrective.
- **Notifications** (email, push, temps réel) : ne remplacent pas l'état en base. « Commande confirmée » est vrai en base avant l'envoi ; un échec de notification n'annule pas une opération validée.

## 8. Données et infrastructure

- **Prisma** (Client 7.10.0) : avant de modifier `prisma/schema.prisma`, identifier migrations, données existantes, contraintes, relations, index et impacts backend/frontend/mobile. Puis `npx prisma migrate dev`. Ne jamais modifier une base de production à la main ni une migration déjà appliquée sans procédure documentée.
- **Transactions** : utiliser une transaction Prisma quand plusieurs écritures doivent rester cohérentes (commande + paiement + stock + journal). Éviter les appels externes (Stripe, API, email, push) dans une transaction longue : transaction → commit → job/événement → service externe.
- **Redis** : cache, données temporaires, rate limiting, jobs, temps réel, verrous. Jamais source de vérité pour les données métier critiques (PostgreSQL).
- **Jobs** : supporter retries, doublons, interruptions, redémarrages ; ne jamais déclencher deux fois une opération financière ou critique.
- **Temps réel** : découplé du métier (persistance DB → événement → realtime → frontend/mobile). Pas source de vérité : un client doit pouvoir récupérer l'état réel via l'API si un événement est perdu.
- **Mobile** : les apps passent toujours par l'API centrale, jamais directement par PostgreSQL ; les règles de sécurité du backend s'appliquent.

## 9. Frontend

- Cette version de Next.js a des changements incompatibles (ex. `middleware.ts` s'appelle `proxy.ts`). Consulter `frontend/node_modules/next/dist/docs/` avant de toucher au routage ; ne pas appliquer des solutions d'anciennes versions.
- Espaces séparés : client/vitrine, merchant, delivery, superowner — chacun avec son authentification, ses permissions, ses données, son routage, ses traductions et son UI. Ne pas mélanger leur logique sans raison.
- Traductions dans `frontend/messages/` via `next-intl` : pas de texte utilisateur codé en dur (`<button>Commander</button>`).

## 10. API et déploiement

- **API** : pour un endpoint ajouté ou modifié, documenter ou vérifier méthode, route, authentification, rôle, permissions, params, query, body, réponse, erreurs, effets secondaires. Signaler explicitement tout changement cassant, et rechercher d'abord les consommateurs : frontend, `mobile/customer`, `mobile/merchant`, `mobile/delivery`, scripts.
- **Déploiement** (`deploy/`) : vérifier variables d'environnement, migrations, build, ports, reverse proxy, HTTPS, services, health checks, logs, rollback. Ce qui marche en local (Windows/Docker) n'est pas automatiquement compatible avec la production.

## 11. Méthode de travail

**Avant de modifier** : identifier le domaine, lire son architecture, chercher les appels et tests existants, vérifier relations Prisma, permissions, impacts frontend/mobile, migrations, événements/webhooks/jobs. Modifier le minimum nécessaire ; pas de refactor massif quand une correction locale suffit.

**Avant de supprimer** une route, un service, un modèle ou champ Prisma, un endpoint, composant, hook, job, migration ou variable d'environnement : chercher toutes ses références — elle peut servir au mobile, à des scripts, cron, webhooks, au frontend, au déploiement ou à une intégration externe.

**Nouvelle fonctionnalité** : besoin → domaine → architecture → modèle Prisma → permissions → service métier → route → tests → frontend/mobile → vérification E2E si importante → typecheck → lint → tests → build → impacts.

**Bug** : ne pas corriger que le symptôme. Reproduire → identifier la cause et l'impact → corriger → test de non-régression → vérifier les scénarios voisins.

**Avant de déclarer terminé** (compiler ne suffit pas), vérifier selon le cas : TypeScript, lint, tests, build, API, permissions, multi-tenant, base de données, frontend, mobile, webhooks, jobs, paiements, logs, sécurité, E2E. Pour une fonctionnalité financière : montant, devise, arrondi, idempotence, webhook, historique, payout, rollback/correction.

## 12. Règles absolues

Ne jamais :
- contourner l'autorisation backend ou faire confiance au frontend pour une règle de sécurité ;
- considérer Stripe côté frontend comme source de vérité ;
- exposer un secret ;
- supprimer une donnée financière pour corriger l'historique ;
- permettre l'accès aux données d'un autre commerçant ;
- modifier une migration déjà appliquée sans procédure adaptée ;
- supprimer du code sans rechercher ses références ;
- ajouter une dépendance sans vérifier son utilité, ou une architecture parallèle quand l'existante répond au besoin ;
- faire un gros refactor sans nécessité ;
- déclarer une fonctionnalité terminée sans validation appropriée.

## 13. Philosophie

ZupEat doit rester simple, modulaire, sécurisé, testable, maintenable et évolutif. Priorités : exactitude > sécurité > cohérence métier > maintenabilité > performance > simplicité. La performance ne s'obtient jamais au prix de l'intégrité des données ou de la sécurité.

En cas de décision ambiguë, privilégier la solution qui respecte l'architecture existante, limite les effets de bord, conserve les données, protège les permissions, est testable et reste compréhensible pour un autre développeur.
