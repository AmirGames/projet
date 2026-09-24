import { Request, Response, NextFunction } from "express";

import { db, surEcritureCommande, EcritureCommande } from "../services/db";
import { logger } from "../config/logger";
import { signalerModification, Destinataires, Modification } from "../config/socket";
import { verifyToken } from "./auth";

/**
 * Le site en temps réel.
 *
 * Chaque écran chargeait ses données une fois, à l'ouverture : une commande
 * acceptée par un collègue, un plat retiré, un livreur validé restaient
 * invisibles jusqu'au prochain rechargement. Prévenir route par route aurait
 * demandé une centaine de retouches, chacune susceptible d'être oubliée.
 *
 * Ce relais est donc posé une fois, devant toute l'API : après chaque écriture
 * réussie, il annonce « telle famille de données a changé, chez tel
 * commerçant ». Il n'envoie aucune donnée ; les écrans concernés se relisent
 * par l'API, qui applique ses propres droits.
 */

const ACTIONS: Record<string, Modification["action"]> = {
  POST: "creation",
  PUT: "modification",
  PATCH: "modification",
  DELETE: "suppression",
};

/**
 * Les écritures qui n'en sont pas, ou qui ont déjà leur propre canal.
 *
 * La position du livreur part toutes les quelques secondes et a son événement
 * dédié (`delivery-update`) : la relayer ici ferait relire tous les écrans
 * de la plateforme en permanence.
 */
const IGNOREES: RegExp[] = [
  /^\/api\/auth\//,
  /^\/api\/maps\//,
  /^\/api\/drivers\/location$/,
  /^\/api\/drivers\/push\//,
  /^\/api\/promotions?\/validate$/,
  /^\/api\/tax-settings\/[^/]+\/calculate$/,
];

/** Ce que la vitrine affiche : ses visiteurs sont prévenus aussi. */
const RESSOURCES_PUBLIQUES = new Set([
  "products",
  "categories",
  "stores",
  "store-hours",
  "store-settings",
  "delivery-zones",
  "promotions",
  "merchant-profile",
  "product-media",
  "product-tags",
  "reviews",
]);

/** Ce que le relais retient d'un identifiant : à qui il appartient. */
interface Localisation {
  orgId?: string;
  storeId?: string;
  /** L'identifiant de la donnée elle-même, quand elle est d'un type connu. */
  id?: string;
  /** L'identifiant désigne une commande : ceux qui la suivent sont prévenus. */
  orderId?: string;
  /** Les comptes à prévenir directement (un livreur n'a pas d'organisation). */
  emails?: string[];
}

/**
 * Comment remonter d'une donnée à ceux qu'elle concerne.
 *
 * Chaque modèle a son propriétaire : une boutique pour le catalogue, une
 * organisation pour les tickets, un compte pour le livreur et ses versements.
 */
type Localisateur = (id: string) => Promise<Localisation | null>;

const parBoutique =
  (modele: string, commande = false): Localisateur =>
  async (id) => {
    const trouvee = await (db as any)[modele].findUnique({
      where: { id },
      select: { storeId: true, store: { select: { orgId: true } } },
    });
    if (!trouvee?.store?.orgId) return null;
    return { id, orgId: trouvee.store.orgId, storeId: trouvee.storeId, orderId: commande ? id : undefined };
  };

const emailsDuLivreur = (livreur: { email: string; user: { email: string } | null } | null) =>
  livreur ? [...new Set([livreur.user?.email, livreur.email].filter((e): e is string => !!e))] : [];

const LOCALISATEURS: Record<string, Localisateur> = {
  product: parBoutique("product"),
  category: parBoutique("category"),
  order: parBoutique("order", true),
  promotion: parBoutique("promotion"),
  deliveryZone: parBoutique("deliveryZone"),
  review: parBoutique("review"),
  merchantTicket: async (id) => {
    const ticket = await db.merchantTicket.findUnique({ where: { id }, select: { orgId: true } });
    return ticket ? { id, orgId: ticket.orgId } : null;
  },
  driver: async (id) => {
    const livreur = await db.driver.findUnique({
      where: { id },
      select: { email: true, user: { select: { email: true } } },
    });
    return livreur ? { id, emails: emailsDuLivreur(livreur) } : null;
  },
  driverPayout: async (id) => {
    const versement = await db.driverPayout.findUnique({
      where: { id },
      select: { driver: { select: { email: true, user: { select: { email: true } } } } },
    });
    return versement ? { id, emails: emailsDuLivreur(versement.driver) } : null;
  },
};

/**
 * Les familles de routes : le nom annoncé aux écrans, et le modèle désigné
 * par les identifiants du chemin. La première qui correspond l'emporte.
 *
 * Sans entrée ici, la famille est le premier segment après /api/ — ce qui,
 * pour l'administration, ne dirait que « superowner » : l'écran des tickets ne
 * saurait pas que c'est un ticket.
 */
