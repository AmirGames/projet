# Prompt Détaillé pour ZupDrive - Application de Transport Urbain

**Objectif :** Créer une **plateforme de transport de passagers** (type Uber/Bolt) pour la Belgique

**Timeline :** Fin 2027 (12 mois)

**Phase actuelle :** 10% MVP scaffold

**Lancement prévu :** Fin 2027 avec 50+ chauffeurs et villes pilotes

---

## 1️⃣ VISION & OBJECTIFS

### Vision
ZupDrive est une **application mobile de transport urbain** qui connecte :
- 👤 **Passagers** : Demandent un trajet (point A → point B)
- 🚕 **Chauffeurs** : Acceptent les trajets et conduisent les passagers
- 💼 **Administration** : Gère la plateforme, vérifie les chauffeurs

### Objectifs Stratégiques
- 🎯 Lancer MVP fin 2027 (déjà 12 mois de planning)
- 🎯 50+ chauffeurs actifs à lancement
- 🎯 Villes pilotes : Namur, Bruxelles, Liège
- 🎯 Modèle économique stable (commission chauffeur/passager)
- 🎯 Rentabilité opérationnelle en 2028

### Cible Utilisateurs
**Passagers :**
- Travailleurs urbains (navettes quotidiennes)
- Touristes (trajets occasionnels)
- Personnes âgées (trajets réguliers)

**Chauffeurs :**
- Professionnels LVC (Licence de Transport avec Chauffeur)
- Entreprises de transport
- Conducteurs indépendants

---

## 2️⃣ ARCHITECTURE GÉNÉRALE

### Stack Technologique

```
Frontend Web (Admin)      zupone.com/zupdrive (Next.js)
                                    ↓
                          [Backend API - Express]
                          /              |         \
                         /               |          \
                        ↓                ↓           ↓
            [PostgreSQL]        [Redis]      [Stripe API]
                                    ↑
                    WebSockets (tracking temps réel)
                                    ↑
                  /                  |                  \
                 ↓                   ↓                   ↓
        [App Passager]    [App Chauffeur]    [Admin Dashboard]
        (React Native)    (React Native)     (Next.js)
```

### Domaines Métier (Backend Modules)

```
src/modules/
├── zupdrive-auth/          # Authentification chauffeurs/passagers
│   ├── registration.ts     # Inscription, vérification documents
│   ├── verification.ts     # Vérification licence, BCE, antécédents
│   └── kyc.ts             # KYC (Know Your Customer)
│
├── zupdrive-trips/         # Gestion des trajets
│   ├── trip-request.ts     # Passager demande trajet
│   ├── trip-assignment.ts  # Algorithme matching chauffeur
│   ├── trip-tracking.ts    # Suivi temps réel GPS
│   └── trip-completion.ts  # Fin du trajet
│
├── zupdrive-drivers/       # Gestion chauffeurs
│   ├── driver-profile.ts   # Profil, documents, rating
│   ├── driver-availability.ts # Statut en ligne/offline
│   ├── driver-earnings.ts  # Revenus et paiements
│   └── driver-verification.ts # Vérification continue
│
├── zupdrive-passengers/    # Gestion passagers
│   ├── passenger-profile.ts
│   ├── passenger-history.ts
│   ├── passenger-payment.ts
│   └── passenger-ratings.ts
│
├── zupdrive-matching/      # Algorithme matching
│   ├── matching-algorithm.ts # Assigner chauffeur optimal
│   ├── distance-calc.ts    # Calculs distance/durée
│   ├── surge-pricing.ts    # Tarification dynamique
│   └── pool-matching.ts    # Trajets groupés (future)
│
├── zupdrive-payments/      # Paiements
│   ├── payment-processing.ts # Stripe integration
│   ├── commission-calc.ts  # Calcul commissions
│   ├── driver-payout.ts    # Versements chauffeurs
│   └── refund-handling.ts  # Remboursements
│
├── zupdrive-maps/          # Géolocalisation
│   ├── geocoding.ts        # Adresse → coordonnées
│   ├── routing.ts          # Itinéraire optimal
│   ├── gps-tracking.ts     # Tracking chauffeur
│   └── zone-management.ts  # Zones service
│
├── zupdrive-notifications/ # Notifications
│   ├── push-notifications.ts
│   ├── sms-alerts.ts
│   ├── email-confirmations.ts
│   └── realtime-updates.ts
│
├── zupdrive-support/       # Support
│   ├── help-tickets.ts
│   ├── dispute-resolution.ts
│   └── safety-reports.ts
│
├── zupdrive-admin/         # Administration
│   ├── admin-dashboard.ts
│   ├── driver-verification.ts
│   ├── compliance.ts       # Règles légales
│   └── reporting.ts
│
└── zupdrive-analytics/     # Analytics
    ├── trip-analytics.ts
    ├── driver-analytics.ts
    └── financial-analytics.ts
```

