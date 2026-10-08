# Audit des dépendances et cliquet de lint

État au 2026-10-08. À relire à chaque montée de version de Prisma, Jest ou Tailwind.

## Règles appliquées

- Jamais `npm audit fix --force` : ses « correctifs » proposés sont ici des **rétrogradations** (`prisma@6.19.3`, `jest@25`, `@jest/globals@27`, `ts-jest@29.1.2`) ou des majeures non testées (`tailwindcss@4`).
- Mises à jour par lots, **dans les plages semver existantes** (`npm update`), puis `tsc`, lint, tests et build.
- Aucune dépendance ajoutée.

## Backend

`npm audit --omit=dev` : 4 *high*. `npm audit` complet : 4 *high* + 21 *moderate*.

| Alerte | Chaîne | Type | Atteignable ? | Décision |
|---|---|---|---|---|
| `mysql2` ≤ 3.23.0 (GHSA-3f6p-5ww8-9rcr, GHSA-rgwj-5xj2-c3m3) | `prisma` → `mysql2` | Outillage (CLI Prisma) | **Non.** Le pilote MySQL n'est chargé que pour un `datasource` MySQL ; le nôtre est `postgresql` (`prisma/schema.prisma`) et l'API passe par `@prisma/adapter-pg`. | Risque accepté |
| `deepmerge-ts` < 8 (GHSA-ggr8-5vv4-36mx, épuisement de pile) | `prisma` → `@prisma/config` → `deepmerge-ts` | Outillage (CLI Prisma) | **Non.** Il fusionne la configuration Prisma du dépôt (fichiers de confiance), jamais une entrée utilisateur. | Risque accepté |
| `prisma` (agrégat des deux ci-dessus) | direct | Outillage embarqué | Le CLI figure dans `dependencies` et donc dans l'image de production (`npm ci --omit=dev`), mais il ne s'exécute que pour `migrate deploy` / `generate`, hors du processus de l'API. | Risque accepté |
| `jest`, `ts-jest`, `@jest/*`, `jest-*`, `babel-*`, `argparse`, `js-yaml`, `sprintf-js`, `@istanbuljs/*` (21 *moderate*) | chaîne de test | Outillage (devDependencies) | Non : absents de l'image de production, exécutés en CI seulement. | Risque accepté ; le « correctif » proposé est une rétrogradation de `jest`/`ts-jest` |

**Pourquoi pas de montée de Prisma.** `prisma@latest` est `8.0.0-rc.21`, une préversion. `7.10.0` est la dernière version stable (tag `prev` : 7.10.0), et c'est celle de `@prisma/client`/`@prisma/adapter-pg` (les trois doivent rester alignés). La version que `npm audit` propose (`6.19.3`) est une **rétrogradation** qui casserait le client 7.10.0. À rouvrir à la sortie de Prisma 8 stable : vérifier alors que `@prisma/config` ne dépend plus de `deepmerge-ts` < 8 ni le CLI de `mysql2` ≤ 3.23.0.

`brace-expansion` (*high*, via `eslint` → `minimatch`) : corrigé par `npm update`.

### Paquets mis à jour (dans leurs plages)

| Paquet | Avant | Après |
|---|---|---|
| zod | 4.6.2 | 4.6.5 |
| nodemailer | 10.0.9 | 10.0.16 |
| redis | 6.2.1 | 6.3.0 |
| socket.io / socket.io-client | 4.8.3 | 4.8.4 |
| eslint | 10.10.0 | 10.12.0 |
| @typescript-eslint/eslint-plugin, parser | 8.70.0 | 8.71.1 |
| ts-jest | 29.4.12 | 29.4.14 |
| supertest | 7.2.2 | 7.3.1 |
| tsx | 4.23.13 | 4.23.15 |
| prettier | 3.9.6 | 3.9.9 |
| @types/node, @types/multer, @types/nodemailer | 22.20.2, 2.2.0, 8.0.1 | 22.20.5, 2.3.0, 8.0.2 |

Aucun changement cassant dans ces plages (mineures/correctifs). Non montés volontairement : `stripe` 22 → 23, `dotenv` 17 → 18, `typescript` 5.9 → 7, `@types/node` 22 → 26 (majeures, à traiter une par une avec leurs notes de version).

## Frontend

`npm audit --omit=dev` : **0 vulnérabilité** (7 avant). Les alertes de production venaient toutes de `tailwindcss` 3 (`braces`, `micromatch`, `fast-glob`, `chokidar`, `postcss-selector-parser`) ; la migration vers **Tailwind 4** (outil officiel `@tailwindcss/upgrade`, 160 fichiers) les supprime. Compatibilité conservée dans `app/globals.css` : curseur « main » des boutons, couleur des placeholders, bordure grise par défaut. Rendu comparé avant/après sur 8 pages publiques : mise en page identique ; dégradés un peu plus saturés (interpolation oklab) et quelques pixels de hauteur de ligne.

`npm audit` complet : 38 alertes, toutes en devDependencies (chaîne `jest` 29, `eslint-config-next`) : outillage de test et de lint, absent du navigateur et du serveur. Risque accepté ; `jest` 30 et `eslint` 10 sont des montées de majeure à traiter à part.

### Paquets mis à jour

