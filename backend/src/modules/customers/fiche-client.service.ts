import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";

/**
 * La fiche client d'un compte, et les fiches « invité ».
 *
 * Une commande passée sans compte crée une fiche client à l'adresse donnée,
 * sans compte rattaché. Elle porte les commandes, les adresses et les codes de
 * remise de quiconque a commandé avec cette adresse. S'inscrire avec la même
 * adresse ne prouve pas qu'on la possède : la fiche ne rejoint un compte
 * qu'une fois l'adresse confirmée (lien de confirmation, ou lien de
 * réinitialisation du mot de passe, reçu à la même adresse).
 *
 * Avant, l'inscription et la première visite de l'espace client la
 * rattachaient d'office : s'inscrire avec victime@mail.com suffisait pour lire
 * les commandes de la victime.
 */

/**
 * Rattache au compte la fiche invité de même adresse, s'il y en a une et si le
 * compte n'a pas déjà sa propre fiche. À n'appeler qu'une fois l'adresse
 * prouvée.
 */
export async function rattacherFicheInvite(user: { id: string; email: string }) {
  const dejaLiee = await db.customer.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (dejaLiee) return false;

  const fiche = await db.customer.findUnique({
    where: { email: user.email },
    select: { id: true, userId: true, deletedAt: true },
  });
  if (!fiche || fiche.userId || fiche.deletedAt) return false;

  // La condition sur `userId` protège d'un rattachement concurrent.
  const { count } = await db.customer.updateMany({
    where: { id: fiche.id, userId: null },
    data: { userId: user.id },
  });

  if (count > 0) {
    logger.info("Fiche client invité rattachée au compte", { userId: user.id, customerId: fiche.id });
  }

  return count > 0;
}

/**
 * La fiche client du compte connecté.
 *
 * Sa propre fiche d'abord ; à défaut, une fiche invité de même adresse, à
 * condition que l'adresse soit confirmée ; à défaut, une fiche neuve si
 * `creer` (tout compte peut commander : la fiche naît à la première visite).
 */
export async function ficheClientDuCompte(userId: string | undefined, options: { creer: boolean }) {
  const utilisateur = userId
    ? await db.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, emailVerified: true },
      })
    : null;

  if (!utilisateur) {
    throw new ApiError(401, "Session invalide", "UNAUTHORIZED");
  }

  const aucuneFiche = new ApiError(404, "Aucune fiche client pour ce compte", "CUSTOMER_NOT_FOUND");

  const propre = await db.customer.findUnique({ where: { userId: utilisateur.id } });
  if (propre) {
    if (propre.deletedAt) throw aucuneFiche;
    return propre;
  }

  const fiche = await db.customer.findUnique({ where: { email: utilisateur.email } });

  if (!fiche) {
    if (!options.creer) throw aucuneFiche;
    return db.customer.create({
      data: {
        userId: utilisateur.id,
        name: utilisateur.name || utilisateur.email.split("@")[0],
        email: utilisateur.email,
      },
    });
  }

  // Fiche supprimée, ou appartenant à un autre compte : rien à montrer.
  if (fiche.deletedAt || fiche.userId) throw aucuneFiche;

  // Fiche invité : ses commandes ne se montrent qu'à qui a prouvé l'adresse.
  if (!utilisateur.emailVerified) {
    throw new ApiError(
      403,
      "Confirmez votre adresse e-mail pour accéder à votre espace client : un lien vous a été envoyé.",
      "EMAIL_NOT_VERIFIED"
    );
  }

  await rattacherFicheInvite(utilisateur);

  const rattachee = await db.customer.findUnique({ where: { userId: utilisateur.id } });
  if (!rattachee) throw aucuneFiche;
  return rattachee;
}
