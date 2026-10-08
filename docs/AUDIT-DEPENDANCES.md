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

`npm audit --omit=dev` : 5 *high* + 2 *moderate*, tous issus de **`tailwindcss` 3.4.19** (`braces`, `micromatch`, `fast-glob`, `chokidar`, `postcss-nested`, `postcss-selector-parser`).

| Alerte | Type | Atteignable ? | Décision |
|---|---|---|---|
| `braces` (épuisement de pile sur motifs imbriqués) et dérivés | Outillage de build (Tailwind scanne les fichiers du dépôt) | Non : s'exécute au `next build`/`next dev` sur nos sources, jamais sur une entrée utilisateur, et rien n'en est livré au navigateur. | Risque accepté |
| `postcss-selector-parser` < 7.1.6 (complexité quadratique) | Outillage de build | Non : mêmes raisons (sélecteurs de nos propres CSS). | Risque accepté |
| Chaîne `jest` 29 / `eslint-config-next` (35 *high* au total en audit complet) | devDependencies | Non : outillage de test/lint. | Risque accepté |

La seule sortie réelle est **Tailwind 3 → 4** (réécriture de la configuration, changements d'utilitaires et de thème sur toute l'interface) : c'est un chantier à part, pas un correctif de sécurité. À planifier avec une revue visuelle des espaces client, merchant, delivery et superowner.

### Paquets mis à jour (dans leurs plages)

| Paquet | Avant | Après |
|---|---|---|
| @tanstack/react-query | 5.103.3 | 5.104.1 |
| next-intl | 4.14.7 | 4.14.9 |
| react-hook-form | 7.88.0 | 7.89.0 |
| socket.io-client | 4.8.3 | 4.8.4 |
| postcss | 8.5.28 | 8.5.29 |
| autoprefixer | 10.5.6 | 10.6.1 |
| prettier | 3.9.6 | 3.9.9 |

Non montés (majeures) : `@stripe/stripe-js` 2 → 10 et `@stripe/react-stripe-js` 3 → 7 (flux de paiement : à faire avec un test de bout en bout), `zod` 3 → 4, `zustand` 4 → 5, `jest` 29 → 30, `eslint` 9 → 10, `lucide-react` 0 → 1, `typescript` 5.9 → 7.

## Cliquet de lint

Principe : `--max-warnings` égale le nombre exact d'avertissements ; on le baisse à chaque lot, jamais on ne le relève.

| Projet | Avant | Après |
|---|---|---|
| backend | 401 (386 réels) | **277** |
| frontend | 0 | 0 |
| mobile/customer | 25 | 24 |
| mobile/delivery | 30 | 30 |
| mobile/merchant | 20 | 20 |
| mobile/admin | 4 | 3 |
| mobile/zupdrive-driver | 37 | 29 |
| mobile/zupdrive-passenger | 25 | 8 |

Backend : 360 `no-explicit-any` au départ (tests compris). Traités : auth, paiements, commandes, reversements, journal d'audit. Il reste 277 avertissements, surtout dans `privacy`, `admin`, `stores`, `merchants`, `customers`, `zupdrive`, `marketing`, `superowner`, `catalog`, `drivers`, `delivery`. Un `any` subsiste volontairement dans `webhooks/webhook.service.ts` : `emit()` reçoit des charges utiles contenant des `Date`, non assignables à `Prisma.InputJsonObject` sans changer les 13 appelants.

Mobile : les avertissements restants sont des règles React Compiler (`react-hooks/set-state-in-effect`, `refs`, `immutability`, `preserve-manual-memoization`). Les corriger demande de réécrire des composants ; sans appareil ni test d'interface, ce n'est pas fait ici.

## Changements de comportement à connaître (backend)

- `GET /orders?status=…`, `GET /orders/status/:storeId?status=…` : un statut inconnu répond désormais **400** (validation Zod) au lieu d'une erreur Prisma 500. Valeurs : `PENDING`, `ACCEPTED`, `PREPARING`, `REJECTED`, `READY`, `COMPLETED` (+ `ALL` sur le premier).
- Enregistrement d'une carte (`savePaymentMethod`) : le type Stripe `card` était converti en énumération Prisma par un `as any` ; « card » n'est pas une valeur de `PaymentMethodType`. Il est maintenant converti en `CREDIT_CARD`/`DEBIT_CARD` (selon `funding`), les autres moyens en `STRIPE`.
- Journal de sécurité (`SecurityEventService.record`) : l'acteur lisait `req.actorEmail`, qu'aucun code ne renseigne (toujours « inconnu »). Il utilise maintenant `req.userId`.
- Webhook Stripe : l'aiguillage ZupDrive utilise désormais le type de l'événement (`Stripe.Event`) au lieu d'un `any` ; mêmes événements, même ordre.
