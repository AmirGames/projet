import { db } from "../../services/db";
import { getEnv } from "../../config/env";
import { ApiError } from "../../middleware/errorHandler";
import { detailFacturation } from "../superowner/billing-detail.service";
import { identifiantPeppol, numeroBce, tvaBelge, IdentifiantPeppol } from "./peppol-id";
import { genererUbl, totaux, PartieFacture, LigneFacture } from "./ubl";
import { transportPeppol } from "./peppol-transport";

const DELAI_PAIEMENT_JOURS = 30;

/** L'émetteur : la société qui exploite la plateforme, lue dans l'environnement. */
function emetteur(): PartieFacture {
  const env = getEnv();
  const tva = tvaBelge(env.PLATFORM_VAT_NUMBER);
  const manque = [
    !env.PLATFORM_LEGAL_NAME && "PLATFORM_LEGAL_NAME",
    !tva && "PLATFORM_VAT_NUMBER (numéro belge, BE0123456789)",
    !env.PLATFORM_ADDRESS && "PLATFORM_ADDRESS",
    !env.PLATFORM_POSTAL_CODE && "PLATFORM_POSTAL_CODE",
    !env.PLATFORM_CITY && "PLATFORM_CITY",
  ].filter(Boolean);

  if (manque.length || !tva) {
    throw new ApiError(
      409,
      `Identité de la plateforme incomplète, à renseigner dans l'environnement : ${manque.join(", ")}`,
      "PLATFORM_IDENTITY_INCOMPLETE"
    );
  }

  return {
    nom: env.PLATFORM_LEGAL_NAME!,
    tva,
    numeroEntreprise: numeroBce(env.PLATFORM_REGISTRATION_NUMBER) || tva.slice(2),
    adresse: env.PLATFORM_ADDRESS!,
    codePostal: env.PLATFORM_POSTAL_CODE!,
    ville: env.PLATFORM_CITY!,
    pays: env.PLATFORM_COUNTRY,
    email: env.PLATFORM_EMAIL,
    peppol: { schema: "0208", valeur: tva.slice(2) },
  };
}

function libellePeriode(periode: string) {
  const [annee, mois] = periode.split("-");
  const noms = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  return `${noms[Number(mois) - 1]} ${annee}`;
}

export class PlatformInvoiceService {
  /**
   * Émet la facture d'un commerçant pour un mois — ou renvoie celle qui existe.
   *
   * Comme la facture de commande, elle ne se réécrit pas : une fois émise, un
   * changement de taux ou de raison sociale ne la touche plus. Une erreur de
   * facturation se corrige par une note de crédit, pas en réécrivant.
   *
   * Le mois en cours n'est pas facturable : ses commandes ne sont pas closes.
   */
  static async emettre(orgId: string, periode: string) {
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      throw new ApiError(400, "Période attendue au format AAAA-MM", "INVALID_PERIOD");
    }

