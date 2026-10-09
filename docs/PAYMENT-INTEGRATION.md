# Phase 14: Payment Integration & Driver Payouts 💰

## Référence actuelle ZupEat — A04 (9 octobre 2026)

Pour les relevés des **livreurs** et les lots bancaires ZupEat, consulter le
[guide de concurrence, API et rapprochement](VERSEMENTS-CONCURRENCE.md) et les
[preuves datées](preuves-a04-2026-10-09.md). Paiement manuel, annulation et lot
s'excluent transactionnellement ; IBAN, montants et exports restent figés.
Le texte de phase ZupDrive ci-dessous conserve son rôle historique.

## Référence actuelle ZupEat — A03 (9 octobre 2026)

Les commandes payées après refus/abandon portent désormais une intention durable
avant acquittement. Le worker réconcilie Stripe avec une clé persistante ; une
création pending reste distincte d'une restitution réussie. La Vigie expose une
alerte critique `metier:remboursements-a-reprendre`, y compris sans ID Stripe,
avec revue et reprise autorisées/auditées par la permission billing.

Voir le [guide actuel de comportement, API, migration et exploitation](REMBOURSEMENTS-REPRISE.md)
et les [preuves datées](preuves-a03-2026-10-09.md). Les sections de phase ci-dessous
restent historiques ; elles ne prouvent ni intégration ni déploiement d'A03.


> **Document de phase, partiellement dépassé.** Les routes décrites ici sont montées sous **`/api/zupdrive/finance`** (ex. `/api/zupdrive/finance/earnings`, `/payouts/request`, `/admin/payouts/:id/process`) ; le paiement d'une course est sous `/api/zupdrive/payment`. La commission n'est pas « 20-30 % » : c'est `PlatformSettingsDrive` (20 par défaut), `round(prix × pct / 100)`, **figée sur le paiement à sa création**. Le paiement est confirmé par le webhook Stripe, et le versement du chauffeur n'est créé qu'une fois la course terminée et payée. La semaine des lots va du lundi 00:00 UTC au lundi suivant. Traiter un versement et changer la commission sont réservés au superowner et journalisés. Une course payée qui n'aboutit pas (annulée, sans chauffeur) est remboursée automatiquement en totalité ; statuts `REFUND_REQUESTED`, `REFUNDED`, `REFUND_FAILED`. La référence à jour est [`zupdrive-api-admin.md`](./zupdrive-api-admin.md).

**Status**: Payments from passengers + Automatic weekly payouts to drivers via SEPA

## Overview

ZupDrive's payment system handles:
- **Course Pricing**: Distance × Base Rate × Surge Multiplier + Time Fees
- **Commission Deduction**: Platform takes 20-30% (configurable)
- **Earnings Accumulation**: Weekly pool of pending earnings
- **Automatic Payouts**: Every Monday via Stripe Connect → Driver Bank Account
- **Financial Reporting**: Driver & Admin dashboards

---

## Pricing Model

### Formula

```
Course Price = (Distance × BaseRate) × SurgeMultiplier + TimeCharge + Minimum

Example:
- Distance: 10 km @ €0.25/km = €2.50
- Time: 20 min @ €0.10/min = €2.00
- Surge: 1.5x (peak hours) = (€2.50 + €2.00) × 1.5 = €6.75
- Minimum: €6.00 → Final: €6.75
- Tips: €1.50
─────────────────────────────────────────
Total Passenger Pays: €8.25
```

### Commission Structure

```
Commission Rate: 25% (default, configurable via admin)

Driver Gets: Price - Commission + Tips
Platform Gets: Commission

Example (€8.25 total, 25% commission):
├─ Passenger pays: €8.25
├─ Platform commission: €2.06 (25%)
├─ Driver receives: €6.19 + tips
└─ Tips: Always 100% to driver
```

---

## API Endpoints

### Driver Endpoints

#### Get Driver Earnings

