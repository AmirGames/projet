import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = { courier: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() } };

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../realtime/socket", () => ({ emitNotification: jest.fn() }));
jest.mock("../../files/file-upload.service", () => ({ FileUploadService: { uploadDocument: jest.fn() } }));
jest.mock("../../notifications/notification.service", () => ({ notifierPlateforme: jest.fn() }));
jest.mock("../../files/fichiers-prives.service", () => ({ cheminRelatif: jest.fn() }));

import { DriverApprovalService } from "../driver-approval.service";

describe("contrôle BCE des livreurs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.courier.findUnique.mockResolvedValue({ id: "driver-1", bceNumber: "0123456749", updatedAt: new Date("2026-10-22T11:00:00Z") });
    db.courier.updateMany.mockResolvedValue({ count: 1 });
  });

  it("enregistre le contrôle humain, l'opérateur et sa date", async () => {
    await DriverApprovalService.examinerBce("driver-1", "admin-1", { status: "VERIFIED" });
    expect(db.courier.updateMany).toHaveBeenCalledWith({
      where: { id: "driver-1", updatedAt: new Date("2026-10-22T11:00:00Z") },
      data: expect.objectContaining({
        bceStatus: "VERIFIED",
        bceReviewedAt: expect.any(Date),
        bceReviewedBy: "admin-1",
        bceReviewReason: null,
      }),
    });
  });

  it("exige un motif pour refuser l'inscription BCE", async () => {
    await expect(DriverApprovalService.examinerBce("driver-1", "admin-1", { status: "REJECTED" }))
      .rejects.toMatchObject({ code: "BCE_REJECTION_REASON_REQUIRED" });
    expect(db.courier.updateMany).not.toHaveBeenCalled();
  });

  it("n'assimile pas le format à une vérification du registre", async () => {
    const dossier = jest.spyOn(DriverApprovalService, "dossier").mockResolvedValue({
      bceStatus: "PENDING",
      dossierComplet: true,
      piecesManquantes: [],
    } as any);
    await expect(DriverApprovalService.valider("driver-1", "admin-1"))
      .rejects.toMatchObject({ code: "BCE_NOT_VERIFIED" });
    expect(db.courier.updateMany).not.toHaveBeenCalled();
    dossier.mockRestore();
  });
});
