/**
 * Service de Rôles Unifiés ZupOne
 *
 * Un User central avec plusieurs rôles via relations Prisma:
 * - customer: CLIENT_ZUPEAT + PASSENGER_ZUPDRIVE (auto)
 * - driver: LIVREUR_ZUPEAT
 * - chauffeurDrive: CHAUFFEUR_VTCZTC (avec progression statut)
 * - accesEquipe: ADMIN/SUPPORT (par plateforme)
 * - CourierSupportMessage: Support tickets
 *
 * Authentification unifiée via SessionConnexion (partagée)
 * Autorisation granulaire par relation + statut
 */

import { db } from "../../services/db";
import { ApiError } from "../../utils/errors";

export type UserRole =
  | "CLIENT_ZUPEAT"            // Via customer relation
  | "PASSENGER_ZUPDRIVE"       // Auto si client ZupEat
  | "LIVREUR_ZUPEAT"           // Via driver relation
  | "CHAUFFEUR_VTCZTC"         // Via chauffeurDrive relation
  | "ADMIN_ZUPEAT"             // Via accesEquipe
  | "ADMIN_ZUPDRIVE"           // Via accesEquipe
  | "SUPPORT";                 // Via accesEquipe

export type ChauffeurStatus =
  | "BROUILLON"               // Dossier en cours de création
  | "SOUMIS"                  // Dossier soumis à validation
  | "VALIDE"                  // Approuvé, chauffeur actif
  | "REFUSE"                  // Dossier rejeté
  | "SUSPENDU";               // Compte suspendu

interface UserRoleContext {
  userId: string;
  email: string;
  roles: UserRole[];
  customerId?: string;
  driverId?: string;
  chauffeurId?: string;
  chauffeurStatus?: ChauffeurStatus;
  platformAdmin?: {
    plateforme: string;
    role: "SUPER_ADMIN" | "ADMIN" | "SUPPORT";
  }[];
}

/**
 * Service de gestion des rôles unifiés
 * IMPORTANT: Utilise les relations Prisma existantes, pas un array JSON
 */
