import crypto from "crypto";
import { db, type ClientTransaction } from "../../services/db";
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
 * Fenêtre de reprise d'une demande identique dont la réponse a été perdue.
 * L'identifiant de requête est aléatoire, lié au refresh parent et ne peut
 * restituer que le même successeur, sans secret conservé en clair.
 */
const TOLERANCE_REPRISE_MS = 10 * 1000;

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
function audienceAutorisee(origine: string | undefined | null): origine is string {
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
  async emettreRefresh(userId: string, sid: string, client: typeof db | ClientTransaction = db, expiresAt?: Date): Promise<string> {
    const jti = crypto.randomUUID();
    const expiration = expiresAt ?? new Date(Date.now() + DUREE_SESSION_MS);
    await client.jetonRafraichissement.create({
      data: { jtiHash: empreinte(jti), sessionId: sid, expiresAt: expiration },
    });

    // Nettoyage hors transaction seulement : ne pas lancer un DELETE concurrent
    // sur le même client transactionnel après la création du successeur.
    if (client === db) client.jetonRafraichissement
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch(() => undefined);

    return AuthService.generateRefreshToken(userId, sid, jti, expiration);
  },

  /**
   * Consomme un jeton de renouvellement et en émet un nouveau (rotation).
   *
   * - Un refresh consommé n'est repris que par la même preuve pendant 10 s ;
   *   tout autre rejeu ferme la session entière.
   * - Jeton sans `jti` : refusé ; les anciens jetons nécessitent une connexion.
   */
  async renouveler(refreshToken: string, cleReprise?: string) {
    const invalide = () =>
      new ApiError(401, "Votre session n'est plus valable. Reconnectez-vous.", "SESSION_INVALIDE");

    const decoded = AuthService.verifyRefreshToken(refreshToken);

    // Un jeton sans session échappe à toute révocation : refusé en production.
    if (!decoded.sid) {
      if (process.env.NODE_ENV !== "test") throw invalide();
      return { decoded, sid: undefined as string | undefined, refreshToken: AuthService.generateRefreshToken(decoded.userId) };
    }
    const sid = decoded.sid;

    if (decoded.jti) {
      if (!cleReprise || cleReprise.length < 16 || cleReprise.length > 128) {
        throw new ApiError(400, "Clé de reprise requise.", "REFRESH_CLE_REQUISE");
      }
      const empreinteCle = empreinte(cleReprise);
      let resultat: { kind: "invalid" } | { kind: "replay"; successeurJti: string; expiresAt: Date } | { kind: "rotated"; refreshToken: string };
      try {
        resultat = await db.$transaction(async (tx) => {
          // Verrouiller la session sérialise aussi les refresh différents de la
          // même session : une seule rotation peut produire un successeur actif.
          const sessions = await tx.$queryRaw<Array<{ id: string; userId: string; revokedAt: Date | null; expiresAt: Date }>>`
            SELECT "id", "userId", "revokedAt", "expiresAt" FROM "SessionConnexion" WHERE "id" = ${sid} FOR UPDATE
          `;
          const session = sessions[0];
          if (!session || session.revokedAt || session.expiresAt <= new Date()) throw invalide();
          if (!(await tx.user.findUnique({ where: { id: decoded.userId }, select: { id: true } }))) throw invalide();
          const ligne = await tx.jetonRafraichissement.findUnique({
            where: { jtiHash: empreinte(decoded.jti!) },
            select: { id: true, sessionId: true, usedAt: true, expiresAt: true, repriseHash: true, successeurJti: true, repriseExpiresAt: true, repriseUsedAt: true },
          });
          const maintenant = new Date();
          if (!ligne || ligne.sessionId !== sid || ligne.expiresAt <= maintenant) return { kind: "invalid" as const };
          if (ligne.usedAt) {
            if (ligne.repriseHash === empreinteCle && ligne.repriseExpiresAt && ligne.repriseExpiresAt > maintenant && ligne.successeurJti) {
              const successeur = await tx.jetonRafraichissement.findUnique({ where: { jtiHash: empreinte(ligne.successeurJti) }, select: { expiresAt: true } });
              if (successeur && successeur.expiresAt > maintenant) {
                await tx.jetonRafraichissement.updateMany({ where: { id: ligne.id, repriseUsedAt: null, repriseHash: empreinteCle, repriseExpiresAt: { gt: maintenant } }, data: { repriseUsedAt: maintenant } });
                return { kind: "replay" as const, successeurJti: ligne.successeurJti, expiresAt: successeur.expiresAt };
              }
            }
            await tx.sessionConnexion.updateMany({ where: { id: sid, revokedAt: null }, data: { revokedAt: maintenant } });
            return { kind: "invalid" as const };
          }

          const nouveauJti = crypto.randomUUID();
          const expirationSuccesseur = new Date(Math.min(session.expiresAt.getTime(), maintenant.getTime() + DUREE_SESSION_MS));
          const nouveauToken = AuthService.generateRefreshToken(decoded.userId, sid, nouveauJti, expirationSuccesseur);
          const consomme = await tx.jetonRafraichissement.updateMany({
            where: { id: ligne.id, usedAt: null, expiresAt: { gt: maintenant } },
            data: { usedAt: maintenant, repriseHash: empreinteCle, successeurJti: nouveauJti, repriseExpiresAt: new Date(maintenant.getTime() + TOLERANCE_REPRISE_MS) },
          });
          if (consomme.count !== 1) throw new Error("REFRESH_TRANSACTION_CONFLICT");
          await tx.jetonRafraichissement.create({ data: { jtiHash: empreinte(nouveauJti), sessionId: sid, expiresAt: expirationSuccesseur } });
          return { kind: "rotated" as const, refreshToken: nouveauToken };
        }, { isolationLevel: "ReadCommitted" });
      } catch (erreur) {
        // Un autre processus peut gagner pendant le verrouillage ou sur un
        // conflit de sérialisation : il ne faut jamais révoquer la session.
        const relue = await db.jetonRafraichissement.findUnique({ where: { jtiHash: empreinte(decoded.jti) }, select: { sessionId: true, usedAt: true, repriseHash: true, successeurJti: true, repriseExpiresAt: true, repriseUsedAt: true } });
        if (relue?.sessionId === sid && relue.usedAt && relue.repriseHash === empreinteCle && relue.repriseExpiresAt && relue.repriseExpiresAt > new Date() && relue.successeurJti) {
          const successeur = await db.jetonRafraichissement.findUnique({ where: { jtiHash: empreinte(relue.successeurJti) }, select: { expiresAt: true } });
          if (successeur?.expiresAt && successeur.expiresAt > new Date()) {
            await db.jetonRafraichissement.updateMany({ where: { jtiHash: empreinte(decoded.jti), repriseUsedAt: null, repriseHash: empreinteCle, repriseExpiresAt: { gt: new Date() } }, data: { repriseUsedAt: new Date() } });
            return { decoded, sid, refreshToken: AuthService.generateRefreshToken(decoded.userId, sid, relue.successeurJti, successeur.expiresAt) };
          }
        }
        if (erreur instanceof Error && erreur.message === "REFRESH_TRANSACTION_CONFLICT") {
          throw new ApiError(409, "Une rotation est en cours. Réessayez avec la même clé de demande.", "REFRESH_CONCURRENT");
        }
        throw erreur;
      }
      if (resultat.kind === "invalid") throw invalide();
      if (resultat.kind === "replay") return { decoded, sid, refreshToken: AuthService.generateRefreshToken(decoded.userId, sid, resultat.successeurJti, resultat.expiresAt) };
      return { decoded, sid, refreshToken: resultat.refreshToken };
    } else {
      await this.fermer(sid);
      throw invalide();
    }
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
