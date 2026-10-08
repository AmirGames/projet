import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../../services/db";
import { cheminRelatif, DOSSIERS_PRIVES } from "../files/fichiers-prives.service";
import { privateRoot, removePrivate } from "../files/private-storage";
import { completeErasure } from "./erasure.service";
import { BackupService } from "../monitoring/backup.service";
import { activeHolds } from "./legal-holds";
import { Prisma } from "@prisma/client";
import { codeErreur } from "../../utils/code-erreur";

const RETENTION = { gps: 1, proof: 90, contact: 90, support: 730, audit: 180, security: 90, backup: 14, deletedProfile: 30, documentsReplaced: 30, accounting: 3653, consent: 1826 } as const;
const before = (days: number, now: Date) => new Date(now.getTime() - days * 86400000);
const terminal = ["DELIVERED", "FAILED", "CANCELLED"];

/** Purges idempotentes ; aucune position d'une course active ni preuve en examen n'est supprimée. */
export async function runRetention(now = new Date()) {
  const result: Record<string, number> = {};
  const holds = await activeHolds(now);
  const held = await db.deliveryIncident.findMany({ where: { closedAt: null }, select: { deliveryId: true } });
  result.courierGps = (await db.courier.updateMany({ where: { lastLocationUpdate: { lt: before(RETENTION.gps, now) } }, data: { latitude: null, longitude: null } })).count;
  result.chauffeurGps = (await db.chauffeurDrive.updateMany({ where: { positionLe: { lt: before(RETENTION.gps, now) } }, data: { latitude: null, longitude: null } })).count;
  result.deliveryGps = (await db.orderDelivery.updateMany({ where: { status: { in: terminal }, updatedAt: { lt: before(RETENTION.gps, now) } }, data: { driverLat: null, driverLng: null } })).count;
  result.driveHistory = (await db.courseDrive.updateMany({ where: { id: { notIn: holds("CourseDrive") }, statut: { in: ["TERMINEE", "ANNULEE"] }, createdAt: { lt: before(RETENTION.contact, now) }, OR: [{ departLatitude: { not: 0 } }, { arriveeLatitude: { not: 0 } }] }, data: { departAdresse: "Effacé", arriveeAdresse: "Effacé", departLatitude: 0, departLongitude: 0, arriveeLatitude: 0, arriveeLongitude: 0, motifAnnulation: null } })).count;
  result.driveMessages = (await db.messageCourseDrive.deleteMany({ where: { course: { id: { notIn: holds("CourseDrive") }, statut: { in: ["TERMINEE", "ANNULEE"] }, createdAt: { lt: before(RETENTION.contact, now) } } } })).count;
  result.orderContact = (await db.order.updateMany({ where: { status: { in: ["COMPLETED", "REJECTED"] }, customerEmail: { notIn: ["archive@zupeat.invalid", "supprime@zupeat.invalid"] }, createdAt: { lt: before(RETENTION.contact, now) } }, data: { customerName: "Client archivé", customerEmail: "archive@zupeat.invalid", customerPhone: "", deliveryAddress: null, deliveryCity: null, deliveryPostal: null, deliveryLat: null, deliveryLng: null, notes: null, rejectionNote: null, trackingTokenHash: null } })).count;
  const proofs = await db.orderDelivery.findMany({ where: { id: { notIn: [...held.map((i) => i.deliveryId), ...holds("OrderDelivery")] }, status: { in: terminal }, proofAt: { lt: before(RETENTION.proof, now) }, OR: [{ payoutHold: null }, { payoutHold: { not: "REVIEW" } }], AND: [{ OR: [{ proofPhoto: { not: null } }, { proofLat: { not: null } }] }] }, select: { id: true, proofPhoto: true }, take: 500 });
  for (const proof of proofs) {
    const relative = cheminRelatif(proof.proofPhoto);
    if (relative) await removePrivate(relative);
    await db.orderDelivery.update({ where: { id: proof.id }, data: { proofPhoto: null, proofLat: null, proofLng: null, proofAccuracy: null, proofPositionAt: null, proofNote: null, deliveryCode: null, deliveryLat: null, deliveryLng: null, deliveryLatObfusquee: null, deliveryLngObfusquee: null } });
  }
  result.proofs = proofs.length;
  result.tickets = (await db.merchantTicket.deleteMany({ where: { id: { notIn: holds("MerchantTicket") }, status: { in: ["RESOLVED", "CLOSED"] }, OR: [{ resolvedAt: { lt: before(RETENTION.support, now) } }, { resolvedAt: null, updatedAt: { lt: before(RETENTION.support, now) } }] } })).count;
  result.driverMessages = (await db.courierSupportMessage.deleteMany({ where: { id: { notIn: holds("CourierSupportMessage") }, createdAt: { lt: before(RETENTION.support, now) } } })).count;
  result.securityEvents = (await db.securityEvent.deleteMany({ where: { createdAt: { lt: before(RETENTION.security, now) } } })).count;
  result.systemAudit = (await db.systemAuditLog.deleteMany({ where: { createdAt: { lt: before(RETENTION.audit, now) } } })).count;
  result.privacyAudit = (await db.privacyAuditEvent.deleteMany({ where: { createdAt: { lt: before(RETENTION.audit + 1, now) } } })).count;
  result.sessions = (await db.sessionConnexion.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: before(1, now) } }] } })).count;
  await db.codeConnexion.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.jetonRafraichissement.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.orderTrackingToken.deleteMany({ where: { createdAt: { lt: before(RETENTION.contact, now) } } });
  await db.payment.updateMany({ where: { status: { in: ["SUCCEEDED", "FAILED", "REFUNDED"] } }, data: { stripeClientSecret: null } });
  result.deletedProfiles = (await db.customer.deleteMany({ where: { userId: null, deletedAt: { lt: before(RETENTION.deletedProfile, now) } } })).count;
  await db.merchantArchive.updateMany({ data: { ordersData: Prisma.DbNull, customersData: Prisma.DbNull } });
  await db.merchantArchive.deleteMany({ where: { restorationDeadline: { lt: now } } });
  await db.acceptationConditions.deleteMany({ where: { id: { notIn: holds("AcceptationConditions") }, acceptedAt: { lt: before(RETENTION.consent, now) } } });
  const backups = await db.backup.findMany({ where: { createdAt: { lt: before(RETENTION.backup, now) } }, select: { id: true } });
  for (const backup of backups) await BackupService.remove(backup.id);
  result.backups = backups.length;
  const replaced = await db.documentChauffeurDrive.findMany({ where: { id: { notIn: holds("DocumentChauffeurDrive") }, OR: [{ archiveeLe: { lt: before(RETENTION.documentsReplaced, now) } }, { statut: "REJECTED", examineLe: { lt: before(RETENTION.documentsReplaced, now) } }] }, select: { id: true, url: true }, take: 500 });
  for (const doc of replaced) { const relative = cheminRelatif(doc.url); if (relative) await removePrivate(relative); await db.documentChauffeurDrive.delete({ where: { id: doc.id } }); }
  const rejectedCouriers = await db.courierDocument.findMany({ where: { id: { notIn: holds("CourierDocument") }, status: "REJECTED", reviewedAt: { lt: before(30, now) } }, select: { id: true, documentUrl: true }, take: 500 });
  for (const doc of rejectedCouriers) { const relative = cheminRelatif(doc.documentUrl); if (relative) await removePrivate(relative); await db.courierDocument.delete({ where: { id: doc.id } }); }
  const rejectedMerchants = await db.organizationDocument.findMany({ where: { id: { notIn: holds("OrganizationDocument") }, status: "REJECTED", reviewedAt: { lt: before(30, now) } }, select: { id: true, documentUrl: true }, take: 500 });
  for (const doc of rejectedMerchants) { const relative = cheminRelatif(doc.documentUrl); if (relative) await removePrivate(relative); await db.organizationDocument.delete({ where: { id: doc.id } }); }
  const requests = await db.privacyErasureRequest.findMany({ where: { status: "PENDING" }, select: { userId: true }, take: 100 });
  for (const request of requests) await completeErasure(request.userId);
  const deletedCouriers = await db.courier.findMany({ where: { suppressionDemandeeLe: { not: null }, email: { not: { startsWith: "supprime-" } } }, include: { documents: true }, take: 100 });
  for (const courier of deletedCouriers) {
    const pending = await db.courierPayout.count({ where: { driverId: courier.id, status: "PENDING" } });
    const due = await db.orderDelivery.count({ where: { driverId: courier.id, status: "DELIVERED", payoutId: null, OR: [{ payoutHold: null }, { payoutHold: "REVIEW" }] } });
    const tips = await db.courierTip.count({ where: { driverId: courier.id, status: "PAID", payoutId: null } });
    if (pending + due + tips > 0) continue;
    for (const doc of courier.documents.filter((d) => !holds("CourierDocument").includes(d.id))) { const relative = cheminRelatif(doc.documentUrl); if (relative) await removePrivate(relative); }
    await db.$transaction(async (tx) => {
      await tx.courierPayout.updateMany({ where: { driverId: courier.id }, data: { beneficiaryJson: { name: courier.name } } });
      await tx.courierDocument.deleteMany({ where: { driverId: courier.id, id: { notIn: holds("CourierDocument") } } });
      await tx.courierSupportMessage.deleteMany({ where: { driverId: courier.id, id: { notIn: holds("CourierSupportMessage") } } });
      await tx.courier.update({ where: { id: courier.id }, data: { userId: null, name: "Livreur supprimé", email: `supprime-${courier.id}@zupeat.invalid`, phone: "", iban: null, bic: null, accountHolder: null, latitude: null, longitude: null, vehiclePlate: null, licensePlate: null, pushSubscription: Prisma.DbNull, statusReason: null } });
      await tx.erasureRecord.upsert({ where: { subjectId_scope: { subjectId: courier.id, scope: "COURIER" } }, create: { subjectId: courier.id, scope: "COURIER" }, update: {} });
    });
  }
  await db.privacyErasureRequest.deleteMany({ where: { status: "COMPLETED", completedAt: { lt: before(30, now) } } });
  const ancientOrders = await db.order.findMany({ where: { id: { notIn: holds("Order") }, createdAt: { lt: before(RETENTION.accounting, now) }, status: { in: ["COMPLETED", "REJECTED"] }, OR: [{ delivery: { is: null } }, { delivery: { status: { in: terminal }, payoutHold: null, payout: { status: "PAID" }, id: { notIn: [...held.map((i) => i.deliveryId), ...holds("OrderDelivery")] } } }] }, select: { id: true }, take: 500 });
  await db.$transaction(async (tx) => {
    const ids = ancientOrders.map((o) => o.id);
    await tx.invoice.deleteMany({ where: { orderId: { in: ids } } });
    await tx.order.deleteMany({ where: { id: { in: ids } } });
    await tx.platformInvoice.deleteMany({ where: { id: { notIn: holds("PlatformInvoice") }, issuedAt: { lt: before(RETENTION.accounting, now) } } });
    await tx.courierPayout.deleteMany({ where: { id: { notIn: holds("CourierPayout") }, status: { in: ["PAID", "CANCELLED"] }, periodEnd: { lt: before(RETENTION.accounting, now) } } });
    await tx.merchantPayout.deleteMany({ where: { id: { notIn: holds("MerchantPayout") }, status: { in: ["PAID", "CANCELLED", "CARRIED"] }, periodEnd: { lt: before(RETENTION.accounting, now) } } });
    // Les lots clos portent des IBAN figés : même durée de conservation comptable.
    await tx.payoutBatch.deleteMany({ where: { id: { notIn: holds("PayoutBatch") }, status: { in: ["CONFIRMED", "REJECTED", "CANCELLED"] }, closedAt: { lt: before(RETENTION.accounting, now) } } });
  });
  result.accounting = ancientOrders.length;
  await db.courseDrive.deleteMany({ where: { id: { notIn: holds("CourseDrive") }, statut: { in: ["TERMINEE", "ANNULEE"] }, createdAt: { lt: before(RETENTION.accounting, now) } } });
  await db.privacyLegalHold.deleteMany({ where: { expiresAt: { lt: now } } });
  await purgeOrphans(now);
  return result;
}

