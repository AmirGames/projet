/**
 * Les webhooks, de bout en bout.
 *
 * Trois défauts les rendaient inutilisables. L'écran proposait dix événements
 * dont neuf n'existaient pas côté serveur, et l'abonnement était accepté sans
 * un mot : on attendait des envois qui ne viendraient jamais. Sur les six
 * événements réels, trois — les commandes et l'ouverture d'un ticket — n'étaient
 * émis nulle part. Et un envoi raté était perdu : un destinataire redémarré
 * manquait la commande définitivement.
 *
 * Le destinataire est ici un vrai serveur HTTP, monté par ce script. Il
 * enregistre ce qu'il reçoit, recalcule la signature avec le secret, et sait
 * tomber en panne à la demande pour qu'on voie la relance arriver.
 *
 *   DATABASE_URL=... VERIF_API_URL=http://localhost:3099 \
 *     node scripts/verification/verif-webhooks.mjs
 *
 * L'API visée doit tourner avec des relances courtes, sans quoi la première
 * durerait une minute :
 *
 *   WEBHOOK_RELANCES_MS=300,600,900 WEBHOOK_BALAYAGE_MS=200 npx tsx src/server.ts
 */

import crypto from "crypto";
import http from "http";

import {
  check,
  titre,
  terminer,
  post,
  patch,
  del,
  get,
  j,
  uniq,
  inscrire,
  inscrirePlateforme,
  sqlScalaire,
} from "./outils.mjs";

// ===== Le destinataire =====

const recus = [];
let codeARendre = 200;

const serveur = http.createServer((requete, reponse) => {
  let brut = "";
  requete.on("data", (bloc) => (brut += bloc));

  requete.on("end", () => {
    recus.push({
      brut,
      signature: requete.headers["x-webhook-signature"],
      evenement: requete.headers["x-webhook-event"],
      identifiant: requete.headers["x-webhook-id"],
      tentative: Number(requete.headers["x-webhook-attempt"]),
    });

    reponse.writeHead(codeARendre);
    reponse.end();
  });
});

await new Promise((resoudre) => serveur.listen(0, "127.0.0.1", resoudre));
const PORT_RECEPTEUR = serveur.address().port;
const URL_RECEPTEUR = `http://127.0.0.1:${PORT_RECEPTEUR}/zupone`;

/** Attend qu'un envoi corresponde, plutôt que de dormir une durée au hasard. */
const attendre = async (predicat, limiteMs = 6000) => {
  const fin = Date.now() + limiteMs;

  while (Date.now() < fin) {
    const trouve = recus.filter(predicat);
    if (trouve.length > 0) return trouve;
    await new Promise((r) => setTimeout(r, 100));
  }

  return [];
};

// ===== Le décor =====

const plateforme = await inscrirePlateforme();
const TP = plateforme.accessToken;

const commercant = await inscrire("commercant");
const T = commercant.accessToken;
const orgId = commercant.organization.id;

const boutique = await j(
  await post("/api/stores", { orgId, name: `Boutique ${uniq}`, slug: `b-${uniq}`, phone: "0400000000" }, T)
);
const storeId = boutique.store?.id || boutique.id;

const produit = await j(
  await post("/api/products", { storeId, name: `Plat ${uniq}`, price: 12, status: "ACTIVE" }, T)
);
const produitId = produit.product?.id || produit.id;

// ===== La liste des événements =====

titre("Les événements proposés sont ceux qui existent");
/**
 * L'écran avait sa propre liste, écrite en dur, qui avait divergé : neuf des dix
 * événements offerts n'étaient émis par personne.
 */
const dispo = await j(await get("/api/superowner/webhooks/evenements", TP));
const noms = (dispo.availableEvents || []).map((e) => e.nom);

