# Driver Rating & Reputation System

**Phase 13**: Real-time performance tracking and driver quality assessment.

## Overview

ZupDrive's reputation system provides:
- **Passenger Ratings**: 1-5 stars after each ride
- **Reputation Score**: 0-100 weighted calculation
- **Badges**: Achievement recognition
- **Trends**: Weekly & monthly analytics
- **Recommendations**: Actionable feedback

---

## Reputation Scoring

### Formula

```
Reputation Score = (40% × Rating) + (30% × Completion) + (30% × Stability)

Where:
- Rating = (Average Stars / 5) × 40       → 0-40 points
- Completion = (Completion Rate / 100) × 30 → 0-30 points
- Stability = ((100 - Cancellation%) / 100) × 30 → 0-30 points
────────────────────────────────────────────────────
Total: 0-100 points
```

### Levels

| Level | Score | Meaning | Visibility |
|-------|-------|---------|------------|
| **EXCELLENT** | 90+ | Elite driver | Priority in matching |
| **VERY_GOOD** | 80+ | High quality | Recommended |
| **GOOD** | 70+ | Acceptable | Normal visibility |
| **FAIR** | 50+ | Needs improvement | Warnings shown |
| **POOR** | <50 | At risk | Limited access |

### Example Scoring

```
Driver A:
- Avg Rating: 4.8/5 = 38.4 points (Rating)
- Completion: 98% = 29.4 points (Completion)
- Cancellations: 1% = (100-1)/100 × 30 = 29.7 points (Stability)
─────────────────────────────────────────
Total: 97 points → EXCELLENT ⭐⭐⭐⭐⭐

Driver B:
- Avg Rating: 2.5/5 = 20 points (Rating)
- Completion: 75% = 22.5 points (Completion)
- Cancellations: 15% = (100-15)/100 × 30 = 25.5 points (Stability)
─────────────────────────────────────────
Total: 68 points → GOOD ✅
```

---

## Rating Categories

Passengers can provide detailed ratings:

### Categories (1-5 stars each)

- **Cleanliness**: Vehicle condition, tidiness
- **Driving**: Safety, smoothness, route efficiency
- **Communication**: Responsiveness, friendliness, updates
- **Comfort**: Temperature, music, amenities, space

### Tags (multiple choice)

- ✅ **safe_driving** - Drove carefully
- ✅ **friendly** - Pleasant conversation
- ✅ **clean_car** - Spotless vehicle
- ✅ **good_music** - Nice playlist
- ✅ **quiet** - Peaceful ride

---

## Badges

### Achievement Recognition

```
TOP_RATED          ⭐ 4.8+ stars, 50+ ratings
CONSISTENT         ✓ 98%+ completion rate
RELIABLE           ⏱️ <2% cancellations
EXPERIENCED        🚗 500+ completed courses
RISING_STAR        📈 Improving driver (50+ courses, 4.5+ rating)
PROFESSIONAL       💼 4.0+ stars, 100+ ratings
```

---

## API Endpoints

### Submit Rating

```
POST /api/zupdrive/ratings/submit
Authorization: Bearer {passengerToken}
Content-Type: application/json

{
  "courseId": "course-789",
  "chauffeurId": "chauffeur-123",
  "rating": 5,
  "comment": "Excellent driver! Very friendly and safe.",
  "categories": {
    "cleanliness": 5,
    "driving": 5,
    "communication": 4,
    "comfort": 5
  },
  "tags": ["safe_driving", "friendly", "clean_car"]
}

Response 200:
{
  "success": true,
  "message": "Thank you for your rating!"
}
```

---

### Get Reputation Score

```
GET /api/zupdrive/ratings/chauffeur/:chauffeurId
Authorization: Bearer {token}

Response 200:
{
  "success": true,
  "reputation": {
    "chauffeurId": "chauffeur-123",
    "averageRating": 4.75,
    "totalRatings": 156,
    "ratingDistribution": {
      "fiveStar": 120,
      "fourStar": 30,
      "threeStar": 4,
      "twoStar": 2,
      "oneStar": 0
    },
    "reputationScore": 92,
    "reputationLevel": "EXCELLENT",
    "completionRate": 97,
    "cancellationRate": 1,
    "responseTime": 8,
    "badges": [
      "TOP_RATED",
      "CONSISTENT",
      "RELIABLE",
      "PROFESSIONAL"
    ],
    "trends": {
      "weeklyTrend": +3,
      "monthlyTrend": +5
    },
    "recommendations": [
      "Vous êtes un chauffeur d'élite!",
      "Postulez pour les programmes premium"
    ]
  }
}
```

---

### View Reviews

```
GET /api/zupdrive/ratings/chauffeur/:chauffeurId/reviews?limit=10&sortBy=recent
Authorization: Bearer {token}

Response 200:
{
  "success": true,
  "reviews": [
    {
      "id": "rating-1",
      "note": 5,
      "commentaire": "Excellent driver! Very friendly.",
      "tags": ["safe_driving", "friendly"],
      "categories": {
        "cleanliness": 5,
        "driving": 5,
        "communication": 5,
        "comfort": 4
      },
      "createdAt": "2026-10-07T15:30:00Z",
      "passenger": {
        "id": "passenger-456",
        "name": "Jean Dupont"
      }
    },
    // ... more reviews
  ]
}
```

