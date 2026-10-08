# ZupDrive Passenger App

Application **Expo/React Native** pour passagers ZupDrive.

## Architecture

- `app/` — Expo Router screens
- `components/screens/` — Écrans passager (recherche, suivi, profil)
- `components/ui/` — Composants réutilisables
- `lib/` — Logique (API, auth, real-time, paiements)
- `assets/` — Images et logos ZupDrive

## Écrans Principaux

1. **HomeScreen** — Accueil
   - Champ recherche (départ → destination)
   - Historique recherches
   - Courses recommandées

2. **OfferScreen** — Devis et acceptation
   - Chauffeur assigné
   - Prix (base + surge)
   - Temps d'arrivée
   - Choix paiement (CB ou espèces)

3. **TrackingScreen** — Suivi en temps réel
   - Position chauffeur GPS
   - ETA actualisée
   - Chat avec chauffeur
   - SOS urgence

4. **ProfileScreen** — Profil passager
   - Données personnelles
   - Moyens de paiement
   - Adresses favorites
   - Ratings chauffeurs

5. **HistoryScreen** — Historique courses
   - Courses complétées
   - Tarifs payés
   - Ratings et commentaires

## Dépendances Clés

- `expo-router` — routing
- `expo-location` — géolocalisation
- `expo-notifications` — notifications
- `socket.io-client` — real-time tracking
- `@stripe/stripe-react-native` — paiement CB

## API Endpoints

Toutes sous `/api/zupdrive`, avec le compte ZupOne du passager (couche `lib/courses.ts`) :

```
POST /courses/devis           — prix fixe d'un trajet (devis signé, 10 min)
POST /courses                 — commander le devis (cleIdempotence : rejouable)
GET  /courses                 — mes trajets
GET  /courses/:id             — un trajet, son chauffeur et son paiement
POST /courses/:id/annuler     — tant que le passager n'est pas à bord
POST /courses/:id/note        — noter son chauffeur (course terminée)
POST /payment/intent          — { courseId } seulement, jamais le montant
```

Le prix vient toujours du serveur ; « payé » n'apparaît que quand le serveur le dit (webhook Stripe), pas quand la carte est acceptée sur le téléphone. Le suivi se relit toutes les 4 s (`RELECTURE_MS`).

## Real-Time (Socket.io)

- `driver-location-update` — position chauffeur
- `course-status` — changement état
- `eta-update` — nouvel ETA
- `driver-arrived` — chauffeur arrivé
- `chat-message` — messages chauffeur
- `alert` — notifications urgentes
