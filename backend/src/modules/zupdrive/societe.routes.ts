import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ApiError } from "../../middleware/errorHandler";
import { limiterCadence } from "../../middleware/throttle";
import { authMiddleware } from "../auth/auth.middleware";
import { uploadMiddleware } from "../files/file-upload.middleware";
import { presenter } from "../files/fichiers-prives.service";
import { REGIONS, TYPES_PIECE, libelleDeLaPiece } from "./chauffeur-onboarding.service";
import { SocieteDriveService } from "./societe-drive.service";

/**
 * /api/zupdrive/societe — la société ZupDrive du compte connecté, dont il est
 * le gérant (futur manager.zupdrive.com).
 *
 * Aucune route ne prend d'identifiant de société : c'est toujours celle du
 * compte de la session. Un véhicule, un chauffeur ou une invitation d'une
 * autre société répond 404, quel que soit l'identifiant envoyé.
 */
const router = Router();

router.use(authMiddleware);

const idSchema = z.string().min(1).max(64);
const texte = (max: number) => z.string().trim().max(max).nullable().optional();

export const profilSocieteSchema = z
  .object({
    raisonSociale: z.string().trim().min(2, "Indiquez la raison sociale").max(160).optional(),
    numeroEntreprise: texte(20),
    region: z.enum(REGIONS).nullable().optional(),
    telephone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ().-]{8,20}$/, "Numéro de téléphone invalide")
      .nullable()
      .optional(),
  })
  .strict();

const vehiculeSchema = z
  .object({
    marque: z.string().trim().min(1).max(60),
    modele: z.string().trim().min(1).max(60),
    plaque: z.string().trim().min(2).max(20),
    numeroLicence: texte(60),
  })
  .strict();

const pieceSchema = z.object({
  type: z.enum(TYPES_PIECE),
  dateExpiration: z.string().max(40).nullable().optional(),
});

/** Les pièces, avec leur libellé et une adresse signée (stockage privé). */
const presenterPieces = <T extends { type: string; url: string }>(pieces: T[]) =>
  pieces.map((piece) => ({ ...piece, libelle: libelleDeLaPiece(piece.type), url: presenter(piece.url) }));

const avecLibelles = (types: string[]) => types.map((type) => ({ type, libelle: libelleDeLaPiece(type) }));

export function presenterSociete(societe: NonNullable<Awaited<ReturnType<typeof SocieteDriveService.maSociete>>>) {
  const { gerant, ...reste } = societe;
  return {
    ...reste,
    gerant: { email: gerant.email, name: gerant.name },
    documents: presenterPieces(societe.documents),
    piecesExigees: avecLibelles(societe.piecesExigees),
    vehicules: societe.vehicules.map((vehicule) => ({
      ...vehicule,
      documents: presenterPieces(vehicule.documents),
      piecesExigees: avecLibelles(vehicule.piecesExigees),
    })),
    chauffeurs: societe.chauffeurs.map(({ user, ...chauffeur }) => ({ ...chauffeur, email: user.email })),
  };
}

const repondreSociete = async (res: Response, userId: string) => {
  const societe = await SocieteDriveService.maSociete(userId);
  res.json({ success: true, data: societe ? presenterSociete(societe) : null });
};

/** Le dépôt d'un fichier : la route mince, la vérification dans le service. */
function lirePiece(req: Request) {
  if (!req.file) throw new ApiError(400, "Aucun fichier fourni", "NO_FILE");
  const body = pieceSchema.parse(req.body);
  return { type: body.type, file: req.file.buffer, mimeType: req.file.mimetype, dateExpiration: body.dateExpiration };
}

// Une invitation part par courriel : pas plus de 30 par heure et par gérant.
const limiterInvitations = limiterCadence({
  nom: "zupdrive-invitations",
  max: 30,
  fenetreMs: 60 * 60_000,
  message: "Trop d'invitations envoyées. Réessayez dans une heure.",
  cle: (req) => `${req.userId}`,
});

// GET /api/zupdrive/societe/me — la société du compte, ou null
router.get("/me", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await repondreSociete(res, req.userId as string);
  } catch (err) {
    next(err);
  }
});

