# NEXT STEPS - Actions Immédiatement Prioritaires

**Date:** 2026-10-07  
**Status:** ZupEat 70% MVP-ready, ZupDrive 10% early-stage  
**Priority Focus:** Production readiness before Q4 2026 launch

---

## 🔴 CRITICAL PATH (P0 - Blockers)

### 1. CI/CD Pipeline Setup (Est. 3-5 days)
**Why:** Manual deployment is risky, no automated testing on PRs

```bash
# Create .github/workflows/
# Add: test, lint, build, deploy workflows
# Test on: PRs, main branch
# Coverage: backend Jest + frontend E2E scripts
```

**Files to create:**
- `.github/workflows/test.yml` — Run Jest, ESLint
- `.github/workflows/build.yml` — Build backend + frontend
- `.github/workflows/deploy.yml` — Deploy to Scaleway

**Reference:** Standard Node.js + Next.js GitHub Actions

---

### 2. Increase Test Coverage (Est. 5-10 days)

**Current State:**
- Backend: 106 tests, ~15-20% coverage
- Frontend: 1 Jest test, <5% coverage

**Target Before Launch:**
- Backend: 200+ tests, 60%+ coverage
- Frontend: 50+ tests, 30%+ coverage

**High-Priority Test Gaps:**
```bash
# Backend - Security critical
backend/src/modules/auth/cloisonnement.test.ts          # IDOR coverage
backend/src/modules/payments/stripe-webhook.test.ts    # Webhook signature + idempotence
backend/src/modules/orders/order-lifecycle.test.ts     # State transitions
backend/src/modules/drivers/dispatch-concurrent.test.ts # Race conditions

# Frontend - Core flows
frontend/app/checkout/__tests__/payment-flow.test.tsx  # Complete payment
frontend/app/merchant/__tests__/order-management.test.tsx # Restaurant workflow
frontend/app/driver/__tests__/course-acceptance.test.tsx  # Driver actions
```

**Tools:** Jest, React Testing Library, Pytest (Python if needed)

---

### 3. Database Backup Strategy (Est. 1-2 days)

**Current:** Not documented in `deploy/`

**Action Items:**
- [ ] Define backup frequency (daily, hourly?)
- [ ] Choose backup storage (Scaleway S3, AWS, on-site?)
- [ ] Test restore procedure
- [ ] Document in `DEPLOIEMENT-SCALEWAY.md`

**Script needed:**
```bash
deploy/backup-database.sh      # Automated backup
deploy/restore-database.sh     # Restore from backup
```

---

### 4. Centralize Logging (Est. 3-5 days)

**Current:** Local Winston logs, no centralization

**Options:**
- ELK Stack (self-hosted)
- Datadog (SaaS)
- LogRocket (frontend monitoring)
- Sentry (error tracking)

**Minimum Viable:**
- [ ] Forward backend logs to centralized system
- [ ] Track errors with stack traces
- [ ] Alert on production issues

**Files to update:**
- `backend/src/config/logger.ts` — Add transport for external service
- `DEPLOIEMENT-SCALEWAY.md` — Document logging setup

---

### 5. ZupDrive MVP Scope Definition (Est. 2-3 days)

**Current Status:** 10% - scattered work

**Decision Needed:**
- [ ] What's in MVP for end-2027? (chauffeur onboarding, matching, payment?)
- [ ] What's not? (promotions, ratings, long-term stats?)
- [ ] Resource allocation (backend devs, mobile devs, QA)

**Create:**
- `docs/zupdrive-mvp-scope.md` — 1-page MVP specification
- `docs/zupdrive-roadmap.md` — Phased development plan

**Key Questions:**
1. Do chauffeurs need Google Maps integration in MVP?
2. Do we use Stripe for chauffeur payments or separate system?
3. Which mobile platform first: iOS or Android?
4. Admin dashboard requirements?

---

## 🟡 HIGH PRIORITY (P1 - Before Launch)

### 6. Fix ESLint Warnings (Est. 2-3 days)

**Current:** 401 warnings tolerated

```bash
cd backend
npm run lint  # Shows all warnings
# Fix: any types, unused vars, namespaces
# Target: 0 warnings
```

**Quick wins:**
- Replace `any` with proper types
- Remove unused variables
- Convert namespaces to regular imports

**Files with most issues:**
- `backend/src/modules/admin/` (many routes with `any`)
- `backend/src/config/logger.ts`
- `backend/src/middleware/errorHandler.ts`

---

### 7. Complete Mobile App CLAUDE.md (Est. 2-3 days)

**Current:** No CLAUDE.md/AGENTS.md for mobile apps

**Create for each app:**
- `mobile/apps/customer/CLAUDE.md` — Rules, architecture
- `mobile/apps/delivery/CLAUDE.md`
- `mobile/apps/merchant/CLAUDE.md`
- `mobile/apps/admin/CLAUDE.md`

**Minimum Content:**
- Project overview
- Stack (Expo, libraries)
- Architecture (screens, navigation)
- Features roadmap
- Testing strategy
- Commands (dev, build, test)

---

