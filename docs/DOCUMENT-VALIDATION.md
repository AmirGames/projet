# Document Validation Workflow

> **Document de phase, partiellement dépassé.** Le routeur `zupdrive-document-validation` **n'est pas monté** (doublon du dépôt `/api/zupdrive/chauffeur/me/documents` et de l'examen `PATCH /api/zupdrive/admin/chauffeurs/:id/documents/:documentId`, il accepte une URL de fichier fournie par le client et des types en majuscules alors que la référence `DocumentChauffeurDrive` est en minuscules). Les routes ci-dessous ne sont pas servies ; la validation des pièces passe par `chauffeur.admin` et `drivers/:id/validate-document`. La référence à jour est [`zupdrive-api-admin.md`](./zupdrive-api-admin.md).

**Phase 11**: Chauffeur document verification system for ZupDrive.

## Overview

Before a chauffeur can be validated and start driving:
1. Upload required documents
2. Admin reviews each document
3. All documents must be approved (none expired, none rejected)
4. Only then can chauffeur be approved (BROUILLON → SOUMIS → VALIDE)

## Document Types

Required by region (Belgium):

```
BRUXELLES / WALLONIE / FLANDRE:
✅ PERMIS         - Driver's license (Brevet de capacité)
✅ ASSURANCE      - Vehicle insurance policy
✅ INSPECTION     - Technical inspection certificate (Contrôle technique)
✅ IDENTITE       - ID card or passport

Optional:
- CONTRAT         - Employment contract (for company drivers)
- BCE             - Business registration (for VTC companies)
- AUTRE           - Other documents
```

## Document Statuses

| Status | Meaning | Next Actions |
|--------|---------|--------------|
| **PENDING** | Uploaded, awaiting admin | Admin reviews |
| **APPROVED** | Admin validated | Counts toward readiness |
| **REJECTED** | Admin rejected | Chauffeur must resubmit |
| **EXPIRED** | Past expiration date | Auto-detected, chauffeur loses access |

## Workflow

### 1️⃣ Chauffeur Uploads Document

**Chauffeur must be in BROUILLON status** (not SOUMIS/VALIDE/SUSPENDU)

```
POST /api/zupdrive/documents/upload
Authorization: Bearer {token}
Content-Type: application/json

{
  "chauffeurId": "chauffeur-123",
  "type": "PERMIS",
  "url": "https://storage.example.com/permis-abc123.pdf",
  "expiresAt": "2028-10-07T00:00:00Z"  // ISO date
}

Response 200:
{
  "success": true,
  "message": "Document uploaded",
  "document": {
    "id": "doc-1",
    "type": "PERMIS",
    "status": "PENDING",
    "url": "https://storage.example.com/permis-abc123.pdf",
    "expiresAt": "2028-10-07T00:00:00Z"
  }
}
```

**Errors**:
- `400`: Chauffeur not in uploadable status
- `403`: Forbidden - uploading for another user
- `404`: Chauffeur not found

---

### 2️⃣ Chauffeur Views Their Documents

```
GET /api/zupdrive/documents/my-documents/:chauffeurId
Authorization: Bearer {clientToken}

Response 200:
{
  "success": true,
  "summary": {
    "chauffeurId": "chauffeur-123",
    "totalRequired": 4,
    "approved": 1,
    "pending": 2,
    "rejected": 1,
    "expired": 0,
    "allValidated": false,
    "nextActionRequired": "ASSURANCE: Rejected - Insurance expired. INSPECTION: Pending review.",
    "documents": [
      {
        "id": "doc-1",
        "type": "PERMIS",
        "status": "APPROVED",
        "url": "https://...",
        "expiresAt": "2028-10-07T00:00:00Z",
        "verifiedAt": "2026-10-07T14:30:00Z",
        "daysUntilExpiration": 732
      },
      {
        "id": "doc-2",
        "type": "ASSURANCE",
        "status": "REJECTED",
        "url": "https://...",
        "rejectionReason": "Insurance document expired on 2026-09-15"
      },
      {
        "id": "doc-3",
        "type": "INSPECTION",
        "status": "PENDING",
        "url": "https://..."
      }
    ]
  }
}
```

---

