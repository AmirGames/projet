import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { champEmail } from "../../utils/validation";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware, oublierCompte } from "./auth.middleware";
import { PermissionsPlateforme, SECTIONS, estRoleDeBase, PLATEFORMES, LIBELLES_PLATEFORMES } from "./permissions-plateforme.service";
import { Plateforme } from "@prisma/client";
import { limiteBornee, decalage } from "../../utils/pagination";

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
    const where = { OR: [{ isSystemAdmin: true }, { isSuperOwner: true }] };

    const [comptes, total] = await Promise.all([
      db.user.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { accesEquipe: { select: { plateforme: true, role: true } } },
      }),
      db.user.count({ where }),
    ]);
    const libelles = await libellesDesRoles();

    res.json({
      admins: comptes.map((c) => presenterMembre(c, libelles)),
      plateformes: PLATEFORMES.map((code) => ({ code, label: LIBELLES_PLATEFORMES[code] })),
      pagination: { total, limit, offset },
    });
  } catch (err) {
    next(err);
  }
});

/** Le nom de chaque rôle, plateforme par plateforme. */
async function libellesDesRoles(): Promise<Record<Plateforme, Record<string, string>>> {
  const paires = await Promise.all(
    PLATEFORMES.map(async (p) => {
      const roles = await PermissionsPlateforme.lister(p);
      return [p, Object.fromEntries(roles.map((r) => [r.code, r.label]))] as const;
    })
  );
  return Object.fromEntries(paires) as Record<Plateforme, Record<string, string>>;
}

/** Un membre de l'équipe tel que l'espace de gestion l'affiche. */
function presenterMembre(
  c: {
  id: string;
  email: string;
  name: string | null;
  isSuperOwner: boolean;
  status: string;
  updatedAt: Date;
  createdAt: Date;
  accesEquipe: { plateforme: Plateforme; role: string }[];
  },
  libelles: Record<Plateforme, Record<string, string>>
) {
  const eat = c.accesEquipe.find((a) => a.plateforme === "EAT");
  return {
    id: c.id,
    email: c.email,
    name: c.name || c.email,
    // Le rôle sur ZupEat, pour les écrans qui n'en montrent qu'un.
    role: c.isSuperOwner ? "SUPEROWNER" : eat?.role ?? null,
    acces: c.isSuperOwner
      ? []
      : c.accesEquipe.map((a) => ({
          plateforme: a.plateforme,
          plateformeLabel: LIBELLES_PLATEFORMES[a.plateforme],
          role: a.role,
          roleLabel: libelles[a.plateforme]?.[a.role] ?? a.role,
        })),
    status: c.status === "BANNED" ? "SUSPENDED" : c.status,
    lastLogin: c.updatedAt,
    createdAt: c.createdAt,
  };
}

const schemaPlateforme = z.enum(PLATEFORMES).default("EAT");

// POST /superowner/admins - Faire entrer un compte existant dans l'équipe
// Volontairement une promotion et non une création : créer un compte ici
// imposerait un mot de passe que personne ne pourrait communiquer au titulaire.
// Le compte entre avec un rôle sur une plateforme ; les autres s'ajoutent
// ensuite, une par une.
router.post("/admins", authMiddleware, superOwnerSeul, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      email: champEmail(),
      name: z.string().optional(),
      role: z.string().min(1).default("ADMIN"),
      plateforme: schemaPlateforme,
    });
    const body = schema.parse(req.body);

    // La base n'admet qu'un superowner (migration 0020) : celui qui appelle.
    if (body.role === "SUPEROWNER") {
      throw new ApiError(
        409,
        "La plateforme n'a qu'un superowner : donnez à ce compte un rôle d'équipe",
        "SUPEROWNER_UNIQUE"
      );
    }

    if (!(await PermissionsPlateforme.role(body.role, body.plateforme))) {
      throw new ApiError(400, "Rôle inconnu", "UNKNOWN_ROLE");
    }

    const compte = await db.user.findUnique({ where: { email: body.email } });

    if (!compte) {
      throw new ApiError(
        404,
        "Aucun compte avec cet email. La personne doit d'abord créer son compte.",
        "USER_NOT_FOUND"
      );
    }

    // Une adresse saisie à l'inscription ne prouve pas qui contrôle le compte.
    // La promotion ciblée par e-mail doit attendre la confirmation de sa boîte.
    if (!compte.emailVerified) {
      throw new ApiError(403, "Cette personne doit confirmer son adresse e-mail avant d'entrer dans l'équipe.", "USER_EMAIL_NOT_VERIFIED");
    }

    if (compte.isSuperOwner || compte.isSystemAdmin) {
      throw new ApiError(
        400,
        "Ce compte fait déjà partie de l'équipe : ajoutez-lui un rôle sur une autre plateforme",
        "ALREADY_ADMIN"
      );
    }

    const promu = await db.user.update({
      where: { id: compte.id },
      data: {
        isSystemAdmin: true,
        name: body.name || compte.name,
        accesEquipe: { create: { plateforme: body.plateforme, role: body.role } },
      },
      include: { accesEquipe: { select: { plateforme: true, role: true } } },
    });

    // Le compte est gardé trente secondes : sans cet oubli, le nouvel
    // administrateur attendrait avant d'entrer.
    oublierCompte(compte.id);

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "GRANT_ADMIN",
        target: promu.id,
        changes: { role: body.role, plateforme: body.plateforme },
      },
    });

    res.status(201).json({ success: true, admin: presenterMembre(promu, await libellesDesRoles()) });
  } catch (err) {
    next(err);
  }
});

