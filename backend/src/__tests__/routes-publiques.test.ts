/**
 * Balayage des routes de l'API : toute route sans garde d'authentification
 * explicite doit figurer dans la liste ci-dessous, avec la raison pour laquelle
 * elle est ouverte.
 *
 * Ce test aurait détecté GET /api/stores/:id (qui renvoyait des commandes
 * clients à n'importe quel visiteur) : une route ajoutée ou rendue publique par
 * erreur fait échouer ce test, et la liste force une revue.
 *
 * Comment c'est mesuré : l'application réelle est construite (createApp) ; on
 * relève chaque route avec le préfixe où son routeur est monté, et les
 * middlewares qui la précèdent. Une route est « gardée » si elle, ou un
 * middleware placé avant elle dans son routeur, est l'un de GARDES. Les
 * contrôles faits DANS le handler (jeton de suivi, signature, propriétaire)
 * ne se voient pas d'ici : ces routes sont listées, avec leur raison, et ont
 * leurs propres tests.
 *
 * Ce que ça ne prouve pas : qu'une route « gardée » vérifie le bon droit
 * (cloisonnement par boutique, rôle) — c'est le rôle des tests de chaque module.
 */
import express from "express";
import { describe, expect, it } from "@jest/globals";

/** Les middlewares qui exigent une session valable (ou le superowner). */
const GARDES = new Set(["authMiddleware", "isSuperOwner", "superOwnerSeul", "autoriserCatalogue"]);

const SIGNATURE = "contrôlé dans le handler";
const VITRINE = "vitrine publique : données de présentation, sans donnée client";
const SUIVI = "session du client ou jeton de suivi, vérifiés dans le handler (404 sinon)";

