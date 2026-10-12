# ZupEat — application commerçant

Application Expo / React Native cliente de l'API REST centrale. Pour l'état
courant du backend, les rôles de base et les limites des intégrations, consulter
[CONFIGURATION-A16](../../../docs/CONFIGURATION-A16.md) et le
[registre courant](../../../docs/etat-projet.md).

## Rapports A15

Les rapports ventes utilisent les dates envoyées par l'écran statistiques et
reçoivent au plus 100 commandes par page; les totaux API couvrent toute la
période. Période maximale : 366 jours. Les erreurs 400 de date/pagination
doivent être présentées comme filtres à corriger. Voir le [contrat A15](../../../docs/RAPPORTS-A15.md).

## Dépendances — audit A12

Le lockfile du 12 octobre 2026 conserve 46 avis de production (1 critique,
29 hautes, 16 modérées). La présence dans Expo ne prouve pas à elle seule un
chemin exploitable. Voir la qualification, les commandes et la revue du
12 novembre 2026 dans [l’audit A12](../../../docs/AUDIT-DEPENDANCES.md).

Les contrats paiement/commande et la matrice des permissions A13 sont dans le
[contrat API](../../../docs/CONTRATS-API-A13.md). Le client mobile ne confirme
pas lui-même un paiement : l'API transmet la commande au commerçant après
confirmation serveur. La CI valide types, lint et les tests Jest de cette app;
elle ne remplace pas un essai d'acceptation de commande sur appareil.

Application Expo du commerçant, cliente de l'API ZupOne/ZupEat. La connexion
exige un compte rattaché à un commerce ; les autorisations et les règles métier
restent contrôlées par le serveur.

**État au 4 octobre 2026 :** l'application est écrite, sa publication dans les
stores reste à réaliser. L'API est déjà déployée sur le VPS. Voir
[l'état du projet](../../../docs/etat-projet.md) pour les validations connues
et les prochaines étapes.

## Fonctionnalités présentes

Le renouvellement de session est partagé entre requêtes et transmet un `requestId` aléatoire cryptographique. Après une réponse perdue, il réessaie une fois avec la même clé dans la fenêtre serveur de 10 secondes. Une panne réseau ou un 409 persistant ne déconnecte pas ; seul un refus 401/403 définitif termine la session. Tests ciblés : `npm test -- --runInBand lib/__tests__/renouvellement.test.ts`. Voir le [contrat A09](../../../docs/ROTATION-SESSIONS-A09.md).

- Tableau de bord et commandes, détail et actions sur leur état.
- Choix de boutique pour un compte possédant plusieurs commerces.
- Catalogue, édition des produits et suppléments.
- Réglages de boutique, statistiques, promotions et avis clients.
- Notifications de commandes, support, paramètres et compte.
- Session conservée sur le téléphone et renouvellement des jetons.

Les écrans sont dans `components/screens/`, le cadre et la connexion dans
`app/index.tsx`, les échanges avec l'API dans `lib/api.ts`. Le temps réel et
les alertes utilisent les modules de `lib/`.

## Lancer en développement

Depuis ce dossier :

```bash
npm install
npm start
```

`EXPO_PUBLIC_API_URL` fixe l'adresse de l'API, par exemple
`https://api.zupeat.com` pour le déploiement. Sans cette variable, `lib/api.ts`
cherche le PC qui sert l'application et utilise le port 3001 ; `localhost`
sur un téléphone désigne le téléphone lui-même.

```bash
npm run lint
npx tsc --noEmit
```

## Avant publication

- Tester la connexion et les actions de commande sur un téléphone réel avec
  une boutique de test dédiée.
- Vérifier les notifications, la reconnexion et les droits du compte utilisé.
- Préparer l'identité visuelle, les comptes des stores, les builds et leur
  configuration pour l'API déployée.

Le [guide de publication livreur](../delivery/PUBLICATION.md) décrit les étapes
pour cette autre application ; ses identifiants, autorisations et justificatifs
ne doivent pas être repris tels quels pour l'application commerçant.

