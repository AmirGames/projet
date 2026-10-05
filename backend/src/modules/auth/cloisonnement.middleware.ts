import { Request, Response, NextFunction } from "express";

import { cheminDecode, sousChemin } from "../../utils/chemin";
import { db } from "../../services/db";
import { SecurityEventService } from "./security-event.service";
import { logger } from "../../config/logger";
import { compteDuJeton, verifyToken } from "./auth.middleware";

/**
 * Chacun chez soi.
 *
 * Presque toutes les routes de l'espace commerçant acceptaient un `storeId` ou
 * un `orgId` sans vérifier qu'il appartenait bien à l'appelant : n'importe quel
 * compte pouvait créer un produit dans la boutique du voisin, lire ses
 * commandes, changer ses horaires, retarifer son catalogue. Deux routeurs sur
 * vingt-cinq faisaient le contrôle.
 *
 * Ce verrou global reste une protection supplémentaire. Le personnel et le
 * catalogue appliquent aussi leurs contrôles locaux avec le périmètre de
 * boutiques et le rôle de l'appelant. Ici, on cherche l'identifiant :
 *
 * - dans le chemin, à n'importe quel segment (`/api/store-hours/:storeId/day`,
 *   `/api/products/low-stock/by-store/:storeId`),
 * - dans la requête (`?storeId=`, `?orgId=`),
 * - dans le corps (`{ storeId }`, `{ orgId }`),
 * - et, pour les ressources désignées par leur propre identifiant
 *   (`PUT /api/products/:id`), en remontant de la ressource à son organisation.
 */

/** Ouvert à tous : la vitrine, la connexion, les services sans locataire. */
const CHEMINS_PUBLICS = [
  "/health",
  "/api/auth",
  "/api/sso",
  "/api/client",
  "/api/address",
  "/api/maps",
  // Seuls la configuration et le webhook (signé) sont publics ; les autres
  // routes de paiement vérifient elles-mêmes l'appelant (GESTES_PUBLICS).
  "/api/payments/config",
  "/api/payments/webhook",
];

/**
 * Hors de portée de ce verrou.
 *
 * L'administration de la plateforme travaille par définition sur les données
 * des autres ; ses routeurs ont leur propre contrôle (`isSuperOwner`,
 * `isSystemAdmin`). L'espace livreur est cloisonné par le livreur, pas par une
 * organisation ; de même le dossier chauffeur ZupDrive, toujours celui du
 * compte connecté, et son administration (permissions de la plateforme DRIVE).
 */
const CHEMINS_HORS_PORTEE = [
  "/api/superowner",
  "/api/admin",
  "/api/drivers",
  "/api/zupdrive",
  "/api/notifications",
  "/api/support",
];

/**
 * Les gestes que la vitrine fait déjà sans compte.
 *
 * Ces routes n'exigent aucun jeton : un visiteur anonyme les appelle et obtient
 * la même réponse. Les verrouiller pour un appelant connecté ne protège donc
 * rien — cela casse seulement la vitrine pour un client qui s'est identifié, ou
 * pour un commerçant qui commande chez un confrère. C'est exactement ce qui
 * était arrivé au suivi de commande : le client connecté était refusé là où le
 * visiteur passait.
 *
 * Ajouter une entrée ici veut dire « cette route est publique ». Si elle ne
 * doit pas l'être, la place du correctif est dans le routeur, avec
 * `authMiddleware`, pas dans cette liste.
 */
const GESTES_PUBLICS: { methode: string; chemin: RegExp }[] = [
  // Commander, et suivre sa commande. Le suivi n'est pas ouvert pour autant :
  // la route vérifie elle-même l'appelant ou le jeton de suivi, et répond 404
  // à tout autre (voir services/suivi-commande.service.ts).
  { methode: "POST", chemin: /^\/api\/orders\/?$/ },
  { methode: "GET", chemin: /^\/api\/orders\/[^/]+$/ },
  { methode: "GET", chemin: /^\/api\/orders\/[^/]+\/delivery$/ },
  // Le pourboire après livraison, depuis le lien de suivi.
  { methode: "GET", chemin: /^\/api\/orders\/[^/]+\/pourboire$/ },
  { methode: "POST", chemin: /^\/api\/orders\/[^/]+\/pourboire$/ },
  // Payer sa commande : la route exige la session du client ou le jeton de
  // suivi, et répond 404 à tout autre (voir modules/payments/payment.routes.ts).
  { methode: "POST", chemin: /^\/api\/payments\/(intent|confirm)$/ },
  { methode: "GET", chemin: /^\/api\/payments\/status\/[^/]+$/ },
  // Le menu et le détail d'un plat, tels que la vitrine les lit.
  { methode: "GET", chemin: /^\/api\/products\/[^/]+$/ },
  { methode: "GET", chemin: /^\/api\/products\/[^/]+\/variants$/ },
  { methode: "GET", chemin: /^\/api\/products\/(store|search|category)\/[^/]+$/ },
  { methode: "GET", chemin: /^\/api\/categories\/[^/]+$/ },
  { methode: "GET", chemin: /^\/api\/categories\/store\/[^/]+$/ },
  { methode: "GET", chemin: /^\/api\/promotions\/active\/[^/]+$/ },
  { methode: "POST", chemin: /^\/api\/promotions\/validate$/ },
  // La boutique et sa devanture.
  { methode: "GET", chemin: /^\/api\/stores\/[^/]+$/ },
  { methode: "GET", chemin: /^\/api\/stores\/slug\/[^/]+$/ },
  { methode: "GET", chemin: /^\/api\/stores\/org\/[^/]+$/ },
  { methode: "GET", chemin: /^\/api\/organizations\/slug\/[^/]+$/ },
];

