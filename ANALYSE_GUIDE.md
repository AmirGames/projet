# Guide de Navigation - Analyse Zupone

Deux fichiers ont été générés pour comprendre le repository:

## 📄 Fichiers d'Analyse

### 1. **ANALYSE_COMPLÈTE.md** (741 lignes)
Rapport détaillé avec:
- Executive summary
- Architecture générale
- Backend architecture (74k LOC, 29 modules, 106 tests)
- Frontend architecture (48k LOC, 7 espaces, 30+ E2E scripts)
- Applications mobiles (Expo - preview stage)
- Infrastructure & déploiement (Scaleway)
- Tests automatisés (coverage analysis)
- Documentation review
- Points forts et faibles
- Bugs potentiels
- Recommandations prioritaires (P0, P1, P2, P3)

**Quand l'utiliser:** Pour une compréhension complète du projet, planification de sprint, onboarding d'équipe.

### 2. **ANALYSE_SUMMARY.json** (200+ lignes)
Données structurées JSON avec:
- Statistiques de codebase
- État des projets (ZupEat 70%, ZupDrive 10%)
- Stack technologique
- Forces et faiblesses
- Domaines critiques
- Recommandations prioritaires
- Fichiers clés à revoir
- Instructions de déploiement

**Quand l'utiliser:** Pour parsing automatisé, dashboards, métriques, automation scripts.

---

## 🗺️ Navigation du Repository

### Pour comprendre l'architecture

**Backend:**
- Lire: `backend/ARCHITECTURE.md` (conventions, modules, recettes)
- Clé: `backend/src/modules/` (29 domaines métier)
- Sécurité: `backend/src/modules/auth/cloisonnement.middleware.ts`

**Frontend:**
- Lire: `frontend/ARCHITECTURE.md` (espaces, routage, composants)
- Clé: `frontend/app/` (routing par espace: superowner, merchant, driver, etc.)
- Traductions: `frontend/messages/` (fr.json, en.json)

**Infrastructure:**
- Deployment: `deploy/zup.sh`, `deploy/Caddyfile`
- Local: `docker-compose.yml`, `./start.sh`

### Pour comprendre les domaines critiques

**Paiements & Webhooks (🔴 Critique):**
- `backend/src/modules/payments/payment.service.ts` (Stripe integration)
- `backend/src/modules/payouts/` (SEPA reversals)
- `backend/src/modules/webhooks/`

**Sécurité Multi-tenant (🔴 Critique):**
- `backend/src/modules/auth/cloisonnement.middleware.ts`
- Tests: `backend/src/modules/auth/__tests__/cloisonnement.test.ts`
- IDOR tests: `backend/src/modules/drivers/__tests__/drivers-idor.test.ts`

**Dispatch & Livreurs (🟡 Complexe):**
- `backend/src/modules/drivers/dispatch.service.ts` (60k lines!)
- Tests: `backend/src/modules/drivers/__tests__/`

**Temps Réel & Notifications (🟡 Complexe):**
- `backend/src/modules/realtime/` (Socket.io)
- `backend/src/modules/notifications/`
- Pattern: Outbox (events durable)

### Pour débuter du développement

1. **Setup local:**
   ```bash
   ./start.sh                    # PostgreSQL, Redis, Mailpit
   cd backend && npm run dev     # API :3001
   cd frontend && npm run dev    # Frontend :3000
   ```

2. **Lire les règles:**
   - `CLAUDE.md` — Strict rules for development
   - `backend/ARCHITECTURE.md` — Backend patterns
   - `frontend/ARCHITECTURE.md` — Frontend patterns

3. **Exécuter les tests:**
   ```bash
   cd backend && npm test                  # Jest
   cd frontend && npm run verif:domaines   # E2E
   ```

4. **Linter:**
   ```bash
   cd backend && npm run lint              # 401 warnings tolerated
   cd frontend && npm run lint             # max-warnings 0
   ```

---

## 📊 État du Projet (Snapshot Oct 2026)

| Composant | Statut | Coverage | Notes |
|-----------|--------|----------|-------|
| **ZupEat (Food Delivery)** | 70% MVP | 15-20% | Prêt pour Q4 2026 launch |
| **Backend API** | 100% | 20% | 74k LOC, 29 modules, solide |
| **Frontend** | 100% | 5% | 48k LOC, 7 espaces, complet |
| **Payments (Stripe)** | 100% | ✅ | Webhook sécurisés, tested |
| **Driver Dispatch** | 90% | 10% | Complexe (60k lines), besoin optim |
| **Mobile Apps** | 10% | - | Expo scaffold only |
| **ZupDrive (VTC)** | 10% MVP | - | MVP fin 2027 target |
| **CI/CD** | 0% | - | A implémenter |
| **Monitoring** | 20% | - | Logs locaux, pas de centralization |
| **Documentation** | 80% | - | 73k line CONNAISSANCES-PROJET.md |

---

## ⚠️ Priorités Immédiatement

### 🔴 Blockers avant production (P0)
1. CI/CD pipeline (GitHub Actions)
2. Test coverage: 60%+ backend, 30%+ frontend
3. Database backups strategy
4. Log centralization (ELK/Datadog)
5. Production deployment checklist

### 🟡 Before first release (P1)
6. Fix 401 ESLint warnings
7. Complete mobile app CLAUDE.md
8. Stripe SCA/3D Secure testing
9. Performance baseline (Lighthouse)
10. ZupDrive scope for end 2027

### 🟢 Medium term (P2)
11. Design system (components library)
12. Frontend tests suite
13. Maps integration
14. SMS notifications
15. Assistant IA production

---

## 📚 Ressources Documentaires

### Métier ZupEat (très détaillé)
- `CONNAISSANCES-PROJET.md` — 73k lignes!
- `E2E-TEST-PLAN.md` — Scénarios de test
- `COMPTABLE-FONCTIONNALITES.md` — Accounting features
- `DOCUMENTATION-WEBHOOKS.md` — Webhook spec

### Architecture
- `backend/ARCHITECTURE.md` — 5k, conventions
- `frontend/ARCHITECTURE.md` — 7k, routing
- `CLAUDE.md` — 15k, strict rules

### Infrastructure
- `DEPLOIEMENT-SCALEWAY.md` — Production setup
- `deploy/env.production.example` — Config template

---

## 🧠 Équipe & Contact

Projet: **Zupone Group**
- ZupEat: Food delivery platform
- ZupDrive: Passenger transport (VTC)

Basé en Belgique (Namur).

---

## 🚀 Prochaines étapes

1. **Lire ANALYSE_COMPLÈTE.md** pour comprendre état général
2. **Consulter CLAUDE.md** avant toute modification
3. **Cloner et tester localement:** `./start.sh`
4. **Identifier composant à développer**
5. **Vérifier couverture de tests** pour ce domaine
6. **Suivre patterns** de backend/ARCHITECTURE.md

---

**Généré:** 2026-10-07  
**Branche:** claude/awesome-ride-m9lci8  
**Version:** Analyse v1.0
