/**
 * Le paiement par carte : une commande n'arrive au commerçant qu'une fois
 * encaissée.
 *
 * Payée par carte, elle naît sans être transmise : ni liste, ni acceptation,
 * ni délai de réponse. C'est le webhook Stripe, signé, qui la lui transmet —
 * une seule fois, même si Stripe renvoie l'événement. Payée sur place, elle
 * part tout de suite, comme avant.
 *
 * Les événements sont signés ici avec le secret du webhook : l'API et cette
 * suite doivent partager le même `STRIPE_WEBHOOK_SECRET`. L'API doit aussi
 * avoir `ENABLE_STRIPE=true` et une `STRIPE_SECRET_KEY` quelconque — aucune
 * vérification n'appelle Stripe pour de vrai, sauf le remboursement, dont on
 * vérifie seulement qu'un échec n'empêche pas le refus.
 */
import Stripe from "stripe";

import {
  API,
  check,
  titre,
  terminer,
  post,
  get,
  j,
  uniq,
  inscrire,
  inscrirePlateforme,
  sqlScalaire,
} from "./outils.mjs";

const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
if (!SECRET) {
  console.error("STRIPE_WEBHOOK_SECRET manquant : il doit être celui de l'API visée.");
  process.exit(1);
}
const stripe = new Stripe("sk_test_verification");

await inscrirePlateforme();
const commercant = await inscrire("commercant");
const T = commercant.accessToken;
const orgId = commercant.organization.id;

const boutique = await j(
  await post("/api/stores", { orgId, name: `Crêperie ${uniq}`, slug: `creperie-${uniq}`, phone: "0400000000" }, T)
);
const storeId = boutique.store?.id || boutique.id;

const produit = await j(
  await post("/api/products", { storeId, name: `Galette ${uniq}`, price: 12, status: "ACTIVE" }, T)
);
const produitId = produit.product?.id || produit.id;

const moyen = async (type, name) => {
  const reponse = await j(await post(`/api/payment-methods/${storeId}`, { type, name }, T));
  return reponse.method?.id;
};
const carte = await moyen("CREDIT_CARD", "Carte bancaire");
const especes = await moyen("CASH", "Espèces");

const commander = async (paymentMethodId) => {
  const reponse = await j(
    await post("/api/orders", {
      storeId,
      customerName: `Client ${uniq}`,
      customerEmail: `c-${uniq}@t.fr`,
      customerPhone: "0600000000",
      deliveryType: "PICKUP",
      totalAmount: 12,
      paymentMethodId,
      items: [{ productId: produitId, quantity: 1, price: 12 }],
    })
  );
  return reponse.order;
};

const lire = (orderId, colonne) =>
  sqlScalaire(`SELECT "${colonne}"::text FROM "Order" WHERE id = '${orderId}'`);

const listeDuCommercant = async () => {
  const reponse = await j(await get(`/api/order-management/${storeId}`, T));
  return (reponse.data || reponse.orders || []).map((c) => c.id);
};

const webhook = (evenement, signature) => {
  const corps = JSON.stringify(evenement);
  return fetch(`${API}/api/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature":
        signature ?? stripe.webhooks.generateTestHeaderString({ payload: corps, secret: SECRET }),
    },
    body: corps,
  });
};

const evenement = (type, objet) => ({
  id: `evt_${uniq}_${Math.random().toString(36).slice(2, 8)}`,
  object: "event",
  type,
  data: { object: objet },
});

const intention = (orderId, montant, surcharge = {}) => ({
  id: `pi_${orderId}`,
  object: "payment_intent",
  amount: montant,
  amount_received: montant,
  status: "succeeded",
  metadata: { orderId },
  ...surcharge,
});

// ===== Payée sur place =====

titre("Payée sur place, la commande part tout de suite");
const surPlace = await commander(especes);
check("elle est créée", typeof surPlace?.id === "string", JSON.stringify(surPlace));
check("sans paiement en ligne", surPlace?.paiementEnLigne === false, `${surPlace?.paiementEnLigne}`);
check("le commerçant la voit", (await listeDuCommercant()).includes(surPlace?.id));

// ===== Payée par carte =====

titre("Payée par carte, elle attend l'encaissement");
const parCarte = await commander(carte);
const id = parCarte?.id;
check("le tunnel est prévenu qu'il faut payer", parCarte?.paiementEnLigne === true, `${parCarte?.paiementEnLigne}`);
// sqlScalaire rend '' pour NULL.
check("elle n'est pas transmise", (await lire(id, "submittedAt")) === "", await lire(id, "submittedAt"));
check("le commerçant ne la voit pas", !(await listeDuCommercant()).includes(id));

const detail = await get(`/api/order-management/${storeId}/${id}`, T);
check("ni en la cherchant directement", detail.status === 404, `statut ${detail.status}`);

const accepter = await post(`/api/order-management/${storeId}/${id}/accept`, { preparationMinutes: 15 }, T);
check("il ne peut pas l'accepter", accepter.status === 404, `statut ${accepter.status}`);

const suivi = await get(`/api/orders/${id}`);
check("le client, lui, la suit", suivi.status === 200, `statut ${suivi.status}`);

// ===== Le webhook =====

titre("Le webhook refuse ce qui n'est pas signé par Stripe");
const montant = Math.round(Number(await lire(id, "totalAmount")) * 100);
const paye = evenement("payment_intent.succeeded", intention(id, montant));

const sansSignature = await fetch(`${API}/api/payments/webhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(paye),
});
check("sans signature : 400", sansSignature.status === 400, `statut ${sansSignature.status}`);
const fausse = await webhook(paye, "t=1,v1=fausse");
check("mauvaise signature : 400", fausse.status === 400, `statut ${fausse.status}`);
check("la commande n'a pas bougé", (await lire(id, "paymentStatus")) === "PENDING", await lire(id, "paymentStatus"));

