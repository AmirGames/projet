# ZupDrive Driver App

Application **Expo/React Native** pour chauffeurs ZupDrive.

> Voir `AGENTS.md` pour les guidelines Expo générales.

## Architecture

- `app/` — Expo Router screens
- `components/screens/` — Écrans métier (dashboard, courses, profil)
- `components/ui/` — Composants réutilisables
- `lib/` — Logique (API, auth, real-time, géolocalisation)
- `assets/` — Images et logos ZupDrive

## Écrans Principaux

1. **HomeScreen** — Dashboard chauffeur
   - Courses en attente d'acceptation
   - Cours en cours / terminées
   - Revenus du jour / semaine

2. **CourseScreen** — Détail d'une course
   - Passager et destination
   - GPS du passager et du chauffeur
   - ETA automatique
   - Chat en temps réel

3. **ProfileScreen** — Profil chauffeur
   - Données personnelles
   - Véhicule et documents
   - IBAN bancaire
   - Ratings

4. **EarningsScreen** — Revenus et paiements
   - Courses complétées (prix + commission)
   - Solde hebdomadaire
   - Historique versements

## Dépendances Clés

- `expo-router` — routing
- `expo-location` — GPS (permission + tracking)
- `expo-notifications` — push notifications
- `socket.io-client` — real-time
- `@stripe/stripe-react-native` — paiements

## API Endpoints

```
POST /api/zupdrive/chauffeur/auth/otp — login par OTP
POST /api/zupdrive/courses/:id/accept — accepter course
POST /api/zupdrive/courses/:id/location — envoyer position GPS
PATCH /api/zupdrive/courses/:id — changer statut
GET /api/zupdrive/payment/earnings — revenus chauffeur
```

## Real-Time (Socket.io)

- `course-status` — changement état course
- `eta-update` — ETA mis à jour
- `driver-location` — position réceptionnée
- `chat-message` — messages passager
