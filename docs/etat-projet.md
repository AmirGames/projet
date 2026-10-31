Warning: truncated output (original token count: 11636)
Total output lines: 544

# État du projet et travail restant

## Actualisation — 31 octobre 2026

Les correctifs de préparation des pages légales et du contrôle runtime sont
proposés dans la [PR brouillon #241](https://github.com/AmirGames/projet/pull/241).
La CI complète est réussie (11/11 jobs) sur la tête `8c13d04824b96b80ffd4b2383c3749f9308700fa`;
la preuve détaillée, les changements et les blocages de production sont consignés
dans le [rapport de vérification du lancement](verification-lancement-2026-10-31.md).
La PR n'est pas intégrée ni déployée. Les règles de remboursement/annulation,
l'assurance des livreurs et la conservation de géolocalisation restent à confirmer
par l\x27exploitant. Les champs BCE, TVA et hébergeur sont exclus des changements.

> **A03 — 13 octobre 2026 :** [correctifs initiaux des permissions sur les commandes](A03-SECURITE-COMMANDES.md). En attente des tests multi-tenant et de la CI ; ne pas considérer le parcours complet validé.


> **A02 — Investigation ouverte le 13 octobre 2026 :** [revue statique des autorisations](SECURITE-A02-2026-10-13.md), scénarios à reproduire avant correction. Aucune vulnérabilité confirmée, aucun test exécuté, aucun déploiement revendiqué.


> **Actualisation documentaire du 13 octobre 2026 :** [baseline A01](audit-rea-ubereats.md). Le pilote reste non validé en exploitation ; aucune nouvelle exécution de test ni preuve serveur n'a été produite pendant cette actualisation.


## État courant — 12 octobre 2026

La version A16 examinée est intégrée à `claude/awesome-ride-m9lci8` au commit
`6439e36a51c6262b4781937c217a4063df6a90db` (PR #222). Le compte rendu de
recette ci-dessous décrit un pilote fermé ZupEat avec ZupDrive explicitement
exclu. **Décision : bloqué pour démarrer la recette utilisateur**, faute de
SHA/environnement accessible, base représentative et preuves des parcours
externes. Le résultat CI ne prouve ni déploiement ni exploitation. Les audits
A01–A16 restent datés ; consulter [la décision et sa matrice A01–A16](RECETTE-PILOTE-A16-2026-10-12.md).
Les états « développé », « testé », « intégré », « déployé » et « validé en
exploitation » sont indépendants. Le [registre spécialisé de lancement UE](registre-lancement-ue.md)
reste la liste de conformité et ne constitue pas une preuve à lui seul.

## Étape 16 — A16 : vérification du pilote et décision de lancement

| État | Date, SHA, environnement | Preuve |
|---|---|---|
| Développé | 12 octobre 2026, branche `claude/awesome-ride-m9lci8-a16-config-docs`, code initial `7ba6fab46a1129508cb1a66541e5e809a54c44ee`; dernière tête avant fusion `3085ff4dc09974fc99d6c7361cff79fbe67dff15` | Configuration backend, stockage privé vérifié au démarrage, sonde SQL en lecture seule, CSP progressive et guide [CONFIGURATION-A16](CONFIGURATION-A16.md) |
| Testé localement | 12 octobre 2026, Windows, SHA testé `be7f6c5ceba3aedd2a7ed3e18b58b26447e25be9`, Node 24.21.0, npm 12.0.2, Prisma 7.10.0, Next.js 16.4.0 | Backend config/Stripe/dépendances activées/stockage **10/10**; TypeScript, lint complet backend et build réussis; fro…10036 tokens truncated… backend; [commit code A14](https://github.com/AmirGames/projet/commit/55a7d90113d814c7a23f3aac400317a9110dafe0) |
| Testé localement | 12 octobre 2026, Windows, Node 24.21.0, npm 12.0.2, Prisma 7.10.0 | Tests ciblés **11/11**, routes publiques **5/5**, TypeScript, lint et build backend réussis sur le commit code; Docker daemon absent, donc coupures PostgreSQL/Redis/SMTP sur instance isolée et réception d'alertes non éprouvées |
| CI / PR | 12 octobre 2026, GitHub | [PR #218](https://github.com/AmirGames/projet/pull/218), branche synchronisée avec base à la création; aucun statut CI publié au relevé |
| Intégré | 12 octobre 2026 | [PR #218 fusionnée](https://github.com/AmirGames/projet/pull/218), merge commit `adb811805afe38ffe7a4dc6b90406bfe8b618708` |
| Déployé | Non | Aucun déploiement ni migration A14 |
| Validé en exploitation | Non | Aucune instance isolée avec coupures des quatre dépendances; aucune réception d'alerte vérifiée |

Le relevé local A14 et l'absence de statut CI correspondent à l'instantané
initial. La PR #218 est depuis intégrée au merge
`adb811805afe38ffe7a4dc6b90406bfe8b618708`; cela ne prouve pas le déploiement,
les coupures isolées ni la réception d'alertes. Ces états restent distincts.

## Étape 13 — A12 : audit et correction des dépendances (12 octobre 2026)

| État | Date / SHA | Environnement et preuve |
|---|---|---|
| Développé | 12 octobre 2026, [SHA `e4d55431c13dd927b16960693c3b9c68fe4b348d`](https://github.com/AmirGames/projet/commit/e4d55431c13dd927b16960693c3b9c68fe4b348d), branche `claude/awesome-ride-m9lci8-a12-dependances` | Worktree isolé à partir du tronc `adb811805afe38ffe7a4dc6b90406bfe8b618708`; overrides et lockfile backend |
| Testé localement | 12 octobre 2026, [SHA `e4d55431c13dd927b16960693c3b9c68fe4b348d`](https://github.com/AmirGames/projet/commit/e4d55431c13dd927b16960693c3b9c68fe4b348d) | Node 24.21.0/npm 12.0.2; `npm ci`, génération Prisma 7.10.0, lint et build réussis; simulation `npm ci --omit=dev` et audit runtime à zéro. Jest local bloqué par l’absence d’identifiants PostgreSQL valides. |
| Testé en CI | 12 octobre 2026, SHA `b4ee2888ac20cf0dffd40d4c2ca823870cde04b0` | 11/11 checks réussis, migrations PostgreSQL dédiées et E2E inclus : [run 38265964207](https://github.com/AmirGames/projet/actions/runs/38265964207). |
| Intégré | 12 octobre 2026 | [PR #219 fusionnée](https://github.com/AmirGames/projet/pull/219), merge commit `374229621ee573ccee8ad06391851655b3a8da89` |
| Déployé | Non | Aucun déploiement effectué |
| Validé en exploitation | Non | Aucune instance de production ni image exécutée |

Les migrations sur bases vides et les suites PostgreSQL du workflow ont réussi;
le scan et la construction de l’image OCI production ainsi que la mise à niveau
d’une base préexistante ne sont pas couverts par ce run. Les 6 lockfiles mobiles conservent
des alertes de production, suivies à part avec échéance de revue. Voir
[l’inventaire détaillé, chemins et limites A12](AUDIT-DEPENDANCES.md). Il n’y a
pas de changement d’API, de schéma, de permission ou de configuration métier.

