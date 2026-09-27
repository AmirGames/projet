import { Request, Response, NextFunction } from "express";
import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

/**
 * Qui, dans l'équipe de la plateforme, peut faire quoi dans l'espace superowner.
 *
 * Le superowner voit tout et règle le reste : il coche, pour chaque groupe
 * (SuperAdmin, Administrateur, Support), les sections ouvertes en lecture ou en
 * modification. Le contrôle se fait ici, sur chaque route : masquer un lien du
 * menu n'a jamais fermé une porte.
 */

export type Niveau = "read" | "write";
export type Permissions = Record<string, Niveau>;

export const ROLES_PLATEFORME = ["SUPER_ADMIN", "ADMIN", "SUPPORT"] as const;
export type RolePlateforme = (typeof ROLES_PLATEFORME)[number];

export const LIBELLES_ROLES: Record<RolePlateforme, string> = {
  SUPER_ADMIN: "SuperAdmin",
  ADMIN: "Administrateur",
  SUPPORT: "Support",
};

export interface Section {
  id: string;
  label: string;
  groupe: string;
}

/** Les sections de l'espace, dans l'ordre du menu. */
export const SECTIONS: Section[] = [
  { id: "dashboard", label: "Tableau de bord", groupe: "Général" },
  { id: "organizations", label: "Organisations", groupe: "Activité" },
  { id: "stores", label: "Commerces", groupe: "Activité" },
  { id: "drivers", label: "Livreurs", groupe: "Activité" },
  { id: "payouts", label: "Versements", groupe: "Activité" },
  { id: "analytics", label: "Statistiques", groupe: "Activité" },
  { id: "billing", label: "Facturation et remboursements", groupe: "Activité" },
  { id: "formules", label: "Formules", groupe: "Activité" },
  { id: "financial-reports", label: "Rapports financiers", groupe: "Activité" },
  { id: "exports", label: "Exports", groupe: "Activité" },
  { id: "members", label: "Membres (clients, commerçants, livreurs)", groupe: "Membres" },
  { id: "support-tickets", label: "Tickets de support", groupe: "Support" },
  { id: "driver-support", label: "Support livreurs", groupe: "Support" },
  { id: "reviews", label: "Avis signalés", groupe: "Support" },
  { id: "notifications", label: "Notifications", groupe: "Support" },
  { id: "api-keys", label: "Clés API", groupe: "Plateforme" },
  { id: "webhooks", label: "Webhooks", groupe: "Plateforme" },
  { id: "system-config", label: "Configuration système", groupe: "Plateforme" },
  { id: "pages-legales", label: "Pages légales", groupe: "Plateforme" },
  { id: "advanced-settings", label: "Paramètres avancés", groupe: "Plateforme" },
  { id: "health", label: "Santé du système", groupe: "Supervision" },
  { id: "monitoring", label: "Surveillance", groupe: "Supervision" },
  { id: "data-management", label: "Données et sauvegardes", groupe: "Supervision" },
  { id: "security-audit", label: "Audit de sécurité", groupe: "Supervision" },
  { id: "audit-logs", label: "Journal d'audit", groupe: "Supervision" },
  { id: "access-logs", label: "Journal des connexions", groupe: "Supervision" },
];

const IDS_SECTIONS = new Set(SECTIONS.map((s) => s.id));

function tout(niveau: Niveau, sauf: string[] = []): Permissions {
  return Object.fromEntries(
    SECTIONS.filter((s) => !sauf.includes(s.id)).map((s) => [s.id, niveau])
  );
}

/** Le point de départ de chaque groupe, avant que le superowner n'y touche. */
export const PERMISSIONS_PAR_DEFAUT: Record<RolePlateforme, Permissions> = {
  SUPER_ADMIN: tout("write"),
  ADMIN: {
    ...tout("write", [
      "api-keys",
      "webhooks",
      "system-config",
      "advanced-settings",
      "data-management",
    ]),
    health: "read",
    monitoring: "read",
    "security-audit": "read",
    "audit-logs": "read",
    "access-logs": "read",
  },
  SUPPORT: {
    dashboard: "read",
    organizations: "read",
    stores: "read",
    drivers: "read",
    members: "read",
    "support-tickets": "write",
    "driver-support": "write",
    reviews: "write",
    notifications: "write",
  },
};

