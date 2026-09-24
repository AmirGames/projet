import { Request, Response, NextFunction } from "express";

import { db } from "../services/db";
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

/**
 * Les ressources désignées par leur propre identifiant, et le modèle qui
 * mène de la ressource à sa boutique.
 */
const MODELES: Record<string, string> = {
  products: "product",
  categories: "category",
  orders: "order",
  "order-management": "order",
  promotions: "promotion",
  "delivery-zones": "deliveryZone",
  reviews: "review",
};

interface Localisation {
  orgId: string;
  storeId?: string;
  /** L'identifiant désigne une commande : ceux qui la suivent sont prévenus. */
  orderId?: string;
}

// Le lien entre un identifiant et son commerçant ne change pas : le garder
// évite de relire la base à chaque écriture.
const DUREE_CACHE_MS = 60000;
const cache = new Map<string, { valeur: Localisation | null; expireA: number }>();

const ressembleAUnId = (segment: string) => /^[a-z0-9]{20,}$/i.test(segment);

function identifiant(valeur: unknown): string | null {
  return typeof valeur === "string" && ressembleAUnId(valeur) && valeur.length < 64 ? valeur : null;
}

/** À quel commerçant appartient cet identifiant, s'il désigne quelque chose de connu. */
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
    } else if (modele) {
      const delegue = (db as any)[modele];
      const trouvee = delegue?.findUnique
        ? await delegue.findUnique({
            where: { id },
            select: { storeId: true, store: { select: { orgId: true } } },
          })
        : null;

      if (trouvee?.store?.orgId) {
        valeur = {
          orgId: trouvee.store.orgId,
          storeId: trouvee.storeId,
          orderId: modele === "order" ? id : undefined,
        };
      }
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
  const storeIds = [...new Set(trouvees.map((l) => l.storeId).filter((s): s is string => !!s))];

  const cible: Destinataires = {
    plateforme: true,
    emails: email ? [email] : [],
    orgIds: [...new Set(trouvees.map((l) => l.orgId))],
    commandes: trouvees.map((l) => l.orderId).filter((o): o is string => !!o),
    boutiquesPubliques: RESSOURCES_PUBLIQUES.has(ressource) ? storeIds : [],
  };

  const modification: Modification = {
    ressource,
    action: ACTIONS[req.method],
    storeId: storeIds.length === 1 ? storeIds[0] : undefined,
    orgId: cible.orgIds!.length === 1 ? cible.orgIds![0] : undefined,
  };

  const orderId = cible.commandes![0];
  if (orderId) modification.id = orderId;

  return { modification, cible };
}

export function diffusionModifications(req: Request, res: Response, next: NextFunction) {
  if (!ACTIONS[req.method]) return next();
  if (!req.path.startsWith("/api/")) return next();
  if (IGNOREES.some((motif) => motif.test(req.path))) return next();

  const ressource = req.path.split("/")[2];
  if (!ressource) return next();

  // Lancé tout de suite, sans retenir la requête : après une suppression, la
  // ressource n'existerait plus pour dire à qui elle appartenait.
  const envoi = destinataires(req, ressource, MODELES[ressource]).catch((err) => {
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
