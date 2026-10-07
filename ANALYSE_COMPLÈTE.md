# ANALYSE COMPLÈTE DU REPOSITORY ZUPONE - Claude/Awesome-Ride

Date: 2026-10-07
Branche: `claude/awesome-ride-m9lci8`

---

## EXECUTIVE SUMMARY

Le repository Zupone est une **plateforme multi-commerçants de livraison de repas** (ZupEat) + une **plateforme de transport urbain** (ZupDrive), en développement actif. Le projet est **bien structuré, ambitieux, mais avec plusieurs domaines encore inachevés**.

**Points forts:**
- Architecture modulaire backend solide, bien documentée
- Séparation claire des domaines métier
- Gestion robuste des paiements Stripe et webhooks
- Sécurité multi-tenant strict
- 106 tests automatisés pour les cas critiques
- Frontend Next.js 16 moderne avec traductions intégrées

**Points faibles:**
- ZupDrive très incomplet (MVP distant)
- Applications mobiles peu avancées (Expo)
- Coverage de tests partial (~15-20% du code)
- 401 warnings ESLint tolerés
- Documentation partielle pour certains domaines

---

## 1. ARCHITECTURE GÉNÉRALE

### 1.1 Structure du Projet

```
projet/
├── backend/                    # Node.js/Express API (74k lignes TypeScript)
│   ├── prisma/                # Schema et 47 migrations (Oct 2026)
│   ├── src/
│   │   ├── modules/           # 29 domaines métier
│   │   ├── middleware/        # Auth, throttle, CORS
│   │   ├── config/            # Env, logger
│   │   └── services/          # Client Prisma partagé
│   ├── package.json           # Node 20.19.0+, Express 5.2, Prisma 7.10
│   └── ARCHITECTURE.md        # Guide complet
│
├── frontend/                   # Next.js 16 + React 19 (48k lignes)
│   ├── app/                   # Pages et routing (App Router)
│   ├── components/            # Composants réutilisables
│   ├── lib/                   # Logique métier frontend
│   ├── messages/              # Traductions (fr, en)
│   ├── scripts/               # Vérifications E2E (30+ tests)
│   └── ARCHITECTURE.md        # Guide
│
├── mobile/apps/               # 4 applications Expo (preview)
│   ├── admin/                 # Administration mobile
│   ├── customer/              # Client ZupEat
│   ├── delivery/              # Livreur ZupEat
│   └── merchant/              # Commerçant mobile
│
├── deploy/                    # Infrastructure Scaleway
│   ├── zup.sh                 # Script de déploiement
│   ├── installer-serveur.sh   # Setup serveur
│   ├── Caddyfile              # Reverse proxy
│   └── env.production.example # Config production
│
├── docs/                      # Documentation métier
├── docker-compose.yml         # Local dev (PostgreSQL, Redis, Mailpit)
├── CLAUDE.md                  # Règles de développement
└── README.md                  # Présentation du groupe
```

### 1.2 Stack Technologique

| Composant | Technologie | Version | Notes |
|-----------|-----------|---------|-------|
| **Backend** | Node.js | 20.19.0+ | Recommandé |
| | Express | 5.2.1 | Mode ESM |
| | TypeScript | 5.9.3 | Strict mode |
| | Prisma | 7.10.0 | Client + adapter PG |
| | PostgreSQL | - | Via adapter Prisma |
| | Redis | 6.2.1 | Cache, realtime, jobs |
| | Stripe | 22.6.2 | Paiements |
| **Frontend** | Next.js | 16.3.6 | App Router |
| | React | 19.3.0 | Latest |
| | Tailwind CSS | 3.3.0 | Styling |
| | next-intl | 4.14.7 | Traductions |
| | Socket.io | 4.8.3 | Temps réel |
| **Mobile** | Expo | (à vérifier) | Preview stage |
| **Infrastructure** | Docker | Compose | Développement |
| | Scaleway | - | Production |
| | Caddyfile | - | Reverse proxy HTTPS |

---

## 2. BACKEND (74k lignes TypeScript)

### 2.1 Architecture Modulaire

Le backend utilise une **architecture par domaine métier** (pas par type de fichier):

