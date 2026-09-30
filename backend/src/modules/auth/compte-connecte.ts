import { db } from "../../services/db";
import { UserService } from "./user.service";
import { ApiError } from "../../middleware/errorHandler";

/**
 * Ce qu'un navigateur apprend du compte en ouvrant une session : qui il est,
 * son premier commerce, sa fiche livreur.
 *
 * Une seule définition pour la connexion, le renouvellement et la connexion
 * unique entre domaines : écrit en trois exemplaires, un oubli sur l'un
 * aurait déconnecté l'utilisateur d'un seul chemin.
 */
export async function compteConnecte(userId: string) {
  const user = await UserService.getUserById(userId);
  const memberships = await UserService.getUserOrganizations(userId);

  // Tous les comptes n'appartiennent pas à une organisation : un livreur,
  // par exemple, n'en a aucune. Le refuser ici l'empêchait de se connecter.
  const primaryMembership = memberships[0];

  const livreur = primaryMembership
    ? null
    : await db.courier.findUnique({ where: { userId }, select: { id: true } });

  // Check if user has a customer profile (all users get one at signup)
  const customer =
    !primaryMembership && !livreur
      ? await db.customer.findUnique({ where: { userId }, select: { id: true } })
      : null;

  if (!primaryMembership && !livreur && !customer && !user.isSuperOwner && !user.isSystemAdmin) {
    throw new ApiError(403, "Ce compte n'est rattaché à aucun espace", "NO_WORKSPACE");
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperOwner: user.isSuperOwner,
      isSystemAdmin: user.isSystemAdmin,
      emailVerified: user.emailVerified,
    },
    organization: primaryMembership
      ? { id: primaryMembership.org.id, name: primaryMembership.org.name }
      : null,
    driver: livreur ? { id: livreur.id } : null,
  };
}