| Paquet | Avant | Après |
|---|---|---|
| tailwindcss, @tailwindcss/postcss | 3.4.19 | 4.3.3 (autoprefixer retiré : intégré) |
| @stripe/stripe-js | 2.4.0 | 10.0.0 |
| @stripe/react-stripe-js | 3.11.0 | 7.0.0 |
| @tanstack/react-query | 5.103.3 | 5.104.1 |
| next-intl | 4.14.7 | 4.14.9 |
| react-hook-form | 7.88.0 | 7.89.0 |
| socket.io-client | 4.8.3 | 4.8.4 |
| postcss | 8.5.28 | 8.5.29 |
| prettier | 3.9.6 | 3.9.9 |

`components/stripe-payment.tsx` (loadStripe, Elements, CardElement, confirmCardPayment) n'a pas changé : tsc et tests passent. Non montés : `zod` 3 → 4, `zustand` 4 → 5, `jest` 29 → 30, `eslint` 9 → 10, `lucide-react` 0 → 1, `typescript` 5.9 → 7.

## Cliquet de lint

Principe : `--max-warnings` égale le nombre exact d'avertissements ; on le baisse à chaque lot, jamais on ne le relève.

| Projet | Avant | Après |
|---|---|---|
| backend | 401 (386 réels) | **0** |
| frontend | 0 | 0 |
| mobile/customer | 25 | **0** |
| mobile/delivery | 30 | **0** |
| mobile/merchant | 20 | **0** |
| mobile/admin | 4 | **0** |
| mobile/zupdrive-driver | 37 | **0** |
| mobile/zupdrive-passenger | 25 | **0** |

Backend : 386 avertissements au départ (360 `no-explicit-any`), **0** maintenant ; `--max-warnings 0` comme le frontend. Principes appliqués : types Prisma (`WhereInput`, `UpdateInput`, énumérations) ; entrées validées par Zod (statuts de commande, de campagne, de rapport ; réponses des fournisseurs d'adresses ; contenu de l'outbox et des sauvegardes) ; colonnes Json lues par `utils/json.ts` (`objetJson`, `listeJson`, `entreeJson`, `enJson`) ; erreurs Prisma par `utils/code-erreur.ts`. Deux assertions de type restent aux frontières de restauration (`merchant-closure.service.ts`, `backup.service.ts`) : le contenu vient d'une archive que nous avons écrite et Prisma valide les colonnes à l'écriture.

Mobile : les six apps sont à `--max-warnings 0`. Les règles React Compiler sont traitées ainsi :
- `lib/useEffectChargement.ts` (une copie par app) : chargements asynchrones, même convention que le frontend (`additionalHooks` dans `eslint.config.js`) ;
- `lib/useDerniereValeur.ts` : référence mise à jour après le rendu au lieu d'être écrite pendant ;
- états dérivés (suggestions d'adresse, moyen de paiement, verdict de livraison, états GPS) ou ajustés pendant le rendu (remise, plat choisi, devis ZupDrive, raison d'un refus, sélection de course) à la place des effets de remise à zéro ;
- notification touchée : l'écoute ne s'ouvre qu'une fois connecté, sans état intermédiaire ; code de remise en main : confirmation à la saisie ;
- `require()` paresseux de modules natifs (absents d'Expo Go et du web) : désactivation ciblée de `no-require-imports`, motivée sur la ligne.

Vérifié : `tsc` et lint à 0 sur les six apps, et `expo export --platform android` produit un bundle pour chacune. **Non testé sur appareil** : les parcours touchés (notification touchée, saisie du code de remise en main, décompte de retour automatique, guidage, offres) sont à passer en recette.

## Changements de comportement à connaître (backend)

- `GET /orders?status=…`, `GET /orders/status/:storeId?status=…` : un statut inconnu répond désormais **400** (validation Zod) au lieu d'une erreur Prisma 500. Valeurs : `PENDING`, `ACCEPTED`, `PREPARING`, `REJECTED`, `READY`, `COMPLETED` (+ `ALL` sur le premier).
- Enregistrement d'une carte (`savePaymentMethod`) : le type Stripe `card` était converti en énumération Prisma par un `as any` ; « card » n'est pas une valeur de `PaymentMethodType`. Il est maintenant converti en `CREDIT_CARD`/`DEBIT_CARD` (selon `funding`), les autres moyens en `STRIPE`.
- ZupDrive temps réel : `POST /api/zupdrive/realtime/join|leave/:courseId` lisait `req.socketId`, posé par aucun middleware (400 permanent). Le `socketId` vient maintenant du corps de la requête et doit appartenir à l'appelant.
- Recherche de boutiques (`GET /api/client/stores/search`) : sans `city`, une clause `OR` vide annulait le filtre ; elle n'est plus ajoutée.
- Rapports (`status`, `paymentStatus`) et campagnes marketing (`status`) : valeur inconnue → 400 au lieu d'une erreur Prisma.
- `notification.service.ts` : `sendOrderNotification` et `sendDriverNotification` (aucun appelant, types hors énumération) supprimées.
- Outbox : le contenu relu en base est validé par Zod avant d'être traité.
- Webhook Stripe : l'aiguillage ZupDrive utilise désormais le type de l'événement (`Stripe.Event`) au lieu d'un `any` ; mêmes événements, même ordre.
