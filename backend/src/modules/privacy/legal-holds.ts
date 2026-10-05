import { db } from "../../services/db";
export const HOLD_MODELS = ["Order", "OrderDelivery", "CourierDocument", "OrganizationDocument", "DocumentChauffeurDrive", "MerchantTicket", "CourierSupportMessage", "PlatformInvoice", "CourierPayout", "MerchantPayout", "AcceptationConditions", "CourseDrive"] as const;
export async function activeHolds(now = new Date()) {
  const holds = await db.privacyLegalHold.findMany({ where: { expiresAt: { gt: now } }, select: { model: true, recordId: true } });
  return (model: string) => holds.filter((hold) => hold.model === model).map((hold) => hold.recordId);
}
