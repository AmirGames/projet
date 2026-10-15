# Alertes `npm audit` : exposition réelle

## Relevé courant A12 — 12 octobre 2026

Inventaire recalculé à partir des huit `package-lock.json` présents dans le
tronc `adb811805afe38ffe7a4dc6b90406bfe8b618708`. Les commandes ont interrogé
le registre npm le 12 octobre 2026. Les résultats « complet » incluent les
dépendances de développement; `--omit=dev` représente les dépendances de
production des apps. Un décompte est un instantané de base d’avis, pas une
preuve d’absence d’exploitation.

### Backend — correction A12

Avant correction, `npm audit --omit=dev` relevait quatre alertes hautes :
`mysql2@3.15.3` transitif et ses avis
[GHSA-3f6p-5ww8-9rcr](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr)
(repli `mysql_clear_password`, corrigé en 3.22.0) et
[GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3)
(décompression non bornée, corrigée en 3.23.1), ainsi que
`deepmerge-ts@7.1.5` via `@prisma/config`/`prisma` et
[GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)
(récursion cyclique, corrigée en 8.0.0). Les versions de Prisma restent
`7.10.0`; les overrides versionnés résolvent désormais `mysql2@3.24.5` et
`deepmerge-ts@8.0.2`. `npm audit --omit=dev` : 0 alerte. `npm audit` complet
après correction : 21 modérées, 0 haute/critique, principalement outillage de
tests/build; elles ne sont pas dans le runtime de l’image après `npm ci
--omit=dev`.

`mysql2` n’est pas appelé par le métier ZupEat : PostgreSQL est l’unique base
et l’adaptateur applicatif est `@prisma/adapter-pg`. Cela réduit l’exposition
des deux avis mysql2, sans la rendre nulle tant que le CLI Prisma est installé
et utilisé lors des commandes d’opérateur/migration. `deepmerge-ts` est chargé
par le CLI pour fusionner `prisma.config.ts`. Le fichier est versionné et n’est
pas une entrée visiteur, mais une configuration locale malformée peut toujours
faire échouer une opération CLI. L’image de migration et l’API partagent encore
le Dockerfile/l’image; les limites et validations de l’image réelle sont
consignées plus bas.

L’override est conservé jusqu’à ce que Prisma amont exige les versions corrigées
ou les embarque; revue au plus tard le **12 novembre 2026**. Ne pas le retirer
sans régénérer le lockfile et relancer les audits et essais Prisma.

### Web et mobile — risques courants à traiter

Audit complet puis audit `--omit=dev`, mêmes lockfiles et date. Valeurs sous la
forme `total (critique/haute/modérée)` :

| Application | Audit complet | Production (`--omit=dev`) | Lecture |
|---|---:|---:|---|
| Backend | 21 (0/0/21) | 0 | Dépendances de développement restantes, à revoir avec l’outillage |
| Frontend | 38 (0/33/5) | 0 | Avis de build/test; Dockerfile prune les dev avant l’image |
| Admin | 32 (0/21/11) | 32 (0/21/11) | Expo/mobile distribué : alertes runtime à qualifier |
| Customer | 70 (1/53/16) | 47 (1/30/16) | 1 critique et 30 hautes dans l’arbre de production |
| Delivery | 33 (1/21/11) | 33 (1/21/11) | 1 critique et 21 hautes dans l’arbre de production |
| Merchant | 69 (1/52/16) | 46 (1/29/16) | 1 critique et 29 hautes dans l’arbre de production |
| ZupDrive Driver | 70 (1/53/16) | 47 (1/30/16) | 1 critique et 30 hautes dans l’arbre de production |
| ZupDrive Passenger | 54 (1/22/31) | 34 (1/22/11) | 1 critique et 22 hautes dans l’arbre de production |

Les arbres Expo mobiles contiennent des paquets distribués avec l’application;
leur présence ne prouve pas que chaque code vulnérable est exécuté, mais
l’étiquette « outil de build » ne suffit donc pas à les exclure. Les alertes
Expo, Metro, Jest et utilitaires transitoires doivent être reliées aux chemins
et versions de chaque lockfile avant correction. Les six applications sont
suivies comme exception temporaire avec revue **12 novembre 2026**; ne pas
abaisser le seuil CI ni utiliser `npm audit fix --force`. Les commandes
reproductibles sont `npm audit --json` et `npm audit --omit=dev --json` dans
chaque dossier d’application.

### Preuves A12 et limites

| État | Date / SHA | Preuve |
|---|---|---|
| Développé | 12 octobre 2026, [SHA `e4d55431c13dd927b16960693c3b9c68fe4b348d`](https://github.com/AmirGames/projet/commit/e4d55431c13dd927b16960693c3b9c68fe4b348d), branche A12 | Overrides backend, lockfile et documentation |
| Testé localement | 12 octobre 2026, [SHA `e4d55431c13dd927b16960693c3b9c68fe4b348d`](https://github.com/AmirGames/projet/commit/e4d55431c13dd927b16960693c3b9c68fe4b348d) | `npm ci`, `npm run prisma:generate`, `npm run lint`, `npm run build`, puis `npm ci --omit=dev`, `npm audit --omit=dev` (0) et `npx prisma --version` (7.10.0). Jest échoue faute d’identifiants PostgreSQL valides. |
| Testé en CI | 12 octobre 2026, SHA `b4ee2888ac20cf0dffd40d4c2ca823870cde04b0` | 11/11 checks réussis, dont backend et migrations PostgreSQL dédiées, frontend, six apps mobiles et E2E : [run 38265964207](https://github.com/AmirGames/projet/actions/runs/38265964207). Le premier SHA `e4d5543` avait un échec CI, corrigé avant le run vert. |
| Intégré | 12 octobre 2026 | [PR #219 fusionnée](https://github.com/AmirGames/projet/pull/219), merge commit `374229621ee573ccee8ad06391851655b3a8da89` dans `claude/awesome-ride-m9lci8` |
| Déployé | Non | Aucun accès ni déploiement de production |
| Validé en exploitation | Non | Aucun essai sur instance réelle |

Les audits ont été exécutés contre le registre npm. Les migrations et suites
PostgreSQL couvertes par le workflow CI ont passé. Le démon Docker Desktop
n’était pas démarré : build/scan de l’image OCI production et mise à niveau
d’une base de test restent à exécuter. Un audit npm ne couvre ni l’image de base Node,
ni les dépendances système, ni l’exploitabilité de l’application.

---

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

## Point de contrôle documentaire — 13 octobre 2026

Les chiffres de vulnérabilités proviennent du lockfile et de la date indiqués ; les recalculer sur chaque SHA candidat et distinguer runtime, devDependencies et mobile.

Revoir [l'état du projet](etat-projet.md) et [la recette A16](RECETTE-PILOTE-A16-2026-10-12.md). Cette note n'atteste aucun test ni déploiement supplémentaire.
