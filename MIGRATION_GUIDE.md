# Migration Guide v8 - Uber Eats Like Platform

## Overview
This migration transforms the platform from a simple merchant-store model to an Uber Eats-like multi-restaurant delivery system with global customers.

## What Changed

### Schema Changes (v8)
- **Customer Model**: Now global (no storeId) - customers register once and can order from any restaurant
- **Driver Model**: NEW - for delivery system with location tracking
- **DriverDocument Model**: NEW - for driver credential verification
- **OrderDelivery Model**: NEW - for tracking deliveries with GPS and proof
- **FavoriteStore Model**: NEW - for customer favorites
- **Store Model**: Enhanced with geolocation, delivery options, ratings

### Backend Changes
- Updated `/api/admin/stats` endpoint with platform-wide metrics
- Modified auth flow: First user becomes Super Owner + System Admin
- Store management with 6-tab dashboard

### Frontend Changes
- Super Owner Dashboard showing platform statistics
- Store management page with full CRUD
- Updated Navbar with role-based navigation

## Running the Migration

### Step 1: Ensure Database is Running
```bash
# Make sure your PostgreSQL database is running at localhost:5432
# with the connection string from backend/.env
```

### Step 2: Run Migration
```bash
cd backend
npx prisma migrate dev --name v8_uber_eats_schema
```

This will:
- Create all new tables (Driver, DriverDocument, OrderDelivery, FavoriteStore)
- Modify Customer table (remove storeId if present)
- Modify Store table (add new fields)
- Update all indexes and constraints

### Step 3: Verify Migration
```bash
npx prisma db push
npx prisma generate
```

### Step 4: Test
1. Create a new account - should become Super Owner
2. Navigate to "👑 Super Owner" dashboard
3. Verify stats are loading
4. Create merchants, stores, and orders
5. Check hourly statistics in store dashboard

## Rollback (if needed)
```bash
npx prisma migrate resolve --rolled-back v8_uber_eats_schema
```

Then run:
```bash
npx prisma migrate dev
```

## Environment Setup
Make sure these are in your `.env`:
- `DATABASE_URL`: PostgreSQL connection string
- All other configuration from `.env.example`

## Key Features Now Available
✅ Global customer registration
✅ Multi-restaurant orders in single transaction
✅ Delivery system with driver tracking
✅ Platform commission tracking
✅ Super Owner dashboard
✅ Hourly order statistics
✅ Customer favorites system
✅ Driver credential verification

## Next Steps (After Migration)
1. Create Client App (frontend/app/client/)
2. Implement geolocation endpoints
3. Add delivery tracking APIs
4. Build driver app
5. Implement real-time updates with WebSockets