---

### Driver's Own Reputation

```
GET /api/zupdrive/ratings/my-reputation
Authorization: Bearer {driverToken}

Response 200:
{
  "success": true,
  "reputation": { /* full reputation object */ }
}
```

---

### Driver's Reviews

```
GET /api/zupdrive/ratings/my-reviews?limit=20&sortBy=recent
Authorization: Bearer {driverToken}

Response 200:
{
  "success": true,
  "reviews": [ /* driver's reviews */ ]
}
```

---

### Admin: Top Drivers

```
GET /api/zupdrive/admin/ratings/top-drivers?limit=10
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "drivers": [
    {
      "id": "chauffeur-123",
      "nomComplet": "Jean Dupont",
      "region": "BRUXELLES",
      "averageRating": 4.85,
      "totalRatings": 156,
      "totalCourses": 200
    },
    // ...
  ]
}
```

---

### Admin: Drivers Needing Help

```
GET /api/zupdrive/admin/ratings/drivers-need-improvement?limit=10
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "drivers": [
    {
      "id": "chauffeur-456",
      "nomComplet": "Marie Durand",
      "averageRating": 2.1,
      "totalRatings": 12,
      "status": "NEEDS_IMPROVEMENT"
    }
  ],
  "message": "Consider outreach programs for these drivers"
}
```

---

### Admin: Analytics Dashboard

```
GET /api/zupdrive/admin/ratings/dashboard
Authorization: Bearer {adminToken}

Response 200:
{
  "success": true,
  "dashboard": {
    "totalDrivers": 1200,
    "averageRating": 4.42,
    "topDrivers": [ /* top 5 */ ],
    "driversNeedingHelp": [ /* 5 at-risk */ ],
    "message": "Rating system dashboard"
  }
}
```

---

## Trends & Analytics

### Metrics Tracked

**Weekly Trend**: 
- Rating count change week-over-week
- +3 = 3 more ratings this week vs last

**Monthly Trend**:
- Long-term performance indicator
- +5 = 5 more ratings this month vs last month

**Rating Distribution**:
```
⭐⭐⭐⭐⭐ 5-star: 120 (77%)
⭐⭐⭐⭐   4-star: 30 (19%)
⭐⭐⭐     3-star: 4 (2%)
⭐⭐       2-star: 2 (1%)
⭐         1-star: 0 (0%)
```

---

## Recommendations Engine

### For Low Performers (<3.5 stars)

```
Recommendations:
- "Améliez votre service - plusieurs clients insatisfaits"
- "Demandez du feedback détaillé aux passagers"
- "Réduisez les annulations pour plus de courses"
```

### For Good Performers (3.5-4.0 stars)

```
Recommendations:
- "Vous approchez d'une bonne évaluation!"
- "Continuez l'effort"
```

### For Excellent Performers (4.8+ stars)

```
Recommendations:
- "Excellent! Conservez cette qualité"
- "Vous êtes un chauffeur d'élite!"
- "Postulez pour les programmes premium"
```

---

## Impact on Driver Experience

### Visibility

| Level | Visibility | Course Assignment |
|-------|------------|------------------|
| EXCELLENT | 🟢 High | Priority matching |
| VERY_GOOD | 🟢 High | Preferred matching |
| GOOD | 🟡 Normal | Standard matching |
| FAIR | 🟠 Lower | Standard matching |
| POOR | 🔴 Low | Limited matching |

### Incentives (Future)

```
Reputation Bonuses:
- TOP_RATED badge: 5% surge rate boost
- CONSISTENT badge: Early access to premium routes
- RELIABLE badge: Loyalty rewards tier
- PROFESSIONAL badge: Exclusive high-value rides
```

---

## Passenger Experience

### Before Accepting Ride

```
Driver Profile Card:
┌─────────────────────────┐
│ Jean Dupont             │
│ ⭐⭐⭐⭐⭐ 4.85 (156 ratings)│
│ 
│ Badges:                 │
│ TOP_RATED ✓             │
│ CONSISTENT ✓            │
│ RELIABLE ✓              │
│ PROFESSIONAL ✓          │
│
│ Recent feedback:        │
│ • Safe driving          │
│ • Friendly              │
│ • Clean car             │
└─────────────────────────┘
```

### Review Wall

```
"Excellent driver! Very friendly and took the best route."
⭐⭐⭐⭐⭐ - John D. (Oct 7)

"Safe driving, clean car, pleasant person."
⭐⭐⭐⭐⭐ - Marie L. (Oct 6)

"Good overall, music was a bit loud."
⭐⭐⭐⭐ - Pierre M. (Oct 5)
```

---

## Testing

```bash
npm test -- zupdrive-driver-rating
```

Coverage:
- Rating submission & validation
- Reputation score calculation
- Badge generation
- Trend analysis
- Recommendation generation
- Review filtering & sorting

---

## Next Steps

- Phase 14: Payment integration & driver payouts
- Phase 15: Real-time monitoring & alerts
- Phase 16: Reputation appeals & dispute resolution
