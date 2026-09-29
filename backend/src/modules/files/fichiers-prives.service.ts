import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import fs from "fs";
import { resolve, sep } from "path";

import type { Plateforme } from "@prisma/client";
import { getEnv } from "../../config/env";
import type { Compte } from "../auth/auth.middleware";
import { detecterType, OCTETS_DE_SIGNATURE } from "../../utils/file-type";
import { db } from "../../services/db";
import { PermissionsPlateforme } from "../auth/permissions-plateforme.service";

/**
 * Les pièces déposées sur le serveur (stockage local), et qui peut les lire.
 *
 * Le dossier /uploads était servi tel quel, sans jeton : permis, carte
 * d'identité et RIB des livreurs, pièces des commerçants, photo de la porte
 * d'un client — il suffisait de l'adresse. Seuls les visuels des boutiques
 * (stores/) restent publics ; le reste passe par /api/files, qui exige :
 * - soit une session, et le droit de lire la pièce ;
 * - soit une adresse signée, valable cinq minutes au plus, délivrée par une
 *   route qui a fait ce même contrôle. C'est ce qui permet de l'afficher dans
 *   une balise <img>, qui n'envoie pas de jeton.
 *
 * Le propriétaire se retrouve par la table qui référence la pièce :
 * DriverDocument, OrganizationDocument, OrderDelivery.proofPhoto,
 * DocumentChauffeurDrive (ZupDrive).
 */

export const DOSSIERS_PRIVES = ["drivers", "merchants", "deliveries", "chauffeurs"] as const;
export type DossierPrive = (typeof DOSSIERS_PRIVES)[number];

/** Durée de vie d'une adresse signée. */
export const DUREE_SIGNATURE_S = 300;

const RACINE = resolve(process.cwd(), "uploads");

/** Un nom de fichier tel que l'upload les écrit : ni séparateur, ni « .. ». */
const FORME_DU_NOM = /^[A-Za-z0-9][A-Za-z0-9_-]*(\.[A-Za-z0-9]{1,8})?$/;

function estDossierPrive(dossier: string): dossier is DossierPrive {
  return (DOSSIERS_PRIVES as readonly string[]).includes(dossier);
}

/**
 * « drivers/abc.jpg » à partir de ce que la base ou le navigateur donne :
 * l'adresse complète (« https://api…/uploads/drivers/abc.jpg »), l'ancienne
 * route (« …/api/drivers/documents/file/drivers/abc.jpg »), la nouvelle
 * (« …/api/files/drivers/abc.jpg?… ») ou le chemin seul. `null` pour tout ce
 * qui n'est pas une pièce privée du stockage local.
 */
