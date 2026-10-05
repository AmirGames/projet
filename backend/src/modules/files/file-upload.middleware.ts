import multer from "multer";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ApiError } from "../../middleware/errorHandler";
import { detecterType, normaliserTypeAnnonce, type TypeFichier } from "../../utils/file-type";
import { extname } from "node:path";

const MESSAGE_TYPE = "Type de fichier non autorisé. Utilisez JPG, PNG, WebP ou PDF.";

const MO = 1024 * 1024;

/** Taille maximale par type, contrôlée une fois le vrai type connu. */
export const TAILLE_MAX: Record<TypeFichier, number> = {
  "image/jpeg": 2 * MO,
  "image/png": 2 * MO,
  "image/webp": 2 * MO,
  "application/pdf": 5 * MO,
};

// Multer voit passer le fichier avant qu'on en connaisse le type : sa limite
// est le maximum, le contrôle par type vient ensuite.
const MAX_FILE_SIZE = Math.max(...Object.values(TAILLE_MAX));

const multerBase = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 5, fields: 20, parts: 25, fieldSize: 64 * 1024 },
});

/**
 * Après Multer : le contenu réel doit être un type autorisé, égal au type
 * déclaré, et tenir dans la limite de ce type. Le type détecté remplace celui
 * du client.
 */
export function verifierContenu(req: Request, _res: Response, next: NextFunction) {
  const fichiers: Express.Multer.File[] = [];
  if (req.file) fichiers.push(req.file);
  if (Array.isArray(req.files)) fichiers.push(...req.files);
  else if (req.files) fichiers.push(...Object.values(req.files).flat());

  for (const fichier of fichiers) {
    const detecte = detecterType(fichier.buffer);
    if (!detecte || normaliserTypeAnnonce(fichier.mimetype) !== detecte) {
      return next(new ApiError(400, MESSAGE_TYPE, "INVALID_FILE_TYPE"));
    }
    const extensions: Record<TypeFichier, string[]> = {
      "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"],
      "image/webp": [".webp"], "application/pdf": [".pdf"],
    };
    if (!extensions[detecte].includes(extname(fichier.originalname).toLowerCase()) || /\.(?:exe|com|bat|cmd|scr|js|mjs|php|sh|ps1|dll|zip|rar|7z|tar|gz)(?:\.|$)/i.test(fichier.originalname)) {
      return next(new ApiError(400, MESSAGE_TYPE, "INVALID_FILE_EXTENSION"));
    }
    if (fichier.size > TAILLE_MAX[detecte]) {
      const limite = TAILLE_MAX[detecte] / MO;
      return next(
        new ApiError(413, `Fichier trop lourd : ${limite} Mo maximum pour ce type.`, "LIMIT_FILE_SIZE")
      );
    }
    fichier.mimetype = detecte;
  }
  next();
}

/** Mêmes méthodes que Multer ; chacune renvoie Multer suivi du contrôle du contenu. */
export const uploadMiddleware = {
  single: (champ: string): RequestHandler[] => [multerBase.single(champ), verifierContenu],
  array: (champ: string, max?: number): RequestHandler[] => [multerBase.array(champ, max), verifierContenu],
};