check("le serveur sert la liste", noms.length === 6, JSON.stringify(noms));
check(
  "elle porte les six événements réels",
  ["order.created", "order.status_changed", "merchant.suspended", "merchant.closed", "ticket.created", "ticket.message"].every(
    (nom) => noms.includes(nom)
  ),
  JSON.stringify(noms)
);
check(
  "chacun est expliqué",
  (dispo.availableEvents || []).every((e) => typeof e.description === "string" && e.description.length > 10),
  JSON.stringify(dispo.availableEvents)
);

titre("Un événement inventé est refusé");
const invente = await post(
  "/api/superowner/webhooks",
  { url: "https://exemple.fr/inexistant", events: ["payment.processed"] },
  TP
);
check("l’abonnement est refusé", invente.status === 400, `statut ${invente.status}`);

const refus = await invente.json().catch(() => ({}));
// Un refus muet laisserait croire que l'abonnement est en place.
check("le refus nomme l’événement fautif", /payment\.processed/.test(refus.error || ""), refus.error);
check("et rappelle ceux qui existent", /order\.created/.test(refus.error || ""), refus.error);

// ===== L'abonnement =====

titre("La plateforme s’abonne");
const creation = await post(
  "/api/superowner/webhooks",
  { url: URL_RECEPTEUR, events: ["order.created", "order.status_changed", "ticket.created"] },
  TP
);
check("l’abonnement est créé", creation.status === 201, `statut ${creation.status}`);

const cree = await creation.json();
const webhookId = cree.webhook.id;
const secret = cree.webhook.secret;

// Sans le secret, aucune signature n'est vérifiable — et il n'est rendu qu'ici.
check("le secret est rendu à la création", typeof secret === "string" && secret.length >= 32, `${secret}`);

titre("Le secret ne ressort plus jamais");
const liste = await j(await get("/api/superowner/webhooks", TP));
const listeBrute = JSON.stringify(liste);
check("la liste ne le contient pas", !listeBrute.includes(secret), "secret exposé dans la liste");

// ===== L'envoi d'essai =====

titre("L’envoi d’essai atteint le destinataire");
const essai = await j(await post(`/api/superowner/webhooks/${webhookId}/essai`, {}, TP));
check("l’essai est annoncé réussi", essai.envoi?.success === true, JSON.stringify(essai));

const essais = await attendre((r) => r.evenement === "webhook.test");
check("le destinataire l’a reçu", essais.length === 1, `${essais.length} reçu(s)`);

titre("Et il est signé");
const recu = essais[0];
const attendue = crypto.createHmac("sha256", secret).update(recu.brut).digest("hex");
check("la signature correspond au corps reçu", recu.signature === attendue, `${recu.signature}`);

const corpsEssai = JSON.parse(recu.brut);
check("le corps porte l’événement", corpsEssai.event === "webhook.test", corpsEssai.event);
check("et un identifiant d’envoi", typeof corpsEssai.id === "string" && corpsEssai.id.length > 0, corpsEssai.id);
check("l’en-tête porte le même identifiant", recu.identifiant === corpsEssai.id, recu.identifiant);

// ===== Les événements qui n'étaient émis nulle part =====

titre("Une commande passée est diffusée");
recus.length = 0;

const commande = await j(
  await post("/api/orders", {
    storeId,
    customerName: `Client ${uniq}`,
    customerEmail: `c-${uniq}@t.fr`,
    customerPhone: "0600000000",
    deliveryType: "PICKUP",
    totalAmount: 24,
    items: [{ productId: produitId, quantity: 2, price: 12 }],
  })
);
const orderId = commande.order?.id || commande.id;
// Sans ce garde-fou, les deux contrôles suivants compareraient deux valeurs
// absentes et passeraient au vert alors que rien n'a été créé.
check("la commande existe", typeof orderId === "string", JSON.stringify(commande).slice(0, 200));

const creations = await attendre((r) => r.evenement === "order.created");
check("l’événement part", creations.length === 1, `${creations.length} reçu(s)`);

