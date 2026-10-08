import { db } from "../../services/db";
import { libelleDeLaCuisine } from "../stores/store-type.service";
import { boutiquesDeLaRegion } from "./offres-region.service";

/**
 * Les commerces à suggérer à un client, d'après ce qu'il commande le plus.
 *
 * Rien n'est conservé : le calcul se fait à chaque appel sur les commandes du
 * compte. Effacer le compte (les commandes sont détachées du client) efface
 * donc aussi, de fait, tout ce que ce calcul pouvait savoir de lui.
 */

/**
 * Types de cuisine qui peuvent révéler une appartenance religieuse : on ne
 * personnalise jamais dessus (RGPD, article 9). Le client les trouve toujours
 * par la recherche et les tendances agrégées.
 */
export const CUISINES_SENSIBLES: ReadonlySet<string> = new Set(["halal", "kosher", "israeli"]);

const CUISINES_RETENUES = 3;
const SUGGESTIONS_MAX = 12;

/** Les types de cuisine préférés, du plus commandé au moins commandé. Sans les sensibles. */
export function cuisinesPreferees(
  commandesParBoutique: Array<{ storeId: string; commandes: number }>,
  cuisineDeLaBoutique: Map<string, string | null>,
  retenues = CUISINES_RETENUES,
): string[] {
  const total = new Map<string, number>();
  for (const { storeId, commandes } of commandesParBoutique) {
    const cuisine = cuisineDeLaBoutique.get(storeId);
    if (!cuisine || CUISINES_SENSIBLES.has(cuisine)) continue;
    total.set(cuisine, (total.get(cuisine) ?? 0) + commandes);
  }
  return [...total.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, retenues)
    .map(([cuisine]) => cuisine);
}

export async function personnalisationActive(customerId: string): Promise<boolean> {
  const client = await db.customer.findUnique({
    where: { id: customerId },
    select: { personnalisationDesactivee: true },
  });
  return !!client && !client.personnalisationDesactivee;
}

export async function changerPersonnalisation(customerId: string, desactivee: boolean) {
  await db.customer.update({ where: { id: customerId }, data: { personnalisationDesactivee: desactivee } });
  return { personnalisationActive: !desactivee };
}

export async function recommandationsPourLeClient(customerId: string, pays?: string) {
  if (!(await personnalisationActive(customerId))) {
    return { personnalisationActive: false, cuisines: [] as string[], boutiques: [] as unknown[] };
  }

  const commandees = await db.order.groupBy({
    by: ["storeId"],
    where: { customerId, status: "COMPLETED", deletedAt: null },
    _count: { _all: true },
  });
  if (commandees.length === 0) return { personnalisationActive: true, cuisines: [], boutiques: [] };

  const sesBoutiques = await db.store.findMany({
    where: { id: { in: commandees.map((c) => c.storeId) } },
    select: { id: true, cuisineType: true },
  });
  const cuisines = cuisinesPreferees(
    commandees.map((c) => ({ storeId: c.storeId, commandes: c._count._all })),
    new Map(sesBoutiques.map((b) => [b.id, b.cuisineType])),
  );
  if (cuisines.length === 0) return { personnalisationActive: true, cuisines: [], boutiques: [] };

  const dejaCommandees = new Set(commandees.map((c) => c.storeId));
  const candidates = await db.store.findMany({
    where: { ...boutiquesDeLaRegion(pays), cuisineType: { in: cuisines } },
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      cuisineType: true,
      rating: true,
      totalRatings: true,
      isOpen: true,
      org: { select: { id: true, slug: true } },
    },
    orderBy: [{ rating: "desc" }, { totalRatings: "desc" }],
    take: SUGGESTIONS_MAX * 3,
  });

  // D'abord les cuisines que le client commande le plus, puis la meilleure note ;
  // les commerces nouveaux pour lui passent avant ceux qu'il connaît déjà.
  const rang = (cuisine: string | null) => cuisines.indexOf(cuisine ?? "");
  const boutiques = candidates
    .map((b) => ({
      ...b,
      rating: Number(b.rating),
      cuisineLibelle: libelleDeLaCuisine(b.cuisineType),
      dejaCommande: dejaCommandees.has(b.id),
    }))
    .sort(
      (a, b) =>
        Number(a.dejaCommande) - Number(b.dejaCommande) || rang(a.cuisineType) - rang(b.cuisineType) || b.rating - a.rating,
    )
    .slice(0, SUGGESTIONS_MAX);

  return { personnalisationActive: true, cuisines, boutiques };
}
