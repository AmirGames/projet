import { describe, it, expect, beforeAll } from '@jest/globals';
import { AuthService } from '../auth.service';

describe('AuthService', () => {
  describe('Password Hashing', () => {
    it('should hash a password', async () => {
      const password = 'TestPassword123!';
      const hash = await AuthService.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(20);
    });

    it('should generate different hashes for the same password', async () => {
      const password = 'TestPassword123!';
      const hash1 = await AuthService.hashPassword(password);
      const hash2 = await AuthService.hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should verify a correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await AuthService.hashPassword(password);
      const isValid = await AuthService.comparePassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should reject an incorrect password', async () => {
      const password = 'TestPassword123!';
      const wrongPassword = 'WrongPassword!';
      const hash = await AuthService.hashPassword(password);
      const isValid = await AuthService.comparePassword(wrongPassword, hash);

      expect(isValid).toBe(false);
    });
  });

  describe('Access Token Generation', () => {
    it('should generate a valid JWT token', () => {
      const userId = 'user-123';
      const token = AuthService.generateAccessToken(userId);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT format: header.payload.signature
    });

    it('should generate different tokens for the same userId', () => {
      const userId = 'user-123';
      const token1 = AuthService.generateAccessToken(userId);
      const token2 = AuthService.generateAccessToken(userId);

      expect(token1).not.toBe(token2);
    });

    it('should verify a valid token', () => {
      const userId = 'user-123';
      const token = AuthService.generateAccessToken(userId);
      const decoded = AuthService.verifyAccessToken(token);

      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe(userId);
    });

    it('should have simplified payload with only userId', () => {
      const userId = 'user-456';
      const token = AuthService.generateAccessToken(userId);
      const decoded = AuthService.verifyAccessToken(token);

      expect(decoded).toEqual(
        expect.objectContaining({
          userId: userId,
        })
      );
      expect(decoded).not.toHaveProperty('orgId');
      expect(decoded).not.toHaveProperty('role');
      expect(decoded).not.toHaveProperty('storeIds');
    });

    it('should reject an invalid token', () => {
      const invalidToken = 'invalid.token.here';

      expect(() => {
        AuthService.verifyAccessToken(invalidToken);
      }).toThrow();
    });

    it('should reject a tampered token', () => {
      const userId = 'user-123';
      const token = AuthService.generateAccessToken(userId);
      const tamperedToken = token.slice(0, -5) + 'xxxxx';

      expect(() => {
        AuthService.verifyAccessToken(tamperedToken);
      }).toThrow();
    });
  });

  describe('Refresh Token Generation', () => {
    it('should generate a refresh token', () => {
      const userId = 'user-123';
      const token = AuthService.generateRefreshToken(userId);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should verify a valid refresh token', () => {
      const userId = 'user-123';
      const token = AuthService.generateRefreshToken(userId);
      const decoded = AuthService.verifyRefreshToken(token);

      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe(userId);
    });

    it('should reject an invalid refresh token', () => {
      const invalidToken = 'invalid.refresh.token';

      expect(() => {
        AuthService.verifyRefreshToken(invalidToken);
      }).toThrow();
    });
  });

  describe('Verification Token Generation', () => {
    it('should generate a verification token', () => {
      const userId = 'user-123';
      const { token, expiresAt } = AuthService.generateVerificationToken(userId);

      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThan(30);
      expect(expiresAt).toBeInstanceOf(Date);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should set expiration to 24 hours from now', () => {
      const userId = 'user-123';
      const { expiresAt } = AuthService.generateVerificationToken(userId);
      const now = new Date();
      const expectedExpire = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Allow 1 second difference for test execution time
      const diff = Math.abs(expiresAt.getTime() - expectedExpire.getTime());
      expect(diff).toBeLessThan(1000);
    });

    it('should generate different tokens for same userId', () => {
      const userId = 'user-123';
      const token1 = AuthService.generateVerificationToken(userId);
      const token2 = AuthService.generateVerificationToken(userId);

      expect(token1.token).not.toBe(token2.token);
    });
  });

  describe('Random Token Generation', () => {
    it('should generate a random token', () => {
      const token = AuthService.generateRandomToken();

      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThan(30);
    });

    it('should generate different random tokens', () => {
      const token1 = AuthService.generateRandomToken();
      const token2 = AuthService.generateRandomToken();

      expect(token1).not.toBe(token2);
    });
  });
});
