import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { champEmail } from "../../utils/validation";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "./auth.middleware";
import { PermissionsPlateforme, SECTIONS, estRoleDeBase, PLATEFORMES, LIBELLES_PLATEFORMES } from "./permissions-plateforme.service";
import { limiteBornee, decalage } from "../../utils/pagination";
import { TeamAdminService } from "./team-admin.service";

const router = Router();

/** Réservé au superowner lui-même : l'équipe et ses droits. */
const superOwnerSeul = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.compte?.isSuperOwner) {
    return next(new ApiError(403, "Accès refusé - Superowner requis", "FORBIDDEN"));
  }
  next();
};

// GET /superowner/admins - Les membres de l'équipe et leurs rôles par plateforme
router.get("/admins", authMiddleware, superOwnerSeul, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = limiteBornee(req.query.limit, 20, 100);
    const offset = decalage(req.query.offset);

    res.json(await TeamAdminService.lister({ limit, offset }));
  } catch (err) {
    next(err);
  }
});

const schemaPlateforme = z.enum(PLATEFORMES).default("EAT");

// POST /superowner/admins - Faire entrer un compte existant dans l'équipe
// Volontairement une promotion et non une création (voir TeamAdminService.promouvoir).
router.post("/admins", authMiddleware, superOwnerSeul, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      email: champEmail(),
      name: z.string().optional(),
      role: z.string().min(1).default("ADMIN"),
      plateforme: schemaPlateforme,
    });
    const body = schema.parse(req.body);

    const admin = await TeamAdminService.promouvoir(req.userId as string, body);

    res.status(201).json({ success: true, admin });
  } catch (err) {
    next(err);
  }
});

// DELETE /superowner/admins/:adminId - Sortir de l'équipe (le compte est conservé)
router.delete("/admins/:adminId", authMiddleware, superOwnerSeul, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await TeamAdminService.retirer(req.userId as string, req.params.adminId as string);

    res.json({ success: true, message: "Droits d'administration retirés" });
  } catch (err) {
    next(err);
  }
});

// PATCH /superowner/admins/:adminId/role - Nommer un membre dans un groupe, sur une plateforme
// Crée le rôle s'il n'en avait pas encore sur cette plateforme.
router.patch("/admins/:adminId/role", authMiddleware, superOwnerSeul, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = req.params.adminId as string;
    const { role, plateforme } = z
      .object({ role: z.string().min(1), plateforme: schemaPlateforme })
      .parse(req.body);

    await TeamAdminService.changerRole(req.userId as string, adminId, role, plateforme);

    res.json({ success: true, plateforme, role });
  } catch (err) {
    next(err);
  }
});

