import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { createApp } from '../../app';
import { db } from '../../services/db';
// import { AuthService } from '../../services/auth.service';

describe('🎯 Refonte Identité Unifiée - E2E Tests', () => {
  let app: any;
  let testAccessToken: string;
  let testUserId: string;

  beforeAll(async () => {
    app = createApp();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test data
    await db.user.deleteMany({});
    await db.customer.deleteMany({});
    await db.driver.deleteMany({});
    await db.organization.deleteMany({});
    await db.membership.deleteMany({});
    await db.store.deleteMany({});
  });

  // ============================================================================
  // PHASE 3: SIGNUP & CUSTOMER CREATION
  // ============================================================================

  describe('🔑 Signup - Create User + Customer', () => {
    it('should create user and customer on signup', async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send({
          email: 'test@example.com',
          name: 'Test User',
          password: 'TestPassword123!',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user).toEqual({
        id: expect.any(String),
        email: 'test@example.com',
        name: 'Test User',
        isSuperOwner: true, // First user
        isSystemAdmin: true,
      });
      expect(res.body.customer).toEqual({
        id: expect.any(String),
        name: 'Test User',
        email: 'test@example.com',
      });

      testAccessToken = res.body.accessToken;
      testUserId = res.body.user.id;

      // Verify in database
      const user = await db.user.findUnique({ where: { id: testUserId } });
      expect(user).toBeDefined();
      expect(user?.isSuperOwner).toBe(true);

      const customer = await db.customer.findUnique({
        where: { userId: testUserId },
      });
      expect(customer).toBeDefined();
      expect(customer?.userId).toBe(testUserId);
    });

    it('should reject duplicate email', async () => {
      // Create first user
      await request(app)
        .post('/auth/signup')
        .send({
          email: 'test@example.com',
          name: 'First User',
          password: 'TestPassword123!',
        });

      // Try to create second with same email
      const res = await request(app)
        .post('/auth/signup')
        .send({
          email: 'test@example.com',
          name: 'Second User',
          password: 'TestPassword123!',
        });

      expect(res.status).toBe(400);
    });

    it('second user should not be super owner', async () => {
      // Create first user
      await request(app)
        .post('/auth/signup')
        .send({
          email: 'first@example.com',
          name: 'First User',
          password: 'TestPassword123!',
        });

      // Create second user
      const res = await request(app)
        .post('/auth/signup')
        .send({
          email: 'second@example.com',
          name: 'Second User',
          password: 'TestPassword123!',
        });

      expect(res.body.user.isSuperOwner).toBe(false);
    });
  });

  // ============================================================================
  // PHASE 3: JWT SIMPLIFIED (USERID ONLY)
  // ============================================================================

  describe('🔐 JWT - Simplified Payload', () => {
    beforeEach(async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send({
          email: 'test@example.com',
          name: 'Test User',
          password: 'TestPassword123!',
        });
      testAccessToken = res.body.accessToken;
      testUserId = res.body.user.id;
    });

    it('should return JWT with only userId', async () => {
      const parts = testAccessToken.split('.');
      expect(parts.length).toBe(3); // Valid JWT structure

      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64').toString()
      );

      // Should contain userId
      expect(payload).toHaveProperty('userId', testUserId);

      // Should NOT contain orgId, role, storeIds
      expect(payload).not.toHaveProperty('orgId');
      expect(payload).not.toHaveProperty('role');
      expect(payload).not.toHaveProperty('storeIds');

      // Should contain standard JWT claims
      expect(payload).toHaveProperty('iat');
      expect(payload).toHaveProperty('exp');
    });
  });

  // ============================================================================
  // PHASE 3: /ME/ROLES ENDPOINT
  // ============================================================================

  describe('👤 GET /me/roles - User Role Status', () => {
    beforeEach(async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send({
          email: 'test@example.com',
          name: 'Test User',
          password: 'TestPassword123!',
        });
      testAccessToken = res.body.accessToken;
      testUserId = res.body.user.id;
    });

    it('should return customer role as active after signup', async () => {
      const res = await request(app)
        .get('/auth/me/roles')
        .set('Authorization', `Bearer ${testAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.roles.customer.active).toBe(true);
      expect(res.body.roles.customer.customerId).toBeDefined();
    });

    it('should return driver role as inactive initially', async () => {
      const res = await request(app)
        .get('/auth/me/roles')
        .set('Authorization', `Bearer ${testAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.roles.driver.active).toBe(false);
      expect(res.body.roles.driver.driverId).toBeNull();
    });

    it('should return merchant role as inactive initially', async () => {
      const res = await request(app)
        .get('/auth/me/roles')
        .set('Authorization', `Bearer ${testAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.roles.merchant.active).toBe(false);
      expect(res.body.roles.merchant.organizations).toEqual([]);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/auth/me/roles');

      expect(res.status).toBe(401);
    });

    it('should return full user info', async () => {
      const res = await request(app)
        .get('/auth/me/roles')
        .set('Authorization', `Bearer ${testAccessToken}`);

      expect(res.body.user).toEqual({
        id: testUserId,
        email: 'test@example.com',
        isSuperOwner: true,
        isSystemAdmin: true,
      });
    });
  });

  // ============================================================================
  // PHASE 3: BECOME MERCHANT
  // ============================================================================

  describe('🏪 POST /me/become-merchant - Activate Merchant Role', () => {
    beforeEach(async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send({
          email: 'merchant@example.com',
          name: 'Merchant User',
          password: 'TestPassword123!',
        });
      testAccessToken = res.body.accessToken;
      testUserId = res.body.user.id;
    });

    it('should create organization and store', async () => {
      const res = await request(app)
        .post('/auth/me/become-merchant')
        .set('Authorization', `Bearer ${testAccessToken}`)
        .send({
          businessName: 'My Restaurant',
          storeName: 'Main Location',
          storeSlug: 'my-restaurant',
          businessType: 'restaurant',
          phone: '+33612345678',
          address: '123 Rue de Paris',
          city: 'Paris',
          postalCode: '75001',
          description: 'A great restaurant',
        });

      expect(res.status).toBe(201);
      expect(res.body.organization).toEqual({
        id: expect.any(String),
        name: 'My Restaurant',
        slug: 'my-restaurant',
      });
      expect(res.body.store).toEqual({
        id: expect.any(String),
        name: 'Main Location',
        slug: 'my-restaurant',
      });

      // Verify in database
      const org = await db.organization.findUnique({
        where: { slug: 'my-restaurant' },
      });
      expect(org).toBeDefined();
      expect(org?.name).toBe('My Restaurant');

      const membership = await db.membership.findFirst({
        where: { userId: testUserId, orgId: org!.id },
      });
      expect(membership).toBeDefined();
      expect(membership?.role).toBe('ADMIN');
    });

    it('should reject duplicate slug', async () => {
      // Create first merchant
      await request(app)
        .post('/auth/me/become-merchant')
        .set('Authorization', `Bearer ${testAccessToken}`)
        .send({
          businessName: 'First Restaurant',
          storeName: 'Location 1',
          storeSlug: 'my-restaurant',
          businessType: 'restaurant',
          phone: '+33612345678',
          address: '123 Rue de Paris',
          city: 'Paris',
          postalCode: '75001',
          description: 'First',
        });

      // Create second user
      const signupRes = await request(app)
        .post('/auth/signup')
        .send({
          email: 'merchant2@example.com',
          name: 'Second Merchant',
          password: 'TestPassword123!',
        });

      // Try to create with duplicate slug
      const res = await request(app)
        .post('/auth/me/become-merchant')
        .set('Authorization', `Bearer ${signupRes.body.accessToken}`)
        .send({
          businessName: 'Second Restaurant',
          storeName: 'Location 2',
          storeSlug: 'my-restaurant', // Duplicate!
          businessType: 'restaurant',
          phone: '+33612345678',
          address: '456 Rue de Lyon',
          city: 'Lyon',
          postalCode: '69000',
          description: 'Second',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SLUG_EXISTS');
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/auth/me/become-merchant')
        .send({
          businessName: 'My Restaurant',
          storeName: 'Main',
          storeSlug: 'my-restaurant',
          businessType: 'restaurant',
          phone: '+33612345678',
          address: '123 Rue',
          city: 'Paris',
          postalCode: '75001',
          description: 'Test',
        });

      expect(res.status).toBe(401);
    });

    it('should allow multiple merchants per user', async () => {
      // Create first merchant
      const res1 = await request(app)
        .post('/auth/me/become-merchant')
        .set('Authorization', `Bearer ${testAccessToken}`)
        .send({
          businessName: 'Restaurant 1',
          storeName: 'Location 1',
          storeSlug: 'restaurant-1',
          businessType: 'restaurant',
          phone: '+33612345678',
          address: '123 Rue',
          city: 'Paris',
          postalCode: '75001',
          description: 'First',
        });

      expect(res1.status).toBe(201);
      const orgId1 = res1.body.organization.id;

      // Create second merchant
      const res2 = await request(app)
        .post('/auth/me/become-merchant')
        .set('Authorization', `Bearer ${testAccessToken}`)
        .send({
          businessName: 'Restaurant 2',
          storeName: 'Location 2',
          storeSlug: 'restaurant-2',
          businessType: 'restaurant',
          phone: '+33612345678',
          address: '456 Rue',
          city: 'Lyon',
          postalCode: '69000',
          description: 'Second',
        });

      expect(res2.status).toBe(201);
      const orgId2 = res2.body.organization.id;

      // Verify both memberships exist
      const memberships = await db.membership.findMany({
        where: { userId: testUserId },
      });
      expect(memberships.length).toBe(2);
      expect([orgId1, orgId2]).toContain(memberships[0].orgId);
      expect([orgId1, orgId2]).toContain(memberships[1].orgId);
    });
  });

  // ============================================================================
  // PHASE 3: BECOME DRIVER
  // ============================================================================

  describe('🚗 POST /me/become-driver - Activate Driver Role', () => {
    beforeEach(async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send({
          email: 'driver@example.com',
          name: 'Driver User',
          password: 'TestPassword123!',
        });
      testAccessToken = res.body.accessToken;
      testUserId = res.body.user.id;
    });

    it('should create driver with PENDING status', async () => {
      const res = await request(app)
        .post('/auth/me/become-driver')
        .set('Authorization', `Bearer ${testAccessToken}`)
        .send({
          name: 'John Driver',
          email: 'john@example.com',
          phone: '+33612345678',
          vehicleType: 'motorcycle',
          vehiclePlate: 'ABC-123',
        });

      expect(res.status).toBe(201);
      expect(res.body.driver).toEqual({
        id: expect.any(String),
        userId: testUserId,
        status: 'PENDING',
      });

      // Verify in database
      const driver = await db.driver.findUnique({
        where: { userId: testUserId },
      });
      expect(driver).toBeDefined();
      expect(driver?.status).toBe('PENDING');
      expect(driver?.vehicleType).toBe('motorcycle');
      expect(driver?.vehiclePlate).toBe('ABC-123');
    });

    it('should reject if driver already exists', async () => {
      // Create first driver
      await request(app)
        .post('/auth/me/become-driver')
        .set('Authorization', `Bearer ${testAccessToken}`)
        .send({
          name: 'John Driver',
          email: 'john@example.com',
          phone: '+33612345678',
          vehicleType: 'car',
          vehiclePlate: 'ABC-123',
        });

      // Try to create second
      const res = await request(app)
        .post('/auth/me/become-driver')
        .set('Authorization', `Bearer ${testAccessToken}`)
        .send({
          name: 'John Driver 2',
          email: 'john2@example.com',
          phone: '+33612345678',
          vehicleType: 'bicycle',
          vehiclePlate: 'XYZ-789',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('DRIVER_EXISTS');
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/auth/me/become-driver')
        .send({
          name: 'John Driver',
          email: 'john@example.com',
          phone: '+33612345678',
          vehicleType: 'car',
          vehiclePlate: 'ABC-123',
        });

      expect(res.status).toBe(401);
    });
  });

  // ============================================================================
  // PHASE 3: COMPLETE FLOW
  // ============================================================================

  describe('🎬 Complete User Journey', () => {
    it('should handle full signup → roles → become merchant → become driver flow', async () => {
      // 1. Signup
      const signupRes = await request(app)
        .post('/auth/signup')
        .send({
          email: 'complete@example.com',
          name: 'Complete User',
          password: 'TestPassword123!',
        });

      expect(signupRes.status).toBe(201);
      const token = signupRes.body.accessToken;
      // const userId = signupRes.body.user.id;

      // 2. Check initial roles (customer only)
      const rolesRes1 = await request(app)
        .get('/auth/me/roles')
        .set('Authorization', `Bearer ${token}`);

      expect(rolesRes1.status).toBe(200);
      expect(rolesRes1.body.roles.customer.active).toBe(true);
      expect(rolesRes1.body.roles.driver.active).toBe(false);
      expect(rolesRes1.body.roles.merchant.active).toBe(false);

      // 3. Become merchant
      const merchantRes = await request(app)
        .post('/auth/me/become-merchant')
        .set('Authorization', `Bearer ${token}`)
        .send({
          businessName: 'Complete Restaurant',
          storeName: 'Main Store',
          storeSlug: 'complete-restaurant',
          businessType: 'restaurant',
          phone: '+33612345678',
          address: '123 Complete',
          city: 'Paris',
          postalCode: '75001',
          description: 'Complete flow test',
        });

      expect(merchantRes.status).toBe(201);

      // 4. Check roles after merchant activation
      const rolesRes2 = await request(app)
        .get('/auth/me/roles')
        .set('Authorization', `Bearer ${token}`);

      expect(rolesRes2.status).toBe(200);
      expect(rolesRes2.body.roles.merchant.active).toBe(true);
      expect(rolesRes2.body.roles.merchant.organizations.length).toBe(1);

      // 5. Become driver
      const driverRes = await request(app)
        .post('/auth/me/become-driver')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Complete Driver',
          email: 'driver@complete.com',
          phone: '+33612345678',
          vehicleType: 'car',
          vehiclePlate: 'COMPLETE-1',
        });

      expect(driverRes.status).toBe(201);

      // 6. Check final roles (all three active)
      const rolesRes3 = await request(app)
        .get('/auth/me/roles')
        .set('Authorization', `Bearer ${token}`);

      expect(rolesRes3.status).toBe(200);
      expect(rolesRes3.body.roles.customer.active).toBe(true);
      expect(rolesRes3.body.roles.merchant.active).toBe(true);
      expect(rolesRes3.body.roles.driver.active).toBe(true);
      expect(rolesRes3.body.roles.driver.status).toBe('PENDING');
    });
  });
});
