/**
 * Ce que la plateforme facture, et ce que le client paie.
 *
 * Deux défauts se tenaient dans les chiffres.
 *
 * La commission se recalculait à chaque affichage de la facturation, au taux de
 * la formule *actuelle* du commerçant. Changer sa formule refacturait tout son
 * mois — et tout mois rouvert plus tard — au nouveau taux : la plateforme
 * perdait de l'argent quand un commerçant descendait de formule, et en réclamait
 * indûment quand il montait.
 *
 * La taxe, elle, était prise du navigateur (`taxAmount`). Comme aucun écran ne
 * l'envoyait, toute commande naissait avec zéro de TVA : le taux réglé par le
 * commerçant ne servait à rien, et son ticket n'avait rien à montrer.
 *
 *   DATABASE_URL=... VERIF_API_URL=http://localhost:3099 \
 *     node scripts/verification/verif-argent.mjs
 */

import {
  check,
  titre,
  terminer,
  post,
  patch,
  get,
  j,
  uniq,
  inscrire,
  inscrirePlateforme,
  sqlScalaire,
  sqlExec,
} from "./outils.mjs";

// ===== Le décor =====

const plateforme = await inscrirePlateforme();
const TP = plateforme.accessToken;

const commercant = await inscrire("commercant");
const T = commercant.accessToken;
const orgId = commercant.organization.id;

const boutique = await j(
  await post("/api/stores", { orgId, name: `Bistrot ${uniq}`, slug: `bistrot-${uniq}`, phone: "0400000000" }, T)
);
const storeId = boutique.store?.id || boutique.id;

const categorie = await j(
  await post("/api/categories", { storeId, name: `Plats ${uniq}` }, T)
);
const categorieId = categorie.category?.id || categorie.id;

const produit = await j(
  await post(
    "/api/products",
    { storeId, categoryId: categorieId, name: `Lasagnes ${uniq}`, price: 20, status: "ACTIVE" },
    T
  )
);
const produitId = produit.product?.id || produit.id;

/** Passe une commande de `quantite` lasagnes, et rend la commande créée. */
const commander = async (quantite = 1) =>
  j(
    await post("/api/orders", {
      storeId,
      customerName: `Client ${uniq}`,
      customerEmail: `c-${uniq}@t.fr`,
      customerPhone: "0600000000",
      deliveryType: "PICKUP",
      totalAmount: 20 * quantite,
      items: [{ productId: produitId, quantity: quantite, price: 20 }],
    })
  );

const lire = async (orderId, colonne) =>
  sqlScalaire(`SELECT "${colonne}"::text FROM "Order" WHERE id = '${orderId}'`);

// ===== La taxe =====

titre("Sans taxe réglée, la commande n’en porte aucune");
const sansTaxe = await commander();
const idSansTaxe = sansTaxe.order?.id || sansTaxe.id;

check("la commande est créée", typeof idSansTaxe === "string", JSON.stringify(sansTaxe).slice(0, 200));
check("sa TVA est nulle", (await lire(idSansTaxe, "taxAmount")) === "0.00", await lire(idSansTaxe, "taxAmount"));
check("son total est celui des lignes", (await lire(idSansTaxe, "totalAmount")) === "20.00", await lire(idSansTaxe, "totalAmount"));

titre("Le commerçant règle sa TVA à 12 %");
const taxe = await post(`/api/tax-settings/${storeId}`, { name: `TVA ${uniq}`, rate: 12 }, T);
check("le réglage est accepté", taxe.status < 300, `statut ${taxe.status}`);

titre("La commande suivante la porte");
/**
 * Le prix affiché est TTC : la TVA s'extrait du total, elle ne s'y ajoute pas.
 * Ajouter 12 % au passage en caisse ferait payer au client autre chose que ce
 * qu'il a vu sur la carte. 12 % dans 20 € en font 2,14.
 */
const avecTaxe = await commander();
const idAvecTaxe = avecTaxe.order?.id || avecTaxe.id;

check("la TVA est calculée", (await lire(idAvecTaxe, "taxAmount")) === "2.14", await lire(idAvecTaxe, "taxAmount"));
check("son taux est conservé", (await lire(idAvecTaxe, "taxRate")) === "12.00", await lire(idAvecTaxe, "taxRate"));
// Le total ne bouge pas : la taxe était déjà dedans.
check("le total reste celui affiché", (await lire(idAvecTaxe, "totalAmount")) === "20.00", await lire(idAvecTaxe, "totalAmount"));

titre("Le ticket la montre");
const ticket = await j(await get(`/api/invoices/${storeId}/${idAvecTaxe}`, T));
check("la facture porte la TVA", ticket.tax === 2.14, `${ticket.tax}`);
check("et son taux", ticket.taxRate === 12, `${ticket.taxRate}`);
check("elle dit que la taxe est comprise", ticket.taxIncluded === true, `${ticket.taxIncluded}`);

titre("Changer le taux ne réécrit pas les tickets déjà remis");
// Un ticket remis au client est un document : son taux ne se réécrit pas.
const reglages = await j(await get(`/api/tax-settings/${storeId}`, T));
const reglageId = (reglages.data || reglages)[0]?.id;
await patch(`/api/tax-settings/${storeId}/${reglageId}`, { rate: 20 }, T);

check("l’ancienne commande garde 12 %", (await lire(idAvecTaxe, "taxRate")) === "12.00", await lire(idAvecTaxe, "taxRate"));
check("et son montant de TVA", (await lire(idAvecTaxe, "taxAmount")) === "2.14", await lire(idAvecTaxe, "taxAmount"));

