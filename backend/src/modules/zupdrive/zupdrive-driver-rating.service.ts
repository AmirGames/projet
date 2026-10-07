/**
 * ZupDrive Driver Rating & Reputation Service
 *
 * Système d'évaluation des chauffeurs:
 * - Ratings des passagers (1-5 stars)
 * - Calcul de score de réputation
 * - Analyse des avis (text reviews)
 * - Performance analytics
 * - Incentives et badges
 *
 * Métrique clé: Rating moyen = qualité perçue du service
 * Impact: Affecte visibilité des courses, priorité de matching
 */

import { db } from "../../services/db";
import { ApiError } from "../../middleware/api-error";

export type Rating = 1 | 2 | 3 | 4 | 5;

export interface DriverRatingData {
  chauffeurId: string;
  passengerId: string;
  courseId: string;
  rating: Rating; // 1-5 stars
  comment?: string;
  categories?: {
    cleanliness?: Rating;
    driving?: Rating;
    communication?: Rating;
    comfort?: Rating;
  };
  tags?: ("safe_driving" | "friendly" | "clean_car" | "good_music" | "quiet")[];
}

export interface DriverReputationScore {
  chauffeurId: string;
  averageRating: number; // 1-5
  totalRatings: number;
  ratingDistribution: {
    fiveStar: number;
    fourStar: number;
    threeStar: number;
    twoStar: number;
    oneStar: number;
  };
  reputationScore: number; // 0-100, weighted
  reputationLevel: "EXCELLENT" | "VERY_GOOD" | "GOOD" | "FAIR" | "POOR";
  completionRate: number; // 0-100%
  cancellationRate: number; // 0-100%
  responseTime: number; // avg seconds to accept ride
  badges: string[]; // "TOP_RATED", "CONSISTENT", etc.
  trends: {
    weeklyTrend: number; // -10 to +10 (trend)
    monthlyTrend: number;
  };
  recommendations: string[];
}

