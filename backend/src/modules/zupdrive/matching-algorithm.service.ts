import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { distanceKm } from "../../utils/geo";
import type { Point } from "./tarification-drive.service";

/**
 * Algorithme de matching ZupDrive : assigner le meilleur chauffeur à chaque trajet.
 *
 * Scoring multi-critères :
 * - Distance (40%) : plus proche = mieux
 * - Rating (30%) : meilleure note = mieux
 * - ETA (20%) : arrivée plus rapide = mieux
 * - Acceptance rate (10%) : moins de refus = mieux
 *
 * Le score global [0-100] classe les chauffeurs. Les meilleurs sont sollicités en premier.
 */

export interface DriverMetrics {
  id: string;
  totalTrips: number;
  acceptedTrips: number;
  acceptanceRate: number; // 0-1
  avgRating: number; // 0-5
  latitude: number;
  longitude: number;
  distanceKm: number;
}

export interface MatchScore {
  driverId: string;
  score: number; // 0-100
  breakdown: {
    distanceScore: number;
    ratingScore: number;
    etaScore: number;
    acceptanceScore: number;
  };
  distanceKm: number;
  eta: number; // secondes estimées
}

export class MatchingAlgorithmService {
  /**
   * Calcule les métriques de tous les chauffeurs candidats pour un trajet.
   * Inclut distance, rating, et acceptance rate.
   */
  static async getCandidateMetrics(
    candidateIds: string[],
    pickupLocation: Point
  ): Promise<DriverMetrics[]> {
    if (candidateIds.length === 0) return [];

    const chauffeurs = await db.chauffeurDrive.findMany({
      where: { id: { in: candidateIds } },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        courses: {
          where: { statut: { in: ["ACCEPTEE", "EN_COURS", "TERMINEE"] } },
          select: { id: true, statut: true },
        },
        propositions: {
          where: { statut: "ACCEPTEE" },
          select: { id: true },
        },
        notes: {
          where: { auteur: "PASSAGER" },
          select: { note: true },
        },
      },
    });

