import { db } from "../../services/db";

const ACTIFS = ["PREPARED", "APPROVED", "EXPORTED", "SUBMITTED"];
type Ecart = { code: string; type: "releve" | "lot"; id: string };
type Ligne = { kind: string; payoutId: string; montant: number };
const centimes = (montant: unknown) => Math.round(Number(montant) * 100);

/** Photographie cohérente, lecture seule imposée par PostgreSQL ; aucun IBAN sorti. */
export async function diagnostiquerVersements() {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`;
      const [releves, commercants, lots] = await Promise.all([
        tx.courierPayout.findMany({
          select: {
            id: true,
            driverId: true,
            status: true,
            batchId: true,
            amount: true,
            deliveryCount: true,
            paidAt: true,
            deliveries: {
              select: {
                driverId: true,
                driverPayout: true,
                order: { select: { feesAmount: true } },
              },
            },
            tips: { select: { driverId: true, status: true, amount: true } },
          },
        }),
        tx.merchantPayout.findMany({
          select: { id: true, status: true, batchId: true, amount: true },
        }),
        tx.payoutBatch.findMany({
          select: {
            id: true,
            status: true,
            total: true,
            itemCount: true,
            itemsJson: true,
            exportedAt: true,
            xmlSha256: true,
          },
        }),
      ]);
      const ecarts: Ecart[] = [];
      const ajouter = (code: string, type: Ecart["type"], id: string) =>
        ecarts.push({ code, type, id });
      const parLot = new Map(lots.map((l) => [l.id, l]));
      for (const r of releves) {
        if (r.status === "CANCELLED") {
          if (r.deliveries.length || r.tips.length)
            ajouter("CANCELLED_WITH_EARNINGS", "releve", r.id);
        } else {
          const montant =
            r.deliveries.reduce(
              (s, c) => s + centimes(c.driverPayout ?? c.order.feesAmount),
              0,
            ) + r.tips.reduce((s, t) => s + centimes(t.amount), 0);
          if (
            montant !== centimes(r.amount) ||
            r.deliveryCount !== r.deliveries.length
          )
            ajouter("EARNINGS_MISMATCH", "releve", r.id);
        }
        if (
          r.deliveries.some((c) => c.driverId !== r.driverId) ||
          r.tips.some((t) => t.driverId !== r.driverId || t.status !== "PAID")
        )
          ajouter("EARNINGS_OWNER_OR_STATE", "releve", r.id);
        if (r.status === "PAID" && !r.paidAt)
          ajouter("PAID_WITHOUT_DATE", "releve", r.id);
      }
      for (const r of [...releves, ...commercants]) {
        if (!r.batchId) continue;
        const lot = parLot.get(r.batchId);
        if (
          !lot ||
          (r.status === "PENDING"
            ? !ACTIFS.includes(lot.status)
            : r.status !== "PAID" || lot.status !== "CONFIRMED")
        )
          ajouter("PAYOUT_BATCH_STATE", "releve", r.id);
      }
      const parReleve = new Map<
        string,
        { id: string; status: string; batchId: string | null; amount: unknown }
      >([
        ...releves.map((r) => [`livreur:${r.id}`, r] as const),
        ...commercants.map((r) => [`commercant:${r.id}`, r] as const),
      ]);
      for (const lot of lots) {
        const items = lot.itemsJson as unknown as Ligne[];
        if (
          !Array.isArray(items) ||
          items.some(
            (l) =>
              !l ||
              !["livreur", "commercant"].includes(l.kind) ||
              !l.payoutId ||
              !Number.isFinite(l.montant) ||
              l.montant <= 0,
          )
        ) {
          ajouter("INVALID_SNAPSHOT", "lot", lot.id);
          continue;
        }
        if (
          items.length !== lot.itemCount ||
          new Set(items.map((l) => `${l.kind}:${l.payoutId}`)).size !==
            items.length ||
          items.reduce((s, l) => s + centimes(l.montant), 0) !==
            centimes(lot.total)
        )
          ajouter("BATCH_TOTAL_OR_COUNT", "lot", lot.id);
        if (
          ["EXPORTED", "SUBMITTED", "CONFIRMED"].includes(lot.status) &&
          (!lot.exportedAt || !lot.xmlSha256)
        )
          ajouter("MISSING_EXPORT_PROOF", "lot", lot.id);
        // Un lot refusé/annulé conserve ses anciennes lignes : elles peuvent être
        // rattachées à un nouveau lot. Ce n'est pas une anomalie.
        if (!ACTIFS.includes(lot.status) && lot.status !== "CONFIRMED")
          continue;
        if (
          items.some((l) => {
            const r = parReleve.get(`${l.kind}:${l.payoutId}`);
            return (
              !r ||
              r.batchId !== lot.id ||
              centimes(r.amount) !== centimes(l.montant) ||
              r.status !== (lot.status === "CONFIRMED" ? "PAID" : "PENDING")
            );
          }) ||
          [...parReleve.values()].filter((r) => r.batchId === lot.id).length !==
            items.length
        )
          ajouter("BATCH_CONTENT_MISMATCH", "lot", lot.id);
      }
      return {
        date: new Date().toISOString(),
        lectureSeule: true,
        relevesLivreurs: releves.length,
        lots: lots.length,
        ecarts,
      };
    },
    { timeout: 60000 },
  );
}
