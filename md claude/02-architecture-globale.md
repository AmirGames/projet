# ARCHITECTURE GLOBALE - SaaS Digitalisation Commerces

---

## 1. VUE D'ENSEMBLE

```
┌─────────────────────────────────────────────────────────────────┐
│                        UTILISATEUR FINAL                        │
│                    (Commerçant / Client)                        │
└────────┬────────────────────────────────────────────────────────┘
         │
    ┌────┴─────────────────────────────────────────┐
    │                                              │
    ▼                                              ▼
┌──────────────────┐                    ┌──────────────────┐
│   STOREFRONT     │                    │   DASHBOARD      │
│  (Boutique)      │                    │  (Commerçant)    │
│                  │                    │                  │
│ - Catalogue      │                    │ - Orders         │
│ - Panier         │                    │ - Products       │
│ - Checkout       │                    │ - Stats          │
│ - Tracking       │                    │ - Settings       │
└────────┬─────────┘                    └────────┬─────────┘
         │                                       │
         └─────────────┬───────────────┬─────────┘
                       │               │
                   ┌───▼───────────────▼────┐
                   │   NEXT.JS FRONTEND     │
                   │  (SSR + Client-side)   │
                   │                        │
                   │ - Auth pages           │
                   │ - Theme engine         │
                   │ - Responsive design    │
                   └───┬────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
   ┌────────────┐             ┌────────────────┐
   │  GraphQL   │             │  REST (Files)  │
   │   Yoga     │             │  Assets upload │
   └────────────┘             └────────────────┘
        │                             │
        └──────────────┬──────────────┘
                       │
    ┌──────────────────▼───────────────────┐
    │     NODE.JS BACKEND API              │
    │   (TypeScript + Express/Fastify)     │
    │                                      │
    │ Services:                            │
    │ - Auth (JWT)                         │
    │ - Organizations                      │
    │ - Stores                             │
    │ - Products                           │
    │ - Orders                             │
    │ - Payments                           │
    │ - Users/Permissions                  │
    │ - Theme Engine                       │
    │ - Notifications                      │
    │ - Webhooks                           │
    └──────────────────┬────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
   ┌─────────┐  ┌──────────┐  ┌────────────┐
   │PostgreSQL│ │ Stripe   │  │ Bancontact │
   │          │ │ API      │  │ API        │
   │ Prisma   │ │ Webhooks │  │ QR codes   │
   └─────────┘  └──────────┘  └────────────┘
        │
        ▼
   ┌─────────────────┐
   │  File Storage   │
   │  (Cloudinary    │
   │   ou S3)        │
   └─────────────────┘
        │
        ▼
   ┌─────────────────────┐
   │  EXTERNAL SERVICES  │
   │                     │
   │ - Email (SendGrid)  │
   │ - SMS (Twilio)      │
   │ - Push (Firebase)   │
   │ - Monitoring        │
   │   (Sentry)          │
   └─────────────────────┘
```

---

## 2. ARCHITECTURE MULTI-TENANT

### Isolement des données

```
┌─────────────────────────────────────────────────┐
│              PLATEFORME SaaS                    │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────┐      ┌──────────────┐       │
│  │Organization │      │Organization │       │
│  │   TENANT 1   │      │   TENANT 2   │       │
│  │  (Pizza Co)  │      │(Night Shop)  │       │
│  │              │      │              │       │
│  │┌──────────┐  │      │┌──────────┐  │       │
│  ││ Store    │  │      ││ Store    │  │       │
│  ││ Namur    │  │      ││ Bruxelles│  │       │
│  ││          │  │      ││          │  │       │
│  ││Products  │  │      ││Products  │  │       │
│  ││Orders    │  │      ││Orders    │  │       │
│  ││Customers │  │      ││Customers │  │       │
│  ││Users     │  │      ││Users     │  │       │
│  │└──────────┘  │      │└──────────┘  │       │
│  │              │      │              │       │
│  │┌──────────┐  │      │┌──────────┐  │       │
│  ││ Store    │  │      ││ Store    │  │       │
│  ││Charleroi │  │      ││ Anvers   │  │       │
│  ││          │  │      ││          │  │       │
│  │└──────────┘  │      │└──────────┘  │       │
│  └──────────────┘      └──────────────┘       │
│                                                 │
│  ┌──────────────┐      ┌──────────────┐       │
│  │Organization │      │Organization │       │
│  │   TENANT 3   │      │   TENANT N   │       │
│  │              │      │              │       │
│  └──────────────┘      └──────────────┘       │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Isolation au niveau database

```
PostgreSQL Database
├── Public schema (platform admin)
│   ├── users (tous les users)
│   ├── organizations (tenants)
│   └── subscriptions
│
├── TENANT_1 schema (Pizza Co)
│   ├── stores
│   ├── products
│   ├── orders
│   ├── customers
│   ├── memberships
│   └── ...
│
├── TENANT_2 schema (Night Shop)
│   ├── stores
│   ├── products
│   ├── orders
│   ├── customers
│   ├── memberships
│   └── ...
│
└── TENANT_N schema
    └── ...