    return chauffeurs.map((c) => {
      const totalTrips = c.courses.length;
      const acceptedTrips = c.propositions.length;
      const acceptanceRate = totalTrips > 0 ? acceptedTrips / totalTrips : 0.5; // Default 50%

      const ratings = c.notes.map((n) => n.note);
      const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 4.5;

      const km = distanceKm(pickupLocation, {
        latitude: c.latitude || 0,
        longitude: c.longitude || 0,
      });

      return {
        id: c.id,
        totalTrips,
        acceptedTrips,
        acceptanceRate: Math.max(0, Math.min(1, acceptanceRate)), // 0-1
        avgRating: Math.max(0, Math.min(5, avgRating)), // 0-5
        latitude: c.latitude || 0,
        longitude: c.longitude || 0,
        distanceKm: km,
      };
    });
  }

  /**
   * Score un chauffeur sur 100 selon critères multiples.
   * Plus le score est élevé, meilleur est le chauffeur pour ce trajet.
   */
  static scoreDriver(
    metrics: DriverMetrics,
    maxDistanceKm: number = 15,
    maxEtaSeconds: number = 600 // 10 min
  ): MatchScore {
    // Distance score (40%) : inversement proportionnel
    // 0 km = 100, maxDistance = 0
    const distanceScore = Math.max(0, (1 - metrics.distanceKm / maxDistanceKm) * 100) * 0.4;

    // Rating score (30%) : proportionnel à la note moyenne
    // 5.0 = 100, 1.0 = 0
    const ratingScore = (metrics.avgRating / 5) * 100 * 0.3;

    // ETA score (20%) : basé sur vitesse moyenne (50 km/h dans la ville)
    // Estimé = distance / 50 km/h
    const etaSeconds = (metrics.distanceKm / 50) * 3600; // (km / 50) * 3600
    const etaScore = Math.max(0, (1 - etaSeconds / maxEtaSeconds) * 100) * 0.2;

    // Acceptance rate score (10%) : chauffeurs constants sont préférables
    // 100% = 100, 0% = 0
    const acceptanceScore = metrics.acceptanceRate * 100 * 0.1;

    const totalScore = distanceScore + ratingScore + etaScore + acceptanceScore;

    return {
      driverId: metrics.id,
      score: Math.round(totalScore * 10) / 10, // Arrondi au dixième
      breakdown: {
        distanceScore: Math.round(distanceScore * 10) / 10,
        ratingScore: Math.round(ratingScore * 10) / 10,
        etaScore: Math.round(etaScore * 10) / 10,
        acceptanceScore: Math.round(acceptanceScore * 10) / 10,
      },
      distanceKm: Math.round(metrics.distanceKm * 10) / 10,
      eta: Math.round(etaSeconds),
    };
  }

  /**
   * Classe les chauffeurs candidats par ordre de priorité.
   * Retourne les N meilleurs pour les solliciter en premier.
   */
  static async rankCandidates(
    candidateIds: string[],
    pickupLocation: Point,
    topN: number = 5
  ): Promise<MatchScore[]> {
    const metrics = await this.getCandidateMetrics(candidateIds, pickupLocation);

    const scored = metrics
      .map((m) => this.scoreDriver(m))
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);

    logger.info("Ranking candidates for ZupDrive ride", {
      candidates: candidateIds.length,
      scored: scored.length,
      top: scored.map((s) => ({ id: s.driverId, score: s.score })),
    });

    return scored;
  }

  /**
   * Calcule le surge pricing basé sur la demande/offre actuelle.
   *
   * Ratio = trip requests / drivers available
   * - < 0.5 : 1.0x (pas de surge)
   * - 0.5-1.0 : 1.2x (modéré)
   * - 1.0-1.5 : 1.5x (haut)
   * - 1.5-2.0 : 2.0x (très haut)
   * - > 2.0 : 2.5x (extrême)
   */
  static async calculateSurgePricing(region: string, recentTimeWindowMs: number = 60_000): Promise<number> {
    const now = new Date();
    const recentTime = new Date(now.getTime() - recentTimeWindowMs);

    // Courses en recherche dans la dernière minute
    const tripsInSearch = await db.courseDrive.count({
      where: {
        region,
        statut: "RECHERCHE",
        createdAt: { gte: recentTime },
      },
    });

    // Chauffeurs en ligne et valides
    const driversOnline = await db.chauffeurDrive.count({
      where: {
        region,
        statut: "VALIDE",
        enLigne: true,
        positionLe: { gt: recentTime },
        courses: { none: { statut: { in: ["ACCEPTEE", "EN_COURS"] } } },
      },
    });

    // Éviter division par zéro
    const demandSupplyRatio = driversOnline === 0 ? 0 : tripsInSearch / Math.max(1, driversOnline);

    let surgeFactor = 1.0;
    if (demandSupplyRatio < 0.5) {
      surgeFactor = 1.0; // Pas de surge
    } else if (demandSupplyRatio < 1.0) {
      surgeFactor = 1.2; // Modéré
    } else if (demandSupplyRatio < 1.5) {
      surgeFactor = 1.5; // Haut
    } else if (demandSupplyRatio < 2.0) {
      surgeFactor = 2.0; // Très haut
    } else {
      surgeFactor = 2.5; // Extrême
    }

    logger.info("ZupDrive surge pricing", {
      region,
      trips: tripsInSearch,
      drivers: driversOnline,
      ratio: demandSupplyRatio.toFixed(2),
      surgeFactor,
    });

    return surgeFactor;
  }

  /**
   * Métriques agrégées sur une période pour l'admin.
   */
  static async getRegionMetrics(region: string, hoursBack: number = 24) {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const [
      completedRides,
      cancelledRides,
      avgWaitTime,
      avgRideDistance,
      avgRidePrice,
      activeDrivers,
      onlineNow,
    ] = await Promise.all([
      db.courseDrive.count({
        where: { region, statut: "TERMINEE", termineeLe: { gte: since } },
      }),
      db.courseDrive.count({
        where: { region, statut: "ANNULEE", annuleeLe: { gte: since } },
      }),
      db.courseDrive.aggregate({
        where: { region, statut: "ACCEPTEE", accepteeLe: { gte: since } },
        _avg: { dureeSecondes: true },
      }),
      db.courseDrive.aggregate({
        where: { region, statut: "TERMINEE", termineeLe: { gte: since } },
        _avg: { distanceMetres: true },
      }),
      db.courseDrive.aggregate({
        where: { region, statut: "TERMINEE", termineeLe: { gte: since } },
        _avg: { prixCentimes: true },
      }),
      db.chauffeurDrive.count({
        where: { region, statut: "VALIDE" },
      }),
      db.chauffeurDrive.count({
        where: { region, statut: "VALIDE", enLigne: true },
      }),
    ]);

    return {
      region,
      period: { hoursBack, since },
      rides: {
        completed: completedRides,
        cancelled: cancelledRides,
        cancellationRate: completedRides + cancelledRides > 0 ? cancelledRides / (completedRides + cancelledRides) : 0,
      },
      avgWaitTimeSeconds: avgWaitTime._avg.dureeSecondes ?? 0,
      avgRideDistanceMeters: avgRideDistance._avg.distanceMetres ?? 0,
      avgRidePriceCentimes: avgRidePrice._avg.prixCentimes ?? 0,
      drivers: {
        active: activeDrivers,
        onlineNow,
        utilizationRate: activeDrivers > 0 ? onlineNow / activeDrivers : 0,
      },
    };
  }

  /**
   * Rapport détaillé d'un chauffeur pour l'admin.
   */
  static async getDriverReport(driverId: string) {
    const chauffeur = await db.chauffeurDrive.findUnique({
      where: { id: driverId },
      include: {
        courses: {
          where: { statut: "TERMINEE" },
          select: {
            id: true,
            prixCentimes: true,
            distanceMetres: true,
            dureeSecondes: true,
            termineeLe: true,
          },
        },
        notes: {
          where: { auteur: "PASSAGER" },
          select: { note: true, commentaire: true, createdAt: true },
        },
        propositions: {
          where: { statut: "ACCEPTEE" },
          select: { id: true, createdAt: true },
        },
      },
    });

    if (!chauffeur) return null;

    const totalRides = chauffeur.courses.length;
    const totalEarnings = chauffeur.courses.reduce((sum, c) => sum + c.prixCentimes, 0);
    const avgDistance = totalRides > 0 ? chauffeur.courses.reduce((sum, c) => sum + c.distanceMetres, 0) / totalRides : 0;
    const avgDuration = totalRides > 0 ? chauffeur.courses.reduce((sum, c) => sum + c.dureeSecondes, 0) / totalRides : 0;

    const ratings = chauffeur.notes.map((n) => n.note);
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    const acceptanceRate = chauffeur.propositions.length > 0 ? chauffeur.courses.length / chauffeur.propositions.length : 0;

    const lastActive = chauffeur.courses[0]?.termineeLe ?? chauffeur.positionLe ?? null;

    return {
      id: chauffeur.id,
      nomComplet: chauffeur.nomComplet,
      statut: chauffeur.statut,
      enLigne: chauffeur.enLigne,
      stats: {
        totalRides,
        totalEarningsCentimes: totalEarnings,
        avgRidePriceCentimes: totalRides > 0 ? totalEarnings / totalRides : 0,
        avgDistanceMeters: Math.round(avgDistance),
        avgDurationSeconds: Math.round(avgDuration),
      },
      ratings: {
        avg: parseFloat(avgRating.toFixed(2)),
        count: ratings.length,
        recent: chauffeur.notes.slice(0, 5),
      },
      performance: {
        acceptanceRate: parseFloat((acceptanceRate * 100).toFixed(1)),
        lastActive,
      },
    };
  }
}
