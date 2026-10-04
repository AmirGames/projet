# ZupEat Livreur

Application mobile du livreur, construite sur le même modèle que l'application
commerçant (`../merchant`) : même connexion, même barre du bas (Menu · Accueil ·
Course en cours), même tiroir latéral, mêmes composants (`components/ui.tsx`).

**Préparation au 4 octobre 2026 :** dépendances Expo SDK 57 alignées,
TypeScript validé et lint sans erreur (30 avertissements). Un APK Android ARM64
de test a été compilé ; les profils EAS visent le VPS.
Firebase Android est intégré et la clé FCM V1 est attribuée dans Expo.
L'opérateur confirme la réception des push sur son Android. La version 1.0.1
ajoute une fenêtre native « Nouvelle course » et une sonnerie avec le volume
des alarmes ; ces deux fonctions restent à essayer sur son téléphone.
Voir [le compte rendu de validation](VALIDATION.md).

Le logo bleu « Z Delivery ZupEat » choisi le 4 octobre est utilisé comme
icône de l'application et sur l'écran de démarrage.

## Ce que fait l'application

- **Connexion** avec un compte livreur (un compte commerçant ou client est refusé),
  et **inscription** dans l'application : le compte attend la validation de la
  plateforme, les pièces s'envoient depuis « Mon compte ».
- **Accueil** : passage en ligne / hors ligne, état du dossier tant qu'il n'est
  pas validé, **courses proposées** avec compte à rebours (accepter / refuser),
  course en cours, gains du jour et de la semaine, note, **pause** (15, 30, 60 min).
- **Course** : les quatre étapes (aller au commerce, prendre en charge, aller au
  client, remettre), **carte intégrée** qui suit le livreur en direct avec
  l'itinéraire par la route, le temps et la distance restants, et en plein
  écran le **guidage virage par virage** (flèche, distance jusqu'à la
  manœuvre, consigne, la suivante, toutes les étapes d'un toucher ; avance seul
  avec le GPS, brève vibration à chaque manœuvre faite) et ses **annonces
  vocales** (« Dans 200 mètres, tournez à droite », rappel à 400 m, puis au
  moment de tourner ; bouton 🔊 sur le bandeau et réglage dans les
  paramètres, avec **« Tester la voix »** qui dit quoi faire si le téléphone
  n'a pas de voix française ; l'écran reste allumé tant que la carte plein
  écran est ouverte) (OpenStreetMap et
  OSRM, sans clé ; Google Maps, Waze ou Plans restent au choix dans les
  paramètres), prise en
  charge **déverrouillée à moins de 150 m du commerce** par un curseur à glisser
  (ou « le GPS ne me situe pas »), attente tant que la commande n'est pas prête,
  **remise ouverte à l'arrivée chez le client** (moins de 150 m) : code à
  quatre chiffres du client (vérifié seul) ; **client injoignable** : appel ou
  SMS, puis **attente de 6 minutes** que le client voit sur son suivi, et
  seulement ensuite **dépôt en lieu sûr** avec photo et endroit, envoyés au
  client ; annulation avec motif.
- **Fin de course** : ce que la course a rapporté, la distance, la durée, les
  heures (acceptée, récupérée, livrée), la façon dont elle a été remise et les
  gains du jour ; retour à l'accueil au bout de 20 s (ou tout de suite), sauf
  si le livreur touche l'écran. Depuis l'historique, le même récapitulatif,
  sans retour automatique.
- **Jusqu'à 3 courses à la fois** : un **lot** de commandes qui vont au même
  endroit (même commerce ou commerce sur le trajet, clients à moins de 2 km
  les uns des autres ou sur le trajet) se propose d'un bloc, un seul
  « Accepter » pour tout ; une course **« sur votre trajet »** peut s'ajouter
  pendant une course. L'onglet « Course en cours » devient alors une
  **tournée** : les arrêts dans l'ordre (le serveur le calcule, un retrait
  avant sa remise), le prochain en tête ; chaque course se prend et se remet
  comme une course seule, et l'écran de fin mène à la suivante.
- **Proposition de course plein écran** : trajet complet sur la carte, montant
  garanti, durée et distance totales, bouton « Accepter » qui se vide avec le
  temps de réponse.
