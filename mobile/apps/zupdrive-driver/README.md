# ZupDrive Driver — application chauffeur

**Hors périmètre du pilote ZupEat A16** au commit de référence
`6439e36a51c6262b4781937c217a4063df6a90db`. Les validations de cette app, de ses
API et appareils restent distinctes ; aucune ne vaut recette ZupEat. Voir la
[décision A16](../../../docs/RECETTE-PILOTE-A16-2026-10-12.md#périmètre-décidé).

## Dépendances — audit A12

Le lockfile du 12 octobre 2026 conserve 47 avis de production (1 critique,
30 hautes, 16 modérées). La présence dans Expo ne prouve pas à elle seule un
chemin exploitable. Voir la qualification, les commandes et la revue du
12 novembre 2026 dans [l’audit A12](../../../docs/AUDIT-DEPENDANCES.md).

Application Expo/React Native du chauffeur (transport de personnes), séparée du livreur ZupEat. **Statut pilote : hors périmètre** jusqu’à validation complète sur un appareil ou émulateur contre un backend réel de test. Les écrans et contrats sont développés, mais ce dépôt ne contient pas de preuve d’un tel parcours.

## Parcours et API

La connexion passe par le compte commun ZupOne : `POST /api/auth/login` avec `{ email, password }`, puis les requêtes authentifiées portent `Authorization: Bearer <accessToken>`. La session est conservée dans SecureStore sous une clé propre à cette application (`zupdrive.driver.session`). Les 401 renouvellent la session via `POST /api/auth/refresh` selon [A09](../../../docs/ROTATION-SESSIONS-A09.md) ; une panne réseau ne déconnecte pas l’utilisateur. Un refus définitif du renouvellement efface la session et demande une nouvelle connexion.

| Usage | Contrat serveur |
|---|---|
| Lire le dossier du compte connecté | `GET /api/zupdrive/chauffeur/me` → `{ success, data: dossier \| null }` |
| Tableau chauffeur, proposition, course courante, historique chauffeur | `GET /api/zupdrive/chauffeur/me/courses` |
| Disponibilité | `POST /api/zupdrive/chauffeur/me/disponibilite` avec `{ enLigne: boolean }` |
| Position GPS | `POST /api/zupdrive/chauffeur/me/position` avec `{ latitude, longitude }` |
| Accepter/refuser | `POST /api/zupdrive/chauffeur/me/propositions/:id/accepter` ou `/refuser` ; `:id` est l’ID de proposition |
| Étapes | `POST /api/zupdrive/chauffeur/me/courses/:id/arrive`, `/demarrer`, `/terminer` |
| Revenus chauffeur | `GET /api/zupdrive/payment/earnings` |

Le tableau ne demande jamais l’historique passager. Le serveur dérive le chauffeur du jeton, n’expose au chauffeur que ses propres courses et renvoie 404 pour une ressource qui ne lui appartient pas. L’acceptation est atomique : un concurrent perd avec une erreur métier 409 et l’app recharge le tableau. Une proposition qui a expiré est désactivée si son échéance est connue, puis l’état est relu après le refus du serveur. Le statut du dossier doit être `VALIDE` côté dossier et tableau avant que l’app autorise la mise en ligne ou l’acceptation. Les états non validés, refusés et suspendus sont affichés.

Le backend expire une proposition après 20 secondes. En ligne et au premier plan, l’app relit le tableau toutes les 4 secondes et envoie la position toutes les 15 secondes (`expo-location`, permission uniquement « pendant l’utilisation »). Le suivi en arrière-plan et les notifications push de propositions ne sont pas implémentés ni éprouvés ; le chauffeur doit garder l’app ouverte pour rester visible au matching. Les commandes de course suivent l’ordre `ACCEPTEE → ARRIVEE → EN_COURS → TERMINEE`. Les erreurs réseau laissent la session en place et proposent une nouvelle lecture. Les montants sont des centimes entiers et les versements sont lus sans créer de mouvement financier.

## Développement et contrôles

Expo déclaré : `~57.0.25` dans `package.json` et `package-lock.json`. Dépendances natives locales à installer via `npm ci` avant lancement. Documentation Expo consultée pour la version majeure : [SDK 57](https://docs.expo.dev/versions/v57.0.0/).

```bash
npm ci
npm run typecheck
npm run lint
npm test -- --runInBand lib/__tests__/chauffeur.test.ts
npm test -- --runInBand lib/__tests__/api.test.ts lib/__tests__/renouvellement.test.ts
npm start
```

`EXPO_PUBLIC_API_URL` configure le backend ; en développement, l’app déduit l’hôte Metro et le port 3001. Ne pas utiliser `localhost` depuis un téléphone physique. Aucun nouveau modèle Prisma ni migration n’est requis.

## Validation externe encore requise

Suivre [le guide de validation mobile chauffeur](../../../docs/validation-mobile-zupdrive-driver.md) : PostgreSQL de test migré, connexion réelle, dossier non validé puis validé, disponibilité et position, proposition, acceptation par deux chauffeurs, course terminée, droits de lecture passager et essai sur appareil/émulateur. L’app demeure **hors périmètre du pilote** tant que ces preuves ne sont pas inscrites dans `docs/etat-projet.md`. Aucun résultat de test backend réel, appareil, intégration, déploiement ou exploitation n’est revendiqué par ce changement.

Architecture mobile : `app/index.tsx`, `lib/chauffeur.ts`, `lib/api.ts`, `lib/session.ts`. Voir aussi [`docs/zupdrive.md`](../../../docs/zupdrive.md) et [`docs/zupdrive-api-admin.md`](../../../docs/zupdrive-api-admin.md).

## Revue mobile — 13 octobre 2026

Les courses, paiements et documents chauffeur ZupDrive doivent être validés sur appareil et environnement autorisé avant ouverture.

Aucun test sur appareil n'a été exécuté pendant cette mise à jour.