/**
 * Les routes de chaque routeur et la section qui les couvre. Le premier motif
 * qui correspond l'emporte ; une route absente d'ici reste réservée au
 * superowner — c'est le cas de la gestion de l'équipe et des rôles.
 */
export type Routeur = "superowner" | "admin" | "super-admin";

const ROUTES: Record<Routeur, [RegExp, string][]> = {
  superowner: [
    [/^\/dashboard/, "dashboard"],
    [/^\/organizations\/[^/]+\/tier/, "formules"],
    [/^\/organizations\/[^/]+\/commission-promo/, "formules"],
    [/^\/organizations/, "organizations"],
    [/^\/members\/drivers/, "drivers"],
    [/^\/members/, "members"],
    [/^\/stores/, "stores"],
    [/^\/drivers/, "drivers"],
    [/^\/(payouts|merchant-payouts|versements)/, "payouts"],
    [/^\/analytics/, "analytics"],
    [/^\/(billing|orders)/, "billing"],
    [/^\/plans/, "formules"],
    [/^\/financial-reports/, "financial-reports"],
    [/^\/support-tickets/, "support-tickets"],
    [/^\/driver-support/, "driver-support"],
    [/^\/review-reports/, "reviews"],
    [/^\/api-keys/, "api-keys"],
    [/^\/webhooks/, "webhooks"],
    [/^\/system-config/, "system-config"],
    [/^\/pages-legales/, "pages-legales"],
    [/^\/advanced-settings/, "advanced-settings"],
    [/^\/(system-health|uptime)/, "health"],
    [/^\/monitoring/, "monitoring"],
    [/^\/(data-management|backups)/, "data-management"],
    [/^\/security-audit/, "security-audit"],
    [/^\/audit-logs/, "audit-logs"],
  ],
  admin: [
    [/^\/config/, "system-config"],
    [/^\/merchants/, "organizations"],
    [/^\/stores/, "stores"],
    [/^\/tickets/, "support-tickets"],
    [/^\/commissions/, "exports"],
    [/^\/stats/, "dashboard"],
    [/^\/access-logs/, "access-logs"],
    [/^\/notifications/, "notifications"],
    [/^\/audit-logs/, "audit-logs"],
  ],
  "super-admin": [
    [/^\/dashboard/, "dashboard"],
    [/^\/merchants/, "organizations"],
    [/^\/users/, "members"],
    [/^\/access-logs/, "access-logs"],
  ],
};

export function sectionDeLaRoute(routeur: Routeur, chemin: string): string | null {
  const trouve = ROUTES[routeur].find(([motif]) => motif.test(chemin));
  return trouve ? trouve[1] : null;
}

/** Les trois groupes livrés avec la plateforme : ils ne se suppriment pas. */
export function estRoleDeBase(code: unknown): code is RolePlateforme {
  return typeof code === "string" && (ROLES_PLATEFORME as readonly string[]).includes(code);
}

