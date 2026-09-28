/**
 * Les adresses du site autorisées à appeler l'API : le domaine principal
 * (FRONTEND_URL) et les autres, séparés par des virgules (ALLOWED_ORIGINS).
 *
 * Partagées par Express et par Socket.IO. Le temps réel n'autorisait que
 * FRONTEND_URL : depuis l'espace commerçant ou livreur, sur un autre domaine,
 * son mode de secours (polling, quand un réseau bloque les WebSockets) était
 * refusé et les commandes n'arrivaient plus en direct.
 */
export function originesAutorisees(): string[] {
  const supplementaires = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origine) => origine.trim())
    .filter(Boolean);

  return Array.from(
    new Set([process.env.FRONTEND_URL || "http://localhost:3000", "http://localhost:3000", ...supplementaires])
  );
}
