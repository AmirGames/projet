# Plan de Complétion des 30% Manquants de ZupEat

**Objectif :** Transformer ZupEat de 70% → 100% (prêt pour lancement début 2027)

**Timeline :** 6-8 semaines (2 développeurs)

**Date :** 7 octobre 2026

---

## 📊 Analyse des 30% Manquants

### État actuel (70%)
✅ Backend API : 90% (routes, services, DB)
✅ Frontend client (zupeat.com) : 85% (pages, composants)
✅ Frontend commerçant (manager.zupeat.com) : 70% (dashboards)
🔄 App livreur (delivery.zupeat.com) : 50% (mobile, navigation)
🔄 Tests & QA : 20% (coverage faible)
🔄 DevOps & Monitoring : 30% (pas de CI/CD)

### Gaps identifiés (30%)

#### **1. App Livreur (delivery.zupeat.com)** - 50% → 100%
**Temps estimé : 2-3 semaines**

Manque :
- [ ] Navigation Google Maps intégrée (turn-by-turn)
- [ ] GPS tracking en temps réel
- [ ] Offline mode (cache local)
- [ ] Photo de livraison + signature client
- [ ] Chat avec client/restaurant
- [ ] Notifications push
- [ ] Historique livraisons

**Détail des tâches :**
```typescript
// 1. Intégration Google Maps
- Retrofit + Google Maps SDK
- Turn-by-turn navigation (sans quitter l'app)
- Tracking position en temps réel vers serveur
- Gestion de la batterie et données

// 2. Offline support
- Local cache avec Room Database
- Sync quand connecté
- Gestion conflits (offline vs online)

// 3. Confirmation de livraison
- Caméra (photo de la commande)
- Signature électronique ou code PIN
- Géolocalisation à la livraison
- Proof of delivery stocké

// 4. Communication
- Chat in-app (WebSocket)
- Notifications push
- Support technique

// 5. Données livreur
- Historique des courses
- Revenus du jour
- Statistiques performance
- Paiements
```

**Fichiers à créer/modifier :**
- `mobile/apps/zupeat-delivery/src/features/navigation/`
- `mobile/apps/zupeat-delivery/src/features/gps-tracking/`
- `mobile/apps/zupeat-delivery/src/features/delivery-proof/`
- `backend/src/modules/drivers/gps-tracking.service.ts` (new)
- `backend/src/modules/drivers/proof-of-delivery.service.ts` (new)

---

#### **2. Tests & QA** - 20% → 80%
**Temps estimé : 2-3 semaines**

Manque :
- [ ] Tests unitaires backend (40%+ coverage)
- [ ] Tests intégration API
- [ ] Tests E2E frontend
- [ ] Tests mobiles
- [ ] Performance testing
- [ ] Security testing (IDOR, auth)

**Détail :**
```typescript
// Backend (74k LOC, actuellement ~15% coverage)
// Target: 40%+ coverage (surtout domaines critiques)

Test suites prioritaires:
1. Authentication & Authorization (IDOR tests)
   - Login/register/logout
   - JWT rotation
   - Multi-tenant isolation
   - Permission checks

2. Payments & Stripe
   - Webhook handling (idempotence)
   - Refund flows
   - Dispute handling
   - Payout SEPA

3. Orders flow
   - Order creation → Payment → Delivery → Completion
   - State transitions
   - Cancellation rules
   - Notifications

4. Driver dispatch
   - Assignment logic
   - Availability checks
   - Zone validation

// Frontend (48k LOC, <5% coverage)
// Target: 20%+ coverage (critical paths)

Test suites:
1. Navigation & routing
2. Cart/checkout flow
3. Order tracking
4. User authentication
5. Form validations
```

**Fichiers :**
- Augmenter coverage `backend/__tests__/`
- Ajouter `frontend/__tests__/e2e/`
- `mobile/apps/__tests__/`

**Outils à setup :**
- Jest + coverage reports
- Playwright ou Cypress (E2E)
- Artillery (load testing)

---

#### **3. CI/CD & DevOps** - 30% → 90%
**Temps estimé : 1-2 semaines (CRITIQUE)**

**Manque (BLOCKERS P0) :**
- [ ] GitHub Actions CI/CD pipeline
- [ ] Build automation
- [ ] Deployment to Scaleway
- [ ] Database backups & restore
- [ ] Health checks & monitoring
- [ ] Logging centralization

**Détail :**

```yaml
# .github/workflows/ci.yml
on:
  push:
    branches: [main, claude/awesome-ride-m9lci8]
  pull_request:

jobs:
  backend:
    - npm run lint
    - npm run build
    - npm test
    - Upload coverage to Codecov

  frontend:
    - npm run lint
    - npm run build
    - npm test
    - Lighthouse audit

  deploy-staging:
    needs: [backend, frontend]
    if: push to main
    - Deploy to Scaleway staging
    - Run E2E tests
    - Performance check

  deploy-production:
    needs: [deploy-staging]
    if: tagged release
    - Deploy to Scaleway prod
    - Database backup
    - Health check
    - Monitoring setup
```

**Fichiers à créer :**
- `.github/workflows/ci.yml` (tests)
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-prod.yml`
- `deploy/backup-database.sh` (new)
- `deploy/restore-database.sh` (new)
- `deploy/health-check.sh` (new)
- Monitoring (Datadog/Prometheus)

---

#### **4. Fonctionnalités Manquantes (Backend)** - 10% remaining
**Temps estimé : 1-2 semaines**

Manque :
- [ ] Promo codes & discounts (backend routes)
- [ ] Loyalty program (points, rewards)
- [ ] Advanced reporting
- [ ] API rate limiting (partiel)
- [ ] Advanced notifications (SMS, WhatsApp)
- [ ] Analytics dashboard

**Priorité pour MVP :** Promo codes seulement

```typescript
// backend/src/modules/promotions/promo-code.routes.ts
POST   /api/promo-codes/validate          // Vérifier code
POST   /api/orders/:id/apply-promo       // Appliquer à commande
GET    /api/promo-codes/active           // Codes actifs

