import { inscrirePlateforme, inscrire, titre, check, j, uniq, post, get, patch, del, sqlScalaire, sqlExec, terminer } from './outils.mjs';

await inscrirePlateforme();
const alice = await inscrire('support-alice');
const bob = await inscrire('support-bob');
const payload = (orgId, subject = `Support ${uniq}`) => ({ orgId, subject, description: 'Description de regression support' });
async function creation(compte) {
  const r = await post('/api/support/tickets', payload(compte.organization.id), compte.accessToken);
  check('création légitime', r.status === 201, `statut ${r.status}`);
  const ticket = (await j(r))?.data;
  if (!ticket?.id) throw new Error('Ticket de test non créé');
  return ticket;
}
const ta = await creation(alice);
const tb = await creation(bob);
function operations(compte, ticket, token) {
  const org = encodeURIComponent(compte.organization.id);
  return [
    ['lecture', () => get(`/api/support/tickets/${ticket.id}`, token)],
    ['liste', () => get(`/api/support/tickets?orgId=${org}`, token)],
    ['liste archivée', () => get(`/api/support/tickets?orgId=${org}&archived=true`, token)],
    ['création', () => post('/api/support/tickets', payload(compte.organization.id, `Intrusion ${uniq}`), token)],
    ['statut', () => patch(`/api/support/tickets/${ticket.id}/status`, { status: 'CLOSED', orgId: bob.organization.id }, token)],
    ['suppression', () => del(`/api/support/tickets/${ticket.id}`, { orgId: bob.organization.id }, token)],
  ];
}
titre('Sans authentification');
for (const [nom, appel] of operations(alice, ta)) {
  const r = await appel();
  check(`${nom} sans jeton`, r.status === 401, `statut ${r.status}`);
}
async function intrusions() {
  for (const [victime, ticket, intrus] of [[alice, ta, bob], [bob, tb, alice]]) {
    for (const [nom, appel] of operations(victime, ticket, intrus.accessToken)) {
      const r = await appel();
      check(`${nom} inter-tenant`, r.status === 403, `statut ${r.status}`);
    }
  }
}
titre('Alice et Bob sont isolés');
await intrusions();
for (const [compte, ticket] of [[alice, ta], [bob, tb]]) {
  check('ticket intact en base', await sqlScalaire(`SELECT count(*) FROM "MerchantTicket" WHERE id = '${ticket.id}' AND "orgId" = '${compte.organization.id}' AND status = 'OPEN' AND "archivedAt" IS NULL`) === '1');
  check('aucune création étrangère', await sqlScalaire(`SELECT count(*) FROM "MerchantTicket" WHERE "orgId" = '${compte.organization.id}'`) === '1');
}
check('orgId multiple refusé', (await get(`/api/support/tickets?orgId=${alice.organization.id}&orgId=${bob.organization.id}`, alice.accessToken)).status === 400);
check('orgId absent refusé', (await get('/api/support/tickets', alice.accessToken)).status === 400);
check('ticket inconnu', (await get('/api/support/tickets/inexistant-support', alice.accessToken)).status === 404);

titre('Support des commerces suspendus');
for (const compte of [alice, bob]) await sqlExec(`UPDATE "Organization" SET status = 'SUSPENDED' WHERE id = '${compte.organization.id}'`);
await intrusions();
for (const [compte, ticket] of [[alice, ta], [bob, tb]]) {
  const token = compte.accessToken;
  check('état du compte suspendu accessible', (await get(`/api/support/compte/${compte.organization.id}`, token)).status === 200);
  const lu = await get(`/api/support/tickets/${ticket.id}`, token);
  check('lecture légitime suspendue', lu.status === 200 && (await j(lu))?.id === ticket.id);
  const liste = await get(`/api/support/tickets?orgId=${compte.organization.id}`, token);
  const donnees = await j(liste);
  check('liste légitime isolée', liste.status === 200 && donnees?.data?.length === 1 && donnees.data.every(t => t.orgId === compte.organization.id));
  const nouveau = await creation(compte);
  check('statut légitime suspendu', (await patch(`/api/support/tickets/${ticket.id}/status`, { status: 'CLOSED' }, token)).status === 200);
  check('clôture enregistrée en base', await sqlScalaire(`SELECT count(*) FROM "MerchantTicket" WHERE id = '${ticket.id}' AND status = 'CLOSED' AND "archivedAt" IS NOT NULL`) === '1');
  const archives = await j(await get(`/api/support/tickets?orgId=${compte.organization.id}&archived=true`, token));
  check('archive légitime visible', archives?.data?.some(t => t.id === ticket.id));
  check('suppression légitime suspendue', (await del(`/api/support/tickets/${nouveau.id}`, null, token)).status === 200);
  check('suppression enregistrée en base', await sqlScalaire(`SELECT count(*) FROM "MerchantTicket" WHERE id = '${nouveau.id}'`) === '0');
  check('contrôle final en base', await sqlScalaire(`SELECT count(*) FROM "MerchantTicket" WHERE "orgId" = '${compte.organization.id}'`) === '1');
  await sqlExec(`UPDATE "Organization" SET status = 'ACTIVE' WHERE id = '${compte.organization.id}'`);
}
await terminer();
