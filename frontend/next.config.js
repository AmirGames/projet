const createNextIntlPlugin = require("next-intl/plugin");

// Pas de segment [locale] : déplacer les 80 et quelques pages dessous aurait
// été un chantier à part entière. La locale se lit dans un cookie, ou dans la
// région de l'adresse (/be-fr/…) que le middleware retire des pages
// publiques avant de les servir — voir i18n/request.ts et middleware.ts.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Le package-lock.json vide à la racine du dépôt ferait prendre `projet/`
  // pour la racine de l'application.
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
      "/admin": "/superowner",
      "/admin/dashboard": "/superowner",
      "/admin/super-owner": "/superowner",
      "/admin/analytics": "/superowner/analytics",
      "/admin/audit-logs": "/superowner/audit-logs",
      "/admin/commissions": "/superowner/billing",
      "/admin/merchants": "/superowner/organizations",
      "/admin/stores": "/superowner/stores",
      "/admin/tickets": "/superowner/support-tickets",
      "/admin/settings": "/superowner/system-config",
      "/admin/settings/admin-settings": "/superowner/system-config",
      "/super-admin": "/superowner",
      "/super-admin/access-logs": "/superowner/access-logs",
      "/super-admin/admin-management": "/superowner/user-management",
      "/super-admin/user-management": "/superowner/user-management",
      "/super-admin/analytics": "/superowner/analytics",
      "/super-admin/audit-logs": "/superowner/audit-logs",
      "/super-admin/commissions": "/superowner/billing",
      "/super-admin/exports": "/superowner/exports",
      "/super-admin/merchants": "/superowner/organizations",
      "/super-admin/notifications": "/superowner/notifications",
      "/super-admin/settings": "/superowner/system-config",
      "/super-admin/tickets": "/superowner/support-tickets",
      // Même liste de livreurs que /superowner/members/deliveries, sous un
      // second « Livreurs » dans le même menu.
      "/superowner/members/drivers": "/superowner/members/deliveries",
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

    return [
      ...Object.entries(versSuperowner).map(([source, destination]) => ({
        source,
        destination,
        permanent: true,
      })),
      {
        source: "/super-admin/merchants/:id",
        destination: "/superowner/organizations/:id",
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