### Modèle de Données (Prisma)

```typescript
// Users & Authentication
model User {
  id String @id @default(cuid())
  email String @unique
  password String (hashed)
  phone String
  role Role // 'passenger', 'driver', 'admin'
  createdAt DateTime @default(now())
}

// Chauffeurs
model ChauffeurDrive {
  id String @id
  userId String @unique
  user User @relation(fields: [userId])
  
  // Documents
  licenseNumber String @unique
  licenseExpiryDate DateTime
  bceNumber String @unique        // Numéro BCE (Belgique)
  insuranceCertificate String
  backgroundCheckPass Boolean
  verificationStatus 'pending' | 'verified' | 'rejected' | 'expired'
  
  // Profil
  firstName String
  lastName String
  profilePhoto String (url)
  rating Float @default(5.0)
  totalTrips Int @default(0)
  responseTime Int // ms
  cancellationRate Float
  
  // Disponibilité
  status 'offline' | 'online' | 'on_trip'
  currentLocation GeoPoint?
  serviceZones String[] // ['Namur', 'Bruxelles']
  
  // Finances
  bankAccount String (encrypted)
  earnings Money
  pendingPayouts Money
  
  createdAt DateTime
  updatedAt DateTime
}

// Passagers
model Passenger {
  id String @id
  userId String @unique
  user User @relation(fields: [userId])
  
  // Profil
  firstName String
  lastName String
  profilePhoto String (url)
  rating Float @default(5.0)
  totalTrips Int @default(0)
  
  // Adresses sauvegardées
  savedAddresses Address[]
  
  // Paiement
  paymentMethods PaymentMethod[]
  defaultPaymentMethod String?
  
  createdAt DateTime
}

// Trajets
model Trip {
  id String @id
  
  // Participants
  passengerId String
  passenger Passenger @relation(fields: [passengerId])
  driverId String?
  driver ChauffeurDrive? @relation(fields: [driverId])
  
  // Localisation
  pickupLocation GeoPoint
  pickupAddress String
  dropoffLocation GeoPoint
  dropoffAddress String
  
  // Timing
  requestedAt DateTime @default(now())
  acceptedAt DateTime?
  startedAt DateTime?
  completedAt DateTime?
  estimatedDuration Int // secondes
  actualDuration Int?
  
  // Status
  status 'requested' | 'matched' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled'
  cancellationReason String?
  cancelledBy 'passenger' | 'driver' | 'system'?
  
  // Tarification
  baseFare Money
  distanceFare Money
  timeFare Money
  surgePricing Float @default(1.0)
  discount Money @default(0)
  totalFare Money
  platformCommission Money
  driverEarnings Money
  
  // Notes & Feedback
  passengerNote String?
  driverNote String?
  passengerRating Int? // 1-5
  driverRating Int? // 1-5
  
  // Sécurité
  safetyReport String?
  reportedBy String?
  
  createdAt DateTime
  updatedAt DateTime
}

// Adresses
model Address {
  id String @id
  passengerId String
  passenger Passenger @relation(fields: [passengerId])
  
  label String // 'Home', 'Work', 'Gym'
  address String
  coordinates GeoPoint
  
  createdAt DateTime
}

// Paiements
model PaymentMethod {
  id String @id
  passengerId String
  passenger Passenger @relation(fields: [passengerId])
  
  type 'card' | 'paypal' | 'bank_transfer'
  stripePaymentMethodId String @unique
  
  isDefault Boolean
  createdAt DateTime
}

// Versements chauffeurs
model DriverPayout {
  id String @id
  driverId String
  driver ChauffeurDrive @relation(fields: [driverId])
  
  amount Money
  status 'pending' | 'processed' | 'failed'
  period String // 'week-1', 'week-2'
  sepaTransactionId String?
  
  createdAt DateTime
  processedAt DateTime?
}

// Zones de service
model ServiceZone {
  id String @id
  name String // 'Namur', 'Bruxelles'
  coordinates Polygon
  
  minFare Money
  baseFare Money
  perKmRate Money
  perMinuteRate Money
  
  createdAt DateTime
}
```