const corpsCommande = JSON.parse(creations[0]?.brut || "{}");
check("il porte la commande", corpsCommande.data?.orderId === orderId, JSON.stringify(corpsCommande.data));
check("et sa boutique", corpsCommande.data?.storeId === storeId, JSON.stringify(corpsCommande.data));

titre("Un changement d’état aussi");
recus.length = 0;
// Accepter passe par sa propre route, avec le temps de préparation.
await post(`/api/order-management/${storeId}/${orderId}/accept`, { preparationMinutes: 20 }, T);

const changements = await attendre((r) => r.evenement === "order.status_changed");
check("l’événement part", changements.length === 1, `${changements.length} reçu(s)`);

const corpsChangement = JSON.parse(changements[0]?.brut || "{}");
check("il dit le nouvel état", corpsChangement.data?.status === "ACCEPTED", JSON.stringify(corpsChangement.data));
// Sans l'état précédent, on ne distingue pas une préparation qui avance d'un renvoi.
check("et celui d’avant", corpsChangement.data?.previousStatus === "PENDING", JSON.stringify(corpsChangement.data));

titre("L’ouverture d’un ticket aussi");
recus.length = 0;
await post(
  "/api/support/tickets",
  { orgId, subject: `Souci ${uniq}`, description: "Ma boutique ne répond plus du tout." },
  T
);

const tickets = await attendre((r) => r.evenement === "ticket.created");
check("l’événement part", tickets.length === 1, `${tickets.length} reçu(s)`);

const corpsTicket = JSON.parse(tickets[0]?.brut || "{}");
check("il porte le sujet", (corpsTicket.data?.title || "").includes(uniq), JSON.stringify(corpsTicket.data));

titre("Un événement auquel on n’est pas abonné ne part pas");
recus.length = 0;
await post(`/api/support/tickets/${corpsTicket.data.ticketId}/messages`, { body: "Toujours rien." }, T);
await new Promise((r) => setTimeout(r, 1200));
check("rien n’est reçu", recus.length === 0, `${recus.length} reçu(s) à tort`);

// ===== Les relances =====

titre("Un destinataire en panne est relancé");
/**
 * Le cas réel : le serveur du destinataire redémarre pendant qu'une commande
 * arrive. Sans relance, la commande est perdue pour lui — et il ne le sait même
 * pas. Le code 500 tient lieu de panne.
 */
recus.length = 0;
codeARendre = 500;

const essaiRate = await j(await post(`/api/superowner/webhooks/${webhookId}/essai`, {}, TP));
check("le premier envoi échoue", essaiRate.envoi?.success === false, JSON.stringify(essaiRate.envoi));

const premiers = await attendre((r) => r.tentative === 1 && r.evenement === "webhook.test");
const identifiant = premiers[0]?.identifiant;

const relance = await attendre((r) => r.identifiant === identifiant && r.tentative === 2, 8000);
check("une relance arrive", relance.length === 1, `${relance.length} relance(s)`);
// Le même identifiant permet au destinataire de reconnaître un envoi déjà traité.
check("avec le même identifiant d’envoi", relance[0]?.identifiant === identifiant, relance[0]?.identifiant);

titre("Le destinataire revient, la relance aboutit");
codeARendre = 200;

const aboutie = await attendre((r) => r.identifiant === identifiant && r.tentative >= 3, 8000);
check("une nouvelle tentative a lieu", aboutie.length >= 1, `${aboutie.length}`);

const etatEnvoi = await sqlScalaire(
  `SELECT success::text FROM "WebhookDelivery" WHERE id = '${identifiant}'`
);
check("l’envoi est marqué réussi", etatEnvoi === "true", etatEnvoi);

const plusDeRelance = await sqlScalaire(
  `SELECT COALESCE("nextAttemptAt"::text, 'aucune') FROM "WebhookDelivery" WHERE id = '${identifiant}'`
);
check("plus aucune relance n’est due", plusDeRelance === "aucune", plusDeRelance);

titre("Les relances ne sont pas infinies");
recus.length = 0;
codeARendre = 500;