```

**OU** (plus simple) :

```
PostgreSQL Database (single schema)
├── organizations
├── stores
├── users
├── memberships (link user → organization → store)
├── products
├── orders
├── customers
└── ...

→ Filtering sur organization_id et store_id à chaque query
```

**Recommandation MVP** : Single schema avec filtering (plus simple).

---

## 3. ARCHITECTURE FRONTEND

### Next.js Structure

```
frontend/
├── app/ (ou pages/ si Page Router)
│   ├── (auth)/
│   │   ├── login/
│   │   ├── signup/
│   │   ├── verify-email/
│   │   └── forgot-password/
│   │
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx (dashboard home)
│   │   ├── stores/
│   │   │   ├── [storeId]/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx
│   │   │   │   ├── products/
│   │   │   │   ├── orders/
│   │   │   │   ├── customers/
│   │   │   │   ├── settings/
│   │   │   │   ├── theme/
│   │   │   │   └── employees/
│   │   │   └── new/
│   │   │
│   │   ├── account/
│   │   │   ├── profile/
│   │   │   ├── billing/
│   │   │   └── organizations/
│   │   │
│   │   └── admin/
│   │       ├── organizations/
│   │       ├── users/
│   │       ├── subscriptions/
│   │       └── system/
│   │
│   ├── (storefront)/
│   │   ├── [slug]/
│   │   │   ├── layout.tsx (theme wrapper)
│   │   │   ├── page.tsx (home page)
│   │   │   ├── products/
│   │   │   ├── [productSlug]/
│   │   │   ├── cart/
│   │   │   ├── checkout/
│   │   │   └── orders/[orderId]/
│   │   │
│   │   └── api/
│   │       ├── theme/[storeId].ts
│   │       └── storefront/...
│   │
│   ├── api/
│   │   └── (API routes - graphql endpoint, webhooks, etc.)
│   │
│   ├── components/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── storefront/
│   │   ├── theme/
│   │   ├── common/
│   │   └── layout/
│   │
│   ├── lib/
│   │   ├── graphql/
│   │   │   ├── client.ts
│   │   │   └── queries.ts
│   │   ├── auth/
│   │   ├── utils/
│   │   └── hooks/
│   │
│   ├── styles/
│   │   ├── globals.css
│   │   └── theme/
│   │
│   └── middleware.ts
│
├── public/
│   └── assets/
│
├── next.config.js
├── tsconfig.json
├── package.json
└── .env.local
```

### Deux applications distinctes

**Option A : Monorepo (Recommandé)**
```
frontend/
├── apps/
│   ├── dashboard/     (commerçant)
│   ├── storefront/    (client final)
│   └── theme-editor/  (V2)
│
└── packages/
    ├── ui/            (composants partagés)
    ├── graphql/       (queries/mutations)
    └── types/         (TypeScript types)
```

**Option B : Two separate projects**
```
dashboard/            (commerçant)
  └── next.js app

storefront/          (client final)
  └── next.js app