---

## 3️⃣ APPS & INTERFACES

### 1. **App Passager (Mobile - React Native)**
**URL :** `zupdrive.com` (PWA) + iOS/Android

#### Écrans Principaux
```
1. Authentication
   - Login / Register
   - Phone verification (OTP)
   - Password reset

2. Home / Request Trip
   - Map affichant position actuelle
   - Champ "Où allez-vous ?"
   - Saved addresses (Accueil, Travail)
   - Request Now / Schedule Later
   - Estimated fare display

3. Trip Matching / Waiting
   - Showing driver photo + rating
   - Driver location on map
   - ETA for driver arrival
   - Driver contact info (masked until acceptance)
   - Cancel trip option

4. In Trip
   - Real-time GPS tracking
   - Trip progress (5 min remaining)
   - Chat with driver
   - Call driver (direct or masked)
   - Driver contact + vehicle info

5. Trip Completion
   - Confirm dropoff location
   - Fare breakdown
   - Receipt (email option)
   - Rate driver (stars + comment)
   - Report issue button

6. Profile
   - Saved addresses
   - Payment methods
   - Trip history
   - Ratings & feedback
   - Help & support

7. Settings
   - Preferences (music, temperature)
   - Notifications
   - Privacy settings
   - Delete account
```

#### Features Clés
- ✅ Maps integration (Google Maps / Mapbox)
- ✅ Real-time GPS tracking
- ✅ Push notifications
- ✅ In-app chat
- ✅ Payment processing
- ✅ Rating system
- ✅ Safety features (share trip, emergency contact)

---

### 2. **App Chauffeur (Mobile - React Native)**
**URL :** `driver.zupdrive.com`

#### Écrans Principaux
```
1. Authentication / Onboarding
   - Register with documents upload
   - License verification
   - BCE number
   - Insurance proof
   - Background check consent
   - Bank account setup

2. Home / Status
   - Toggle "Online" / "Offline"
   - Current location
   - Today's earnings
   - Active trips queue
   - Acceptance rate stat

3. Trip Offers
   - Passenger request details
   - Pickup location + address
   - Dropoff location + address
   - Passenger rating + # trips
   - Est. fare & driver earnings
   - Accept / Decline buttons (countdown)

4. Accepted Trip Navigation
   - Navigation to pickup (Google Maps integrated)
   - ETA to pickup
   - Passenger location on map
   - Passenger contact + rating
   - Call / Chat with passenger

5. En Route to Dropoff
   - Navigation to dropoff
   - Trip progress
   - Passenger in car? (toggle)
   - Chat with passenger
   - Safe driving indicators

6. Earnings
   - Today's earnings
   - Weekly summary
   - Monthly statement
   - Trip breakdown (base + distance + surge)
   - Commission deduction
   - Payout schedule (weekly SEPA)

7. Profile
   - Documents status
   - Vehicle info (plate, model, color)
   - License expiry date
   - Insurance expiry date
   - Ratings & reviews
   - Photos

8. Support
   - Report issues
   - Contact support
   - FAQ
   - Rules & regulations
```