const abandonne = await j(await post(`/api/superowner/webhooks/${webhookId}/essai`, {}, TP));
const idAbandon = abandonne.envoi?.deliveryId;

// Trois relances après le premier envoi : quatre tentatives, puis on abandonne.
const toutes = await attendre((r) => r.identifiant === idAbandon && r.tentative === 4, 12000);
check("la quatrième tentative a lieu", toutes.length === 1, `${toutes.length}`);

await new Promise((r) => setTimeout(r, 1500));
const cinquieme = recus.filter((r) => r.identifiant === idAbandon && r.tentative === 5);
check("et il n’y en a pas de cinquième", cinquieme.length === 0, `${cinquieme.length}`);

const marqueAbandon = await sqlScalaire(
  `SELECT CASE WHEN "abandonedAt" IS NULL THEN 'non' ELSE 'oui' END FROM "WebhookDelivery" WHERE id = '${idAbandon}'`
);
check("l’envoi est marqué abandonné", marqueAbandon === "oui", marqueAbandon);

titre("L’historique raconte ce qui s’est passé");
const historique = await j(await get(`/api/superowner/webhooks/${webhookId}/deliveries`, TP));
const envois = historique.deliveries || [];

check("les envois sont listés", envois.length >= 4, `${envois.length}`);
check(
  "chacun porte son nombre de tentatives",
  envois.every((e) => typeof e.attempt === "number" && e.attempt >= 1),
  JSON.stringify(envois.map((e) => e.attempt))
);

// ===== La pause et la reprise =====

titre("Un abonnement en pause n’envoie plus rien");
codeARendre = 200;
recus.length = 0;

const pause = await patch(`/api/superowner/webhooks/${webhookId}`, { status: "INACTIVE" }, TP);
check("la mise en pause passe", pause.status === 200, `statut ${pause.status}`);

await post("/api/support/tickets", { orgId, subject: `Muet ${uniq}`, description: "Rien ne doit partir." }, T);
await new Promise((r) => setTimeout(r, 1200));
check("aucun envoi n’est parti", recus.length === 0, `${recus.length} reçu(s) à tort`);

titre("Et il repart quand on le réactive");
const reprise = await patch(`/api/superowner/webhooks/${webhookId}`, { status: "ACTIVE" }, TP);
check("la réactivation passe", reprise.status === 200, `statut ${reprise.status}`);

// Le compteur d'abandons repart à zéro, sans quoi l'abonnement recoupe aussitôt.
const compteur = await sqlScalaire(`SELECT "retryCount"::text FROM "Webhook" WHERE id = '${webhookId}'`);
check("le compteur d’abandons est remis à zéro", compteur === "0", compteur);

recus.length = 0;
await post("/api/support/tickets", { orgId, subject: `Repris ${uniq}`, description: "Ça doit repartir." }, T);

const apresReprise = await attendre((r) => r.evenement === "ticket.created");
check("les envois reprennent", apresReprise.length === 1, `${apresReprise.length}`);

titre("Un commerçant ne voit pas les webhooks de la plateforme");
const intrusion = await get("/api/superowner/webhooks", T);
check("la liste lui est refusée", intrusion.status === 403, `statut ${intrusion.status}`);

const intrusionEssai = await post(`/api/superowner/webhooks/${webhookId}/essai`, {}, T);
check("l’envoi d’essai aussi", intrusionEssai.status === 403, `statut ${intrusionEssai.status}`);

titre("Supprimer l’abonnement emporte son historique");
const suppression = await del(`/api/superowner/webhooks/${webhookId}`, null, TP);
check("la suppression passe", suppression.status === 200, `statut ${suppression.status}`);

const restants = await sqlScalaire(
  `SELECT COUNT(*) FROM "WebhookDelivery" WHERE "webhookId" = '${webhookId}'`
);
check("aucun envoi ne traîne", restants === "0", restants);

serveur.close();

await terminer();
