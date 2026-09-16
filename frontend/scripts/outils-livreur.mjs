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
