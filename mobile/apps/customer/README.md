# Zupone — application client

Application mobile du client, construite sur le même modèle que les
applications commerçant (`../merchant`) et livreur (`../delivery`) : même
connexion, même barre du bas (Menu · Accueil · Paniers · Commande en cours),
même tiroir latéral, mêmes composants (`components/ui.tsx`).

## Ce que fait l'application

- **Connexion ou création de compte** (tout compte peut commander : la fiche
  client naît à la première visite).
- **Accueil** : adresse de livraison (suggestions du serveur ou position du
  téléphone), recherche, catégories de cuisine (Pizzas, Sushis…), tri (note,
  distance, frais), commerces qui livrent à l'adresse d'abord, avec leurs frais
  et leur minimum, et les **paniers en cours**.
- **Vitrine** : menu rangé par catégories dans l'ordre du commerçant, plats
  épuisés en direct (retirés du panier s'ils y étaient), déclinaisons, favori,
  livraison ou non à l'adresse retenue.
- **Un panier par commerce**, gardé sur le téléphone et **partagé avec le site** :
  un panier commencé sur l'ordinateur apparaît sur le téléphone, et inversement,
  en direct (`GET/PUT /api/client/me/paniers`, annonce « panier-modifie »).
- **Commande** : livraison ou retrait (seul le retrait hors des horaires),
  zone vérifiée et minimum annoncé, créneaux de retrait tenus aux horaires,
  coordonnées pré-remplies, moyen de paiement du commerçant, code promo, frais
  de service, total avant de valider. **Paiement en ligne** par la feuille de
  paiement Stripe quand la plateforme l'a branché (`GET /api/payments/config`).
- **Suivi en direct** : étapes, heure annoncée à l'acceptation, motif d'un
  refus, livreur (note, véhicule, appel), distance restante, **carte intégrée**
  où le livreur avance en direct avec son itinéraire et l'heure d'arrivée, **code de remise**, photo du dépôt, « votre livreur est
  bientôt là » (vibration).
- **Mes commandes**, **Avis** (commerce, plats, livreur), **Favoris**,
  **Notifications**, **Paramètres**, **Mon compte**.

En direct (Socket.IO) : chaque commande en cours est suivie dans son salon,
la vitrine ouverte dans celui du commerce. Une notification push prévient
application fermée (commande acceptée ou annulée, étapes de la livraison,
livreur proche) ; la toucher ouvre la commande.

## Lancer

```bash
npm install
npx expo start
```

L'adresse du serveur est dans `lib/api.ts` (`API_URL`).

Les notifications push, la localisation et le paiement Stripe demandent une
**build de développement** (`npx expo run:android` ou
`npx eas-cli@latest build --profile development`) : Expo Go ne les porte pas.
Le projet EAS doit être configuré (`npx eas-cli@latest init`).

Sans clé publique Stripe côté serveur (`STRIPE_PUBLISHABLE_KEY`) alors que le
paiement en ligne est actif, l'application ne propose que les espèces.

## Organisation

```
app/index.tsx              écran racine : session, onglets, tiroir, bandeau, écrans empilés
components/LiveMap.tsx     carte de la livraison en direct (Leaflet dans une WebView)
components/ui.tsx          en-tête, cartes, lignes, chargement (commun aux trois applications)
components/screens/        un fichier par écran
lib/api.ts                 appels au serveur, montants, adresses des images
lib/session.ts             session et adresse de livraison (SecureStore)
lib/carts.ts               un panier par commerce (AsyncStorage)
lib/useCartSync.ts         paniers partagés avec le compte (site ↔ téléphone)
lib/stores.ts              commerces, menus, zones de livraison
lib/orders.ts              commandes, statuts, suivi
lib/useCustomerRealtime.ts connexion temps réel et salons des commandes
lib/push.ts                notifications push (app « customer »)
lib/realtime.ts            abonnement aux événements et aux salons, écran par écran
```
