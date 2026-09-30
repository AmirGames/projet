import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../auth/auth.middleware";
import { uploadMiddleware } from "../files/file-upload.middleware";
import { presenter } from "../files/fichiers-prives.service";
import {
  ChauffeurOnboardingService,
  REGIONS,
  TYPES_PIECE,
  libelleDeLaPiece,
} from "./chauffeur-onboarding.service";

/**
 * /api/zupdrive/chauffeur — le dossier du chauffeur connecté
 * (driver.zupdrive.com).
 *
 * Aucune route ne prend d'identifiant de dossier : le dossier est toujours
 * celui du compte de la session. Impossible de lire ou modifier celui d'un
 * autre en changeant un paramètre.
 */
const router = Router();

router.use(authMiddleware);

const texte = (max: number) => z.string().trim().max(max).nullable().optional();

export const profilSchema = z
  .object({
    nomComplet: z.string().trim().min(2, "Indiquez votre nom complet").max(120).optional(),
    telephone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ().-]{8,20}$/, "Numéro de téléphone invalide")
      .nullable()
      .optional(),
    region: z.enum(REGIONS).nullable().optional(),
    numeroEntreprise: texte(20),
    raisonSociale: texte(160),
    numeroLicence: texte(60),
    vehiculeMarque: texte(60),
    vehiculeModele: texte(60),
    vehiculePlaque: texte(15),
  })
  .strict();

/** Le dossier tel que le chauffeur le voit : pièces en adresses signées. */
export function presenterDossier(dossier: Awaited<ReturnType<typeof ChauffeurOnboardingService.dossier>>) {
  return {
    ...dossier,
    piecesExigees: dossier.piecesExigees.map((type) => ({ type, libelle: libelleDeLaPiece(type) })),
    documents: dossier.documents.map((piece) => ({
      ...piece,
      // Une nouvelle version déposée alors qu'une autre est encore en vigueur.
      renouvellement:
        (piece.statut === "PENDING" || piece.statut === "REJECTED") &&
        dossier.documents.some(
          (autre) => autre.type === piece.type && (autre.statut === "APPROVED" || autre.statut === "EXPIRED")
        ),
      libelle: libelleDeLaPiece(piece.type),
      url: presenter(piece.url),
    })),
  };
}

// GET /api/zupdrive/chauffeur/me — le dossier, ou null s'il n'est pas commencé
router.get("/me", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dossier = await ChauffeurOnboardingService.monDossier(req.userId as string);
    res.json({ success: true, data: dossier ? presenterDossier(dossier) : null });
  } catch (err) {
    next(err);
  }
});

// POST /api/zupdrive/chauffeur/me — ouvrir le dossier (idempotent)
router.post("/me", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profil = profilSchema.parse(req.body ?? {});
    const dossier = await ChauffeurOnboardingService.commencer(req.userId as string, profil);
    res.status(201).json({ success: true, data: presenterDossier(dossier!) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/zupdrive/chauffeur/me — compléter le profil (brouillon ou refusé)
router.patch("/me", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profil = profilSchema.parse(req.body ?? {});
    const dossier = await ChauffeurOnboardingService.modifier(req.userId as string, profil);
    res.json({ success: true, data: presenterDossier(dossier!) });
  } catch (err) {
    next(err);
  }
});

// POST /api/zupdrive/chauffeur/me/documents — déposer une pièce (multipart « file »)
router.post(
  "/me/documents",
  uploadMiddleware.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new ApiError(400, "Aucun fichier fourni", "NO_FILE");

      const body = z
        .object({
          type: z.enum(TYPES_PIECE),
          dateExpiration: z.string().max(40).nullable().optional(),
        })
        .parse(req.body);

      const piece = await ChauffeurOnboardingService.deposerPiece(req.userId as string, {
        type: body.type,
        file: req.file.buffer,
        mimeType: req.file.mimetype,
        dateExpiration: body.dateExpiration,
      });

      res.status(201).json({
        success: true,
        message: `${libelleDeLaPiece(piece.type)} déposée, en attente de validation`,
        data: { ...piece, libelle: libelleDeLaPiece(piece.type), url: presenter(piece.url) },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/zupdrive/chauffeur/me/submit — envoyer le dossier à l'équipe ZupDrive
router.post("/me/submit", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dossier = await ChauffeurOnboardingService.soumettre(req.userId as string);
    res.json({ success: true, data: presenterDossier(dossier!) });
  } catch (err) {
    next(err);
  }
});

export default router;
