import { createHash, randomBytes, timingSafeEqual } from "crypto";

import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { finAttente } from "../drivers/delivery-proof.service";
import { presenter } from "../files/fichiers-prives.service";
import type { Compte } from "../auth/auth.middleware";

/**
 * Le suivi d'une commande, et qui a le droit de le lire.
 *
 * `GET /api/orders/:id` était public et rendait la commande entière : nom,
 * e-mail, téléphone et adresse du client, le secret Stripe du paiement, le
 * code de remise et la photo de sa porte. L'identifiant d'une commande n'est
 * pas un secret — il circule dans les URL, les SMS, les journaux, et l'espace
 * livreur le donne à chaque course : un livreur lisait donc le code sur cette
 * route et clôturait la course sans être passé à la porte.
 *
 * Désormais :
 * - un appelant connecté et concerné (le client propriétaire, l'équipe du
 *   commerce, l'équipe de la plateforme) lit la commande complète, sans aucun
 *   secret de paiement ; seul le client propriétaire y lit le code de remise ;
 * - un visiteur sans compte présente le jeton de suivi remis à la commande, et
 *   lit une vue réduite : statut, heure prévue, articles, montants, code de
 *   remise tant que la commande n'est pas remise, preuve de dépôt ;
 * - tous les autres reçoivent un 404, pour ne pas confirmer que la commande
 *   existe. Le livreur n'y lit jamais le code : il a sa propre route.
 */

/** Le jeton en clair : 32 octets aléatoires, en base64url (43 caractères). */
const FORME_DU_JETON = /^[A-Za-z0-9_-]{43}$/;

export function empreinteDuJeton(jeton: string): string {
  return createHash("sha256").update(jeton, "utf8").digest("hex");
}

/** Un jeton neuf, et l'empreinte à enregistrer. Le jeton n'est jamais stocké. */
export function genererJetonDeSuivi(): { jeton: string; empreinte: string } {
  const jeton = randomBytes(32).toString("base64url");
  return { jeton, empreinte: empreinteDuJeton(jeton) };
}

/** Deux empreintes égales, comparées en temps constant. */
export function memeEmpreinte(attendue: string, fournie: string): boolean {
  const a = Buffer.from(attendue, "hex");
  const b = Buffer.from(fournie, "hex");
  if (a.length !== 32 || b.length !== 32) return false;
  return timingSafeEqual(a, b);
}

/** Le jeton présenté correspond-il à l'une des empreintes de la commande. */
export function jetonReconnu(jeton: unknown, empreintes: (string | null | undefined)[]): boolean {
  if (typeof jeton !== "string" || !FORME_DU_JETON.test(jeton)) return false;

  const fournie = empreinteDuJeton(jeton);
  // Toutes les empreintes sont comparées, sans sortir à la première : la durée
  // ne dit pas laquelle a répondu.
  let reconnu = false;
  for (const empreinte of empreintes) {
    if (empreinte && memeEmpreinte(empreinte, fournie)) reconnu = true;
  }
  return reconnu;
}

/**
 * Le lien de suivi d'un e-mail ou d'un SMS, avec son propre jeton.
 *
 * Ces messages partent souvent bien après la commande (à l'encaissement, à
 * l'acceptation, pendant la course) : le jeton remis au navigateur n'est plus
 * connu du serveur. Chaque lien en reçoit donc un neuf, dont seule l'empreinte
 * est gardée. Sans jeton enregistrable, le lien reste utilisable par un client
 * connecté.
 */