/** « MÉTHODE chemin » → pourquoi la route est ouverte. */
export const ROUTES_PUBLIQUES: Record<string, string> = {
  // ── Santé et supervision
  "GET /health": "sonde de vie",
  "GET /health/ready": "sonde de disponibilité (base)",
  "POST /api/monitoring/client-errors": "erreurs du navigateur, limitées par IP, texte borné",

  // ── Ouvrir ou fermer une session
  "POST /api/auth/signup": "inscription (limiteur dédié)",
  "GET /api/auth/demo": "identifiants du commerce de démonstration, publics par nature",
  "POST /api/auth/login": "connexion (limiteurs IP et compte)",
  "POST /api/auth/refresh": "jeton de renouvellement présenté dans le corps ou le cookie",
  "POST /api/auth/logout": "ferme la session désignée par son jeton de renouvellement",
  "POST /api/auth/merchant-register": "inscription commerçant (limiteur dédié)",
  "POST /api/auth/forgot-password": "réponse uniforme, limiteurs IP et destinataire",
  "POST /api/auth/reset-password": "lien à jeton à usage unique",
  "POST /api/auth/verify-email": "lien à jeton à usage unique",
  "POST /api/auth/resend-verification": "réponse uniforme, limiteur dédié",
  "POST /api/sso/echanger": "code à usage unique, valable une minute, lié au domaine",
  "POST /api/sso/central/ouvrir": "ouverture de la session centrale (jeton et origine vérifiés)",
  "POST /api/sso/central/code": "code remis seulement à un domaine de la liste autorisée",

  // ── Fichiers
  "GET /api/files/^\\/([^/]+)\\/([^/]+)$/": "lien signé lié à une session, revérifié à chaque lecture",
  "GET /api/drivers/^\\/documents\\/file\\/(.+)$/": "ancienne adresse des pièces : même contrôle que /api/files",

  // ── Webhooks
  "POST /api/payments/webhook": "signature Stripe vérifiée sur le corps brut, événements dédupliqués",

  // ── Vitrine, catalogue et recherche
  "GET /api/organizations/slug/:slug": VITRINE,
  "GET /api/stores/types": VITRINE,
  "GET /api/stores/slug/:slug": VITRINE,
  "GET /api/products/:productId/variants": VITRINE,
  "GET /api/products/:id": VITRINE,
  "GET /api/products/store/:storeId": VITRINE,
  "GET /api/products/category/:categoryId": VITRINE,
  "GET /api/products/search/:storeId": VITRINE,
  "GET /api/categories/:id": VITRINE,
  "GET /api/categories/store/:storeId": VITRINE,
  "GET /api/reviews/:storeId/store/stats": "statistiques d'avis agrégées",
  "GET /api/promotions/active/:storeId": VITRINE,
  "POST /api/promotions/validate": "aperçu d'une remise (le calcul de la commande reste serveur)",
  "GET /api/pages-legales/": "textes légaux",
  "GET /api/pages-legales/:slug": "textes légaux",
  "GET /api/client/stores": VITRINE,
  "GET /api/client/stores/nearby": VITRINE,
  "GET /api/client/stores/search": VITRINE,
  "GET /api/client/stores/:id": VITRINE,
  "GET /api/client/stores/:id/pickup-slots": VITRINE,
  "GET /api/client/stores/:id/zone-livraison": VITRINE,
  "GET /api/client/stores/:id/zones": VITRINE,
  "GET /api/client/service-fee": "frais de service affichés au panier",
  "GET /api/client/stores/:id/payment-methods": VITRINE,
  "GET /api/client/stores/:id/menu": VITRINE,
  "GET /api/maps/nearby-stores": "vitrine, rayon et résultats bornés, limiteur dédié",
  "GET /api/maps/route": "calcul de distance, aucune donnée",
  "GET /api/maps/delivery-zone": "vitrine, limiteur dédié",
  "GET /api/maps/distance": "calcul de distance, aucune donnée",
  "GET /api/addresses/reverse": "relais d'adresses, limiteur dédié",
  "GET /api/addresses/search": "relais d'adresses, limiteur dédié",
  "GET /api/payments/config": "clé publique Stripe",

  // ── Commander, payer, suivre (invité ou connecté)
  "POST /api/orders/": "commande invitée ; montants recalculés par le serveur",
  "GET /api/orders/:id": SUIVI,
  "GET /api/orders/:id/delivery": SUIVI,
  "GET /api/orders/:id/pourboire": SUIVI,
  "POST /api/orders/:id/pourboire": SUIVI,
  "POST /api/orders/:id/reclamation-livraison": SUIVI,
  "POST /api/payments/intent": SUIVI,
  "POST /api/payments/confirm": SUIVI,
  "GET /api/payments/status/:paymentIntentId": SUIVI,

  // ── Inscription livreur
  "POST /api/drivers/register": "inscription d'un livreur : compte créé, dossier en attente de validation",

  // ── Assistant : session facultative ; visiteurs et connectés distingués dans le service,
  // passerelle signée par le site (Caddy bloque /api/assistant côté public).
  "GET /api/assistant/config": SIGNATURE,
  "GET /api/assistant/conversations": SIGNATURE,
  "POST /api/assistant/conversations": SIGNATURE,
  "GET /api/assistant/conversations/:id": SIGNATURE,
  "PATCH /api/assistant/conversations/:id/context": SIGNATURE,
  "POST /api/assistant/conversations/:id/messages": SIGNATURE,
  "POST /api/assistant/conversations/:id/tools": SIGNATURE,
  "POST /api/assistant/conversations/:id/actions/:actionId/confirm": SIGNATURE,
  "POST /api/assistant/conversations/:id/handoff": SIGNATURE,
  "DELETE /api/assistant/conversations/:id": SIGNATURE,
  "GET /api/assistant/admin/handoffs": "droit plateforme vérifié dans le service",
  "PATCH /api/assistant/admin/handoffs/:id": "droit plateforme vérifié dans le service",
};

interface RouteRelevee {
  cle: string;
  gardee: boolean;
}

