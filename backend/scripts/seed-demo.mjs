/**
 * Jeu de démonstration : de quoi parcourir le site sans rien saisir.
 *
 *   node scripts/seed-demo.mjs
 *
 * Comptes créés, tous avec le mot de passe « Password123! » :
 *   super@demo.fr     plateforme (superowner)
 *   marchand@demo.fr  commerçant, formule Premium, deux boulangeries
 *   livreur@demo.fr   livreur, avec une course déjà livrée
 *
 * Suppose une API démarrée (VERIF_API_URL) et une base à part : le premier
 * compte inscrit devient la plateforme, ce qui n'arrive que sur une base
 * vierge. Remettre à zéro avec scripts/verification/reinitialiser.mjs.
 */

import { j, post, patch, sqlExec, API, validerLivreur, codeDeRemise } from "./verification/outils.mjs";

const attendu = (reponse, quoi) => {
  if (!reponse) throw new Error(`${quoi} : aucune réponse de ${API}`);
  return reponse;
};

// ===== Comptes =====

const plateforme = attendu(
  await j(
    await post("/api/auth/signup", {
      email: "super@demo.fr",
      password: "Password123!",
      name: "Super Demo",
    })
  ),
  "création de la plateforme"
);

if (!plateforme.accessToken) {
  throw new Error(
    "La plateforme n'a pas pu être créée : la base n'est probablement pas vierge.\n" +
      "Lancez d'abord node scripts/verification/reinitialiser.mjs"
  );
}

const commercant = await j(
  await post("/api/auth/signup", {
    email: "marchand@demo.fr",
    password: "Password123!",
    name: "Boulangerie Demo",
  })
);

const orgId = commercant.organization.id;
const jetonCommercant = commercant.accessToken;

// Deux boutiques exigent au moins la formule Premium.
await patch(
  `/api/superowner/organizations/${orgId}/tier`,
  { tier: "PREMIUM" },
  plateforme.accessToken
);

// ===== Boutiques et produits =====

const creerBoutique = async (name, slug, address, postalCode, phone) => {
  const reponse = await j(
    await post(
      "/api/stores",
      { orgId, name, slug, address, city: "Lyon", postalCode, phone },
      jetonCommercant
    )
  );
  return reponse.store?.id || reponse.id;
};

const centre = await creerBoutique(
  "Boulangerie Centre",
  "boulangerie-centre",
  "1 rue du Pain",
  "69001",
  "0400000001"
);

const gare = await creerBoutique(
  "Boulangerie Gare",
  "boulangerie-gare",
  "2 place Gare",
  "69003",
  "0400000002"
);

const produits = [
  [centre, "Baguette", 1.2],
  [gare, "Croissant", 1.5],
  [gare, "Pain au chocolat", 1.6],
  [gare, "Brioche", 4.5],
];

for (const [storeId, name, price] of produits) {
  await post("/api/products", { storeId, name, price, status: "ACTIVE" }, jetonCommercant);
}

// ===== Commandes =====

const commander = (storeId, totalAmount, customerEmail) =>
  post("/api/orders", {
    storeId,
    customerName: "Client",
    customerEmail,
    customerPhone: "0600000000",
    deliveryType: "PICKUP",
    totalAmount,
  });

await commander(centre, 12, "c1@demo.fr");
await commander(gare, 25, "c2@demo.fr");
await commander(gare, 33, "c3@demo.fr");
await commander(gare, 40, "c4@demo.fr");

// ===== Livreur, avec une course menée à son terme =====

const livreur = await j(
  await post("/api/drivers/register", {
    name: "Karim Livreur",
    email: "livreur@demo.fr",
    password: "Password123!",
    phone: "0611111111",
    vehicleType: "scooter",
    vehiclePlate: "AB-123-CD",
  })
);

// Un livreur s'inscrit en attente : la plateforme examine son dossier avant
// qu'il puisse prendre la moindre course.
await validerLivreur(livreur.accessToken, plateforme.accessToken);

const aLivrer = await j(
  await post("/api/orders", {
    storeId: gare,
    customerName: "Client Livraison",
    customerEmail: "livraison@demo.fr",
    customerPhone: "0600000000",
    deliveryType: "DELIVERY",
    deliveryAddress: "12 rue de la Gare",
    deliveryCity: "Lyon",
    totalAmount: 28,
    feesAmount: 4.5,
  })
);

// La course est créée en base : aucune route ne permet de la provoquer.
await sqlExec(
  `INSERT INTO "OrderDelivery" (id, "orderId", status, "createdAt", "updatedAt")
   VALUES ('course-demo', '${aLivrer.order.id}', 'PENDING', NOW(), NOW())`
);

await patch("/api/drivers/deliveries/course-demo/accept", null, livreur.accessToken);
await patch("/api/drivers/deliveries/course-demo", { status: "PICKED_UP" }, livreur.accessToken);
// La remise se prouve : le code de la course, comme le client le donnerait.
await patch(
  "/api/drivers/deliveries/course-demo",
  { status: "DELIVERED", code: await codeDeRemise("course-demo") },
  livreur.accessToken
);

console.log(`Jeu de démonstration en place sur ${API}

  super@demo.fr      plateforme
  marchand@demo.fr   commerçant — Boulangerie Centre, Boulangerie Gare
  livreur@demo.fr    livreur — dossier validé, une course livrée

  Mot de passe : Password123!`);

process.exit(0);
