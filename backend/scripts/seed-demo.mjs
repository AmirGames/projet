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

import { j, post, patch, sqlExec, sqlScalaire, API, validerLivreur, codeDeRemise, inscription } from "./verification/outils.mjs";

const attendu = (reponse, quoi) => {
  if (!reponse) throw new Error(`${quoi} : aucune réponse de ${API}`);
  return reponse;
};

// ===== Comptes =====

const plateforme = attendu(
  await j(
    await inscription({
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
  await inscription({
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

// Une boutique naît fermée et sans position : une commande à livrer serait
// refusée, et la vitrine n'aurait rien à montrer sur la carte.
await sqlExec(
  `UPDATE "Store" SET "isOpen" = true, "acceptsDelivery" = true,
     latitude = 45.7640, longitude = 4.8357 WHERE "orgId" = '${orgId}'`
);

// La livraison est refusée hors des horaires : la boutique de la course de
// démonstration ouvre jour et nuit, pour que le jeu se crée à toute heure.
const jourEtNuit = Object.fromEntries(
  ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((jour) => [
    jour,
    { closed: false, plages: [{ open: "00:00", close: "00:00" }] },
  ])
);
await sqlExec(
  `UPDATE "Store" SET "operatingHours" = '${JSON.stringify(jourEtNuit)}'::jsonb WHERE id = '${gare}'`
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

/**
 * Avec Stripe actif, tout ce qui n'est pas en espèces attend l'encaissement
 * avant de parvenir au commerçant. La démo n'a pas de vraie carte : elle
 * marque la commande payée et transmise, comme le ferait le webhook.
 */
const payer = async (reponse) => {
  const commande = (await j(reponse))?.order;
  if (commande?.paiementEnLigne) {
    await sqlExec(
      `UPDATE "Order" SET "paymentStatus" = 'SUCCEEDED', "submittedAt" = NOW() WHERE id = '${commande.id}'`
    );
  }
  return commande;
};

const commander = async (storeId, totalAmount, customerEmail) =>
  payer(
    await post("/api/orders", {
      storeId,
      customerName: "Client",
      customerEmail,
      customerPhone: "0600000000",
      deliveryType: "PICKUP",
      totalAmount,
    })
  );

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

// Il se met en ligne à côté des boutiques : c'est au livreur disponible le
// plus proche que la course est proposée.
await patch("/api/drivers/availability", { isOnline: true }, livreur.accessToken);
await patch("/api/drivers/location", { latitude: 45.764, longitude: 4.8357 }, livreur.accessToken);

const aLivrer = attendu(
  await payer(
    await post("/api/orders", {
      storeId: gare,
      customerName: "Client Livraison",
      customerEmail: "livraison@demo.fr",
      customerPhone: "0600000000",
      deliveryType: "DELIVERY",
      deliveryAddress: "12 avenue Thiers",
      deliveryCity: "Lyon",
      deliveryLat: 45.78,
      deliveryLng: 4.86,
      totalAmount: 28,
      feesAmount: 4.5,
    })
  ),
  "commande à livrer"
);
const aLivrerId = aLivrer.id;

// Chaque étape est vérifiée : un jeu à moitié créé annoncerait une course
// livrée qui n'existe pas.
const etape = async (reponse, quoi) => {
  if (!reponse.ok) {
    throw new Error(`${quoi} : statut ${reponse.status} — ${await reponse.text()}`);
  }
  return j(reponse);
};

// Le commerçant l'accepte et la met en préparation : c'est là que le livreur
// est appelé. Elle est ensuite déclarée prête, seule condition pour partir.
await etape(
  await post(`/api/order-management/${gare}/${aLivrerId}/accept`, { preparationMinutes: 15 }, jetonCommercant),
  "acceptation par le commerçant"
);
for (const status of ["PREPARING", "READY"]) {
  await etape(
    await patch(`/api/order-management/${gare}/${aLivrerId}/status`, { status }, jetonCommercant),
    `commande passée à ${status}`
  );
}

// L'appel du livreur est automatique ; s'il n'a pas eu lieu, on le provoque.
let courseId = await sqlScalaire(`SELECT id FROM "OrderDelivery" WHERE "orderId" = '${aLivrerId}'`);
if (!courseId) {
  const attribution = await etape(
    await post(`/api/orders/${aLivrerId}/dispatch`, {}, jetonCommercant),
    "proposition de la course"
  );
  courseId = attribution?.data?.deliveryId;
}

await etape(
  await patch(`/api/drivers/deliveries/${courseId}/accept`, null, livreur.accessToken),
  "acceptation de la course"
);
await etape(
  await patch(`/api/drivers/deliveries/${courseId}`, { status: "PICKED_UP" }, livreur.accessToken),
  "retrait au commerce"
);
// La remise se prouve : le code de la course, comme le client le donnerait.
await etape(
  await patch(
    `/api/drivers/deliveries/${courseId}`,
    { status: "DELIVERED", code: await codeDeRemise(courseId) },
    livreur.accessToken
  ),
  "remise au client"
);

console.log(`Jeu de démonstration en place sur ${API}

  super@demo.fr      plateforme
  marchand@demo.fr   commerçant — Boulangerie Centre, Boulangerie Gare
  livreur@demo.fr    livreur — dossier validé, une course livrée

  Mot de passe : Password123!`);

process.exit(0);