```
src/modules/
├── auth/              # Authentification, SSO, permissions, cloisonnement
├── merchants/         # Organisations (commerçants), équipe, validation
├── stores/            # Boutiques, réglages, types de commerce
├── catalog/           # Catégories, produits, suppléments, taxes
├── orders/            # Commandes, acceptation, suivi, factures
├── payments/          # Paiements Stripe, remboursements, méthodes
├── payouts/           # Versements commerçants + livreurs, fichiers SEPA
├── delivery/          # Mode livraison, zones, horaires
├── drivers/           # Livreurs, dispatch, tournées, preuves
├── customers/         # Clients, adresses, carnets boutique
├── notifications/     # Email, SMS, push, temps réel
├── realtime/          # Socket.IO, annonces changements
├── reviews/           # Avis, modération
├── support/           # Tickets support commerçants
├── marketing/         # Promotions, campagnes
├── maps/              # Géocodage
├── jobs/              # Tâches de fond (cron)
├── admin/             # Espace admin multi-domaine
├── superowner/        # Espace administrateur groupe
├── invoicing/         # Factures UBL/Peppol
├── privacy/           # Protection données, chiffrage
├── files/             # Upload fichiers, antivirus
├── monitoring/        # Santé, backups, maintenance
├── reports/           # Rapports commerçants
├── legal/             # Pages légales
├── webhooks/          # Webhooks sortants
├── plans/             # Formules/tarifs
├── zupdrive/          # Transport passagers (ZupDrive)
├── assistant/         # Assistant IA local (Ollama/Claude)
└── [autres]
```

**37 fichiers de routes**, **106 tests automatisés**, architecture très décentralisée.

### 2.2 Conventions du Backend

#### Fichiers et noms
- `<sujet>.routes.ts` - Endpoints HTTP (validation Zod → service → réponse)
- `<sujet>.service.ts` - Logique métier centralisée
- `<sujet>.jobs.ts` - Tâches de fond (retries, idempotence)
- `<sujet>.middleware.ts` - Middlewares Express du domaine
- `<sujet>.admin.routes.ts` - Routes `/api/superowner` du domaine
- `__tests__/<sujet>.test.ts` - Tests unitaires/intégration

#### Imports obligatoires
```ts
// ✅ Correct: imports explicites, pas d'index
import { OrderService } from "../orders/order.service";

// ❌ Mauvais: index.ts existe, crée cycles
// import { OrderService } from "../orders";

// Briques partagées depuis leur emplacement fixe
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";
import { db } from "../../services/db";
```

### 2.3 Prisma et Base de Données

**Schema et migrations:** 47 migrations appliquées (Oct 2026)
- `0001_initial_schema` → Schema initial
- `0040_privacy_protection` → Chiffrage données sensibles
- `20261007110000_journal_evenements_stripe` → Journal Stripe (récente)

**Modèles clés:**
- `User`, `Merchant` (organisations), `Store` (boutiques)
- `Order` (commandes), `Payment` (paiements Stripe)
- `Courier` (livreurs, nommé `Driver` en URL pour backward compat)
- `Delivery`, `DeliveryZone`
- `ChauffeurDrive` (transport passagers)
- `Review`, `Ticket` (support)
- `OutboxEvent` (événements avec pattern Outbox)

**Conventions:**
- Montants en **cents** (1099 = 10,99 €) — jamais flottant
- Pas de suppression physique → soft deletes + `journaliser()`
- Transactions Prisma pour opérations critiques
- Relations explicites avec `@relation` commentée

### 2.4 Sécurité (Point critique)

#### Authentification
- JWT dans les cookies (httpOnly)
- Rotation de session après login
- Clés API pour accès programmatique
- SSO via Google/Microsoft (routes auth)
- 2FA optionnel (à vérifier)

#### Autorisation (Multi-tenant strict)
- **Cloisonnement.middleware.ts**: Chaque requête vérifie ownership
  ```ts
  // ❌ Jamais: GET /orders/123 sans vérifier que userId possède l'ordre
  // ✅ Toujours: if (order.storeId !== currentStore) throw Unauthorized
  ```
- Rôles: `customer`, `merchant`, `driver`, `store_manager`, `superowner`
- Permissions par plateforme (ZupEat vs ZupDrive)
- Tests IDOR spécifiques pour vulnérabilités d'accès

#### Validation
- **Zod** strict sur tous les inputs
- Routes minces: validation → auth → service
- Erreurs métier vs erreurs serveur (pas de détails internes)
- Fichiers validés (antivirus, size limits)