#### Features Clés
- ✅ Document verification workflow
- ✅ Trip acceptance/decline
- ✅ Real-time navigation
- ✅ Earnings tracking
- ✅ Weekly payouts (SEPA)
- ✅ Safety features (dashcam, emergency contact)
- ✅ Support & dispute resolution

---

### 3. **Admin Dashboard (Web - Next.js)**
**URL :** `zupdrive.com/admin`

#### Pages Principales
```
1. Dashboard
   - Key metrics (trips/day, revenue, drivers online)
   - Charts (utilization, revenue trend)
   - Recent trips
   - Alerts (low drivers online, etc)

2. Driver Management
   - List drivers (status, rating, earnings)
   - Approve/reject new drivers
   - View documents (license, insurance, BCE)
   - Suspend/reactivate drivers
   - Driver analytics per driver

3. Trip Management
   - View all trips
   - Filter by status, date, driver
   - Dispute resolution
   - Refund processing
   - Analytics (avg fare, distance, duration)

4. Passenger Management
   - List passengers
   - Support tickets
   - Ban suspicious accounts
   - Fraud detection alerts

5. Finance
   - Revenue dashboard
   - Driver payouts (weekly SEPA batches)
   - Commission tracking
   - Refunds & chargebacks
   - Balance sheet

6. Settings
   - Pricing rules (base fare, per km, per min)
   - Surge pricing thresholds
   - Service zones (add/edit)
   - Commission rates
   - Payment methods

7. Reports
   - Driver performance reports
   - Passenger satisfaction reports
   - Financial reports
   - Compliance reports (export)

8. Help & Support
   - Tickets system
   - Driver feedback
   - Passenger complaints
   - Ban appeals

9. Legal & Compliance
   - Documents required per zone
   - Rules & regulations
   - Privacy policy
   - Terms of service
   - GDPR compliance
```

---

## 4️⃣ FONCTIONNALITÉS CLÉS

### MVP (Fin 2027)

#### Phase 1 : Foundation (Semaines 1-8)
```typescript
// Backend
- Auth (driver + passenger login/register)
- User profiles (driver, passenger)
- Trip request → acceptance flow
- Basic GPS tracking
- Payment processing (Stripe)
- Notification system

// Frontend Apps
- Passenger: Request trip, track driver, rate driver
- Driver: Accept trips, navigate, track earnings
- Admin: Dashboard, driver management, finance

// Infrastructure
- Docker setup (PostgreSQL, Redis)
- Deployment to Scaleway
- CI/CD pipeline
```

#### Phase 2 : Full MVP (Semaines 9-16)
```typescript
// Additional Backend
- Matching algorithm (optimal driver assignment)
- Surge pricing (dynamic pricing based on demand)
- Driver verification (license, insurance, BCE)
- In-app chat
- Dispute resolution
- Weekly SEPA payouts

// Additional Frontend
- Real-time driver map
- Trip history
- Driver analytics (earnings, rating)
- Payment methods management

// Safety
- Background checks
- Ratings system
- Report abuse button
- Emergency contact sharing
```

#### Phase 3 : Polish & Launch (Semaines 17-24)
```typescript
// Features
- Email receipts
- Scheduled trips
- Favorite drivers
- Referral program (basic)

// Operations
- Driver support system
- Passenger support system
- Legal compliance (zone regulations)
- Marketing materials

// Testing
- Load testing (50+ drivers)
- E2E testing all flows
- Security audit
- Performance optimization
```

---

### Future (2028+)