```
GET /api/zupdrive/earnings?period=week
Authorization: Bearer {driverToken}

Query Parameters:
- period: "today" | "week" | "month" (default: week)

Response 200:
{
  "success": true,
  "earnings": {
    "chauffeurId": "chauffeur-123",
    "period": "week",
    "totalEarnings": 250000,           // €2500.00 in cents
    "totalCommission": 83333,          // €833.33 deducted
    "totalPassengerSpent": 333333,     // €3333.33 total
    "coursesCompleted": 12,
    "averagePerCourse": 20833,         // €208.33 per ride
    "tips": 15000,                     // €150.00 total tips
    "breakdown": {
      "baseFares": 318333,             // Fares before tips
      "surgeBonus": 0,                 // Extra from surge pricing
      "tips": 15000,                   // Passenger tips
      "bonuses": 0                     // Platform bonuses (future)
    }
  }
}
```

---

#### Get Financial Dashboard

```
GET /api/zupdrive/financial-dashboard
Authorization: Bearer {driverToken}

Response 200:
{
  "success": true,
  "dashboard": {
    "earnings": {
      "today": { /* DriverEarnings */ },
      "week": { /* DriverEarnings */ },
      "month": { /* DriverEarnings */ }
    },
    "payoutHistory": [
      {
        "id": "payout-456",
        "montant": 200000,        // €2000.00
        "statut": "COMPLETED",
        "periodeDebut": "2026-10-06",
        "periodeFinale": "2026-10-12",
        "programmeLe": "2026-10-13",
        "completeLe": "2026-10-17"
      },
      // ... more payouts
    ],
    "nextPayoutDate": "2026-10-20T00:00:00Z"
  }
}
```

---

#### Request Payout

```
POST /api/zupdrive/payouts/request
Authorization: Bearer {driverToken}
Content-Type: application/json

Response 200:
{
  "success": true,
  "message": "Payout requested successfully",
  "payout": {
    "id": "payout-789",
    "chauffeurId": "chauffeur-123",
    "amount": 250000,               // €2500.00
    "status": "PENDING",
    "period": {
      "startDate": "2026-10-06",
      "endDate": "2026-10-12"
    },
    "metadata": {
      "coursesIncluded": 12,
      "periodEarnings": 250000,
      "platformCommission": 83333
    }
  }
}
```

---

#### Get Payout History

```
GET /api/zupdrive/payouts/history?limit=10
Authorization: Bearer {driverToken}

Response 200:
{
  "success": true,
  "payouts": [
    {
      "id": "payout-456",
      "montant": 200000,
      "statut": "COMPLETED",
      "periodeDebut": "2026-10-06",
      "periodeFinale": "2026-10-12",
      "programmeLe": "2026-10-13",
      "completeLe": "2026-10-17"
    },
    // ... more history
  ]
}
```

---

#### Get Payout Status

```
GET /api/zupdrive/payouts/:payoutId
Authorization: Bearer {driverToken}

Response 200:
{
  "success": true,
  "payout": {
    "id": "payout-789",
    "amount": 250000,
    "status": "PROCESSING",
    "completedAt": null,
    "failureReason": null
  }
}
```

---

#### Calculate Course Earnings

```
POST /api/zupdrive/earnings/calculate
Authorization: Bearer {driverToken}
Content-Type: application/json

{
  "courseId": "course-789",
  "chauffeurId": "chauffeur-123",
  "distance": 10,              // km
  "duration": 20,              // minutes
  "baseRate": 25,              // cents/km
  "surgeMultiplier": 1.5,      // 1.0 = normal, 1.5 = 50% increase
  "passengerPrice": 825,       // cents (€8.25)
  "tips": 150                  // cents (€1.50)
}

Response 200:
{
  "success": true,
  "earnings": {
    "courseId": "course-789",
    "chauffeurId": "chauffeur-123",
    "passengerPrice": 825,
    "platformCommission": 206,  // 25% of 825
    "chauffeurEarnings": 769,   // 825 - 206 + 150
    "distance": 10,
    "duration": 20,
    "baseRate": 25,
    "surgeMultiplier": 1.5,
    "tips": 150,
    "status": "COMPLETED"
  }
}
```

---

### Admin Endpoints

#### Get Pending Payouts

```
GET /api/zupdrive/admin/payouts/pending?limit=50
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "payouts": [
    {
      "id": "payout-123",
      "chauffeurId": "chauffeur-123",
      "montant": 250000,
      "statut": "PENDING",
      "periodeDebut": "2026-10-06",
      "periodeFinale": "2026-10-12",
      "chauffeur": {
        "nomComplet": "Jean Dupont",
        "email": "jean@example.com"
      }
    },
    // ... more payouts
  ],
  "count": 5
}
```