/** Grace de 24 h pour les uploads dont l'écriture SQL a échoué ou a été remplacée. */
async function purgeOrphans(now: Date) {
  const refs = new Set<string>();
  const sources: { delegate: any; field: string }[] = [{ delegate: db.courierDocument, field: "documentUrl" }, { delegate: db.organizationDocument, field: "documentUrl" }, { delegate: db.documentChauffeurDrive, field: "url" }, { delegate: db.orderDelivery, field: "proofPhoto" }];
  for (const { delegate, field } of sources) {
    let cursor: string | undefined;
    for (;;) {
      const rows = await delegate.findMany({ select: { id: true, [field]: true }, orderBy: { id: "asc" }, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      for (const row of rows) { const relative = cheminRelatif(row[field]); if (relative) refs.add(relative); }
      if (rows.length < 500) break;
      cursor = rows[rows.length - 1].id;
    }
  }
  for (const folder of DOSSIERS_PRIVES) {
    let names: string[];
    try { names = await fs.readdir(path.join(privateRoot(), folder)); } catch (err) { if (codeErreur(err) === "ENOENT") continue; throw err; }
    for (const name of names) {
      const relative = `${folder}/${name}`;
      const stat = await fs.lstat(path.join(privateRoot(), relative));
      if (stat.isFile() && stat.mtimeMs < before(1, now).getTime() && !refs.has(relative)) await removePrivate(relative);
    }
  }
}
