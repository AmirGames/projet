# Architecture du backend

Le backend est rangé **par domaine** (commandes, livreurs, paiements…) et non par
type de fichier. Tout ce qui concerne un sujet — routes, services, jobs,
middlewares, tests — vit dans un seul dossier : `src/modules/<domaine>/`.

Pour toucher aux commandes, on ouvre `modules/orders/` et on a tout sous la main.

- [Vue d'ensemble](#vue-densemble)
- [Les modules](#les-modules)
- [Conventions de nommage](#conventions-de-nommage)
- [Règles de dépendance](#règles-de-dépendance)
- [Recettes](#recettes)
  - [Ajouter une route à un module existant](#1-ajouter-une-route-à-un-module-existant)
  - [Créer un nouveau module](#2-créer-un-nouveau-module)
  - [Ajouter un écran d'administration](#3-ajouter-un-écran-dadministration)
  - [Ajouter une tâche de fond](#4-ajouter-une-tâche-de-fond-job)
  - [Écrire un test](#5-écrire-un-test)
  - [Ajouter un champ en base](#6-ajouter-un-champ-en-base)
- [Et côté frontend ?](#et-côté-frontend-)
- [Checklist avant de pousser](#checklist-avant-de-pousser)

---

## Vue d'ensemble

```
backend/
├── prisma/                  schéma de la base et migrations
├── src/
│   ├── app.ts               crée l'application Express et MONTE tous les routeurs
│   ├── server.ts            démarre le serveur HTTP, le temps réel et les jobs
│   ├── modules/             ← le code métier, un dossier par domaine
│   ├── middleware/          briques techniques partagées (voir plus bas)
│   ├── config/              env.ts (variables d'environnement) et logger.ts
│   ├── services/db.ts       le client Prisma, partagé par tous
│   ├── utils/               fonctions pures sans état (calculs, formats, validation)
│   ├── types/               déclarations de types globales
│   ├── contenus/            textes par défaut (pages légales…)
│   ├── cli/                 commandes hors API (ex. créer le superowner)
│   └── __tests__/           tests de l'application entière (e2e)
└── ARCHITECTURE.md          ce fichier
```

**Ce qui reste hors des modules**, volontairement : `middleware/errorHandler`,
`corps`, `compression`, `throttle`, `throttle-stockage`, `config/env`,
`config/logger` et `services/db.ts`. Ce sont des briques techniques que tous
les modules utilisent (`errorHandler` et `logger` ont chacun une centaine
d'importeurs) : aucun domaine n'en est propriétaire.

## Les modules

| Module | Ce qu'il contient |
|---|---|
| `auth` | connexion, SSO, jetons, comptes, permissions de l'équipe, **middleware `authMiddleware`**, cloisonnement (« chacun chez soi »), clés d'API, journal de sécurité |
| `merchants` | commerçants (organisations), équipe (`staff`), dossier et validation, clôture, compte démo, **middlewares `compte-restreint` et `compte-demo`** |
| `stores` | boutiques, réglages, types de commerce, duplication, fiche vue par la plateforme |
| `catalog` | catégories, produits (médias, SEO, étiquettes), déclinaisons, suppléments, taxes |
| `orders` | commandes, acceptation, gestion, suivi, panier, pourboire, factures, jobs de délai de réponse |
| `payments` | paiements, moyens de paiement, remboursement, client Stripe |
| `payouts` | reversements aux commerçants et versements aux livreurs, fichier SEPA |
| `drivers` | livreurs, dispatch, tournées, preuve de livraison, notes, support livreurs |
| `delivery` | mode de livraison et frais, zones de livraison, horaires d'ouverture |
| `customers` | clients, adresses, fiche client, API côté client final (`/api/client`) |
| `reviews` | avis, modération, avis signalés |
| `marketing` | promotions, annonces de la plateforme, campagnes |
| `notifications` | notifications, notifier, e-mails (service et config), appareils push |
| `realtime` | Socket.IO (`socket.ts`) et annonces des changements de commande aux écrans |
| `files` | envoi de fichiers, fichiers privés, middleware d'upload |
| `monitoring` | surveillance, disponibilité du site, santé, sauvegardes, mode maintenance |
| `support` | tickets des commerçants et leurs messages |
| `plans` | formules et tarifs |
| `reports` | rapports et statistiques du commerçant |
| `legal` | pages légales et acceptation des conditions |
| `webhooks` | webhooks sortants et leur relance |
| `maps` | géocodage et cartes |
| `admin` | espace `/api/admin` (voir ci-dessous) |
| `superowner` | espace `/api/superowner` (voir ci-dessous) |

### Les deux espaces d'administration

Deux préfixes regroupent des écrans qui touchent à **plusieurs** domaines :

- **`/api/admin`** → `modules/admin/` : `config`, `merchants`, `tickets`,
  `notifications`, `reports`, plus `shared.ts` (garde `isSystemAdmin`).
- **`/api/superowner`** → `modules/superowner/superowner.routes.ts` monte ses
  sous-routeurs. Les écrans propres à la plateforme (`dashboard`, `billing`,
  `config`, `webhooks`, `analytics`, `plans`, `members`…) sont dans
  `modules/superowner/`. Les écrans qui relèvent d'un domaine vivent **dans ce
  domaine**, sous le nom `*.admin.routes.ts` : par exemple
  `modules/drivers/drivers.admin.routes.ts` (gestion des livreurs),
  `modules/payouts/payouts.admin.routes.ts` (versements),
  `modules/auth/team.admin.routes.ts` (équipe et rôles).

## Conventions de nommage

| Fichier | Rôle |
|---|---|
| `<sujet>.routes.ts` | un routeur Express (les endpoints HTTP) |
| `<sujet>.admin.routes.ts` | routeur de l'espace **superowner** (`/api/superowner`) qui relève de ce domaine |
| `<sujet>.service.ts` | la logique métier, sans dépendance à Express |
| `<sujet>.jobs.ts` | une tâche de fond périodique |
| `<sujet>.middleware.ts` | un middleware Express propre au domaine |
| `shared.ts` | ce que plusieurs fichiers d'un même espace se partagent |
| `__tests__/<sujet>.test.ts` | les tests, dans le dossier du module |

Les noms de fichiers et de fonctions métier sont en français quand c'est
l'usage du code existant (`suivi-commande`, `cloisonnement`, `journaliser`).
Suivre l'usage autour de soi.

## Règles de dépendance

1. **Une route fait peu, un service fait tout.** La route lit la requête,
   valide (Zod), appelle un service, répond. Les règles métier et les accès à la
   base compliqués vont dans le service.
2. **Un module peut importer un autre module** (`orders` utilise `payments`,
   `delivery`…), mais évitez les cycles : si A importe B, B ne doit pas
   importer A. En cas de doute, remontez la logique commune dans un service
   d'un troisième module ou dans `utils/`.
3. **Importer un fichier précis, pas un « index ».** Il n'y a pas de fichier
   `index.ts` par module :
   ```ts
   import { authMiddleware } from "../auth/auth.middleware";
   import { OrderService } from "../orders/order.service";
   ```
4. **Les briques techniques partagées** (`errorHandler`, `logger`, `env`,
   `db`) s'importent depuis leur emplacement fixe :
   ```ts
   import { ApiError } from "../../middleware/errorHandler";
   import { logger } from "../../config/logger";
   import { db } from "../../services/db";
   ```
5. **`utils/` n'importe aucun module.** Ce sont des fonctions sans état ; au plus
   s'appuient-elles sur les briques partagées (`db`, `logger`).

---

## Recettes

### 1. Ajouter une route à un module existant

Exemple (illustratif : adaptez les noms au code réel) : lister les zones de
livraison d'une boutique, dans `modules/delivery/`.

**a) La logique dans le service** — `delivery-zone.service.ts` :

```ts
export class DeliveryZoneService {
  static async listByStore(storeId: string) {
    return db.deliveryZone.findMany({ where: { storeId }, orderBy: { createdAt: "asc" } });
  }
}
```

**b) La route** — `delivery-zone.routes.ts` :

```ts
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { ApiError } from "../../middleware/errorHandler";
import { DeliveryZoneService } from "./delivery-zone.service";

const router = Router();

const paramsSchema = z.object({ storeId: z.string().cuid() });

// GET /api/delivery-zones/store/:storeId
router.get("/store/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId } = paramsSchema.parse(req.params);
    // Vérifier que la boutique appartient à l'appelant (voir exigerLaBoutique
    // dans ce même fichier) avant de renvoyer quoi que ce soit.
    const zones = await DeliveryZoneService.listByStore(storeId);
    res.json({ zones });
  } catch (err) {
    next(err); // toujours next(err) : errorHandler formate la réponse
  }
});

export default router;
```

Points à respecter :

- **Toujours `authMiddleware`** sur une route qui n'est pas publique, et
  **toujours vérifier que la ressource appartient à l'appelant** (une boutique
  qui n'est pas la sienne → `403`). C'est le point le plus sensible de
  l'application.
- **Erreurs** : `throw new ApiError(404, "Boutique introuvable", "STORE_NOT_FOUND")`
  (statut, message en français, code stable). Le format de réponse est
  `{ error, code }`.
- **Validation** : Zod pour les corps, les paramètres et les requêtes.
- **Ne rien remonter du service à la route par effet de bord** : le service
  renvoie des données ou lève une `ApiError`.

Rien à ajouter dans `app.ts` : le routeur est déjà monté, les nouvelles routes
en héritent.

### 2. Créer un nouveau module

Exemple : un module `loyalty` (fidélité), monté sur `/api/loyalty`.

**a) Créer le dossier et les fichiers**

```
src/modules/loyalty/
├── loyalty.service.ts
├── loyalty.routes.ts
└── __tests__/
    └── loyalty.test.ts
```

**b) Écrire le service, puis la route** (voir la recette 1). Le routeur
exporte `router` par défaut.

**c) Monter le routeur dans `src/app.ts`** :

```ts
import loyaltyRouter from "./modules/loyalty/loyalty.routes";
// …
app.use("/api/loyalty", loyaltyRouter);   // dans la section « API Routes »
```

⚠️ **L'ordre de montage compte.** Quand deux routeurs partagent un préfixe,
Express essaie le premier d'abord. `app.ts` contient déjà deux cas commentés
(`/api/products` et `/api/payment-methods`) : le routeur aux chemins **les plus
précis** doit être monté avant celui qui a des chemins génériques (`/:id`).
Ne changez pas l'ordre des lignes existantes sans raison.

**d) Le test** — voir la recette 5.

### 3. Ajouter un écran d'administration

Selon l'espace visé :

**Espace superowner** (`/api/superowner/...`)

1. Si l'écran relève d'un domaine : créez `modules/<domaine>/<sujet>.admin.routes.ts`.
   S'il est propre à la plateforme : `modules/superowner/<sujet>.routes.ts`.
2. Utilisez les gardes de `modules/superowner/shared.ts` :
   ```ts
   import { isSuperOwner, journaliser } from "../superowner/shared";

   router.post("/quelquechose", authMiddleware, isSuperOwner, async (req, res, next) => {
     try {
       // …
       await journaliser(req, "QUELQUECHOSE", cibleId, { avant, apres });
       res.json({ ok: true });
     } catch (err) { next(err); }
   });
   ```
   `isSuperOwner` contrôle la permission de l'équipe ; `journaliser` écrit dans
   le journal d'audit (**à appeler pour toute action qui modifie quelque chose**).
3. **Enregistrez le sous-routeur** dans
   `modules/superowner/superowner.routes.ts` (import + `router.use(...)`).

**Espace admin** (`/api/admin/...`) : même principe avec
`modules/admin/`, la garde `isSystemAdmin` de `modules/admin/shared.ts`, et
l'enregistrement dans `modules/admin/admin.routes.ts`.

### 4. Ajouter une tâche de fond (job)

Un job est une classe avec `start()` et `stop()`, comme
`modules/webhooks/webhook.jobs.ts` :

```ts
import { logger } from "../../config/logger";
import { Surveillance } from "../monitoring/surveillance.service";
import { MonService } from "./mon.service";

const INTERVALLE_MS = 60_000;
let minuteur: NodeJS.Timeout | null = null;
let enCours = false;

export class MonJob {
  static start() {
    if (minuteur) return;
    // Déclare la tâche à l'écran de surveillance du superowner.
    Surveillance.declarerTache("mon-job", "Mon job", INTERVALLE_MS);

    minuteur = setInterval(async () => {
      if (enCours) return;          // pas deux passes en même temps
      enCours = true;
      try {
        await Surveillance.executerTache("mon-job", () => MonService.faireLeTravail());
      } catch (err) {
        logger.error("Mon job en échec", { error: err instanceof Error ? err.message : err });
      } finally {
        enCours = false;
      }
    }, INTERVALLE_MS);
    minuteur.unref?.();             // ne retient pas le processus à l'arrêt
  }

  static stop() {
    if (minuteur) { clearInterval(minuteur); minuteur = null; }
  }
}
```

Puis dans `src/server.ts` : importer la classe, appeler `MonJob.start()` avec
les autres au démarrage, et `MonJob.stop()` dans l'arrêt propre.

### 5. Écrire un test

Les tests sont dans `modules/<domaine>/__tests__/`, avec Jest.

- **Logique pure** (calculs, règles) : testez la fonction directement, sans
  mock. Voir `modules/reviews/__tests__/avis-client.test.ts`.
- **Service ou route qui touche à la base** : on **mocke** `db` et les
  dépendances externes avec `jest.mock`. **Les chemins de mock sont relatifs au
  fichier de test** — depuis `modules/<domaine>/__tests__/`, ils remontent de
  trois niveaux :
  ```ts
  jest.mock("../../../services/db", () => ({ db }));
  jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
  jest.mock("../../realtime/socket", () => ({ emitNotification: jest.fn() }));
  ```
  ⚠️ `tsc` **ne vérifie pas** les chemins des `jest.mock` : si vous déplacez un
  fichier, cherchez ses chemins de mock à la main (`grep -rn "jest.mock" src`).
- **Test de l'application entière** : `src/__tests__/` (nécessite une vraie
  base de données).

Commandes (depuis `backend/`) :

```bash
npm test                           # toute la suite
npx jest src/modules/orders        # un seul module
npm run test:watch                 # en continu
```

Certains tests (`refonte-e2e`, `auth.service`, et les tests d'intégration)
**exigent un `.env` complet et une base PostgreSQL réelle**. Sans cela, ils
échouent — ce n'est pas une régression du code.

### 6. Ajouter un champ en base

1. Modifier `prisma/schema.prisma`.
2. Créer la migration : `npx prisma migrate dev --name mon_changement`.
3. **Régénérer le client** : `npx prisma generate` (fait aussi par
   `npm run build`).

Si `tsc` se plaint qu'un champ n'existe pas alors que le schéma le contient
(cas typique après un `git pull`), c'est que le client Prisma n'est pas à jour :
relancez `npx prisma generate`.

---

## Et côté frontend ?

Le frontend (`frontend/`) est une application **Next.js** avec le routeur
`app/` : **une page = un dossier avec un `page.tsx`**.

```
frontend/app/
├── merchant/         espace commerçant
├── superowner/       espace superowner (une page par écran : billing, analytics…)
├── driver/           espace livreur
├── store/, restaurant/, checkout/…   côté client final
└── layout.tsx        gabarit commun
```

Créer une page : ajouter `frontend/app/<chemin>/page.tsx`. Les appels au
backend passent par `frontend/lib/api.ts` (une fonction par appel, avec
l'URL de base `NEXT_PUBLIC_API_URL`) ; ajoutez-y la fonction qui appelle votre
nouvelle route.

⚠️ `frontend/AGENTS.md` prévient que cette version de Next.js a des
changements incompatibles : lisez la documentation livrée dans
`frontend/node_modules/next/dist/docs/` avant d'écrire du code de page.

Un nouvel écran complet, c'est donc : **une route backend** (recette 1 ou 3) **+
une fonction dans `lib/api.ts` + une page `page.tsx`**.

---

## Checklist avant de pousser

Depuis `backend/` :

```bash
npx prisma generate     # si le schéma a changé ou après un pull
npx tsc --noEmit        # typage : doit être sans erreur
npm run build           # tsc + bundles de production
npm test                # avec un .env complet et une base réelle
```

- [ ] La route est protégée (`authMiddleware`) et vérifie que la ressource
      appartient à l'appelant
- [ ] Les entrées sont validées (Zod) et les erreurs passent par `ApiError`
- [ ] Une action d'administration qui modifie des données appelle `journaliser`
- [ ] Le routeur est monté (`app.ts`, ou le routeur d'agrégation de l'espace
      admin/superowner) et l'ordre de montage est respecté
- [ ] Les tests couvrent la règle métier ajoutée, et les chemins des `jest.mock`
      sont corrects
- [ ] Aucun import ne crée de cycle entre modules
