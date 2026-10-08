import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import {
  PlanService,
  promoSansCommissionActive,
  appliquerConditions,
  aDesConditionsNegociees,
  CHAMPS_CONDITIONS,
} from "../plans/plan.service";

/** Les conditions négociées d'un commerçant, sous la forme que lit l'interface. */
export function conditionsDe(org: {
  customCommissionPercent: unknown;
  customPlatformDeliveryCommissionPercent: unknown;
  customMaxStores: number | null;
  customMonthlyPrice: unknown;
  customTermsNote: string | null;
}) {
  const nombre = (v: unknown) => (v === null || v === undefined ? null : Number(v));

  return {
    actives: aDesConditionsNegociees(org),
    commission: nombre(org.customCommissionPercent),
    commissionLivreursPlateforme: nombre(org.customPlatformDeliveryCommissionPercent),
    maxBoutiques: org.customMaxStores,
    prixMensuel: nombre(org.customMonthlyPrice),
    note: org.customTermsNote,
  };
}

/**
 * Fige, au taux actuellement appliqué, les commandes du mois qui n'ont pas
 * encore de commission : un changement de formule ou de conditions ne doit pas
 * refacturer le début du mois au nouveau taux.
 */
async function figerCommissionsDuMois(orgId: string, taux: number, tier: string) {
  const debutMois = new Date();
  debutMois.setDate(1);
  debutMois.setHours(0, 0, 0, 0);

  const storeIds = (await db.store.findMany({ where: { orgId }, select: { id: true } })).map(
    (s) => s.id
  );

  if (storeIds.length === 0) return;

  const commandes = await db.order.findMany({
    where: { storeId: { in: storeIds }, createdAt: { gte: debutMois } },
    select: { id: true, totalAmount: true, commissionAmount: true, commissionWaived: true },
  });

  // Les commandes offertes par une promo restent à 0.
  const nonFigees = commandes.filter(
    (c) => Number(c.commissionAmount) === 0 && !c.commissionWaived
  );

  await Promise.all(
    nonFigees.map((c) =>
      db.order.update({
        where: { id: c.id },
        data: {
          commissionPercent: taux,
          commissionAmount: Number(((Number(c.totalAmount) * taux) / 100).toFixed(2)),
          tierAtOrder: tier,
        },
      })
    )
  );
}

export type ConditionsNegociees = {
  commission: number | null;
  commissionLivreursPlateforme: number | null;
  maxBoutiques: number | null;
  prixMensuel: number | null;
  note?: string | null;
};

export type PromoCommission = { active: boolean; until?: string | null; note?: string | null };

/**
 * Administration des commerçants par la plateforme : liste, formule,
 * conditions négociées et promo « zéro commission ». Les méthodes qui
 * modifient un commerçant rendent de quoi alimenter le journal d'audit, que la
 * route inscrit (`journaliser`) juste après.
 */