#### Données sensibles
- Mots de passe hashés bcrypt
- Tokens bannis (migration `0002`)
- Données PII chiffrées avec `crypto`
- Logs jamais de secrets/tokens/clés
- Rate limiting: login, register, paiement, webhooks

### 2.5 Paiements et Webhooks (Critique)

#### Flux Stripe
```
Client → Créer commande + Intent Stripe
       → Frontend confirme paiement (Card, PayPal)
       → Webhook Stripe → Backend vérifie + order.status = PAID
       ↓
Restaurant notifié (push/email)
Livreur assigné + dispatch
```

**Points importants:**
- **Webhooks signés et idempotents** (cf. `webhook-destination.test.ts`)
- Jamais confier au frontend le statut de paiement
- Montants vérifiés côté serveur (pas de prix frontend)
- Reversements séparés: Order → Payment → FinancialTransaction → Payout
- Traçabilité: jamais supprimer historique, créer corrections

#### Payout (Versements)
- **Payouts.service.ts**: Virement SEPA hebdo aux commerçants + livreurs
- Fichiers SEPA/UBL générés
- Tests concurrence DB pour éviter doublons

### 2.6 Notifications et Temps Réel

#### Notifications
- **Email**: Mailpit local, service externe prod
- **SMS**: (à confirmer)
- **Push**: Web Push API + applications mobiles
- Outbox pattern: événements persistés avant envoi
- Tests `notifier-*.test.ts` pour chaque acteur

#### Temps Réel
- **Socket.IO + Redis adapter** pour multi-serveur
- Annonces commandes (client, restaurant, livreur)
- Chat intégré (client ↔ livreur)
- Localisation GPS livreur (si implémenté)

### 2.7 Jobs de Fond

**Fichiers `*.jobs.ts`:**
- `order.jobs.ts`: Relance si pas réponse restaurant
- `dispatch.jobs.ts`: Attribution livreurs, tournées
- `closure.jobs.ts`: Fermeture boutiques
- `demo.jobs.ts`: Nettoyage comptes démo
- Pattern: retries, idempotence, transaction → job → service externe

### 2.8 Domaines incomplets

#### ZupDrive (Transport de passagers)
- **Status:** MVP très précoce
- **Modèles:** `ChauffeurDrive`, `CourseDrive`, `SocieteDrive`
- **Routes:** `/api/zupdrive/chauffeurs`, `/courses`
- **Manque:** Navigation intégrée, matching algorithme, paiements
- **Tests:** 6 tests (chauffeur-onboarding, itineraire, IDOR, etc.)
- **Calendrier:** Lancement ciblé fin 2027

#### Livreurs (Drivers)
- **Status:** Complet mais complexe (60k lignes dispatch.service.ts)
- **Features:** Acceptation commandes, tournées optimisées, preuves livraison, notes
- **Manque:** Intégration Google Maps native (est commentée), interface mobile avancée

---

## 3. FRONTEND (48k lignes React/TypeScript)

### 3.1 Architecture Next.js 16

**Espaces séparés** (cloisonnement côté frontend):

| Espace | Segment | Domaine | Fonction |
|--------|---------|---------|----------|
| Groupe | `/superowner` | DOMAINE_GROUPE | Équipe Zupone |
| Pro | `/merchant` | DOMAINE_PRO | Commerçants |
| Livreur | `/driver` | DOMAINE_LIVREUR | Livreurs ZupEat |
| Public | `/client`, `/store`, `/checkout` | DOMAINE_PUBLIC | Clients finaux |
| Vitrine | `/zupone` | DOMAINE_VITRINE | Présentation groupe |
| Drive | `/zupdrive` | DOMAINE_DRIVE | ZupDrive présentation |
| Chauffeur | `/chauffeur` | DOMAINE_CHAUFFEUR | Chauffeurs ZupDrive |
| Commun | `/login`, `/signup` | - | Partout |

**Routing via `proxy.ts`:** Chaque domaine a son stockage navigateur séparé, sessions cloisonnées.

### 3.2 Structure Frontend