/**
 * Les ressources désignées par leur propre identifiant, et le chemin qui mène
 * de la ressource à son organisation.
 *
 * `PUT /api/products/:id` ne porte aucun storeId : il faut lire le produit pour
 * savoir à qui il appartient. Les boutiques et les organisations n'y figurent
 * pas : leurs identifiants sont reconnus par la fouille du chemin.
 */
const RESSOURCES: {
  prefixe: string;
  /** Nom du délégué Prisma. */
  modele: string;
}[] = [
  { prefixe: "/api/staff", modele: "staff" },
  { prefixe: "/api/products", modele: "product" },
  { prefixe: "/api/categories", modele: "category" },
  { prefixe: "/api/orders", modele: "order" },
  { prefixe: "/api/promotions", modele: "promotion" },
  { prefixe: "/api/delivery-zones", modele: "deliveryZone" },
];

interface Cible { orgId: string; storeId?: string }

/** Compatibilité avec les appelants historiques ; le propriétaire n'est plus mis en cache. */
export function oublierIdentifiant(_id: string) {}

// Relire le propriétaire : une ressource déplacée ne conserve pas son ancien périmètre.
async function cibleDeLIdentifiant(id: string): Promise<Cible | null> {
  const store = await db.store.findUnique({ where: { id }, select: { id: true, orgId: true } });
  if (store) return { orgId: store.orgId, storeId: id };
  const organization = await db.organization.findUnique({ where: { id }, select: { id: true } });
  return organization ? { orgId: organization.id } : null;
}

/** Une valeur qui ressemble à un identifiant, ou rien. */
function identifiant(valeur: unknown): string | null {
  return typeof valeur === "string" && valeur.length > 0 && valeur.length < 64 ? valeur : null;
}

/** Ressemble-t-il à un identifiant de base, et non à un mot-clé de route. */
const ressembleAUnId = (segment: string) => /^[a-z0-9]{20,}$/i.test(segment);

/**
 * Tous les segments du chemin qui ressemblent à un identifiant.
 *
 * Monté globalement, ce verrou passe avant que le routeur ne reconnaisse la
 * route : `req.params` est vide. On découpe donc le chemin soi-même, et on ne
 * présume pas de la position — un storeId se cache aussi bien en premier
 * (`/api/store-hours/:storeId`) qu'en dernier
 * (`/api/products/low-stock/by-store/:storeId`).
 */
function segmentsIdentifiants(chemin: string): string[] {
  return [...new Set(chemin.split("/").filter(ressembleAUnId))];
}

/**
 * L'organisation propriétaire de la ressource visée par son identifiant.
 *
 * Rend `undefined` quand la route ne désigne pas une ressource connue, et
 * `null` quand la ressource n'existe pas — deux cas à traiter différemment.
 */