const ROUTES: { prefixe: string; ressource?: string; modele?: string }[] = [
  { prefixe: "/api/support/tickets", ressource: "tickets", modele: "merchantTicket" },
  { prefixe: "/api/superowner/support-tickets", ressource: "tickets", modele: "merchantTicket" },
  { prefixe: "/api/admin/tickets", ressource: "tickets", modele: "merchantTicket" },
  { prefixe: "/api/superowner/drivers", ressource: "drivers", modele: "driver" },
  { prefixe: "/api/superowner/driver-support", ressource: "driver-support", modele: "driver" },
  { prefixe: "/api/superowner/payouts", ressource: "payouts", modele: "driverPayout" },
  { prefixe: "/api/superowner/organizations", ressource: "organizations" },
  { prefixe: "/api/admin/merchants", ressource: "organizations" },
  { prefixe: "/api/superowner/stores", ressource: "stores" },
  { prefixe: "/api/products", modele: "product" },
  { prefixe: "/api/categories", modele: "category" },
  { prefixe: "/api/orders", modele: "order" },
  { prefixe: "/api/order-management", modele: "order" },
  { prefixe: "/api/promotions", modele: "promotion" },
  { prefixe: "/api/delivery-zones", modele: "deliveryZone" },
  { prefixe: "/api/reviews", modele: "review" },
];

/** La famille d'une route, et le modèle de ses identifiants. */
function familleDe(chemin: string): { ressource: string; modele?: string } | null {
  const route = ROUTES.find(
    (candidate) => chemin === candidate.prefixe || chemin.startsWith(candidate.prefixe + "/")
  );
  const ressource = route?.ressource ?? chemin.split("/")[2];
  return ressource ? { ressource, modele: route?.modele } : null;
}

// Le lien entre un identifiant et son propriétaire ne change pas : le garder
// évite de relire la base à chaque écriture.
const DUREE_CACHE_MS = 60000;
const cache = new Map<string, { valeur: Localisation | null; expireA: number }>();

const ressembleAUnId = (segment: string) => /^[a-z0-9]{20,}$/i.test(segment);

function identifiant(valeur: unknown): string | null {
  return typeof valeur === "string" && ressembleAUnId(valeur) && valeur.length < 64 ? valeur : null;
}

/** À qui appartient cet identifiant, s'il désigne quelque chose de connu. */
async function localiser(id: string, modele?: string): Promise<Localisation | null> {
  const cle = `${modele || ""}:${id}`;
  const connu = cache.get(cle);
  if (connu && Date.now() < connu.expireA) return connu.valeur;

  let valeur: Localisation | null = null;

  const boutique = await db.store.findUnique({ where: { id }, select: { id: true, orgId: true } });

  if (boutique) {
    valeur = { orgId: boutique.orgId, storeId: boutique.id };
  } else {
    const organisation = await db.organization.findUnique({ where: { id }, select: { id: true } });

    if (organisation) {
      valeur = { orgId: organisation.id };
    } else if (modele && LOCALISATEURS[modele]) {
      valeur = await LOCALISATEURS[modele](id);
    }
  }

  cache.set(cle, { valeur, expireA: Date.now() + DUREE_CACHE_MS });

  return valeur;
}

/** L'e-mail de l'appelant : ses autres onglets doivent suivre aussi. */
async function emailDeLAppelant(req: Request): Promise<string | null> {
  const entete = req.headers.authorization;
  if (!entete?.startsWith("Bearer ")) return null;

  try {
    const { userId } = verifyToken(entete.slice(7));
    if (!userId) return null;

    const utilisateur = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
    return utilisateur?.email ?? null;
  } catch {
    return null;
  }
}

const distincts = (valeurs: (string | undefined)[]) =>
  [...new Set(valeurs.filter((valeur): valeur is string => !!valeur))];

/** Qui prévenir, calculé avant que la route ne s'exécute. */
async function destinataires(req: Request, ressource: string, modele?: string) {
  const corps = (req.body || {}) as Record<string, unknown>;

  const candidats = new Set(
    [
      identifiant(req.query?.storeId),
      identifiant(req.query?.orgId),
      identifiant(corps.storeId),
      identifiant(corps.orgId),
      ...req.path.split("/").filter(ressembleAUnId),
    ].filter((valeur): valeur is string => valeur !== null)
  );

  const [email, ...localisations] = await Promise.all([
    emailDeLAppelant(req),
    ...[...candidats].map((id) => localiser(id, modele)),
  ]);

  const trouvees = localisations.filter((l): l is Localisation => l !== null);
  const storeIds = distincts(trouvees.map((l) => l.storeId));
  const orgIds = distincts(trouvees.map((l) => l.orgId));

  const cible: Destinataires = {
    plateforme: true,
    emails: distincts([email ?? undefined, ...trouvees.flatMap((l) => l.emails || [])]),
    orgIds,
    commandes: distincts(trouvees.map((l) => l.orderId)),
    boutiquesPubliques: RESSOURCES_PUBLIQUES.has(ressource) ? storeIds : [],
  };

  const modification: Modification = {
    ressource,
    action: ACTIONS[req.method],
    storeId: storeIds.length === 1 ? storeIds[0] : undefined,
    orgId: orgIds.length === 1 ? orgIds[0] : undefined,
  };

  // La donnée elle-même : une fiche ouverte ne se relit que pour elle.
  const id = trouvees.find((l) => l.id)?.id;
  if (id) modification.id = id;

  return { modification, cible };
}

