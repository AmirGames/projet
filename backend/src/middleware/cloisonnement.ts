import { Request, Response, NextFunction } from "express";

import { db } from "../services/db";
import { logger } from "../config/logger";
import { verifyToken } from "./auth";

/**
 * Chacun chez soi.
 *
 * Presque toutes les routes de l'espace commerçant acceptaient un `storeId` ou
 * un `orgId` sans vérifier qu'il appartenait bien à l'appelant : n'importe quel
 * compte pouvait créer un produit dans la boutique du voisin, lire ses
 * commandes, changer ses horaires, retarifer son catalogue. Deux routeurs sur
 * vingt-cinq faisaient le contrôle.
 *
 * Le corriger route par route aurait demandé une centaine de retouches, chacune
 * susceptible d'être oubliée. Le verrou est donc posé une fois, devant toute
 * l'API, et il cherche l'identifiant là où il se trouve :
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
  "/api/client",
  "/api/address",
  "/api/maps",
  "/api/payments",
];

/**
 * Hors de portée de ce verrou.
 *
 * L'administration de la plateforme travaille par définition sur les données
 * des autres ; ses routeurs ont leur propre contrôle (`isSuperOwner`,
 * `isSystemAdmin`). L'espace livreur est cloisonné par le livreur, pas par une
 * organisation.
 */
const CHEMINS_HORS_PORTEE = [
  "/api/superowner",
  "/api/admin",
  "/api/super-admin",
  "/api/drivers",
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
  // Commander, et suivre sa commande.
  { methode: "POST", chemin: /^\/api\/orders\/?$/ },
  { methode: "GET", chemin: /^\/api\/orders\/[^/]+$/ },
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
  { prefixe: "/api/products", modele: "product" },
  { prefixe: "/api/categories", modele: "category" },
  { prefixe: "/api/orders", modele: "order" },
  { prefixe: "/api/promotions", modele: "promotion" },
  { prefixe: "/api/delivery-zones", modele: "deliveryZone" },
];

// Le lien entre un identifiant et son organisation ne change jamais : le garder
// évite plusieurs requêtes par appel d'API.
const DUREE_CACHE_MS = 60000;
const orgParIdentifiant = new Map<string, { orgId: string | null; expireA: number }>();

export function oublierIdentifiant(id: string) {
  orgParIdentifiant.delete(id);
}

/**
 * L'organisation derrière un identifiant, qu'il désigne une boutique ou une
 * organisation. `null` quand il ne désigne ni l'une ni l'autre — un produit,
 * une commande, un mot de passe oublié : ce n'est pas notre affaire ici.
 */
async function orgDeLIdentifiant(id: string): Promise<string | null> {
  const connu = orgParIdentifiant.get(id);
  if (connu && Date.now() < connu.expireA) return connu.orgId;

  const boutique = await db.store.findUnique({ where: { id }, select: { orgId: true } });

  let orgId = boutique?.orgId ?? null;

  if (!orgId) {
    const organisation = await db.organization.findUnique({ where: { id }, select: { id: true } });
    orgId = organisation?.id ?? null;
  }

  orgParIdentifiant.set(id, { orgId, expireA: Date.now() + DUREE_CACHE_MS });

  return orgId;
}

/** Les organisations de l'appelant, résolues une fois par requête. */
async function sesOrganisations(userId: string): Promise<Set<string>> {
  const appartenances = await db.membership.findMany({
    where: { userId },
    select: { orgId: true },
  });

  return new Set(appartenances.map((appartenance) => appartenance.orgId));
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
async function orgDeLaRessource(req: Request): Promise<string | null | undefined> {
  const ressource = RESSOURCES.find((candidate) => req.path.startsWith(candidate.prefixe));
  if (!ressource) return undefined;

  // Le segment qui suit le préfixe : l'identifiant, s'il y en a un.
  const reste = req.path.slice(ressource.prefixe.length).replace(/^\//, "");
  const premier = reste.split("/")[0] || "";

  // Un segment vide, ou un mot-clé de route plutôt qu'un identifiant.
  if (!premier || !ressembleAUnId(premier)) return undefined;

  try {
    const delegue = (db as any)[ressource.modele];
    if (!delegue?.findUnique) return undefined;

    const trouvee = await delegue.findUnique({
      where: { id: premier },
      select: { store: { select: { orgId: true } } },
    });

    return trouvee ? trouvee.store?.orgId ?? null : null;
  } catch (err) {
    // Une ressource dont la forme ne correspond pas : on laisse la route
    // répondre elle-même plutôt que de bloquer à tort.
    logger.warn("Cloisonnement : ressource illisible", {
      chemin: req.path,
      error: err instanceof Error ? err.message : err,
    });
    return undefined;
  }
}

const refus = (res: Response) =>
  res.status(403).json({
    error: "Cette ressource appartient à un autre commerçant",
    code: "CROSS_TENANT_DENIED",
  });

export async function cloisonnement(req: Request, res: Response, next: NextFunction) {
  if (CHEMINS_PUBLICS.some((chemin) => req.path.startsWith(chemin))) return next();
  if (CHEMINS_HORS_PORTEE.some((chemin) => req.path.startsWith(chemin))) return next();

  const public_ = GESTES_PUBLICS.some(
    (geste) => geste.methode === req.method && geste.chemin.test(req.path)
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
    // La plateforme travaille sur les données des autres : c'est son rôle.
    const utilisateur = await db.user.findUnique({
      where: { id: charge.userId },
      select: { isSuperOwner: true, isSystemAdmin: true },
    });

    if (utilisateur?.isSuperOwner || utilisateur?.isSystemAdmin) return next();

    const corps = (req.body || {}) as Record<string, unknown>;

    const annonces = [
      identifiant(req.query?.storeId),
      identifiant(req.query?.orgId),
      identifiant(corps.storeId),
      identifiant(corps.orgId),
      ...segmentsIdentifiants(req.path),
    ].filter((valeur): valeur is string => valeur !== null);

    const orgDeLaCible = await orgDeLaRessource(req);

    // Rien à cloisonner sur cette requête.
    if (annonces.length === 0 && orgDeLaCible === undefined) return next();

    const siennes = await sesOrganisations(charge.userId);

    for (const id of new Set(annonces)) {
      const orgId = await orgDeLIdentifiant(id);

      // Un identifiant qui ne désigne ni boutique ni organisation, ou qui
      // n'existe pas : ce n'est pas une intrusion, la route rendra son 404.
      if (orgId === null) continue;

      if (!siennes.has(orgId)) {
        logger.warn("Cloisonnement : maison d'un autre commerçant", {
          chemin: req.path,
          id,
          userId: charge.userId,
        });
        return refus(res);
      }
    }

    // La ressource désignée par son propre identifiant.
    if (orgDeLaCible && !siennes.has(orgDeLaCible)) {
      logger.warn("Cloisonnement : ressource d'un autre commerçant", {
        chemin: req.path,
        userId: charge.userId,
      });
      return refus(res);
    }

    return next();
  } catch (err) {
    // Un incident de base ne doit pas ouvrir le verrou : on refuse, et la
    // trace dit pourquoi.
    logger.error("Cloisonnement illisible", {
      chemin: req.path,
      error: err instanceof Error ? err.message : err,
    });
    return refus(res);
  }
}
