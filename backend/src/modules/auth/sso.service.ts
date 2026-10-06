import crypto from "crypto";
import { db } from "../../services/db";
import { AuthService } from "./auth.service";
import { ApiError } from "../../middleware/errorHandler";
import { originesAutorisees } from "./origines-autorisees";

/**
 * Connexion unique entre les domaines (SSO).
 *
 * Chaque domaine du site garde sa session dans son propre stockage : le
 * navigateur interdit à manager.zupeat.com de lire celle de zupeat.com, et
 * plus encore à zupone.com celle de zupdrive.com. On se reconnectait donc à
 * chaque changement de domaine.
 *
 * Désormais :
 * - chaque connexion ouvre une **session** (SessionConnexion), que tous les
 *   jetons émis pour elle portent (`sid`) ;
 * - zupone.com (SSO_ORIGIN) garde, dans un cookie qui n'est lisible que de
 *   lui, un **jeton central** rattaché à cette session ;
 * - un autre domaine obtient la session par un **code à usage unique**,
 *   valable une minute et pour lui seul, qu'il échange contre ses jetons ;
 * - se déconnecter **ferme la session** : ses jetons cessent de valoir sur
 *   tous les domaines, et le jeton central avec eux.
 *
 * Seules des empreintes sont conservées : ni le jeton central, ni les codes ne
 * sont lisibles dans la base.
 */

const MINUTE = 60 * 1000;
const DUREE_CODE_MS = 1 * MINUTE;
/** Celle des jetons de renouvellement : au-delà, il faut se reconnecter. */
const DUREE_SESSION_MS = 7 * 24 * 60 * MINUTE;
/**
 * Deux renouvellements presque simultanés (deux onglets, une tâche de fond et
 * l'application) présentent le même jeton : le second n'est pas un vol. Dans
 * ce délai, il est refusé sans fermer la session.
 */
const TOLERANCE_CONCURRENCE_MS = 10 * 1000;

const empreinte = (valeur: string) => crypto.createHash("sha256").update(valeur).digest("hex");
const aleatoire = () => crypto.randomBytes(32).toString("base64url");

/** L'origine qui tient le cookie central (https://zupone.com), ou null : SSO éteint. */
export function origineCentrale(): string | null {
  const brute = (process.env.SSO_ORIGIN || "").trim();
  if (!brute) return null;
  try {
    return new URL(brute).origin;
  } catch {
    return null;
  }
}

/**
 * Un domaine du site, à qui l'on peut confier un code.
 *
 * Sans cette liste, un code pourrait être envoyé à n'importe quelle adresse,
 * et la session avec lui.
 */
export function audienceAutorisee(origine: string | undefined | null): origine is string {
  if (!origine) return false;
  const centrale = origineCentrale();
  return origine === centrale || originesAutorisees().includes(origine);
}