- 🟡 Pool trips (passagers partagent trajet)
- 🟡 Business accounts (entreprises)
- 🟡 Scheduled/recurring trips
- 🟡 Accessibility (wheelchair accessible)
- 🟡 Premium options (Black car, etc)
- 🟡 International expansion
- 🟡 Autonomous fleet integration

---

## 5️⃣ ALGORITHME DE MATCHING (Cœur de ZupDrive)

### Objectif
Assigner le **meilleur chauffeur** à chaque trajet pour maximiser :
- ✅ Acceptance rate
- ✅ Passenger satisfaction
- ✅ Driver earnings
- ✅ Platform revenue

### Logique Matching

```typescript
// 1. Find nearby drivers
const nearbyDrivers = drivers.filter(d => 
  d.status === 'online' &&
  distance(d.location, pickup) < 5km &&
  d.acceptanceRate > 80%
);

// 2. Score each driver
interface DriverScore {
  driverId: string;
  score: number; // 0-100
  eta: number;   // secondes
  acceptance_likelihood: number;
}

function scoreDriver(driver, trip) {
  const distance_score = (1 - distance / max_distance) * 40;  // Closer = better
  const rating_score = (driver.rating / 5) * 30;              // Higher rating = better
  const eta_score = (1 - eta / max_eta) * 20;                 // Faster ETA = better
  const surge_score = driver.recent_acceptance > 90 ? 10 : 0; // Consistent = bonus
  
  return distance_score + rating_score + eta_score + surge_score;
}

// 3. Send to highest-scoring drivers
const ranked = nearbyDrivers
  .map(d => ({ ...d, score: scoreDriver(d, trip) }))
  .sort((a, b) => b.score - a.score);

// 4. Send offers with countdown (30 sec timeout)
for (const driver of ranked.slice(0, 5)) {
  sendTripOffer(driver, trip);
  if (driver.accepted()) break;
}

// 5. If no acceptance, expand search radius
if (!accepted) {
  nearbyDrivers = drivers.filter(d => distance < 10km);
  // Retry with 30 sec, then 20km, etc
}
```

### Surge Pricing

```typescript
function calculateSurgePricing(demand: number, supply: number) {
  // demand = trip requests / 5 min
  // supply = online drivers available
  
  const ratio = demand / supply;
  
  if (ratio < 0.5)       return 1.0;  // Low demand
  else if (ratio < 1.0)  return 1.2;  // Moderate
  else if (ratio < 1.5)  return 1.5;  // High
  else if (ratio < 2.0)  return 2.0;  // Very high
  else                   return 2.5;  // Extreme
}

// Applied to baseFare
finalFare = baseFare * surgePricing;
```

---

## 6️⃣ INTÉGRATIONS EXTERNES

### 1. **Google Maps API**
```typescript
// Geocoding (address → coordinates)
const { lat, lng } = await googleMaps.geocode("123 Rue de la Paix, Namur");

// Routing (A → B)
const route = await googleMaps.directions(pickup, dropoff, {
  mode: 'driving',
  alternatives: true // multiple routes
});

// Distance Matrix (many-to-many distances)
const matrix = await googleMaps.distanceMatrix({
  origins: driverLocations,
  destinations: [tripPickup],
  mode: 'driving'
});

// Place Autocomplete (search address)
const suggestions = await googleMaps.placeAutocomplete("Paris");
```

### 2. **Stripe API**
```typescript
// Create Payment Intent (passenger charges)
const intent = await stripe.paymentIntents.create({
  amount: tripFare * 100, // in cents
  currency: 'eur',
  customer: passengerId
});

// Webhook handling (payment confirmation)
POST /webhooks/stripe
- charge.succeeded → Mark trip paid
- charge.failed → Retry or fail trip

// Payout to drivers (weekly SEPA)
const payout = await stripe.payouts.create({
  amount: driverEarnings * 100,
  currency: 'eur',
  destination: bankAccountId,
  method: 'bank_account' // SEPA transfer
});
```

