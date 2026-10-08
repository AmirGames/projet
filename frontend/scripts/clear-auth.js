#!/usr/bin/env node

/**
 * Clear the browser session in development when JWT secrets change.
 * The access token lives in memory only and the refresh token in an httpOnly
 * cookie: nothing to clear in localStorage but the old keys and the hint.
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
fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', credentials: 'same-origin' })
  .finally(() => { localStorage.removeItem('sessionOuverte'); localStorage.removeItem('user'); location.reload(); });
`);
console.log('');
console.log('Or add this to your browser bookmarks for quick access:');
console.log('');
const bookmarkletCode = `
javascript:(function(){
  fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',credentials:'same-origin'}).finally(function(){localStorage.removeItem('sessionOuverte');localStorage.removeItem('user');location.reload();});
})()
`;
console.log(bookmarkletCode);
