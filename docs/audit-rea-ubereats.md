# A01 — Baseline documentaire et écarts de preuves (13 octobre 2026)

## Portée
Cette étape recoupe le rapport externe `AUDIT_REA_ZUPEAT_2026-10-10.md` (audit du SHA `e66cd0e3f676b7e06c2d783dc53e71f780b41128`) avec les fichiers du dépôt consultés le 13 octobre. **Il ne s'agit ni d'un audit exhaustif du code, ni d'une exécution des tests, ni d'une validation de production.**

## Constats vérifiés par lecture
- `.github/workflows/ci.yml` existe : PostgreSQL 16, migrations, tests backend, frontend, applications mobiles et E2E navigateur. L'ancienne consigne « créer la CI » de `NEXT_STEPS.md` (7 octobre) est dépassée.
- L'audit du 10 octobre signalait `npm audit --omit=dev --audit-level=high` comme non bloquant. Au 13 octobre, le job **backend** exécute cette commande sans `continue-on-error`. Le job **frontend** demeure informatif (`continue-on-error: true`). Ne pas assimiler ces deux états.
- `docs/etat-projet.md` documente une intégration A16 le 12 octobre (PR #222, commit annoncé `6439e36a51c6262b4781937c217a4063df6a90db`) et rapporte 11/11 jobs CI réussis sur une tête de PR antérieure. Ces résultats sont **rapportés dans la documentation**, non réexécutés ici.
- `NEXT_STEPS.md` contient encore des métriques historiques (106 tests backend, un test frontend, 401 avertissements, estimation MVP 70 %) qui ne décrivent pas nécessairement la révision actuelle.
- Le pilote est explicitement bloqué dans `docs/etat-projet.md` faute de SHA d'environnement, base représentative et preuves de parcours externes.

## Matrice de validation
| Sujet | État au 13 octobre | Preuve / action suivante |
| --- | --- | --- |
| CI | Fichier observé ; succès récent rapporté | `.github/workflows/ci.yml` ; vérifier exécution sur le SHA courant |
| Inscription et authentification | Implémentation et tests rapportés | Contrôler en navigateur et sur base dédiée |
| Commande multi-acteurs | Non validée en conditions représentatives | A03 : panier → commerçant → livreur → remise, refus et annulation |
| Stripe TEST/3DS externe | Non établi | A04 : tests externes autorisés et rapprochement |
| Stripe LIVE | Non établi | Pilote autorisé seulement, sans opération automatique |
| Sécurité multi-tenant | Tests ciblés rapportés, audit horizontal incomplet | A02 : matrice rôles/organisations |
| Reversements SEPA réels | Non établi | A07 : réconciliation et revue humaine |
| Sauvegarde distante/restauration réelle | Procédures et tests simulés rapportés ; exercice externe non établi | A08 : restauration isolée |
| SHA déployé | Non établi | Identifier version serveur sans divulguer les secrets |
| Pilote utilisateur | Bloqué | A10 : critères go/no-go |

## Ordre de travail et garde-fous
1. A02 : autorisations et isolation des données ; corriger uniquement les défauts reproduits.
2. A03 : E2E commande complète sur PostgreSQL dédié, sans fonds réels.
3. A04 : Stripe TEST, remboursements, idempotence et rapprochement.
4. A05–A09 : commerçant, livraison, reversements, exploitation, charge et UX.
5. A10 : recette pilote consentie, décision explicite avant tout lancement.

Chaque étape doit consigner : date, branche, SHA, environnement, commandes exécutées, résultats, échecs, limites, fichiers modifiés, risques résiduels. Distinguer **implémenté**, **testé localement**, **testé en CI**, **intégré**, **déployé** et **validé en exploitation**. Ne pas supprimer les preuves historiques. Faire relire la PR avant fusion.

## Limites de cette étape
Aucun test exécuté, aucune lecture du VPS ni de Stripe, aucune confirmation du SHA actif. Le SHA de la branche créée doit être relevé et figé dans la PR avant de qualifier la baseline de reproductible.