### 3. **Twilio (SMS Notifications)**
```typescript
// OTP for phone verification
await twilio.messages.create({
  to: '+32476123456',
  body: `Your verification code: 123456`
});

// Trip notifications
await twilio.messages.create({
  to: driverPhone,
  body: `New trip request: Namur → Bruxelles. €12.50. Accept? (Y/N)`
});
```

### 4. **Firebase / Pushy (Push Notifications)**
```typescript
// Driver gets trip offer
await pushNotification.send({
  to: driverToken,
  title: 'New Trip Available',
  body: 'Namur → Bruxelles. €12.50. Accept?',
  data: { tripId: '123' }
});
```

### 5. **SendGrid / Mailgun (Email)**
```typescript
// Trip receipt
await sendEmail({
  to: passengerEmail,
  template: 'trip-receipt',
  data: {
    driverName, fare, distance, duration, rating
  }
});
```

---

## 7️⃣ SÉCURITÉ & COMPLIANCE

### Vérification Chauffeurs (KYC)

```
1. License Verification
   ✓ Upload driver's license
   ✓ Verify expiry date
   ✓ OCR extract info (optional)

2. BCE Number (Belgique)
   ✓ Upload BCE certificate
   ✓ Verify active status
   ✓ Check company details

3. Insurance Certificate
   ✓ Upload proof of insurance
   ✓ Verify coverage includes passenger transport

4. Background Check
   ✓ Consent form signed
   ✓ Police clearance (if required)
   ✓ Criminal history check (if allowed)

5. Manual Review
   ✓ Document review by admin
   ✓ Approve / Reject
   ✓ Feedback to driver

Status: pending → verified → active
```

### Sécurité Passagers

```typescript
// Trip sharing (SOS)
const shareTrip = (trip) => {
  const trustedContact = passenger.trustedContacts[0];
  
  sendEmail(trustedContact, {
    message: `I'm on a ZupDrive trip`,
    liveLink: `zupdrive.com/track/${tripId}`,
    driverInfo: `${driver.name}, ${vehicle}`,
    eta: trip.eta
  });
};

// Emergency button
const emergencyButton = () => {
  // Contact police
  // Notify ZupDrive support
  // Stop trip
  // Alert driver (optional)
};

// Report safety issue
const reportIssue = (tripId, issue) => {
  // Issue: rash driving, harrassment, etc
  // Driver gets flagged
  // Reviewed by admin
  // Potential suspension
};
```

### Data Protection (GDPR)

```typescript
// Data encryption at rest & in transit
- Passwords: bcrypt + salt
- Sensitive fields: AES-256
- Transit: TLS 1.3

// Data retention
- Completed trips: 7 years (legal requirement)
- Inactive user data: Delete after 2 years request
- Payment records: 7 years (tax)

// User rights
- Export data (GDPR Article 15)
- Delete account (right to be forgotten)
- Dispute resolution
```

---

## 8️⃣ MODÈLE ÉCONOMIQUE

### Revenue Streams

```
Commission on each trip:
- Passenger pays: €10 (fare)
- Driver keeps: €8 (80%)
- ZupDrive takes: €2 (20%) ← Revenue

Surge pricing bonus:
- During high demand (2.0x)
- Passenger pays: €20
- Driver keeps: €16
- ZupDrive takes: €4 (also 20%)

Premium features (future):
- Priority matching (€0.50 per trip)
- Scheduled trips (€0.25 per booking)
```

### Driver Payouts

```typescript
// Weekly SEPA transfer (every Monday)
Driver weekly earnings:
- 50 trips × €8 average = €400
- Minus cancellations penalty = -€20
- Final: €380/week

SEPA transfer:
- Day: Monday 9 AM
- Frequency: Weekly
- Method: Bank transfer (automated)
- Currency: EUR
```

### Financial Goals

```
Year 1 (2027): Break-even
- 50 drivers × €1500/week average = €300k/week
- ZupDrive 20% commission = €60k/week
- Operating costs: Estimate €40k/week
- Net margin: ~33% (growth phase)

