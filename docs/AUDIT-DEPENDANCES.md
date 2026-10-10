# Alertes `npm audit` : exposition réelle

Relevé du 7 octobre 2026, `npm audit --omit=dev` (dépendances livrées), sur le
commit de la PR de correction. Chaque alerte est rattachée à un chemin
d'exposition : le code vulnérable est-il chargé par le serveur en production, et
reçoit-il une donnée contrôlable par un visiteur ?

**Règle :** ne jamais appliquer `npm audit fix --force`. Ici il propose de
*rétrograder* Prisma (7 → 6.19.3) et de passer Tailwind en version 4 : deux
changements majeurs à traiter comme des chantiers, pas comme des corrections.
`npm audit fix` sans `--force` ne corrige rien de plus (vérifié).

## Backend : 4 « high », toutes transitives de `prisma`

| Alerte | Où | Chargé en production ? | Entrée contrôlable ? | Décision |
|---|---|---|---|---|
| `mysql2` — repli d'authentification vers un mot de passe en clair (GHSA-3f6p-5ww8-9rcr), décompression non bornée (GHSA-rgwj-5xj2-c3m3) | Dépendance de l'outillage Prisma | **Non** : le projet n'utilise que PostgreSQL (`@prisma/adapter-pg`). Aucun code n'ouvre une connexion MySQL. | Non | Acceptée. À rejouer à chaque montée de Prisma. |
| `deepmerge-ts` — épuisement de pile sur des objets récursifs (GHSA-ggr8-5vv4-36mx) | `@prisma/config` : fusion de `prisma.config.ts` | Seulement à la commande `prisma migrate deploy` (service `migrate`), pas dans le processus de l'API | **Non** : il fusionne un fichier de configuration du dépôt | Acceptée. |
| `@prisma/config`, `prisma` (par ricochet) | idem | idem | idem | Suit les deux lignes ci-dessus. Le correctif proposé est une rétrogradation : **refusé**. |

Suivre : une version de Prisma 7 qui remonte `mysql2` ≥ 3.23.1 et `deepmerge-ts` ≥ 8.

## Frontend : 5 « high » et 2 « moderate », toutes de la chaîne de build Tailwind 3

| Alerte | Où | Chargé en production ? | Entrée contrôlable ? | Décision |
|---|---|---|---|---|
| `braces` (GHSA-vfj7-8cjw-p6xm), `micromatch`, `fast-glob`, `chokidar` | Recherche des fichiers sources par Tailwind | **Non** : au `next build` seulement ; `next start` ne charge pas Tailwind | **Non** : motifs écrits dans `tailwind.config.js` | Acceptée jusqu'à la migration vers Tailwind 4. |
| `postcss-selector-parser` (GHSA-rj75-hqrm-r3gf) | Plugins PostCSS de Tailwind | Au build seulement | **Non** : sélecteurs du code source | idem |

Tailwind est déclaré dans `dependencies` et reste donc dans l'image. Le passer en
`devDependencies` est possible si le build l'installe (`npm ci` complet avant
`npm prune --omit=dev`, ce que fait déjà le Dockerfile) : à faire avec la migration.

**À planifier** : migration vers Tailwind 4 (changement majeur : configuration,
plugins, classes), qui retire toute cette chaîne.

## Dépendances de développement

Les alertes qui n'apparaissent qu'avec les dépendances de développement
(`npm audit` complet : outillage de test, de lint, d'Expo) ne sont jamais livrées
en production. Elles se traitent à la montée de version habituelle, sans urgence.

## Ce que ce tri ne prouve pas

- Qu'aucune alerte future ne touchera du code réellement chargé : relancer
  `npm audit --omit=dev` à chaque montée de dépendance et avant une mise en production.
- L'exposition des applications mobiles (Expo) : leurs dépendances se jugent à
  part, elles ne tournent pas sur le serveur.
