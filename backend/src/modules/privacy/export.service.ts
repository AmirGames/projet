import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { actorHash } from "./audit";
import { cheminRelatif, peutLire } from "../files/fichiers-prives.service";
import { readPrivate } from "../files/private-storage";
import type { Compte } from "../auth/auth.middleware";
import { summaryPdf, zip } from "./formats";

const forbidden = /^(?:passwordHash|emailTokenHash|resetTokenHash|trackingTokenHash|stripeClientSecret|pushSubscription|jetonCentralHash|jtiHash|codeHash|token|integrity|deliveryCode)$/;
export function cleanExport(value: any): any {
  if (Array.isArray(value)) return value.map(cleanExport);
  if (value instanceof Date || !value || typeof value !== "object") return value;
  if (typeof value.toJSON === "function") return value.toJSON();
  return Object.fromEntries(Object.entries(value).filter(([key]) => !forbidden.test(key)).map(([key, child]) => [key, cleanExport(child)]));
}

export async function collectExport(userId: string) {
  return db.$transaction(async (tx) => {
    const profile = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, emailVerified: true, createdAt: true, updatedAt: true } });
    if (!profile) throw new ApiError(401, "Session invalide", "UNAUTHORIZED");
    const customers = await tx.customer.findMany({ where: { OR: [{ userId }, ...(profile.emailVerified ? [{ email: profile.email, userId: null, deletedAt: null }] : [])] }, omit: { savedAddresses: false }, include: { favorites: true, carts: true, reviews: true, driverRatings: true } });
    const orders = await tx.order.findMany({ where: { customerId: { in: customers.map((c) => c.id) } }, include: { items: true, payments: true, invoice: true, pourboireApres: true } });
    const courier = await tx.courier.findUnique({ where: { userId }, include: { documents: true, payouts: true, supportMessages: true, deliveries: true, tips: true, ratings: true, offers: true, deliveryIncidents: true } });
    const chauffeur = await tx.chauffeurDrive.findUnique({ where: { userId }, include: { documents: true, courses: true, notes: true } });
    const rides = await tx.courseDrive.findMany({ where: { passagerId: userId }, include: { notes: true } });
    const adressesFavorites = await tx.adresseFavoriteDrive.findMany({ where: { userId } });
    const contactConfiance = await tx.contactConfianceDrive.findUnique({ where: { userId } });
    const alertesSos = await tx.alerteSosDrive.findMany({ where: { passagerId: userId } });
    const memberships = await tx.membership.findMany({ where: { userId }, select: { orgId: true, role: true, storeIds: true, createdAt: true } });
    const accessibleOrganizations = await tx.organization.findMany({ where: { id: { in: memberships.filter((m) => m.role === "ADMIN").map((m) => m.orgId) } }, include: { documents: true, merchantPayouts: true, platformInvoices: true } });
    const organizations = accessibleOrganizations.filter((org) => org.ownerEmail === profile.email);
    const company = await tx.societeDrive.findUnique({ where: { gerantId: userId }, include: { documents: true, vehicules: { include: { documents: true } } } });
    const consents = await tx.acceptationConditions.findMany({ where: { OR: [{ userId }, ...(profile.emailVerified ? [{ email: profile.email }] : [])] } });
    const notifications = profile.emailVerified ? await tx.notification.findMany({ where: { recipientEmail: profile.email } }) : [];
    const messages = await tx.ticketMessage.findMany({ where: { authorId: userId } });
    const audit = await tx.privacyAuditEvent.findMany({ where: { actor: actorHash(userId) }, select: { action: true, target: true, outcome: true, createdAt: true } });
    const result = cleanExport({ version: 1, generatedAt: new Date().toISOString(), profile, customers, orders, payments: orders.flatMap((order) => order.payments), addresses: customers.map((c) => ({ customerId: c.id, address: c.address, city: c.city, postalCode: c.postalCode, savedAddresses: c.savedAddresses })), preferences: customers.map((c) => ({ favorites: c.favorites, carts: c.carts })), courier, chauffeur, rides, adressesFavorites, contactConfiance, alertesSos, memberships, organizations, company, consents, notifications, messages, audit });
    if (Buffer.byteLength(JSON.stringify(result)) > 50 * 1024 * 1024) throw new ApiError(413, "Export trop volumineux : contactez le délégué à la protection des données", "EXPORT_TOO_LARGE");
    return result;
  }, { isolationLevel: "RepeatableRead", timeout: 60000 });
}

export function exportSummary(data: any) {
  return summaryPdf(["ZupOne / ZupEat - Export des donnees personnelles", `Genere le : ${data.generatedAt}`, `Profil : ${data.profile.email}`, `Commandes : ${data.orders.length}`, `Paiements : ${data.payments.length}`, `Trajets ZupDrive : ${data.rides.length}`, `Profils client : ${data.customers.length}`, `Livreur : ${data.courier ? "oui" : "non"}`, `Chauffeur : ${data.chauffeur ? "oui" : "non"}`, "Le fichier donnees.json contient le detail complet.", "Les documents disponibles sont inclus dans documents/ du ZIP.", "Conservez cet export dans un emplacement personnel protege."]);
}

export async function exportZip(data: any, caller: { userId: string; compte?: Compte }) {
  const documents: { id: string; url: string }[] = [
    ...(data.courier?.documents || []).map((d: any) => ({ id: d.id, url: d.documentUrl })),
    ...(data.chauffeur?.documents || []).map((d: any) => ({ id: d.id, url: d.url })),
    ...data.organizations.flatMap((o: any) => o.documents.map((d: any) => ({ id: d.id, url: d.documentUrl }))),
    ...(data.company?.documents || []).map((d: any) => ({ id: d.id, url: d.url })),
    ...(data.company?.vehicules || []).flatMap((v: any) => v.documents.map((d: any) => ({ id: d.id, url: d.url }))),
    ...(data.courier?.deliveries || []).filter((d: any) => d.proofPhoto).map((d: any) => ({ id: d.id, url: d.proofPhoto })),
  ];
  const entries = [{ name: "recapitulatif.pdf", content: exportSummary(data) }];
  const manifest: any[] = [];
  let size = 0;
  for (const document of documents) {
    const relative = cheminRelatif(document.url);
    if (!relative || !(await peutLire(caller, relative))) {
      manifest.push({ id: document.id, status: "UNAVAILABLE", reason: "Document externe ou accès indisponible : contacter le DPO" }); continue;
    }
    try {
      const content = await readPrivate(relative);
      size += content.length;
      if (size > 100 * 1024 * 1024) throw new ApiError(413, "Documents trop volumineux : contactez le DPO", "EXPORT_TOO_LARGE");
      const name = `documents/${document.id}.${relative.split(".").pop()}`;
      entries.push({ name, content }); manifest.push({ id: document.id, status: "INCLUDED", file: name });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      manifest.push({ id: document.id, status: "UNAVAILABLE", reason: "Fichier absent : contacter le DPO" });
    }
  }
  entries.push({ name: "donnees.json", content: Buffer.from(JSON.stringify({ ...data, documents: manifest }, null, 2)) });
  return zip(entries);
}