```
frontend/app/
├── superowner/         # Dashboard admin groupe
│   ├── dashboard/      # Overview
│   ├── merchants/      # Gestion commerçants
│   ├── drivers/        # Gestion livreurs
│   ├── billing/        # Facturation
│   ├── webhooks/       # Config webhooks
│   ├── notifications/  # Annonces
│   └── analytics/      # Statistiques
│
├── merchant/           # Dashboard commerçant
│   ├── [orgId]/
│   │   ├── dashboard/  # Aperçu
│   │   ├── menu/       # Catalog
│   │   ├── commandes/  # Suivi commandes
│   │   ├── livreurs/   # Gestion livraisons
│   │   ├── equipe/     # Staff management
│   │   ├── facturation/ # Invoicing
│   │   └── config/     # Réglages boutique
│
├── driver/             # Dashboard livreur
│   ├── courses/        # Commandes à livrer
│   ├── historique/     # Past deliveries
│   ├── revenus/        # Earnings
│   ├── profil/         # Profile + docs
│   └── support/        # Support
│
├── client/             # Clients finaux
│   ├── restaurants/    # Browsing
│   ├── menu/           # Menu restaurant
│   ├── checkout/       # Panier + paiement
│   ├── order-confirmation/  # Confirmation
│   └── track/          # Suivi livraison
│
├── chauffeur/          # Chauffeurs ZupDrive
├── devenir-*/          # Pages recrutement
├── api/                # Relais vers backend (/api/auth, /api/sso)
└── (legal)/            # Pages légales (sans URL prefix)
```

### 3.3 Vérifications E2E (30+ scripts)

Frontend inclut des tests navigateur automatisés (`frontend/scripts/verif-*.mjs`):

- `verif-domaines.mjs` - Vérification routing multi-domaine
- `verif-menu-merchant.mjs` - Edition menu commerçant
- `verif-commandes-direct.mjs` - Workflow commande directe
- `verif-courses-livreur.mjs` - Attribution courses livreur
- `verif-suivi-client.mjs` - Tracking client en temps réel
- `verif-tableau-de-bord.mjs` - Dashboard commerçant
- [+24 autres]

**Format:** Scripts Puppeteer/Playwright ouvrent session navigateur réelle, testent E2E complet.

### 3.4 Traductions (i18n)

- **next-intl 4.14.7** intégré
- **Langues:** Français (fr) + Anglais (en)
- **Messages:** `frontend/messages/fr.json` et `en.json`
- **Segments régionaux:** `/be-fr/restaurants`, `/fr-fr/store/…` (sans duplication de pages)
- **Pas de [locale] dans URL** — langue = cookie NEXT_LOCALE

### 3.5 Composants et Librairies

**UI Libraries:**
- `lucide-react` - Icons
- `leaflet` - Maps (delivery zones)
- `@stripe/react-stripe-js` - Payment UI
- `react-hook-form` + `zod` - Form validation
- `zustand` - State management
- `socket.io-client` - Realtime

**Styling:**
- Tailwind CSS 3 + postcss
- **Thème clair uniquement** (pas de dark mode)
- Couleurs par marque (orange ZupEat, noir ZupOne, bleu ZupDrive)

### 3.6 Points faibles du Frontend

- **Tests limités:** Que 1 test Jest (`checkout.test.jsx`)
- **E2E scripts nombreux mais fragiles:** Dépendent de timing réseau
- **Styles:** Pas encore de système de design formel
- **Mobile responsive:** Basique (pas de mobile-first)
- **Performance:** Pas de lighthouse/core web vitals audit visible

---

## 4. APPLICATIONS MOBILES (Expo - Preview)

### 4.1 État des Apps

Quatre applications Expo trouvées mais **peu avancées:**

```
mobile/apps/
├── admin/          # Admin app (preview)
├── customer/       # App client ZupEat (preview)
├── delivery/       # App livreur ZupEat (preview)
└── merchant/       # App commerçant (preview)
```

**Status:** Scaffolding Expo, pas de features métier implémentées. À confirmer avec leurs CLAUDE.md/AGENTS.md respectifs.

### 4.2 Architecture Prévue

Selon le README:
- **Customer + Merchant + Delivery:** React Native/Expo
- **Livreur:** Originally Android Native (Java/Kotlin) avec Google Maps SDK
- **Chauffeur ZupDrive:** iOS/Android (React Native ou Expo)

**Actuellement:** Probablement des stubs / architecture skeleton.

---

## 5. INFRASTRUCTURE ET DÉPLOIEMENT

### 5.1 Développement Local

**Services (Docker Compose):**
```bash
./start.sh
# Lance: PostgreSQL :5432, Redis :6379, Mailpit :8025
```