export const UnifiedRolesService = {
  /**
   * Charger le contexte complet de rôles pour un utilisateur
   */
  async loadUserRoleContext(userId: string): Promise<UserRoleContext> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        customer: { select: { id: true, status: true } },
        driver: { select: { id: true, status: true } },
        chauffeurDrive: { select: { id: true, statut: true } },
        accesEquipe: { select: { plateforme: true, role: true } },
      },
    });

    if (!user) {
      throw new ApiError(404, "Utilisateur non trouvé");
    }

    const roles: UserRole[] = [];

    // CLIENT_ZUPEAT
    if (user.customer && user.customer.status === "ACTIVE") {
      roles.push("CLIENT_ZUPEAT");
      // Auto: Les clients ZupEat accèdent aussi à ZupDrive comme passagers
      roles.push("PASSENGER_ZUPDRIVE");
    }

    // LIVREUR_ZUPEAT
    if (user.driver && user.driver.status === "ACTIVE") {
      roles.push("LIVREUR_ZUPEAT");
    }

    // CHAUFFEUR_VTCZTC
    if (user.chauffeurDrive && user.chauffeurDrive.statut === "VALIDE") {
      roles.push("CHAUFFEUR_VTCZTC");
    }

    // Rôles d'administration
    const platformAdmin = user.accesEquipe.map((ae) => ({
      plateforme: ae.plateforme,
      role: ae.role as "SUPER_ADMIN" | "ADMIN" | "SUPPORT",
    }));

    if (
      platformAdmin.some(
        (ae) => ae.role === "ADMIN" || ae.role === "SUPER_ADMIN"
      )
    ) {
      roles.push("ADMIN_ZUPEAT");
    }

    if (platformAdmin.some((ae) => ae.plateforme === "ZUPDRIVE")) {
      if (
        platformAdmin.find((ae) => ae.plateforme === "ZUPDRIVE")?.role ===
        "SUPPORT"
      ) {
        roles.push("SUPPORT");
      } else {
        roles.push("ADMIN_ZUPDRIVE");
      }
    }

    return {
      userId: user.id,
      email: user.email,
      roles,
      customerId: user.customer?.id,
      driverId: user.driver?.id,
      chauffeurId: user.chauffeurDrive?.id,
      chauffeurStatus: (user.chauffeurDrive?.statut as ChauffeurStatus) || undefined,
      platformAdmin,
    };
  },

  /**
   * Vérifier si un utilisateur a un rôle spécifique
   */
  hasRole(context: UserRoleContext, role: UserRole): boolean {
    return context.roles.includes(role);
  },

  /**
   * Vérifier si un utilisateur peut accéder à ZupEat
   */
  hasZupEatAccess(context: UserRoleContext): boolean {
    return context.roles.some((r) =>
      [
        "CLIENT_ZUPEAT",
        "LIVREUR_ZUPEAT",
        "ADMIN_ZUPEAT",
        "SUPPORT",
      ].includes(r)
    );
  },

  /**
   * Vérifier si un utilisateur peut accéder à ZupDrive
   */
  hasZupDriveAccess(context: UserRoleContext): boolean {
    return context.roles.some((r) =>
      [
        "PASSENGER_ZUPDRIVE",
        "CHAUFFEUR_VTCZTC",
        "ADMIN_ZUPDRIVE",
        "SUPPORT",
      ].includes(r)
    );
  },

  /**
   * Client crée un dossier de candidature chauffeur
   * Transition: Client → Client + Chauffeur(BROUILLON)
   */
  async createChauffeurCandidacy(data: {
    userId: string;
    nomComplet: string;
    telephone: string;
    region: string;
  }): Promise<UserRoleContext> {
    // Vérifier que c'est un client actif
    const customer = await db.customer.findUnique({
      where: { userId: data.userId },
      select: { status: true },
    });

    if (!customer || customer.status !== "ACTIVE") {
      throw new ApiError(400, "Doit être un client ZupEat actif");
    }

    // Vérifier qu'il n'a pas déjà de dossier en cours
    const existing = await db.chauffeurDrive.findUnique({
      where: { userId: data.userId },
    });

    if (existing) {
      throw new ApiError(400, `Dossier chauffeur déjà existant (${existing.statut})`);
    }

    // Créer le dossier (BROUILLON = en cours)
    await db.chauffeurDrive.create({
      data: {
        userId: data.userId,
        nomComplet: data.nomComplet,
        telephone: data.telephone,
        region: data.region,
        statut: "BROUILLON", // Dossier en cours, pas encore soumis
      },
    });

    // Retourner le contexte mis à jour
    return this.loadUserRoleContext(data.userId);
  },

  /**
   * Client soumet son dossier chauffeur pour validation
   * Transition: BROUILLON → SOUMIS
   */
  async submitChauffeurApplication(userId: string): Promise<UserRoleContext> {
    const chauffeur = await db.chauffeurDrive.findUnique({
      where: { userId },
      select: { statut: true },
    });

    if (!chauffeur) {
      throw new ApiError(404, "Pas de dossier chauffeur");
    }

    if (chauffeur.statut !== "BROUILLON") {
      throw new ApiError(400, `Dossier déjà ${chauffeur.statut}, ne peut être soumis`);
    }

    await db.chauffeurDrive.update({
      where: { userId },
      data: {
        statut: "SOUMIS",
        soumisLe: new Date(),
      },
    });

    return this.loadUserRoleContext(userId);
  },

  /**
   * Admin ZupDrive approuve un dossier chauffeur
   * Transition: SOUMIS → VALIDE
   */
  async approveChauffeur(data: {
    chauffeurId: string;
    approvedBy: string;
  }): Promise<UserRoleContext> {
    const chauffeur = await db.chauffeurDrive.findUnique({
      where: { id: data.chauffeurId },
      select: { userId: true, statut: true },
    });

    if (!chauffeur) {
      throw new ApiError(404, "Chauffeur non trouvé");
    }

    if (chauffeur.statut !== "SOUMIS") {
      throw new ApiError(
        400,
        `Dossier ne peut être approuvé (statut: ${chauffeur.statut})`
      );
    }

    await db.chauffeurDrive.update({
      where: { id: data.chauffeurId },
      data: {
        statut: "VALIDE",
        valideLe: new Date(),
        validePar: data.approvedBy,
      },
    });

    return this.loadUserRoleContext(chauffeur.userId);
  },

  /**
   * Admin ZupDrive refuse un dossier chauffeur
   * Transition: SOUMIS → REFUSE
   */
  async rejectChauffeur(data: {
    chauffeurId: string;
    rejectionReason: string;
    rejectedBy: string;
  }): Promise<void> {
    const chauffeur = await db.chauffeurDrive.findUnique({
      where: { id: data.chauffeurId },
      select: { statut: true },
    });

    if (!chauffeur) {
      throw new ApiError(404, "Chauffeur non trouvé");
    }

    if (chauffeur.statut !== "SOUMIS") {
      throw new ApiError(
        400,
        `Dossier ne peut être refusé (statut: ${chauffeur.statut})`
      );
    }

    await db.chauffeurDrive.update({
      where: { id: data.chauffeurId },
      data: {
        statut: "REFUSE",
        motifStatut: data.rejectionReason,
      },
    });
  },

  /**
   * Suspendre un chauffeur (rôle CHAUFFEUR_VTCZTC devenu inaccessible)
   * Le rôle CLIENT_ZUPEAT reste actif!
   */
  async suspendChauffeur(data: {
    chauffeurId: string;
    reason: string;
    suspendedBy: string;
  }): Promise<void> {
    await db.chauffeurDrive.update({
      where: { id: data.chauffeurId },
      data: {
        statut: "SUSPENDU",
        motifStatut: data.reason,
      },
    });
  },

  /**
   * Réactiver un chauffeur suspendu
   */
  async reactivateChauffeur(chauffeurId: string): Promise<void> {
    const chauffeur = await db.chauffeurDrive.findUnique({
      where: { id: chauffeurId },
      select: { statut: true },
    });

    if (!chauffeur) {
      throw new ApiError(404, "Chauffeur non trouvé");
    }

    if (chauffeur.statut !== "SUSPENDU") {
      throw new ApiError(400, `Chauffeur n'est pas suspendu`);
    }

    await db.chauffeurDrive.update({
      where: { id: chauffeurId },
      data: {
        statut: "VALIDE",
        motifStatut: null,
      },
    });
  },
};

