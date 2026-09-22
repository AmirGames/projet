# 🧪 Test Cases - Unified Identity Authentication

## Quick Start

```bash
# Run unit tests
npm test

# Watch mode
npm test:watch

# Coverage report
npm test:coverage
```

---

## Manual Testing Guide

### Prerequisites
```bash
# 1. Start services
./start.sh

# 2. Install dependencies
npm install

# 3. Migrate database
npx prisma migrate deploy

# 4. Start backend
npm run dev
```

### Base URL
```
http://localhost:3001/api
```

---

## 🧑 Test Scenario 1: Complete Customer Flow

### Step 1: Signup (Create Customer)
```bash
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "name": "John Customer",
    "password": "SecurePass123!"
  }'
```

**Expected Response:**
```json
{
  "message": "Compte créé avec succès",
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": "clx...",
    "email": "customer@example.com",
    "name": "John Customer",
    "isSuperOwner": true,
    "isSystemAdmin": true
  },
  "customer": {
    "id": "clx...",
    "name": "John Customer",
    "email": "customer@example.com"
  }
}
```

**Assertions:**
- ✅ User created with hashed password
- ✅ Customer profile created linked to user
- ✅ First user marked as SuperOwner
- ✅ JWT contains only `userId` (no orgId, role, storeIds)
- ✅ Response includes customer object

**Save this for next tests:**
```bash
ACCESS_TOKEN="<copy accessToken>"
USER_ID="<copy user.id>"
```

---

### Step 2: Check User Roles
```bash
curl -X GET http://localhost:3001/api/me/roles \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Expected Response:**
```json
{
  "user": {
    "id": "clx...",
    "email": "customer@example.com",
    "isSuperOwner": true,
    "isSystemAdmin": true
  },
  "roles": {
    "customer": {
      "active": true,
      "customerId": "clx..."
    },
    "driver": {
      "active": false,
      "driverId": null,
      "status": null
    },
    "merchant": {
      "active": false,
      "organizations": []
    }
  }
}
```

**Assertions:**
- ✅ Customer role is active
- ✅ Driver and merchant roles are inactive
- ✅ Endpoint requires authentication

---

### Step 3: Activate Merchant Role
```bash
curl -X POST http://localhost:3001/api/me/become-merchant \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "My Amazing Restaurant",
    "storeName": "Main Location",
    "storeSlug": "my-restaurant-paris",
    "businessType": "Restaurant",
    "phone": "+33612345678",
    "address": "123 Rue de Paris",
    "city": "Paris",
    "postalCode": "75001",
    "description": "Best restaurant in town"
  }'
```

**Expected Response:**
```json
{
  "message": "Rôle de commerçant activé avec succès",
  "organization": {
    "id": "clx...",
    "name": "My Amazing Restaurant",
    "slug": "my-restaurant-paris"
  },
  "store": {
    "id": "clx...",
    "name": "Main Location",
    "slug": "my-restaurant-paris"
  }
}
```

**Assertions:**
- ✅ Organization created
- ✅ Store created
- ✅ Membership created (user linked to org)
- ✅ Slug is unique

**Error Cases:**
```bash
# Missing required field
curl -X POST http://localhost:3001/api/me/become-merchant \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"businessName": "Incomplete"}' 
# Expected: 400

# Duplicate slug
curl -X POST http://localhost:3001/api/me/become-merchant \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Another Restaurant",
    "storeSlug": "my-restaurant-paris",
    ...
  }'
# Expected: 400 - SLUG_EXISTS

# Without authentication
curl -X POST http://localhost:3001/api/me/become-merchant \
  -H "Content-Type: application/json" \
  -d '{...}'
# Expected: 401
```

---

### Step 4: Check Roles Again
```bash
curl -X GET http://localhost:3001/api/me/roles \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Expected Response (now with merchant role active):**
```json
{
  "roles": {
    "customer": { "active": true, "customerId": "clx..." },
    "driver": { "active": false, "driverId": null, "status": null },
    "merchant": {
      "active": true,
      "organizations": [
        {
          "id": "clx...",
          "name": "My Amazing Restaurant",
          "role": "ADMIN"
        }
      ]
    }
  }
}
```

**Assertions:**
- ✅ Merchant role now active
- ✅ Organization listed
- ✅ User has ADMIN role in org

---

### Step 5: Activate Driver Role
```bash
curl -X POST http://localhost:3001/api/me/become-driver \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Delivery",
    "email": "john.delivery@example.com",
    "phone": "+33698765432",
    "vehicleType": "Motorcycle",
    "vehiclePlate": "AB-123-CD"
  }'
```

**Expected Response:**
```json
{
  "message": "Candidature de livreur soumise avec succès",
  "driver": {
    "id": "clx...",
    "name": "John Delivery",
    "status": "PENDING"
  }
}
```

**Assertions:**
- ✅ Driver record created
- ✅ Status set to PENDING (needs approval)
- ✅ Linked to user

**Error Cases:**
```bash
# Driver already exists
curl -X POST http://localhost:3001/api/me/become-driver \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{...}'
# Expected: 400 - DRIVER_EXISTS
```

---

### Step 6: Final Roles Check
```bash
curl -X GET http://localhost:3001/api/me/roles \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Expected Response:**
```json
{
  "roles": {
    "customer": { "active": true, "customerId": "clx..." },
    "driver": { "active": true, "driverId": "clx...", "status": "PENDING" },
    "merchant": {
      "active": true,
      "organizations": [{ "id": "clx...", "name": "My Amazing Restaurant", "role": "ADMIN" }]
    }
  }
}
```

**Assertions:**
- ✅ All three roles now active
- ✅ User can have multiple roles simultaneously
- ✅ Data persisted correctly

---

## 🏪 Test Scenario 2: Merchant Direct Signup

```bash
curl -X POST http://localhost:3001/api/auth/merchant-register \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Merchant Express",
    "email": "merchant@example.com",
    "password": "SecurePass123!",
    "businessType": "FastFood",
    "phone": "+33612345678",
    "address": "456 Avenue",
    "city": "Lyon",
    "postalCode": "69000",
    "website": "https://merchant.com",
    "description": "Fast food delivery",
    "storeName": "Main Store",
    "storeSlug": "merchant-express-lyon"
  }'
