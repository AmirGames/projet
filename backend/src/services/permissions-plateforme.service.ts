import { Request, Response, NextFunction } from "express";
import { Plateforme } from "@prisma/client";
import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

/**
 * Qui, dans l'équipe du groupe, peut faire quoi, plateforme par plateforme.
 *
 * Le superowner voit tout et règle le reste : il nomme chaque membre de
 * l'équipe dans un groupe (SuperAdmin, Administrateur, Support) sur chaque
 * plateforme où il travaille, et coche, pour chaque groupe de chaque
 * plateforme, les sections ouvertes en lecture ou en modification. Le contrôle se fait ici, sur chaque route : masquer un lien du
 * menu n'a jamais fermé une porte.
 */

export const PLATEFORMES = ["EAT", "DRIVE"] as const satisfies readonly Plateforme[];

export const LIBELLES_PLATEFORMES: Record<Plateforme, string> = {
  EAT: "ZupEat",
  DRIVE: "ZupDrive",
};

export function estPlateforme(code: unknown): code is Plateforme {
  return typeof code === "string" && (PLATEFORMES as readonly string[]).includes(code);
}

/** Les rôles d'un compte, par plateforme. */
export type Acces = Partial<Record<Plateforme, string>>;

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

export function estRolePlateforme(code: unknown): code is RolePlateforme {
  return typeof code === "string" && (ROLES_PLATEFORME as readonly string[]).includes(code);
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

// Lu à chaque requête de l'équipe : gardé quelques secondes, oublié dès qu'un
// rôle change.
const DUREE_CACHE_MS = 30000;
const cache = new Map<Plateforme, { roles: Record<string, Permissions>; expireA: number }>();

export function oublierRoles() {
  cache.clear();
}

export const PermissionsPlateforme = {
  /**
   * Les trois groupes d'une plateforme, créés avec leurs permissions par
   * défaut s'ils manquent.
   */
  async lister(plateforme: Plateforme = "EAT") {
    const existants = await db.platformRole.findMany({ where: { plateforme } });
    const connus = new Set(existants.map((r) => r.code));
    const manquants = ROLES_PLATEFORME.filter((code) => !connus.has(code));

    if (manquants.length > 0) {
      await db.platformRole.createMany({
        data: manquants.map((code) => ({
          plateforme,
          code,
          label: LIBELLES_ROLES[code],
          permissions: PERMISSIONS_PAR_DEFAUT[code],
        })),
        skipDuplicates: true,
      });
      return db.platformRole.findMany({ where: { plateforme } });
    }

    return existants;
  },

  async permissionsDu(role: string | null | undefined, plateforme: Plateforme = "EAT"): Promise<Permissions> {
    if (!estRolePlateforme(role)) return {};
    let connu = cache.get(plateforme);
    if (!connu || Date.now() >= connu.expireA) {
      const roles = await this.lister(plateforme);
      connu = {
        roles: Object.fromEntries(roles.map((r) => [r.code, nettoyerPermissions(r.permissions)])),
        expireA: Date.now() + DUREE_CACHE_MS,
      };
      cache.set(plateforme, connu);
    }
    return connu.roles[role] ?? {};
  },

  async modifier(code: RolePlateforme, permissions: unknown, plateforme: Plateforme = "EAT") {
    const role = await db.platformRole.upsert({
      where: { plateforme_code: { plateforme, code } },
      create: { plateforme, code, label: LIBELLES_ROLES[code], permissions: nettoyerPermissions(permissions) },
      update: { permissions: nettoyerPermissions(permissions) },
    });
    oublierRoles();
    return role;
  },
};

/**
 * Garde d'un routeur de l'espace d'administration.
 *
 * Le superowner passe partout. Un membre de l'équipe passe si son groupe sur
 * la plateforme a la section de la route : en lecture pour un GET, en
 * modification sinon. Sans rôle sur cette plateforme, ou sur une route
 * qu'aucune section ne couvre, c'est non.
 *
 * Les routeurs d'administration actuels sont ceux de ZupEat.
 */
export function exigerPermission(routeur: Routeur, plateforme: Plateforme = "EAT") {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const compte = req.compte;
      if (compte?.isSuperOwner) return next();

      const section = sectionDeLaRoute(routeur, req.path);
      const permissions = await PermissionsPlateforme.permissionsDu(compte?.acces[plateforme], plateforme);
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
