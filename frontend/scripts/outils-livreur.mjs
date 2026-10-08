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

/** Image PNG de 1 × 1 pixel : de quoi passer le contrôle du type de fichier. */
const PNG_MINIMAL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

export async function validerLivreur(API, jetonLivreur, jetonPlateforme) {
  const entetes = (jeton) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${jeton}`,
  });

  const moi = await lire(await fetch(`${API}/api/drivers/me`, { headers: entetes(jetonLivreur) }));
  const driverId = moi?.data?.id;

  // L'API refuse les liens externes : chaque pièce est un vrai fichier, déposé
  // par la route d'upload (PNG minimal, le contenu importe peu ici).
  for (const type of moi?.data?.piecesAttendues || []) {
    const formulaire = new FormData();
    formulaire.append('type', type);
    formulaire.append('file', new Blob([PNG_MINIMAL], { type: 'image/png' }), `${type}.png`);
    await fetch(`${API}/api/drivers/documents/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jetonLivreur}` },
      body: formulaire,
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

  // Seul le tout premier compte inscrit devient la plateforme (promu par
  // inscription.mjs, jamais par l'API). Sur une base déjà peuplée, le compte
  // créé par le script ne l'est pas, la validation est refusée, et le script
  // échouerait plus loin sur un « aucun livreur disponible » qui n'explique rien.
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
 * Les jetons de suivi des commandes passées par les scripts.
 *
 * Le suivi (`GET /api/orders/:id`, page /track) demande le jeton remis à la
 * commande : la réponse de `POST /api/orders` le donne une fois
 * (`order.trackingToken`), et le site le garde dans le navigateur du client
 * (lib/suivi-commande.ts). Les scripts le retiennent ici, juste après avoir
 * commandé, et le présentent comme le ferait le lien du courriel de suivi.
 */
const jetonsDeSuivi = new Map();

/** Retient le jeton d'une réponse de `POST /api/orders` ; rend l'identifiant de la commande. */
export function retenirJetonDeSuivi(donnees) {
  const commande = donnees?.order;
  if (commande?.id && commande.trackingToken) jetonsDeSuivi.set(commande.id, commande.trackingToken);
  return commande?.id || donnees?.id;
}

export function jetonDeSuivi(orderId) {
  const jeton = jetonsDeSuivi.get(orderId);
  if (!jeton) throw new Error(`Aucun jeton de suivi connu pour la commande ${orderId}`);
  return jeton;
}

/** Le lien de suivi que reçoit le client : `/track?commande=…&t=…`. */
export const lienDeSuivi = (SITE, orderId) =>
  `${SITE}/track?commande=${encodeURIComponent(orderId)}&t=${encodeURIComponent(jetonDeSuivi(orderId))}`;

/**
 * Le code de remise d'une commande.
 *
 * Il appartient au client : le livreur ne le voit jamais. Un script qui clôt
 * une course joue le rôle du client, et le lit donc là où celui-ci le lit —
 * sur le suivi de sa commande, avec son jeton.
 */
export async function codeDeRemise(API, orderId) {
  const commande = await lire(
    await fetch(`${API}/api/orders/${orderId}?t=${encodeURIComponent(jetonDeSuivi(orderId))}`)
  );

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