const apresChangement = await commander();
const idApres = apresChangement.order?.id || apresChangement.id;
check("la nouvelle applique 20 %", (await lire(idApres, "taxRate")) === "20.00", await lire(idApres, "taxRate"));
check("soit 3,33 € sur 20 €", (await lire(idApres, "taxAmount")) === "3.33", await lire(idApres, "taxAmount"));

// ===== La commission =====

titre("La commission est figée sur la commande");
/**
 * Elle n'était nulle part : la facturation la recalculait à l'affichage. Une
 * commande doit porter le taux de la formule sous laquelle elle a été passée.
 */
const tauxFree = await sqlScalaire(`SELECT "commissionPercent"::text FROM "PlanTier" WHERE code = 'FREE'`);
const commande1 = await commander();
const id1 = commande1.order?.id || commande1.id;

check("le taux est inscrit", (await lire(id1, "commissionPercent")) === tauxFree, `${await lire(id1, "commissionPercent")} ≠ ${tauxFree}`);
check("la formule aussi", (await lire(id1, "tierAtOrder")) === "FREE", await lire(id1, "tierAtOrder"));

const montantAttendu = ((20 * Number(tauxFree)) / 100).toFixed(2);
check("et le montant retenu", (await lire(id1, "commissionAmount")) === montantAttendu, `${await lire(id1, "commissionAmount")} ≠ ${montantAttendu}`);

titre("La plateforme change la formule du commerçant");
const changement = await patch(`/api/superowner/organizations/${orgId}/tier`, { tier: "PRO" }, TP);
check("le changement passe", changement.status < 300, `statut ${changement.status}`);

const tauxPro = await sqlScalaire(`SELECT "commissionPercent"::text FROM "PlanTier" WHERE code = 'PRO'`);
check("les deux formules n’ont pas le même taux", tauxFree !== tauxPro, `${tauxFree} = ${tauxPro}`);

titre("L’ancienne commande garde l’ancien taux");
// C'est tout le sujet : sans cela, la plateforme refacture l'historique au
// nouveau taux — elle perd de l'argent dans un sens, en réclame dans l'autre.
check("son taux n’a pas bougé", (await lire(id1, "commissionPercent")) === tauxFree, await lire(id1, "commissionPercent"));
check("son montant non plus", (await lire(id1, "commissionAmount")) === montantAttendu, await lire(id1, "commissionAmount"));
check("et sa formule reste FREE", (await lire(id1, "tierAtOrder")) === "FREE", await lire(id1, "tierAtOrder"));

titre("La nouvelle commande prend le nouveau taux");
const commande2 = await commander();
const id2 = commande2.order?.id || commande2.id;

check("son taux est celui de PRO", (await lire(id2, "commissionPercent")) === tauxPro, await lire(id2, "commissionPercent"));
check("et sa formule aussi", (await lire(id2, "tierAtOrder")) === "PRO", await lire(id2, "tierAtOrder"));

titre("La facturation additionne les deux taux, pas un seul");
const facturation = await j(await get("/api/superowner/billing", TP));
const ligne = (facturation.billings || []).find((l) => l.id === orgId);

check("le commerçant est facturé", !!ligne, JSON.stringify(facturation.billings)?.slice(0, 300));

// La somme attendue : chaque commande à son propre taux.
const commissions = await sqlScalaire(
  `SELECT COALESCE(SUM("commissionAmount"), 0)::text FROM "Order" WHERE "storeId" = '${storeId}'`
);
check(
  "le montant est la somme des commissions figées",
  Math.abs(Number(ligne?.amount) - Number(commissions)) < 0.01,
  `${ligne?.amount} ≠ ${commissions}`
);

check("et le changement de formule est signalé", ligne?.tierChangedDuringPeriod === true, `${ligne?.tierChangedDuringPeriod}`);
check(
  "les deux taux appliqués sont nommés",
  (ligne?.commissionRates || []).length === 2,
  JSON.stringify(ligne?.commissionRates)
);

titre("Redescendre de formule ne rend pas l’argent déjà gagné");
await patch(`/api/superowner/organizations/${orgId}/tier`, { tier: "FREE" }, TP);

const facturationApres = await j(await get("/api/superowner/billing", TP));
const ligneApres = (facturationApres.billings || []).find((l) => l.id === orgId);

check(
  "le montant facturé est inchangé",
  Math.abs(Number(ligneApres?.amount) - Number(commissions)) < 0.01,
  `${ligneApres?.amount} ≠ ${commissions}`
);

titre("Une commande d’avant le figeage reste facturable");
/**
 * Les commandes antérieures à ce changement n'ont pas de taux figé. Elles ne
 * doivent pas disparaître de la facturation : à défaut de mieux, on retombe sur
 * la formule du jour.
 */
const ancienne = await commander();
const idAncienne = ancienne.order?.id || ancienne.id;
await sqlExec(
  `UPDATE "Order" SET "commissionAmount" = 0, "commissionPercent" = 0, "tierAtOrder" = NULL WHERE id = '${idAncienne}'`
);

const facturationMixte = await j(await get("/api/superowner/billing", TP));
const ligneMixte = (facturationMixte.billings || []).find((l) => l.id === orgId);

const attenduAvecAncienne = Number(commissions) + (20 * Number(tauxFree)) / 100;
check(
  "elle est comptée au taux du jour",
  Math.abs(Number(ligneMixte?.amount) - attenduAvecAncienne) < 0.01,
  `${ligneMixte?.amount} ≠ ${attenduAvecAncienne}`
);

await terminer();
