import type { ClientTransaction } from "../../services/db";

export async function effacerCommandesClient(tx: ClientTransaction, customerId: string, orderIds: string[], holds: string[]) {
  const geles = orderIds.filter((id) => holds.includes(id));
  if (geles.length) {
    await tx.privacyDeferredOrderErasure.createMany({ data: geles.map((orderId) => ({ orderId })), skipDuplicates: true });
    await tx.order.updateMany({ where: { customerId, id: { in: geles } }, data: { customerId: null, trackingTokenHash: null } });
  }
  await tx.order.updateMany({ where: { customerId, id: { notIn: geles } }, data: { customerId: null, customerName: "Client supprimé", customerEmail: "supprime@zupeat.invalid", customerPhone: "", deliveryAddress: null, deliveryCity: null, deliveryPostal: null, deliveryLat: null, deliveryLng: null, notes: null, rejectionNote: null, trackingTokenHash: null } });
}