- **Téléphone verrouillé** (à valider sur le nouvel APK Firebase) : la course proposée sonne 10 s et s'affiche en
  notification avec un seul bouton, **« Accepter la course »**, qui agit sans
  déverrouiller ni ouvrir l'application (Android, application en arrière-plan ;
  iOS, application en fond). Refuser, c'est laisser passer.
- **« Tout va bien ? »** : immobile plus de 3 minutes en pleine course (hors
  commerce et client), le livreur confirme ou appelle le 112 ; le support est
  prévenu.
- **Historique** des courses (filtres, gains et kilomètres cumulés).
- **Revenus** : jour / semaine / mois, ce qui reste dû, ce qui attend le
  virement, ce qui a été versé, et les relevés.
- **Mes avis**, **Notifications**, **Support** (discussion en direct),
  **Paramètres** (thème sombre, clair ou comme le téléphone, sonnerie, application de navigation, annonces vocales, état du GPS et des push),
  **Mon compte** (profil, véhicule, **dossier** avec envoi des pièces depuis
  l'appareil photo ou la galerie).

En direct (Socket.IO) : une course proposée sonne et vibre toutes les 5 s tant
qu'elle attend ; commande prête, course annulée, GPS perdu, fin de pause et
réponses du support arrivent sans recharger. Une notification push prévient
application fermée ; la toucher ouvre la course ou le support.

**Sans réseau** (sous-sol, cage d'escalier, zone blanche), la course continue.
Elle s'affiche depuis le téléphone (la dernière version reçue), et **la prise en
charge, la remise au code et le dépôt avec photo** sont enregistrés sur place
puis envoyés seuls au retour du réseau, dans l'ordre et avec l'heure réelle
(`effectueLe`). Un code saisi hors connexion ne se vérifie qu'à ce moment-là
(il n'est jamais sur le téléphone) : refusé, le livreur est prévenu par une
notification et sur l'écran de la course. Restent en ligne seulement :
accepter une course, lancer l'attente du client (il doit être prévenu),
annuler, passer en ligne. La déconnexion efface du téléphone la course et les
envois en attente (après confirmation s'il en reste).

La position est envoyée à `PATCH /api/drivers/location` tant que le livreur est
en ligne ou sur une course, **même téléphone verrouillé** : avec la
localisation « Toujours autoriser », une tâche en arrière-plan
(`lib/backgroundLocation.ts`) prend le relais. Sur Android, une notification
ZupEat le signale tant qu'elle tourne. Après retrait de l'application des
applications récentes, sa continuité dépend du téléphone et doit être testée ;
un arrêt forcé interrompt le suivi. Elle s'arrête hors ligne, à la déconnexion, ou
quand le serveur répond que le livreur est passé hors ligne ailleurs. Sans
« Toujours » (ou dans Expo Go), la position ne part qu'application ouverte :
l'accueil le signale et mène aux réglages du téléphone.

## Lancer

Utiliser Node.js 22.13 ou supérieur et les dépendances verrouillées du dépôt.

```bash
npm ci
npm run typecheck
npm run lint
npx expo start --dev-client
```

L'adresse du serveur se trouve toute seule en développement : c'est le PC qui
sert l'application (Metro), port 3001. Pour une autre machine ou la
production, définir `EXPO_PUBLIC_API_URL` (par exemple dans un fichier `.env` :
`EXPO_PUBLIC_API_URL=https://api.zupeat.com`). Voir `lib/api.ts`.

Pour tester les notifications push et la localisation en arrière-plan,
installer une **build de développement** (`npx expo run:android` ou
`npx eas-cli@latest build --profile development --platform android`).
`expo-dev-client` est installé ; Expo Go ne valide pas ces fonctions.
Le projet EAS est déjà référencé dans `app.json` :
`face34d3-1569-4bfa-ab6f-2b830dffa311`. L'accès au projet
`@zupone/zupeat-delivery` est confirmé. Firebase `zupeat-a1e82` est créé et
l'application Android y est enregistrée. Son fichier `google-services.json`
est intégré et relié dans `app.json` ; la clé FCM V1 est attribuée à Expo.
Voir [la configuration push](PUBLICATION.md#4-notifications-push).

Pour viser le VPS avec Metro, définir dans `.env` :

```dotenv
EXPO_PUBLIC_API_URL=https://api.zupeat.com
EXPO_PUBLIC_SITE_URL=https://zupeat.com
```

Ces deux adresses sont aussi fixées dans les trois profils de `eas.json`.
Les fichiers Android/iOS sont générés par Expo ; les réglages natifs se font
dans `app.json`, ses plugins et le module local `modules/course-alerts`.

## Alertes Android sur les autres écrans

Installer le nouvel APK indiqué dans [VALIDATION.md](VALIDATION.md), puis dans
**Paramètres › Courses proposées** :

1. Activer **Fenêtre Nouvelle course** et autoriser l'affichage au-dessus des
   autres applications dans l'écran Android qui s'ouvre.
2. Activer **Sonner même en silencieux**, en gardant « Sonnerie et vibration »
   activée. Régler le **volume des alarmes** au-dessus de zéro.
3. Toucher **Tester la fenêtre dans 5 s**, puis ouvrir une autre application
   ou verrouiller le téléphone. Le test disparaît après 15 s ; ses boutons
   n'acceptent ni ne refusent de vraie course.
4. Avec un compte validé en ligne, essayer ensuite une vraie proposition,
   l'acceptation, le refus et l'expiration sur les deux écrans.

Ces deux options sont désactivées par défaut. Le son utilise `USAGE_ALARM`
sans modifier le volume système, le mode silencieux ou « Ne pas déranger ».
Un volume d'alarme nul et un mode « Ne pas déranger » qui bloque les alarmes
restent silencieux. Si Android empêche la fenêtre ou le service, la push
habituelle reste disponible. L'arrêt forcé de l'application et les restrictions
d'arrière-plan de certains téléphones doivent être vérifiés sur appareil.

La tâche Expo existante reçoit la push, relit `/api/drivers/offers` avec la
session chiffrée et n'affiche que la proposition encore valable pour ce compte.
La fenêtre expose le commerce, les villes, le montant, le délai et les actions ;
elle ne déverrouille pas le téléphone. Les adresses et l'espace du compte ne
sont pas affichés sur le verrouillage. Accepter/refuser réutilise la tâche Expo
et les endpoints existants, sans jeton enregistré dans les sources natives.
L'alerte expire automatiquement et les réglages sont coupés hors ligne ou à
la déconnexion. Aucun changement serveur n'est nécessaire pour cette fonction.

Contrôler les données des push, l'expiration et les lots : `npm run test:alerts`
(testé avec Node 24.21.0 et l'exécution directe de TypeScript).

## Publier

Tout est décrit dans [PUBLICATION.md](PUBLICATION.md) : configuration EAS
(`eas.json`), comptes Apple et Google, notifications push, builds, fiches
et déclarations des stores.

## Organisation

```
app/index.tsx              écran racine : session, onglets, tiroir, bandeau
components/ui.tsx          en-tête, cartes, lignes, chargement (commun au commerçant)
components/SlideToConfirm  curseur « glisser pour valider »
components/LiveMap         carte de la course en direct (Leaflet dans une WebView)
components/screens/        un fichier par écran (TourneeScreen : plusieurs courses)
lib/api.ts                 appels au serveur, format des montants
lib/session.ts             session et préférences (SecureStore)
lib/deliveries.ts          types, statuts, distances, lancement du GPS
lib/useDriverAlerts.ts     connexion temps réel et sonnerie des courses
lib/courseAlerts.ts        réception en arrière-plan et validation de la proposition
modules/course-alerts/     écran Android verrouillé et sonnerie des alarmes
lib/useDriverLocation.ts   suivi de la position, précision selon le moment
lib/backgroundLocation.ts  position téléphone verrouillé (tâche en arrière-plan)
lib/sessionFetch.ts        appels hors écran, jeton renouvelé au besoin
lib/network.ts             réseau présent ou non (téléphone et appels ratés)
lib/outbox.ts              étapes faites sans réseau, envoyées au retour
lib/offlineStore.ts        course et accueil gardés sur le téléphone
lib/push.ts                notifications push (app « delivery »)
lib/realtime.ts            abonnement aux événements, écran par écran
```
