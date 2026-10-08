import { db } from "../../services/db";
import { libelleDeLaCuisine } from "../stores/store-type.service";

/**
 * Ce qui se vend et ce qui se promet dans une région.
 *
 * Rien ici ne dépend d'une personne : la région vient du pays (et, pour les
 * tendances, de la ville) que le visiteur a choisi, jamais d'un traceur ni d'un
 * profil. Les tendances sont des statistiques agrégées : un type de cuisine
 * n'est publié qu'à partir d'un nombre minimal d'acheteurs distincts, pour
 * qu'aucun client ne puisse être reconnu dans un petit quartier.
 */

/** Nombre minimal d'acheteurs distincts avant de publier une tendance. */
export const SEUIL_ACHETEURS = 10;

/** Fenêtre de calcul des tendances, en jours. */
export const FENETRE_TENDANCES_JOURS = 90;

const TENDANCES_MAX = 10;
const PROMOTIONS_MAX = 50;
const CACHE_TENDANCES_MS = 10 * 60 * 1000;

/** Les commerces qu'un visiteur peut voir : validés, non supprimés, pas de démonstration. */
export function boutiquesDeLaRegion(pays?: string, ville?: string) {
  return {
    deletedAt: null,
    org: { status: "ACTIVE" as const, approvedAt: { not: null }, isDemo: false },
    // Une boutique dont le pays n'est pas encore connu reste listée partout.
    ...(pays && { OR: [{ countryCode: pays }, { countryCode: null }] }),
    ...(ville && { city: { equals: ville, mode: "insensitive" as const } }),
  };
}

export interface LigneAchat {
  storeId: string;
  acheteur: string;
}

export interface TendanceCuisine {
  cuisineType: string;
  libelle: string;
  acheteurs: number;
  commandes: number;
  boutiques: number;
}

/**
 * Regroupe des achats (une ligne par couple boutique/acheteur, avec son nombre
 * de commandes) par type de cuisine, et écarte tout ce qui est sous le seuil.
 * Pure : pas d'accès base, pour pouvoir la tester sur des cas limites.
 */
export function agregerTendances(
  achats: Array<LigneAchat & { commandes: number }>,
  cuisineDeLaBoutique: Map<string, string | null>,
  seuil = SEUIL_ACHETEURS,
): TendanceCuisine[] {
  const parCuisine = new Map<string, { acheteurs: Set<string>; commandes: number; boutiques: Set<string> }>();

  for (const achat of achats) {
    const cuisine = cuisineDeLaBoutique.get(achat.storeId);
    if (!cuisine) continue;
    const groupe = parCuisine.get(cuisine) ?? { acheteurs: new Set(), commandes: 0, boutiques: new Set() };
    groupe.acheteurs.add(achat.acheteur);
    groupe.commandes += achat.commandes;
    groupe.boutiques.add(achat.storeId);
    parCuisine.set(cuisine, groupe);
  }

  return [...parCuisine.entries()]
    .filter(([, g]) => g.acheteurs.size >= seuil)
    .map(([cuisineType, g]) => ({
      cuisineType,
      libelle: libelleDeLaCuisine(cuisineType) ?? cuisineType,
      acheteurs: g.acheteurs.size,
      commandes: g.commandes,
      boutiques: g.boutiques.size,
    }))
    .sort((a, b) => b.commandes - a.commandes || a.cuisineType.localeCompare(b.cuisineType))
    .slice(0, TENDANCES_MAX);
}

const cache = new Map<string, { jusqua: number; valeur: TendanceCuisine[] }>();

/** Vide le cache : pour les tests. */
export function viderLeCacheDesTendances() {
  cache.clear();
}

/**
 * Les types de cuisine les plus commandés dans la région, sur les commandes
 * terminées des {@link FENETRE_TENDANCES_JOURS} derniers jours.
 */
export async function tendancesDeLaRegion(pays?: string, ville?: string): Promise<TendanceCuisine[]> {
  const cle = `${pays ?? "*"}|${(ville ?? "*").toLowerCase()}`;
  const enCache = cache.get(cle);
  if (enCache && enCache.jusqua > Date.now()) return enCache.valeur;

  const depuis = new Date(Date.now() - FENETRE_TENDANCES_JOURS * 24 * 60 * 60 * 1000);
  const boutiques = await db.store.findMany({
    where: { ...boutiquesDeLaRegion(pays, ville), cuisineType: { not: null } },
    select: { id: true, cuisineType: true },
  });
  if (boutiques.length === 0) return [];

  const groupes = await db.order.groupBy({
    by: ["storeId", "customerId", "customerEmail"],
    where: {
      storeId: { in: boutiques.map((b) => b.id) },
      status: "COMPLETED",
      deletedAt: null,
      createdAt: { gte: depuis },
    },
    _count: { _all: true },
  });

  const valeur = agregerTendances(
    groupes.map((g) => ({
      storeId: g.storeId,
      // Un invité n'a pas de compte : son e-mail le distingue, sans jamais sortir d'ici.
      acheteur: g.customerId ?? g.customerEmail,
      commandes: g._count._all,
    })),
    new Map(boutiques.map((b) => [b.id, b.cuisineType])),
  );

  cache.set(cle, { jusqua: Date.now() + CACHE_TENDANCES_MS, valeur });
  return valeur;
}

/**
 * Les promotions en cours des commerces de la région. Mêmes conditions de
 * validité que le code promo au paiement ; la plage horaire et les jours
 * restent affichés pour que le client sache quand elle joue.
 */
export async function promotionsDeLaRegion(pays?: string, ville?: string) {
  const maintenant = new Date();
  const promotions = await db.promotion.findMany({
    where: {
      status: "ACTIVE",
      AND: [
        { OR: [{ startDate: null }, { startDate: { lte: maintenant } }] },
        { OR: [{ endDate: null }, { endDate: { gte: maintenant } }] },
      ],
      store: boutiquesDeLaRegion(pays, ville),
    },
    select: {
      code: true,
      description: true,
      type: true,
      discountValue: true,
      minOrderAmount: true,
      endDate: true,
      activeFromTime: true,
      activeToTime: true,
      activeDays: true,
      maxUses: true,
      currentUses: true,
      store: { select: { id: true, name: true, slug: true, city: true, cuisineType: true, org: { select: { id: true, slug: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: PROMOTIONS_MAX * 2,
  });

  return promotions
    .filter((p) => !p.maxUses || p.currentUses < p.maxUses)
    .slice(0, PROMOTIONS_MAX)
    .map(({ maxUses: _maxUses, currentUses: _currentUses, ...publique }) => publique);
}