export async function lienDeSuivi(orderId: string, base: string): Promise<string> {
  const adresse = `${base}/track?commande=${encodeURIComponent(orderId)}`;

  try {
    const { jeton, empreinte } = genererJetonDeSuivi();
    await db.orderTrackingToken.create({ data: { orderId, tokenHash: empreinte } });
    return `${adresse}&t=${jeton}`;
  } catch (err) {
    logger.warn("Jeton de suivi impossible à émettre", {
      orderId,
      error: err instanceof Error ? err.message : err,
    });
    return adresse;
  }
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/**
 * Tout ce que la route a besoin de lire, par liste blanche : aucun `include`
 * qui ramènerait un paiement ou une course entière.
 */
const CHAMPS = {
  id: true,
  storeId: true,
  status: true,
  paymentStatus: true,
  submittedAt: true,
  customerId: true,
  customerName: true,
  customerEmail: true,
  customerPhone: true,
  deliveryType: true,
  deliveryMode: true,
  pickupTime: true,
  deliveryAddress: true,
  deliveryCity: true,
  deliveryPostal: true,
  deliveryLat: true,
  deliveryLng: true,
  totalAmount: true,
  taxAmount: true,
  taxRate: true,
  feesAmount: true,
  serviceFeeAmount: true,
  tipAmount: true,
  promoCode: true,
  discountAmount: true,
  paymentMethodName: true,
  notes: true,
  acceptedAt: true,
  preparationMinutes: true,
  estimatedReadyAt: true,
  rejectedAt: true,
  rejectionReason: true,
  rejectionNote: true,
  createdAt: true,
  updatedAt: true,
  trackingTokenHash: true,
  jetonsDeSuivi: { select: { tokenHash: true } },
  store: { select: { orgId: true } },
  customer: { select: { userId: true } },
  items: {
    select: {
      id: true,
      productId: true,
      variantId: true,
      quantity: true,
      price: true,
      total: true,
      selectedOptions: true,
      taxRate: true,
      taxAmount: true,
      product: { select: { id: true, name: true, category: { select: { name: true } } } },
      variant: { select: { id: true, label: true } },
    },
  },
  payments: {
    select: {
      id: true,
      amount: true,
      currency: true,
      status: true,
      paidAt: true,
      refundedAt: true,
      refundedAmount: true,
      createdAt: true,
    },
  },
  delivery: {
    select: {
      status: true,
      deliveryCode: true,
      proofType: true,
      proofAt: true,
      proofPhoto: true,
      proofNote: true,
      nearCustomerNotifiedAt: true,
      customerWaitStartedAt: true,
      driver: { select: { userId: true } },
    },
  },
} as const;

async function lireCommande(id: string) {
  return db.order.findFirst({ where: { id, deletedAt: null }, select: CHAMPS });
}

type Lue = NonNullable<Awaited<ReturnType<typeof lireCommande>>>;

/** Ce que disent la course et la preuve de dépôt, communs aux deux vues. */
function etatDeLaLivraison(commande: Lue, avecCode: boolean) {
  const course = commande.delivery;
  const depose = course?.proofType === "PHOTO";

  return {
    // Une vue choisie de la course : jamais l'objet entier, qui porte le code.
    delivery: course ? { status: course.status, proofType: course.proofType, proofAt: course.proofAt } : null,
    codeRemise:
      avecCode && course && course.status !== "DELIVERED" && course.deliveryCode ? course.deliveryCode : null,
    preuveDeLivraison: course?.proofType ?? null,
    // Adresse signée : la photo n'est plus servie sans contrôle, et une
    // balise <img> n'envoie pas de jeton.
    photoDepot: depose ? presenter(course?.proofPhoto) : null,
    noteDepot: depose ? course?.proofNote ?? null : null,
    livreurProche: Boolean(course?.nearCustomerNotifiedAt),
    // Le livreur attend à la porte : passé cette heure, la commande est
    // déposée en lieu sûr.
    attenteFinLe: course?.status === "PICKED_UP" ? finAttente(course) : null,
    maintenant: new Date(),
  };
}

function articles(commande: Lue) {
  return commande.items.map((ligne) => ({
    id: ligne.id,
    productId: ligne.productId,
    variantId: ligne.variantId,
    quantity: ligne.quantity,
    price: ligne.price,
    total: ligne.total,
    selectedOptions: ligne.selectedOptions,
    taxRate: ligne.taxRate,
    taxAmount: ligne.taxAmount,
    product: ligne.product
      ? { id: ligne.product.id, name: ligne.product.name, category: ligne.product.category }
      : null,
    variant: ligne.variant ? { id: ligne.variant.id, label: ligne.variant.label } : null,
  }));
}

function montants(commande: Lue) {
  return {
    totalAmount: commande.totalAmount,
    taxAmount: commande.taxAmount,
    taxRate: commande.taxRate,
    feesAmount: commande.feesAmount,
    serviceFeeAmount: commande.serviceFeeAmount,
    tipAmount: commande.tipAmount,
    promoCode: commande.promoCode,
    discountAmount: commande.discountAmount,
  };
}

/** La vue réduite, pour un visiteur qui présente le jeton de suivi. */
export function vuePublique(commande: Lue) {
  return {
    id: commande.id,
    storeId: commande.storeId,
    status: commande.status,
    paymentStatus: commande.paymentStatus,
    deliveryType: commande.deliveryType,
    pickupTime: commande.pickupTime,
    deliveryAddress: commande.deliveryAddress,
    deliveryCity: commande.deliveryCity,
    estimatedReadyAt: commande.estimatedReadyAt,
    acceptedAt: commande.acceptedAt,
    rejectionReason: commande.rejectionReason,
    rejectionNote: commande.rejectionNote,
    notes: commande.notes,
    createdAt: commande.createdAt,
    ...montants(commande),
    items: articles(commande),
    // Le code est celui que le client donne au livreur : c'est lui qui
    // détient le jeton.
    ...etatDeLaLivraison(commande, true),
  };
}

/** La vue complète, pour un appelant connecté et concerné. */
export function vueComplete(commande: Lue, avecCode: boolean) {
  return {
    id: commande.id,
    storeId: commande.storeId,
    status: commande.status,
    paymentStatus: commande.paymentStatus,
    submittedAt: commande.submittedAt,
    customerId: commande.customerId,
    customerName: commande.customerName,
    customerEmail: commande.customerEmail,
    customerPhone: commande.customerPhone,
    deliveryType: commande.deliveryType,
    deliveryMode: commande.deliveryMode,
    pickupTime: commande.pickupTime,
    deliveryAddress: commande.deliveryAddress,
    deliveryCity: commande.deliveryCity,
    deliveryPostal: commande.deliveryPostal,
    deliveryLat: commande.deliveryLat,
    deliveryLng: commande.deliveryLng,
    paymentMethodName: commande.paymentMethodName,
    notes: commande.notes,
    acceptedAt: commande.acceptedAt,
    preparationMinutes: commande.preparationMinutes,
    estimatedReadyAt: commande.estimatedReadyAt,
    rejectedAt: commande.rejectedAt,
    rejectionReason: commande.rejectionReason,
    rejectionNote: commande.rejectionNote,
    createdAt: commande.createdAt,
    updatedAt: commande.updatedAt,
    ...montants(commande),
    items: articles(commande),
    // Sans secret Stripe ni identifiant d'intention de paiement.
    payments: commande.payments.map((paiement) => ({
      id: paiement.id,
      amount: paiement.amount,
      currency: paiement.currency,
      status: paiement.status,
      paidAt: paiement.paidAt,
      refundedAt: paiement.refundedAt,
      refundedAmount: paiement.refundedAmount,
      createdAt: paiement.createdAt,
    })),
    ...etatDeLaLivraison(commande, avecCode),
  };
}

// ---------------------------------------------------------------------------
// Accès
// ---------------------------------------------------------------------------

export interface Appelant {
  userId?: string;
  compte?: Compte;
}

/** L'équipe de la plateforme : superowner, administrateur système, ou un rôle. */
const equipePlateforme = (compte?: Compte) =>
  Boolean(compte && (compte.isSuperOwner || compte.isSystemAdmin || Object.keys(compte.acces || {}).length > 0));

/** Ce qu'une commande doit porter pour décider qui la lit. */
interface Rattachement {
  trackingTokenHash: string | null;
  jetonsDeSuivi: { tokenHash: string }[];
  store: { orgId: string };
  customer: { userId: string | null } | null;
  delivery: { driver: { userId: string | null } | null } | null;
}

/**
 * Le droit de lecture de l'appelant :
 * - `complete` : client propriétaire, équipe du commerce ou de la plateforme
 *   (et, si `livreurAdmis`, le livreur de la course) ; `avecCode` dit s'il lit
 *   le code de remise ;
 * - `publique` : un visiteur qui présente un jeton de suivi valable ;
 * - `null` : personne — la route répond 404.
 *
 * Seule source de vérité des routes de suivi (commande et course).
 */
export type Acces = { vue: "complete"; avecCode: boolean; livreur: boolean } | { vue: "publique" } | null;

export async function evaluerAcces(
  commande: Rattachement,
  appelant: Appelant,
  jeton: unknown,
  options: { livreurAdmis?: boolean } = {}
): Promise<Acces> {
  if (appelant.userId) {
    const livreur = commande.delivery?.driver?.userId === appelant.userId;
    const proprietaire = Boolean(commande.customer?.userId) && commande.customer?.userId === appelant.userId;

    // Le livreur de la course ne lit jamais le code ici, même s'il est aussi
    // le client : il clôturerait la course sans passer à la porte.
    if (proprietaire) return { vue: "complete", avecCode: !livreur, livreur };

    if (equipePlateforme(appelant.compte)) return { vue: "complete", avecCode: false, livreur };

    const membre = await db.membership.findFirst({
      where: { userId: appelant.userId, orgId: commande.store.orgId },
      select: { id: true },
    });
    if (membre) return { vue: "complete", avecCode: false, livreur };

    // Le livreur suit sa course (position, destination), sans le code.
    if (livreur && options.livreurAdmis) return { vue: "complete", avecCode: false, livreur };

    // Connecté mais étranger à la commande : il lui reste le jeton de suivi,
    // comme à un visiteur — sauf au livreur de la course, qui n'obtient jamais
    // le code, quel que soit le chemin.
    if (livreur) return null;
  }

  const empreintes = [commande.trackingTokenHash, ...commande.jetonsDeSuivi.map((j) => j.tokenHash)];
  if (jetonReconnu(jeton, empreintes)) return { vue: "publique" };

  return null;
}

/**
 * La commande telle que l'appelant a le droit de la voir, ou `null` — qu'elle
 * n'existe pas ou qu'il ne puisse pas la lire : la route répond 404 dans les
 * deux cas.
 */
export async function commandeVisible(id: string, appelant: Appelant, jeton?: unknown) {
  const commande = await lireCommande(id);
  if (!commande) return null;

  const acces = await evaluerAcces(commande, appelant, jeton);
  if (!acces) return null;
  return acces.vue === "complete" ? vueComplete(commande, acces.avecCode) : vuePublique(commande);
}

// ---------------------------------------------------------------------------
// Suivi de la course
// ---------------------------------------------------------------------------

/** ≈ 110 m : assez pour voir le livreur approcher, pas pour le pister. */
export const arrondirPosition = (valeur: number | null | undefined) =>
  typeof valeur === "number" && Number.isFinite(valeur) ? Math.round(valeur * 1000) / 1000 : null;

/** La position du livreur ne se montre qu'en route vers le client. */
export const positionLivreurVisible = (statut: string | null | undefined) => statut === "PICKED_UP";

/**
 * La course telle que l'appelant a le droit de la suivre, par liste blanche.
 *
 * - `undefined` : commande inconnue ou appelant non admis (404) ;
 * - `null` : commande visible, pas encore de course.
 *
 * Un visiteur (jeton) ne lit jamais la destination réelle : seulement les
 * coordonnées obfusquées, `null` si elles manquent — jamais de repli sur le GPS
 * du domicile. La position du livreur n'est donnée qu'en PICKED_UP, arrondie
 * pour un visiteur.
 */
export async function courseVisible(orderId: string, appelant: Appelant, jeton?: unknown) {
  const commande = await db.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: {
      trackingTokenHash: true,
      jetonsDeSuivi: { select: { tokenHash: true } },
      store: { select: { orgId: true } },
      customer: { select: { userId: true } },
      delivery: {
        select: {
          status: true,
          pickupLat: true,
          pickupLng: true,
          deliveryLat: true,
          deliveryLng: true,
          deliveryLatObfusquee: true,
          deliveryLngObfusquee: true,
          driverLat: true,
          driverLng: true,
          driverLocationAt: true,
          driver: { select: { userId: true, name: true } },
        },
      },
    },
  });
  if (!commande) return undefined;

  const acces = await evaluerAcces(commande, appelant, jeton, { livreurAdmis: true });
  if (!acces) return undefined;

  const course = commande.delivery;
  if (!course) return null;

  const complet = acces.vue === "complete";
  const enRoute = positionLivreurVisible(course.status);

  return {
    orderId,
    status: course.status,
    pickupLat: course.pickupLat,
    pickupLng: course.pickupLng,
    deliveryLat: complet ? course.deliveryLat : course.deliveryLatObfusquee ?? null,
    deliveryLng: complet ? course.deliveryLng : course.deliveryLngObfusquee ?? null,
    driverLat: enRoute ? (complet ? course.driverLat ?? null : arrondirPosition(course.driverLat)) : null,
    driverLng: enRoute ? (complet ? course.driverLng ?? null : arrondirPosition(course.driverLng)) : null,
    driverLocationAt: enRoute ? course.driverLocationAt ?? null : null,
    driver: course.driver ? { name: course.driver.name } : null,
  };
}