```

**Recommandation MVP** : Monorepo (meilleur pour partager code).

---

## 4. ARCHITECTURE BACKEND

### Structure Node.js

```
backend/
├── src/
│   ├── index.ts (entry point)
│   │
│   ├── graphql/
│   │   ├── schema.ts
│   │   ├── resolvers/
│   │   │   ├── user.ts
│   │   │   ├── organization.ts
│   │   │   ├── store.ts
│   │   │   ├── product.ts
│   │   │   ├── order.ts
│   │   │   ├── payment.ts
│   │   │   ├── theme.ts
│   │   │   └── stats.ts
│   │   └── types/
│   │       └── generated.ts (auto-generated)
│   │
│   ├── api/
│   │   ├── auth/
│   │   │   ├── routes.ts
│   │   │   └── controller.ts
│   │   │
│   │   ├── webhooks/
│   │   │   ├── stripe.ts
│   │   │   ├── bancontact.ts
│   │   │   └── verification.ts
│   │   │
│   │   └── files/
│   │       └── upload.ts
│   │
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── user.service.ts
│   │   ├── organization.service.ts
│   │   ├── store.service.ts
│   │   ├── product.service.ts
│   │   ├── order.service.ts
│   │   ├── payment.service.ts
│   │   │   ├── stripe.ts
│   │   │   └── bancontact.ts
│   │   ├── theme.service.ts
│   │   ├── notification.service.ts
│   │   ├── stats.service.ts
│   │   └── permission.service.ts
│   │
│   ├── repositories/
│   │   ├── user.repo.ts
│   │   ├── organization.repo.ts
│   │   ├── store.repo.ts
│   │   ├── product.repo.ts
│   │   ├── order.repo.ts
│   │   └── ...
│   │
│   ├── middleware/
│   │   ├── auth.ts (JWT verification)
│   │   ├── tenant.ts (organization context)
│   │   ├── permission.ts (RBAC)
│   │   └── error.ts
│   │
│   ├── guards/
│   │   ├── auth.guard.ts
│   │   ├── role.guard.ts
│   │   ├── store-access.guard.ts
│   │   └── permission.guard.ts
│   │
│   ├── utils/
│   │   ├── security.ts
│   │   ├── validation.ts
│   │   ├── errors.ts
│   │   └── logger.ts
│   │
│   ├── types/
│   │   ├── auth.ts
│   │   ├── user.ts
│   │   ├── organization.ts
│   │   ├── store.ts
│   │   ├── order.ts
│   │   └── ...
│   │
│   └── config/
│       ├── database.ts
│       ├── env.ts
│       └── constants.ts
│
├── prisma/
│   └── schema.prisma
│
├── migrations/
│   └── ...
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── package.json
├── tsconfig.json
├── .env.example
└── docker-compose.yml (pour dev local)
```

---

## 5. ARCHITECTURE THEME ENGINE

```
┌────────────────────────────────────────┐
│         THEME ENGINE                   │
├────────────────────────────────────────┤
│                                        │
│  ┌──────────────────────────────────┐ │
│  │   THEME CONFIGURATION            │ │
│  │  (Design Tokens + Metadata)      │ │
│  │                                  │ │
│  │ - colors (primary, secondary)   │ │
│  │ - typography (fonts, sizes)     │ │
│  │ - spacing (margins, padding)    │ │
│  │ - components (styles)           │ │
│  │ - layout (grid, structure)      │ │
│  └──────────────────────────────────┘ │
│           │                           │
│           ▼                           │
│  ┌──────────────────────────────────┐ │
│  │   COMPONENTS LIBRARY             │ │
│  │  (Pre-built, themeable)          │ │
│  │                                  │ │
│  │ - Header                         │ │
│  │ - Footer                         │ │
│  │ - ProductCard                    │ │
│  │ - CategoryList                   │ │
│  │ - Cart                           │ │
│  │ - Checkout                       │ │
│  │ - CustomSlots                    │ │
│  └──────────────────────────────────┘ │
│           │                           │
│           ▼                           │
│  ┌──────────────────────────────────┐ │
│  │   RENDERING ENGINE               │ │
│  │  (React components + CSS)        │ │
│  │                                  │ │
│  │ - CMS-like templating            │ │
│  │ - Component composition          │ │
│  │ - CSS-in-JS (Emotion/Styled)    │ │
│  │ - Design token application       │ │
│  └──────────────────────────────────┘ │
│           │                           │
│           ▼                           │
│  ┌──────────────────────────────────┐ │
│  │   STOREFRONT OUTPUT              │ │
│  │  (HTML + CSS + Client JS)        │ │
│  └──────────────────────────────────┘ │
│                                        │
└────────────────────────────────────────┘
```

### Theme Versions & Deployment

```
Theme "Pizza v1"

├── Drafts
│   └── WIP modifications
│
├── Versions
│   ├── v1.0.0 (production)
│   ├── v1.1.0 (preview)
│   ├── v1.2.0 (draft)
│   └── ...
│
└── Deployments
    ├── Production (v1.0.0)
    │   └── Live on storefront
    │
    ├── Preview (v1.1.0)
    │   └── Accessible via preview URL
    │
    └── Rollback
        └── Can revert to previous version
```

---

## 6. ARCHITECTURE PAIEMENTS

### Flow Stripe

```
Client
  │
  ├─→ Panier
  │     │
  ├─→ Checkout
  │     │
  └─→ Paiement Stripe
        │
        ├─ Créer Stripe Payment Intent
        │  (montant, devise, metadata)
        │
        ├─ Retourner client secret
        │
        └─ Client confirme paiement
            │
            ├─ Stripe webhook → Backend
            │  (payment.succeeded)
            │
            └─ Créer Order en DB
               Envoyer notifications
               Ajouter commission SaaS
               Créer Payout