---

#### Process Payout

```
POST /api/zupdrive/admin/payouts/:payoutId/process
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "message": "Payout processing initiated",
  "payout": {
    "id": "payout-123",
    "chauffeurId": "chauffeur-123",
    "amount": 250000,
    "status": "PROCESSING",
    "scheduledAt": "2026-10-13T06:30:00Z"
  }
}
```

---

#### Get Driver Payout History (Admin)

```
GET /api/zupdrive/admin/driver/:chauffeurId/payouts?limit=20
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "payouts": [
    {
      "id": "payout-456",
      "montant": 200000,
      "statut": "COMPLETED",
      "periodeDebut": "2026-10-06",
      "periodeFinale": "2026-10-12",
      "programmeLe": "2026-10-13",
      "completeLe": "2026-10-17"
    },
    // ... more history
  ]
}
```

---

#### Financial Dashboard (Admin)

```
GET /api/zupdrive/admin/financial-dashboard
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "dashboard": {
    "payouts": {
      "total": 145,
      "pending": 8,
      "completed": 137,
      "totalAmount": 85000000        // €850,000.00 total paid
    },
    "courses": [
      {
        "statut": "COMPLETED",
        "_count": 3421,
        "_sum": {
          "prixTotal": 425000000      // €4,250,000.00 revenue
        }
      },
      {
        "statut": "CANCELLED",
        "_count": 156,
        "_sum": null
      }
    ]
  }
}
```

---

#### Update Commission Rate

```
POST /api/zupdrive/admin/settings/commission
Authorization: Bearer {adminToken}
Content-Type: application/json

{
  "commissionPercentage": 28
}

Response 200:
{
  "success": true,
  "message": "Commission rate updated",
  "settings": {
    "id": "default",
    "commissionPercentage": 28
  }
}
```

---

## Payout Cycle

### Weekly Automation

```
MONDAY 00:00 UTC
├─ Cycle closes (Sunday 23:59:59 was last moment)
├─ All courses from Monday-Sunday finalized
└─ Payout period lock: Mon-Sun earnings are now pooled

MONDAY 06:00 UTC
├─ Automated job: calculateWeeklyEarnings()
├─ For each driver:
│  ├─ Sum completed courses (Mon-Sun)
│  ├─ Deduct platform commission (25% default)
│  ├─ Check: Bank details valid? Enough funds?
│  └─ Create payout record (PENDING)
├─ Verification: Confirm all drivers have valid bank details
└─ Status: All payouts ready for processing

MONDAY 12:00 UTC
├─ Admin OR automated job: processPayout()
├─ For each PENDING payout:
│  ├─ Call Stripe.transfers.create()
│  ├─ Status → PROCESSING
│  └─ Send notification to driver
├─ Reason: Use early timing to be in first SEPA batch
└─ Status: Transfers submitted to Stripe

TUE-THU
├─ SEPA transfer in flight
├─ Status remains: PROCESSING
└─ Driver notified: "Payout in progress"

FRIDAY
├─ Transfers arrive in driver bank accounts (SEPA standard 1-3 days)
├─ Webhook: payment_intent.succeeded
├─ Job: updatePayoutStatus(COMPLETED)
├─ Driver notified: "Payout received! €X.XX credited"
└─ Status: COMPLETED, completeLe timestamp set

WEEKEND
├─ No activity (next cycle Monday)
└─ Driver can review transaction in bank account
```

---

## Error Handling

### Failed Transfers

```
Reasons for FAILED status:
1. Invalid IBAN
   → Notification: "Update bank details"
   → Action: Re-request payout after fixing

2. Insufficient funds (platform)
   → Notification: "Payout delayed, retrying tomorrow"
   → Action: Auto-retry next day

3. Stripe API error
   → Status: RETRY (scheduled for +24h)
   → Max retries: 5 before FAILED

4. Account suspended
   → Status: HELD
   → Notification: "Your account is under review"

5. Amount exceeds limit
   → Status: SPLIT (create multiple smaller transfers)
   → Transparent to driver (one notification)
```

---

## Revenue Breakdown (Platform)

