import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { PagesLegalesService } from "../legal/pages-legales.service";
import {
  CHAMPS_PROFIL_LEGAL,
  enregistrerProfilLegal,
  lireProfilLegal,
  type ProfilLegal,
} from "../legal/company-profile";
import { isSuperOwner, journaliser } from "./shared";

const router = Router();

// GET /superowner/pages-legales/identite - Informations réutilisées dans les documents.
router.get("/pages-legales/identite", authMiddleware, isSuperOwner, async (_req, res, next) => {
  try {
    res.json({ data: await lireProfilLegal() });
  } catch (err) {
    next(err);
  }
});

// PUT /superowner/pages-legales/identite - Enregistre les variables légales.
router.put("/pages-legales/identite", authMiddleware, isSuperOwner, async (req, res, next) => {
  try {
    const schema = z.object({
      nom: z.string().trim().max(200),
      raison_sociale: z.string().trim().max(200),
      forme_juridique: z.string().trim().max(100),
      adresse: z.string().trim().max(500),
      numero_bce: z.string().trim().max(100),
      numero_tva: z.string().trim().max(100),
      capital_social: z.string().trim().max(100),
      dirigeant: z.string().trim().max(200),
      telephone: z.string().trim().max(100),
      email: z.string().trim().max(200),
      mediateur: z.string().trim().max(200),
      site_mediation: z.string().trim().max(500),
      hebergeur: z.string().trim().max(200),
      adresse_hebergeur: z.string().trim().max(500),
    }).strict();
    const profil = schema.parse(req.body) as ProfilLegal;
    const data = await enregistrerProfilLegal(profil);
    await journaliser(req, "PROFIL_LEGAL_MODIFIE", "SYSTEM_CONFIG", {
      champs: CHAMPS_PROFIL_LEGAL.filter((cle) => Boolean(profil[cle])),
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/pages-legales - Pages en vigueur et historique des versions
router.get("/pages-legales", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pages = await PagesLegalesService.toutes();
    const data = await Promise.all(
      pages.map(async (page) => ({ ...page, historique: await PagesLegalesService.historique(page.slug) }))
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

const publicationPageLegaleSchema = z.object({
  titre: z.string().trim().min(1, "Titre requis").max(200),
  contenu: z.string().trim().min(1, "Le texte ne peut pas être vide").max(100_000),
  version: z
    .string()
    .trim()
    .min(1, "Version requise")
    .max(40)
    .regex(/^[\w.\-]+$/, "Lettres, chiffres, points, tirets uniquement"),
});

// POST /superowner/pages-legales/:slug - Publier une nouvelle version
router.post("/pages-legales/:slug", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = publicationPageLegaleSchema.parse(req.body);
    const slug = req.params.slug as string;
    const publiee = await PagesLegalesService.publier(slug, body, req.actorEmail);
    await journaliser(req, "PAGE_LEGALE_PUBLIEE", slug, { version: publiee.version, titre: publiee.titre });
    res.status(201).json({ data: publiee });
  } catch (err) {
    next(err);
  }
});

export default router;
