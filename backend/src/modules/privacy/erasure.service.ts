import { db } from "../../services/db";
import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { hash } from "bcrypt";
import { ApiError } from "../../middleware/errorHandler";
import { oublierCompte } from "../auth/auth.middleware";
import { actorHash, recordAudit } from "./audit";
import { cheminRelatif } from "../files/fichiers-prives.service";
import { removePrivate } from "../files/private-storage";
import { activeHolds } from "./legal-holds";
import { ibanValide } from "../../utils/sepa";

export async function requestErasure(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, include: { driver: true, chauffeurDrive: true } });
  if (!user) throw new ApiError(401, "Session invalide", "UNAUTHORIZED");
  if (user.isSuperOwner) throw new ApiError(409, "Transférez la fonction de superowner avant de supprimer ce compte", "TRANSFER_OWNERSHIP_REQUIRED");
  const [orders, rides, deliveries] = await Promise.all([
    db.order.count({ where: { customer: { userId }, status: { in: ["PENDING", "ACCEPTED", "PREPARING", "READY"] } } }),
    db.courseDrive.count({ where: { OR: [{ passagerId: userId }, ...(user.chauffeurDrive ? [{ chauffeurId: user.chauffeurDrive.id }] : [])], statut: { in: ["RECHERCHE", "ACCEPTEE", "ARRIVEE", "EN_COURS"] } } }),
    user.driver ? db.orderDelivery.count({ where: { driverId: user.driver.id, status: { in: ["ACCEPTED", "PICKED_UP"] } } }) : 0,
  ]);
  if (orders + rides + deliveries > 0) throw new ApiError(409, "Terminez ou annulez les commandes et courses en cours", "ACTIVITY_IN_PROGRESS");
  if (user.driver) {
    const debt = await db.orderDelivery.count({ where: { driverId: user.driver.id, status: "DELIVERED", payoutId: null, OR: [{ payoutHold: null }, { payoutHold: "REVIEW" }] } });
    const payout = await db.courierPayout.count({ where: { driverId: user.driver.id, status: "PENDING" } });
    const tips = await db.courierTip.count({ where: { driverId: user.driver.id, status: "PAID", payoutId: null } });
    if (debt + payout + tips > 0 && (!ibanValide(user.driver.iban) || !user.driver.accountHolder)) throw new ApiError(409, "Renseignez un compte bancaire valide pour garantir le dernier versement avant l'effacement", "FINAL_PAYMENT_BANK_REQUIRED");
  }
  await recordAudit(userId, "ACCOUNT_ERASURE_REQUEST", userId);
  await db.$transaction(async (tx) => {
    await tx.privacyErasureRequest.upsert({ where: { userId }, create: { userId }, update: {} });
    await tx.user.update({ where: { id: userId }, data: { status: "DELETION_PENDING", resetTokenHash: null, emailTokenHash: null } });
    await tx.sessionConnexion.deleteMany({ where: { userId } });
    await tx.pushDevice.deleteMany({ where: { userId } });
    await tx.accesEquipe.deleteMany({ where: { userId } });
    if (user.driver) await tx.courier.update({ where: { id: user.driver.id }, data: { status: "INACTIVE", isOnline: false, isAvailable: false, suppressionDemandeeLe: new Date(), latitude: null, longitude: null, pushSubscription: Prisma.DbNull } });
    if (user.chauffeurDrive) await tx.chauffeurDrive.update({ where: { id: user.chauffeurDrive.id }, data: { enLigne: false, latitude: null, longitude: null, statut: "SUSPENDU" } });
  });
  oublierCompte(userId);
  return completeErasure(userId);
}

