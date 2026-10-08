import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { ApiError } from "../../middleware/api-error";
import { ibanNormalise, ibanValide } from "../../utils/sepa";

/**
 * Le compte où le chauffeur ZupDrive reçoit ses versements hebdomadaires.
 *
 * Même mécanisme que le livreur ZupEat (PUT /drivers/me/bank-account) : IBAN
 * validé (format + clé modulo 97) puis normalisé, chiffré au repos par
 * l'extension Prisma (ENCRYPTED_FIELDS), jamais renvoyé en entier ni journalisé.
 * Seuls les 4 derniers caractères sortent de ce service, sauf pour le versement.
 */

export interface CompteBancaireVu {
  ibanFin: string;
  titulaire: string;
  valide: boolean;
}

export interface CompteBancaireSaisie {
  iban: string;
  bic?: string | null;
  accountHolder: string;
}

export const CompteBancaireChauffeurService = {
  /** Le compte tel que le chauffeur le voit : jamais l'IBAN entier. */
  async lire(chauffeurId: string): Promise<CompteBancaireVu | null> {
    const compte = await db.compteBancaireChauffeurDrive.findUnique({ where: { chauffeurId } });
    if (!compte) return null;
    return {
      ibanFin: ibanNormalise(compte.iban).slice(-4),
      titulaire: compte.accountHolder,
      valide: ibanValide(compte.iban),
    };
  },

  /**
   * Enregistre (ou remplace) le compte du chauffeur. Les versements en attente
   * qui n'ont pas encore de copie d'IBAN la reçoivent : un compte saisi après
   * la première course ne laisse pas un versement sans destination.
   */
  async enregistrer(chauffeurId: string, saisie: CompteBancaireSaisie): Promise<CompteBancaireVu> {
    if (!ibanValide(saisie.iban)) {
      throw new ApiError(400, "Cet IBAN n'est pas valide : vérifiez-le.", "INVALID_IBAN");
    }

    const iban = ibanNormalise(saisie.iban);
    const donnees = {
      iban,
      bic: saisie.bic ? saisie.bic.replace(/\s+/g, "").toUpperCase() : null,
      accountHolder: saisie.accountHolder.trim(),
    };

    await db.compteBancaireChauffeurDrive.upsert({
      where: { chauffeurId },
      create: { chauffeurId, ...donnees },
      update: donnees,
    });

    // Seuls les versements pas encore rattachés à un lot SEPA : un lot soumis garde l'IBAN d'origine.
    await db.driverPayoutDrive.updateMany({
      where: { chauffeurId, status: "PENDING", batchId: null, ibanSnapshot: null },
      data: { ibanSnapshot: iban },
    });

    logger.info("ZupDrive compte bancaire chauffeur enregistré", { chauffeurId, ibanFin: iban.slice(-4) });
    return { ibanFin: iban.slice(-4), titulaire: donnees.accountHolder, valide: true };
  },

  /**
   * L'IBAN à figer sur un versement : normalisé et valide, ou `null` s'il
   * manque ou s'il est invalide. À ne jamais logger ni renvoyer au client.
   */
  async ibanPourVersement(chauffeurId: string): Promise<string | null> {
    const compte = await db.compteBancaireChauffeurDrive.findUnique({
      where: { chauffeurId },
      select: { iban: true },
    });
    if (!compte || !ibanValide(compte.iban)) return null;
    return ibanNormalise(compte.iban);
  },
};