```

**Expected Response:**
```json
{
  "message": "Inscription réussie et boutique créée!",
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": { "id": "clx...", "email": "merchant@example.com", ... },
  "organization": { "id": "clx...", "name": "Merchant Express", "slug": "merchant-express-lyon" },
  "store": { "id": "clx...", "name": "Main Store", "slug": "merchant-express-lyon", ... }
}
```

**Assertions:**
- ✅ User created (with email)
- ✅ Organization created
- ✅ Store created
- ✅ Membership created with ADMIN role
- ✅ Returns all details in one response

---

## 👷 Test Scenario 3: Driver Direct Signup

```bash
curl -X POST http://localhost:3001/api/drivers/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Driver Jean",
    "email": "driver@example.com",
    "password": "SecurePass123!",
    "phone": "+33612345678",
    "vehicleType": "Car",
    "vehiclePlate": "DRIVER-01"
  }'
```

**Expected Response:**
```json
{
  "message": "Inscription réussie",
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "driver": { "id": "clx...", "name": "Driver Jean", "email": "driver@example.com" }
}
```

**Assertions:**
- ✅ User created
- ✅ Driver record created
- ✅ JWT token returned with simplified payload

---

## 🔐 Test Scenario 4: Login Flow

### Step 1: Login with existing account
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "password": "SecurePass123!"
  }'
```

**Expected Response:**
```json
{
  "message": "Connexion réussie",
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": { "id": "clx...", "email": "customer@example.com", ... },
  "organizations": [
    { "id": "clx...", "name": "My Amazing Restaurant", "role": "ADMIN", ... }
  ]
}
```

**Assertions:**
- ✅ Credentials validated
- ✅ Token has simplified payload (userId only)
- ✅ Organizations loaded from database
- ✅ No orgId/role in JWT itself

### Step 2: Invalid password
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "password": "WrongPassword"
  }'
```

**Expected:** 401 - "Email ou mot de passe incorrect"

### Step 3: Non-existent email
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "nonexistent@example.com",
    "password": "AnyPassword"
  }'
```

**Expected:** 401 - "Email ou mot de passe incorrect"

---

## 🔄 Test Scenario 5: Token Refresh

```bash
curl -X POST http://localhost:3001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "'$REFRESH_TOKEN'"}'
```

**Expected Response:**
```json
{
  "message": "Token rafraîchi",
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

**Assertions:**
- ✅ New access token generated
- ✅ Same userId in new token
- ✅ Refresh token can be rotated

---

## 🔍 JWT Token Inspection

```bash
# Decode JWT (using jq and base64)
echo $ACCESS_TOKEN | cut -d'.' -f2 | base64 -d | jq .
```

**Expected Payload Structure:**
```json
{
  "userId": "clx...",
  "iat": 1695398400,
  "exp": 1696003200
}
```

**Verify:**
- ✅ Only contains `userId`
- ✅ No `orgId` field
- ✅ No `role` field
- ✅ No `storeIds` field
- ✅ Has `iat` (issued at)
- ✅ Has `exp` (expiration)

---

## 📊 Database Verification

### Check User Creation
```bash
npx prisma studio
# or
psql -U postgres -d saas_dev -c "SELECT id, email, isSuperOwner FROM \"User\" LIMIT 5;"
```

### Check Customer Linking
```bash
psql -U postgres -d saas_dev -c "SELECT id, userId FROM \"Customer\" LIMIT 5;"
```

### Check Organization Membership
```bash
psql -U postgres -d saas_dev -c "SELECT userId, orgId, role FROM \"Membership\" LIMIT 5;"
```

### Check Driver Records
```bash
psql -U postgres -d saas_dev -c "SELECT id, userId, status FROM \"Driver\" LIMIT 5;"
```

---

## ✅ Test Results Checklist

| Test Case | Expected | Actual | Status |
|-----------|----------|--------|--------|
| Signup creates User + Customer | ✅ | | |
| First user is SuperOwner | ✅ | | |
| JWT has simplified payload | ✅ | | |
| GET /me/roles shows active roles | ✅ | | |
| POST /me/become-merchant works | ✅ | | |
| POST /me/become-driver works | ✅ | | |
| Multiple roles can be active | ✅ | | |
| Merchant registration one-step | ✅ | | |
| Driver registration one-step | ✅ | | |
| Login returns organizations | ✅ | | |
| Invalid password rejected | ✅ | | |
| Token refresh works | ✅ | | |
| Expired token rejected | ✅ | | |
| Organization status checked | ✅ | | |
| SuperOwner can access admin | ✅ | | |

---

## 🐛 Debugging Tips

### Enable detailed logging
```bash
LOG_LEVEL=debug npm run dev
```

### Monitor email (Mailpit)
```
http://localhost:8025
```

### View database in real-time
```bash
npx prisma studio
```

### Check environment variables
```bash
cd backend && cat .env
```

### Validate JWT payload
```bash
# Install jq: apt-get install jq
node -e "console.log(JSON.parse(Buffer.from(process.argv[1].split('.')[1], 'base64').toString()))" YOUR_JWT_TOKEN
```

---

**Test Status**: Ready for automated testing
**Last Updated**: 2026-09-22
