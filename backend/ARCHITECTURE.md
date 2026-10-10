# Architecture du backend

La MFA A05 reste dans `modules/auth` : service transactionnel `mfa.service`,
routes `mfa.routes` et secours OS `mfa-operator.service`/CLI. Les gardes communes
`authMiddleware`, `exigerPermission` et `compteSocket` relisent la preuve
PostgreSQL ; elles gardent leurs contrôles de rôle et de cloisonnement.
Le modèle `MfaFactor` conserve des enveloppes chiffrées explicites liées au
compte, distinctes des champs personnels déchiffrés automatiquement. Les
mutations MFA et événements de sécurité sont committés ensemble, sans secret.
Les échecs de vérification sont retournés après commit du compteur anti-abus.
Voir [contrats, migration, récupération et exploitation](../docs/MFA.md).

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
| `payments` | paiements, moyens de paiement, registre durable `RefundOperation`, worker de remboursement et réconciliation Stripe, client Stripe |
| `payouts` | reversements aux commerçants et versements aux livreurs, lots et fichier SEPA figés ; mutations conditionnelles état/lot/montant et diagnostic en lecture seule ([A04](../docs/VERSEMENTS-CONCURRENCE.md)) |
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
| `zupdrive` | chauffeurs, sociétés, courses, paiement et versements ZupDrive, administration, support, conformité, supervision. **Les routeurs se montent dans `zupdrive-montage.ts`** (ordre et préfixes), pas dans `app.ts` ; un test vérifie l'absence de route doublée ou masquée et l'authentification de chaque route. Garde d'équipe : `adminAuthSection("chauffeurs" \| "courses-drive")` de `zupdrive-garde.ts`. Référence : [docs/zupdrive-api-admin.md](../docs/zupdrive-api-admin.md) |
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
4. **Déclarez les droits** dans `modules/auth/permissions-plateforme.service.ts` :
   - ajoutez la **section** dans `SECTIONS` (identifiant, libellé, groupe) ;
   - associez le chemin de la route à cette section dans `ROUTES.superowner`
     (`[/^\/campagnes/, "campagnes"]`) ;
   - cochez la section dans les permissions par défaut des rôles qui doivent
     l'ouvrir.

   ⚠️ **Une route absente de `ROUTES` reste réservée au superowner lui-même**
   (c'est voulu pour la gestion de l'équipe) : l'équipe recevra un `403`.
5. **Temps réel** : les écritures de la route sont annoncées automatiquement aux
   écrans (`modules/realtime/diffusion.middleware.ts`), sous la famille « premier
   segment après `/api/` », soit `superowner` pour toute cette section. Ajoutez
   une entrée dans le tableau `ROUTES` de ce fichier pour lui donner un vrai nom
   (`{ prefixe: "/api/superowner/campagnes", ressource: "campagnes" }`), sans
   quoi un écran ne peut pas savoir quelle donnée a changé.
6. **Le frontend** : la page, le lien de menu et les traductions sont décrits
   dans `frontend/ARCHITECTURE.md` (recette A).

**Espace admin** (`/api/admin/...`) : même principe avec
`modules/admin/`, la garde `isSystemAdmin` de `modules/admin/shared.ts`, et
l'enregistrement dans `modules/admin/admin.routes.ts`. Les droits se déclarent
dans `ROUTES.admin` du fichier de permissions.

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

Puis dans `src/server.ts` : importer la classe, appeler `MonJob.start()` dans
`lancerLesTaches` et `MonJob.stop()` dans `arreterLesTaches`.

**Une seule instance lance les tâches.** `modules/jobs/leader.service.ts` tient un
bail en base (`JobLease`) : seule l'instance titulaire exécute `lancerLesTaches`,
et une autre reprend si elle s'arrête ou n'arrive plus à renouveler (30 s). Une
instance unique obtient le bail tout de suite, rien ne change. Le bail réduit les
doublons sans les rendre impossibles (l'ancien leader peut finir un passage en
cours) : **un job reste idempotent**. Redis n'entre pas dans ce verrou, il n'est
pas persistant en production.

**Un effet qui ne doit pas se perdre passe par l'outbox.** Un e-mail envoyé « en
arrière-plan » disparaît si le processus s'arrête ou si le serveur de courriel est
indisponible à cet instant. `Outbox.enregistrer(type, payload, { dedupeKey })`
(`modules/jobs/outbox.service.ts`) écrit l'intention en base (dans la transaction
métier si on lui passe `tx`) ; le worker `OutboxJobs` l'envoie et la rejoue avec un
délai croissant (30 s, 1 min, 2 min… plafonné à 1 h, 8 tentatives) avant de la
marquer `FAILED`, visible dans la table et le journal. La clé `dedupeKey` évite le
doublon d'un même effet. Livraison « au moins une fois » : à réserver aux effets où
un doublon vaut mieux qu'une perte (un e-mail), jamais à une opération financière.
Pour un nouveau type : le déclarer dans `notifications/outbox-handlers.ts`.
**Jamais de secret dans le `payload`** (jeton de réinitialisation, lien de
connexion, mot de passe) : il resterait en clair en base jusqu'à la purge.
L'e-mail de confirmation n'y stocke que `userId` : le worker génère le lien,
enregistre son empreinte sur le compte puis envoie le message. Une panne SMTP
remonte au worker ; sa reprise crée un nouveau lien valable 24 h. Les comptes
déjà confirmés ou désactivés sont ignorés. Le compte, sa preuve d'acceptation et
l'intention d'envoi sont créés dans la même transaction. L'e-mail de suivi de
commande crée également son lien au moment de l'envoi, sans le stocker.
Le retard et les abandons de l'outbox alimentent le contrôle « Notifications » de
la santé de la plateforme.
Aujourd'hui, l'e-mail de suivi de commande (`prevenirLeClient`) l'utilise ; la
notification dans l'application est déjà écrite en base, le push reste au mieux.

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

Le frontend (`frontend/`) est une application **Next.js 16** : une page est un
dossier avec un `page.tsx`, rangé par **espace** (`merchant`, `superowner`,
`driver`, client…). Un même code sert plusieurs domaines, et une page doit vivre
sous le bon segment d'URL.

➡️ **Le guide détaillé est dans `frontend/ARCHITECTURE.md`** : espaces et
domaines, anatomie d'une page, une recette par type de page (superowner,
commerçant, livreur, publique), traductions, appels à l'API, temps réel,
vérifications.

Un nouvel écran complet, c'est donc : **une route backend** (recette 1 ou 3) **+
une page `page.tsx`** (avec son lien de menu et ses traductions).

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

## Remboursements financiers durables (A03)

Le webhook payé, le refus et l'annulation métier inscrivent `RefundOperation`
dans leur transaction. `RefundJobs` suit le leader existant et `Surveillance` ;
il prend un bail SQL avec version, puis appelle Stripe hors transaction avec
une clé stable. Une création n'est pas un succès financier : pending attend la
réconciliation. `RefundOperationEvent` conserve l'historique ; les notifications
restent dans l'outbox. Migration additive et cas historiques abandonnés avec alerte.

API, permissions billing, reprises, fenêtre d'idempotence, conservation comptable
et tests : [guide A03](../docs/REMBOURSEMENTS-REPRISE.md).