/** « Facturation & compta » → « FACTURATION_COMPTA ». */
export function codeDuLibelle(libelle: string): string {
  return libelle
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/** Ne garde que des sections connues et des niveaux valides. */
export function nettoyerPermissions(brut: unknown): Permissions {
  const propres: Permissions = {};
  if (!brut || typeof brut !== "object") return propres;
  for (const [id, niveau] of Object.entries(brut as Record<string, unknown>)) {
    if (IDS_SECTIONS.has(id) && (niveau === "read" || niveau === "write")) {
      propres[id] = niveau;
    }
  }
  return propres;
}

export interface RoleConnu {
  code: string;
  label: string;
  permissions: Permissions;
}

// Lu à chaque requête de l'équipe : gardé quelques secondes, oublié dès qu'un
// rôle change.
const DUREE_CACHE_MS = 30000;
let cache: { roles: Record<string, RoleConnu>; expireA: number } | null = null;

export function oublierRoles() {
  cache = null;
}

export const PermissionsPlateforme = {
  /**
   * Tous les groupes : les trois de base, créés avec leurs permissions par
   * défaut s'ils manquent, puis ceux que le superowner a ajoutés.
   */
  async lister() {
    const existants = await db.platformRole.findMany({ orderBy: { createdAt: "asc" } });
    const connus = new Set(existants.map((r) => r.code));
    const manquants = ROLES_PLATEFORME.filter((code) => !connus.has(code));

    const roles = manquants.length
      ? (await db.platformRole.createMany({
          data: manquants.map((code) => ({
            code,
            label: LIBELLES_ROLES[code],
            permissions: PERMISSIONS_PAR_DEFAUT[code],
          })),
          skipDuplicates: true,
        }),
        await db.platformRole.findMany({ orderBy: { createdAt: "asc" } }))
      : existants;

    // Les rôles de base d'abord, dans leur ordre ; les autres ensuite.
    const rang = (code: string) => {
      const i = (ROLES_PLATEFORME as readonly string[]).indexOf(code);
      return i === -1 ? ROLES_PLATEFORME.length : i;
    };
    return [...roles].sort((x, y) => rang(x.code) - rang(y.code));
  },

  async role(code: string | null | undefined): Promise<RoleConnu | null> {
    if (!code) return null;
    if (!cache || Date.now() >= cache.expireA) {
      const roles = await this.lister();
      cache = {
        roles: Object.fromEntries(
          roles.map((r) => [
            r.code,
            { code: r.code, label: r.label, permissions: nettoyerPermissions(r.permissions) },
          ])
        ),
        expireA: Date.now() + DUREE_CACHE_MS,
      };
    }
    return cache.roles[code] ?? null;
  },

  async permissionsDu(code: string | null | undefined): Promise<Permissions> {
    return (await this.role(code))?.permissions ?? {};
  },

  async modifier(code: string, permissions: unknown) {
    const role = await db.platformRole.update({
      where: { code },
      data: { permissions: nettoyerPermissions(permissions) },
    });
    oublierRoles();
    return role;
  },

  /** Un nouveau groupe, sans aucun accès : le superowner coche ensuite. */
  async creer(libelle: string) {
    const label = libelle.trim();
    const code = codeDuLibelle(label);
    if (!code || code === "SUPEROWNER") {
      throw new ApiError(400, "Ce nom de rôle n'est pas utilisable", "INVALID_ROLE_NAME");
    }
    const existant = await db.platformRole.findFirst({
      where: { OR: [{ code }, { label: { equals: label, mode: "insensitive" } }] },
    });
    if (existant) {
      throw new ApiError(400, `Le rôle « ${existant.label} » existe déjà`, "ROLE_EXISTS");
    }
    const role = await db.platformRole.create({ data: { code, label, permissions: {} } });
    oublierRoles();
    return role;
  },

  /** Retire un groupe ajouté, à condition que plus personne n'y soit. */
  async supprimer(code: string) {
    if (estRoleDeBase(code)) {
      throw new ApiError(400, "Les rôles de base ne se suppriment pas", "BASE_ROLE");
    }
    const membres = await db.user.count({ where: { platformRole: code } });
    if (membres > 0) {
      throw new ApiError(
        400,
        `${membres} membre(s) ont encore ce rôle : changez-les de rôle d'abord`,
        "ROLE_IN_USE"
      );
    }
    await db.platformRole.delete({ where: { code } });
    oublierRoles();
  },
};

/**
 * Garde d'un routeur de l'espace d'administration.
 *
 * Le superowner passe partout. Un membre de l'équipe passe si son groupe a la
 * section de la route : en lecture pour un GET, en modification sinon. Sans
 * rôle, ou sur une route qu'aucune section ne couvre, c'est non.
 */
export function exigerPermission(routeur: Routeur) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const compte = req.compte;
      if (compte?.isSuperOwner) return next();

      const section = sectionDeLaRoute(routeur, req.path);
      const permissions = await PermissionsPlateforme.permissionsDu(compte?.platformRole);
      const niveau = section ? permissions[section] : undefined;
      const lecture = req.method === "GET" || req.method === "HEAD";

      if (!compte?.isSystemAdmin || !niveau || (!lecture && niveau !== "write")) {
        throw new ApiError(
          403,
          lecture
            ? "Accès refusé - votre rôle n'ouvre pas cette section"
            : "Accès refusé - votre rôle ne permet pas de modifier cette section",
          "FORBIDDEN"
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
