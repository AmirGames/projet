# Frontend ZupDrive - Driver & Admin Dashboard 🎨

> **Document de phase, partiellement dépassé.** Pages et URL d'API : `/notifications`, `/metrics`, `/earnings-realtime` sous `/api/zupdrive` ; support sous `/api/zupdrive/support/admin/...`, notifications `/api/zupdrive/notifications/admin/...`, webhooks `/api/zupdrive/webhooks/admin/...`, conformité `/api/zupdrive/compliance/admin/...`. Rapports programmés : `/api/zupdrive/reporting/admin/scheduled`. La page `configuration` appelle encore `/api/zupdrive/admin/config/*`, dont le routeur (`platform-config`) n'est pas monté. L'exemple WebSocket `/api/zupdrive/ws` ne fonctionne plus. La référence à jour est [`zupdrive-api-admin.md`](./zupdrive-api-admin.md).

**Status**: Complete driver and admin dashboards with real-time monitoring

## Project Structure

```
frontend/
├── app/
│   ├── driver/
│   │   └── dashboard/
│   │       └── page.tsx               # Driver dashboard page
│   └── admin/
│       └── dashboard/
│           └── page.tsx               # Admin dashboard page
│
└── components/zupdrive/
    ├── DriverDashboardClient.tsx      # Main driver dashboard component
    ├── AdminDashboardClient.tsx       # Main admin dashboard component
    │
    ├── EarningsCard.tsx               # Earnings (today/week) display
    ├── PayoutCard.tsx                 # Payout status & next date
    ├── ReputationCard.tsx             # Reputation score & badges
    ├── MetricsCard.tsx                # KPI display (completion, etc.)
    ├── NotificationsPanel.tsx         # Notification feed
    │
    ├── AdminStatsPanel.tsx            # Platform stats (drivers, courses, etc.)
    ├── AdminAlertsPanel.tsx           # Compliance alerts list
    └── AdminPayoutPanel.tsx           # Pending payouts overview
```

---

## Driver Dashboard (`/driver/dashboard`)

### Features

✅ **Real-time Earnings**
- Today's earnings + course count
- Weekly earnings + course count
- Average per course

✅ **Payout Status**
- Amount pending
- Current status (PENDING/PROCESSING/COMPLETED/FAILED)
- Next payout date (calculated as next Monday)

✅ **Reputation Score**
- Score 0-100 with visual progress bar
- Average rating (1-5 stars)
- Badges earned (TOP_RATED, CONSISTENT, RELIABLE, etc.)
- Reputation level (EXCELLENT/VERY_GOOD/GOOD/FAIR/POOR)

✅ **Performance Metrics**
- Completion Rate (%)
- Cancellation Rate (%)
- Compliance Score (0-100)
- Document Status (COMPLETE/PENDING/ISSUES)

✅ **Notifications**
- Unread notification count badge
- Priority-based color coding (low/medium/high/critical)
- Quick action links
- Relative time display (just now, 5m, 2h, etc.)

✅ **Status Indicator**
- Account status (ACTIVE/WARNING/SUSPENDED/INACTIVE)
- Color-coded badge with emoji

### API Calls

```typescript
// Metrics
GET /api/zupdrive/metrics
→ DriverMetrics

// Notifications
GET /api/zupdrive/notifications?limit=20
→ { notifications[], stats }

// Real-time earnings
GET /api/zupdrive/earnings-realtime
→ { today: { amount, courses }, week: { amount, courses } }
```

### Auto-refresh

- Every 30 seconds for real-time data
- Automatic reconnection on error
- Cleanup on unmount

---

## Admin Dashboard (`/admin/dashboard`)

### Features

✅ **Real-time Platform Stats**
- Active drivers count
- Total courses (all-time)
- Platform revenue (total earnings)
- Compliance alerts count

✅ **Compliance Alerts**
- List of high/critical risk drivers
- Risk level indicator with emoji
- Driver ID and alert timestamp
- Quick link to driver profile

✅ **Payout Overview**
- Count of pending payouts
- Status indicator (⏳ pending vs ✅ processed)
- Process pending button
- Link to payout history
- Warning when payouts pending

✅ **Suspension Monitoring**
- Count of currently suspended drivers
- Quick action to review suspended drivers
- Red warning box if suspensions > 0

✅ **Last Update Timestamp**
- Shows when dashboard was last refreshed
- Time-based (HH:MM format)

### API Calls

```typescript
// Dashboard overview
GET /api/zupdrive/admin/dashboard
→ {
    realtime: { activeDrivers, totalCourses, totalEarnings },
    financials: { pendingPayouts },
    compliance: { alertCount, alerts[] },
    suspensions: { count },
    timestamp
  }
```

### Auto-refresh

- Every 60 seconds for monitoring
- Automatic error handling with retry

---

## Components Reference

### EarningsCard
```tsx
<EarningsCard
  today={8500}        // cents
  week={215000}       // cents
  courses={{
    today: 2,
    week: 45
  }}
/>
```

### PayoutCard
```tsx
<PayoutCard
  amount={215000}     // cents
  status="pending"    // pending|processing|completed|failed
  nextPayoutDate={new Date(...)}
/>
```

### ReputationCard
```tsx
<ReputationCard
  score={92}          // 0-100
  rating={4.75}       // 1-5
  badges={['TOP_RATED', 'PROFESSIONAL']}
  level="EXCELLENT"   // EXCELLENT|VERY_GOOD|GOOD|FAIR|POOR
/>
```

### MetricsCard
```tsx
<MetricsCard
  label="Completion Rate"
  value="98%"
  icon="✓"
  color="green"       // green|red|blue|purple
  status="excellent"  // excellent|good|warning|danger
/>
```

