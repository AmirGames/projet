# ZupDrive Passenger App

Application **Expo/React Native** pour passagers ZupDrive.

## Architecture

- `app/` — Expo Router
  - `_layout.tsx` : `AuthProvider` + `Stack.Protected` (sans session, seul `connexion` existe)
  - `connexion.tsx` : e-mail + mot de passe (`POST /api/auth/login`, compte ZupOne)
  - `(onglets)/index.tsx` **Commander** : départ/arrivée (`ChampAdresse`), devis, bouton Commander
  - `(onglets)/historique.tsx` : `mesTrajets` ; `(onglets)/profil.tsx` : déconnexion
  - `trajet/[id].tsx` **Suivi** : relu toutes les 4 s, statut, chauffeur, carte, annulation, note, paiement
- `components/` — `ChampAdresse` (suggestions `GET /api/addresses/search`), `LiveMap`, `ui`
- `lib/` — `courses.ts` (dont `creerIntentionPaiement`) (API des trajets), `adresses.ts`, `auth.tsx`, `paiement.ts` (`etatPaiementTrajet`, pure), `statuts.ts`, `confirmer.ts`
- Les écrans et la logique hérités de l'app client ZupEat (panier, commande, commerces, temps réel, adresses favorites, changement de mot de passe…) ont été supprimés ; ils restent dans l'historique git.

## Règles des écrans

- **Prix** : celui du devis signé du serveur, renvoyé tel quel ; aucun calcul dans l'app. Une clé d'idempotence (`cleAleatoire`) par devis, gardée tant que le devis ne change pas ; `QUOTE_EXPIRED` redemande un devis et le dit.
- **Adresse** : une suggestion sans coordonnées ni code postal est refusée (`adresseTrajet`).
- **Suivi** : la relecture s'arrête quand le trajet n'est plus actif, que l'écran perd le focus ou que l'app passe en arrière-plan. Une coupure réseau garde le trajet affiché ; une 401 est gérée par `apiFetch` (renouvellement), la déconnexion n'a lieu que si le serveur refuse le renouvellement.
- **Paiement** : « payé » seulement si `paiement.statut === 'SUCCEEDED'` (webhook). Remboursement et « remboursé » affichés pour une course `ANNULEE`/`SANS_CHAUFFEUR` payée. Le formulaire de carte (`components/PaiementCarte.tsx`, natif ; `.web.tsx` sur le web) apparaît quand `etatPaiementTrajet` vaut `a_payer` : `POST /api/zupdrive/payment/intent { courseId }` (jamais le montant) puis `confirmPayment`. Carte acceptée = « Paiement envoyé, confirmation en cours… », jamais « payé ». La clé publique Stripe vient du serveur (`GET /api/payments/config`, comme l'app client et le site) : aucune variable `EXPO_PUBLIC_…` ni clé en dur.
- **Tests** : `npm test` (Jest + ts-jest, fonctions pures de `lib/*.test.ts`, ex. `paiement.test.ts`).
- **Adresses favorites** : raccourcis « Domicile / Travail » dans `ChampAdresse`, « Enregistrer comme… » après le choix d'une adresse.
- **SOS** (`components/BoutonSos.tsx`) : visible pendant `ACCEPTEE`/`ARRIVEE`/`EN_COURS` ; numéros 17 et 112 d'abord, puis « Alerter ZupDrive » (confirmation, position du téléphone si autorisée). Le texte dit ce que le **serveur** a réellement envoyé (`equipePrevenueLe`, `contactPrevenuLe`) et ne promet aucune intervention. Personne de confiance : carte du profil, avec case de consentement.
- Couleur : bleu ZupDrive (`COLORS.primary`), thème clair.
- Pas de notifications push pour l'instant : `POST /api/push-devices` n'accepte que `app` = `merchant`, `delivery`, `customer` (voir `registerForPush` dans `lib/push.ts`, non branché).
- Sur le web (`npm run web`), `expo-secure-store` n'existe pas : la session n'y survit pas à un rechargement. Sur téléphone, elle est conservée.

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
GET  /adresses                — mes adresses Domicile / Travail
PUT  /adresses/:type          — enregistrer (DOMICILE | TRAVAIL), DELETE pour retirer
POST /sos                     — alerte SOS d'un trajet en cours ({ courseId, latitude?, longitude? })
GET|PUT|DELETE /sos/contact   — personne de confiance (PUT : consentement: true)
POST /payment/intent          — { courseId } seulement, jamais le montant
```

Le prix vient toujours du serveur ; « payé » n'apparaît que quand le serveur le dit (webhook Stripe), pas quand la carte est acceptée sur le téléphone. Le suivi se relit toutes les 4 s (`RELECTURE_MS`).

## Real-Time (Socket.io) — prévu, non branché (le suivi se relit toutes les 4 s)

- `driver-location-update` — position chauffeur
- `course-status` — changement état
- `eta-update` — nouvel ETA
- `driver-arrived` — chauffeur arrivé
- `chat-message` — messages chauffeur
- `alert` — notifications urgentes