// DELETE /superowner/admins/:adminId/acces/:plateforme - Retirer l'accès à une plateforme
// Le membre reste dans l'équipe, avec ses rôles sur les autres plateformes.
router.delete("/admins/:adminId/acces/:plateforme", authMiddleware, superOwnerSeul, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = req.params.adminId as string;
    const plateforme = z.enum(PLATEFORMES).parse(req.params.plateforme);

    await TeamAdminService.retirerAcces(req.userId as string, adminId, plateforme);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /superowner/me/permissions/plateformes - Les droits du compte connecté
 * sur chaque plateforme, en un appel.
 *
 * L'espace manager réunit ZupEat et ZupDrive : un membre qui n'a de rôle que
 * sur l'une des deux recevait un 403 pour l'autre à chaque page. Ici, une
 * plateforme sans rôle vaut `null`. La route par plateforme, ci-dessous, garde
 * son 403 : l'application mobile d'administration ZupEat s'en sert pour
 * refuser un compte qui n'a pas de rôle ZupEat.
 */
router.get("/me/permissions/plateformes", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const compte = req.compte;
    if (compte?.isSuperOwner) {
      const tout = Object.fromEntries(SECTIONS.map((s) => [s.id, "write"]));
      res.json({
        isSuperOwner: true,
        plateformes: Object.fromEntries(
          PLATEFORMES.map((p) => [p, { role: "SUPEROWNER", permissions: tout }])
        ),
      });
      return;
    }
    if (!compte?.isSystemAdmin) {
      throw new ApiError(403, "Accès refusé", "FORBIDDEN");
    }

    const plateformes = Object.fromEntries(
      await Promise.all(
        PLATEFORMES.map(async (p) => {
          const role = await PermissionsPlateforme.role(compte.acces[p], p);
          return [p, role ? { role: role.code, roleLabel: role.label, permissions: role.permissions } : null] as const;
        })
      )
    );
    if (Object.values(plateformes).every((acces) => acces === null)) {
      throw new ApiError(403, "Accès refusé", "FORBIDDEN");
    }

    res.json({ isSuperOwner: false, plateformes });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/me/permissions?plateforme=EAT - Ce que le compte connecté peut voir et faire
router.get("/me/permissions", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const compte = req.compte;
    const plateforme = schemaPlateforme.parse(req.query.plateforme);
    if (compte?.isSuperOwner) {
      res.json({
        isSuperOwner: true,
        plateforme,
        role: "SUPEROWNER",
        permissions: Object.fromEntries(SECTIONS.map((s) => [s.id, "write"])),
      });
      return;
    }
    const role = compte?.isSystemAdmin
      ? await PermissionsPlateforme.role(compte.acces[plateforme], plateforme)
      : null;
    if (!role) {
      throw new ApiError(403, "Accès refusé", "FORBIDDEN");
    }
    res.json({
      isSuperOwner: false,
      plateforme,
      role: role.code,
      roleLabel: role.label,
      permissions: role.permissions,
    });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/roles?plateforme=EAT - Les groupes d'une plateforme, les sections et ce qui est coché
router.get("/roles", authMiddleware, superOwnerSeul, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plateforme = schemaPlateforme.parse(req.query.plateforme);
    const { roles, parRole } = await TeamAdminService.rolesAvecEffectifs(plateforme);

    res.json({
      plateforme,
      plateformes: PLATEFORMES.map((code) => ({ code, label: LIBELLES_PLATEFORMES[code] })),
      sections: SECTIONS,
      roles: roles.map((role) => ({
        code: role.code,
        label: role.label,
        permissions: role.permissions,
        membres: parRole[role.code] ?? 0,
        deBase: estRoleDeBase(role.code),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// PUT /superowner/roles/:code?plateforme=EAT - Cocher les permissions d'un groupe
router.put("/roles/:code", authMiddleware, superOwnerSeul, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = req.params.code as string;
    const plateforme = schemaPlateforme.parse(req.query.plateforme);
    await TeamAdminService.exigerRole(code, plateforme);
    const { permissions } = z
      .object({ permissions: z.record(z.string(), z.enum(["read", "write"])) })
      .parse(req.body);

    const role = await TeamAdminService.modifierRole(req.userId as string, code, plateforme, permissions);

    res.json({ success: true, role });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/roles?plateforme=EAT - Créer un rôle (ex. « Facturation ») sur une plateforme, sans accès au départ
router.post("/roles", authMiddleware, superOwnerSeul, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plateforme = schemaPlateforme.parse(req.query.plateforme);
    const { label } = z
      .object({ label: z.string().trim().min(2, "Donnez un nom au rôle").max(40) })
      .parse(req.body);

    const role = await TeamAdminService.creerRole(req.userId as string, plateforme, label);

    res.status(201).json({ success: true, role: { ...role, membres: 0, deBase: false } });
  } catch (err) {
    next(err);
  }
});

// DELETE /superowner/roles/:code?plateforme=EAT - Supprimer un rôle ajouté, s'il n'a plus de membres
router.delete("/roles/:code", authMiddleware, superOwnerSeul, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = req.params.code as string;
    const plateforme = schemaPlateforme.parse(req.query.plateforme);
    await TeamAdminService.exigerRole(code, plateforme);

    await TeamAdminService.supprimerRole(req.userId as string, code, plateforme);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
