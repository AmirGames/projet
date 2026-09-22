# 🧪 Plan de Tests E2E - Refonte Identité Unifiée

**Date**: 2026-09-22  
**Status**: 📋 Prêt pour exécution  
**Environnement**: Local ou UAT  

---

## 🚀 Configuration Préalable

### 1. Démarrer les Services
```bash
# À la racine du projet
docker-compose up -d

# Vérifier les services
docker-compose ps
```

Services attendus:
- ✅ PostgreSQL (localhost:5432)
- ✅ Redis (localhost:6379)
- ✅ Mailpit (http://localhost:8025)

### 2. Configurer l'Environnement Test

```bash
# Frontend
cd frontend
npm install
npm run dev  # Devrait lancer sur http://localhost:3000

# Backend
cd ../backend
npm install
cp .env.example .env

# Éditer .env:
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/saas_dev?schema=public
# JWT_SECRET=test-secret-key-min-32-characters-long
# JWT_REFRESH_SECRET=test-refresh-secret-key-min-32-chars
# API_URL=http://localhost:3001
# FRONTEND_URL=http://localhost:3000
```

### 3. Initialiser la Base de Données

```bash
cd backend
npx prisma migrate deploy  # Apply all migrations
npx prisma db seed        # Optional: seed test data
npm run dev               # Devrait lancer sur http://localhost:3001
```

---

## 📋 Flux de Test Manual

### **PHASE 1: SIGNUP & CUSTOMER CREATION**

#### Test 1.1: Signup - Créer User + Customer
```
Steps:
1. Navigate to http://localhost:3000/signup
2. Fill form:
   - Email: test-user-001@example.com
   - Name: Test User 001
   - Password: TestPassword123!
3. Click "Sign up"

Expected:
✅ Redirect to /auth/role-selection
✅ Page shows "Customer" role as ACTIVE
✅ "Devenir commerçant" button visible
✅ "Devenir livreur" button visible

Database:
✅ User created with isSuperOwner=true (first user)
✅ Customer created with userId linked
✅ JWT token contains only { userId }
```

#### Test 1.2: Second User Not Super Owner
```
Steps:
1. Logout (if logged in)
2. Signup with new email: test-user-002@example.com
3. Verify page loads

Expected:
✅ Second user should NOT see admin panel
✅ User.isSuperOwner = false in DB
✅ User.isSystemAdmin = false in DB
```

#### Test 1.3: Duplicate Email Rejected
```
Steps:
1. Try signup with email: test-user-001@example.com (from Test 1.1)
2. Observe error

Expected:
✅ Error message displayed: "Cet email est déjà utilisé"
✅ Status 400 in network tab
```

---

### **PHASE 2: JWT SIMPLIFIED**

#### Test 2.1: JWT Payload Verification
```
Steps:
1. Login with test-user-001@example.com
2. Open DevTools → Application → LocalStorage
3. Decode accessToken at https://jwt.io

Expected JWT Payload:
✅ Contains: userId (only ID)
✅ Contains: iat, exp (timestamps)
❌ Does NOT contain: orgId
❌ Does NOT contain: role
❌ Does NOT contain: storeIds

Example:
{
  "userId": "cuid_123abc...",
  "iat": 1695398400,
  "exp": 1695484800
}
```

#### Test 2.2: Token Expiration
```
Steps:
1. Wait for token to expire (7 days, or simulate in dev)
2. Try calling an API endpoint
3. Refresh page

Expected:
✅ 401 Unauthorized error
✅ Prompt user to login again
✅ New token generated after login
```

---

### **PHASE 3: /ME/ROLES ENDPOINT**

#### Test 3.1: Initial Roles After Signup
```
Steps:
1. Login (or from Test 1.1, already on role-selection)
2. Inspect network tab → GET /auth/me/roles
3. Check response body

Expected Response:
✅ Status 200
✅ roles.customer.active = true
✅ roles.customer.customerId = "cuid_..."
✅ roles.driver.active = false
✅ roles.driver.driverId = null
✅ roles.merchant.active = false
✅ roles.merchant.organizations = []
```

#### Test 3.2: Authentication Required
```
Steps:
1. Open new incognito window
2. Manually call: curl -H "Authorization: Bearer invalid" http://localhost:3001/auth/me/roles

Expected:
✅ Status 401
✅ Message: "Not authenticated"
```

---

### **PHASE 4: BECOME MERCHANT**

#### Test 4.1: Activate Merchant Role
```
Steps:
1. On /auth/role-selection page
2. Click "Devenir commerçant"
3. Fill merchant form:
   - Business Name: My Test Restaurant
   - Store Name: Main Location
   - Store Slug: my-test-restaurant
   - Business Type: restaurant
   - Phone: +33612345678
   - Address: 123 Rue de Test
   - City: Paris
   - Postal Code: 75001
   - Description: A test restaurant
4. Click "Créer"

Expected:
✅ Modal closes
✅ Page shows merchant role as ACTIVE
✅ Organization card displays: "My Test Restaurant"
✅ Status 201 in network tab
✅ Response includes org & store details

Database:
✅ Organization created with slug="my-test-restaurant"
✅ Store created linked to org
✅ Membership created: userId → org, role=ADMIN
✅ membership.storeIds includes the store ID
```

#### Test 4.2: Duplicate Slug Rejected
```
Steps:
1. Logout and login with new user (test-user-003@example.com)
2. Try to become merchant with slug: my-test-restaurant (duplicate from Test 4.1)
3. Submit form

Expected:
✅ Error message: "Cette URL est déjà utilisée"
✅ Modal stays open
✅ Status 400 in network
✅ Code: SLUG_EXISTS
```

#### Test 4.3: Multiple Merchants Per User
```
Steps:
1. On /auth/role-selection (as test-user-001)
2. Become second merchant:
   - Business Name: Second Restaurant
   - Store Slug: second-restaurant
   - Fill other fields...
3. Submit

Expected:
✅ Second organization created
✅ /auth/me/roles shows roles.merchant.organizations.length = 2
✅ Both org cards visible on role page
✅ Can navigate between merchants
```

#### Test 4.4: Merchant Can Access Store
```
Steps:
1. After becoming merchant (Test 4.1)
2. Navigate to merchant dashboard
3. Should see store name "Main Location"
4. Can create products, see orders, etc.

Expected:
✅ Store dashboard loads
✅ User can only see their own stores
✅ Cannot access other merchant's store
```

---

### **PHASE 5: BECOME DRIVER**

#### Test 5.1: Activate Driver Role
```
Steps:
1. On /auth/role-selection page
2. Click "Devenir livreur"
3. Fill driver form:
   - Name: John Delivery Driver
   - Email: john-driver@example.com
   - Phone: +33612345678
   - Vehicle Type: Motorcycle
   - Vehicle Plate/Registration: ABC-123
4. Click "S'inscrire"

Expected:
✅ Modal closes
✅ Driver role shows: PENDING (awaiting approval)
✅ Status 201 in network tab
✅ Button changes to "Application en attente d'approbation"

Database:
✅ Driver created with:
  - userId linked to user
  - status = "PENDING"
  - name, email, phone, vehicleType, vehiclePlate saved
```

#### Test 5.2: Cannot Apply Twice
```
Steps:
1. From Test 5.1, try to click "Devenir livreur" again
2. Or try to POST /auth/me/become-driver again

Expected:
✅ Error message: "Vous avez déjà un profil livreur"
✅ Status 400
✅ Code: DRIVER_EXISTS
✅ Button remains "Application en attente..."
```

#### Test 5.3: Driver Approval Workflow
```
Steps (Admin):
1. Login as superowner (first user from Test 1.1)
2. Navigate to /superowner/drivers
3. Find pending driver from Test 5.1
4. Click "Approuver"
5. Select "ACTIVE"
6. Save

Expected:
✅ Driver status changes from PENDING to ACTIVE
✅ Driver can now accept deliveries
✅ User can see driver role as ACTIVE
```

---

### **PHASE 6: COMPLETE FLOW**

#### Test 6.1: Full Journey (Signup → Merchant → Driver)
```
Steps:
1. Signup with email: complete-user@example.com
2. Verify on /auth/role-selection
   - Only Customer active
3. Become Merchant:
   - Create "Complete Restaurant"
   - Verify status updates
4. Become Driver:
   - Create driver profile
   - Verify status = PENDING
5. Access /auth/me/roles
   - Verify all 3 roles show

Expected After Each Step:
1️⃣ Signup → Customer active only
2️⃣ After Merchant → Customer + Merchant active (1 org)
3️⃣ After Driver → All 3 active, Driver=PENDING
4️⃣ GET /me/roles shows:
   - customer: { active: true, customerId: "..." }
   - merchant: { active: true, organizations: [{...}] }
   - driver: { active: true, status: "PENDING", driverId: "..." }
```

---

### **PHASE 7: SECURITY & ACCESS CONTROL**

#### Test 7.1: Cannot Access Other's Organization
```
Steps:
1. Login as user A (has organization X)
2. Get organization ID from DB
3. Login as user B (different user)
4. Try to POST /api/stores with orgId=X (user A's org)
5. Or try to GET /api/stores?orgId=X

Expected:
✅ Status 403 or 401
✅ Error: "Organization access denied"
❌ User B cannot see/modify user A's data
```

#### Test 7.2: SuperOwner Only Routes
```
Steps:
1. Login as regular user (test-user-002)
2. Try to access: http://localhost:3001/api/superowner/dashboard
3. Check network tab response

Expected:
✅ Status 403
✅ Message: "Accès refusé - Superowner requis"
❌ Regular user cannot access admin routes
```

#### Test 7.3: JWT Cannot Bypass Permissions
```
Steps:
1. Capture JWT from user A (regular user)
2. Manually modify JWT in DevTools to add orgId field
3. Call API with modified JWT

Expected:
✅ API should still require permissions from DB
✅ Modified JWT field should be ignored
✅ orgId loaded from database (not JWT)
❌ User cannot escalate permissions via JWT
```

---

## 🔧 Backend Tests (Jest)

### Setup Test Environment
```bash
cd backend

# Create .env.test
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/saas_test
JWT_SECRET=test-secret-min-32-characters-long
JWT_REFRESH_SECRET=test-refresh-secret-min-32-characters

# Run tests
npm test -- src/routes/__tests__/refonte-e2e.test.ts

# Or with coverage
npm run test:coverage
```

### Test Cases Automated
✅ Signup creates User + Customer  
✅ JWT payload contains only userId  
✅ GET /me/roles returns correct structure  
✅ POST /me/become-merchant creates Org + Store  
✅ POST /me/become-driver creates Driver (PENDING)  
✅ Cannot duplicate slug  
✅ Cannot apply for driver twice  
✅ Multiple merchants per user  
✅ Complete flow integration test  

---

## 🐛 Common Issues & Fixes

### Issue: "Database connection failed"
```
Fix:
1. Verify docker-compose services running
2. Check DATABASE_URL in .env
3. Run: psql -U postgres -h localhost -d saas_dev
4. If DB not initialized: npx prisma migrate deploy
```

### Issue: "Token invalid" after login
```
Fix:
1. Check JWT_SECRET and JWT_REFRESH_SECRET in .env
2. Verify token format: "Bearer <token>"
3. Check authorization header in network tab
4. Ensure token hasn't expired
```

### Issue: "Organization not found"
```
Fix:
1. Verify organization slug is unique
2. Check merchant form validation
3. Look at response in network tab for error details
4. Database: SELECT * FROM "Organization" ORDER BY "createdAt" DESC LIMIT 5
```

### Issue: "Customer not created"
```
Fix:
1. Check ENABLE_EMAIL_VERIFICATION setting
2. Verify customer.ts migration was applied
3. Check browser console for errors
4. Database: SELECT * FROM "Customer" WHERE "userId" = 'your-user-id'
```

---

## ✅ Validation Checklist

After running all tests:

**Signup & Authentication**
- [ ] User created with correct email/name
- [ ] Customer created linked to user
- [ ] First user marked as SuperOwner
- [ ] Second+ users NOT SuperOwner
- [ ] JWT simplified (userId only)
- [ ] Tokens stored in localStorage
- [ ] Duplicate email rejected

**Role Selection**
- [ ] /auth/role-selection accessible after login
- [ ] All 3 roles displayed
- [ ] Customer shows as ACTIVE
- [ ] Driver/Merchant show as INACTIVE initially
- [ ] User info displayed correctly

**Merchant Activation**
- [ ] Merchant form shows with all fields
- [ ] Organization created on submit
- [ ] Store created linked to org
- [ ] Membership created with ADMIN role
- [ ] Slug must be unique
- [ ] Can create multiple merchants
- [ ] Merchant dashboard accessible

**Driver Activation**
- [ ] Driver form shows with vehicle fields
- [ ] Driver created with PENDING status
- [ ] Cannot apply twice (error shown)
- [ ] Superowner can approve/reject
- [ ] Once approved, status = ACTIVE

**Security**
- [ ] JWT doesn't contain orgId/role/storeIds
- [ ] Regular users cannot access /admin, /superowner
- [ ] Cannot access other user's organization
- [ ] Modified JWT cannot escalate permissions
- [ ] API validates ownership in database

**Database**
- [ ] User table: id, email, isSuperOwner, isSystemAdmin
- [ ] Customer table: id, userId (unique, linked)
- [ ] Organization table: slug (unique)
- [ ] Membership table: userId, orgId, role
- [ ] Driver table: userId (unique), status, vehicleType
- [ ] No orphaned records (cleanup works)

---

## 📊 Test Results Template

```
🎯 REFONTE E2E TEST RESULTS
Date: [DATE]
Tester: [NAME]
Environment: [LOCAL/UAT]

PHASE 1: SIGNUP & CUSTOMER
✅ Test 1.1: Create User + Customer - PASS
✅ Test 1.2: Second user not super owner - PASS
✅ Test 1.3: Duplicate email rejected - PASS

PHASE 2: JWT SIMPLIFIED
✅ Test 2.1: JWT payload verification - PASS
⚠️  Test 2.2: Token expiration - [COMMENT]

PHASE 3: /ME/ROLES
✅ Test 3.1: Initial roles - PASS
✅ Test 3.2: Auth required - PASS

PHASE 4: BECOME MERCHANT
✅ Test 4.1: Activate merchant - PASS
✅ Test 4.2: Duplicate slug - PASS
✅ Test 4.3: Multiple merchants - PASS
✅ Test 4.4: Access store - PASS

PHASE 5: BECOME DRIVER
✅ Test 5.1: Activate driver - PASS
✅ Test 5.2: Cannot apply twice - PASS
✅ Test 5.3: Approval workflow - PASS

PHASE 6: COMPLETE FLOW
✅ Test 6.1: Full journey - PASS

PHASE 7: SECURITY
✅ Test 7.1: Cannot access other's org - PASS
✅ Test 7.2: Superowner only routes - PASS
✅ Test 7.3: JWT cannot bypass - PASS

SUMMARY:
Total Tests: 16
Passed: 16
Failed: 0
Warnings: 0

Status: ✅ READY FOR PRODUCTION
```

---

## 🚀 Next Steps

After Manual E2E Testing:
1. ✅ Fix any blocking issues
2. ✅ Run Jest automated tests
3. ✅ Update REFONTE-STATUS.md with results
4. ✅ Code review of changes
5. ✅ Security audit
6. ✅ Performance testing
7. 🚀 Deploy to UAT → Production

---

**Created**: 2026-09-22  
**Last Updated**: 2026-09-22  
**Status**: 📋 Ready for Testing  
