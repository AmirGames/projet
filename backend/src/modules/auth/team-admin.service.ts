import { Plateforme } from "@prisma/client";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { oublierCompte } from "./auth.middleware";
import { PermissionsPlateforme, PLATEFORMES, LIBELLES_PLATEFORMES } from "./permissions-plateforme.service";

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

/** Une entrée du journal d'audit de l'administration (qui, quoi, sur quoi, avec quelles valeurs). */
function auditer(adminId: string, action: string, target: string, changes: object) {
  return db.systemAuditLog.create({ data: { adminId, action, target, changes } });
}

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

/**
 * L'équipe d'administration : membres, rôles par plateforme et groupes de
 * permissions. Réservé au superowner (garde posée par les routes) ; chaque
 * modification est inscrite au journal d'audit.
 */
export const TeamAdminService = {
  /** Les membres de l'équipe et leurs rôles par plateforme. */
  async lister({ limit, offset }: { limit: number; offset: number }) {
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

    return {
      admins: comptes.map((c) => presenterMembre(c, libelles)),
      plateformes: PLATEFORMES.map((code) => ({ code, label: LIBELLES_PLATEFORMES[code] })),
      pagination: { total, limit, offset },
    };
  },

  /**
   * Fait entrer un compte existant dans l'équipe.
   * Volontairement une promotion et non une création : créer un compte ici
   * imposerait un mot de passe que personne ne pourrait communiquer au titulaire.
   * Le compte entre avec un rôle sur une plateforme ; les autres s'ajoutent
   * ensuite, une par une.
   */
  async promouvoir(
    adminId: string,
    body: { email: string; name?: string; role: string; plateforme: Plateforme }
  ) {
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

    await auditer(adminId, "GRANT_ADMIN", promu.id, { role: body.role, plateforme: body.plateforme });

    return presenterMembre(promu, await libellesDesRoles());
  },

  /** Sort un membre de l'équipe (le compte est conservé). */
  async retirer(adminId: string, cibleId: string) {
    if (cibleId === adminId) {
      throw new ApiError(
        400,
        "Vous ne pouvez pas retirer vos propres droits",
        "CANNOT_REVOKE_SELF"
      );
    }

    const compte = await db.user.findUnique({ where: { id: cibleId } });
    if (!compte) {
      throw new ApiError(404, "Compte non trouvé", "NOT_FOUND");
    }

    // Ne jamais laisser la plateforme sans superowner.
    if (compte.isSuperOwner) {
      const restants = await db.user.count({
        where: { isSuperOwner: true, id: { not: cibleId } },
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
      db.accesEquipe.deleteMany({ where: { userId: cibleId } }),
      db.user.update({
        where: { id: cibleId },
        data: { isSystemAdmin: false, isSuperOwner: false },
      }),
    ]);

    oublierCompte(cibleId);

    await auditer(adminId, "REVOKE_ADMIN", cibleId, {});
  },

  /**
   * Nomme un membre dans un groupe, sur une plateforme. Crée le rôle s'il n'en
   * avait pas encore sur cette plateforme.
   */
  async changerRole(adminId: string, cibleId: string, role: string, plateforme: Plateforme) {
    if (!(await PermissionsPlateforme.role(role, plateforme))) {
      throw new ApiError(400, "Rôle inconnu", "UNKNOWN_ROLE");
    }

    await membreARegler(cibleId, adminId);

    const avant = await db.accesEquipe.findUnique({
      where: { userId_plateforme: { userId: cibleId, plateforme } },
    });
    await db.accesEquipe.upsert({
      where: { userId_plateforme: { userId: cibleId, plateforme } },
      create: { userId: cibleId, plateforme, role },
      update: { role },
    });
    oublierCompte(cibleId);

    await auditer(adminId, "CHANGE_PLATFORM_ROLE", cibleId, { plateforme, avant: avant?.role ?? null, apres: role });
  },

  /** Retire l'accès à une plateforme ; le membre reste dans l'équipe, avec ses rôles sur les autres. */
  async retirerAcces(adminId: string, cibleId: string, plateforme: Plateforme) {
    await membreARegler(cibleId, adminId);

    const { count } = await db.accesEquipe.deleteMany({ where: { userId: cibleId, plateforme } });
    if (count === 0) {
      throw new ApiError(404, "Ce membre n'a pas de rôle sur cette plateforme", "NOT_FOUND");
    }
    oublierCompte(cibleId);

    await auditer(adminId, "REVOKE_PLATFORM_ROLE", cibleId, { plateforme });
  },

  /** Les groupes d'une plateforme, les sections et ce qui est coché, avec leurs effectifs. */
  async rolesAvecEffectifs(plateforme: Plateforme) {
    const roles = await PermissionsPlateforme.lister(plateforme);
    const effectifs = await db.accesEquipe.groupBy({
      by: ["role"],
      where: { plateforme, user: { isSystemAdmin: true, isSuperOwner: false } },
      _count: { _all: true },
    });
    const parRole = Object.fromEntries(effectifs.map((e) => [e.role, e._count._all]));

    return { roles, parRole };
  },

  /** Lève un 404 si le rôle n'existe pas sur cette plateforme. */
  async exigerRole(code: string, plateforme: Plateforme) {
    if (!(await PermissionsPlateforme.role(code, plateforme))) {
      throw new ApiError(404, "Rôle inconnu", "NOT_FOUND");
    }
  },

  /** Coche les permissions d'un groupe. */
  async modifierRole(adminId: string, code: string, plateforme: Plateforme, permissions: Record<string, "read" | "write">) {
    const role = await PermissionsPlateforme.modifier(code, permissions, plateforme);

    await auditer(adminId, "UPDATE_PLATFORM_ROLE_PERMISSIONS", `${plateforme}:${code}`, { plateforme, permissions: role.permissions });

    return role;
  },

  /** Crée un rôle (ex. « Facturation ») sur une plateforme, sans accès au départ. */
  async creerRole(adminId: string, plateforme: Plateforme, label: string) {
    const role = await PermissionsPlateforme.creer(label, plateforme);

    await auditer(adminId, "CREATE_PLATFORM_ROLE", `${plateforme}:${role.code}`, { plateforme, label: role.label });

    return role;
  },

  /** Supprime un rôle ajouté, s'il n'a plus de membres. */
  async supprimerRole(adminId: string, code: string, plateforme: Plateforme) {
    await PermissionsPlateforme.supprimer(code, plateforme);

    await auditer(adminId, "DELETE_PLATFORM_ROLE", `${plateforme}:${code}`, { plateforme });
  },
};
