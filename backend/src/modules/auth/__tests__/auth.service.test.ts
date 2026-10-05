import jwt from "jsonwebtoken";
import { getEnv } from "../../../config/env";
import { describe, it, expect } from '@jest/globals';
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

    it('should generate different tokens for different sessions of the same userId', () => {
      // Un jeton ne porte que l'identifiant et l'horodatage à la seconde : deux
      // jetons émis dans la même seconde sont identiques, seule la session les distingue.
      const userId = 'user-123';
      const token1 = AuthService.generateAccessToken(userId, 'session-1');
      const token2 = AuthService.generateAccessToken(userId, 'session-2');

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
});


describe('politique JWT Phase 0', () => {
  it('émet réellement un access de 15 minutes et un refresh de 7 jours', () => {
    const access = AuthService.verifyAccessToken(AuthService.generateAccessToken('u1', 's1'));
    const refresh = AuthService.verifyRefreshToken(AuthService.generateRefreshToken('u1', 's1', 'j1'));
    expect(access.exp! - access.iat!).toBe(900);
    expect(refresh.exp! - refresh.iat!).toBe(604800);
  });
  it('refuse un ancien access de 7 jours, même correctement signé', () => {
    const token = jwt.sign({ userId: 'u1', sid: 's1' }, getEnv().JWT_SECRET, { expiresIn: '7d' });
    expect(() => AuthService.verifyAccessToken(token)).toThrow();
  });
  it('refuse un ancien refresh de 30 jours, même correctement signé', () => {
    const token = jwt.sign({ userId: 'u1', sid: 's1', jti: 'j1' }, getEnv().JWT_REFRESH_SECRET, { expiresIn: '30d' });
    expect(() => AuthService.verifyRefreshToken(token)).toThrow();
  });
  it('refuse les tokens sans expiration ou déjà expirés', () => {
    const secret = getEnv().JWT_SECRET;
    expect(() => AuthService.verifyAccessToken(jwt.sign({ userId: 'u1' }, secret))).toThrow();
    expect(() => AuthService.verifyAccessToken(jwt.sign({ userId: 'u1' }, secret, { expiresIn: -1 }))).toThrow();
  });
});
