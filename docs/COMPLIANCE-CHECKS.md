# Automated Compliance Checks

> **Document de phase, partiellement dépassé.** Les routes sont sous **`/api/zupdrive/compliance-checks/admin/compliance/...`** (section d'équipe `chauffeurs`, plus le rôle `ADMIN_ZUPDRIVE`). Lancer les contrôles est journalisé. `autoDecision` (par ex. `REJECT` au niveau `CRITICAL`) n'est **qu'une recommandation** du rapport : elle ne modifie pas le dossier du chauffeur. Trois contrôles sont neutralisés faute de données au schéma (cohérence du nom, doublons par numéro de pièce, modification suspecte). La référence à jour est [`zupdrive-api-admin.md`](./zupdrive-api-admin.md).

**Phase 12**: Real-time, automated compliance verification for chauffeur applications.

## Overview

Before approving a chauffeur, ZupDrive automatically runs **8 compliance checks** to:
- Verify document integrity
- Detect fraud signals
- Analyze behavioral patterns
- Score overall risk (0-100)
- Auto-recommend approval/rejection

**Auto-Decision**: 
- ✅ **APPROVE** if risk is LOW (0-24) with all checks passed
- 🔍 **MANUAL_REVIEW** if risk is MEDIUM (25-49) or HIGH (50-74)
- ❌ **REJECT** if risk is CRITICAL (75+)

---

## The 8 Compliance Checks

### 1️⃣ Document Integrity

**Question**: Are all required documents approved and non-expired?

**Risk Calculation**:
- ✅ PASS: All 4 required docs approved → 0 points
- ❌ FAIL: Missing docs → +50 per missing

**Required by Region**:
- BRUXELLES / WALLONIE / FLANDRE: PERMIS, ASSURANCE, INSPECTION, IDENTITE

---

### 2️⃣ Document Consistency

**Question**: Do document details match and are dates coherent?

**Checks**:
- Name on IDENTITE vs. Chauffeur profile (80%+ match required)
- Expiration dates make sense (PERMIS shouldn't expire way before INSPECTION)

**Risk Calculation**:
- Minor inconsistency: +15 points
- Major inconsistency: +40 points

---

### 3️⃣ Identity Verification

**Question**: Is the IDENTITE document valid and approved?

**Checks**:
- Document exists
- Status = APPROVED
- Not expired
- Verified by admin

**Risk Calculation**:
- ✅ PASS: 0 points
- ❌ FAIL: 40 points (HIGH severity)

---

### 4️⃣ Infraction History

**Question**: Does the driver have serious traffic violations?

**Risk Calculation**:
- High-severity infraction: +20 points each
- Medium-severity infraction: +5 points each

**Example**:
```
1 High + 2 Medium = 20 + 10 = 30 points (MEDIUM risk)
3 High infractions = 60 points (HIGH risk)
```

---

### 5️⃣ Behavioral Pattern

**Question**: Is the driver completing courses and not canceling excessively?

**Metrics**:
- Completion rate (must be >70%)
- Cancellation rate (must be <20%)

**Risk Calculation**:
- Low completion rate: +15 points
- High cancellation rate: +15 points

**Example**:
```
0 courses completed → Pass (no history)
10 courses, 7 completed (70%), 1 cancelled → Pass
10 courses, 6 completed (60%), 3 cancelled → Fail +30 points
```

---

### 6️⃣ Geographic Anomaly

**Question**: Is the driver operating in expected region?

**Checks**:
- Region specified matches platform
- No suspicious long-distance courses (future: verify GPS data)

**Risk Calculation**:
- Regional mismatch: +20 points

---

### 7️⃣ Duplicate Detection

**Question**: Is this a duplicate/fraudulent account?

**Checks**:
- Same document numbers across multiple accounts
- Same email registered multiple times
- Same phone number registered multiple times

**Risk Calculation**:
- Duplicate found: +80 points (CRITICAL)

---

### 8️⃣ Fraud Indicators

**Question**: Are there signs of fraud or document tampering?

**Signals**:
- Account created <24 hours before submission (speed)
- Document metadata shows modifications
- Multiple rapid resubmissions
- Suspicious IP patterns (future implementation)

**Risk Calculation**:
- Rapid creation + submission: +15 points
- Document tampering: +25 points
- Multiple signals: +50+ points

---

## Risk Scoring

```
RISK LEVEL    SCORE    MEANING                  AUTO-DECISION
────────────────────────────────────────────────────────────
LOW           0-24     All clear               APPROVE
MEDIUM        25-49    Minor issues            MANUAL_REVIEW
HIGH          50-74    Significant concerns    MANUAL_REVIEW
CRITICAL      75+      Major blockers          REJECT
```

### Score Composition

Each check contributes to the overall score:

```
Overall Score = Average of all 8 checks

Example:
Check 1: 0 points
Check 2: 0 points
Check 3: 0 points
Check 4: 20 points (1 medium infraction)
Check 5: 0 points
Check 6: 0 points
Check 7: 0 points
Check 8: 0 points
─────────────
Average: 2.5 points → LOW risk → APPROVE
```

---

## API Endpoints

### Run Compliance Checks

```
POST /api/zupdrive/admin/compliance/:chauffeurId/run-checks
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "message": "Compliance checks completed",
  "report": {
    "chauffeurId": "chauffeur-123",
    "userId": "user-123",
    "reportedAt": "2026-10-07T15:30:00Z",
    "overallRiskScore": 35,
    "overallRiskLevel": "MEDIUM",
    "autoDecision": "MANUAL_REVIEW",
    "flaggedForReview": true,
    "checks": [
      {
        "type": "DOCUMENT_INTEGRITY",
        "passed": true,
        "riskScore": 0,
        "severity": "LOW",
        "message": "All required documents approved"
      },
      {
        "type": "INFRACTION_HISTORY",
        "passed": false,
        "riskScore": 20,
        "severity": "MEDIUM",
        "message": "1 medium-severity infraction",
        "evidence": { "mediumSeverity": 1 }
      },
      // ... 6 more checks
    ],
    "expiringDocuments": [
      { "type": "ASSURANCE", "expiresIn": 25 }
    ],
    "recommendations": [
      "Review medium-severity infractions",
      "Renew ASSURANCE document in 25 days"
    ]
  }
}
```

---

### Get Latest Report

```
GET /api/zupdrive/admin/compliance/:chauffeurId/latest
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "report": { /* full report */ }
}
```

---

### Get Report History

```
GET /api/zupdrive/admin/compliance/:chauffeurId/history?limit=10
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "count": 3,
  "reports": [
    { /* latest report */ },
    { /* previous report */ },
    { /* even older report */ }
  ]
}
```

---

### Flagged Cases (Need Review)

```
GET /api/zupdrive/admin/compliance/flagged-for-review
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "count": 12,
  "flaggedCases": [
    {
      "id": "report-999",
      "chauffeurId": "chauffeur-123",
      "riskScore": 75,
      "riskLevel": "CRITICAL",
      "autoDecision": "REJECT",
      "createdAt": "2026-10-07T15:30:00Z",
      "chauffeur": {
        "nomComplet": "Jean Dupont",
        "user": { "email": "jean@example.com" }
      }
    }
    // ... more flagged cases
  ]
}
```

---

### Compliance Dashboard

```
GET /api/zupdrive/admin/compliance/dashboard
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "dashboard": {
    "totalReports": 1250,
    "riskDistribution": {
      "critical": 15,
      "high": 85,
      "medium": 450,
      "low": 700
    },
    "flaggedForReview": 100,
    "averageRiskScore": 32,
    "recentReports": [
      { "id": "report-1", "riskScore": 20, "riskLevel": "LOW" },
      // ... 4 more recent
    ]
  }
}
```

---

## Integration with Approval Workflow

### Before Chauffeur Approval

```
Admin views candidate (SOUMIS status)
         ↓
Admin triggers: POST .../run-checks
         ↓
System runs 8 compliance checks
         ↓
Returns: Report with score + auto-decision
         ↓
Decision:
├─ LOW risk (APPROVE) → Admin approves directly
├─ MEDIUM/HIGH → Admin reviews + makes decision
└─ CRITICAL (REJECT) → Auto-rejected, can appeal
```

### Document Validation + Compliance

Documents are validated FIRST (all approved before compliance checks run):

```
1. Client uploads documents
2. Admin validates each document (PENDING → APPROVED/REJECTED)
3. When all APPROVED → Ready for compliance checks
4. Run compliance checks (scoring + auto-decision)
5. Admin makes final approval decision
6. ChauffeurDrive.statut = VALIDE
7. User gains CHAUFFEUR_VTCZTC role
```

---

## Report Persistence

Every compliance check run is stored:

```
ComplianceReport {
  id: string
  chauffeurId: string
  riskScore: number (0-100)
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  checks: ComplianceCheckResult[]
  autoDecision: "APPROVE" | "REJECT" | "MANUAL_REVIEW"
  flaggedForReview: boolean
  recommendations: string[]
  createdAt: DateTime
}
```

**Benefits**:
- ✅ Full audit trail for compliance
- ✅ Track risk evolution over time
- ✅ Identify patterns (e.g., infractions increase over months)
- ✅ Support appeals (show why rejected)

---

## Risk Scenarios

### Scenario 1: Clean Driver → APPROVE

```
Documents: All approved, non-expired ✅
Consistency: Names match, dates coherent ✅
Identity: Valid IDENTITE ✅
Infractions: None ✅
Behavior: 15 courses, 100% completion ✅
Geographic: BRUXELLES only ✅
Duplicates: None found ✅
Fraud: Account 30 days old ✅

Risk Score: 0 (all 0s)
Risk Level: LOW
Auto-Decision: APPROVE ✅
```

---

### Scenario 2: Problem Driver → MANUAL_REVIEW

```
Documents: All approved ✅
Consistency: Minor name mismatch ⚠️ (+10)
Identity: Valid ✅
Infractions: 1 high-severity ⚠️ (+20)
Behavior: 60% completion rate ⚠️ (+15)
Geographic: All BRUXELLES ✅
Duplicates: None ✅
Fraud: None detected ✅

Risk Score: 45 (High + Medium issues)
Risk Level: MEDIUM
Auto-Decision: MANUAL_REVIEW 🔍
```

---

### Scenario 3: Fraud → REJECT

```
Documents: All approved ✅
Consistency: OK ✅
Identity: Valid ✅
Infractions: None ✅
Behavior: No history (new account) ✅
Geographic: OK ✅
Duplicates: Same document ID found elsewhere ❌ (+80)
Fraud: Account created 2 hours ago ⚠️ (+15)

Risk Score: 95 (CRITICAL)
Risk Level: CRITICAL
Auto-Decision: REJECT ❌
```

---

## Dashboard Metrics

**Admin Dashboard** shows:

```
Total Reports: 1,250
Risk Distribution:
  - LOW (0-24): 700 drivers (56%)
  - MEDIUM (25-49): 450 drivers (36%)
  - HIGH (50-74): 85 drivers (7%)
  - CRITICAL (75+): 15 drivers (1%)

Flagged for Review: 100 (HIGH+CRITICAL)
Average Risk Score: 32 (overall healthy)

Recent Reports:
  - report-1 (2h ago): LOW
  - report-2 (4h ago): MEDIUM
  - report-3 (6h ago): LOW
```

---

## Testing

```bash
npm test -- zupdrive-compliance-checks
```

Coverage:
- All 8 check types
- Risk scoring transitions
- Auto-decision logic
- Database persistence
- Recommendation generation

---

## FAQ

**Q: Can compliance checks be bypassed?**  
A: No. Every chauffeur goes through compliance checks. The system can RECOMMEND approval, but humans make the final decision.

**Q: What if a chauffeur appeals a CRITICAL rejection?**  
A: They can resubmit documents or challenge the fraud indicators. System will re-run checks.

**Q: How often do we re-check compliance?**  
A: On every document validation. Plus: recurring checks (quarterly?) to catch new infractions.

**Q: Can a driver with HIGH risk still be approved?**  
A: Yes, but only if admin explicitly overrides after manual review. It's logged.

**Q: What happens if a driver's document expires after approval?**  
A: Document validation detects it and marks document as EXPIRED. Future compliance run will flag it.

---

## Next Steps

- Phase 13: Driver rating & reputation system
- Phase 14: Payment integration for drivers
- Phase 15: Real-time monitoring & alerts
