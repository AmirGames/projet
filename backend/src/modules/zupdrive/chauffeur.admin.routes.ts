import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../../services/db";
import { authMiddleware } from "../auth/auth.middleware";
import { exigerPermission } from "../auth/permissions-plateforme.service";
import { journaliser } from "../superowner/shared";
import { ChauffeurOnboardingService, STATUTS_CHAUFFEUR, piecesExigees } from "./chauffeur-onboarding.service";
import { presenterDossier } from "./chauffeur.routes";

/**
 * /api/zupdrive/admin — l'équipe ZupDrive examine les dossiers chauffeurs.
 *
 * Gardé par les permissions de la plateforme DRIVE (section « chauffeurs ») :
 * un rôle ZupEat n'y donne pas accès. Chaque décision est journalisée.
 */
const router = Router();

router.use(authMiddleware, exigerPermission("zupdrive", "DRIVE"));

const idSchema = z.string().min(1).max(64);

// GET /api/zupdrive/admin/chauffeurs?statut=SOUMIS&limit=20&offset=0
router.get("/chauffeurs", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = z
      .object({
        statut: z.enum([...STATUTS_CHAUFFEUR, "ALL"]).default("ALL"),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);

    const where = query.statut === "ALL" ? {} : { statut: query.statut };

    const [chauffeurs, total, parStatut] = await Promise.all([
      db.chauffeurDrive.findMany({
        where,
        skip: query.offset,
        take: query.limit,
        include: {
          user: { select: { email: true } },
          documents: { select: { type: true, statut: true } },
        },
        // Les dossiers soumis depuis le plus longtemps d'abord.
        orderBy: [{ soumisLe: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      }),
      db.chauffeurDrive.count({ where }),
      db.chauffeurDrive.groupBy({ by: ["statut"], _count: true }),
    ]);

    res.json({
      success: true,
      data: chauffeurs.map((chauffeur) => {
        const exigees = piecesExigees(chauffeur.region);
        const validees = new Set(
          chauffeur.documents.filter((piece) => piece.statut === "APPROVED").map((piece) => piece.type)
        );
        return {
          id: chauffeur.id,
          nomComplet: chauffeur.nomComplet,
          email: chauffeur.user.email,
          telephone: chauffeur.telephone,
          region: chauffeur.region,
          raisonSociale: chauffeur.raisonSociale,
          vehiculePlaque: chauffeur.vehiculePlaque,
          statut: chauffeur.statut,
          motifStatut: chauffeur.motifStatut,
          soumisLe: chauffeur.soumisLe,
          valideLe: chauffeur.valideLe,
          piecesDeposees: chauffeur.documents.length,
          piecesValidees: exigees.filter((type) => validees.has(type)).length,
          piecesExigees: exigees.length,
          createdAt: chauffeur.createdAt,
        };
      }),
      counts: Object.fromEntries(parStatut.map((ligne) => [ligne.statut, ligne._count])),
      pagination: { total, limit: query.limit, offset: query.offset },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/zupdrive/admin/chauffeurs/:id — le dossier complet
router.get("/chauffeurs/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dossier = await ChauffeurOnboardingService.dossier(idSchema.parse(req.params.id));
    const user = await db.user.findUnique({ where: { id: dossier.userId }, select: { email: true } });
    res.json({ success: true, data: { ...presenterDossier(dossier), email: user?.email ?? null } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/zupdrive/admin/chauffeurs/:id/documents/:documentId — valider ou refuser une pièce
router.patch("/chauffeurs/:id/documents/:documentId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z
      .object({ approuve: z.boolean(), note: z.string().trim().max(500).optional() })
      .strict()
      .parse(req.body);
    const chauffeurId = idSchema.parse(req.params.id);

    const { avant, piece } = await ChauffeurOnboardingService.examinerPiece(
      chauffeurId,
      idSchema.parse(req.params.documentId),
      body
    );

    await journaliser(req, "ZUPDRIVE_REVIEW_CHAUFFEUR_DOCUMENT", piece.id, {
      chauffeurId,
      type: piece.type,
      avant: avant.statut,
      apres: piece.statut,
      note: piece.noteExamen,
    });

    res.json({ success: true, data: piece });
  } catch (err) {
    next(err);
  }
});

const motifSchema = z.object({ motif: z.string().trim().min(3, "Dites au chauffeur pourquoi").max(1000) }).strict();

/** Une décision sur le dossier, journalisée avec l'état d'avant et d'après. */
function decision(
  action: string,
  faire: (chauffeurId: string, req: Request) => Promise<{ avant: string; dossier: { statut: string; motifStatut: string | null } }>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chauffeurId = idSchema.parse(req.params.id);
      const { avant, dossier } = await faire(chauffeurId, req);

      await journaliser(req, action, chauffeurId, {
        avant,
        apres: dossier.statut,
        motif: dossier.motifStatut,
      });

      res.json({ success: true, data: dossier });
    } catch (err) {
      next(err);
    }
  };
}

// POST /api/zupdrive/admin/chauffeurs/:id/approve
router.post(
  "/chauffeurs/:id/approve",
  decision("ZUPDRIVE_APPROVE_CHAUFFEUR", (id, req) => ChauffeurOnboardingService.valider(id, req.userId as string))
);

// POST /api/zupdrive/admin/chauffeurs/:id/reject { motif }
router.post(
  "/chauffeurs/:id/reject",
  decision("ZUPDRIVE_REJECT_CHAUFFEUR", (id, req) =>
    ChauffeurOnboardingService.refuser(id, motifSchema.parse(req.body).motif)
  )
);

// POST /api/zupdrive/admin/chauffeurs/:id/suspend { motif }
router.post(
  "/chauffeurs/:id/suspend",
  decision("ZUPDRIVE_SUSPEND_CHAUFFEUR", (id, req) =>
    ChauffeurOnboardingService.suspendre(id, motifSchema.parse(req.body).motif)
  )
);

// POST /api/zupdrive/admin/chauffeurs/:id/reactivate
router.post(
  "/chauffeurs/:id/reactivate",
  decision("ZUPDRIVE_REACTIVATE_CHAUFFEUR", (id) => ChauffeurOnboardingService.reactiver(id))
);

export default router;
