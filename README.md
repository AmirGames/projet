# 🚀 SaaS Local - Plateforme de Digitalisation Commerces Locaux

Plateforme SaaS multi-tenant permettant aux commerces locaux de créer leur propre présence digitale, boutique en ligne et système de prise de commandes.

## 📋 Architecture

```
saas-dev/
├── backend/           # Node.js + Express + GraphQL + Prisma
├── frontend/          # Next.js 14 (Dashboard + Storefront)
├── docker-compose.yml # PostgreSQL + Redis locaux
└── README.md
```

## 🎯 MVP Scope (15 semaines)

### Inclus ✅
- [x] Multi-tenant authentication (signup, login, email verification)
- [x] Organizations + Stores + Memberships + RBAC
- [x] Product management (CRUD, categories, options, variants)
- [x] Storefront + shopping cart
- [x] Checkout flow (5 steps)
- [x] Payments (Stripe)
- [x] Click & Collect + Delivery zones
- [x] Order management dashboard
- [x] Email notifications (SendGrid)
- [x] Basic theme system (colors + fonts)

### Exclus pour MVP ❌
- [ ] Terminal Android (V1.1)
- [ ] SMS/Push notifications (V1.1)
- [ ] Bancontact QR payments (V1.1)
- [ ] Theme editor avancé (V1.1)
- [ ] Multi-store hierarchy (V1.5)
- [ ] Designer mode / agences (V2)

## 🚀 Quick Start

### Prérequis
- Node.js 20+
- Docker + Docker Compose
- Git (optionnel, repos locaux)

### 1. Cloner le projet
```bash
git clone <repo> && cd saas-dev
```

### 2. Démarrer les services (PostgreSQL + Redis)
```bash
docker-compose up -d
# Vérifier: docker ps
```

### 3. Backend - Setup
```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name initial
npm run dev
# Devrait afficher: 🚀 Server running on http://localhost:3001
```

### 4. Frontend - Setup
```bash
cd ../frontend
npm install
npm run dev
# Devrait afficher: ▲ Next.js 14.0.0
# Ouvrir http://localhost:3000
```

### 5. Vérifier l'installation
```
✅ Backend: http://localhost:3001/health
✅ Frontend: http://localhost:3000
✅ PostgreSQL: localhost:5432
✅ Redis: localhost:6379
✅ PgAdmin: http://localhost:5050 (admin@example.com / admin)
```

## 📚 Documentation

- **Backend**: `backend/README.md` (API, GraphQL, Prisma)
- **Frontend**: `frontend/README.md` (Components, Pages, Stores)
- **Architecture**: `/mnt/project/` (specs complètes)

## 🔑 Comptes Test

### Backend
- **API**: http://localhost:3001/api/...
- **GraphQL**: http://localhost:3001/graphql (prochainement)

### Database
- **PgAdmin**: http://localhost:5050
  - Email: `admin@example.com`
  - Password: `admin`

### Credentials
À créer lors du premier signup depuis le frontend

## 📖 Jour 1 - Checklist

- [x] Dépendances backend installées
- [x] Database schema créé (Prisma)
- [x] Config environment validée
- [x] Logger setup
- [x] Auth service (JWT, bcrypt, passwords)
- [x] Express app boilerplate
- [x] Error handler middleware
- [x] Dépendances frontend installées
- [x] Next.js structure créée
- [x] TailwindCSS configured
- [x] Docker Compose setup
- [ ] **Prochaine étape**: Week 2 - Auth API (signup, login, email verification)

## 🔄 Workflow

### Local Development
```bash
# Terminal 1: Database
docker-compose up

# Terminal 2: Backend
cd backend && npm run dev

# Terminal 3: Frontend
cd frontend && npm run dev
```

### Git Workflow (repos locaux)
```bash
# Backend
cd backend
git init
git add .
git commit -m "Jour 1: Initial backend setup"

# Frontend
cd ../frontend
git init
git add .
git commit -m "Jour 1: Initial frontend setup"
```

## 📊 Database

### Connection
```
PostgreSQL:
- Host: localhost
- Port: 5432
- Database: saas_dev
- User: postgres
- Password: postgres
```

### Prisma Studio (GUI)
```bash
cd backend
npx prisma studio
# Ouvre: http://localhost:5555
```

## 🔐 Environment Variables

Copier `.env.example` → `.env` et configurer:

### Backend
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/saas_dev
JWT_SECRET=your-secret-key-min-32-chars
FRONTEND_URL=http://localhost:3000
```

### Frontend
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 🛠️ Commandes Utiles

### Backend
```bash
cd backend

# Development
npm run dev                  # Start with hot reload
npm run build               # Build for production
npm start                   # Run production build

# Database
npx prisma migrate dev      # Run migrations
npx prisma studio          # Open GUI
npx prisma generate        # Generate Prisma client

# Code
npm run format              # Format with Prettier
npm run lint               # Lint with ESLint
```

### Frontend
```bash
cd frontend

# Development
npm run dev                # Start dev server
npm run build              # Build for production
npm start                  # Run production build

# Code
npm run format             # Format with Prettier
npm run lint              # Lint with ESLint
```

## 📊 Roadmap

### Week 1-2: Foundation ✅
- [x] Infra + database setup
- [ ] Basic auth API

### Week 3-4: Auth
- [ ] Signup/login API
- [ ] Email verification
- [ ] Organization creation
- [ ] RBAC + permissions

### Week 5-8: Products
- [ ] Product CRUD
- [ ] Categories
- [ ] Options + variants
- [ ] Image uploads

### Week 9-12: Storefront
- [ ] Homepage
- [ ] Product pages
- [ ] Shopping cart
- [ ] Responsive design

### Week 13-14: Checkout + Orders
- [ ] Checkout flow
- [ ] Order management
- [ ] Email notifications

### Week 15: Payments + Polish
- [ ] Stripe integration
- [ ] Performance optimization
- [ ] Security audit
- [ ] MVP launch 🚀

## 🤝 Support

Pour questions ou blockers:
1. Vérifier la documentation du projet
2. Consulter les logs (Winston)
3. Tester en local avec Postman/curl
4. Vérifier les .env files

## 📝 Notes

- **Testing**: Pas de tests Week 1-4 (focus features)
- **Repos**: Locaux uniquement (pas de GitHub pour MVP)
- **Deployment**: Staging avec Vercel + Railway après Week 15
- **Database**: PostgreSQL managé (Neon) en production

---

**Jour 1 terminé** ✅ Next: Jour 2 - Auth API basics
