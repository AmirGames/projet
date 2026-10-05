import { describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

jest.mock("../../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { errorHandler } from "../../../middleware/errorHandler";
import { uploadMiddleware } from "../file-upload.middleware";

const app = express();
app.post("/upload", uploadMiddleware.single("file"), (req: express.Request, res: express.Response) => {
  res.json({ mimetype: req.file?.mimetype, size: req.file?.size });
});
app.use(errorHandler);

const jpeg = (taille = 1024) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(taille - 4)]);
const pdf = (taille: number) => Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(taille - 9)]);

const envoyer = (contenu: Buffer, nom: string, type: string) =>
  request(app).post("/upload").attach("file", contenu, { filename: nom, contentType: type });

describe("upload : contrôle du contenu réel", () => {
  it("refuse une extension exécutable et une double extension", async () => {
    expect((await envoyer(jpeg(), "photo.exe", "image/jpeg")).body.code).toBe("INVALID_FILE_EXTENSION");
    expect((await envoyer(jpeg(), "photo.exe.jpg", "image/jpeg")).body.code).toBe("INVALID_FILE_EXTENSION");
  });
  it("refuse une archive renommée et un ZIP", async () => {
    expect((await envoyer(Buffer.from("PK\x03\x04zip"), "photo.jpg", "image/jpeg")).status).toBe(400);
    expect((await envoyer(Buffer.from("PK\x03\x04zip"), "archive.zip", "application/zip")).status).toBe(400);
  });
  it("refuse un HTML renommé en .jpg déclaré image/jpeg", async () => {
    const res = await envoyer(Buffer.from("<html><script>alert(1)</script></html>"), "x.jpg", "image/jpeg");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_FILE_TYPE");
    expect(res.body.error).toBe("Type de fichier non autorisé. Utilisez JPG, PNG, WebP ou PDF.");
  });

  it("accepte un vrai JPEG", async () => {
    const res = await envoyer(jpeg(), "photo.jpg", "image/jpeg");
    expect(res.status).toBe(200);
    expect(res.body.mimetype).toBe("image/jpeg");
  });

  it("refuse un vrai JPEG déclaré comme PDF", async () => {
    const res = await envoyer(jpeg(), "photo.pdf", "application/pdf");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_FILE_TYPE");
  });

  it("refuse une image de 3 Mo", async () => {
    const res = await envoyer(jpeg(3 * 1024 * 1024), "grosse.jpg", "image/jpeg");
    expect([400, 413]).toContain(res.status);
    expect(res.status).toBe(413);
  });

  it("accepte un PDF de 3 Mo mais refuse 6 Mo", async () => {
    expect((await envoyer(pdf(3 * 1024 * 1024), "a.pdf", "application/pdf")).status).toBe(200);
    expect((await envoyer(pdf(6 * 1024 * 1024), "b.pdf", "application/pdf")).status).toBe(413);
  });
});