### 3️⃣ Admin Reviews All Documents

```
GET /api/zupdrive/admin/documents/:chauffeurId/review
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "summary": {
    "chauffeurId": "chauffeur-123",
    "totalRequired": 4,
    "approved": 2,
    "pending": 1,
    "rejected": 1,
    "expired": 0,
    "allValidated": false,
    "nextActionRequired": "ASSURANCE rejected - needs resubmission. INSPECTION pending.",
    "documents": [
      {
        "id": "doc-1",
        "type": "PERMIS",
        "status": "APPROVED",
        "daysUntilExpiration": 732
      },
      {
        "id": "doc-2",
        "type": "ASSURANCE",
        "status": "REJECTED",
        "rejectionReason": "Insurance expired"
      },
      {
        "id": "doc-3",
        "type": "INSPECTION",
        "status": "PENDING"
      },
      {
        "id": "doc-4",
        "type": "IDENTITE",
        "status": "APPROVED",
        "daysUntilExpiration": 1825
      }
    ]
  }
}
```

---

### 4️⃣ Admin Validates Documents

#### Approve

```
POST /api/zupdrive/admin/documents/:documentId/approve
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "message": "Document approved",
  "document": {
    "id": "doc-1",
    "type": "PERMIS",
    "status": "APPROVED",
    "verifiedAt": "2026-10-07T15:00:00Z"
  }
}
```

#### Reject

```
POST /api/zupdrive/admin/documents/:documentId/reject
Authorization: Bearer {adminToken}
Content-Type: application/json

{
  "reason": "Insurance document expired. Valid until 2026-09-15."
}

Response 200:
{
  "success": true,
  "message": "Document rejected",
  "document": {
    "id": "doc-2",
    "type": "ASSURANCE",
    "status": "REJECTED",
    "rejectionReason": "Insurance document expired. Valid until 2026-09-15.",
    "verifiedAt": "2026-10-07T15:05:00Z"
  }
}
```

**Errors**:
- `403`: Admin only
- `404`: Document not found

---

### 5️⃣ Admin Checks Readiness

Before approving the chauffeur dossier:

```
GET /api/zupdrive/admin/documents/:chauffeurId/ready-for-approval
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "canApprove": false,
  "reason": "Cannot approve: 1 document(s) rejected, 1 document(s) pending review"
}

// OR when ready:
{
  "success": true,
  "canApprove": true
}
```

**Logic**:
- ✅ Can approve if: ALL required docs are APPROVED AND NONE are EXPIRED
- ❌ Cannot approve if: ANY doc is PENDING, REJECTED, or EXPIRED

---

### 6️⃣ List Pending Documents (Admin)

See all documents awaiting admin review:

```
GET /api/zupdrive/admin/documents/pending
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "count": 5,
  "documents": [
    {
      "id": "doc-123",
      "type": "PERMIS",
      "chauffeurId": "chauffeur-456",
      "dateExpiration": "2028-10-07T00:00:00Z",
      "chauffeur": {
        "nomComplet": "Jean Dupont",
        "region": "BRUXELLES",
        "user": {
          "email": "jean@example.com"
        }
      }
    },
    ...
  ]
}
```

---

## Service API

Location: `backend/src/modules/zupdrive/zupdrive-document-validation.service.ts`

### uploadDocument(data)

Chauffeur uploads a document.

```typescript
const result = await ZupDriveDocumentValidationService.uploadDocument({
  chauffeurId: "chauffeur-123",
  type: "PERMIS",
  url: "https://storage.example.com/file.pdf",
  expiresAt: new Date("2028-10-07"),
});
// Returns: DocumentValidationResult
```

---

### approveDocument(data)

Admin approves a document (PENDING → APPROVED).

```typescript
const result = await ZupDriveDocumentValidationService.approveDocument({
  documentId: "doc-1",
  approvedBy: "admin-123",
});
// Returns: DocumentValidationResult
```

---

### rejectDocument(data)

Admin rejects a document (PENDING → REJECTED).

```typescript
const result = await ZupDriveDocumentValidationService.rejectDocument({
  documentId: "doc-1",
  reason: "License expired on 2026-09-15",
  rejectedBy: "admin-123",
});
// Returns: DocumentValidationResult
```

