/**
 * Tests: Driver Rating & Reputation System
 *
 * La moyenne d'un chauffeur vient de NoteCourseDrive (notes des passagers) ;
 * RatingCourseDrive ne porte que le détail par catégorie.
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
    noteCourseDrive: {
      groupBy: jest.fn(),
    },
    chauffeurDrive: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

/** Résultat Prisma partiel : seuls les champs lus par le scénario sont fournis. */
function partiel<T>(valeur: object): T {
  return valeur as unknown as T;
}

describe("ZupDriveDriverRatingService", () => {
  const mockChauffeurId = "chauffeur-123";
  const mockPassengerId = "passenger-456";
  const mockCourseId = "course-789";

  const donneesNote = {
    chauffeurId: mockChauffeurId,
    passengerId: mockPassengerId,
    courseId: mockCourseId,
    rating: 5 as const,
  };

  /** Un chauffeur tel que lu par getReputationScore : courses et notes des passagers. */
  function chauffeurAvec(statuts: string[], notes: number[]) {
    const now = new Date();
    return partiel<never>({
      id: mockChauffeurId,
      courses: statuts.map((statut) => ({ id: "c", statut })),
      notes: notes.map((note) => ({ note, createdAt: now })),
    });
  }
  const repete = <T>(n: number, valeur: T): T[] => Array(n).fill(valeur);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("submitRating", () => {
    it("devrait créer un rating pour une course terminée", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce(
        partiel<never>({ statut: "TERMINEE", passagerId: mockPassengerId, chauffeurId: mockChauffeurId })
      );
      jest.mocked(db.ratingCourseDrive.findFirst).mockResolvedValueOnce(null);
      jest.mocked(db.ratingCourseDrive.create).mockResolvedValueOnce(partiel<never>({ id: "rating-1" }));

      await ZupDriveDriverRatingService.submitRating({
        ...donneesNote,
        comment: "Excellent driver!",
        categories: { cleanliness: 5, driving: 4 },
        tags: ["friendly"],
      });

      expect(db.ratingCourseDrive.findFirst).toHaveBeenCalledWith({
        where: { courseId: mockCourseId, passengerId: mockPassengerId },
      });
      expect(db.ratingCourseDrive.create).toHaveBeenCalledWith({
        data: {
          courseId: mockCourseId,
          chauffeurId: mockChauffeurId,
          passengerId: mockPassengerId,
          rating: 5,
          comment: "Excellent driver!",
          cleanliness: 5,
          driving: 4,
          communication: undefined,
          comfort: undefined,
          tags: ["friendly"],
        },
      });
    });

    it("devrait rejeter si course n'existe pas", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce(null);

      await expect(
        ZupDriveDriverRatingService.submitRating({ ...donneesNote, courseId: "invalid" })
      ).rejects.toThrow("Course non trouvée");
      expect(db.ratingCourseDrive.create).not.toHaveBeenCalled();
    });

    it("devrait rejeter si course n'est pas terminée", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce(
        partiel<never>({ statut: "EN_COURS", passagerId: mockPassengerId, chauffeurId: mockChauffeurId })
      );

      await expect(ZupDriveDriverRatingService.submitRating(donneesNote)).rejects.toThrow(
        "Peut noter que les courses complétées"
      );
      expect(db.ratingCourseDrive.create).not.toHaveBeenCalled();
    });

    it("devrait rejeter si l'auteur n'est pas le passager de la course", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce(
        partiel<never>({ statut: "TERMINEE", passagerId: "autre-passager", chauffeurId: mockChauffeurId })
      );

      await expect(ZupDriveDriverRatingService.submitRating(donneesNote)).rejects.toThrow(
        "Seul le passager peut noter"
      );
      expect(db.ratingCourseDrive.create).not.toHaveBeenCalled();
    });

    it("devrait rejeter si le chauffeur envoyé diffère de celui de la course", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce(
        partiel<never>({ statut: "TERMINEE", passagerId: mockPassengerId, chauffeurId: "vrai-chauffeur" })
      );

      await expect(ZupDriveDriverRatingService.submitRating(donneesNote)).rejects.toThrow(
        "Chauffeur invalide pour cette course"
      );
      expect(db.ratingCourseDrive.create).not.toHaveBeenCalled();
    });

    it("devrait rejeter si la course n'a pas de chauffeur", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce(
        partiel<never>({ statut: "TERMINEE", passagerId: mockPassengerId, chauffeurId: null })
      );

      await expect(ZupDriveDriverRatingService.submitRating(donneesNote)).rejects.toThrow(
        "Chauffeur invalide pour cette course"
      );
      expect(db.ratingCourseDrive.create).not.toHaveBeenCalled();
    });

    it("devrait rejeter si déjà noté", async () => {
      jest.mocked(db.courseDrive.findUnique).mockResolvedValueOnce(
        partiel<never>({ statut: "TERMINEE", passagerId: mockPassengerId, chauffeurId: mockChauffeurId })
      );
      jest.mocked(db.ratingCourseDrive.findFirst).mockResolvedValueOnce(partiel<never>({ id: "existing-rating" }));

      await expect(ZupDriveDriverRatingService.submitRating(donneesNote)).rejects.toThrow("Vous avez déjà noté");
      expect(db.ratingCourseDrive.create).not.toHaveBeenCalled();
    });
  });

  describe("getReputationScore", () => {
    it("devrait refuser un chauffeur inconnu", async () => {
      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce(null);

      await expect(ZupDriveDriverRatingService.getReputationScore("inconnu")).rejects.toThrow(
        "Chauffeur non trouvé"
      );
    });

    it("devrait lire la moyenne dans les notes des passagers (NoteCourseDrive)", async () => {
      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce(chauffeurAvec(["TERMINEE"], [5, 4, 4]));

      const score = await ZupDriveDriverRatingService.getReputationScore(mockChauffeurId);

      expect(db.chauffeurDrive.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            notes: expect.objectContaining({ where: { auteur: "PASSAGER" } }),
          }),
        })
      );
      expect(score.averageRating).toBe(4.33);
      expect(score.totalRatings).toBe(3);
    });

    it("devrait calculer EXCELLENT pour un chauffeur avec 4.8+ stars", async () => {
      // 49 notes de 5 et une de 4 : moyenne 4.98
      jest
        .mocked(db.chauffeurDrive.findUnique)
        .mockResolvedValueOnce(chauffeurAvec(repete(100, "TERMINEE"), [...repete(49, 5), 4]));

      const score = await ZupDriveDriverRatingService.getReputationScore(mockChauffeurId);

      expect(score.averageRating).toBe(4.98);
      expect(score.reputationLevel).toBe("EXCELLENT");
      expect(score.reputationScore).toBeGreaterThanOrEqual(90);
    });

    it("devrait calculer POOR pour un chauffeur avec <2.0 stars", async () => {
      // Note 1 (entier) et 75% d'annulations : 8 + 7.5 + 7.5 = 23
      jest
        .mocked(db.chauffeurDrive.findUnique)
        .mockResolvedValueOnce(chauffeurAvec([...repete(10, "TERMINEE"), ...repete(30, "ANNULEE")], repete(20, 1)));

      const score = await ZupDriveDriverRatingService.getReputationScore(mockChauffeurId);

      expect(score.averageRating).toBe(1);
      expect(score.reputationLevel).toBe("POOR");
      expect(score.reputationScore).toBeLessThan(50);
    });

    it("devrait pénaliser un haut taux d'annulation", async () => {
      jest
        .mocked(db.chauffeurDrive.findUnique)
        .mockResolvedValueOnce(chauffeurAvec([...repete(10, "TERMINEE"), ...repete(30, "ANNULEE")], repete(10, 4)));

      const score = await ZupDriveDriverRatingService.getReputationScore(mockChauffeurId);

      expect(score.cancellationRate).toBe(75);
      expect(score.completionRate).toBe(25);
      expect(score.reputationScore).toBeLessThan(70);
    });

    it("ne confond pas les statuts historiques avec TERMINEE/ANNULEE", async () => {
      jest
        .mocked(db.chauffeurDrive.findUnique)
        .mockResolvedValueOnce(chauffeurAvec([...repete(5, "COMPLETED"), ...repete(5, "CANCELLED")], [5]));

      const score = await ZupDriveDriverRatingService.getReputationScore(mockChauffeurId);

      expect(score.completionRate).toBe(0);
      expect(score.cancellationRate).toBe(0);
    });

    it("devrait générer le badge TOP_RATED (4.8+ avec 50+ notes) sans PROFESSIONAL (100+ notes)", async () => {
      jest
        .mocked(db.chauffeurDrive.findUnique)
        .mockResolvedValueOnce(chauffeurAvec(repete(100, "TERMINEE"), repete(60, 5)));

      const score = await ZupDriveDriverRatingService.getReputationScore(mockChauffeurId);

      expect(score.badges).toContain("TOP_RATED");
      expect(score.badges).not.toContain("PROFESSIONAL");
    });

    it("devrait générer le badge PROFESSIONAL (4.0+ avec 100+ notes)", async () => {
      jest
        .mocked(db.chauffeurDrive.findUnique)
        .mockResolvedValueOnce(chauffeurAvec(repete(100, "TERMINEE"), repete(100, 4)));

      const score = await ZupDriveDriverRatingService.getReputationScore(mockChauffeurId);

      expect(score.badges).toContain("PROFESSIONAL");
    });

    it("devrait générer les badges CONSISTENT et EXPERIENCED", async () => {
      jest
        .mocked(db.chauffeurDrive.findUnique)
        .mockResolvedValueOnce(chauffeurAvec(repete(500, "TERMINEE"), repete(30, 4)));

      const score = await ZupDriveDriverRatingService.getReputationScore(mockChauffeurId);

      expect(score.badges).toContain("CONSISTENT");
      expect(score.badges).toContain("EXPERIENCED");
    });

    it("devrait calculer correctement la distribution des notes", async () => {
      jest
        .mocked(db.chauffeurDrive.findUnique)
        .mockResolvedValueOnce(chauffeurAvec(repete(10, "TERMINEE"), [5, 5, 5, 4, 4, 3, 2, 1]));

      const score = await ZupDriveDriverRatingService.getReputationScore(mockChauffeurId);

      expect(score.ratingDistribution).toEqual({ fiveStar: 3, fourStar: 2, threeStar: 1, twoStar: 1, oneStar: 1 });
      expect(score.totalRatings).toBe(8);
    });

    it("devrait recommander l'amélioration si faible rating", async () => {
      jest.mocked(db.chauffeurDrive.findUnique).mockResolvedValueOnce(chauffeurAvec(repete(50, "TERMINEE"), repete(20, 2)));

      const score = await ZupDriveDriverRatingService.getReputationScore(mockChauffeurId);

      expect(score.recommendations.some((r) => r.toLowerCase().includes("améliorez"))).toBe(true);
    });

    it("devrait encourager les chauffeurs excellents", async () => {
      jest
        .mocked(db.chauffeurDrive.findUnique)
        .mockResolvedValueOnce(chauffeurAvec(repete(200, "TERMINEE"), repete(100, 5)));

      const score = await ZupDriveDriverRatingService.getReputationScore(mockChauffeurId);

      expect(score.recommendations.some((r) => r.includes("élite"))).toBe(true);
    });
  });

  describe("getReviews", () => {
    it("devrait retourner les avis, en masquant le passager des notations anonymes", async () => {
      jest.mocked(db.ratingCourseDrive.findMany).mockResolvedValueOnce(
        partiel<never>([
          { id: "review-1", rating: 5, anonymous: false, passenger: { id: "p1", name: "Alice" } },
          { id: "review-2", rating: 4, anonymous: true, passenger: { id: "p2", name: "Bob" } },
        ])
      );

      const result = await ZupDriveDriverRatingService.getReviews(mockChauffeurId, 10, 0);

      expect(result).toHaveLength(2);
      expect(result[0].passenger).toEqual({ id: "p1", name: "Alice" });
      expect(result[1].passenger).toBeNull();
      expect(db.ratingCourseDrive.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { chauffeurId: mockChauffeurId },
          orderBy: { createdAt: "desc" },
          take: 10,
          skip: 0,
        })
      );
    });

    it("devrait supporter le tri par note la plus élevée", async () => {
      jest.mocked(db.ratingCourseDrive.findMany).mockResolvedValueOnce([]);

      await ZupDriveDriverRatingService.getReviews(mockChauffeurId, 10, 0, "highest");

      expect(db.ratingCourseDrive.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { rating: "desc" } })
      );
    });

    it("devrait supporter le tri par note la plus basse", async () => {
      jest.mocked(db.ratingCourseDrive.findMany).mockResolvedValueOnce([]);

      await ZupDriveDriverRatingService.getReviews(mockChauffeurId, 10, 0, "lowest");

      expect(db.ratingCourseDrive.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { rating: "asc" } })
      );
    });
  });

  describe("classements (moyenne des notes des passagers)", () => {
    it("getTopRatedDrivers : moyenne >= 4.5 depuis NoteCourseDrive, détails du chauffeur joints", async () => {
      jest.mocked(db.noteCourseDrive.groupBy).mockResolvedValueOnce(
        partiel<never>([
          { chauffeurId: "c1", _avg: { note: 4.876 }, _count: { _all: 12 } },
          { chauffeurId: "c-supprime", _avg: { note: 4.6 }, _count: { _all: 3 } },
        ])
      );
      jest.mocked(db.chauffeurDrive.findMany).mockResolvedValueOnce(
        partiel<never>([{ id: "c1", nomComplet: "Jean", region: "BRUXELLES", _count: { courses: 40 } }])
      );

      const result = await ZupDriveDriverRatingService.getTopRatedDrivers(5);

      expect(db.noteCourseDrive.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { auteur: "PASSAGER" },
          having: { note: { _avg: { gte: 4.5 } } },
          orderBy: { _avg: { note: "desc" } },
          take: 5,
        })
      );
      expect(result).toEqual([
        { id: "c1", nomComplet: "Jean", region: "BRUXELLES", averageRating: 4.88, totalRatings: 12, totalCourses: 40 },
      ]);
    });

    it("getDriversNeedingImprovement : moyenne < 3.5, statut NEEDS_IMPROVEMENT", async () => {
      jest.mocked(db.noteCourseDrive.groupBy).mockResolvedValueOnce(
        partiel<never>([{ chauffeurId: "c2", _avg: { note: 2.5 }, _count: { _all: 8 } }])
      );
      jest.mocked(db.chauffeurDrive.findMany).mockResolvedValueOnce(
        partiel<never>([{ id: "c2", nomComplet: "Paul", region: "WALLONIE", _count: { courses: 20 } }])
      );

      const result = await ZupDriveDriverRatingService.getDriversNeedingImprovement(5);

      expect(db.noteCourseDrive.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { auteur: "PASSAGER" },
          having: { note: { _avg: { lt: 3.5 } } },
          orderBy: { _avg: { note: "asc" } },
        })
      );
      expect(result).toEqual([
        { id: "c2", nomComplet: "Paul", averageRating: 2.5, totalRatings: 8, status: "NEEDS_IMPROVEMENT" },
      ]);
    });
  });
});