export const ZupDriveDriverRatingService = {
  /**
   * Créer un rating après une course
   */
  async submitRating(data: DriverRatingData): Promise<void> {
    // Vérifier que la course existe et est complétée
    const course = await db.courseDrive.findUnique({
      where: { id: data.courseId },
      select: { statut: true, passagerId: true, chauffeurId: true },
    });

    if (!course) {
      throw new ApiError(404, "Course non trouvée");
    }

    if (course.statut !== "COMPLETED") {
      throw new ApiError(400, "Peut noter que les courses complétées");
    }

    if (course.passagerId !== data.passengerId) {
      throw new ApiError(403, "Seul le passager peut noter");
    }

    // Vérifier qu'on n'a pas déjà noté
    const existing = await db.ratingCourseDrive.findFirst({
      where: {
        courseId: data.courseId,
        passagerId: data.passengerId,
      },
    });

    if (existing) {
      throw new ApiError(400, "Vous avez déjà noté cette course");
    }

    // Créer le rating
    await db.ratingCourseDrive.create({
      data: {
        courseId: data.courseId,
        chauffeurId: data.chauffeurId,
        passagerId: data.passengerId,
        note: data.rating,
        commentaire: data.comment || null,
        categories: data.categories as any,
        tags: data.tags || [],
      },
    });

    // Recalculer la réputation du chauffeur
    await this.updateReputationScore(data.chauffeurId);
  },

  /**
   * Obtenir le score de réputation d'un chauffeur
   */
  async getReputationScore(chauffeurId: string): Promise<DriverReputationScore> {
    const chauffeur = await db.chauffeurDrive.findUnique({
      where: { id: chauffeurId },
      select: {
        id: true,
        rating: true,
        courses: {
          select: {
            id: true,
            statut: true,
          },
        },
        ratings: {
          select: {
            note: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!chauffeur) {
      throw new ApiError(404, "Chauffeur non trouvé");
    }

    const ratings = chauffeur.ratings || [];
    const courses = chauffeur.courses || [];

    // Calculer les stats
    const totalRatings = ratings.length;
    const averageRating =
      totalRatings > 0
        ? ratings.reduce((sum, r) => sum + r.note, 0) / totalRatings
        : 0;

    const ratingDistribution = {
      fiveStar: ratings.filter((r) => r.note === 5).length,
      fourStar: ratings.filter((r) => r.note === 4).length,
      threeStar: ratings.filter((r) => r.note === 3).length,
      twoStar: ratings.filter((r) => r.note === 2).length,
      oneStar: ratings.filter((r) => r.note === 1).length,
    };

    // Taux de complétion
    const completedCourses = courses.filter((c) => c.statut === "COMPLETED").length;
    const completionRate = courses.length > 0 ? (completedCourses / courses.length) * 100 : 0;

    // Taux d'annulation
    const cancelledCourses = courses.filter((c) => c.statut === "CANCELLED").length;
    const cancellationRate = courses.length > 0 ? (cancelledCourses / courses.length) * 100 : 0;

    // Calculer le score de réputation (0-100)
    // Formule: Rating (40%) + Complétion (30%) + Stabilité (30%)
    const ratingComponent = (averageRating / 5) * 40; // 0-40
    const completionComponent = (completionRate / 100) * 30; // 0-30
    const stabilityComponent = Math.max(0, (100 - cancellationRate) / 100) * 30; // 0-30

    const reputationScore = Math.round(
      ratingComponent + completionComponent + stabilityComponent
    );

    // Déterminer le level
    let reputationLevel: "EXCELLENT" | "VERY_GOOD" | "GOOD" | "FAIR" | "POOR";
    if (reputationScore >= 90) reputationLevel = "EXCELLENT";
    else if (reputationScore >= 80) reputationLevel = "VERY_GOOD";
    else if (reputationScore >= 70) reputationLevel = "GOOD";
    else if (reputationScore >= 50) reputationLevel = "FAIR";
    else reputationLevel = "POOR";

    // Badges
    const badges = this.generateBadges({
      averageRating,
      totalRatings,
      completionRate,
      cancellationRate,
      courses: courses.length,
    });

    // Trends (compare aux 7 derniers jours vs 7 jours avant)
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const thisWeekRatings = ratings.filter(
      (r) => r.createdAt >= oneWeekAgo && r.createdAt <= now
    ).length;
    const lastWeekRatings = ratings.filter(
      (r) => r.createdAt >= twoWeeksAgo && r.createdAt < oneWeekAgo
    ).length;

    const weeklyTrend = thisWeekRatings - lastWeekRatings;

    // Tendance mensuelle
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const thisMonthRatings = ratings.filter(
      (r) => r.createdAt >= oneMonthAgo && r.createdAt <= now
    ).length;
    const lastMonthRatings = ratings.filter(
      (r) => r.createdAt >= twoMonthsAgo && r.createdAt < oneMonthAgo
    ).length;

    const monthlyTrend = thisMonthRatings - lastMonthRatings;

    // Recommendations
    const recommendations = this.generateRecommendations({
      averageRating,
      totalRatings,
      completionRate,
      cancellationRate,
      reputationLevel,
    });

    return {
      chauffeurId,
      averageRating: Math.round(averageRating * 100) / 100,
      totalRatings,
      ratingDistribution,
      reputationScore,
      reputationLevel,
      completionRate: Math.round(completionRate),
      cancellationRate: Math.round(cancellationRate),
      responseTime: 0, // TODO: Calculate from CourseDrive data
      badges,
      trends: {
        weeklyTrend,
        monthlyTrend,
      },
      recommendations,
    };
  },

  /**
   * Mettre à jour le score de réputation (appelé après chaque rating)
   */
  async updateReputationScore(chauffeurId: string): Promise<void> {
    const score = await this.getReputationScore(chauffeurId);

    await db.chauffeurDrive.update({
      where: { id: chauffeurId },
      data: {
        rating: score.averageRating,
        // Store full reputation data if we had a column for it
      },
    });
  },

  /**
   * Obtenir les avis pour un chauffeur
   */
  async getReviews(
    chauffeurId: string,
    limit: number = 10,
    offset: number = 0,
    sortBy: "recent" | "highest" | "lowest" = "recent"
  ) {
    let orderBy: any = { createdAt: "desc" };

    if (sortBy === "highest") {
      orderBy = { note: "desc" };
    } else if (sortBy === "lowest") {
      orderBy = { note: "asc" };
    }

    const reviews = await db.ratingCourseDrive.findMany({
      where: { chauffeurId },
      orderBy,
      take: limit,
      skip: offset,
      select: {
        id: true,
        note: true,
        commentaire: true,
        tags: true,
        categories: true,
        createdAt: true,
        passenger: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return reviews;
  },

  /**
   * Générer des badges basés sur la performance
   */
  generateBadges(stats: {
    averageRating: number;
    totalRatings: number;
    completionRate: number;
    cancellationRate: number;
    courses: number;
  }): string[] {
    const badges: string[] = [];

    // TOP_RATED: 4.8+ stars with 50+ ratings
    if (stats.averageRating >= 4.8 && stats.totalRatings >= 50) {
      badges.push("TOP_RATED");
    }

    // RELIABLE: 98%+ completion rate
    if (stats.completionRate >= 98) {
      badges.push("CONSISTENT");
    }

    // SAFE: Low cancellation rate
    if (stats.cancellationRate <= 2) {
      badges.push("RELIABLE");
    }

    // EXPERIENCED: 500+ courses
    if (stats.courses >= 500) {
      badges.push("EXPERIENCED");
    }

    // RISING_STAR: 50+ courses and improving
    if (stats.courses >= 50 && stats.averageRating >= 4.5) {
      badges.push("RISING_STAR");
    }

    // PROFESSIONAL: 4+ stars with 100+ ratings
    if (stats.averageRating >= 4.0 && stats.totalRatings >= 100) {
      badges.push("PROFESSIONAL");
    }

    return badges;
  },

  /**
   * Générer des recommandations pour l'amélioration
   */
  generateRecommendations(stats: {
    averageRating: number;
    totalRatings: number;
    completionRate: number;
    cancellationRate: number;
    reputationLevel: string;
  }): string[] {
    const recommendations: string[] = [];

    // Recommandations basées sur le rating
    if (stats.averageRating < 3.5) {
      recommendations.push("Améliez votre service - plusieurs clients insatisfaits");
      recommendations.push("Demandez du feedback détaillé aux passagers");
    } else if (stats.averageRating < 4.0) {
      recommendations.push("Vous approchez d'une bonne évaluation! Continuez l'effort");
    } else if (stats.averageRating >= 4.8) {
      recommendations.push("Excellent! Conservez cette qualité");
    }

    // Recommandations sur la complétion
    if (stats.completionRate < 90) {
      recommendations.push("Réduisez les annulations pour plus de courses");
    }

    // Recommandations sur les stats
    if (stats.totalRatings < 20) {
      recommendations.push("Accumulez plus d'avis pour renforcer votre profil");
    }

    // Encouragement pour les bons performers
    if (stats.reputationLevel === "EXCELLENT") {
      recommendations.push("Vous êtes un chauffeur d'élite! Postulez pour les programmes premium");
    }

    return recommendations;
  },

  /**
   * Obtenir les chauffeurs top-rated
   */
  async getTopRatedDrivers(limit: number = 10) {
    const drivers = await db.chauffeurDrive.findMany({
      where: {
        rating: { gte: 4.5 },
      },
      orderBy: { rating: "desc" },
      take: limit,
      select: {
        id: true,
        nomComplet: true,
        region: true,
        rating: true,
        _count: {
          select: { ratings: true, courses: true },
        },
      },
    });

    return drivers.map((d) => ({
      id: d.id,
      nomComplet: d.nomComplet,
      region: d.region,
      averageRating: d.rating,
      totalRatings: d._count.ratings,
      totalCourses: d._count.courses,
    }));
  },

  /**
   * Obtenir les chauffeurs ayant besoin d'amélioration
   */
  async getDriversNeedingImprovement(limit: number = 10) {
    const drivers = await db.chauffeurDrive.findMany({
      where: {
        rating: { lt: 3.5 },
      },
      orderBy: { rating: "asc" },
      take: limit,
      select: {
        id: true,
        nomComplet: true,
        rating: true,
        _count: {
          select: { ratings: true },
        },
      },
    });

    return drivers.map((d) => ({
      id: d.id,
      nomComplet: d.nomComplet,
      averageRating: d.rating,
      totalRatings: d._count.ratings,
      status: "NEEDS_IMPROVEMENT",
    }));
  },
};

/**
 * SYSTÈME DE SCORING EXPLIQUÉ
 *
 * Reputation Score = Weighted Average
 * ├─ Rating (40%)
 * │  └─ Average of 1-5 stars
 * ├─ Completion (30%)
 * │  └─ % of courses completed vs total
 * └─ Stability (30%)
 *    └─ (100 - cancellation rate) as %
 *
 * Exemple:
 * - Average rating: 4.5/5 → 4.5/5 * 40 = 36 points
 * - Completion rate: 98% → 0.98 * 30 = 29.4 points
 * - Cancellation rate: 2% → (100-2)/100 * 30 = 29.4 points
 * ─────────────────────────────────────────────────────
 * Total: 94.8 → Score 95 (EXCELLENT)
 *
 * REPUTATION LEVELS
 * EXCELLENT (90+):   Chauffeur d'élite - visible en priorité
 * VERY_GOOD (80+):   Très bon - recommended
 * GOOD (70+):        Acceptable - normal visibility
 * FAIR (50+):        À améliorer - warnings
 * POOR (<50):        Risqué - peut être suspendu
 */
