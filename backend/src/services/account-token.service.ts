import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Jetons à usage unique envoyés par courriel : confirmation d'adresse et
 * réinitialisation de mot de passe.
 *
 * Le jeton n'existe en clair que dans le lien envoyé au destinataire. La base
 * n'en garde qu'une empreinte : une fuite de la table des comptes ne permet
 * donc ni de confirmer une adresse ni de s'emparer d'un compte.
 */

/** Une heure : assez pour aller chercher son courriel, pas plus. */
export const DUREE_REINITIALISATION_MS = 60 * 60 * 1000;

/** Un jour : confirmer son adresse est moins pressé. */
export const DUREE_CONFIRMATION_MS = 24 * 60 * 60 * 1000;

export interface JetonEmis {
  /** À mettre dans le lien, jamais en base. */
  jeton: string;
  /** À stocker. */
  empreinte: string;
  expireLe: Date;
}

export class AccountTokenService {
  static empreinte(jeton: string): string {
    return createHash("sha256").update(jeton).digest("hex");
  }

  static emettre(dureeMs: number): JetonEmis {
    // 32 octets : hors de portée d'une recherche exhaustive.
    const jeton = randomBytes(32).toString("hex");

    return {
      jeton,
      empreinte: this.empreinte(jeton),
      expireLe: new Date(Date.now() + dureeMs),
    };
  }

  /**
   * Comparaison à temps constant : comparer deux empreintes avec === laisse
   * fuiter, par le temps de réponse, le nombre de caractères devinés.
   */
  static correspond(jeton: string, empreinteAttendue: string | null): boolean {
    if (!empreinteAttendue) return false;

    const calculee = Buffer.from(this.empreinte(jeton));
    const attendue = Buffer.from(empreinteAttendue);

    if (calculee.length !== attendue.length) return false;

    return timingSafeEqual(calculee, attendue);
  }

  static expire(date: Date | null): boolean {
    return !date || date.getTime() < Date.now();
  }
}
