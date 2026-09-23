#!/usr/bin/env node

/**
 * Test authentication setup
 *
 * This script:
 * 1. Validates that .env is properly configured
 * 2. Generates a test token
 * 3. Shows how to test the API
 *
 * Usage:
 *   node test-auth.js
 */

require('dotenv').config();
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const API_URL = process.env.API_URL || 'http://localhost:3001';

console.log('🔍 Authentication Setup Test\n');

// Check .env configuration
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET not configured in .env');
  console.error('   Run: cd backend && ./setup-env.sh');
  process.exit(1);
}

if (JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET is too short (must be 32+ characters)');
  console.error('   Current length:', JWT_SECRET.length);
  process.exit(1);
}

console.log('✅ .env is properly configured');
console.log('   JWT_SECRET:', JWT_SECRET.substring(0, 16) + '... (' + JWT_SECRET.length + ' chars)');
console.log('');

// Generate a test token
const testUserId = 'test-user-' + Date.now();
const token = jwt.sign(
  { userId: testUserId },
  JWT_SECRET,
  {
    expiresIn: '7d',
    algorithm: 'HS256'
  }
);

console.log('🎫 Generated Test Token:');
console.log('   User ID:', testUserId);
console.log('   Token:', token.substring(0, 50) + '...');
console.log('   Expires: 7 days from now');
console.log('');

// Show how to test
console.log('📝 Test the API with curl:');
console.log('');
console.log(`curl -X POST ${API_URL}/api/delivery-zones \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${token}" \\
  -d '{
    "storeId": "test-store-id",
    "name": "Zone Test",
    "type": "RADIUS",
    "radiusKm": 5,
    "baseFee": 2.50
  }'
`);

console.log('\n⚠️  Note: This test token will only work if:');
console.log('   1. The user/store exists in the database');
console.log('   2. The backend is running and using the same JWT_SECRET');
console.log('   3. The user has access to the store');
console.log('');

console.log('✨ If you get 403 or 404, it means JWT verification passed but authorization failed');
console.log('   (which means .env is correctly configured!)');
