import { db } from "../../services/db";
import { getEnv } from "../../config/env";
import { ApiError } from "../../middleware/errorHandler";
import { detailFacturation } from "../superowner/billing-detail.service";
import { identifiantPeppol, numeroBce, tvaBelge, IdentifiantPeppol } from "./peppol-id";
import { genererUbl, totaux, partReglee, PartieFacture, LigneFacture } from "./ubl";
import { transportPeppol } from "./peppol-transport";

const DELAI_PAIEMENT_JOURS = 30;

/** L'émetteur : la société qui exploite la plateforme, lue dans l'environnement. */
export function identitePlateforme(): { partie: PartieFacture | null; manque: string[] } {
  const env = getEnv();
  const tva = tvaBelge(env.PLATFORM_VAT_NUMBER);
  const manque = [
    !env.PLATFORM_LEGAL_NAME && "PLATFORM_LEGAL_NAME",
    !tva && "PLATFORM_VAT_NUMBER (numéro belge, BE0123456789)",
    !env.PLATFORM_ADDRESS && "PLATFORM_ADDRESS",
    !env.PLATFORM_POSTAL_CODE && "PLATFORM_POSTAL_CODE",
    !env.PLATFORM_CITY && "PLATFORM_CITY",
  ].filter(Boolean) as string[];

  if (manque.length || !tva) return { partie: null, manque };

  return {
    manque,
    partie: {
      nom: env.PLATFORM_LEGAL_NAME!,
      tva,
      numeroEntreprise: numeroBce(env.PLATFORM_REGISTRATION_NUMBER) || tva.slice(2),
      adresse: env.PLATFORM_ADDRESS!,
      codePostal: env.PLATFORM_POSTAL_CODE!,
      ville: env.PLATFORM_CITY!,
      pays: env.PLATFORM_COUNTRY,
      email: env.PLATFORM_EMAIL,
      peppol: { schema: "0208", valeur: tva.slice(2) },
    },
  };
}

function emetteur(): PartieFacture {
  const { partie, manque } = identitePlateforme();
  if (!partie) {
    throw new ApiError(
      409,
      `Identité de la plateforme incomplète, à renseigner dans l'environnement : ${manque.join(", ")}`,
      "PLATFORM_IDENTITY_INCOMPLETE"
    );
  }
  return partie;
}