---

### getChauffeurDocuments(chauffeurId)

Get summary of all chauffeur's documents.

```typescript
const summary = await ZupDriveDocumentValidationService.getChauffeurDocuments(
  "chauffeur-123"
);
// Returns: DocumentValidationSummary
// {
//   chauffeurId, totalRequired, approved, pending, rejected, expired,
//   allValidated, nextActionRequired, documents[]
// }
```

---

### canApproveChauffeur(chauffeurId)

Check if chauffeur is ready for approval.

```typescript
const readiness = await ZupDriveDocumentValidationService.canApproveChauffeur(
  "chauffeur-123"
);
// Returns: { canApprove: boolean, reason?: string }
```

---

### checkExpirations(chauffeurId?)

Auto-detect expired documents and mark them (run as scheduled job).

```typescript
// Check one chauffeur
const updated = await ZupDriveDocumentValidationService.checkExpirations(
  "chauffeur-123"
);

// Check all chauffeurs
const updated = await ZupDriveDocumentValidationService.checkExpirations();
// Returns: number of documents marked as expired
```

---

### scheduleExpirationReminders()

Send 30-day and 10-day warnings before expiration (scheduled job).

```typescript
const reminders = await ZupDriveDocumentValidationService.scheduleExpirationReminders();
// Returns: number of reminders sent
```

---

## Scheduled Jobs

### Daily: Check Expirations
```
0 0 * * * - checkExpirations() - Mark expired documents
```

### Daily: Expiration Warnings
```
0 8 * * * - scheduleExpirationReminders() - Send 30/10 day warnings
```

---

## Integration with Chauffeur Approval

### Before Approval Flow

```
1. Client submits dossier (BROUILLON → SOUMIS)
   ↓
2. Admin checks documents via canApproveChauffeur()
   ↓
3. All approved? None expired? None rejected?
   ├─ YES → Can proceed to chauffeur approval
   └─ NO → Return reason, ask chauffeur to fix
   ↓
4. Admin approves chauffeur (SOUMIS → VALIDE)
   → User gains CHAUFFEUR_VTCZTC role
```

---

## Edge Cases

### Document Expires After Approval

If a document expires after being approved:
1. Scheduled job detects expiration
2. Document status auto-changes: APPROVED → EXPIRED
3. `canApproveChauffeur()` returns false
4. Chauffeur loses access (VALIDE → ? pending business rules)
5. Chauffeur notified to resubmit

### Chauffeur Re-uploads Document

If chauffeur re-uploads a document:
1. Old document version kept for audit trail
2. New document created with PENDING status
3. Admin reviews new version
4. Chauffeur can choose which version (or auto-use latest approved)

### Multiple Rejections

If a document is rejected multiple times:
1. All rejections stored with reasons
2. Chauffeur sees full history
3. Can appeal or resubmit
4. Admin can make final decision

---

## FAQ

**Q: How long do documents need to be valid?**  
A: Depends on document type and region. Typical validity:
- PERMIS: 10 years
- ASSURANCE: 1 year (renewed annually)
- INSPECTION: 2 years
- IDENTITE: 10 years

**Q: Can a chauffeur appeal a rejection?**  
A: Not in this system (v1). They must resubmit a corrected document and get admin approval again.

**Q: What if a critical document expires overnight?**  
A: Scheduled job runs daily. Chauffeur may keep access for up to 24 hours before it's auto-detected. Business rule should define action (immediate suspension or grace period).

**Q: Can admin batch-reject multiple documents?**  
A: Not in this API (v1). Each document must be reviewed individually for security/compliance.

**Q: What's stored for audit?**  
A: Every review action:
- documentId, type, status, url
- examineLe (when reviewed)
- noteExamen (reason if rejected)
- chauffeurId, userId (who uploaded)

---

## Testing

```bash
npm test -- zupdrive-document-validation
```

Coverage:
- Upload document
- Admin approval/rejection
- Full document summary
- Readiness check
- Expiration detection
- Reminder scheduling
- Integration workflow

---

## Next Steps

- Phase 12: Automated compliance checks
- Phase 13: Driver rating & reputation
- Phase 14: Payment integration
- Phase 15: Document expiration appeals
