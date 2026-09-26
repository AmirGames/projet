/**
 * Les frais de service : 0,25 € par commande, payés par le client, pour la
 * plateforme — jamais pour le commerçant.
 *
 * Réglés dans la configuration de la plateforme, figés sur la commande,
 * annoncés au tunnel, hors de la commission et du chiffre du commerçant, hors
 * de sa facture, et réclamés sur son relevé du mois.
 *
 * La remise à zéro des vérifications les coupe (voir reinitialiser.mjs) : cette
 * suite les remet.
 */
import {
  check,
  titre,
  terminer,
  post,
  put,
  get,
  j,
  uniq,
  inscrire,
  inscrirePlateforme,
  sqlScalaire,
  sqlExec,
} from "./outils.mjs";

const plateforme = await inscrirePlateforme();
const TP = plateforme.accessToken;

const commercant = await inscrire("commercant");
const T = commercant.accessToken;
const orgId = commercant.organization.id;

const boutique = await j(
  await post("/api/stores", { orgId, name: `Bistrot ${uniq}`, slug: `bistrot-${uniq}`, phone: "0400000000" }, T)
);
const storeId = boutique.store?.id || boutique.id;

const produit = await j(
  await post("/api/products", { storeId, name: `Lasagnes ${uniq}`, price: 20, status: "ACTIVE" }, T)
);
const produitId = produit.product?.id || produit.id;

const commander = async () => {
  const reponse = await j(
    await post("/api/orders", { conditionsAcceptees: true,
      storeId,
      customerName: `Client ${uniq}`,
      customerEmail: `c-${uniq}@t.fr`,
      customerPhone: "0600000000",
      deliveryType: "PICKUP",
      totalAmount: 20,
      items: [{ productId: produitId, quantity: 1, price: 20 }],
    })
  );
  return reponse.order?.id || reponse.id;
};

const lire = (orderId, colonne) =>
  sqlScalaire(`SELECT "${colonne}"::text FROM "Order" WHERE id = '${orderId}'`);

// ===== Le réglage =====

titre("La plateforme règle ses frais de service");
const reglage = await put("/api/superowner/system-config", { serviceFee: 0.25 }, TP);
check("le réglage est accepté", reglage.status === 200, `statut ${reglage.status}`);
check("et relu", (await j(reglage))?.config?.serviceFee === 0.25, JSON.stringify((await j(reglage))?.config));

const refuse = await put("/api/superowner/system-config", { serviceFee: -1 }, TP);
check("un montant négatif est refusé", refuse.status === 400, `statut ${refuse.status}`);

const commerçantInterdit = await put("/api/superowner/system-config", { serviceFee: 0 }, T);
check("un commerçant ne peut pas les régler", commerçantInterdit.status === 403, `statut ${commerçantInterdit.status}`);

const annonce = await j(await get("/api/client/service-fee"));
check("le tunnel peut les annoncer", annonce?.data?.frais === 0.25, JSON.stringify(annonce));

// ===== La commande =====

titre("Le client les paie, en plus de son panier");
const id = await commander();
check("la commande est créée", typeof id === "string", `${id}`);
check("le total les ajoute", (await lire(id, "totalAmount")) === "20.25", await lire(id, "totalAmount"));
check("ils sont figés sur la commande", (await lire(id, "serviceFeeAmount")) === "0.25", await lire(id, "serviceFeeAmount"));

const vu = await j(await get(`/api/orders/${id}`));
check("le client les voit sur son suivi", Number(vu?.serviceFeeAmount) === 0.25, `${vu?.serviceFeeAmount}`);

titre("Ils ne comptent pas dans la commission");
const taux = Number(await lire(id, "commissionPercent"));
const attendue = ((20 * taux) / 100).toFixed(2);
check(
  "la commission porte sur 20 €, pas 20,25 €",
  (await lire(id, "commissionAmount")) === attendue,
  `${await lire(id, "commissionAmount")} ≠ ${attendue}`
);

titre("La facture du commerçant ne les porte pas");
const facture = await j(await get(`/api/invoices/${storeId}/${id}`, T));
check("son total est ce qu’il a vendu", facture?.total === 20, `${facture?.total}`);

titre("Changer le réglage ne réécrit pas les commandes passées");
await put("/api/superowner/system-config", { serviceFee: 0.5 }, TP);
check("l’ancienne garde 0,25 €", (await lire(id, "serviceFeeAmount")) === "0.25", await lire(id, "serviceFeeAmount"));
const id2 = await commander();
check("la nouvelle prend 0,50 €", (await lire(id2, "serviceFeeAmount")) === "0.50", await lire(id2, "serviceFeeAmount"));
check("et son total", (await lire(id2, "totalAmount")) === "20.50", await lire(id2, "totalAmount"));

// ===== L'argent =====

titre("Le commerçant les encaisse pour la plateforme");
// Une commande refusée est remboursée : seule une commande menée à terme doit
// ses frais.
await sqlExec(`UPDATE "Order" SET status = 'COMPLETED' WHERE id IN ('${id}', '${id2}')`);

const stats = await j(await get(`/api/order-management/${storeId}/stats/overview`, T));
check("son tableau de bord les met à part", stats?.platformServiceFees === 0.75, `${stats?.platformServiceFees}`);
check("son chiffre ne les compte pas", Math.abs(stats?.totalRevenue - 40) < 0.001, `${stats?.totalRevenue}`);

const facturation = await j(await get("/api/superowner/billing", TP));
const ligne = (facturation?.billings || []).find((l) => l.id === orgId);
check("la plateforme les lui réclame", ligne?.serviceFeesDue === 0.75, `${ligne?.serviceFeesDue}`);
check(
  "avec la commission, dans le total dû",
  Math.abs(ligne?.totalDue - (ligne?.amount + 0.75)) < 0.001,
  `${ligne?.totalDue} ≠ ${ligne?.amount} + 0,75`
);

const detail = await j(await get(`/api/superowner/billing/${orgId}`, TP));
const ligneCommande = (detail?.orders || []).find((l) => l.id === id);
check("le détail les porte par commande", ligneCommande?.serviceDu === 0.25, `${ligneCommande?.serviceDu}`);
check("et au total", detail?.summary?.serviceFees === 0.75, JSON.stringify(detail?.summary));

titre("Une commande refusée ne doit rien");
const id3 = await commander();
await sqlExec(`UPDATE "Order" SET status = 'REJECTED' WHERE id = '${id3}'`);
const apres = (await j(await get("/api/superowner/billing", TP)))?.billings?.find((l) => l.id === orgId);
check("toujours 0,75 € dus", apres?.serviceFeesDue === 0.75, `${apres?.serviceFeesDue}`);

titre("À 0 €, il n’y en a plus");
await put("/api/superowner/system-config", { serviceFee: 0 }, TP);
const id4 = await commander();
check("pas de frais", (await lire(id4, "serviceFeeAmount")) === "0.00", await lire(id4, "serviceFeeAmount"));
check("le total est celui du panier", (await lire(id4, "totalAmount")) === "20.00", await lire(id4, "totalAmount"));

await terminer();