export const MerchantAdminService = {
  /** Les commerçants avec leur activité réelle. */
  async lister({ limit, offset, status, enAttente }: { limit: number; offset: number; status: string; enAttente: boolean }) {
    const where = {
      ...(status ? { status } : {}),
      ...(enAttente ? { approvedAt: null } : {}),
    };

    const [organisations, total] = await Promise.all([
      db.organization.findMany({
        where,
        skip: offset,
        take: limit,
        include: {
          stores: { select: { id: true } },
          _count: { select: { memberships: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.organization.count({ where }),
    ]);

    const lignes = await Promise.all(
      organisations.map(async (org) => {
        const storeIds = org.stores.map((s) => s.id);

        const commandes = storeIds.length
          ? await db.order.findMany({
              where: { storeId: { in: storeIds } },
              select: { totalAmount: true },
            })
          : [];

        return {
          id: org.id,
          name: org.name,
          email: org.email || "",
          status: org.status,
          tier: org.tier,
          createdAt: org.createdAt,
          approvedAt: org.approvedAt,
          activeUsers: org._count.memberships,
          // La promo « zéro commission » : réglée, et en cours ou non.
          commissionFree: {
            active: org.commissionFreeActive,
            until: org.commissionFreeUntil,
            note: org.commissionFreeNote,
            enCours: promoSansCommissionActive(org),
          },
          // Les conditions négociées avec ce commerçant, s'il y en a.
          customTerms: conditionsDe(org),
          revenue: Number(
            commandes.reduce((somme, c) => somme + Number(c.totalAmount), 0).toFixed(2)
          ),
        };
      })
    );

    return { organizations: lignes, pagination: { total, limit, offset } };
  },

  /** Change la formule d'un commerçant. */
  async changerFormule(orgId: string, tier: "FREE" | "PREMIUM" | "PRO") {
    const existante = await db.organization.findUnique({
      where: { id: orgId },
      select: { tier: true, ...CHAMPS_CONDITIONS },
    });

    if (!existante) {
      throw new ApiError(404, "Commerçant introuvable", "ORG_NOT_FOUND");
    }

    // Rétrograder en dessous du nombre de boutiques ouvertes créerait un
    // commerçant hors quota : on le signale au lieu de l'accepter en silence.
    const formuleCible = await PlanService.formule(tier);
    // Un quota négocié suit le commerçant d'une formule à l'autre.
    const quotaCible = appliquerConditions(formuleCible, existante).maxBoutiques;
    const boutiques = await db.store.count({ where: { orgId, deletedAt: null } });

    if (boutiques > quotaCible) {
      throw new ApiError(
        400,
        `Ce commerçant exploite ${boutiques} boutiques ; la formule ${formuleCible.libelle} en autorise ${quotaCible}. Fermez d'abord les boutiques en trop.`,
        "TIER_BELOW_USAGE"
      );
    }

    // Le taux d'avant le changement (négocié ou de l'ancienne formule) reste
    // acquis aux commandes déjà passées ce mois-ci.
    const ancienneFormule = appliquerConditions(await PlanService.formule(existante.tier), existante);
    await figerCommissionsDuMois(orgId, ancienneFormule.commission, existante.tier);

    const organisation = await db.organization.update({
      where: { id: orgId },
      data: { tier },
    });

    return { avant: existante.tier, organisation, formuleCible };
  },

  /**
   * Fixe des conditions négociées à la main avec un commerçant (une enseigne,
   * une chaîne). Chaque valeur remplace celle de sa formule ; `null` la rend à
   * la formule. Les commandes déjà passées ce mois-ci gardent le taux d'avant.
   */
  async fixerConditions(orgId: string, body: ConditionsNegociees) {
    const existante = await db.organization.findUnique({
      where: { id: orgId },
      select: { tier: true, ...CHAMPS_CONDITIONS },
    });

    if (!existante) {
      throw new ApiError(404, "Commerçant introuvable", "ORG_NOT_FOUND");
    }

    const formule = await PlanService.formule(existante.tier);
    const commissionFinale = body.commission ?? formule.commission;
    const livreursFinale = body.commissionLivreursPlateforme ?? formule.commissionLivreursPlateforme;

    if (livreursFinale < commissionFinale) {
      throw new ApiError(
        400,
        `La commission avec les livreurs de la plateforme (${livreursFinale} %) ne peut pas être inférieure à la commission de base (${commissionFinale} %)`,
        "INVALID_COMMISSION"
      );
    }

    if (body.maxBoutiques !== null) {
      const boutiques = await db.store.count({ where: { orgId, deletedAt: null } });
      if (boutiques > body.maxBoutiques) {
        throw new ApiError(
          400,
          `Ce commerçant exploite ${boutiques} boutiques : le quota ne peut pas descendre à ${body.maxBoutiques}.`,
          "TIER_BELOW_USAGE"
        );
      }
    }

    // Les commandes déjà passées ce mois-ci restent au taux d'avant.
    const ancien = appliquerConditions(formule, existante);
    await figerCommissionsDuMois(orgId, ancien.commission, existante.tier);

    const organisation = await db.organization.update({
      where: { id: orgId },
      data: {
        customCommissionPercent: body.commission,
        customPlatformDeliveryCommissionPercent: body.commissionLivreursPlateforme,
        customMaxStores: body.maxBoutiques,
        customMonthlyPrice: body.prixMensuel,
        customTermsNote: body.note?.trim() || null,
      },
      select: CHAMPS_CONDITIONS,
    });

    return { avant: existante, organisation };
  },

  /**
   * Offre (ou retire) la promo « zéro commission ». Seules les commandes
   * passées pendant la promo en profitent : celles d'avant gardent leur commission.
   */
  async changerPromoCommission(orgId: string, body: PromoCommission) {
    const existante = await db.organization.findUnique({
      where: { id: orgId },
      select: { commissionFreeActive: true, commissionFreeUntil: true },
    });

    if (!existante) {
      throw new ApiError(404, "Commerçant introuvable", "ORG_NOT_FOUND");
    }

    // La date de fin est incluse : la promo court jusqu'au soir de ce jour.
    const fin = body.active && body.until ? new Date(`${body.until}T23:59:59.999`) : null;

    if (fin && fin <= new Date()) {
      throw new ApiError(400, "La date de fin est déjà passée", "PROMO_END_IN_PAST");
    }

    const organisation = await db.organization.update({
      where: { id: orgId },
      data: {
        commissionFreeActive: body.active,
        commissionFreeUntil: fin,
        commissionFreeNote: body.active ? body.note?.trim() || null : null,
      },
    });

    return { avant: existante, organisation, fin };
  },
};
