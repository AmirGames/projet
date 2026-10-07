import { createHash, randomBytes } from "node:crypto";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";
import { getEnv } from "../../config/env";
import { AuthService } from "../auth/auth.service";
import { fichierSepa, ibanValide, VirementSepa } from "../../utils/sepa";
import { MerchantPayoutService } from "./merchant-payout.service";

/**
 * Les lots bancaires : ce qui part à la banque est figé, approuvé, tracé.
 *
 * Avant, le fichier SEPA se recalculait à chaque téléchargement depuis les
 * relevés « en attente », et le lot se marquait versé à partir d'identifiants
 * envoyés par le client : deux exports consécutifs portaient les mêmes lignes,
 * et ce qui était versé pouvait différer de ce qui avait été exporté.
 *
 * Maintenant :
 *   PREPARED → APPROVED → EXPORTED → SUBMITTED → CONFIRMED
 *                  ↘ CANCELLED (avant export)      ↘ REJECTED (refus banque)
 * - La préparation fige bénéficiaires, IBAN et montants, et rattache chaque
 *   relevé au lot (`batchId`, conditionnel) : un relevé n'est que dans un lot actif.
 * - L'approbation exige le mot de passe de l'administrateur (réauthentification).
 * - L'export produit toujours le même fichier (empreinte SHA-256 conservée).
 * - Confirmer marque versés les seuls relevés du lot ; rejeter les libère.
 */

export interface LigneDuLot extends VirementSepa {
  kind: "commercant" | "livreur";
  payoutId: string;
}

const ACTIFS = ["PREPARED", "APPROVED", "EXPORTED", "SUBMITTED"] as const;

async function charger(id: string) {
  const lot = await db.payoutBatch.findUnique({ where: { id } });
  if (!lot) throw new ApiError(404, "Lot introuvable", "BATCH_NOT_FOUND");
  return lot;
}

const lignes = (lot: { itemsJson: unknown }) => (lot.itemsJson as LigneDuLot[]) || [];

/** Transition conditionnelle : l'état lu doit encore être celui de la base. */
async function passer(id: string, de: string[], data: Record<string, unknown>) {
  const { count } = await db.payoutBatch.updateMany({ where: { id, status: { in: de } }, data });
  if (count !== 1) {
    throw new ApiError(409, "Le lot n'est plus dans l'état attendu.", "BATCH_STATE_CONFLICT");
  }
}

function donneur() {
  const env = getEnv();
  if (!env.SEPA_DEBTOR_IBAN || !env.SEPA_DEBTOR_NAME || !ibanValide(env.SEPA_DEBTOR_IBAN)) {
    throw new ApiError(
      400,
      "Le compte de la plateforme n'est pas réglé : renseignez SEPA_DEBTOR_NAME et SEPA_DEBTOR_IBAN.",
      "SEPA_DEBTOR_MISSING"
    );
  }
  return { nom: env.SEPA_DEBTOR_NAME, iban: env.SEPA_DEBTOR_IBAN, bic: env.SEPA_DEBTOR_BIC };
}

/** Le même lot redonne exactement le même fichier : dates figées sur l'export. */
function xmlDuLot(lot: { reference: string; exportedAt: Date | null; itemsJson: unknown }, date: Date) {
  const virements: VirementSepa[] = lignes(lot).map(({ kind: _k, payoutId: _p, ...v }) => v);
  return fichierSepa(donneur(), virements, { reference: lot.reference, dateExecution: date, maintenant: date });
}

