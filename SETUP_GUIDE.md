# 🚀 ZupOne - Unified Identity Refactor - Setup Guide

## Phase Summary

This project has completed **4 major phases** of the unified identity architecture refactor:

### ✅ Completed Phases

**Phase 1: Prisma Schema** - Customer.userId relationship added
**Phase 2: JWT Simplification** - Token now contains only userId
**Phase 3: Role Activation Routes** - GET /me/roles, POST /me/become-merchant, POST /me/become-driver
**Phase 4: Middleware Adaptation** - All routes updated to load fresh data from database

---

## 🔧 Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js 18+
- npm or yarn

### Quick Start (3 steps)

```bash
# 1. Start infrastructure (PostgreSQL, Redis, Mailpit)
./start.sh

# 2. Install & migrate (backend folder)
cd backend
npm install
npx prisma migrate deploy

# 3. Start backend development server
npm run dev
```

### Full Setup with Seed Data

```bash
# Run complete setup with database seeding
./setup.sh
```

---

## 📚 Architecture Overview

### Unified Identity Model

Users now have 3 independent roles that can be activated separately:

```
User
├── Customer (created at signup)
│   └── Can place orders
│
├── Driver (opt-in, PENDING status)
│   └── Can deliver orders
│
└── Merchant (opt-in, creates Organization)
    └── Can manage store, products, orders
```

### JWT Simplification

**Before:**
```json
{
  "userId": "user123",
  "orgId": "org456",
  "storeIds": ["store789"],
  "role": "ADMIN"
}
```

**After:**
```json
{
  "userId": "user123"
}
```

**Benefits:**
- Smaller tokens
- Roles verified fresh from database (no stale data)
- Flexible multi-org support
- Simplified token revocation

---

## 🔌 API Endpoints

### Authentication
- `POST /auth/signup` - Create account (User + Customer)
- `POST /auth/login` - Sign in
- `POST /auth/refresh` - Refresh tokens

### Public Registration
- `POST /auth/merchant-register` - One-step merchant signup
- `POST /drivers/register` - One-step driver registration

### Role Activation (Authenticated)
- `GET /me/roles` - View all available roles
- `POST /me/become-merchant` - Activate merchant role
- `POST /me/become-driver` - Activate driver role

---

## 📊 Database Services

### Container URLs
```
PostgreSQL:  localhost:5432
Redis:       localhost:6379
Mailpit:     http://localhost:8025
```

### Environment Variables

Backend requires a `.env` file configured with JWT secrets. This file is **not committed** to git for security reasons.

**Setup .env automatically:**
```bash
cd backend
./setup-env.sh
```

This script will:
- Generate secure random JWT secrets (32+ characters)
- Create `.env` from `.env.example`
- Configure all required environment variables

**Manual setup:**
Copy `.env.example` to `.env` and configure:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas_dev"
JWT_SECRET=<generate-32-char-secret>
JWT_REFRESH_SECRET=<generate-32-char-secret>
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
```

**Generate secure secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## ✅ Verification

### Check TypeScript Compilation
```bash
cd backend
npx tsc --noEmit
```

### Run Database Migrations
```bash
cd backend
npx prisma migrate deploy
```

### View Database
```bash
# Using Prisma Studio
npx prisma studio

# Or psql
psql -U postgres -d saas_dev -h localhost
```

---

## 🧪 Testing Endpoints

### Create Account & Customer Role
```bash
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "name": "John Doe",
    "password": "SecurePassword123"
  }'
```

### Become Merchant
```bash
curl -X POST http://localhost:3001/api/me/become-merchant \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "My Store",
    "storeName": "Main Shop",
    "storeSlug": "my-shop",
    "businessType": "Restaurant",
    "phone": "+33612345678",
    "address": "123 Main St",
    "city": "Paris",
    "postalCode": "75001",
    "description": "Best restaurant in town"
  }'
```

### Check Roles
```bash
curl -X GET http://localhost:3001/api/me/roles \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🚦 Next Steps

### Phase 5: Testing (Optional)
- Write unit tests for auth service
- E2E tests for signup/login flows
- Test role activation endpoints

### Frontend Implementation
- Create signup/login pages (Next.js)
- Build role selection UI
- Implement merchant dashboard
- Implement driver app

### Deployment
- Configure environment variables
- Set up database backups
- Deploy to production

---

## 📝 Key Files Modified

```
backend/
├── prisma/
│   ├── schema.prisma          ← Added Customer.userId
│   └── migrations/            ← New migration file
├── src/
│   ├── services/auth.service.ts       ← Simplified JWT
│   ├── routes/auth.ts                 ← New endpoints
│   ├── middleware/auth.ts             ← Updated checks
│   └── config/socket.ts               ← WebSocket updates
└── .env                              ← Configure DB_URL
```

---

## 🆘 Troubleshooting

### PostgreSQL Connection Failed
```bash
# Check if container is running
docker ps | grep saas-postgres

# View logs
docker logs saas-postgres

# Restart services
./stop.sh && ./start.sh
```

### Prisma Migration Issues
```bash
# If migration is stuck
npx prisma migrate resolve --rolled-back add_customer_user_relationship

# Or reset (⚠️ deletes all data)
npx prisma migrate reset
```

### Port Already in Use
```bash
# Find and kill process using port 5432
lsof -i :5432
kill -9 <PID>
```

### "Invalid token" Error (401)
This error occurs when `.env` file is missing or JWT_SECRET is not configured.

**Solution:**
```bash
cd backend

# Option 1: Automatic setup
./setup-env.sh

# Option 2: Manual setup  
cp .env.example .env
# Edit .env and set JWT_SECRET and JWT_REFRESH_SECRET to 32+ character secrets
```

Then restart the backend server for changes to take effect.

**Root Cause:**
- The `.env` file contains sensitive JWT secrets and is git-ignored
- Without it, the backend cannot verify authentication tokens
- All API requests requiring authentication fail with 401

---

## 📚 Documentation

- Architecture: See `ANALYSE-REFONTE-IDENTITE.md`
- Commit history: `git log --oneline` (4 implementation phases)
- Tests: See `backend/src/tests/` (when Phase 5 is added)

---

## 🎯 Current Status

✅ **Architecture**: Complete
✅ **Backend API**: Complete & TypeScript-verified
⏳ **Frontend**: To be implemented
⏳ **Testing**: To be implemented (Phase 5)

---

**Branch**: `claude/fervent-thompson-2jaf98`
**Last Updated**: 2026-09-22
