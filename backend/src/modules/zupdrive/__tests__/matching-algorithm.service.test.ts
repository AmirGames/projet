import { db } from "../../../services/db";
import { MatchingAlgorithmService } from "../matching-algorithm.service";

describe("MatchingAlgorithmService", () => {
  describe("scoreDriver", () => {
    it("should score a driver based on multiple criteria", () => {
      const metrics = {
        id: "driver-1",
        totalTrips: 100,
        acceptedTrips: 90,
        acceptanceRate: 0.9,
        avgRating: 4.8,
        latitude: 50.8505,
        longitude: 4.3488,
        distanceKm: 5.0, // 5 km away
      };

      const score = MatchingAlgorithmService.scoreDriver(metrics);

      expect(score.driverId).toBe("driver-1");
      expect(score.score).toBeGreaterThan(0);
      expect(score.score).toBeLessThanOrEqual(100);

      // Check breakdown
      expect(score.breakdown.distanceScore).toBeGreaterThan(0); // Closer is better
      expect(score.breakdown.ratingScore).toBeGreaterThan(0); // High rating
      expect(score.breakdown.acceptanceScore).toBeGreaterThan(0); // Good acceptance rate
      expect(score.eta).toBeGreaterThan(0); // ETA in seconds

      // Score should be sum of breakdown
      const totalBreakdown =
        score.breakdown.distanceScore +
        score.breakdown.ratingScore +
        score.breakdown.etaScore +
        score.breakdown.acceptanceScore;
      expect(score.score).toBe(Math.round(totalBreakdown * 10) / 10);
    });

    it("should score closer drivers higher", () => {
      const close = {
        id: "driver-close",
        totalTrips: 50,
        acceptedTrips: 40,
        acceptanceRate: 0.8,
        avgRating: 4.0,
        latitude: 50.8505,
        longitude: 4.3488,
        distanceKm: 1.0,
      };

      const far = {
        id: "driver-far",
        totalTrips: 50,
        acceptedTrips: 40,
        acceptanceRate: 0.8,
        avgRating: 4.0,
        latitude: 50.8505,
        longitude: 4.3488,
        distanceKm: 10.0,
      };

      const closeScore = MatchingAlgorithmService.scoreDriver(close);
      const farScore = MatchingAlgorithmService.scoreDriver(far);

      expect(closeScore.score).toBeGreaterThan(farScore.score);
    });

    it("should score higher-rated drivers higher", () => {
      const highRating = {
        id: "driver-high",
        totalTrips: 50,
        acceptedTrips: 40,
        acceptanceRate: 0.8,
        avgRating: 5.0,
        latitude: 50.8505,
        longitude: 4.3488,
        distanceKm: 5.0,
      };

      const lowRating = {
        id: "driver-low",
        totalTrips: 50,
        acceptedTrips: 40,
        acceptanceRate: 0.8,
        avgRating: 2.0,
        latitude: 50.8505,
        longitude: 4.3488,
        distanceKm: 5.0,
      };

      const highScore = MatchingAlgorithmService.scoreDriver(highRating);
      const lowScore = MatchingAlgorithmService.scoreDriver(lowRating);

      expect(highScore.score).toBeGreaterThan(lowScore.score);
    });

    it("should score drivers with better acceptance rate higher", () => {
      const goodAcceptance = {
        id: "driver-good",
        totalTrips: 100,
        acceptedTrips: 95,
        acceptanceRate: 0.95,
        avgRating: 4.0,
        latitude: 50.8505,
        longitude: 4.3488,
        distanceKm: 5.0,
      };

      const poorAcceptance = {
        id: "driver-poor",
        totalTrips: 100,
        acceptedTrips: 50,
        acceptanceRate: 0.5,
        avgRating: 4.0,
        latitude: 50.8505,
        longitude: 4.3488,
        distanceKm: 5.0,
      };

      const goodScore = MatchingAlgorithmService.scoreDriver(goodAcceptance);
      const poorScore = MatchingAlgorithmService.scoreDriver(poorAcceptance);

      expect(goodScore.score).toBeGreaterThan(poorScore.score);
    });
  });

  describe("calculateSurgePricing", () => {
    it("should return 1.0 for low demand", async () => {
      jest.spyOn(db.courseDrive, "count").mockResolvedValueOnce(5 as any); // 5 trips
      jest.spyOn(db.chauffeurDrive, "count").mockResolvedValueOnce(20 as any); // 20 drivers online
      // Ratio = 5/20 = 0.25 < 0.5 = no surge

      const surge = await MatchingAlgorithmService.calculateSurgePricing("BRUXELLES");

      expect(surge).toBe(1.0);
    });

    it("should return 1.2 for moderate demand", async () => {
      jest.spyOn(db.courseDrive, "count").mockResolvedValueOnce(10 as any); // 10 trips
      jest.spyOn(db.chauffeurDrive, "count").mockResolvedValueOnce(15 as any); // 15 drivers online
      // Ratio = 10/15 = 0.67, between 0.5-1.0 = 1.2x surge

      const surge = await MatchingAlgorithmService.calculateSurgePricing("BRUXELLES");

      expect(surge).toBe(1.2);
    });

    it("should return 1.5 for high demand", async () => {
      jest.spyOn(db.courseDrive, "count").mockResolvedValueOnce(15 as any); // 15 trips
      jest.spyOn(db.chauffeurDrive, "count").mockResolvedValueOnce(12 as any); // 12 drivers online
      // Ratio = 15/12 = 1.25, between 1.0-1.5 = 1.5x surge

      const surge = await MatchingAlgorithmService.calculateSurgePricing("BRUXELLES");

      expect(surge).toBe(1.5);
    });

    it("should return 2.5 for extreme demand", async () => {
      jest.spyOn(db.courseDrive, "count").mockResolvedValueOnce(50 as any); // 50 trips
      jest.spyOn(db.chauffeurDrive, "count").mockResolvedValueOnce(10 as any); // 10 drivers online
      // Ratio = 50/10 = 5 > 2.0 = 2.5x surge (extreme)

      const surge = await MatchingAlgorithmService.calculateSurgePricing("BRUXELLES");

      expect(surge).toBe(2.5);
    });

    it("should handle zero drivers gracefully", async () => {
      jest.spyOn(db.courseDrive, "count").mockResolvedValueOnce(10 as any);
      jest.spyOn(db.chauffeurDrive, "count").mockResolvedValueOnce(0 as any); // No drivers

      const surge = await MatchingAlgorithmService.calculateSurgePricing("BRUXELLES");

      // Should return minimum or default value, not Infinity
      expect(Number.isFinite(surge)).toBe(true);
    });
  });

  describe("scoring weights", () => {
    it("should verify component weights sum to 100%", () => {
      const metrics = {
        id: "driver-1",
        totalTrips: 100,
        acceptedTrips: 90,
        acceptanceRate: 0.9,
        avgRating: 4.8,
        latitude: 50.8505,
        longitude: 4.3488,
        distanceKm: 5.0,
      };

      const score = MatchingAlgorithmService.scoreDriver(metrics);
      const { distanceScore, ratingScore, etaScore, acceptanceScore } = score.breakdown;

      // Weights: distance 40%, rating 30%, ETA 20%, acceptance 10%
      const total = distanceScore + ratingScore + etaScore + acceptanceScore;

      // Should approximate 100 (with small floating-point tolerance)
      expect(total).toBeCloseTo(100, 0);
    });
  });
});