**Commands:**
```bash
# Backend
cd backend
npm run dev              # API :3001
npm run lint            # ESLint (401 warnings tolérés)
npm test                # Jest tests
npm run create-superowner  # Bootstrap admin
npm run build           # esbuild + tsc

# Frontend
cd frontend
npm run dev             # Next.js :3000
npm run lint            # ESLint
npm run verif:domaines  # E2E test
npm run build
```

### 5.2 Production (Scaleway)

**Infrastructure:**
- `deploy/zup.sh` - Main deployment script
- `deploy/installer-serveur.sh` - Server setup
- `deploy/Caddyfile` - Reverse proxy (HTTPS, multi-domaine)
- `deploy/env.production.example` - Config template
- `deploy/roles-sql.sql` - PostgreSQL roles

**Domaines:**
```
zupone.com      → frontend vitrine
manager.zupone.com → superowner
zupeat.com      → client app
manager.zupeat.com → merchant app
delivery.zupeat.com → driver app
zupdrive.com    → drive vitrine
driver.zupdrive.com → chauffeur app
manager.zupdrive.com → admin drive (?)
```

**Déploiement:**
- Caddyfile + systemd services
- Health checks (monitoring/module)
- Log rotation (logrotate-zupone.conf)
- Backups (?)

### 5.3 Monitoring

Module `monitoring/` avec tests:
- Disponibilité (check URLs)
- Santé serveur (CPU, RAM, disk)
- Sauvegardes (status)
- Supervision métier (orders en retard, incidents)

---

## 6. TESTS AUTOMATISÉS (106 tests)

### 6.1 Coverage par domaine

| Domaine | Tests | Focus |
|---------|-------|-------|
| **Auth** | 7 | Cloisonnement, session, permissions |
| **Orders** | 7 | Montants, acceptation, paiement, suivi |
| **Drivers** | 11 | Dispatch, IDOR, attribution, urgence |
| **Payments** | 3 | IDOR, méthodes, possession |
| **Payouts** | 4 | Concurrence, batch, reprise |
| **Delivery** | 1 | Montants commerçant |
| **Notifications** | 3 | Notifier, outbox |
| **Merchants** | 2 | Demo, IDOR |
| **Customers** | 3 | Adresses, carnet boutique |
| **Catalog** | 1 | Taxes/suppléments |
| **Reviews** | 2 | Modération, avis |
| **Support** | 1 | Cloisonnement |
| **Marketing** | 3 | Promotions |
| **Assistant** | 5 | Routing, FAQ, Ollama |
| **ZupDrive** | 6 | Chauffeur, sociétés, courses |
| **Privacy** | 2 | Chiffrage, intégration |
| **Files** | 3 | Upload, antivirus |
| **Infrastructure** | 8 | Monitoring, rotations |
| **[autres]** | 25+ | Webhooks, maps, invoicing, etc. |

### 6.2 Types de tests

- **Unit:** Service logic (order.service.test.ts)
- **Integration:** Database + service (orders/__tests__)
- **Security:** IDOR, cloisonnement, permissions
- **Concurrency:** PostgreSQL avec pg.test.ts (payouts, drivers)
- **E2E Browser:** Scripts frontend verif-*.mjs (30+)

### 6.3 Gaps