### 8. Stripe Security Audit (Est. 3-5 days)

**Focus:** Payment edge cases

**Test scenarios needed:**
- [ ] 3D Secure / SCA authentication flow
- [ ] Declined card handling
- [ ] Refund processing
- [ ] Webhook signature verification
- [ ] Race condition: concurrent payments same order
- [ ] Partial refund logic

**Files to audit:**
- `backend/src/modules/payments/payment.service.ts` (31k lines!)
- `backend/src/modules/webhooks/` (Stripe event handling)

**Create:**
- `backend/src/modules/payments/__tests__/stripe-edge-cases.test.ts`

---

### 9. Performance Baseline (Est. 2-3 days)

**Tools:** Lighthouse, K6 load testing

**Metrics to capture:**
```
Backend:
- API response time (p50, p95, p99)
- Database query performance (slow queries?)
- Redis hit rate
- Dispatch algorithm efficiency (10k+ orders?)

Frontend:
- Lighthouse score (target: 90+)
- Core Web Vitals (LCP, FID, CLS)
- Bundle size
- Load time (3G throttled)
```

**Create baseline:**
```bash
frontend/scripts/lighthouse.mjs   # Automated Lighthouse
backend/load-test/k6-scenario.js  # Load test scenarios
```

---

### 10. ZupDrive Scope Lock (Est. 1 day)

Once decision made on MVP scope (item #5), lock it in:
- Create GitHub Project for ZupDrive Q4 2026
- Assign team members
- Set milestones

---

## 🟢 MEDIUM TERM (P2 - 1-2 months)

### 11. Design System (Component Library)
- Document Tailwind patterns (buttons, forms, layouts)
- Create reusable components library
- Brand guidelines (ZupEat orange, ZupDrive blue)

### 12. Frontend Test Suite
- Expand Jest tests to 30%+ coverage
- Test critical flows: checkout, order tracking
- Mock API calls

### 13. Maps Integration
- Uncomment Google Maps code
- Test turn-by-turn navigation for drivers
- Test delivery zone visualization

### 14. SMS Notifications
- Integrate Twilio or SendGrid SMS
- Test SMS delivery (confirmation, status updates)

### 15. Assistant IA Production
- Deploy Ollama or integrate Claude API
- Move from local testing to production

---

## 📋 Actionable Checklist

### Week 1 (Oct 7-13)
- [ ] Create GitHub Actions workflow files (.github/workflows/)
- [ ] Define ZupDrive MVP scope in docs/zupdrive-mvp-scope.md
- [ ] Create CLAUDE.md for each mobile app
- [ ] Start fixing ESLint warnings (target: <100)
- [ ] Document backup/restore strategy

### Week 2 (Oct 14-20)
- [ ] Merge CI/CD PR and test on main branch
- [ ] Complete 50 new backend tests
- [ ] Audit Stripe payment flow with test scenarios
- [ ] Setup log centralization (ELK or Datadog trial)
- [ ] Create performance baseline (Lighthouse + K6)

### Week 3+ (Oct 21+)
- [ ] Finish ESLint fix (0 warnings)
- [ ] 50+ frontend tests
- [ ] Complete ZupDrive Q4 roadmap
- [ ] Production deployment dry-run
- [ ] Full E2E test run (all verif-*.mjs scripts)

---

## 🎯 Success Criteria (Production Readiness)

**Before launching ZupEat to production:**

- [ ] CI/CD pipeline passing all tests
- [ ] Backend test coverage >= 60%
- [ ] Frontend test coverage >= 30%
- [ ] ESLint: 0 warnings
- [ ] Database backups automated & tested
- [ ] Logs centralized & monitored
- [ ] Stripe payments: SCA flow tested
- [ ] Performance baseline established
- [ ] Security audit passed (IDOR, CSRF, XSS)
- [ ] Load tested (1k concurrent users)
- [ ] Rollback procedure documented & tested
- [ ] Incident response playbook created
- [ ] Mobile apps: feature roadmap defined

---

## 📞 Stakeholder Communication

**For executive/product:**
1. ZupEat MVP ready end-Oct 2026
2. ZupDrive scope locked → development starts Q4 2026
3. ZupDrive launch end-2027 (achievable with current team)
4. No "MVP delay risk" if CI/CD + testing solidified now

**For development team:**
1. Test coverage will increase significantly (not "test less")
2. CI/CD will slow down deployments initially, speed them up long-term
3. Better error tracking (logs) = faster debugging
4. Clear ZupDrive roadmap = no mid-sprint pivots

---

## 📚 Reference Documents

- **ANALYSE_COMPLÈTE.md** — Full analysis (741 lines)
- **ANALYSE_GUIDE.md** — Navigation guide
- **PATHS_REFERENCE.txt** — Key file paths
- **CLAUDE.md** — Development rules (existing)
- **backend/ARCHITECTURE.md** — Backend patterns
- **frontend/ARCHITECTURE.md** — Frontend patterns

---

**Prepared by:** Claude Code Agent  
**Date:** 2026-10-07  
**Repository:** AmirGames/projet (branch: claude/awesome-ride-m9lci8)