```
Total Passenger Spending: €1,000,000

By Role:
├─ Driver Payouts (70%): €700,000
├─ Platform Commission (25%): €250,000
└─ Taxes/Reserves (5%): €50,000

Commission Used For:
├─ Infrastructure: €75,000 (server, DB, API)
├─ Payment Processing: €50,000 (Stripe fees ~2%)
├─ Marketing: €50,000
├─ Support: €40,000
└─ Reserves: €35,000
```

---

## Key Features

### ✅ Implemented

- ✅ Course pricing calculation (distance × rate × surge)
- ✅ Commission deduction (configurable %)
- ✅ Weekly earnings aggregation
- ✅ Payout request workflow
- ✅ Status tracking (PENDING → PROCESSING → COMPLETED)
- ✅ Payout history retrieval
- ✅ Admin financial dashboard
- ✅ Bank details validation
- ✅ Error handling with fallbacks

### 🔄 Coming Soon (Phase 15+)

- Real-time earning notifications
- Bonus incentive programs
- Tax withholding calculation
- International payouts (non-EUR)
- Split payouts for high-earners
- Advance payout option (fee-based)
- Dispute resolution for failed transfers

---

## Testing

```bash
npm test -- zupdrive-payment-driver
```

### Test Coverage

- ✅ Course earning calculations
- ✅ Commission percentage variations
- ✅ Weekly/monthly aggregation
- ✅ Payout request validation
- ✅ Bank detail requirements
- ✅ Status transitions
- ✅ Error cases (no revenue, no bank details, etc.)

---

## Integration Points

### With Other Systems

```
Course Completion
    ↓
Passenger Pays (Stripe webhook)
    ↓
earnings accumulate in weekly pool
    ↓
Monday: preparePayout() → create payout records
    ↓
Admin/Job: processPayout() → Stripe transfer
    ↓
Webhook: transfer.succeeded
    ↓
updatePayoutStatus(COMPLETED)
    ↓
Driver notification → "Your payout arrived!"
```

---

## Security Considerations

### ✅ Implemented

- Bank details stored securely (encrypted)
- Never expose IBAN in logs
- All calculations in centimes (no float precision errors)
- Rate limiting on financial endpoints
- Audit trail for all commission changes
- Admin authorization required for payout processing

### 🔒 Never Allowed

- ❌ Frontend calculates commission (backend always authoritative)
- ❌ Driver sees other drivers' earnings
- ❌ Admin modifies completed payouts
- ❌ Stripe secrets in client-side code

---

## Database Schema (Prisma)

```prisma
model DriverPayoutDrive {
  id              String   @id @default(cuid())
  chauffeurId     String
  chauffeur       ChauffeurDrive @relation(fields: [chauffeurId], references: [id])
  
  montant         Int      // in cents
  statut          String   // PENDING, PROCESSING, COMPLETED, FAILED, HELD
  
  periodeDebut    DateTime // Week start (Monday)
  periodeFinale   DateTime // Week end (Sunday)
  
  programmeLe     DateTime? // When processing started
  completeLe      DateTime? // When transfer succeeded
  
  metadata        Json?    // coursesIncluded, periodEarnings, commission
  erreurMotif     String?  // Failure reason if applicable
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model PlatformSettingsDrive {
  id                    String  @id @default("default")
  commissionPercentage  Int     @default(25) // 0-100
  minPayoutAmount       Int     @default(500) // in cents (€5.00)
  payoutDay             Int     @default(1)   // 1=Monday
  
  updatedAt             DateTime @updatedAt
}
```

---

## Next Steps (Phase 15+)

1. **Real-time Notifications**: Push alerts when payout arrives
2. **Bonus Programs**: "Drive 50+ rides → 5% bonus"
3. **Tax Integration**: Auto-calculate VAT withholding
4. **Advance Payouts**: "Need cash now? Request early for a fee"
5. **International Transfers**: Support non-EUR currencies

---

## Monitoring

### Key Metrics

```
Daily:
- Avg payout amount
- Failed transfer count
- Processing time (PENDING → COMPLETED)

Weekly:
- Total driver earnings
- Platform commission collected
- Payout success rate (%)

Monthly:
- Revenue per driver
- Churn due to payment issues
- SEPA delay patterns
```

---

## Support

For driver payouts issues:
- Check bank details via dashboard
- Verify IBAN format (IBAN checker)
- Contact support if transfer delayed >3 days
- Review payout history for past transactions
