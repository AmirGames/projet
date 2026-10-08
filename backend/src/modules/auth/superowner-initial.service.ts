import bcrypt from "bcrypt";
import { randomBytes } from "crypto";

import { db } from "../../services/db";
import { AccountTokenService } from "./account-token.service";
import { champEmail, champMotDePasse } from "../../utils/validation";

/**
 * Le superowner de la plateforme, créé hors de l'API.
 *
 * Le premier compte inscrit devenait superowner : deux inscriptions
 * simultanées sur une base vide en créaient deux, et sur un serveur neuf le
 * premier robot venu prenait la plateforme — sauvegardes, fichiers SEPA,
 * pièces des livreurs. L'inscription ne donne plus aucun droit ; le compte se
 * crée ici, depuis les variables d'environnement de l'hébergeur :
 *
 *   SUPEROWNER_EMAIL          l'adresse du compte
 *   SUPEROWNER_PASSWORD       son mot de passe (règles de l'inscription)
 *   SUPEROWNER_PASSWORD_HASH  ou son empreinte bcrypt, pour ne jamais écrire
 *                             le mot de passe en clair chez l'hébergeur
 *
 * Rejouable sans effet : dès qu'un superowner existe, rien ne change, même si
 * les variables désignent un autre compte. La base n'en admet d'ailleurs qu'un
 * (index unique partiel, migration 0020).
 */

export type ResultatSuperowner =
  | { statut: "cree"; userId: string; email: string; jeton?: string }
  | { statut: "promu"; userId: string; email: string }
  | { statut: "existant"; userId: string; email: string };

/** `$2a$`, `$2b$` ou `$2y$`, coût sur deux chiffres, 53 caractères : ce que refuse la contrainte de la migration 0002. */
const EMPREINTE_BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export class ConfigurationSuperownerInvalide extends Error {}

/** Le lien de définition du mot de passe du premier superowner : 48 h. */
const DUREE_INVITATION_SUPEROWNER_MS = 48 * 60 * 60 * 1000;

export interface ParametresSuperowner {
  /**
   * Sans mot de passe ni empreinte : le compte naît avec un mot de passe
   * aléatoire que personne ne connaît, et un jeton de réinitialisation est
   * émis (résultat `jeton`) pour que le destinataire choisisse le sien.
   */
  invitation?: boolean;
  email?: string;
  password?: string;
  passwordHash?: string;
}

/** Lit les paramètres dans l'environnement. */
export function parametresDeLEnvironnement(env: NodeJS.ProcessEnv = process.env): ParametresSuperowner {
  return {
    email: env.SUPEROWNER_EMAIL || undefined,
    password: env.SUPEROWNER_PASSWORD || undefined,
    passwordHash: env.SUPEROWNER_PASSWORD_HASH || undefined,
  };
}

async function empreinte({ password, passwordHash }: ParametresSuperowner): Promise<string> {
  if (password && passwordHash) {
    throw new ConfigurationSuperownerInvalide(
      "SUPEROWNER_PASSWORD et SUPEROWNER_PASSWORD_HASH sont exclusifs : n'en donnez qu'un."
    );
  }

  if (passwordHash) {
    if (!EMPREINTE_BCRYPT.test(passwordHash)) {
      throw new ConfigurationSuperownerInvalide("SUPEROWNER_PASSWORD_HASH n'est pas une empreinte bcrypt.");
    }
    return passwordHash;
  }

  if (!password) {
    throw new ConfigurationSuperownerInvalide("SUPEROWNER_PASSWORD ou SUPEROWNER_PASSWORD_HASH manque.");
  }

  const verifie = champMotDePasse().safeParse(password);
  if (!verifie.success) {
    throw new ConfigurationSuperownerInvalide(
      `SUPEROWNER_PASSWORD trop faible : ${verifie.error.issues.map((i) => i.message).join(", ")}.`
    );
  }

  // Même coût que AuthService.hashPassword, qui ne s'importe pas sans les
  // secrets JWT : le script doit tourner avec la seule DATABASE_URL.
  return bcrypt.hash(password, 10);
}

/** Une autre exécution a posé son superowner entre notre lecture et notre écriture. */
function doublonDeSuperowner(err: unknown): boolean {
  const e = err as { code?: string; meta?: { target?: unknown }; message?: string };
  return e?.code === "P2002" && JSON.stringify(e.meta ?? {}).concat(e.message ?? "").includes("un_seul_superowner");
}

async function superownerExistant(): Promise<ResultatSuperowner | null> {
  const existant = await db.user.findFirst({
    where: { isSuperOwner: true },
    select: { id: true, email: true },
  });
  return existant ? { statut: "existant", userId: existant.id, email: existant.email } : null;
}

export async function creerSuperownerInitial(parametres: ParametresSuperowner): Promise<ResultatSuperowner> {
  const deja = await superownerExistant();
  if (deja) return deja;

  const email = champEmail().safeParse(parametres.email ?? "");
  if (!email.success) {
    throw new ConfigurationSuperownerInvalide("SUPEROWNER_EMAIL manque ou n'est pas une adresse valide.");
  }

  const invitation = Boolean(parametres.invitation && !parametres.password && !parametres.passwordHash);
  const passwordHash = invitation
    ? await bcrypt.hash(randomBytes(32).toString("hex"), 10)
    : await empreinte(parametres);
  const invite = invitation ? AccountTokenService.emettre(DUREE_INVITATION_SUPEROWNER_MS) : null;

  try {
    return await db.$transaction(async (tx) => {
      const compte = await tx.user.findUnique({ where: { email: email.data }, select: { id: true } });

      // Le compte existe déjà (l'exploitant s'est inscrit avant) : on le promeut
      // sans toucher à son mot de passe. L'exploitant désigne lui-même cette
      // adresse : elle vaut confirmée, sans quoi la confirmation exigée en
      // production le laisserait dehors.
      if (compte) {
        await tx.user.update({
          where: { id: compte.id },
          data: { isSuperOwner: true, isSystemAdmin: true, emailVerified: true },
        });
        return { statut: "promu" as const, userId: compte.id, email: email.data };
      }

      const cree = await tx.user.create({
        data: {
          email: email.data,
          name: "Superowner",
          passwordHash,
          emailVerified: true,
          isSuperOwner: true,
          isSystemAdmin: true,
          ...(invite && { resetTokenHash: invite.empreinte, resetTokenExpiresAt: invite.expireLe }),
        },
      });

      // La fiche client que l'inscription crée pour tout compte.
      const ficheInvite = await tx.customer.findUnique({ where: { email: cree.email } });
      if (ficheInvite && !ficheInvite.userId) {
        await tx.customer.update({ where: { id: ficheInvite.id }, data: { userId: cree.id } });
      } else if (!ficheInvite) {
        await tx.customer.create({ data: { userId: cree.id, name: "Superowner", email: cree.email } });
      }

      return { statut: "cree" as const, userId: cree.id, email: cree.email, jeton: invite?.jeton };
    });
  } catch (err) {
    if (doublonDeSuperowner(err)) {
      const gagnant = await superownerExistant();
      if (gagnant) return gagnant;
    }
    throw err;
  }
}