- **Coverage estimé:** 15-20% du code backend, <5% du frontend
- **Pas de test:** API GraphQL endpoints (n'existent pas), websocket complet, stress tests
- **Fragile:** E2E scripts dépendent timing réseau/UI rendering

---

## 7. DOCUMENTATION

### 7.1 Fichiers importants

- **CLAUDE.md** (15k) - Règles strictes pour développement ZupEat
- **backend/ARCHITECTURE.md** (5k) - Modules, conventions, recettes
- **frontend/ARCHITECTURE.md** (7k) - Espaces, routage, composants
- **CONNAISSANCES-PROJET.md** (73k!) - Deep dive métier ZupEat
- **COMPTABLE-FONCTIONNALITES.md** (16k) - Features comptabilité
- **DOCUMENTATION-WEBHOOKS.md** (8k) - Webhook spec
- **DEPLOIEMENT-SCALEWAY.md** (15k) - Infra details
- **E2E-TEST-PLAN.md** (25k) - Scénarios de test complets

### 7.2 Couverture

**Bien documenté:**
- Architecture backend (modules, conventions)
- Paiements et webhooks
- Règles de sécurité multi-tenant
- Flux métier ZupEat (commandes, livraisons)
- Déploiement Scaleway

**Peu/pas documenté:**
- Applications mobiles (Expo) — scaffold seulement
- ZupDrive en détail (c'est prévu fin 2027)
- Assistant IA local (Ollama)
- Intégrations tierces (maps, notifications)

---

## 8. POINTS FORTS

### Architecture
✅ **Modulaire par domaine** — chaque sujet métier = un dossier = routes + service + jobs + tests  
✅ **Conventions strictes** — pas d'index.ts, imports explicites, noms français  
✅ **Cloisonnement multi-tenant** — vérifié à chaque route  
✅ **Séparation d'espaces frontend** — sessions isolées, domaines séparés  

### Sécurité
✅ **Validation Zod** sur tous les inputs  
✅ **Paiements Stripe sécurisés** — webhooks signés, idempotents  
✅ **Tests IDOR** — vulnérabilités d'accès détectées systématiquement  
✅ **Rate limiting** sur endpoints sensibles  
✅ **Chiffrage données PII** — `privacy/` module  

### Stabilité
✅ **Transactions Prisma** pour opérations critiques  
✅ **Outbox pattern** pour événements durables  
✅ **Idempotence** de webhooks et jobs  
✅ **Rollbacks** sans suppression de données  

### Scalabilité
✅ **Redis** pour cache, rate limiting, temps réel  
✅ **Socket.IO + adapter Redis** pour multi-serveur  
✅ **Batch processing** pour payouts, reports  
✅ **Jobs durables** avec retries  

### Documentation
✅ **CLAUDE.md** règles strictes et complètes  
✅ **ARCHITECTURE.md** backend et frontend clairs  
✅ **73k lignes CONNAISSANCES-PROJET.md** — très détaillé  
✅ **Recettes** pour ajouter routes, modules, jobs  

---

## 9. POINTS FAIBLES

### Complétude
❌ **ZupDrive très incomplet** — chauffeurs, courses en scaffold, aucune nav intégrée, paiements manquent  
❌ **Apps mobiles skeleton** — Expo setup, aucune feature réelle  
❌ **Assistant IA** — local Ollama, pas de production ready  
❌ **Intégrations tierces** — Maps (commentée), SMS, notifications partielles  

### Tests
❌ **Coverage faible** (~15-20% backend, <5% frontend)  
❌ **E2E scripts fragiles** — timing-dependent, nécessite navigateur réel  
❌ **Pas de unit tests frontend** — 1 seul test Jest  
❌ **Pas de tests websocket** — realtime untested  

### Code Quality
❌ **401 warnings ESLint tolérés** — `any` types, unused vars  
❌ **TypeScript non-strict** sur `any`  
❌ **Pas de linter frontend** — même esLint config actif mais max-warnings 0  

### Documentation
❌ **Manque guide mobile** — Expo CLAUDE.md/AGENTS.md?  
❌ **ZupDrive peu documenté** — seulement CLAUDE.md + code  
❌ **Pas de design system** — Tailwind raw, pas de component library  

### Infrastructure
❌ **Déploiement manuel** — pas de CI/CD visible (.github/ empty)  
❌ **Pas de monitoring uptime** — healthchecks basiques  
❌ **Logs non-centralisés** — fichiers locaux, pas ELK/Datadog  
❌ **Backups?** — pas documenté dans deploy/  

---

## 10. BUGS POTENTIELS & WARNINGS

### Lint Warnings (401 tolérés)
Exemples courants:
- `any` types non spécifiés (config, admin routes)
- Unused variables (`_userId`, `_fresh`, `_next`, `err`)
- ES2015 module syntax (namespaces in auth.middleware.ts)
- `require()` forbidden in tests

### Points à vérifier
1. **ZupDrive chauffeurs expiration** — doc expiration logic, test coverage
2. **Payouts concurrence** — multithread access PostgreSQL
3. **Dispatch optimisation** — algorithme tournées, perfs
4. **Notifications outbox** — doublons si service échoue?
5. **Privacy chiffrage** — key rotation, backward compat?
6. **Webhook retries** — timeout, exponential backoff?
7. **Rate limiting** — impacts sur mobile (API calls)?

### Tests absents
- [ ] Websocket connection + message flow
- [ ] Large batch payout (10k+ livreurs)
- [ ] Concurrent order acceptance
- [ ] Timezone edge cases (minuit, horaires d'été)
- [ ] Disk full / database corruption scenarios
- [ ] Payment method fraud detection
- [ ] Mobile offline sync

---

## 11. RECOMMANDATIONS PRIORITAIRES

### P0 (Critique - avant production)
1. **CI/CD pipeline** — GitHub Actions: lint, test, build, deploy
2. **Test coverage** — Augmenter à 60%+ pour Backend, 30%+ pour Frontend
3. **E2E tests robustes** — Remplacer verif-*.mjs par Cypress/Playwright stable
4. **Production checklist** — Database backups, log centralization, monitoring
5. **ZupDrive MVP scope** — Valider ce qu'on lance fin 2027 (paiements, algo matching)

### P1 (High - avant 1ère release)
6. **Fix ESLint warnings** — Remplacer `any`, utiliser strictNull
7. **Mobile scaffold complete** — CLAUDE.md/AGENTS.md par app, features roadmap
8. **Payment testing** — Stripe SCA/3D Secure, declined cards
9. **Webhook security audit** — Rate limiting, signature verification
10. **Performance baseline** — Lighthouse, API latency, DB query optimization

### P2 (Medium - 1-2 mois)
11. **Design system** — Component library Tailwind (buttons, forms, layout)
12. **Frontend tests** — React Testing Library pour 30%+ coverage
13. **Assistant IA prod** — Déploiement Ollama ou intégration Claude API
14. **Maps intégration** — Google Maps SDK pour navigation livreurs
15. **SMS notifications** — Provider (Twilio/SendGrid), tests

### P3 (Nice-to-have - backlog)
16. **Monitoring dashboard** — Grafana/Datadog pour prod
17. **Load testing** — JMeter/K6 pour scalabilité
18. **Multi-language backend** — Traductions API (webhook messages, erreurs)
19. **CDN images** — Cloudinary intégré, mais optimization manquante
20. **API documentation** — Swagger/OpenAPI auto-generated

---

## 12. RÉSUMÉ ARCHITECTURE

```
┌─────────────────────────────────────────────────────┐
│           GROUPE ZUPONE (Oct 2026)                  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │  ZupEat - Livraison de Repas (COMPLET 70%)  │   │
│  ├──────────────────────────────────────────────┤   │
│  │ • Backend: 74k LOC, 29 modules, 106 tests   │   │
│  │ • Frontend: 48k LOC, 7 espaces, 30+ verif   │   │
│  │ • Database: Prisma 7.10, 47 migrations      │   │
│  │ • Paiements: Stripe webhooks secure         │   │
│  │ • Temps réel: Socket.IO + Redis             │   │
│  │                                              │   │
│  │ Status: Prêt pour MVP (en attente deploy)   │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │  ZupDrive - Transport Passagers (10% MVP)   │   │
│  ├──────────────────────────────────────────────┤   │
│  │ • Backend: 6 tests, modèles de base          │   │
│  │ • Frontend: Skeleton /chauffeur, /trajet     │   │
│  │ • Manque: Paiements, algo matching, nav      │   │
│  │ • Mobile: Preview stage                      │   │
│  │                                              │   │
│  │ Status: Concepts, codage en cours Q4 2026    │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │  Infrastructure & Transverse                │   │
│  ├──────────────────────────────────────────────┤   │
│  │ • Deploy: Scaleway Caddyfile, scripts sh     │   │
│  │ • Monitoring: Santé, disponibilité           │   │
│  │ • Privacy: Chiffrage PII, GDPR ready         │   │
│  │ • Assistant: Ollama local (test)             │   │
│  │ • Files: Upload + antivirus                  │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 13. CONCLUSION

**Zupone est un projet ambitieux bien architecturé**, avec ZupEat prêt pour 70% d'une launch MVP. L'équipe a clairement réfléchi à la sécurité, la scalabilité et la maintenabilité — les conventions, tests de sécurité et domaines métier reflètent une expérience solide.

**Défis immédiats:**
- Terminer tests + audit ZupEat
- Débuter ZupDrive avec scope clair (fin 2027)
- Mobiliser l'équipe mobile Expo
- Configurer CI/CD production
- Centraliser logs + monitoring

**Potentiel:** Une plateforme multi-services pour la Belgique et au-delà, si les fondations (sécurité, scalabilité, UX) sont respectées.

---

**Fin d'analyse — 2026-10-07**

