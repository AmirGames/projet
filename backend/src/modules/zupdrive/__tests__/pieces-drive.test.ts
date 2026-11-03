import { describe, expect, it } from "@jest/globals";
import { ApiError } from "../../../middleware/api-error";
import { dateExpirationDeposee } from "../pieces-drive";

describe("échéance civile d'une pièce taxi", () => {
  it("garde le dernier jour saisi valide jusqu'à 23:59 à Bruxelles", () => {
    const expiration = dateExpirationDeposee("certificat_capacite", "2027-03-31");
    expect(expiration).not.toBeNull();
    expect(expiration!.getTime()).toBeGreaterThan(Date.now());

    const parties = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Brussels",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(expiration!);
    const lues = Object.fromEntries(parties.map(({ type, value }) => [type, value]));
    expect(lues).toMatchObject({ year: "2027", month: "03", day: "31", hour: "23", minute: "59", second: "59" });
  });

  it("refuse une date civile impossible", () => {
    try {
      dateExpirationDeposee("licence", "2027-02-31");
      throw new Error("La date impossible aurait dû être refusée");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ statusCode: 400, code: "INVALID_EXPIRY_DATE" });
    }
  });
});
