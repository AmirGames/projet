import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../../services/db";
import { authMiddleware } from "../auth/auth.middleware";
import { exigerPermission } from "../auth/permissions-plateforme.service";
import { journaliser } from "../superowner/shared";
import { ChauffeurOnboardingService, STATUTS_CHAUFFEUR, piecesExigees } from "./chauffeur-onboarding.service";
import { presenterDossier } from "./chauffeur.routes";
import { STATUTS_SOCIETE, SocieteDriveService } from "./societe-drive.service";
import { presenterSociete } from "./societe.routes";
import { TarificationDriveService } from "./tarification-drive.service";
import { NoteCourseDriveService } from "./note-course-drive.service";
import { REGIONS } from "./chauffeur-onboarding.service";

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
          documents: { where: { archiveeLe: null }, select: { type: true, statut: true } },
          societe: { select: { id: true, raisonSociale: true } },
        },
        // Les dossiers soumis depuis le plus longtemps d'abord.
        orderBy: [{ soumisLe: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      }),
      db.chauffeurDrive.count({ where }),
      db.chauffeurDrive.groupBy({ by: ["statut"], _count: true }),
    ]);
    const notes = await NoteCourseDriveService.moyennesChauffeurs(chauffeurs.map((c) => c.id));

    res.json({
      success: true,
      data: chauffeurs.map((chauffeur) => {
        const exigees = piecesExigees(chauffeur.region, { enSociete: Boolean(chauffeur.societeId) });
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
          // Chauffeur d'une société : licence, assurance et véhicule sont les siens.
          societe: chauffeur.societe ?? null,
          statut: chauffeur.statut,
          motifStatut: chauffeur.motifStatut,
          soumisLe: chauffeur.soumisLe,
          valideLe: chauffeur.valideLe,
          piecesDeposees: chauffeur.documents.length,
          piecesValidees: exigees.filter((type) => validees.has(type)).length,
          piecesExigees: exigees.length,
          // Nulle tant qu'aucun passager ne l'a noté.
          note: notes.get(chauffeur.id) ?? { moyenne: null, avis: 0 },
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
    const [user, note] = await Promise.all([
      db.user.findUnique({ where: { id: dossier.userId }, select: { email: true } }),
      NoteCourseDriveService.moyenneChauffeur(dossier.id),
    ]);
    res.json({ success: true, data: { ...presenterDossier(dossier), email: user?.email ?? null, note } });
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

    const { avant, piece, retabli } = await ChauffeurOnboardingService.examinerPiece(
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
      // Suspendu pour une pièce expirée, rétabli par cette validation.
      ...(retabli ? { chauffeur: { avant: "SUSPENDU", apres: "VALIDE" } } : {}),
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

// ---------------------------------------------------------------------------
// Sociétés et leurs véhicules (section « chauffeurs » : les mêmes dossiers LVC)
// ---------------------------------------------------------------------------

// GET /api/zupdrive/admin/societes?statut=SOUMIS&limit=20&offset=0
router.get("/societes", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = z
      .object({
        statut: z.enum([...STATUTS_SOCIETE, "ALL"]).default("ALL"),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    const where = query.statut === "ALL" ? {} : { statut: query.statut };

    const [societes, total, parStatut] = await Promise.all([
      db.societeDrive.findMany({
        where,
        skip: query.offset,
        take: query.limit,
        include: {
          gerant: { select: { email: true } },
          _count: { select: { chauffeurs: true } },
          vehicules: { where: { retireLe: null }, select: { conforme: true } },
        },
        orderBy: [{ soumisLe: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      }),
      db.societeDrive.count({ where }),
      db.societeDrive.groupBy({ by: ["statut"], _count: true }),
    ]);

    res.json({
      success: true,
      data: societes.map((societe) => ({
        id: societe.id,
        raisonSociale: societe.raisonSociale,
        numeroEntreprise: societe.numeroEntreprise,
        region: societe.region,
        telephone: societe.telephone,
        email: societe.gerant.email,
        statut: societe.statut,
        motifStatut: societe.motifStatut,
        soumisLe: societe.soumisLe,
        chauffeurs: societe._count.chauffeurs,
        vehicules: societe.vehicules.length,
        vehiculesConformes: societe.vehicules.filter((v) => v.conforme).length,
        createdAt: societe.createdAt,
      })),
      counts: Object.fromEntries(parStatut.map((ligne) => [ligne.statut, ligne._count])),
      pagination: { total, limit: query.limit, offset: query.offset },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/zupdrive/admin/societes/:id — le dossier complet : société, véhicules, chauffeurs
router.get("/societes/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: presenterSociete(await SocieteDriveService.societe(idSchema.parse(req.params.id))) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/zupdrive/admin/societes/:id/documents/:documentId — une pièce de la société ou de l'un de ses véhicules
router.patch("/societes/:id/documents/:documentId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z
      .object({ approuve: z.boolean(), note: z.string().trim().max(500).optional() })
      .strict()
      .parse(req.body);
    const societeId = idSchema.parse(req.params.id);
    const { avant, piece, vehicule } = await SocieteDriveService.examinerPiece(
      societeId,
      idSchema.parse(req.params.documentId),
      body
    );

    await journaliser(req, "ZUPDRIVE_REVIEW_SOCIETE_DOCUMENT", piece.id, {
      societeId,
      vehiculeId: piece.vehiculeId,
      type: piece.type,
      avant: avant.statut,
      apres: piece.statut,
      note: piece.noteExamen,
      ...(vehicule?.change ? { vehiculeConforme: vehicule.conforme } : {}),
    });
    res.json({ success: true, data: piece });
  } catch (err) {
    next(err);
  }
});

const motifSocieteSchema = z.object({ motif: z.string().trim().min(3, "Dites à la société pourquoi").max(1000) }).strict();

function decisionSociete(
  action: string,
  faire: (societeId: string, req: Request) => Promise<{ avant: string; dossier: { statut: string; motifStatut: string | null } }>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const societeId = idSchema.parse(req.params.id);
      const { avant, dossier } = await faire(societeId, req);
      await journaliser(req, action, societeId, { avant, apres: dossier.statut, motif: dossier.motifStatut });
      res.json({ success: true, data: dossier });
    } catch (err) {
      next(err);
    }
  };
}

// POST /api/zupdrive/admin/societes/:id/approve
router.post(
  "/societes/:id/approve",
  decisionSociete("ZUPDRIVE_APPROVE_SOCIETE", (id, req) => SocieteDriveService.valider(id, req.userId as string))
);

// POST /api/zupdrive/admin/societes/:id/reject { motif }
router.post(
  "/societes/:id/reject",
  decisionSociete("ZUPDRIVE_REJECT_SOCIETE", (id, req) =>
    SocieteDriveService.refuser(id, motifSocieteSchema.parse(req.body).motif)
  )
);

// POST /api/zupdrive/admin/societes/:id/suspend { motif } — plus aucun de ses chauffeurs ne roule
router.post(
  "/societes/:id/suspend",
  decisionSociete("ZUPDRIVE_SUSPEND_SOCIETE", (id, req) =>
    SocieteDriveService.suspendre(id, motifSocieteSchema.parse(req.body).motif)
  )
);

// POST /api/zupdrive/admin/societes/:id/reactivate
router.post(
  "/societes/:id/reactivate",
  decisionSociete("ZUPDRIVE_REACTIVATE_SOCIETE", (id) => SocieteDriveService.reactiver(id))
);

// ---------------------------------------------------------------------------
// Tarifs et courses (section « courses-drive »)
// ---------------------------------------------------------------------------

// GET /api/zupdrive/admin/tarifs — le tarif de chaque région
router.get("/tarifs", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await TarificationDriveService.lister() });
  } catch (err) {
    next(err);
  }
});

const centimes = z.number().int().min(0).max(100_000);

// PUT /api/zupdrive/admin/tarifs/:region — fixer le tarif (entiers en centimes)
router.put("/tarifs/:region", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const region = z.enum(REGIONS).parse(req.params.region);
    const valeurs = z
      .object({
        priseEnChargeCentimes: centimes,
        parKmCentimes: centimes,
        parMinuteCentimes: centimes,
        minimumCentimes: centimes,
        actif: z.boolean(),
      })
      .strict()
      .parse(req.body);

    const { avant, apres } = await TarificationDriveService.definir(region, valeurs);
    await journaliser(req, "ZUPDRIVE_SET_TARIF", region, {
      avant: avant
        ? {
            priseEnChargeCentimes: avant.priseEnChargeCentimes,
            parKmCentimes: avant.parKmCentimes,
            parMinuteCentimes: avant.parMinuteCentimes,
            minimumCentimes: avant.minimumCentimes,
            actif: avant.actif,
          }
        : null,
      apres: valeurs,
    });
    res.json({ success: true, data: apres });
  } catch (err) {
    next(err);
  }
});

// GET /api/zupdrive/admin/courses?statut=&limit=&offset= — les courses, les plus récentes d'abord
router.get("/courses", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = z
      .object({
        statut: z
          .enum(["ALL", "RECHERCHE", "ACCEPTEE", "ARRIVEE", "EN_COURS", "TERMINEE", "ANNULEE", "SANS_CHAUFFEUR"])
          .default("ALL"),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    const where = query.statut === "ALL" ? {} : { statut: query.statut };
    const [courses, total] = await Promise.all([
      db.courseDrive.findMany({
        where,
        skip: query.offset,
        take: query.limit,
        orderBy: { createdAt: "desc" },
        include: {
          passager: { select: { email: true, name: true } },
          chauffeur: { select: { id: true, nomComplet: true, vehiculePlaque: true } },
          // Les commentaires ne sont lus que par l'équipe.
          notes: { select: { auteur: true, note: true, commentaire: true } },
        },
      }),
      db.courseDrive.count({ where }),
    ]);
    res.json({
      success: true,
      data: courses.map(({ cleIdempotence: _cle, ...course }) => course),
      pagination: { total, limit: query.limit, offset: query.offset },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