export class PayoutBatchService {
  static async lister() {
    const lots = await db.payoutBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, reference: true, status: true, total: true, itemCount: true, createdAt: true,
        approvedAt: true, exportedAt: true, submittedAt: true, closedAt: true, bankReference: true, note: true,
      },
    });
    return lots.map((l) => ({ ...l, total: Number(l.total) }));
  }

  static async detail(id: string) {
    const lot = await charger(id);
    return {
      ...lot,
      total: Number(lot.total),
      // Jamais l'IBAN entier à l'écran : assez pour reconnaître le compte.
      itemsJson: undefined,
      lignes: lignes(lot).map((l) => ({
        kind: l.kind, payoutId: l.payoutId, nom: l.nom, montant: l.montant, ibanFin: l.iban.slice(-4),
      })),
    };
  }

  /** Fige les virements en attente dans un nouveau lot. */
  static async preparer(adminId: string, maintenant = new Date()) {
    donneur();
    return db.$transaction(async (tx) => {
      // Une préparation à la fois : deux lots simultanés se disputeraient les mêmes relevés.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('lot-bancaire'))`;

      const { virements, ecartes } = await MerchantPayoutService.virementsEnAttente(tx);
      const aPayer = virements.filter((v) => v.montant > 0);
      if (aPayer.length === 0) {
        throw new ApiError(400, "Aucun versement en attente", "NOTHING_TO_PAY");
      }

      // La minute ne suffit pas à identifier un lot : annuler puis re-préparer
      // dans la même minute heurtait l'unicité de la référence. Le suffixe aléatoire
      // la rend unique ; l'identifiant SEPA reste sous les 35 caractères.
      const reference = `VERSEMENTS-${maintenant.toISOString().slice(0, 16).replace(/[-:T]/g, "")}-${randomBytes(2).toString("hex")}`;
      const total = Math.round(aPayer.reduce((s, v) => s + v.montant * 100, 0)) / 100;
      const lot = await tx.payoutBatch.create({
        data: {
          reference,
          status: "PREPARED",
          total,
          itemCount: aPayer.length,
          itemsJson: aPayer as any,
          createdBy: adminId,
        },
      });

      // Rattachement conditionnel : « pas encore dans un lot ». Un nombre de
      // lignes différent signifie qu'un relevé a bougé : tout est annulé.
      const commercants = aPayer.filter((v) => v.kind === "commercant").map((v) => v.payoutId);
      const livreurs = aPayer.filter((v) => v.kind === "livreur").map((v) => v.payoutId);
      const rattaches = [
        commercants.length
          ? await tx.merchantPayout.updateMany({
              where: { id: { in: commercants }, status: "PENDING", batchId: null },
              data: { batchId: lot.id },
            })
          : { count: 0 },
        livreurs.length
          ? await tx.courierPayout.updateMany({
              where: { id: { in: livreurs }, status: "PENDING", batchId: null },
              data: { batchId: lot.id },
            })
          : { count: 0 },
      ];
      if (rattaches[0].count !== commercants.length || rattaches[1].count !== livreurs.length) {
        throw new ApiError(409, "Un relevé a changé pendant la préparation du lot.", "BATCH_CONFLICT");
      }

      logger.info("Lot bancaire préparé", { lotId: lot.id, nombre: aPayer.length, total });
      return { lot: { ...lot, total, itemsJson: undefined }, ecartes };
    });
  }

  /** Approbation : le mot de passe de l'administrateur est redemandé. */
  static async approuver(id: string, adminId: string, motDePasse: string) {
    const admin = await db.user.findUnique({ where: { id: adminId }, select: { passwordHash: true } });
    if (!admin || !motDePasse || !(await AuthService.comparePassword(motDePasse, admin.passwordHash))) {
      throw new ApiError(403, "Mot de passe incorrect", "REAUTH_FAILED");
    }
    await passer(id, ["PREPARED"], { status: "APPROVED", approvedBy: adminId, approvedAt: new Date() });
    return charger(id);
  }

  /**
   * Le fichier SEPA du lot. Le premier téléchargement passe le lot en EXPORTED
   * et fige l'empreinte ; les suivants rendent le même fichier, ou refusent si
   * le lot a été altéré.
   */
  static async exporter(id: string, adminId: string) {
    const lot = await charger(id);

    if (lot.status === "APPROVED") {
      const date = new Date();
      const xml = xmlDuLot(lot, date);
      await passer(id, ["APPROVED"], {
        status: "EXPORTED",
        exportedBy: adminId,
        exportedAt: date,
        xmlSha256: createHash("sha256").update(xml).digest("hex"),
      });
      return { reference: lot.reference, xml };
    }

    if (["EXPORTED", "SUBMITTED"].includes(lot.status) && lot.exportedAt) {
      const xml = xmlDuLot(lot, lot.exportedAt);
      if (createHash("sha256").update(xml).digest("hex") !== lot.xmlSha256) {
        logger.error("Lot bancaire altéré depuis son export", { lotId: id });
        throw new ApiError(409, "Le lot ne correspond plus au fichier exporté.", "BATCH_TAMPERED");
      }
      return { reference: lot.reference, xml };
    }

    throw new ApiError(409, "Le lot doit être approuvé avant d'être exporté.", "BATCH_NOT_APPROVED");
  }

  /** Le fichier a été importé et signé à la banque. */
  static async transmettre(id: string, _adminId: string) {
    await passer(id, ["EXPORTED"], { status: "SUBMITTED", submittedAt: new Date() });
    return charger(id);
  }

  /** La banque a exécuté le lot : seuls ses relevés passent à « versé ». */
  static async confirmer(id: string, adminId: string, bankReference?: string) {
    const lot = await charger(id);
    const resultat = await db.$transaction(async (tx) => {
      const { count } = await tx.payoutBatch.updateMany({
        where: { id, status: { in: ["EXPORTED", "SUBMITTED"] } },
        data: { status: "CONFIRMED", closedBy: adminId, closedAt: new Date(), bankReference: bankReference?.trim() || null },
      });
      if (count !== 1) throw new ApiError(409, "Le lot n'est plus dans l'état attendu.", "BATCH_STATE_CONFLICT");

      const versement = {
        status: "PAID",
        method: "BANK_TRANSFER",
        reference: bankReference?.trim() || lot.reference,
        paidAt: new Date(),
        paidBy: adminId,
      };
      const commercants = await tx.merchantPayout.updateMany({
        where: { batchId: id, status: "PENDING" },
        data: versement,
      });
      const livreurs = await tx.courierPayout.updateMany({
        where: { batchId: id, status: "PENDING" },
        data: versement,
      });
      return { commercants: commercants.count, livreurs: livreurs.count };
    });

    // Les notifications ne remplacent pas l'état : après la validation.
    const releves = await db.merchantPayout.findMany({
      where: { batchId: id, status: "PAID", paidBy: adminId },
      select: { orgId: true, amount: true },
    });
    for (const r of releves) {
      await MerchantPayoutService.prevenir(r.orgId, "Versement effectué", `${Number(r.amount).toFixed(2)} € sont en route vers votre compte.`);
    }
    return resultat;
  }

  /** Refus de la banque : les relevés sortent du lot et redeviennent à verser. */
  static async rejeter(id: string, adminId: string, raison: string) {
    await PayoutBatchService.libererEtClore(id, adminId, ["EXPORTED", "SUBMITTED"], "REJECTED", raison);
  }

  /** Abandon d'un lot pas encore exporté. */
  static async annuler(id: string, adminId: string, raison?: string) {
    await PayoutBatchService.libererEtClore(id, adminId, ["PREPARED", "APPROVED"], "CANCELLED", raison);
  }

  private static async libererEtClore(id: string, adminId: string, de: string[], vers: string, note?: string) {
    await db.$transaction(async (tx) => {
      const { count } = await tx.payoutBatch.updateMany({
        where: { id, status: { in: de } },
        data: { status: vers, closedBy: adminId, closedAt: new Date(), note: note?.slice(0, 500) || null },
      });
      if (count !== 1) throw new ApiError(409, "Le lot n'est plus dans l'état attendu.", "BATCH_STATE_CONFLICT");
      await tx.merchantPayout.updateMany({ where: { batchId: id, status: "PENDING" }, data: { batchId: null } });
      await tx.courierPayout.updateMany({ where: { batchId: id, status: "PENDING" }, data: { batchId: null } });
    });
  }

  /** Le lot actif, s'il y en a un. */
  static async actif() {
    const lot = await db.payoutBatch.findFirst({
      where: { status: { in: [...ACTIFS] } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return lot ? PayoutBatchService.detail(lot.id) : null;
  }
}