// DELETE /superowner/admins/:adminId - Sortir de l'équipe (le compte est conservé)
router.delete("/admins/:adminId", authMiddleware, superOwnerSeul, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = req.params.adminId as string;

    if (adminId === req.userId) {
      throw new ApiError(
        400,
        "Vous ne pouvez pas retirer vos propres droits",
        "CANNOT_REVOKE_SELF"
      );
    }

    const compte = await db.user.findUnique({ where: { id: adminId } });
    if (!compte) {
      throw new ApiError(404, "Compte non trouvé", "NOT_FOUND");
    }

    // Ne jamais laisser la plateforme sans superowner.
    if (compte.isSuperOwner) {
      const restants = await db.user.count({
        where: { isSuperOwner: true, id: { not: adminId } },
      });
      if (restants === 0) {
        throw new ApiError(
          400,
          "Impossible de retirer le dernier superowner",
          "LAST_SUPEROWNER"
        );
      }
    }

    await db.$transaction([
      db.accesEquipe.deleteMany({ where: { userId: adminId } }),
      db.user.update({
        where: { id: adminId },
        data: { isSystemAdmin: false, isSuperOwner: false },
      }),
    ]);

    oublierCompte(adminId);

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "REVOKE_ADMIN",
        target: adminId,
        changes: {},
      },
    });

    res.json({ success: true, message: "Droits d'administration retirés" });
  } catch (err) {
    next(err);
  }
});

/** Un membre de l'équipe dont on règle les rôles : ni soi-même, ni un superowner. */
async function membreARegler(adminId: string, userId: string | undefined) {
  if (adminId === userId) {
    throw new ApiError(400, "Vous ne pouvez pas changer votre propre rôle", "CANNOT_CHANGE_SELF");
  }
  const compte = await db.user.findUnique({ where: { id: adminId } });
  if (!compte || !compte.isSystemAdmin) {
    throw new ApiError(404, "Membre de l'équipe non trouvé", "NOT_FOUND");
  }
  if (compte.isSuperOwner) {
    throw new ApiError(400, "Un superowner n'a pas de groupe : il voit tout", "IS_SUPEROWNER");
  }
  return compte;
}

// PATCH /superowner/admins/:adminId/role - Nommer un membre dans un groupe, sur une plateforme
// Crée le rôle s'il n'en avait pas encore sur cette plateforme.
router.patch("/admins/:adminId/role", authMiddleware, superOwnerSeul, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = req.params.adminId as string;
    const { role, plateforme } = z
      .object({ role: z.string().min(1), plateforme: schemaPlateforme })
      .parse(req.body);
    if (!(await PermissionsPlateforme.role(role, plateforme))) {
      throw new ApiError(400, "Rôle inconnu", "UNKNOWN_ROLE");
    }

    await membreARegler(adminId, req.userId);

    const avant = await db.accesEquipe.findUnique({
      where: { userId_plateforme: { userId: adminId, plateforme } },
    });
    await db.accesEquipe.upsert({
      where: { userId_plateforme: { userId: adminId, plateforme } },
      create: { userId: adminId, plateforme, role },
      update: { role },
    });
    oublierCompte(adminId);

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "CHANGE_PLATFORM_ROLE",
        target: adminId,
        changes: { plateforme, avant: avant?.role ?? null, apres: role },
      },
    });

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

    await membreARegler(adminId, req.userId);

    const { count } = await db.accesEquipe.deleteMany({ where: { userId: adminId, plateforme } });
    if (count === 0) {
      throw new ApiError(404, "Ce membre n'a pas de rôle sur cette plateforme", "NOT_FOUND");
    }
    oublierCompte(adminId);

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "REVOKE_PLATFORM_ROLE",
        target: adminId,
        changes: { plateforme },
      },
    });

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
    const roles = await PermissionsPlateforme.lister(plateforme);
    const effectifs = await db.accesEquipe.groupBy({
      by: ["role"],
      where: { plateforme, user: { isSystemAdmin: true, isSuperOwner: false } },
      _count: { _all: true },
    });
    const parRole = Object.fromEntries(effectifs.map((e) => [e.role, e._count._all]));

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
    if (!(await PermissionsPlateforme.role(code, plateforme))) {
      throw new ApiError(404, "Rôle inconnu", "NOT_FOUND");
    }
    const { permissions } = z
      .object({ permissions: z.record(z.string(), z.enum(["read", "write"])) })
      .parse(req.body);

    const role = await PermissionsPlateforme.modifier(code, permissions, plateforme);

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "UPDATE_PLATFORM_ROLE_PERMISSIONS",
        target: `${plateforme}:${code}`,
        changes: { plateforme, permissions: role.permissions },
      },
    });

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

    const role = await PermissionsPlateforme.creer(label, plateforme);

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "CREATE_PLATFORM_ROLE",
        target: `${plateforme}:${role.code}`,
        changes: { plateforme, label: role.label },
      },
    });

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
    if (!(await PermissionsPlateforme.role(code, plateforme))) {
      throw new ApiError(404, "Rôle inconnu", "NOT_FOUND");
    }

    await PermissionsPlateforme.supprimer(code, plateforme);

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "DELETE_PLATFORM_ROLE",
        target: `${plateforme}:${code}`,
        changes: { plateforme },
      },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