```

### Flow Bancontact QR

```
Client
  │
  ├─→ Panier
  │     │
  ├─→ Checkout
  │     │
  └─→ Paiement Bancontact QR
        │
        ├─ Générer QR code
        │  (via Bancontact API)
        │
        ├─ Afficher QR à l'écran
        │
        └─ Client scanne
            │
            ├─ App bancaire s'ouvre
            │
            ├─ Client paie (codes secrets)
            │
            ├─ Bancontact webhook → Backend
            │  (payment.confirmed)
            │
            └─ Créer Order en DB
               Envoyer notifications
               Ajouter commission SaaS
               Créer Payout
```

### Gestion des frais

```
Commande = €50
│
├─ Frais Stripe/Bancontact (%) = €1.50
│
├─ Commission SaaS (selon plan) = €1.00 (2%)
│
└─ À payer au commerçant = €47.50

Ledger:
├─ Stripe payout: €47.50 → compte commerçant
├─ SaaS gains: €1.00 (revenue)
└─ Frais payment: €1.50 (cost)
```

---

## 7. ARCHITECTURE SÉCURITÉ

### JWT + Tenant Isolation

```
Client Login
  │
  ├─ POST /graphql/auth/login
  │  {email, password}
  │
  └─ Backend
      │
      ├─ Vérifier password
      │
      ├─ Chercher memberships (user → organizations)
      │
      └─ Créer JWT payload:
         {
           sub: user_id,
           organizations: [
             {
               org_id: "org_1",
               role: "OWNER",
               stores: ["store_1", "store_2"]
             },
             {
               org_id: "org_2",
               role: "MANAGER",
               stores: ["store_3"]
             }
           ],
           iat: timestamp,
           exp: timestamp + 24h
         }
         
         Sign JWT
         Return to client
         
Client requests:
  │
  ├─ Authorization: Bearer <JWT>
  │
  └─ Backend:
      │
      ├─ Verify JWT signature
      │
      ├─ Verify not expired
      │
      ├─ Extract user_id + organizations
      │
      └─ Pour chaque request:
         1. Verify user owns the organization_id
         2. Verify user has access to store_id
         3. Verify user has permission (RBAC)
         4. Execute query/mutation
         5. Filter results by tenant
```

### RBAC + Permissions

```
User Membership
├── organization_id
├── role (OWNER, MANAGER, EMPLOYEE, THEME_DEVELOPER)
└── store_access (which stores can access)

Roles avec Permissions:

OWNER
├── organization.read
├── organization.write
├── store.read
├── store.write
├── product.read
├── product.write
├── order.read
├── order.write
├── payment.read
├── user.read
├── user.write
├── theme.read
├── theme.write
├── statistics.read
└── subscription.read/write

MANAGER
├── store.read (own stores)
├── store.write
├── product.read
├── product.write
├── order.read
├── order.write (accept/refuse)
├── theme.read
├── theme.write
└── statistics.read

EMPLOYEE
├── order.read (own store)
├── order.write (change status)
└── product.read

THEME_DEVELOPER
├── theme.read
├── theme.write
├── theme.preview
├── theme.publish
├── product.read (for preview)
└── (NO orders, NO customers, NO payments)
```

---

## 8. ARCHITECTURE NOTIFICATIONS

```
Order créée
  │
  ├─→ Backend émit event "order.created"
  │
  └─→ Notification Service
       │
       ├─ Push → Terminal Android (FCM)
       │
       ├─ Email → Commerçant (SendGrid)
       │
       ├─ Email → Client (SendGrid)
       │
       ├─ SMS → Commerçant (optionnel, Twilio)
       │
       └─ In-app → Dashboard

Order status changed
  │
  └─→ Notification Service
       │
       ├─ Email → Client (status update)
       │
       ├─ Push → Client (si app mobile)
       │
       └─ SMS → Client (optionnel)