### NotificationsPanel
```tsx
<NotificationsPanel
  notifications={[...]}
  unreadCount={3}
/>
```

### AdminStatsPanel
```tsx
<AdminStatsPanel
  dashboard={{
    realtime: { activeDrivers, totalCourses, totalEarnings },
    compliance: { alertCount },
    suspensions: { count }
  }}
/>
```

### AdminAlertsPanel
```tsx
<AdminAlertsPanel
  alerts={[
    {
      id: "alert-1",
      chauffeurId: "chauffeur-456",
      riskLevel: "CRITICAL",
      createdAt: "2026-10-17T..."
    }
  ]}
/>
```

### AdminPayoutPanel
```tsx
<AdminPayoutPanel
  pendingCount={32}
/>
```

---

## Styling

### Design System

- **Colors**:
  - Primary: Blue (`#2563eb`)
  - Success: Green (`#10b981`)
  - Warning: Yellow/Orange (`#f59e0b`)
  - Error: Red (`#ef4444`)
  - Neutral: Gray (`#6b7280`)

- **Layout**:
  - 7xl max-width container
  - 6px rounded corners (components)
  - Shadow on hover
  - Ring borders for states

- **Typography**:
  - Header: Text-3xl bold
  - Cards: Text-lg semibold
  - Metrics: Text-2xl/3xl bold
  - Labels: Text-sm medium

### Responsive

- Mobile-first approach
- `md:` breakpoint for tablets
- `lg:` breakpoint for desktop
- Grid layouts adapt to screen size

---

## Translation Keys Required

Add to `frontend/messages/fr.json`:

```json
{
  "driver": {
    "dashboard": "Mon tableau de bord",
    "welcomeDriver": "Bienvenue sur votre espace chauffeur",
    "earnings": "Revenus",
    "today": "Aujourd'hui",
    "thisWeek": "Cette semaine",
    "courses": "course(s)",
    "averagePerCourse": "Moyenne par course",
    "nextPayout": "Prochain virement",
    "reputation": "Ma réputation",
    "score": "Score",
    "rating": "Évaluation",
    "badges": "Badges",
    "completionRate": "Taux de complétion",
    "cancellationRate": "Taux d'annulation",
    "compliance": "Conformité",
    "documents": "Documents",
    "notifications": "Notifications",
    "status": {
      "active": "Actif",
      "warning": "Attention",
      "suspended": "Suspendu"
    }
  },
  "admin": {
    "dashboard": "Tableau de bord",
    "platformOverview": "Vue d'ensemble",
    "activeDrivers": "Chauffeurs actifs",
    "totalCourses": "Courses totales",
    "platformRevenue": "Revenu plateforme",
    "complianceAlerts": "Alertes de conformité",
    "payouts": "Virements",
    "pendingPayouts": "En attente"
  }
}
```

Also add English translations to `frontend/messages/en.json`.

---

## Real-time Features

### WebSocket Integration (Coming Soon)

The frontend is ready to use WebSocket for real-time updates:

```tsx
const ws = new WebSocket(
  `wss://api.zupdrive.com/api/zupdrive/ws?token=${token}`
);

ws.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);
  
  switch(type) {
    case 'COURSE_COMPLETED':
      setEarnings(prev => ({
        ...prev,
        today: prev.today + data.amount
      }));
      break;
    case 'PAYOUT_PROCESSING':
      setMetrics(prev => ({
        ...prev,
        pendingPayout: 0
      }));
      break;
  }
};
```

---

## Error Handling

- ✅ Not authenticated → redirect to login
- ✅ API errors → display user-friendly message
- ✅ Network errors → auto-retry every 30s (driver) / 60s (admin)
- ✅ No data → show empty state with message

---

## Performance Optimizations

- ✅ Client-side components only (no server-side rendering for dashboard)
- ✅ Minimal re-renders with useState + useEffect
- ✅ Local state for UI (modal, filters, etc.)
- ✅ API caching via browser cache headers
- ✅ Lazy load notifications (10 at a time)

---

## Testing

```bash
# Type checking
npx tsc --noEmit

# Linting
npm run lint

# Build
npm run build

# Run dev server
npm run dev
```

Access:
- Driver: `http://localhost:3000/driver/dashboard`
- Admin: `http://localhost:3000/admin/dashboard`

---

## Next Steps

1. **Add translation keys** to `frontend/messages/fr.json` & `en.json`
2. **Implement WebSocket** for real-time updates
3. **Add E2E tests** with Playwright
4. **Mobile responsive** adjustments for smaller screens
5. **Dark mode** support (optional)

---

## File Sizes

```
Components created:
├── DriverDashboardClient.tsx    (350 lines)
├── AdminDashboardClient.tsx     (250 lines)
├── EarningsCard.tsx             (50 lines)
├── PayoutCard.tsx               (60 lines)
├── ReputationCard.tsx           (80 lines)
├── MetricsCard.tsx              (50 lines)
├── NotificationsPanel.tsx       (100 lines)
├── AdminStatsPanel.tsx          (60 lines)
├── AdminAlertsPanel.tsx         (80 lines)
└── AdminPayoutPanel.tsx         (80 lines)

Total: ~1,160 lines of React/TypeScript
```

---

## GitHub Commit

Ready to commit once translation keys are added:

```bash
git add frontend/app/driver/dashboard/
git add frontend/app/admin/dashboard/
git add frontend/components/zupdrive/
git add frontend/messages/
git commit -m "feat: ZupDrive driver & admin dashboards with real-time monitoring"
```
