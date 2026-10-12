import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  backup: {
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
};
jest.mock("../../../services/db", () => ({ db }));

import { BackupService } from "../backup.service";

describe("contrat des archives complètes A08", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    db.backup.findUnique.mockResolvedValue({
      id: "archive-a08",
      name: "base-distant-20261012.sql.gz.age",
      status: "COMPLETED",
      filePath: "/srv/sauvegardes/base-20261012.sql.gz.age",
    });
  });

  it("refuse téléchargement, restauration et suppression par les routes d'exports partiels", async () => {
    const attendu = { code: "BACKUP_MANAGED_EXTERNALLY" };
    await expect(BackupService.read("archive-a08")).rejects.toMatchObject(attendu);
    await expect(BackupService.readEncrypted("archive-a08")).rejects.toMatchObject(attendu);
    await expect(BackupService.restore("archive-a08")).rejects.toMatchObject(attendu);
    await expect(BackupService.remove("archive-a08")).rejects.toMatchObject(attendu);
    expect(db.backup.delete).not.toHaveBeenCalled();
  });
});
