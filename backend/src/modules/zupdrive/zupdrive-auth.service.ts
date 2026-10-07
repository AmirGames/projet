/**
 * ZupDrive Authentication Service
 * Intégration avec le système SSO centralisé de ZupOne
 *
 * ⚠️ IMPORTANT: ZupDrive utilise la SessionConnexion partagée avec ZupEat
 * Les chauffeurs s'authentifient via le SSO zupone.com, pas via leur propre système
 */

import { db } from "../../services/db";
import { SsoService } from "../auth/sso.service";
import { AuthService } from "../auth/auth.service";
import { ApiError } from "../../middleware/api-error";

interface ZupDriveAuthContext {
  userId: string;
  sessionId: string; // SessionConnexion.id (partagée avec ZupEat)
  driverId?: string; // ChauffeurDrive.id
  role: 'DRIVER' | 'ADMIN' | 'SUPPORT';
}

/**
 * Authentifier un chauffeur ZupDrive via SSO
 * Le chauffeur reçoit ses jetons depuis zupone.com (session centralisée)
 */
export const ZupDriveAuthService = {
  /**
   * Valider que la SessionConnexion appartient à un chauffeur valide
   * Appelé après le SSO pour vérifier les permissions ZupDrive
   */
  async validateDriverSession(userId: string, sessionId: string): Promise<ZupDriveAuthContext> {
    // Vérifier que la session existe et est valide
    const session = await db.sessionConnexion.findUnique({
      where: { id: sessionId },
      select: { userId: true, expiresAt: true, revokedAt: true },
    });

    if (!session || session.revokedAt) {
      throw new ApiError(401, 'Session invalide');
    }

    if (session.expiresAt < new Date()) {
      throw new ApiError(401, 'Session expirée');
    }

    if (session.userId !== userId) {
      throw new ApiError(403, 'Utilisateur invalide pour cette session');
    }

    // Vérifier que c'est un chauffeur ZupDrive ou un admin
    const driver = await db.chauffeurDrive.findUnique({
      where: { userId },
      select: { id: true, statut: true },
    });

    // Équipe : le superowner, ou un accès équipe sur la plateforme DRIVE.
    const compte = await db.user.findUnique({
      where: { id: userId },
      select: {
        isSuperOwner: true,
        accesEquipe: { where: { plateforme: 'DRIVE' }, select: { role: true } },
      },
    });
    const accesEquipe = compte?.accesEquipe[0];
    const admin = !!compte?.isSuperOwner || !!accesEquipe;
    const roleEquipe: 'ADMIN' | 'SUPPORT' = !compte?.isSuperOwner && accesEquipe?.role === 'SUPPORT' ? 'SUPPORT' : 'ADMIN';

    if (!driver && !admin) {
      throw new ApiError(403, 'Utilisateur non autorisé pour ZupDrive');
    }

    // Vérifier que le chauffeur n'est pas suspendu (sauf admins)
    if (driver && driver.statut === 'SUSPENDU') {
      throw new ApiError(403, 'Compte chauffeur suspendu');
    }

    return {
      userId,
      sessionId,
      driverId: driver?.id,
      role: admin ? roleEquipe : 'DRIVER',
    };
  },

  /**
   * Créer une session ZupDrive après authentification SSO
   * La SessionConnexion est créée par SsoService, on ne fait que valider
   */
  async createZupDriveSession(userId: string): Promise<{
    sid: string;
    accessToken: string;
    refreshToken: string;
  }> {
    // La session est créée par SsoService.connecter()
    // On retoure simplement les jetons pour ZupDrive
    return SsoService.connecter(userId);
  },

  /**
   * Renouveler la session via le refresh token
   * Utilise le système SSO partagé
   */
  async refreshZupDriveSession(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    // Rotation du jeton, détection de réutilisation et session active : tout
    // est vérifié par le SSO partagé, qui consomme le jeton une seule fois.
    const { decoded, sid, refreshToken: nouveauRefresh } = await SsoService.renouveler(refreshToken);

    if (!sid) {
      throw new ApiError(401, 'Session expirée, reconnexion requise');
    }

    // Vérifier que l'utilisateur a toujours accès à ZupDrive
    await this.validateDriverSession(decoded.userId, sid);

    return {
      accessToken: AuthService.generateAccessToken(decoded.userId, sid),
      refreshToken: nouveauRefresh,
    };
  },

  /**
   * Déconnecter: ferme la SessionConnexion (valide pour tous les domaines)
   * Le SSO gère la déconnexion centralisée
   */
  async logoutZupDrive(sessionId: string): Promise<void> {
    await db.sessionConnexion.update({
      where: { id: sessionId },
      data: { expiresAt: new Date() }, // Invalide immédiatement
    });
  },

  /**
   * Obtenir le contexte utilisateur depuis un token
   * Valide le token ET vérifie l'accès ZupDrive
   */
  async getAuthContext(token: string): Promise<ZupDriveAuthContext> {
    const payload = AuthService.verifyAccessToken(token);

    if (!payload.sid) {
      throw new ApiError(401, 'Session invalide');
    }

    return this.validateDriverSession(payload.userId, payload.sid);
  },
};

/**
 * IMPORTANT: Utilisation correcte
 *
 * AVANT (❌ incorrect):
 * - ZupDrive créait sa propre session
 * - Chauffeurs devaient se reconnecter sur chaque domaine
 *
 * MAINTENANT (✅ correct):
 * 1. Chauffeur se connecte sur zupone.com (SSO central)
 * 2. Reçoit sessionId (partagée avec ZupEat)
 * 3. Obtient code pour zupdrive.com
 * 4. Échange code contre accessToken + refreshToken
 * 5. accessToken porte le sessionId partagé
 *
 * Résultat: Une session pour tous les domaines!
 */
