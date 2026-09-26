import { describe, expect, it, jest } from "@jest/globals";
import { MulterError } from "multer";

jest.mock("../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { errorHandler } from "../errorHandler";

function reponse() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

const req: any = { path: "/api/drivers/deliveries/c1/photo", method: "POST" };

describe("errorHandler et les fichiers refusés", () => {
  it("répond 413 avec un message clair pour une photo trop lourde", () => {
    const res = reponse();
    errorHandler(new MulterError("LIMIT_FILE_SIZE", "photo"), req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "LIMIT_FILE_SIZE", error: expect.stringContaining("trop lourd") })
    );
  });

  it("répond 400 pour un fichier envoyé sous un autre champ", () => {
    const res = reponse();
    errorHandler(new MulterError("LIMIT_UNEXPECTED_FILE", "fichier"), req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