// POST /api/zupdrive/societe/me — ouvrir le dossier de la société (idempotent)
router.post("/me", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profil = profilSocieteSchema.parse(req.body);
    await SocieteDriveService.creer(req.userId as string, profil);
    res.status(201);
    await repondreSociete(res, req.userId as string);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/zupdrive/societe/me — modifier le profil (brouillon ou refusé)
router.patch("/me", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await SocieteDriveService.modifier(req.userId as string, profilSocieteSchema.parse(req.body));
    await repondreSociete(res, req.userId as string);
  } catch (err) {
    next(err);
  }
});

// POST /api/zupdrive/societe/me/documents — une pièce de la société (multipart « file »)
router.post("/me/documents", uploadMiddleware.single("file"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const piece = await SocieteDriveService.deposerPiece(req.userId as string, lirePiece(req));
    res.status(201).json({ success: true, data: presenterPieces([piece])[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/zupdrive/societe/me/submit — envoyer le dossier à l'équipe ZupDrive (idempotent)
router.post("/me/submit", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await SocieteDriveService.soumettre(req.userId as string);
    await repondreSociete(res, req.userId as string);
  } catch (err) {
    next(err);
  }
});

// POST /api/zupdrive/societe/me/vehicules — ajouter un véhicule
router.post("/me/vehicules", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const vehicule = await SocieteDriveService.ajouterVehicule(req.userId as string, vehiculeSchema.parse(req.body));
    res.status(201).json({ success: true, data: vehicule });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/zupdrive/societe/me/vehicules/:id — corriger un véhicule sans pièce validée
router.patch("/me/vehicules/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const vehicule = await SocieteDriveService.modifierVehicule(
      req.userId as string,
      idSchema.parse(req.params.id),
      vehiculeSchema.partial().parse(req.body)
    );
    res.json({ success: true, data: vehicule });
  } catch (err) {
    next(err);
  }
});

// POST /api/zupdrive/societe/me/vehicules/:id/retirer — retirer un véhicule (gardé dans l'historique)
router.post("/me/vehicules/:id/retirer", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await SocieteDriveService.retirerVehicule(req.userId as string, idSchema.parse(req.params.id));
    await repondreSociete(res, req.userId as string);
  } catch (err) {
    next(err);
  }
});

// POST /api/zupdrive/societe/me/vehicules/:id/documents — une pièce du véhicule (multipart « file »)
router.post(
  "/me/vehicules/:id/documents",
  uploadMiddleware.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const piece = await SocieteDriveService.deposerPieceVehicule(
        req.userId as string,
        idSchema.parse(req.params.id),
        lirePiece(req)
      );
      res.status(201).json({ success: true, data: presenterPieces([piece])[0] });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/zupdrive/societe/me/invitations { email } — inviter un chauffeur (idempotent)
router.post("/me/invitations", limiterInvitations, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = z.object({ email: z.string().trim().email("Adresse e-mail invalide").max(254) }).strict().parse(req.body);
    const invitation = await SocieteDriveService.inviter(req.userId as string, email);
    res.status(201).json({ success: true, data: invitation });
  } catch (err) {
    next(err);
  }
});

// POST /api/zupdrive/societe/me/invitations/:id/annuler
router.post("/me/invitations/:id/annuler", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await SocieteDriveService.annulerInvitation(req.userId as string, idSchema.parse(req.params.id));
    await repondreSociete(res, req.userId as string);
  } catch (err) {
    next(err);
  }
});

// PUT /api/zupdrive/societe/me/chauffeurs/:id/vehicule { vehiculeId | null } — attribuer (ou retirer) un véhicule
router.put("/me/chauffeurs/:id/vehicule", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { vehiculeId } = z.object({ vehiculeId: idSchema.nullable() }).strict().parse(req.body);
    await SocieteDriveService.attribuerVehicule(req.userId as string, idSchema.parse(req.params.id), vehiculeId);
    await repondreSociete(res, req.userId as string);
  } catch (err) {
    next(err);
  }
});

// POST /api/zupdrive/societe/me/chauffeurs/:id/detacher — se séparer d'un chauffeur
router.post("/me/chauffeurs/:id/detacher", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await SocieteDriveService.detacherChauffeur(req.userId as string, idSchema.parse(req.params.id));
    await repondreSociete(res, req.userId as string);
  } catch (err) {
    next(err);
  }
});

// GET /api/zupdrive/societe/me/courses?limit=&offset= — les courses faites pour la société
router.get("/me/courses", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    const { courses, pagination } = await SocieteDriveService.courses(req.userId as string, page);
    res.json({ success: true, data: courses, pagination });
  } catch (err) {
    next(err);
  }
});

export default router;
