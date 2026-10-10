import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { PrismaClient } from '../../backend/node_modules/@prisma/client/default.js';
import { PrismaPg } from '../../backend/node_modules/@prisma/adapter-pg/dist/index.mjs';
import bcrypt from '../../backend/node_modules/bcrypt/bcrypt.js';
import { generate } from '../../backend/node_modules/otplib/dist/index.js';

if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.includes('mfa_test')) throw new Error('Base dédiée mfa_test obligatoire');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const site = process.env.VERIF_SITE_URL || 'http://localhost:3000';
const mobile = process.env.VERIF_MOBILE_URL || 'http://127.0.0.1:3302';
const password = 'MfaBrowserFixture123!';
const role = `MFA_E2E_${Date.now()}`;
let user, browser;
try {
  await db.platformRole.create({ data: { plateforme: 'EAT', code: role, label: 'MFA navigateur fixture', permissions: { dashboard: 'read', payouts: 'write', billing: 'write' } } });
  user = await db.user.create({ data: { email: `mfa-e2e-${Date.now()}@example.test`, passwordHash: await bcrypt.hash(password, 10), emailVerified: true, isSystemAdmin: true,
    accesEquipe: { create: { plateforme: 'EAT', role } } } });
  browser = await chromium.launch({ headless: true });
  const web = await browser.newPage();
  await web.goto(`${site}/login`);
  await web.locator('input[type=email]').fill(user.email); await web.locator('input[type=password]').fill(password);
  await web.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await web.getByRole('heading', { name: 'Seconde authentification' }).waitFor();
  await web.getByLabel('Mot de passe actuel').fill(password);
  await web.getByRole('button', { name: 'Inscrire le facteur' }).click();
  const secret = await web.locator('pre').innerText();
  assert.match(secret, /^[A-Z2-7]+$/);
  await web.getByLabel('Code TOTP ou de récupération').fill(await generate({ secret, epoch: Math.floor(Date.now()/1000)-30 }));
  await web.getByRole('button', { name: 'Confirmer le code TOTP' }).click();
  await web.getByRole('button', { name: 'Codes conservés' }).waitFor();
  const recoveryCodes = (await web.locator('pre').innerText()).split('\n');
  assert.equal(recoveryCodes.length, 10);
  assert.equal(await web.evaluate((values) => values.some((value) => JSON.stringify({ ...localStorage, ...sessionStorage }).includes(value)), [secret, ...recoveryCodes]), false);
  await web.getByRole('button', { name: 'Codes conservés' }).click();
  await web.getByRole('link', { name: 'MFA', exact: true }).waitFor();
  console.log('OK web : connexion, blocage, enrôlement TOTP, dix codes, accès après confirmation');

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(mobile);
  await phone.getByPlaceholder('Email', { exact: true }).fill(user.email);
  await phone.getByPlaceholder('Mot de passe', { exact: true }).fill(password);
  await phone.getByText('Se connecter', { exact: true }).click();
  await phone.getByText('Seconde authentification', { exact: true }).waitFor();
  await phone.getByPlaceholder('Code TOTP ou récupération').fill(await generate({ secret }));
  await phone.getByText('Confirmer le code TOTP', { exact: true }).click();
  await phone.getByText('Plateforme', { exact: true }).waitFor();
  console.log('OK admin Expo web : connexion avant MFA, code, chargement des permissions après MFA');
  await phone.getByText('Compte', { exact: true }).last().click();
  await phone.getByText('Gérer la seconde authentification').click();
  await phone.getByText('Seconde authentification', { exact: true }).waitFor();
  console.log('OK admin Expo web : accès à la gestion du facteur depuis le compte');
} finally {
  await browser?.close();
  if (user) {
    // Sans déchiffrer les journaux : les IDs d'acteurs des fixtures restent chiffrés.
    await db.user.delete({ where: { id: user.id } });
  }
  await db.platformRole.deleteMany({ where: { code: role, plateforme: 'EAT' } });
  await db.$disconnect();
}
