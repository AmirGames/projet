import { db } from "../../services/db";
import type { OrderStatus } from "@prisma/client";

const MINUTE = 60_000;
export const CHAMPS_CUISINE = {
  kitchenDefaultMinutes: true, kitchenParallelOrders: true, kitchenRushExtraMinutes: true, kitchenRushUntil: true,
} as const;
interface Reglages {
  kitchenDefaultMinutes: number;
  kitchenParallelOrders: number;
  kitchenRushExtraMinutes: number;
  kitchenRushUntil: Date | null;
}
interface Echantillon { acceptedAt: Date | null; readyAt: Date | null }
interface EnCours { acceptedAt: Date | null; estimatedReadyAt: Date | null }

export function calculerPreparation(reglages: Reglages, historique: Echantillon[], actives: EnCours[], maintenant: number) {
  const durees = historique.flatMap((c) => {
    const minutes = c.acceptedAt && c.readyAt ? (c.readyAt.getTime() - c.acceptedAt.getTime()) / MINUTE : NaN;
    return Number.isFinite(minutes) && minutes >= 2 && minutes <= 120 ? [minutes] : [];
  }).sort((a, b) => a - b);
  // Au moins cinq observations réelles ; à partir de dix, moyenne tronquée
  // aux 10 % de chaque extrémité pour limiter les oublis du bouton « Prête ».
  const coupe = durees.length >= 10 ? Math.floor(durees.length * 0.1) : 0;
  const retenues = coupe ? durees.slice(coupe, -coupe) : durees;
  const base = durees.length >= 5 ? retenues.reduce((s, n) => s + n, 0) / retenues.length : reglages.kitchenDefaultMinutes;
  const habituelle = Math.max(5, Math.min(120, Math.ceil(base / 5) * 5));
  const rush = reglages.kitchenRushUntil != null && reglages.kitchenRushUntil.getTime() > maintenant;
  const postes = Array.from({ length: reglages.kitchenParallelOrders }, () => -Infinity);
  // Le travail avance en parallèle. Une commande non marquée prête garde
  // cinq minutes de marge si son échéance est dépassée.
  for (const c of actives) {
    const poste = postes.indexOf(Math.min(...postes));
    const debut = Math.max(c.acceptedAt?.getTime() ?? maintenant, postes[poste]);
    postes[poste] = Math.max(debut + habituelle * MINUTE, c.estimatedReadyAt?.getTime() ?? 0, maintenant + 5 * MINUTE);
  }
  const attente = actives.length >= reglages.kitchenParallelOrders ? Math.max(0, (Math.min(...postes) - maintenant) / MINUTE) : 0;
  const extra = rush ? reglages.kitchenRushExtraMinutes : 0;
  const minutes = actives.length >= 200 ? 240 : Math.min(240, Math.ceil((habituelle + attente + extra) / 5) * 5);
  return {
    minutes, habituelle, source: durees.length >= 5 ? "HISTORIQUE" : "REGLAGE", echantillons: durees.length,
    commandesEnCours: actives.length, attenteMinutes: Math.ceil(attente),
    rush: rush ? { supplementMinutes: extra, jusqua: reglages.kitchenRushUntil!.toISOString() } : null,
    reglages: { minutesParDefaut: reglages.kitchenDefaultMinutes, commandesParalleles: reglages.kitchenParallelOrders },
  };
}

/** Horodatage commun aux deux chemins de changement de statut. */
export function horodatagePreparation(avant: OrderStatus, apres: OrderStatus, maintenant = new Date()) {
  if (apres === "READY" && avant !== "READY") return { readyAt: maintenant };
  if (avant === "READY" && apres === "PREPARING") return { readyAt: null, preparationCalmSample: false };
  return {};
}

export const PreparationCuisineService = {
  async etat(storeId: string, maintenant = Date.now()) {
    const reglages = await db.store.findUniqueOrThrow({ where: { id: storeId }, select: CHAMPS_CUISINE });
    const [historique, actives] = await Promise.all([
      db.order.findMany({
        where: { storeId, deletedAt: null, preparationCalmSample: true, readyAt: { not: null },
          acceptedAt: { gte: new Date(maintenant - 60 * 24 * 60 * MINUTE) }, status: { in: ["READY", "COMPLETED"] } },
        select: { acceptedAt: true, readyAt: true }, orderBy: { readyAt: "desc" }, take: 50,
      }),
      db.order.findMany({
        where: { storeId, deletedAt: null, status: { in: ["ACCEPTED", "PREPARING"] },
          OR: [{ pickupTime: null }, { pickupTime: { lte: new Date(maintenant + reglages.kitchenDefaultMinutes * MINUTE) } }] },
        select: { acceptedAt: true, estimatedReadyAt: true }, orderBy: { acceptedAt: "asc" }, take: 200,
      }),
    ]);
    return calculerPreparation(reglages, historique, actives, maintenant);
  },
  async echantillonCalme(storeId: string, pickupTime: Date | null, maintenant: Date) {
    if (pickupTime) return false;
    const reglages = await db.store.findUniqueOrThrow({ where: { id: storeId }, select: CHAMPS_CUISINE });
    if (reglages.kitchenRushUntil && reglages.kitchenRushUntil > maintenant) return false;
    const actives = await db.order.count({ where: { storeId, deletedAt: null, status: { in: ["ACCEPTED", "PREPARING"] },
      OR: [{ pickupTime: null }, { pickupTime: { lte: new Date(maintenant.getTime() + reglages.kitchenDefaultMinutes * MINUTE) } }] } });
    return actives < reglages.kitchenParallelOrders;
  },
  async modifier(storeId: string, reglage: { minutesParDefaut: number; commandesParalleles: number; supplementRush: number; dureeRush: number | null }) {
    const maintenant = Date.now();
    await db.store.update({ where: { id: storeId }, data: {
      kitchenDefaultMinutes: reglage.minutesParDefaut, kitchenParallelOrders: reglage.commandesParalleles,
      ...(reglage.dureeRush !== null ? {
        kitchenRushExtraMinutes: reglage.dureeRush ? reglage.supplementRush : 0,
        kitchenRushUntil: reglage.dureeRush ? new Date(maintenant + reglage.dureeRush * MINUTE) : null,
      } : {}),
    } });
    return this.etat(storeId, maintenant);
  },
};
