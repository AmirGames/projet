# Unified Multi-Role Identity System

> **Document de phase, partiellement dépassé.** Le routeur `zupdrive-chauffeur-onboarding` (`/chauffeur/candidacy/*`, `/admin/candidates/*`) **n'est pas monté** : son approbation ne contrôlait pas les pièces exigées. L'inscription passe par `/api/zupdrive/chauffeur/me*` et la décision par `/api/zupdrive/admin/chauffeurs/:id/(approve|reject|suspend|reactivate)`. `POST /api/zupdrive/admin/drivers/:id/(suspend|reactivate)` existe (section `chauffeurs`, journalisé). Le rôle `ADMIN_ZUPDRIVE` n'est plus un garde des routes montées : ce sont les sections de permission de l'équipe. La référence à jour est [`zupdrive-api-admin.md`](./zupdrive-api-admin.md).

**ZupOne Ecosystem**: Single account, multiple roles across platforms.

## Overview

A **User** can simultaneously hold different roles:
- **CLIENT_ZUPEAT** + **PASSENGER_ZUPDRIVE** (auto)
- **LIVREUR_ZUPEAT** (independent)
- **CHAUFFEUR_VTCZTC** (optional, validated)
- **ADMIN/SUPPORT** (platform-specific)

No separate accounts. No re-authentication between platforms. **One SessionConnexion, all domains.**

## Architecture

### User Relations (Prisma)

```prisma
model User {
  id                String
  email             String @unique
  
  customer          Customer?         // CLIENT_ZUPEAT role
  driver            Courier?          // LIVREUR_ZUPEAT role
  chauffeurDrive    ChauffeurDrive?   // CHAUFFEUR_VTCZTC role
  accesEquipe       AccesEquipe[]     // ADMIN/SUPPORT roles
  
  sessionsConnexion SessionConnexion[] // Shared SSO
}
```

### Role Management

**No schema migrations needed!** Roles are derived from:
1. **Relations existence** (customer, driver, chauffeurDrive)
2. **Status/statut fields** (determines role activation)

| Relation | Status/Statut | Role | Access |
|----------|---|---|---|
| `customer` | `ACTIVE` | `CLIENT_ZUPEAT` | ZupEat + ZupDrive passenger |
| `driver` | `ACTIVE` | `LIVREUR_ZUPEAT` | ZupEat delivery |
| `chauffeurDrive` | `VALIDE` | `CHAUFFEUR_VTCZTC` | ZupDrive driver |
| `chauffeurDrive` | `BROUILLON\|SOUMIS\|REFUSE\|SUSPENDU` | — | Blocked |
| `accesEquipe` | `ADMIN` | `ADMIN_ZUPEAT\|ADMIN_ZUPDRIVE` | Full admin |
| `accesEquipe` | `SUPPORT` | `SUPPORT` | Support across platforms |

## User Progression: Client → Driver

### 1️⃣ Register (Client)
```
User created with Customer relation
roles: [CLIENT_ZUPEAT, PASSENGER_ZUPDRIVE]
status: ACTIVE
```

**API**: `POST /api/auth/register`  
**Result**: Customer.status = ACTIVE

---

### 2️⃣ Apply for Driver (Client initiates)
```
POST /api/zupdrive/chauffeur/candidacy/create
{
  nomComplet: "Jean Dupont",
  telephone: "0612345678",
  region: "BRUXELLES"
}

ChauffeurDrive created with statut=BROUILLON
User still has: [CLIENT_ZUPEAT, PASSENGER_ZUPDRIVE]
```

**Database**: ChauffeurDrive.statut = BROUILLON  
**Role**: NOT added yet (must submit first)

---

### 3️⃣ Submit for Review (Client)
```
POST /api/zupdrive/chauffeur/candidacy/submit

ChauffeurDrive.statut = SOUMIS
ChauffeurDrive.soumisLe = NOW (audit trail)
User still has: [CLIENT_ZUPEAT, PASSENGER_ZUPDRIVE]
```

**Access**: Client awaits admin review  
**Dashboard**: Admin ZupDrive sees new pending application

---

### 4️⃣ Admin Approves (ZupDrive Admin)
```
POST /api/zupdrive/admin/candidates/{id}/approve

ChauffeurDrive.statut = VALIDE
ChauffeurDrive.valideLe = NOW
ChauffeurDrive.validePar = admin.id
User now has: [CLIENT_ZUPEAT, PASSENGER_ZUPDRIVE, CHAUFFEUR_VTCZTC] ✅
```

**Role Activated**: CHAUFFEUR_VTCZTC  
**Access**: Client can now accept driver requests  
**Audit**: Full trail with timestamps + admin ID