export function cheminRelatif(adresse: unknown): string | null {
  if (typeof adresse !== "string" || adresse.length > 2048) return null;

  let chemin = adresse.split(/[?#]/)[0];
  for (const repere of ["/uploads/", "/api/drivers/documents/file/", "/api/files/"]) {
    const i = chemin.lastIndexOf(repere);
    if (i !== -1) {
      chemin = chemin.slice(i + repere.length);
      break;
    }
  }

  try {
    chemin = decodeURIComponent(chemin);
  } catch {
    return null;
  }

  const morceaux = chemin.replace(/^\/+/, "").split("/");
  if (morceaux.length !== 2) return null;
  const [dossier, nom] = morceaux;
  if (!estDossierPrive(dossier) || !FORME_DU_NOM.test(nom)) return null;

  return `${dossier}/${nom}`;
}

/** Le fichier sur le disque, sans jamais sortir du dossier des dépôts. */
export function cheminSurDisque(relatif: string): string | null {
  const complet = resolve(RACINE, relatif);
  return complet.startsWith(RACINE + sep) ? complet : null;
}

// ---------------------------------------------------------------------------
// Adresses signées
// ---------------------------------------------------------------------------

// Une clé propre aux fichiers, dérivée du secret des sessions : une signature
// de fichier ne vaut pas jeton, et inversement. Sans secret (tests), une clé
// tirée au démarrage.
let cle: Buffer | null = null;
function cleDeSignature(): Buffer {
  if (!cle) {
    let secret: string | undefined;
    try {
      secret = getEnv().JWT_SECRET;
    } catch {
      secret = undefined;
    }
    secret = secret || process.env.JWT_SECRET;
    cle = secret
      ? createHmac("sha256", secret).update("fichiers-prives").digest()
      : randomBytes(32);
  }
  return cle;
}

function signature(relatif: string, expire: number): string {
  return createHmac("sha256", cleDeSignature()).update(`${relatif}\n${expire}`).digest("hex");
}

export function signer(relatif: string, maintenant = Date.now()) {
  const exp = Math.floor(maintenant / 1000) + DUREE_SIGNATURE_S;
  return { exp, sig: signature(relatif, exp) };
}

/** La signature correspond, n'est pas échue, et ne dépasse pas cinq minutes. */
export function signatureValable(relatif: string, exp: unknown, sig: unknown, maintenant = Date.now()): boolean {
  if (typeof exp !== "string" || !/^\d{1,12}$/.test(exp)) return false;
  if (typeof sig !== "string" || !/^[a-f0-9]{64}$/.test(sig)) return false;

  const echeance = Number(exp);
  const secondes = Math.floor(maintenant / 1000);
  if (echeance < secondes || echeance > secondes + DUREE_SIGNATURE_S) return false;

  return timingSafeEqual(Buffer.from(signature(relatif, echeance), "hex"), Buffer.from(sig, "hex"));
}

function baseApi(): string {
  let url: string | undefined;
  try {
    url = getEnv().API_URL;
  } catch {
    url = undefined;
  }
  return (url || process.env.API_URL || "http://localhost:3001").replace(/\/+$/, "");
}

/** L'adresse signée d'une pièce, à mettre dans une balise <img> ou un lien. */
export function adresseSignee(relatif: string, maintenant = Date.now()): string {
  const { exp, sig } = signer(relatif, maintenant);
  return `${baseApi()}/api/files/${relatif}?exp=${exp}&sig=${sig}`;
}

/**
 * Ce qu'une réponse de l'API donne à lire : une pièce privée du stockage local
 * devient une adresse signée ; le reste (Cloudinary, lien externe) passe tel
 * quel. À n'appeler qu'une fois le droit de lecture établi.
 */
export function presenter(adresse: string | null | undefined): string | null {
  if (!adresse) return adresse ?? null;
  const relatif = cheminRelatif(adresse);
  return relatif ? adresseSignee(relatif) : adresse;
}

// ---------------------------------------------------------------------------
// Qui peut lire
// ---------------------------------------------------------------------------

/** Les sections de l'espace d'administration qui ouvrent chaque dossier. */
const SECTIONS_DU_DOSSIER: Record<DossierPrive, string[]> = {
  drivers: ["drivers", "driver-support"],
  merchants: ["organizations", "stores"],
  deliveries: ["billing", "support-tickets", "driver-support", "drivers"],
  chauffeurs: ["chauffeurs"],
};

/** L'équipe de la plateforme, avec une section qui couvre ce dossier. */
async function equipeHabilitee(compte: Compte | undefined, dossier: DossierPrive): Promise<boolean> {
  if (!compte) return false;
  if (compte.isSuperOwner) return true;
  if (!compte.isSystemAdmin) return false;

  for (const [plateforme, role] of Object.entries(compte.acces || {})) {
    const permissions = await PermissionsPlateforme.permissionsDu(role, plateforme as Plateforme);
    if (SECTIONS_DU_DOSSIER[dossier].some((section) => permissions[section])) return true;
  }
  return false;
}

/** La pièce telle que la base la connaît : l'adresse finit par ce chemin. */
const reference = (relatif: string) => ({ endsWith: `/uploads/${relatif}` });

export async function peutLire(
  appelant: { userId?: string; compte?: Compte },
  relatif: string
): Promise<boolean> {
  const userId = appelant.userId;
  if (!userId) return false;

  const dossier = relatif.split("/")[0];
  if (!estDossierPrive(dossier)) return false;

  if (await equipeHabilitee(appelant.compte, dossier)) return true;

  if (dossier === "drivers") {
    const piece = await db.driverDocument.findFirst({
      where: { documentUrl: reference(relatif), driver: { userId } },
      select: { id: true },
    });
    return Boolean(piece);
  }

  if (dossier === "chauffeurs") {
    const piece = await db.documentChauffeurDrive.findFirst({
      where: { url: reference(relatif), chauffeur: { userId } },
      select: { id: true },
    });
    return Boolean(piece);
  }

  if (dossier === "merchants") {
    const piece = await db.organizationDocument.findFirst({
      where: { documentUrl: reference(relatif), org: { memberships: { some: { userId } } } },
      select: { id: true },
    });
    return Boolean(piece);
  }

  const course = await db.orderDelivery.findFirst({
    where: { proofPhoto: reference(relatif) },
    select: {
      driver: { select: { userId: true } },
      order: { select: { customer: { select: { userId: true } }, store: { select: { orgId: true } } } },
    },
  });
  if (!course) return false;
  if (course.driver?.userId === userId) return true;
  if (course.order.customer?.userId === userId) return true;

  const membre = await db.membership.findFirst({
    where: { userId, orgId: course.order.store.orgId },
    select: { id: true },
  });
  return Boolean(membre);
}

// ---------------------------------------------------------------------------
// Type du fichier
// ---------------------------------------------------------------------------

/**
 * Le type d'une pièce enregistrée sans extension utile (.bin), lu dans ses
 * premiers octets : les commerçants déposaient toutes leurs pièces en .bin, et
 * le navigateur, à qui helmet interdit de deviner, refusait de les ouvrir.
 */
function typeLuDansLeFichier(chemin: string): string | null {
  const debut = Buffer.alloc(OCTETS_DE_SIGNATURE);
  const fd = fs.openSync(chemin, "r");
  try {
    fs.readSync(fd, debut, 0, OCTETS_DE_SIGNATURE, 0);
  } finally {
    fs.closeSync(fd);
  }
  return detecterType(debut);
}

const TYPES_PAR_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

export function typeDuFichier(chemin: string): string {
  const ext = chemin.split(".").pop()?.toLowerCase() || "";
  return TYPES_PAR_EXTENSION[ext] || typeLuDansLeFichier(chemin) || "application/octet-stream";
}
