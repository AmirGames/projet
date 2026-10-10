# ZupEat — application commerçant

Application Expo du commerçant, cliente de l'API ZupOne/ZupEat. La connexion
exige un compte rattaché à un commerce ; les autorisations et les règles métier
restent contrôlées par le serveur.

**État au 4 octobre 2026 :** l'application est écrite, sa publication dans les
stores reste à réaliser. L'API est déjà déployée sur le VPS. Voir
[l'état du projet](../../../docs/etat-projet.md) pour les validations connues
et les prochaines étapes.

## Fonctionnalités présentes

Le renouvellement de session est partagé entre requêtes; il transmet une clé de reprise aléatoire et ne déconnecte pas sur une coupure réseau. Voir le [contrat A09](../../../docs/ROTATION-SESSIONS-A09.md).

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