    const maintenant = new Date();
    const moisCourant = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, "0")}`;
    if (periode >= moisCourant) {
      throw new ApiError(409, "Le mois n'est pas terminé : on ne facture que les mois écoulés", "PERIOD_NOT_CLOSED");
    }

    const existante = await db.platformInvoice.findUnique({ where: { orgId_period: { orgId, period: periode } } });
    if (existante) return existante;

    const detail = await detailFacturation(orgId, periode);
    const org = detail.organization;

    if (org.manquePourFacturer.length) {
      throw new ApiError(
        409,
        `Impossible de facturer : il manque ${org.manquePourFacturer.join(", ")}`,
        "BILLING_IDENTITY_INCOMPLETE"
      );
    }

    const destinataire = identifiantPeppol(org);
    const tvaAcheteur = tvaBelge(org.vatNumber);
    if (!destinataire || !tvaAcheteur) {
      throw new ApiError(
        409,
        "Le commerçant n'a pas de numéro de TVA belge ni d'identifiant Peppol : impossible de lui adresser une facture électronique",
        "PEPPOL_ID_MISSING"
      );
    }

    const lignes: LigneFacture[] = [
      { libelle: `Commission sur ${detail.summary.ordersCount} commande(s), ${libellePeriode(periode)}`, montantHt: detail.summary.commission },
      { libelle: `Frais de livraison encaissés pour la plateforme, ${libellePeriode(periode)}`, montantHt: detail.summary.deliveryFees },
      { libelle: `Frais de service encaissés pour la plateforme, ${libellePeriode(periode)}`, montantHt: detail.summary.serviceFees },
    ].filter((ligne) => ligne.montantHt > 0);

    if (!lignes.length) {
      throw new ApiError(409, "Rien à facturer sur ce mois", "NOTHING_TO_INVOICE");
    }

    const vendeur = emetteur();
    const env = getEnv();
    const tauxTva = env.PLATFORM_VAT_RATE;
    const acheteur: PartieFacture = {
      nom: org.legalName!,
      tva: tvaAcheteur,
      numeroEntreprise: numeroBce(org.registrationNumber) || tvaAcheteur.slice(2),
      adresse: org.billingAddress!,
      codePostal: org.billingPostalCode || "",
      ville: org.billingCity || "",
      pays: "BE",
      email: org.email,
      peppol: destinataire,
    };

    const emiseLe = new Date();
    const echeance = new Date(emiseLe.getTime() + DELAI_PAIEMENT_JOURS * 24 * 3600 * 1000);
    const annee = emiseLe.getFullYear();

    // Le numéro et la facture naissent dans la même transaction : un échec à
    // l'écriture ne doit pas laisser un numéro consommé, donc un trou.
    return db.$transaction(async (tx) => {
      const seq = await tx.platformInvoiceSeq.upsert({
        where: { year: annee },
        update: { last: { increment: 1 } },
        create: { year: annee, last: 1 },
      });
      const numero = `ZE-${annee}-${String(seq.last).padStart(6, "0")}`;

      const xml = genererUbl({
        numero,
        emiseLe,
        echeance,
        referenceAcheteur: `COMMISSION-${periode}`,
        note: `Facture de la plateforme pour ${libellePeriode(periode)}`,
        vendeur,
        acheteur,
        iban: env.PLATFORM_IBAN || env.SEPA_DEBTOR_IBAN,
        bic: env.SEPA_DEBTOR_BIC,
        lignes,
        tauxTva,
      });

      const t = totaux(lignes, tauxTva);

      return tx.platformInvoice.create({
        data: {
          number: numero,
          orgId,
          period: periode,
          issuedAt: emiseLe,
          dueAt: echeance,
          sellerJson: vendeur as any,
          buyerJson: acheteur as any,
          linesJson: lignes as any,
          vatRate: tauxTva,
          totalExcl: t.htCentimes / 100,
          vatAmount: t.tvaCentimes / 100,
          totalIncl: t.ttcCentimes / 100,
          ublXml: xml,
        },
      });
    });
  }

  /**
   * Remet la facture à l'Access Point.
   *
   * Sans fournisseur configuré, on refuse plutôt que de marquer « envoyée » une
   * facture qui n'est partie nulle part : la facture reste téléchargeable.
   */
  static async envoyer(id: string) {
    const facture = await db.platformInvoice.findUnique({ where: { id } });
    if (!facture) throw new ApiError(404, "Facture introuvable", "INVOICE_NOT_FOUND");
    if (facture.peppolStatus === "SENT" || facture.peppolStatus === "DELIVERED") return facture;

    const transport = transportPeppol();
    if (!transport) {
      throw new ApiError(
        409,
        "Aucun fournisseur Peppol n'est configuré : téléchargez le XML et déposez-le chez votre Access Point",
        "PEPPOL_PROVIDER_MISSING"
      );
    }

    const acheteur = facture.buyerJson as unknown as PartieFacture;
    const vendeur = facture.sellerJson as unknown as PartieFacture;

    try {
      const { messageId } = await transport.envoyer({
        numero: facture.number,
        xml: facture.ublXml,
        destinataire: acheteur.peppol as IdentifiantPeppol,
        emetteur: vendeur.peppol as IdentifiantPeppol,
      });
      return db.platformInvoice.update({
        where: { id },
        data: {
          peppolStatus: "SENT",
          peppolMessageId: messageId,
          peppolError: null,
          peppolSentAt: new Date(),
          peppolAttempts: { increment: 1 },
        },
      });
    } catch (err) {
      return db.platformInvoice.update({
        where: { id },
        data: {
          peppolStatus: "FAILED",
          peppolError: err instanceof Error ? err.message.slice(0, 500) : "Échec de l'envoi",
          peppolAttempts: { increment: 1 },
        },
      });
    }
  }

  static async lister(orgId?: string) {
    return db.platformInvoice.findMany({
      where: orgId ? { orgId } : undefined,
      orderBy: { issuedAt: "desc" },
      take: 200,
      select: {
        id: true, number: true, orgId: true, period: true, issuedAt: true, dueAt: true,
        totalExcl: true, vatAmount: true, totalIncl: true,
        peppolStatus: true, peppolError: true, peppolSentAt: true, peppolAttempts: true,
        org: { select: { name: true, legalName: true } },
      },
    });
  }

  static async obtenir(id: string) {
    const facture = await db.platformInvoice.findUnique({ where: { id } });
    if (!facture) throw new ApiError(404, "Facture introuvable", "INVOICE_NOT_FOUND");
    return facture;
  }
}
