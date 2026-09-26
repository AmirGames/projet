# Zupone Livreur

Application mobile du livreur, construite sur le même modèle que l'application
commerçant (`../merchant`) : même connexion, même barre du bas (Menu · Accueil ·
Course en cours), même tiroir latéral, mêmes composants (`components/ui.tsx`).

## Ce que fait l'application

- **Connexion** avec un compte livreur (un compte commerçant ou client est refusé).
- **Accueil** : passage en ligne / hors ligne, état du dossier tant qu'il n'est
  pas validé, **courses proposées** avec compte à rebours (accepter / refuser),
  course en cours, gains du jour et de la semaine, note, **pause** (15, 30, 60 min).
- **Course** : les quatre étapes (aller au commerce, prendre en charge, aller au
  client, remettre), **carte intégrée** qui suit le livreur en direct avec
  l'itinéraire par la route, le temps et la distance restants (OpenStreetMap et
  OSRM, sans clé ; Google Maps, Waze ou Plans restent au choix dans les
  paramètres), prise en
  charge **déverrouillée à moins de 150 m du commerce** par un curseur à glisser
  (ou « le GPS ne me situe pas »), attente tant que la commande n'est pas prête,
  **remise ouverte à l'arrivée chez le client** (moins de 150 m) : code à
  quatre chiffres du client (vérifié seul) ; **client injoignable** : appel ou
  SMS, puis **attente de 6 minutes** que le client voit sur son suivi, et
  seulement ensuite **dépôt en lieu sûr** avec photo et endroit, envoyés au
  client ; annulation avec motif.
- **Proposition de course plein écran** : trajet complet sur la carte, montant
  garanti, durée et distance totales, bouton « Accepter » qui se vide avec le
  temps de réponse.
- **Téléphone verrouillé** : la course proposée sonne 10 s et s'affiche en
  notification avec un seul bouton, **« Accepter la course »**, qui agit sans
  déverrouiller ni ouvrir l'application (Android, même application fermée ;
  iOS, application en fond). Refuser, c'est laisser passer.
- **« Tout va bien ? »** : immobile plus de 3 minutes en pleine course (hors
  commerce et client), le livreur confirme ou appelle le 112 ; le support est
  prévenu.
- **Historique** des courses (filtres, gains et kilomètres cumulés).
- **Revenus** : jour / semaine / mois, ce qui reste dû, ce qui attend le
  virement, ce qui a été versé, et les relevés.
- **Mes avis**, **Notifications**, **Support** (discussion en direct),
  **Paramètres** (thème sombre, clair ou comme le téléphone, sonnerie, application de navigation, état du GPS et des push),
  **Mon compte** (profil, véhicule, **dossier** avec envoi des pièces depuis
  l'appareil photo ou la galerie).

En direct (Socket.IO) : une course proposée sonne et vibre toutes les 5 s tant
qu'elle attend ; commande prête, course annulée, GPS perdu, fin de pause et
réponses du support arrivent sans recharger. Une notification push prévient
application fermée ; la toucher ouvre la course ou le support.

La position est envoyée à `PATCH /api/drivers/location` tant que le livreur est
en ligne ou sur une course, **même téléphone verrouillé** : avec la
localisation « Toujours autoriser », une tâche en arrière-plan
(`lib/backgroundLocation.ts`) prend le relais. Sur Android, une notification
Zupone le signale tant qu'elle tourne, et elle continue si l'application est
balayée pendant une course. Elle s'arrête hors ligne, à la déconnexion, ou
quand le serveur répond que le livreur est passé hors ligne ailleurs. Sans
« Toujours » (ou dans Expo Go), la position ne part qu'application ouverte :
l'accueil le signale et mène aux réglages du téléphone.

## Lancer

```bash
npm install
npx expo start
```

L'adresse du serveur se trouve toute seule en développement : c'est le PC qui
sert l'application (Metro), port 3001. Pour une autre machine ou la
production, définir `EXPO_PUBLIC_API_URL` (par exemple dans un fichier `.env` :
`EXPO_PUBLIC_API_URL=https://api.zupone.com`). Voir `lib/api.ts`.

Les notifications push, la localisation et l'appareil photo demandent une
**build de développement** (`npx expo run:android` ou
`npx eas-cli@latest build --profile development`) : Expo Go ne reçoit pas les
push. Le projet EAS doit être configuré (`npx eas-cli@latest init`).

## Organisation

```
app/index.tsx              écran racine : session, onglets, tiroir, bandeau
components/ui.tsx          en-tête, cartes, lignes, chargement (commun au commerçant)
components/SlideToConfirm  curseur « glisser pour valider »
components/LiveMap         carte de la course en direct (Leaflet dans une WebView)
components/screens/        un fichier par écran
lib/api.ts                 appels au serveur, format des montants
lib/session.ts             session et préférences (SecureStore)
lib/deliveries.ts          types, statuts, distances, lancement du GPS
lib/useDriverAlerts.ts     connexion temps réel et sonnerie des courses
lib/useDriverLocation.ts   suivi de la position, précision selon le moment
lib/backgroundLocation.ts  position téléphone verrouillé (tâche en arrière-plan)
lib/sessionFetch.ts        appels hors écran, jeton renouvelé au besoin
lib/push.ts                notifications push (app « delivery »)
lib/realtime.ts            abonnement aux événements, écran par écran
```