titre("L'encaissement transmet la commande au commerçant");
const recu = await webhook(paye);
check("Stripe reçoit un 200", recu.status === 200, `statut ${recu.status}`);
check("elle est payée", (await lire(id, "paymentStatus")) === "SUCCEEDED", await lire(id, "paymentStatus"));
const transmise = await lire(id, "submittedAt");
check("elle est transmise", transmise !== "", `${transmise}`);
check("le commerçant la voit", (await listeDuCommercant()).includes(id));
check(
  "le paiement est enregistré",
  (await sqlScalaire(`SELECT status::text FROM "Payment" WHERE "orderId" = '${id}'`)) === "SUCCEEDED"
);

titre("Un événement renvoyé ne la transmet pas deux fois");
const rejoue = await webhook(paye);
check("toujours 200", rejoue.status === 200, `statut ${rejoue.status}`);
check("l'heure de transmission ne bouge pas", (await lire(id, "submittedAt")) === transmise);

// ===== Échec =====

titre("Un paiement refusé par la banque la garde de côté");
const refuseeParLaBanque = await commander(carte);
const echec = await webhook(
  evenement(
    "payment_intent.payment_failed",
    intention(refuseeParLaBanque.id, 1200, { status: "requires_payment_method", amount_received: 0 })
  )
);
check("Stripe reçoit un 200", echec.status === 200, `statut ${echec.status}`);
check("paiement en échec", (await lire(refuseeParLaBanque.id, "paymentStatus")) === "FAILED");
check("toujours pas transmise", (await lire(refuseeParLaBanque.id, "submittedAt")) === "");
check("le commerçant ne la voit pas", !(await listeDuCommercant()).includes(refuseeParLaBanque.id));

// ===== Refus et remboursement =====

titre("Le refus d'une commande payée passe, même si Stripe ne rembourse pas");
// La clé Stripe de l'API est factice : le remboursement échoue, le refus doit
// tenir quand même, et la commande rester « payée » pour qu'on rembourse autrement.
const refus = await post(`/api/order-management/${storeId}/${id}/reject`, { motif: "TOO_BUSY" }, T);
check("le refus est accepté", refus.status === 200, `statut ${refus.status}`);
check("la commande est refusée", (await lire(id, "status")) === "REJECTED", await lire(id, "status"));

titre("Un remboursement confirmé par Stripe est noté");
const rembourse = await webhook(
  evenement("charge.refunded", {
    id: `ch_${uniq}`,
    object: "charge",
    amount: montant,
    amount_refunded: montant,
    payment_intent: `pi_${id}`,
  })
);
check("Stripe reçoit un 200", rembourse.status === 200, `statut ${rembourse.status}`);
check("la commande est remboursée", (await lire(id, "paymentStatus")) === "REFUNDED", await lire(id, "paymentStatus"));

titre("Un « payé » en retard ne revient pas sur le remboursement");
await webhook(paye);
check("toujours remboursée", (await lire(id, "paymentStatus")) === "REFUNDED", await lire(id, "paymentStatus"));

await terminer();