---

### 5️⃣ Suspension Scenario
```
POST /api/zupdrive/admin/drivers/{id}/suspend
{
  reason: "Inappropriate behavior"
}

ChauffeurDrive.statut = SUSPENDU
User reverts to: [CLIENT_ZUPEAT, PASSENGER_ZUPDRIVE] ← Still there!
```

**Separation**: Suspending driver doesn't affect client  
**Access**: ❌ Cannot drive, ✅ Can still order/use ZupEat  
**Reactivation**: POST /api/zupdrive/admin/drivers/{id}/reactivate

---

## API Endpoints

### Client Endpoints

#### Create Candidacy
```
POST /api/zupdrive/chauffeur/candidacy/create
Authorization: Bearer {clientToken}
Content-Type: application/json

{
  "nomComplet": "Jean Dupont",
  "telephone": "0612345678",
  "region": "BRUXELLES"  // BRUXELLES | WALLONIE | FLANDRE
}

Response 200:
{
  "success": true,
  "message": "Dossier créé avec succès",
  "roles": ["CLIENT_ZUPEAT", "PASSENGER_ZUPDRIVE"],
  "chauffeurId": "chauffeur-123",
  "chauffeurStatus": "BROUILLON"
}
```

**Errors**:
- `400`: Customer not active
- `400`: Dossier already exists

---

#### Submit Candidacy
```
POST /api/zupdrive/chauffeur/candidacy/submit
Authorization: Bearer {clientToken}

Response 200:
{
  "success": true,
  "message": "Dossier soumis pour validation",
  "chauffeurStatus": "SOUMIS"
}
```

**Errors**:
- `400`: Not in BROUILLON status
- `404`: No candidacy found

---

#### Check Status
```
GET /api/zupdrive/chauffeur/candidacy/status
Authorization: Bearer {clientToken}

Response 200:
{
  "success": true,
  "candidacy": {
    "id": "chauffeur-123",
    "statut": "SOUMIS",
    "soumisLe": "2026-10-07T10:30:00Z",
    "valideLe": null,
    "validePar": null,
    "motifStatut": null,
    "nomComplet": "Jean Dupont",
    "region": "BRUXELLES"
  },
  "roleActive": false  // true only if VALIDE
}
```

---

### Admin Endpoints (ADMIN_ZUPDRIVE only)

#### List Pending Applications
```
GET /api/zupdrive/admin/candidates/pending
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "count": 3,
  "candidates": [
    {
      "id": "chauffeur-123",
      "nomComplet": "Jean Dupont",
      "region": "BRUXELLES",
      "soumisLe": "2026-10-07T10:30:00Z",
      "user": { "email": "jean@example.com" }
    },
    ...
  ]
}
```

---

#### Get Application Details
```
GET /api/zupdrive/admin/candidates/{id}/details
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "chauffeur": {
    "id": "chauffeur-123",
    "userId": "user-123",
    "nomComplet": "Jean Dupont",
    "telephone": "0612345678",
    "region": "BRUXELLES",
    "numeroEntreprise": "0123456789",
    "raisonSociale": "Dupont Taxi SPRL",
    "numeroLicence": "LIC-123456",
    "vehiculeMarque": "Mercedes",
    "vehiculeModele": "E-Class",
    "vehiculePlaque": "ABC123",
    "statut": "SOUMIS",
    "user": {
      "email": "jean@example.com",
      "name": "Jean Dupont"
    },
    "documents": [
      {
        "id": "doc-1",
        "type": "PERMIS",
        "url": "/documents/permis-123.pdf",
        "statut": "APPROVED",
        "dateExpiration": "2028-10-07T00:00:00Z",
        "examineLe": "2026-10-07T11:00:00Z"
      },
      ...
    ]
  }
}
```

---

#### Approve Application
```
POST /api/zupdrive/admin/candidates/{id}/approve
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "message": "Dossier approuvé",
  "chauffeurStatus": "VALIDE",
  "roles": ["CLIENT_ZUPEAT", "PASSENGER_ZUPDRIVE", "CHAUFFEUR_VTCZTC"]
}
```

**Effect**:
- ChauffeurDrive.statut = VALIDE
- ChauffeurDrive.valideLe = NOW
- ChauffeurDrive.validePar = admin.id
- User gains CHAUFFEUR_VTCZTC role

---

#### Reject Application
```
POST /api/zupdrive/admin/candidates/{id}/reject
Authorization: Bearer {adminToken}
Content-Type: application/json

{
  "reason": "Documents insuffisants. Licence expirée."
}

Response 200:
{
  "success": true,
  "message": "Dossier refusé"
}
```