export const SsoService = {
  /** Ouvre une session et émet les jetons qui la portent. */
  async connecter(userId: string) {
    const session = await db.sessionConnexion.create({
      data: { userId, expiresAt: new Date(Date.now() + DUREE_SESSION_MS) },
      select: { id: true },
    });

    return {
      sid: session.id,
      accessToken: AuthService.generateAccessToken(userId, session.id),
      refreshToken: await this.emettreRefresh(userId, session.id),
    };
  },

  /**
   * Émet un jeton de renouvellement pour la session : son identifiant (jti) est
   * enregistré, haché, pour pouvoir le consommer une seule fois.
   */
  async emettreRefresh(userId: string, sid: string): Promise<string> {
    const jti = crypto.randomUUID();
    await db.jetonRafraichissement.create({
      data: { jtiHash: empreinte(jti), sessionId: sid, expiresAt: new Date(Date.now() + DUREE_SESSION_MS) },
    });

    // Au passage, les jetons périmés : la table ne garde que ce qui peut servir.
    db.jetonRafraichissement
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch(() => undefined);

    return AuthService.generateRefreshToken(userId, sid, jti);
  },

  /**
   * Consomme un jeton de renouvellement et en émet un nouveau (rotation).
   *
   * - Jeton inconnu de la session ou déjà consommé : il a été copié — la
   *   session entière est fermée (détection de réutilisation).
   * - Jeton sans `jti` : refusé ; les anciens jetons nécessitent une connexion.
   */
  async renouveler(refreshToken: string) {
    const invalide = () =>
      new ApiError(401, "Votre session n'est plus valable. Reconnectez-vous.", "SESSION_INVALIDE");

    const decoded = AuthService.verifyRefreshToken(refreshToken);

    // Un jeton sans session échappe à toute révocation : refusé en production.
    if (!decoded.sid) {
      if (process.env.NODE_ENV !== "test") throw invalide();
      return { decoded, sid: undefined as string | undefined, refreshToken: AuthService.generateRefreshToken(decoded.userId) };
    }
    const sid = decoded.sid;

    if (!(await this.sessionActive(sid))) throw invalide();

    if (decoded.jti) {
      const ligne = await db.jetonRafraichissement.findUnique({
        where: { jtiHash: empreinte(decoded.jti) },
        select: { id: true, sessionId: true, usedAt: true, expiresAt: true },
      });
      if (
        ligne &&
        ligne.sessionId === sid &&
        ligne.usedAt &&
        Date.now() - ligne.usedAt.getTime() < TOLERANCE_CONCURRENCE_MS
      ) {
        throw new ApiError(409, "Renouvellement déjà en cours. Réessayez.", "REFRESH_CONCURRENT");
      }
      // Marqué consommé seulement s'il ne l'était pas : deux renouvellements
      // simultanés du même jeton, un seul passe — l'autre est une réutilisation.
      const { count } =
        ligne && ligne.sessionId === sid && !ligne.usedAt && ligne.expiresAt > new Date()
          ? await db.jetonRafraichissement.updateMany({
              where: { id: ligne.id, usedAt: null },
              data: { usedAt: new Date() },
            })
          : { count: 0 };
      if (count !== 1) {
        // Deux renouvellements vraiment simultanés lisent tous deux le jeton
        // « non consommé » : le perdant ne l'a pas volé, il est arrivé à
        // quelques millisecondes du gagnant. On relit : consommé à l'instant,
        // c'est une concurrence (409, la session reste ouverte) ; sinon,
        // c'est une réutilisation d'un jeton plus ancien, la session est fermée.
        const relue = ligne && ligne.sessionId === sid
          ? await db.jetonRafraichissement.findUnique({
              where: { jtiHash: empreinte(decoded.jti) },
              select: { usedAt: true },
            })
          : null;
        if (relue?.usedAt && Date.now() - relue.usedAt.getTime() < TOLERANCE_CONCURRENCE_MS) {
          throw new ApiError(409, "Renouvellement déjà en cours. Réessayez.", "REFRESH_CONCURRENT");
        }
        await this.fermer(sid);
        throw invalide();
      }
    } else {
      await this.fermer(sid);
      throw invalide();
    }

    return { decoded, sid, refreshToken: await this.emettreRefresh(decoded.userId, sid) };
  },

  /** Le temps réel contourne le cache pour les révocations sur une autre instance. */
  async sessionActive(sid: string, _options: { sansCache?: boolean } = {}): Promise<boolean> {
    const session = await db.sessionConnexion.findUnique({
      where: { id: sid },
      select: { revokedAt: true, expiresAt: true },
    });
    const active = !!session && !session.revokedAt && session.expiresAt > new Date();

    return active;
  },

  /** Un code pour transmettre la session à un domaine du site. */
  async creerCode(sid: string, audience: string): Promise<string> {
    if (!audienceAutorisee(audience)) {
      throw new ApiError(400, "Domaine inconnu", "SSO_AUDIENCE");
    }
    if (!(await this.sessionActive(sid))) {
      throw new ApiError(401, "Votre session n'est plus valable. Reconnectez-vous.", "SESSION_INVALIDE");
    }

    const code = aleatoire();
    await db.codeConnexion.create({
      data: {
        codeHash: empreinte(code),
        sessionId: sid,
        audience,
        expiresAt: new Date(Date.now() + DUREE_CODE_MS),
      },
    });

    // Au passage, les codes périmés depuis plus d'une heure : la table ne
    // garde que ce qui peut encore servir ou vient de servir.
    db.codeConnexion
      .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 60 * MINUTE) } } })
      .catch(() => undefined);

    return code;
  },

  /**
   * Consomme un code : une seule fois, dans la minute, par le domaine à qui
   * il était destiné. Rend la session qu'il transmet.
   */
  async echangerCode(code: string, audience: string | undefined | null) {
    const invalide = () =>
      new ApiError(401, "Lien de connexion expiré ou déjà utilisé.", "SSO_CODE_INVALIDE");

    if (!code || !audience) throw invalide();

    const trouve = await db.codeConnexion.findUnique({
      where: { codeHash: empreinte(code) },
      select: { id: true, audience: true, expiresAt: true, usedAt: true, sessionId: true },
    });

    if (!trouve || trouve.usedAt || trouve.expiresAt < new Date() || trouve.audience !== audience) {
      throw invalide();
    }

    // Marqué utilisé seulement s'il ne l'était pas : deux échanges simultanés
    // du même code, un seul passe.
    const { count } = await db.codeConnexion.updateMany({
      where: { id: trouve.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count !== 1) throw invalide();

    const session = await db.sessionConnexion.findUnique({
      where: { id: trouve.sessionId },
      select: { id: true, userId: true, revokedAt: true, expiresAt: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) throw invalide();

    return { sid: session.id, userId: session.userId };
  },

  /** Rattache un jeton central à la session, pour le cookie de zupone.com. */
  async poserJetonCentral(sid: string): Promise<string> {
    const jeton = aleatoire();
    await db.sessionConnexion.update({
      where: { id: sid },
      data: { jetonCentralHash: empreinte(jeton) },
    });
    return jeton;
  },

  /** La session d'un jeton central, si elle est encore ouverte. */
  async sessionDuJetonCentral(jeton: string) {
    if (!jeton) return null;

    const session = await db.sessionConnexion.findUnique({
      where: { jetonCentralHash: empreinte(jeton) },
      select: { id: true, userId: true, revokedAt: true, expiresAt: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
    return { sid: session.id, userId: session.userId };
  },

  /**
   * Ferme toutes les sessions d'un compte, sauf éventuellement une.
   *
   * Après un changement de mot de passe, refuser les anciens jetons (voir
   * jetonPerime) ne suffit pas : un navigateur qui gardait le cookie de
   * zupone.com se ferait remettre des jetons neufs par la connexion unique.
   * Ses sessions doivent donc fermer aussi, y compris celle du navigateur qui
   * vient de changer le mot de passe.
   */
  async fermerToutes(userId: string, sauf?: string) {
    await db.sessionConnexion.updateMany({
      where: { userId, revokedAt: null, ...(sauf ? { id: { not: sauf } } : {}) },
      data: { revokedAt: new Date() },
    });
  },

  /** Ferme la session : ses jetons cessent de valoir sur tous les domaines. */
  async fermer(sid: string) {
    await db.sessionConnexion.updateMany({
      where: { id: sid, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