export function diffusionModifications(req: Request, res: Response, next: NextFunction) {
  if (!ACTIONS[req.method]) return next();
  if (!req.path.startsWith("/api/")) return next();
  if (IGNOREES.some((motif) => motif.test(req.path))) return next();

  const famille = familleDe(req.path);
  if (!famille) return next();

  // Lancé tout de suite, sans retenir la requête : après une suppression, la
  // ressource n'existerait plus pour dire à qui elle appartenait.
  const envoi = destinataires(req, famille.ressource, famille.modele).catch((err) => {
    logger.warn("Temps réel : destinataires introuvables", {
      chemin: req.path,
      error: err instanceof Error ? err.message : err,
    });
    return null;
  });

  res.on("finish", () => {
    if (res.statusCode >= 400) return;

    envoi.then((resultat) => {
      if (resultat) void signalerModification(resultat.modification, resultat.cible);
    });
  });

  return next();
}

// ===== Les commandes, vues depuis la base =====

/** Les écritures d'une même commande, regroupées avant d'être annoncées. */
const REGROUPEMENT_MS = 150;
const enAttente = new Map<string, { ecriture: EcritureCommande; minuteur: NodeJS.Timeout }>();

/** Qui suit cette commande : son commerçant, son client, son livreur. */
async function annoncerCommande(ecriture: EcritureCommande) {
  const selection = {
    id: true,
    storeId: true,
    customerEmail: true,
    store: { select: { orgId: true } },
    delivery: { select: { driver: { select: { user: { select: { email: true } } } } } },
  } as const;

  const commande = ecriture.orderId
    ? await db.order.findUnique({ where: { id: ecriture.orderId }, select: selection })
    : ecriture.deliveryId
      ? (await db.orderDelivery.findUnique({ where: { id: ecriture.deliveryId }, select: { order: { select: selection } } }))?.order
      : null;

  // Une commande supprimée, ou une écriture groupée sur toute une boutique :
  // on sait au moins de quelle boutique il s'agit.
  const storeId = commande?.storeId ?? ecriture.storeId;
  const orgId =
    commande?.store.orgId ??
    (storeId ? (await db.store.findUnique({ where: { id: storeId }, select: { orgId: true } }))?.orgId : undefined);

  const orderId = commande?.id ?? ecriture.orderId;

  await signalerModification(
    { ressource: "orders", action: ecriture.action, id: orderId, storeId, orgId },
    {
      plateforme: true,
      orgIds: orgId ? [orgId] : [],
      commandes: orderId ? [orderId] : [],
      emails: [commande?.customerEmail, commande?.delivery?.driver?.user?.email].filter(
        (email): email is string => !!email
      ),
    }
  );
}

/**
 * Annonce toute écriture sur une commande, d'où qu'elle vienne.
 *
 * Une même action écrit souvent la commande, puis sa livraison, puis la
 * commande encore : on attend un court instant pour n'en faire qu'une
 * annonce — et pour que la transaction qui les porte soit validée avant que
 * les écrans ne relisent.
 */
export function brancherAnnoncesCommandes() {
  surEcritureCommande((ecriture) => {
    const cle = ecriture.orderId || ecriture.deliveryId || `store:${ecriture.storeId}`;
    const precedente = enAttente.get(cle);
    if (precedente) clearTimeout(precedente.minuteur);

    const retenue: EcritureCommande = {
      ...precedente?.ecriture,
      ...Object.fromEntries(Object.entries(ecriture).filter(([, valeur]) => valeur !== undefined)),
      // La création l'emporte : c'est ce que les écrans veulent savoir.
      action: precedente?.ecriture.action === "creation" ? "creation" : ecriture.action,
    };

    const minuteur = setTimeout(() => {
      enAttente.delete(cle);
      annoncerCommande(retenue).catch((err) =>
        logger.warn("Temps réel : commande non annoncée", {
          cle,
          error: err instanceof Error ? err.message : err,
        })
      );
    }, REGROUPEMENT_MS);

    enAttente.set(cle, { ecriture: retenue, minuteur });
  });
}