/** Construit l'application réelle et relève ses routes. */
function releverLesRoutes(): RouteRelevee[] {
  // Express 5 compile le chemin de montage dans un « matcher » : on le retient
  // à l'appel de use(), avant la construction de l'application.
  const montages = new Map<unknown, string>();
  const enregistrer = (original: (...a: any[]) => any) =>
    function (this: unknown, ...args: any[]) {
      if (typeof args[0] === "string") {
        for (const a of args.slice(1)) if (typeof a === "function" && (a as any).stack) montages.set(a, args[0]);
      }
      return original.apply(this, args);
    };

  const routeurProto: any = (express.Router as any).prototype;
  const usageRouteur = routeurProto.use;
  const usageApp = (express as any).application.use;
  routeurProto.use = enregistrer(usageRouteur);
  (express as any).application.use = enregistrer(usageApp);

  let app: any;
  try {
    // Chargé après le remplacement : les routeurs montent leurs sous-routeurs à l'import.
    // (Pas d'isolateModules : il donnerait à l'application sa propre copie d'Express,
    // que le remplacement ci-dessus ne toucherait pas.)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    app = require("../app").createApp();
  } finally {
    routeurProto.use = usageRouteur;
    (express as any).application.use = usageApp;
  }

  const releve: RouteRelevee[] = [];
  const parcourir = (routeur: any, prefixe: string, avant: string[]) => {
    const precedents = [...avant];
    for (const couche of routeur.stack) {
      if (couche.route) {
        const noms = couche.route.stack.map((h: any) => h.handle.name || "anonyme");
        const gardee = [...precedents, ...noms].some((n) => GARDES.has(n));
        for (const methode of Object.keys(couche.route.methods)) {
          releve.push({ cle: `${methode.toUpperCase()} ${prefixe}${String(couche.route.path)}`, gardee });
        }
      } else if (couche.handle?.stack) {
        parcourir(couche.handle, prefixe + (montages.get(couche.handle) ?? "?"), precedents);
      } else {
        precedents.push(couche.handle?.name || "anonyme");
      }
    }
  };
  parcourir(app.router ?? app._router, "", []);
  return releve;
}

describe("routes de l'API sans garde d'authentification", () => {
  const routes = releverLesRoutes();
  const ouvertes = routes.filter((r) => !r.gardee).map((r) => r.cle);

  it("l'application expose bien ses routes (garde-fou du relevé)", () => {
    expect(routes.length).toBeGreaterThan(300);
    // Un préfixe de montage non retrouvé ferait passer des routes inconnues pour gardées.
    expect(routes.filter((r) => /^[A-Z]+ \?/.test(r.cle) || r.cle.includes("/?/")).map((r) => r.cle)).toEqual([]);
  });

  it("aucune route ouverte n'est absente de la liste revue", () => {
    const inconnues = ouvertes.filter((cle) => !(cle in ROUTES_PUBLIQUES));
    // Message d'aide : ajoutez la route à ROUTES_PUBLIQUES avec sa raison, ou gardez-la
    // par authMiddleware (ou un droit plus précis) si elle ne doit pas être publique.
    expect(inconnues).toEqual([]);
  });

  it("la liste ne garde pas de route disparue ou devenue gardée", () => {
    const obsoletes = Object.keys(ROUTES_PUBLIQUES).filter((cle) => !ouvertes.includes(cle));
    expect(obsoletes).toEqual([]);
  });

  it("chaque entrée de la liste dit pourquoi la route est ouverte", () => {
    for (const [cle, raison] of Object.entries(ROUTES_PUBLIQUES)) {
      expect({ cle, raison: raison.trim().length > 10 }).toEqual({ cle, raison: true });
    }
  });

  it("les routes d'administration, de gestion et des espaces pros sont toutes gardées", () => {
    const espaces = ["/api/superowner", "/api/admin", "/api/merchant-payouts", "/api/staff", "/api/order-management", "/api/store-settings", "/api/zupdrive/admin"];
    const ouvertesAdmin = ouvertes.filter((cle) => espaces.some((e) => cle.includes(` ${e}/`) || cle.endsWith(` ${e}`)));
    expect(ouvertesAdmin).toEqual([]);
  });
});
