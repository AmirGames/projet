/**
 * Tests: Driver Rating & Reputation System
 */

import { ZupDriveDriverRatingService } from "../zupdrive-driver-rating.service";
import { db } from "../../../services/db";

jest.mock("../../../services/db", () => ({
  db: {
    courseDrive: {
      findUnique: jest.fn(),
    },
    ratingCourseDrive: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    chauffeurDrive: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
    },
  },
}));

describe("ZupDriveDriverRatingService", () => {
  const mockChauffeurId = "chauffeur-123";
  const mockPassengerId = "passenger-456";
  const mockCourseId = "course-789";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("submitRating", () => {
    it("devrait créer un rating pour une course complétée", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce({
        id: mockCourseId,
        statut: "COMPLETED",
        passagerId: mockPassengerId,
        chauffeurId: mockChauffeurId,
      } as any);

      jest.mocked(db.ratingCourseDrive.findFirst).mockResolvedValueOnce(null);

      jest.mocked(db.ratingCourseDrive.create).mockResolvedValueOnce({
        id: "rating-1",
        note: 5,
      } as any);

      jest.mocked(db.chauffeurDrive.findUnique)
        .mockResolvedValueOnce({
          id: mockChauffeurId,
          rating: 4.8,
          ratings: [{ note: 5 }],
          courses: [{ statut: "COMPLETED" }],
        } as any)
        .mockResolvedValueOnce({
          id: mockChauffeurId,
          rating: 4.5,
        } as any);

      await ZupDriveDriverRatingService.submitRating({
        chauffeurId: mockChauffeurId,
        passengerId: mockPassengerId,
        courseId: mockCourseId,
        rating: 5,
        comment: "Excellent driver!",
      });

      expect(db.ratingCourseDrive.create).toHaveBeenCalled();
    });

    it("devrait rejeter si course n'existe pas", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce(null);

      await expect(
        ZupDriveDriverRatingService.submitRating({
          chauffeurId: mockChauffeurId,
          passengerId: mockPassengerId,
          courseId: "invalid",
          rating: 5,
        })
      ).rejects.toThrow("Course non trouvée");
    });

    it("devrait rejeter si course n'est pas complétée", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce({
        id: mockCourseId,
        statut: "IN_PROGRESS",
      } as any);

      await expect(
        ZupDriveDriverRatingService.submitRating({
          chauffeurId: mockChauffeurId,
          passengerId: mockPassengerId,
          courseId: mockCourseId,
          rating: 5,
        })
      ).rejects.toThrow("Peut noter que les courses complétées");
    });

    it("devrait rejeter si déjà noté", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce({
        id: mockCourseId,
        statut: "COMPLETED",
        passagerId: mockPassengerId,
      } as any);

      jest.mocked(db.ratingCourseDrive.findFirst).mockResolvedValueOnce({
        id: "existing-rating",
      } as any);

      await expect(
        ZupDriveDriverRatingService.submitRating({
          chauffeurId: mockChauffeurId,
          passengerId: mockPassengerId,
          courseId: mockCourseId,
          rating: 5,
        })
      ).rejects.toThrow("Vous avez déjà noté");
    });
  });

  describe("getReputationScore", () => {
    it("devrait calculer EXCELLENT pour un chauffeur avec 4.8+ stars", async () => {
      const now = new Date();

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        id: mockChauffeurId,
        rating: 4.85,
        courses: Array(100)
          .fill(null)
          .map(() => ({ statut: "COMPLETED" })),
        ratings: Array(50)
          .fill(null)
          .map(() => ({ note: 5, createdAt: now })),
      } as any);

      const score = await ZupDriveDriverRatingService.getReputationScore(mockChauffeurId);

      expect(score.averageRating).toBe(4.85);
      expect(score.reputationLevel).toBe("EXCELLENT");
      expect(score.reputationScore).toBeGreaterThanOrEqual(90);
    });

    it("devrait calculer POOR pour un chauffeur avec <2.0 stars", async () => {
      const now = new Date();

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        id: mockChauffeurId,
        rating: 1.8,
        courses: Array(50)
          .fill(null)
          .map(() => ({ statut: "COMPLETED" })),
        ratings: Array(20)
          .fill(null)
          .map(() => ({ note: 2, createdAt: now })),
      } as any);

      const score = await ZupDriveDriverRatingService.getReputationScore(mockChauffeurId);

      expect(score.reputationLevel).toBe("POOR");
      expect(score.reputationScore).toBeLessThan(50);
    });

    it("devrait pénaliser un haut taux d'annulation", async () => {
      const now = new Date();

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        id: mockChauffeurId,
        rating: 4.5,
        courses: [
          ...Array(10)
            .fill(null)
            .map(() => ({ statut: "COMPLETED" })),
          ...Array(30)
            .fill(null)
            .map(() => ({ statut: "CANCELLED" })), // 75% cancellation!
        ],
        ratings: Array(10)
          .fill(null)
          .map(() => ({ note: 4.5, createdAt: now })),
      } as any);

      const score = await ZupDriveDriverRatingService.getReputationScore(mockChauffeurId);

      expect(score.cancellationRate).toBe(75);
      expect(score.reputationScore).toBeLessThan(70); // Should be penalized
    });

    it("devrait générer les badges TOP_RATED", async () => {
      const now = new Date();

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        id: mockChauffeurId,
        rating: 4.85,
        courses: Array(100)
          .fill(null)
          .map(() => ({ statut: "COMPLETED" })),
        ratings: Array(60)
          .fill(null)
          .map(() => ({ note: 5, createdAt: now })),
      } as any);

      const score = await ZupDriveDriverRatingService.getReputationScore(mockChauffeurId);

      expect(score.badges).toContain("TOP_RATED");
      expect(score.badges).toContain("PROFESSIONAL");
    });

    it("devrait générer les badges CONSISTENT", async () => {
      const now = new Date();

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        id: mockChauffeurId,
        rating: 4.0,
        courses: Array(200)
          .fill(null)
          .map(() => ({ statut: "COMPLETED" })), // 0% cancellations
        ratings: Array(30)
          .fill(null)
          .map(() => ({ note: 4, createdAt: now })),
      } as any);

      const score = await ZupDriveDriverRatingService.getReputationScore(mockChauffeurId);

      expect(score.badges).toContain("CONSISTENT");
      expect(score.badges).toContain("EXPERIENCED");
    });
  });

  describe("getReviews", () => {
    it("devrait retourner les avis ordonnés par récent", async () => {
      const reviews = [
        { id: "review-1", note: 5, createdAt: new Date() },
        { id: "review-2", note: 4, createdAt: new Date(Date.now() - 1000) },
      ];

      jest.mocked(db.ratingCourseDrive.findMany).mockResolvedValueOnce(reviews as any);

      const result = await ZupDriveDriverRatingService.getReviews(mockChauffeurId, 10, 0);

      expect(result).toHaveLength(2);
    });

    it("devrait supporter le tri par note la plus élevée", async () => {
      jest.mocked(db.ratingCourseDrive.findMany).mockResolvedValueOnce([] as any);

      await ZupDriveDriverRatingService.getReviews(mockChauffeurId, 10, 0, "highest");

      expect(db.ratingCourseDrive.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { note: "desc" },
        })
      );
    });
  });

  describe("Rating distribution", () => {
    it("devrait calculer correctement la distribution des ratings", async () => {
      const now = new Date();

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        id: mockChauffeurId,
        rating: 4.0,
        courses: Array(10)
          .fill(null)
          .map(() => ({ statut: "COMPLETED" })),
        ratings: [
          { note: 5, createdAt: now },
          { note: 5, createdAt: now },
          { note: 5, createdAt: now },
          { note: 4, createdAt: now },
          { note: 4, createdAt: now },
          { note: 3, createdAt: now },
          { note: 2, createdAt: now },
          { note: 1, createdAt: now },
        ],
      } as any);

      const score = await ZupDriveDriverRatingService.getReputationScore(mockChauffeurId);

      expect(score.ratingDistribution.fiveStar).toBe(3);
      expect(score.ratingDistribution.fourStar).toBe(2);
      expect(score.ratingDistribution.threeStar).toBe(1);
      expect(score.ratingDistribution.twoStar).toBe(1);
      expect(score.ratingDistribution.oneStar).toBe(1);
      expect(score.totalRatings).toBe(8);
    });
  });

  describe("Recommendations", () => {
    it("devrait recommander l'amélioration si faible rating", async () => {
      const now = new Date();

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        id: mockChauffeurId,
        rating: 2.0,
        courses: Array(50)
          .fill(null)
          .map(() => ({ statut: "COMPLETED" })),
        ratings: Array(20)
          .fill(null)
          .map(() => ({ note: 2, createdAt: now })),
      } as any);

      const score = await ZupDriveDriverRatingService.getReputationScore(mockChauffeurId);

      expect(score.recommendations.length).toBeGreaterThan(0);
      expect(score.recommendations.some((r) => r.toLowerCase().includes("améliore"))).toBe(
        true
      );
    });

    it("devrait encourager les chauffeurs excellents", async () => {
      const now = new Date();

      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce({
        id: mockChauffeurId,
        rating: 4.9,
        courses: Array(200)
          .fill(null)
          .map(() => ({ statut: "COMPLETED" })),
        ratings: Array(100)
          .fill(null)
          .map(() => ({ note: 5, createdAt: now })),
      } as any);

      const score = await ZupDriveDriverRatingService.getReputationScore(mockChauffeurId);

      expect(score.recommendations.some((r) => r.includes("élite"))).toBe(true);
    });
  });
});