```

---

## 9. STACK TECHNIQUE CONFIRMÉE

### Frontend
```
- Framework: Next.js 14+
- Language: TypeScript
- Router: App Router (ou Page Router si existant)
- Styling: Tailwind CSS + CSS Modules
- UI Components: Material UI / ShadcN
- State: TanStack Query (React Query)
- Auth: NextAuth.js
- Forms: React Hook Form + Zod
- API Client: GraphQL Apollo + REST fetch
- Package manager: npm / pnpm
- Testing: Vitest + Playwright
```

### Backend
```
- Runtime: Node.js 18+
- Language: TypeScript
- API: GraphQL Yoga
- ORM: Prisma
- Database: PostgreSQL 14+
- Auth: JWT (node-jsonwebtoken)
- Payments: stripe + bancontact-sdk
- File storage: Cloudinary API
- Queue: Bull (Redis) pour jobs async
- Logging: Winston
- Monitoring: Sentry
- Testing: Jest + Supertest
```

### Infrastructure
```
- Frontend hosting: Vercel
- Backend hosting: AWS EC2 / Heroku / Railway
- Database: AWS RDS PostgreSQL / Heroku Postgres
- File storage: Cloudinary / AWS S3
- CDN: Vercel CDN / CloudFront
- Email: SendGrid
- SMS: Twilio (optional)
- Push: Firebase Cloud Messaging
- Monitoring: Sentry + Datadog (optional)
- CI/CD: GitHub Actions
```

---

## 10. FLUX DE DONNÉES - EXEMPLE COMPLET

### Scénario : Client commande une pizza

```
1. CLIENT BROWSE STOREFRONT
   ├─ GET /storefront/slug/[slug]
   │  └─ Récupère theme + products + store info
   │
   └─ Affiche la boutique

2. CLIENT ADD TO CART
   ├─ POST /graphql/addToCart
   │  {storeId, productId, quantity, options}
   │
   └─ Backend:
      ├─ Verify store accessible from storefront slug
      ├─ Verify product exists in store
      ├─ Return cart updated

3. CLIENT GOES TO CHECKOUT
   ├─ POST /graphql/createOrder (draft)
   │  {storeId, items, deliveryAddress, deliveryType}
   │
   └─ Backend:
      ├─ Create Order (PENDING status)
      ├─ Calculate delivery fee
      ├─ Calculate total + commissions
      ├─ Reserve inventory
      └─ Return order ID

4. CLIENT PAYS
   ├─ POST /api/payment/stripe OR /api/payment/bancontact
   │
   ├─ Stripe flow:
   │  ├─ createPaymentIntent (backend)
   │  ├─ Client confirms payment (Stripe.js)
   │  ├─ Stripe webhook (backend)
   │  └─ Update Order to PAID
   │
   ├─ Bancontact QR flow:
   │  ├─ generateQRCode (backend)
   │  ├─ Display QR (frontend)
   │  ├─ Client scans + pays
   │  ├─ Bancontact webhook (backend)
   │  └─ Update Order to PAID

5. ORDER CONFIRMED
   ├─ Create Payment record in DB
   ├─ Calculate commission + payout
   │
   └─ Notifications:
      ├─ Push → Commerçant terminal
      ├─ Email → Commerçant
      ├─ Email → Client confirmation
      └─ In-app → Dashboard

6. COMMERÇANT ACCEPTS ORDER
   ├─ PATCH /graphql/order/[orderId]
   │  {status: "ACCEPTED", estimatedTime: 45}
   │
   └─ Notifications:
      ├─ Email → Client (order accepted)
      ├─ SMS → Client (optionnel, time estimate)
      └─ Print → Imprimante thermique

7. ORDER READY
   ├─ Terminal: Change status to "READY"
   │
   └─ Notifications:
      ├─ Email → Client
      ├─ SMS → Client
      └─ In-app notification

8. DELIVERY (if applicable)
   ├─ Assign driver
   ├─ Driver picks up order
   │
   └─ Notifications:
      ├─ Email → Client (driver on the way)
      ├─ SMS → Client
      └─ Live tracking (optional V2)

9. DELIVERED
   ├─ Mark as COMPLETED
   │
   └─ Notifications:
      ├─ Email → Client (thanks + review request)
      ├─ Email → Commerçant (order completed)
      └─ Payout → Scheduled for J+3
```

---

## 11. FICHIERS À CRÉER

D'après cette architecture, voici les fichiers détaillés à créer :

- **02-modele-donnees.md** (Prisma schema)
- **03-authentification-autorisations.md** (JWT + RBAC)
- **04-theme-engine.md** (complet)
- **05-api-graphql.md** (schema + resolvers)
- **06-paiements.md** (Stripe + Bancontact)
- **07-mvp-phases.md** (roadmap détaillée)
- **08-terminal-android.md** (app native)
- **09-infrastructure-deployment.md** (hosting + DevOps)
- **10-securite-complete.md** (détails sécurité)

---

**PROCHAINE ÉTAPE** : Modèle de données Prisma ? 👉