/** Historique financier conservé sous identifiant opaque ; données de contact supprimées. */
export async function completeErasure(userId: string): Promise<{ status: string }> {
  const holds = await activeHolds();
  const user = await db.user.findUnique({ where: { id: userId }, include: { driver: { include: { documents: true } }, chauffeurDrive: { include: { documents: true } }, societeDrive: { include: { documents: true, vehicules: { include: { documents: true } } } }, memberships: true } });
  if (!user) return { status: "COMPLETED" };
  const pendingDriver = user.driver ? await db.orderDelivery.count({ where: { driverId: user.driver.id, status: "DELIVERED", AND: [{ OR: [{ payoutHold: null }, { payoutHold: "REVIEW" }] }, { OR: [{ payoutId: null }, { payout: { status: "PENDING" } }] }] } }) : 0;
  const pendingPayout = user.driver ? await db.courierPayout.count({ where: { driverId: user.driver.id, status: "PENDING" } }) : 0;
  const tips = user.driver ? await db.courierTip.count({ where: { driverId: user.driver.id, status: "PAID", payoutId: null } }) : 0;
  const previousOwned = await db.erasureRecord.findMany({ where: { scope: `OWNER:${userId}` }, select: { subjectId: true } });
  const candidates = await db.organization.findMany({ where: { OR: [{ memberships: { some: { userId, role: "ADMIN" } } }, { id: { in: previousOwned.map((r) => r.subjectId) } }] }, include: { documents: true } });
  const owned = candidates.filter((org) => org.ownerEmail === user.email || previousOwned.some((r) => r.subjectId === org.id));
  const merchantDue = await db.merchantPayout.count({ where: { orgId: { in: owned.map((o) => o.id) }, status: "PENDING" } });
  const waiting = pendingDriver + pendingPayout + tips + merchantDue > 0;
  const erasedPassword = await hash(randomBytes(64).toString("base64"), 12);
  const documents = [...(user.driver?.documents || []).filter((d) => !holds("CourierDocument").includes(d.id)).map((d) => d.documentUrl), ...(user.chauffeurDrive?.documents || []).filter((d) => !holds("DocumentChauffeurDrive").includes(d.id)).map((d) => d.url), ...owned.flatMap((o) => o.documents.filter((d) => !holds("OrganizationDocument").includes(d.id)).map((d) => d.documentUrl)), ...(user.societeDrive?.documents || []).filter((d) => !holds("DocumentChauffeurDrive").includes(d.id)).map((d) => d.url), ...(user.societeDrive?.vehicules || []).flatMap((v) => v.documents.filter((d) => !holds("DocumentChauffeurDrive").includes(d.id)).map((d) => d.url))];
  for (const url of documents) { const relative = cheminRelatif(url); if (relative) await removePrivate(relative); }
  await db.$transaction(async (tx) => {
    const customers = await tx.customer.findMany({ where: { OR: [{ userId }, ...(user.emailVerified ? [{ email: user.email, userId: null }] : [])] }, select: { id: true } });
    for (const customer of customers) {
      const orders = await tx.order.findMany({ where: { customerId: customer.id }, select: { id: true } });
      await tx.orderTrackingToken.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
      await tx.orderDelivery.updateMany({ where: { orderId: { in: orders.map((o) => o.id) } }, data: { deliveryLat: null, deliveryLng: null, driverLat: null, driverLng: null, deliveryLatObfusquee: null, deliveryLngObfusquee: null, deliveryCode: null, proofNote: null } });
      await tx.order.updateMany({ where: { customerId: customer.id }, data: { customerId: null, customerName: "Client supprimé", customerEmail: "supprime@zupeat.invalid", customerPhone: "", deliveryAddress: null, deliveryCity: null, deliveryPostal: null, deliveryLat: null, deliveryLng: null, trackingTokenHash: null, notes: null, rejectionNote: null } });
      await tx.review.deleteMany({ where: { customerId: customer.id } });
      await tx.courierRating.deleteMany({ where: { customerId: customer.id } });
      await tx.favoriteStore.deleteMany({ where: { customerId: customer.id } });
      await tx.customerCart.deleteMany({ where: { customerId: customer.id } });
      // Notes des commerçants sur ce client : donnée personnelle, effacée avec la fiche.
      await tx.storeCustomer.deleteMany({ where: { customerId: customer.id } });
      await tx.customer.update({ where: { id: customer.id }, data: { userId: null, name: "Client supprimé", email: `supprime-${customer.id}@zupeat.invalid`, phone: null, address: null, city: null, postalCode: null, latitude: null, longitude: null, savedAddresses: [], notes: null, deletedAt: new Date(), status: "INACTIVE" } });
      await tx.erasureRecord.upsert({ where: { subjectId_scope: { subjectId: customer.id, scope: "CUSTOMER" } }, create: { subjectId: customer.id, scope: "CUSTOMER" }, update: {} });
    }
    if (user.driver) {
      if (!user.driver.email.startsWith("supprime-")) await tx.courierPayout.updateMany({ where: { driverId: user.driver.id }, data: { beneficiaryJson: { name: user.driver.name } } });
      await tx.courierDocument.deleteMany({ where: { driverId: user.driver.id, id: { notIn: holds("CourierDocument") } } });
      await tx.courierSupportMessage.deleteMany({ where: { driverId: user.driver.id, id: { notIn: holds("CourierSupportMessage") } } });
      await tx.courier.update({ where: { id: user.driver.id }, data: { userId: waiting ? userId : null, name: "Livreur supprimé", email: `supprime-${user.driver.id}@zupeat.invalid`, phone: "", ...(waiting ? {} : { iban: null, bic: null, accountHolder: null }), vehiclePlate: null, licensePlate: null, statusReason: null, latitude: null, longitude: null, pushSubscription: Prisma.DbNull } });
    }
    if (user.chauffeurDrive) {
      await tx.documentChauffeurDrive.deleteMany({ where: { chauffeurId: user.chauffeurDrive.id, id: { notIn: holds("DocumentChauffeurDrive") } } });
      await tx.messageCourseDrive.updateMany({ where: { auteur: "CHAUFFEUR", course: { chauffeurId: user.chauffeurDrive.id } }, data: { texte: "Message effacé" } });
      await tx.chauffeurDrive.update({ where: { id: user.chauffeurDrive.id }, data: { nomComplet: "Chauffeur supprimé", telephone: null, numeroLicence: null, vehiculePlaque: null, motifStatut: null, societeId: null, vehiculeId: null } });
    }
    if (user.societeDrive) await tx.documentChauffeurDrive.deleteMany({ where: { id: { notIn: holds("DocumentChauffeurDrive") }, OR: [{ societeId: user.societeDrive.id }, { vehicule: { societeId: user.societeDrive.id } }] } });
    for (const org of owned) {
      await tx.erasureRecord.upsert({ where: { subjectId_scope: { subjectId: org.id, scope: `OWNER:${userId}` } }, create: { subjectId: org.id, scope: `OWNER:${userId}` }, update: {} });
      await tx.organizationDocument.deleteMany({ where: { orgId: org.id, id: { notIn: holds("OrganizationDocument") } } });
      await tx.merchantArchive.deleteMany({ where: { organizationId: org.id } });
      await tx.store.updateMany({ where: { orgId: org.id }, data: { isOpen: false } });
      await tx.organization.update({ where: { id: org.id }, data: { status: "CLOSED", ownerFirstName: null, ownerLastName: null, ownerEmail: null, ownerPhone: null, ownerBirthDate: null, ...(waiting ? {} : { iban: null, bic: null, accountHolder: null }) } });
    }
    await tx.messageCourseDrive.deleteMany({ where: { course: { passagerId: userId } } });
    await tx.courseDrive.updateMany({ where: { passagerId: userId }, data: { passagerId: null, departAdresse: "Effacé", arriveeAdresse: "Effacé", departLatitude: 0, departLongitude: 0, arriveeLatitude: 0, arriveeLongitude: 0, motifAnnulation: null } });
    await tx.adresseFavoriteDrive.deleteMany({ where: { userId } });
    await tx.contactConfianceDrive.deleteMany({ where: { userId } });
    await tx.alerteSosDrive.updateMany({ where: { passagerId: userId }, data: { passagerId: null, latitude: null, longitude: null } });
    await tx.membership.deleteMany({ where: { userId } });
    await tx.ticketMessage.deleteMany({ where: { authorId: userId } });
    await tx.notification.deleteMany({ where: { recipientEmail: user.email } });
    await tx.acceptationConditions.updateMany({ where: { userId }, data: { userId: null, email: "supprime@zupeat.invalid", ip: null, userAgent: null } });
    await tx.user.update({ where: { id: userId }, data: { email: `supprime-${userId}@zupeat.invalid`, name: null, passwordHash: erasedPassword, status: waiting ? "DELETION_PENDING" : "DELETED", isSystemAdmin: false, emailVerified: false, resetTokenHash: null, resetTokenExpiresAt: null, emailTokenHash: null, emailTokenExpiresAt: null } });
    await tx.erasureRecord.upsert({ where: { subjectId_scope: { subjectId: userId, scope: "USER" } }, create: { subjectId: userId, scope: "USER" }, update: {} });
    await tx.privacyErasureRequest.update({ where: { userId }, data: waiting ? { status: "PENDING" } : { status: "COMPLETED", completedAt: new Date() } });
  }, { timeout: 60000 });
  await recordAudit(userId, waiting ? "ACCOUNT_ERASURE_PAYMENT_PENDING" : "ACCOUNT_ERASURE_COMPLETED", actorHash(userId), "SUCCESS");
  oublierCompte(userId);
  return { status: waiting ? "WAITING_FINAL_PAYMENT" : "COMPLETED" };
}
