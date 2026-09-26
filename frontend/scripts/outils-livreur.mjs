/**
 * Faire valider un livreur, comme la plateforme le ferait.
 *
 * Un livreur s'inscrit en `PENDING` : il ne peut pas se mettre en ligne et
 * aucune course ne lui est proposée tant que la plateforme n'a pas examiné ses
 * pièces. Les scripts qui vérifient autre chose — le suivi client, l'écran des
 * courses — ont besoin d'un livreur en état de rouler, et empruntent le même
 * chemin que la vraie validation plutôt que de forcer l'état en base.
 */

const lire = async (reponse) => reponse.json().catch(() => null);

export async function validerLivreur(API, jetonLivreur, jetonPlateforme) {
  const entetes = (jeton) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${jeton}`,
  });

  const moi = await lire(await fetch(`${API}/api/drivers/me`, { headers: entetes(jetonLivreur) }));
  const driverId = moi?.data?.id;

  for (const type of moi?.data?.piecesAttendues || []) {
    await fetch(`${API}/api/drivers/documents`, {
      method: 'POST',
      headers: entetes(jetonLivreur),
      body: JSON.stringify({ type, documentUrl: `https://exemple.fr/${type}.pdf` }),
    });
  }

  const dossier = await lire(
    await fetch(`${API}/api/drivers/documents`, { headers: entetes(jetonLivreur) })
  );

  for (const piece of dossier?.data?.documents || []) {
    await fetch(`${API}/api/superowner/drivers/${driverId}/documents/${piece.id}`, {
      method: 'PATCH',
      headers: entetes(jetonPlateforme),
      body: JSON.stringify({ approuve: true }),
    });
  }

  const validation = await fetch(`${API}/api/superowner/drivers/${driverId}/approve`, {
    method: 'POST',
    headers: entetes(jetonPlateforme),
    body: JSON.stringify({}),
  });

  // Seul le tout premier compte inscrit devient la plateforme. Sur une base
  // déjà peuplée, le compte créé par le script ne l'est pas, la validation est
  // refusée, et le script échouerait plus loin sur un « aucun livreur
  // disponible » qui n'explique rien.
  if (validation.status === 403) {
    throw new Error(
      'La validation du livreur a été refusée : le compte plateforme du script ' +
        "n'est pas superowner. Remettez la base à zéro avant de lancer ce script " +
        '(backend/scripts/verification/reinitialiser.mjs).'
    );
  }

  return driverId;
}

/**
 * Le code de remise d'une commande.
 *
 * Il appartient au client : le livreur ne le voit jamais. Un script qui clôt
 * une course joue le rôle du client, et le lit donc là où celui-ci le lit —
 * sur le suivi de sa commande.
 */
export async function codeDeRemise(API, orderId) {
  const commande = await lire(await fetch(`${API}/api/orders/${orderId}`));

  return commande?.codeRemise || null;
}

/**
 * Le commerçant accepte la commande, la prépare et la déclare prête.
 *
 * Le livreur ne peut emporter qu'une commande prête : les scripts qui mènent
 * une course jusqu'au client passent par le vrai chemin du commerçant avant
 * le retrait, plutôt que de forcer l'état en base.
 */
export async function declarerPrete(API, storeId, orderId, jetonCommercant) {
  const envoyer = (methode, chemin, corps) =>
    fetch(`${API}${chemin}`, {
      method: methode,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jetonCommercant}` },
      body: JSON.stringify(corps),
    });

  await envoyer('POST', `/api/order-management/${storeId}/${orderId}/accept`, { preparationMinutes: 15 });

  for (const status of ['PREPARING', 'READY']) {
    await envoyer('PATCH', `/api/order-management/${storeId}/${orderId}/status`, { status });
  }
}