**Effect**:
- ChauffeurDrive.statut = REFUSE
- ChauffeurDrive.motifStatut = reason
- User keeps CLIENT_ZUPEAT (unaffected)

---

## Service: UnifiedRolesService

Located: `backend/src/modules/auth/unified-roles.service.ts`

### Key Methods

#### loadUserRoleContext(userId)
Compute all active roles from user relations.

```typescript
const context = await UnifiedRolesService.loadUserRoleContext(userId);
// {
//   userId: "user-123",
//   email: "client@example.com",
//   roles: ["CLIENT_ZUPEAT", "PASSENGER_ZUPDRIVE", "CHAUFFEUR_VTCZTC"],
//   customerId: "customer-456",
//   chauffeurId: "chauffeur-789",
//   chauffeurStatus: "VALIDE",
//   platformAdmin: [{ plateforme: "DRIVE", role: "ADMIN" }]
// }
```

#### hasRole(context, role)
Check if user has specific role.

```typescript
if (UnifiedRolesService.hasRole(context, "CHAUFFEUR_VTCZTC")) {
  // User is a validated driver
}
```

#### createChauffeurCandidacy(data)
Initiate driver application.

```typescript
const context = await UnifiedRolesService.createChauffeurCandidacy({
  userId: "user-123",
  nomComplet: "Jean Dupont",
  telephone: "0612345678",
  region: "BRUXELLES"
});
// Returns updated context with chauffeurId, chauffeurStatus=BROUILLON
```

#### submitChauffeurApplication(userId)
Transition BROUILLON → SOUMIS.

```typescript
const context = await UnifiedRolesService.submitChauffeurApplication(userId);
// ChauffeurDrive.statut changed to SOUMIS, soumisLe set
```

#### approveChauffeur(data)
Admin approval: SOUMIS → VALIDE.

```typescript
const context = await UnifiedRolesService.approveChauffeur({
  chauffeurId: "chauffeur-123",
  approvedBy: "admin-123"
});
// ChauffeurDrive.statut = VALIDE
// User gains CHAUFFEUR_VTCZTC role
```

#### suspendChauffeur(data)
Suspend driver (client role intact).

```typescript
await UnifiedRolesService.suspendChauffeur({
  chauffeurId: "chauffeur-123",
  reason: "Behavior violation",
  suspendedBy: "admin-123"
});
// ChauffeurDrive.statut = SUSPENDU
// CHAUFFEUR_VTCZTC role removed, but CLIENT_ZUPEAT persists
```

---

## Testing

### Unit Tests
```bash
npm test -- unified-roles.service
```

Tests role computation, state transitions, permission checks.

### Integration Tests
```bash
npm test -- zupdrive-chauffeur-onboarding.integration
```

Tests route handlers, request/response validation.

### E2E Verification
```bash
npm run verify:chauffeur-workflow
```

Full workflow: register → apply → submit → approve → verify roles.

---

## Multi-Platform Session

**SessionConnexion** is shared:
- Single logout invalidates all platforms
- Access tokens valid for ZupEat + ZupDrive
- Role-based authorization per platform
- No re-authentication between platforms

```typescript
// Login on ZupEat
const { sessionId, accessToken } = await login("client@example.com");

// Same session works for ZupDrive
// accessToken contains sessionId
// ZupDrive checks: hasZupDriveAccess(context)
```

---

## Audit Trail

Every state transition is logged:

```
ChauffeurDrive {
  soumisLe: 2026-10-07T10:30:00Z     // When client submitted
  valideLe: 2026-10-07T14:00:00Z     // When admin approved
  validePar: admin-456                // Which admin
  motifStatut: "Behavior violation"   // For rejections/suspensions
}
```

Use for compliance, dispute resolution, and analytics.

---

## FAQ

**Q: If I suspend a driver, can they still order on ZupEat?**  
✅ Yes! CLIENT_ZUPEAT role is independent.

**Q: Can a user have multiple driver applications?**  
❌ No. One ChauffeurDrive per User (unique constraint on userId).

**Q: How are documents validated?**  
Via DocumentChauffeurDrive.statut (PENDING, APPROVED, REJECTED, EXPIRED).  
Admin can validate documents before approving application.

**Q: What happens if user deletes client account but has driver role?**  
The ChauffeurDrive is orphaned (userId relation). Implementation detail for GDPR handling.

**Q: Can an admin see pending driver applications before client submits?**  
❌ Only SOUMIS dossiers appear in admin list. BROUILLON is private to client.

---

## Next Steps

- Phase 11: Document validation workflow
- Phase 12: Automated compliance checks
- Phase 13: Driver rating & reputation
- Phase 14: Payment integration for drivers
