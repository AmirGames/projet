/**
 * Après la connexion, l'espace commerçant.
 *
 * Depuis la refonte d'identité, la connexion ne mène plus droit à
 * `/merchant` : tout compte est aussi client, et l'écran de choix des
 * espaces (`/auth/role-selection`) s'intercale. Le commerçant y clique
 * « Accéder » sur la carte « Commerçant » — la suite fait le même geste.
 */
export async function entrerEspaceCommercant(page) {
  await page.waitForURL(
    (url) => url.pathname === '/auth/role-selection' || url.pathname.startsWith('/merchant'),
    { timeout: 15000 }
  );

  if (new URL(page.url()).pathname === '/auth/role-selection') {
    const carte = page.locator('div.p-6', {
      has: page.getByRole('heading', { name: 'Commerçant', exact: true }),
    });
    await carte.getByRole('button', { name: 'Accéder' }).click({ timeout: 15000 });
  }

  await page.waitForURL((url) => url.pathname.startsWith('/merchant'), { timeout: 15000 });
}
