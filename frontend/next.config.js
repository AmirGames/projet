const createNextIntlPlugin = require("next-intl/plugin");

// Pas de segment [locale] : déplacer les 80 et quelques pages dessous aurait
// été un chantier à part entière. La locale se lit dans un cookie, ou dans la
// région de l'adresse (/be-fr/…) que le proxy retire des pages
// publiques avant de les servir — voir i18n/request.ts et proxy.ts.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fixer explicitement le dossier du frontend comme racine de l'application.
  outputFileTracingRoot: __dirname,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      { hostname: "localhost" },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  },

  /**
   * En-têtes de sécurité du site.
   *
   * Appliqués en dur ici (HSTS est posé par Caddy, qui termine le HTTPS) :
   * - frame-ancestors : le site ne s'affiche dans le cadre d'aucun autre site
   *   (clickjacking) ; base-uri et object-src ferment deux injections classiques ;
   * - nosniff, Referrer-Policy : l'adresse complète d'une page (numéro de
   *   commande, jeton de suivi dans l'URL) ne part pas vers un autre site ;
   * - Permissions-Policy : ni caméra ni micro (rien ne les utilise), position
   *   et paiement pour le site seul.
   *
   * Le `script-src` n'est pas ici : il demande un nonce différent à chaque
   * requête, généré dans proxy.ts (lib/csp.ts). Il est d'abord envoyé en
   * Content-Security-Policy-Report-Only (CSP_MODE), les violations arrivant sur
   * /api/csp-report. Les directives ci-dessous restent appliquées dans tous les
   * cas.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), payment=(self)",
          },
        ],
      },
    ];
  },

  /**
   * Trois espaces d'administration coexistaient — /admin, /super-admin et
   * /superowner — avec les mêmes écrans en trois exemplaires. Tout est
   * désormais sous /superowner ; ces redirections gardent les anciennes
   * adresses vivantes, signets et raccourcis compris.
   *
   * Les pages /admin du catalogue et des commandes ne relevaient pas de
   * l'administration : elles pilotaient une boutique de démonstration codée
   * en dur. Elles renvoient vers l'espace commerçant, où ces écrans existent
   * pour de vrai, rattachés à la boutique choisie.
   */
  async redirects() {
    const versSuperowner = {
      "/admin": "/superowner/zupeat",
      "/admin/dashboard": "/superowner/zupeat",
      "/admin/super-owner": "/superowner/zupeat",
      "/admin/analytics": "/superowner/zupeat/analytics",
      "/admin/audit-logs": "/superowner/audit-logs",
      "/admin/commissions": "/superowner/zupeat/billing",
      "/admin/merchants": "/superowner/zupeat/organizations",
      "/admin/stores": "/superowner/zupeat/stores",
      "/admin/tickets": "/superowner/zupeat/support-tickets",
      "/admin/settings": "/superowner/system-config",
      "/admin/settings/admin-settings": "/superowner/system-config",
      "/super-admin": "/superowner/zupeat",
      "/super-admin/access-logs": "/superowner/access-logs",
      "/super-admin/admin-management": "/superowner/user-management",
      "/super-admin/user-management": "/superowner/user-management",
      "/super-admin/analytics": "/superowner/zupeat/analytics",
      "/super-admin/audit-logs": "/superowner/audit-logs",
      "/super-admin/commissions": "/superowner/zupeat/billing",
      "/super-admin/exports": "/superowner/zupeat/exports",
      "/super-admin/merchants": "/superowner/zupeat/organizations",
      "/super-admin/notifications": "/superowner/zupeat/notifications",
      "/super-admin/settings": "/superowner/system-config",
      "/super-admin/tickets": "/superowner/zupeat/support-tickets",
      // Même liste de livreurs que /superowner/members/deliveries, sous un
      // second « Livreurs » dans le même menu.
      "/superowner/members/drivers": "/superowner/zupeat/members/deliveries",
      "/superowner/zupeat/members/drivers": "/superowner/zupeat/members/deliveries",
    };

    const versCommercant = [
      "/admin/categories",
      "/admin/customers",
      "/admin/orders",
      "/admin/orders/:id",
      "/admin/products",
      "/admin/products/new",
      "/admin/products/:id",
    ];

    // Les pages ZupEat de l'administration vivent sous /superowner/zupeat,
    // à côté de /superowner/zupdrive. Les anciennes adresses restent
    // valables : favoris, et liens des notifications déjà envoyées.
    const pagesZupEat = [
      "organizations",
      "stores",
      "drivers",
      "payouts",
      "versements",
      "analytics",
      "billing",
      "formules",
      "financial-reports",
      "exports",
      "members",
      "support-tickets",
      "driver-support",
      "reviews",
      "notifications",
      "incidents-livraison",
    ];

    return [
      ...pagesZupEat.flatMap((page) => [
        { source: `/superowner/${page}`, destination: `/superowner/zupeat/${page}`, permanent: false },
        { source: `/superowner/${page}/:reste*`, destination: `/superowner/zupeat/${page}/:reste*`, permanent: false },
      ]),
      ...Object.entries(versSuperowner).map(([source, destination]) => ({
        source,
        destination,
        permanent: true,
      })),
      {
        source: "/super-admin/merchants/:id",
        destination: "/superowner/zupeat/organizations/:id",
        permanent: true,
      },
      ...versCommercant.map((source) => ({
        source,
        destination: "/merchant",
        permanent: true,
      })),
      // Première mouture de l'espace commerçant : sans menu, sans titre, et
      // un produit à désigner par son identifiant. Les mêmes écrans vivent
      // sous /merchant/:orgId, avec la liste des produits de la boutique.
      ...[
        ["notifications", "notifications"],
        ["product-media", "product-media"],
        ["product-seo", "product-seo"],
        ["product-tag", "product-tags"],
      ].map(([ancien, nouveau]) => ({
        source: `/:orgId/merchant/dashboard/${ancien}`,
        destination: `/merchant/:orgId/${nouveau}`,
        permanent: true,
      })),
    ];
  },
};

module.exports = withNextIntl(nextConfig);