/** Le dernier mois écoulé, « 2026-08 » le 12 septembre 2026. */
export function moisPrecedent(maintenant = new Date()): string {
  const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

    const { lignes, vendeur, acheteur, tauxTva, dejaRegle } = await this.preparer(orgId, periode);

    const emiseLe = new Date();
    const echeance = new Date(emiseLe.getTime() + DELAI_PAIEMENT_JOURS * 24 * 3600 * 1000);

    // Le numéro et la facture naissent dans la même transaction : un échec à
    // l'écriture ne doit pas laisser un numéro consommé, donc un trou.
    try {
      return await this.creer({ orgId, periode, emiseLe, echeance, vendeur, acheteur, lignes, tauxTva, dejaRegle });
    } catch (err) {
      // Deux émissions simultanées (tâche du jour et bouton) : la seconde perd
      // la course sur l'unicité (commerçant, mois). Sa transaction est annulée,
      // son numéro n'est pas consommé ; on rend la facture de la première.
      if ((err as { code?: string })?.code === "P2002") {
        const gagnante = await db.platformInvoice.findUnique({ where: { orgId_period: { orgId, period: periode } } });
        if (gagnante) return gagnante;
      }
      throw err;
    }
  }

  private static creer(a: {
    orgId: string; periode: string; emiseLe: Date; echeance: Date;
    vendeur: PartieFacture; acheteur: PartieFacture; lignes: LigneFacture[]; tauxTva: number; dejaRegle: number;
  }) {
    const { orgId, periode, emiseLe, echeance, vendeur, acheteur, lignes, tauxTva, dejaRegle } = a;
    const env = getEnv();
    const annee = emiseLe.getFullYear();

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
        note:
          `Facture de la plateforme pour ${libellePeriode(periode)}` +
          (dejaRegle > 0 ? `. Dont ${dejaRegle.toFixed(2)} EUR déjà réglés par retenue sur vos reversements.` : ""),
        vendeur,
        acheteur,
        iban: env.PLATFORM_IBAN || env.SEPA_DEBTOR_IBAN,
        bic: env.SEPA_DEBTOR_BIC,
        lignes,
        dejaRegle,
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
          prepaidAmount: dejaRegle,
          ublXml: xml,
        },
      });
    });
  }

  /**
   * Tout ce qu'il faut pour facturer un mois, ou l'erreur qui l'en empêche.
   * Partagé par l'émission et par l'aperçu : ce que l'écran annonce facturable
   * est exactement ce que l'émission acceptera.
   */
  private static async preparer(orgId: string, periode: string) {
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

    const env = getEnv();
    const mois = libellePeriode(periode);
    const r = detail.retenues;
    // Montants saisis hors taxe (défaut) ou déjà TTC : dans ce cas on en tire le HT.
    const enHt = (montant: number) =>
      env.PLATFORM_AMOUNTS_INCLUDE_VAT ? Math.round((montant / (1 + env.PLATFORM_VAT_RATE / 100)) * 100) / 100 : montant;

    const lignes: LigneFacture[] = [
      // Ce que la plateforme réclame au commerçant, à payer.
      { libelle: `Commission sur ${detail.summary.ordersCount} commande(s), ${mois}`, montantHt: enHt(detail.summary.commission) },
      { libelle: `Frais de livraison encaissés pour la plateforme, ${mois}`, montantHt: enHt(detail.summary.deliveryFees) },
      { libelle: `Frais de service encaissés pour la plateforme, ${mois}`, montantHt: enHt(detail.summary.serviceFees) },
      // Ce que les reversements du lundi ont déjà retenu : facturé aussi, déjà réglé.
      { libelle: `Commission sur ${r.ordersCount} commande(s), retenue sur vos reversements, ${mois}`, montantHt: enHt(r.commission) },
      { libelle: `Frais de livraison retenus sur vos reversements, ${mois}`, montantHt: enHt(r.deliveryFees) },
      { libelle: `Frais de service retenus sur vos reversements, ${mois}`, montantHt: enHt(r.serviceFees) },
    ].filter((ligne) => ligne.montantHt > 0);

    if (!lignes.length) {
      throw new ApiError(409, "Rien à facturer sur ce mois", "NOTHING_TO_INVOICE");
    }

    const vendeur = emetteur();
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

    const t = totaux(lignes, tauxTva);
    // Ce qui est déjà réglé ne dépasse jamais le TTC (voir partReglee).
    const { prepayeCentimes, aPayerCentimes } = partReglee(t.ttcCentimes, Math.round(r.total * 100));

    return { lignes, vendeur, acheteur, tauxTva, totaux: t, dejaRegle: prepayeCentimes / 100, aPayer: aPayerCentimes / 100 };
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

  /**
   * Où en est chaque commerçant pour un mois : facturé, facturable, sans rien à
   * facturer, ou bloqué — avec la raison, pour que l'écran dise quoi corriger.
   */
  static async apercu(periode: string) {
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      throw new ApiError(400, "Période attendue au format AAAA-MM", "INVALID_PERIOD");
    }

    const [organisations, factures] = await Promise.all([
      db.organization.findMany({ where: { isDemo: false }, select: { id: true, name: true, legalName: true }, orderBy: { name: "asc" } }),
      db.platformInvoice.findMany({ where: { period: periode }, select: { id: true, orgId: true, number: true, totalIncl: true, prepaidAmount: true, peppolStatus: true } }),
    ]);
    const parOrg = new Map(factures.map((f) => [f.orgId, f]));

    const lignes = [];
    for (const org of organisations) {
      const nom = org.legalName || org.name;
      const facture = parOrg.get(org.id);
      if (facture) {
        lignes.push({
          orgId: org.id, nom, etat: "FACTUREE" as const, invoiceId: facture.id, numero: facture.number,
          totalTtc: Number(facture.totalIncl), dejaRegle: Number(facture.prepaidAmount), peppolStatus: facture.peppolStatus,
        });
        continue;
      }
      try {
        const prete = await this.preparer(org.id, periode);
        lignes.push({ orgId: org.id, nom, etat: "FACTURABLE" as const, totalTtc: prete.totaux.ttcCentimes / 100, dejaRegle: prete.dejaRegle });
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        lignes.push({
          orgId: org.id, nom,
          etat: err.code === "NOTHING_TO_INVOICE" ? ("RIEN" as const) : ("BLOQUEE" as const),
          raison: err.message, code: err.code,
        });
      }
    }

    const { manque } = identitePlateforme();
    return {
      periode,
      // Tant que l'identité de la plateforme est incomplète, rien ne s'émet.
      plateformeManque: manque,
      fournisseurPeppol: transportPeppol()?.nom ?? null,
      lignes,
    };
  }

  /**
   * Émet, puis envoie si un fournisseur est branché, toutes les factures
   * facturables d'un mois. Idempotent : ce qui est déjà facturé est ignoré, un
   * commerçant bloqué est signalé sans arrêter les autres.
   */
  static async emettreLeMois(periode: string) {
    const bilan = { periode, emises: 0, envoyees: 0, dejaFacturees: 0, rienAFacturer: 0, bloquees: [] as { orgId: string; code: string; raison: string }[] };

    const organisations = await db.organization.findMany({ where: { isDemo: false }, select: { id: true } });
    const transport = transportPeppol();

    for (const { id } of organisations) {
      try {
        const avant = await db.platformInvoice.findUnique({ where: { orgId_period: { orgId: id, period: periode } }, select: { id: true } });
        const facture = await this.emettre(id, periode);
        if (avant) bilan.dejaFacturees += 1;
        else bilan.emises += 1;

        if (transport && facture.peppolStatus !== "SENT" && facture.peppolStatus !== "DELIVERED") {
          const envoyee = await this.envoyer(facture.id);
          if (envoyee.peppolStatus === "SENT") bilan.envoyees += 1;
        }
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        if (err.code === "NOTHING_TO_INVOICE") bilan.rienAFacturer += 1;
        else bilan.bloquees.push({ orgId: id, code: err.code ?? "ERROR", raison: err.message });
      }
    }

    return bilan;
  }

  static async lister(orgId?: string) {
    return db.platformInvoice.findMany({
      where: orgId ? { orgId } : undefined,
      orderBy: { issuedAt: "desc" },
      take: 200,
      select: {
        id: true, number: true, orgId: true, period: true, issuedAt: true, dueAt: true,
        totalExcl: true, vatAmount: true, totalIncl: true, prepaidAmount: true,
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