async function cibleDeLaRessource(chemin: string): Promise<Cible | null | undefined> {
  const ressource = RESSOURCES.find((candidate) => sousChemin(chemin, candidate.prefixe));
  if (!ressource) return undefined;

  // Le segment qui suit le préfixe : l'identifiant, s'il y en a un.
  const reste = chemin.slice(ressource.prefixe.length).replace(/^\//, "");
  const premier = reste.split("/")[0] || "";

  // Un segment vide, ou un mot-clé de route plutôt qu'un identifiant.
  if (!premier || !ressembleAUnId(premier)) return undefined;

  try {
    const delegue = (db as any)[ressource.modele];
    if (!delegue?.findUnique) throw new Error("Ressource non vérifiable");

    const trouvee = await delegue.findUnique({
      where: { id: premier },
      select: { storeId: true, store: { select: { orgId: true } } },
    });

    if (!trouvee) return null;
    if (!trouvee.store?.orgId || !trouvee.storeId) throw new Error("Propriétaire de la ressource inconnu");
    return { orgId: trouvee.store.orgId, storeId: trouvee.storeId };
  } catch (err) {
    // Un contrôle illisible ne doit pas autoriser la requête.
    logger.warn("Cloisonnement : ressource illisible", {
      chemin,
      error: err instanceof Error ? err.message : err,
    });
    throw err;
  }
}

const refus = (req: Request, res: Response) => {
  SecurityEventService.record({ action: "CROSS_TENANT_DENIED", actor: req.userId || "anonymous",
    severity: "HIGH", status: "FAILED", ipAddress: req.ip, details: req.path });
  return res.status(403).json({
    error: "Accès à cette ressource refusé",
    code: "CROSS_TENANT_DENIED",
  });
};

export async function cloisonnement(req: Request, res: Response, next: NextFunction) {
  const cheminRequete = cheminDecode(req.path);
  if (CHEMINS_PUBLICS.some((chemin) => sousChemin(cheminRequete, chemin))) return next();
  if (CHEMINS_HORS_PORTEE.some((chemin) => sousChemin(cheminRequete, chemin))) return next();

  const public_ = GESTES_PUBLICS.some(
    (geste) => geste.methode === req.method && geste.chemin.test(cheminRequete.toLowerCase())
  );
  if (public_) return next();

  const entete = req.headers.authorization;
  if (!entete?.startsWith("Bearer ")) return next();

  let charge;
  try {
    charge = verifyToken(entete.slice(7));
  } catch {
    // Jeton illisible : le middleware d'authentification rendra son 401.
    return next();
  }

  if (!charge?.userId) return next();

  try {
    // La plateforme travaille sur les données des autres : c'est son rôle. Le
    // compte est lu par le même cache que le middleware d'authentification, qui
    // passera juste après : la requête ne le lit donc qu'une fois.
    const compte = await compteDuJeton(charge.userId);
    req.userId = charge.userId;

    if (compte?.isSuperOwner) return next();

    const corps = (req.body || {}) as Record<string, unknown>;

    const annonces = [
      identifiant(req.query?.storeId),
      identifiant(req.query?.orgId),
      identifiant(corps.storeId),
      identifiant(corps.orgId),
      ...segmentsIdentifiants(cheminRequete),
    ].filter((valeur): valeur is string => valeur !== null);

    const cibleRessource = await cibleDeLaRessource(cheminRequete);

    // Rien à cloisonner sur cette requête.
    if (annonces.length === 0 && cibleRessource === undefined) return next();

    const memberships = await db.membership.findMany({
      where: { userId: charge.userId },
      select: { orgId: true, role: true, storeIds: true },
    });
    const personnel = sousChemin(cheminRequete, "/api/staff");
    const gestionCatalogue = req.method !== "GET" &&
      ["/api/products", "/api/categories"].some(prefix => sousChemin(cheminRequete, prefix));
    // Ces agrégats sont filtrés par boutique dans leurs services.
    const agregatFiltre = req.method === "GET" &&
      (/^\/api\/(staff|products|categories)\/?$/i.test(cheminRequete) ||
       /^\/api\/products\/low-stock\/by-org\/[^/]+$/i.test(cheminRequete));
    const autorisee = (cible: Cible) => memberships.some(membership => {
      if (membership.orgId !== cible.orgId) return false;
      if (membership.role === "ADMIN") return true;
      if (membership.role !== "STORE_MANAGER" && membership.role !== "STORE_STAFF") return false;
      if ((personnel || gestionCatalogue) && membership.role !== "STORE_MANAGER") return false;
      if (cible.storeId) return membership.storeIds.includes(cible.storeId);
      return agregatFiltre && membership.storeIds.length > 0;
    });
    for (const id of new Set(annonces)) {
      const cible = await cibleDeLIdentifiant(id);
      if (cible && !autorisee(cible)) return refus(req, res);
    }
    if (cibleRessource && !autorisee(cibleRessource)) return refus(req, res);

    return next();
  } catch (err) {
    // Un incident de base ne doit pas ouvrir le verrou : on refuse, et la
    // trace dit pourquoi.
    logger.error("Cloisonnement illisible", {
      chemin: req.path,
      error: err instanceof Error ? err.message : err,
    });
    return refus(req, res);
  }
}
