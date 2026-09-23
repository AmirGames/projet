#!/usr/bin/env node

/**
 * Clear authentication tokens from localStorage
 * Useful for development when JWT secrets change
 *
 * Usage:
 *   node scripts/clear-auth.js
 *
 * Note: This script only works in a browser context (Node.js warning is expected)
 *       For CLI clearing, use the browser console instead
 */

console.log('⚠️  This script is for browser console use only!');
console.log('');
console.log('Copy and paste this into your browser console:');
console.log('');
console.log(`
localStorage.removeItem('accessToken');
localStorage.removeItem('refreshToken');
localStorage.removeItem('user');
console.log('✅ Authentication tokens cleared!');
location.reload();
`);
console.log('');
console.log('Or add this to your browser bookmarks for quick access:');
console.log('');
const bookmarkletCode = `
javascript:(function(){
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  alert('✅ Auth tokens cleared! Reloading...');
  location.reload();
})()
`;
console.log(bookmarkletCode);