// backend/src/modules/promotions/promo-code.service.ts
- Validation code (actif, limites d'utilisation)
- Calcul réduction
- Vérifier conditions (montant min, première commande, etc.)
- Journal d'utilisation
```

---

#### **5. Frontend Commerçant (manager.zupeat.com)** - 70% → 90%
**Temps estimé : 1 semaine**

Manque :
- [ ] Dashboard complet (chiffre affaires, commandes, livreurs)
- [ ] Gestion horaires d'ouverture (avancé)
- [ ] Gestion promotions/codes promo
- [ ] Rapports détaillés (export CSV, analytics)
- [ ] Notifications en temps réel
- [ ] Gestion support tickets

**Fichiers :**
- `frontend/app/merchant/dashboard/`
- `frontend/app/merchant/promotions/`
- `frontend/app/merchant/reports/`

---

## 🎯 Priorités (P0 → P2)

### **P0 (Blockers) - DOIT être fait avant launch**
1. ✅ Tests (20%+ minimum)
2. ✅ CI/CD pipeline
3. ✅ Database backups
4. ✅ Health monitoring
5. ✅ App livreur (navigation, offline)

**Temps : 3-4 semaines**

### **P1 (Important) - Avant launch, peut être moins polish**
1. ✅ Promo codes & discounts
2. ✅ Advanced dashboard commerçant
3. ✅ Logging centralization
4. ✅ Performance testing

**Temps : 1-2 semaines**

### **P2 (Nice to have) - Peut être après launch**
1. 🟡 Loyalty program
2. 🟡 Advanced analytics
3. 🟡 SMS/WhatsApp notifications
4. 🟡 Webhook versioning

---

## 📋 Checklist Complétion

### Semaine 1-2 : Foundation (P0)
- [ ] Setup CI/CD GitHub Actions
- [ ] Database backups script + test restore
- [ ] Health checks monitoring
- [ ] Logging centralization
- [ ] Start app livreur refactor

### Semaine 3-4 : App Livreur + Tests
- [ ] Google Maps intégration (complete)
- [ ] Offline mode (Room DB)
- [ ] Proof of delivery
- [ ] Backend unit tests (30%+)
- [ ] Frontend E2E tests (critical paths)

### Semaine 5-6 : Features + QA
- [ ] Promo codes (backend + frontend)
- [ ] Dashboard commerçant (completion)
- [ ] Performance testing
- [ ] Mobile app testing (all flows)
- [ ] Security audit (IDOR, auth)

### Semaine 7-8 : Final Polish + Launch Prep
- [ ] Load testing (Stripe, API)
- [ ] Documentation
- [ ] Runbook pour operations
- [ ] Final E2E testing
- [ ] User acceptance testing

---

## 📊 Estimations d'Effort

| Tâche | Semaines | FTE | Priorité |
|-------|----------|-----|----------|
| CI/CD Pipeline | 1 | 0.5 | P0 |
| Database Backups | 0.5 | 0.5 | P0 |
| App Livreur (nav, offline) | 2.5 | 1 | P0 |
| Tests (30-40% coverage) | 2 | 1 | P0 |
| Promo codes | 1 | 0.5 | P1 |
| Dashboard commerçant | 1 | 0.5 | P1 |
| Performance & Security | 1.5 | 0.5 | P1 |
| Final Polish & Docs | 1 | 0.5 | P2 |
| **TOTAL** | **10-11 weeks** | **1-1.5 FTE** | — |

**Optimisation possible :** Paralléliser (2 devs) → 6-8 semaines

---

## 🚀 Démarrage Immédiat

### Jour 1 (Aujourd'hui)
```bash
# 1. Créer branches de travail
git checkout -b feat/ci-cd-pipeline
git checkout -b feat/app-livreur-completion
git checkout -b feat/test-coverage

# 2. Setup CI/CD
# - Créer .github/workflows/ci.yml
# - Créer .github/workflows/deploy.yml
# - Push initial workflow

# 3. Database backup
# - Script backup-database.sh
# - Test restore procedure
```

### Jour 2-3
```bash
# 1. App Livreur
# - Audit code mobile
# - Google Maps SDK setup
# - Plan offline mode

# 2. Tests
# - Setup test coverage reporting
# - Créer test suite backend
# - Créer test suite frontend
```

---

## 🎁 Livrables Finaux (à launch)

✅ ZupEat 100% fonctionnel :
- Client app (zupeat.com) — commande repas
- Merchant dashboard (manager.zupeat.com) — gestion restaurant
- Driver app (delivery.zupeat.com) — livraison avec navigation
- API backend — routes complètes
- Tests — 40%+ backend, 20%+ frontend
- CI/CD — automated tests & deploy
- Monitoring — logs, alerts, backups

✅ Capacité : 10 restaurants + quelques livreurs

✅ Prêt pour "début 2027" launch

---

## Questions Ouvertes

1. **App Livreur** : React Native ou Android native ? (actuellement Expo)
2. **Promo codes** : Faut-il des referrals aussi ?
3. **Loyalty** : Peut-on le repousser après launch ?
4. **Analytics** : Quel niveau de détail pour les rapports ?
5. **Notifications** : SMS obligatoire ou email suffit ?

---

**Responsable:** À assigner
**Status:** À commencer immédiatement
**Deadline:** 8 semaines (mi-novembre 2026)