Year 2 (2028): Profitability
- Expand to 200 drivers
- Regional expansion (Wallonie)
- Net margin target: 40%+
```

---

## 9️⃣ TIMELINE & MILESTONES

### Fin 2027 (Launch)

**Trimestre 1 (8 semaines)**
- [ ] Backend MVP (auth, trips, matching, payments)
- [ ] App Passager (request, track, rate)
- [ ] App Chauffeur (accept, navigate, earnings)
- [ ] Admin dashboard (basic)

**Trimestre 2 (8 semaines)**
- [ ] Driver verification (documents, KYC)
- [ ] Surge pricing
- [ ] In-app chat
- [ ] Weekly SEPA payouts
- [ ] Load testing

**Trimestre 3 (8 semaines)**
- [ ] Beta testing (internal + friends)
- [ ] Regulatory approvals
- [ ] Marketing setup
- [ ] Driver recruitment begins
- [ ] Final QA & polish

**Launch Week**
- Soft launch in Namur (10 drivers)
- 1-week monitoring
- Scale to 50 drivers
- Expand to Bruxelles & Liège

---

## 🔟 ÉQUIPE REQUISE

| Rôle | FTE | Responsabilité |
|------|-----|-----------------|
| Backend Lead | 1 | Architecture, API, matching algo |
| Backend Dev | 1 | Features, integrations, tests |
| Frontend Lead | 0.5 | Web admin dashboard |
| Mobile Dev | 1 | Passenger + Driver apps |
| DevOps | 0.5 | CI/CD, infrastructure, scaling |
| QA/Testing | 0.5 | Testing, compliance |
| Product Manager | 0.5 | Vision, roadmap, prioritization |
| **Total** | **5 FTE** | — |

---

## 1️⃣1️⃣ RISQUES & MITIGATION

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|-----------|
| Regulatory hurdles (transport licenses) | High | Critical | Start legal review ASAP |
| Driver recruitment slower than expected | Medium | High | Begin marketing 4 months before |
| Payment processor rejects use case | Low | Critical | Test with Stripe early |
| GPS tracking reliability issues | Low | High | Use Mapbox as backup |
| Matching algorithm too slow | Low | Medium | Implement caching, optimization |
| Competition (Uber, Bolt, Bolt Food) | High | High | Focus on local service quality |
| Payment failures at scale | Low | Critical | Implement retry logic, monitoring |

---

## 1️⃣2️⃣ SUCCESS CRITERIA (Launch)

✅ **Passenger Experience**
- [ ] Request to driver arrival < 5 min
- [ ] Booking success rate > 95%
- [ ] Average rating > 4.8/5

✅ **Driver Experience**
- [ ] Earnings ≥ €15/hour
- [ ] Trip acceptance rate > 85%
- [ ] Average rating > 4.8/5

✅ **Platform Metrics**
- [ ] 50+ active drivers
- [ ] 100+ trips/day
- [ ] System uptime 99.9%
- [ ] Payment success rate 99%+

✅ **Financial**
- [ ] Commission revenue ≥ €1,000/week
- [ ] Operating costs < 70% of revenue
- [ ] Unit economics positive per trip

---

## Questions Ouvertes

1. **Régulation** : Quelle license de transport faut-il en Belgique ?
2. **Véhicule** : Les drivers utilisent leurs propres voitures ou fleet ?
3. **Assurance** : Qui paie l'assurance passagers ?
4. **Zones** : Commencer uniquement Namur ou simultanément 3 villes ?
5. **Promo** : Budget marketing pour recruter drivers ?
6. **Support** : Support 24/7 ou heures réduites au launch ?
7. **Competition** : Stratégie face à Uber/Bolt/Bolt Food ?

---

**Responsable :** À assigner
**Status :** À commencer (Q1 2027)
**Next Step :** Vérifier régulations belges transport passagers