/**
 * PROGRESSION CLIENT → CHAUFFEUR
 *
 * 1️⃣ Client crée compte ZupEat
 *    User.customer = ACTIVE
 *    roles = [CLIENT_ZUPEAT, PASSENGER_ZUPDRIVE]
 *    ✅ Accès ZupEat client
 *    ✅ Accès ZupDrive passager (auto)
 *
 * 2️⃣ Client veut devenir chauffeur
 *    createChauffeurCandidacy()
 *    User.chauffeurDrive.statut = BROUILLON
 *    roles = [CLIENT_ZUPEAT, PASSENGER_ZUPDRIVE, (CHAUFFEUR not yet)]
 *    ❌ Pas accès conducteur (pas VALIDE)
 *    ✅ Peut remplir son dossier
 *
 * 3️⃣ Client soumet dossier
 *    submitChauffeurApplication()
 *    User.chauffeurDrive.statut = SOUMIS
 *    soumisLe = now
 *    roles = inchangé
 *    ❌ Accès conducteur absent
 *    📋 Attente validation admin ZupDrive
 *
 * 4️⃣ Admin approuve dossier
 *    approveChauffeur()
 *    User.chauffeurDrive.statut = VALIDE
 *    valideLe = now
 *    validePar = admin.id
 *    roles = [..., CHAUFFEUR_VTCZTC]
 *    ✅ Accès conducteur activé!
 *    ✅ Peut accepter courses ZupDrive
 *
 * 5️⃣ Client perd accès conducteur (suspension ou révocation)
 *    suspendChauffeur()
 *    User.chauffeurDrive.statut = SUSPENDU
 *    roles = [CLIENT_ZUPEAT, PASSENGER_ZUPDRIVE] (CHAUFFEUR supprimé)
 *    ✅ Reste client ZupEat!
 *    ✅ Reste passager ZupDrive!
 *    ❌ Pas conducteur (suspendu)
 *
 * 💡 KEY INSIGHT:
 * - Un User peut TOUJOURS avoir multiple rôles simultanément
 * - Suspendre chauffeur n'affecte pas le rôle client
 * - SessionConnexion partagée entre tous les rôles
 * - Un seul logout ferme tous les accès
 */
