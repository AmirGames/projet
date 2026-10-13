# ZupEat — application client

Pour la recette fermée au commit intégré `6439e36a51c6262b4781937c217a4063df6a90db`, l'app client est dans le périmètre à
essayer sur appareil ; l'export CI ne vaut pas validation physique. ZupDrive
est exclu. Voir la [matrice et la décision de recette](../../../docs/RECETTE-PILOTE-A16-2026-10-12.md).

## Dépendances — audit A12

Le lockfile du 12 octobre 2026 conserve 47 avis de production (1 critique,
30 hautes, 16 modérées). La présence dans Expo ne prouve pas à elle seule un
chemin exploitable. Voir la qualification, les commandes et la revue du
12 novembre 2026 dans [l’audit A12](../../../docs/AUDIT-DEPENDANCES.md).

Les contrats paiement partagés par le site et les apps (création, confirmation,
état, permissions invité/connecté, refus et 3DS) ainsi que les limites des
preuves A13 sont consignés dans le [contrat API A13](../../../docs/CONTRATS-API-A13.md).
`requires_action` est un état d'authentification en cours, pas un paiement
réussi; seul l'état relu auprès de l'API/webhook fait foi. Les tests de session
de cette app sont unitaires; ils ne simulent pas un appareil ou un paiement.

Application mobile du client, construite sur le même modèle que les
applications commerçant (`../merchant`) et livreur (`../delivery`) : même
connexion, même barre du bas (Menu · Accueil · Paniers · Commande en cours),
même tiroir latéral, mêmes composants (`components/ui.tsx`).

## Ce que fait l'application

Le paiement par carte est via Stripe ; espèces sont autorisées uniquement si le
commerce les active et pour le retrait. La présence des valeurs `PAYPAL`,
`APPLE_PAY` ou `GOOGLE_PAY` dans certains enums d'administration n'est pas un
adaptateur d'encaissement : aucun connecteur PayPal n'est fourni. La politique
CSP web et son exigence 3DS sont décrites dans
[CONFIGURATION-A16](../../../docs/CONFIGURATION-A16.md).

- **Connexion ou création de compte** (tout compte peut commander : la fiche
  client naît à la première visite). La création exige un mot de passe de
  8 caractères avec chiffre, minuscule et majuscule, et l'acceptation des
  CGU, des CGV et de la politique de confidentialité, liées au site.
- **Supprimer mon compte ZupEat** (Paramètres › Vos données) : profil, adresses,
  favoris et paniers effacés, commandes passées gardées sans lien le temps que la
  loi l'exige ; refusé pendant une commande en cours. Un compte livreur ou un
  espace commerçant sur la même adresse reste actif (c'est dit avant et après) ;
  sinon la connexion ZupOne disparaît aussi.
- **Accueil** : adresse de livraison (suggestions du serveur ou position du
  téléphone), recherche, catégories de cuisine (Pizzas, Sushis…), tri (note,
  distance, frais), commerces qui livrent à l'adresse d'abord, avec leurs frais
  et leur minimum, et les **paniers en cours**.
- **Aux couleurs de ZupEat** : l'orange de la marque (`COLORS.primary`
  `#EA580C` dans `components/ui.tsx`), et chaque commerce montré par sa
  **photo de couverture** avec son logo en pastille — ou, sans photo,
  l'illustration de sa catégorie (une pizza pour une pizzeria).
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

## Renouvellement de session A09

Les appels 401 partagent une opération de renouvellement à la fois. `POST /api/auth/refresh` envoie le refresh SecureStore et un `requestId` aléatoire cryptographique. Après une réponse perdue, le client réessaie une fois avec la même clé dans la fenêtre serveur de 10 secondes. Les erreurs réseau et les 409 persistants gardent la session ; un 401/403 définitif la termine. Tests ciblés : `npm test -- --runInBand lib/__tests__/renouvellement.test.ts`. Détails : [contrat A09](../../../docs/ROTATION-SESSIONS-A09.md).

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
components/CouvertureCommerce.tsx  photo de couverture d'un commerce, ou l'illustration de sa catégorie
components/screens/        un fichier par écran
lib/api.ts                 appels au serveur, montants, adresses des images
lib/session.ts             session et adresse de livraison (SecureStore)
lib/carts.ts               un panier par commerce (AsyncStorage)
lib/useCartSync.ts         paniers partagés avec le compte (site ↔ téléphone)
lib/stores.ts              commerces, menus, zones de livraison
lib/visuels.ts             emoji et couleurs par famille de commerce (copie de frontend/lib/visuels-familles.ts)
lib/orders.ts              commandes, statuts, suivi
lib/useCustomerRealtime.ts connexion temps réel et salons des commandes
lib/push.ts                notifications push (app « customer »)
lib/realtime.ts            abonnement aux événements et aux salons, écran par écran
```


## Contrôles complémentaires de recette — 13 octobre 2026

Vérifier sur appareil réel le checkout Stripe TEST/3DS, la reprise de session, le suivi et les erreurs réseau. Le paiement est confirmé par l'état serveur et non par un écran client.

Voir [l'état du projet](../../../docs/etat-projet.md) et [le protocole A16](../../../docs/RECETTE-PILOTE-A16-2026-10-12.md). Cette revue documentaire ne constitue pas une validation de production.
