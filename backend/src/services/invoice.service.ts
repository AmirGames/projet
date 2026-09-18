import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

export class InvoiceService {
  /**
   * Génère ou récupère la facture d'une commande.
   *
   * Une facture ne se réécrit pas : une fois émise, elle est figée.
   * Si la commande a déjà une facture en base, on la retourne telle quelle —
   * même si le commerçant a changé de raison sociale ou de taux de TVA depuis.
   * C'est la garantie comptable.
   *
   * Si c'est la première émission, on crée un numéro séquentiel sans trou,
   * on prend un snapshot de l'émetteur et on stocke tout.
   */
  static async generateInvoice(storeId: string, orderId: string) {
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: {
              select: { name: true, sku: true, category: { select: { name: true } } },
            },
            variant: { select: { label: true, sku: true } },
          },
        },
        customer: true,
        invoice: true,
        store: {
          select: {
            name: true, email: true, phone: true,
            address: true, city: true, postalCode: true,
            legalName: true, vatNumber: true, registrationNumber: true,
            org: {
              select: {
                name: true, legalName: true, vatNumber: true,
                registrationNumber: true, billingAddress: true,
                billingPostalCode: true, billingCity: true, billingCountry: true,
              },
            },
          },
        },
      },
    });

    if (!order || order.storeId !== storeId) {
      throw new ApiError(404, "Order not found", "ORDER_NOT_FOUND");
    }

    // Si la facture existe déjà, on la retourne sans la modifier.
    if (order.invoice) {
      return this._factureDepuisStockage(order.invoice);
    }

    // ── Numéro séquentiel ───────────────────────────────────────────────────
    //
    // On incrémente le compteur de la boutique pour l'année en cours dans la
    // même transaction que la création de la facture : impossible d'avoir deux
    // factures avec le même numéro, même sous forte charge.
    const annee = new Date(order.createdAt).getFullYear();

    const numero = await db.$transaction(async (tx) => {
      const seq = await tx.invoiceSeq.upsert({
        where:  { storeId_year_serie: { storeId, year: annee, serie: "FAC" } },
        update: { last: { increment: 1 } },
        create: { storeId, year: annee, serie: "FAC", last: 1 },
      });
      // FAC-2026-00042
      return `FAC-${annee}-${String(seq.last).padStart(5, "0")}`;
    });

    // ── Snapshot de l'émetteur ───────────────────────────────────────────────
    const org = order.store.org;
    const emetteur = {
      name:               order.store.name,
      email:              order.store.email,
      phone:              order.store.phone,
      address:            order.store.address,
      postalCode:         order.store.postalCode,
      city:               order.store.city,
      legalName:          order.store.legalName || org?.legalName    || null,
      vatNumber:          order.store.vatNumber  || org?.vatNumber    || null,
      registrationNumber: order.store.registrationNumber || org?.registrationNumber || null,
      billingAddress:     org?.billingAddress    || null,
      billingPostalCode:  org?.billingPostalCode || null,
      billingCity:        org?.billingCity       || null,
      billingCountry:     org?.billingCountry    || null,
    };

    const destinataire = {
      name:  order.customerName,
      email: order.customerEmail,
      phone: order.customerPhone,
    };

    // ── Lignes ───────────────────────────────────────────────────────────────
    const lignes = order.items.map((item) => ({
      description: item.product.name,
      category:    item.product.category?.name || null,
      variant:     item.variant?.label         || null,
      sku:         item.variant?.sku || item.product.sku,
      quantity:    item.quantity,
      unitPrice:   parseFloat(item.price.toString()),
      total:       parseFloat(item.total.toString()),
      taxRate:     parseFloat(item.taxRate.toString()),
      taxAmount:   parseFloat(item.taxAmount.toString()),
    }));

    // ── Récapitulatif TVA multi-taux ─────────────────────────────────────────
    //
    // On regroupe les lignes par taux — 6 % nourriture / 21 % boissons.
    // Chaque ligne porte maintenant son propre taux, figé à la commande.
    const recapTva = this._recapTva(lignes);

    const subtotal  = parseFloat(order.items.reduce((s, i) => s + parseFloat(i.total.toString()), 0).toFixed(2));
    const taxTotal  = parseFloat(recapTva.reduce((s, r) => s + r.taxe, 0).toFixed(2));
    const fees      = parseFloat(order.feesAmount.toString());
    const discount  = parseFloat(order.discountAmount.toString());
    const total     = parseFloat(order.totalAmount.toString());

    // ── Stockage ─────────────────────────────────────────────────────────────
    const facture = await db.invoice.create({
      data: {
        number:           numero,
        storeId,
        orderId:          order.id,
        issuedAt:         order.createdAt,
        emetteurJson:     emetteur     as any,
        destinataireJson: destinataire as any,
        lignesJson:       lignes       as any,
        subtotal,
        taxJson:  recapTva as any,
        taxTotal,
        fees,
        discount,
        total,
      },
    });

    return this._factureDepuisStockage(facture);
  }

  /** Formate une ligne Invoice de la base en objet retourné à l'API. */
  private static _factureDepuisStockage(facture: any) {
    const emetteur:     any = facture.emetteurJson;
    const destinataire: any = facture.destinataireJson;
    const lignes:       any[] = facture.lignesJson as any[];
    const taxJson:      any[] = facture.taxJson    as any[];

    return {
      invoiceNumber: facture.number,
      invoiceDate:   facture.issuedAt,
      dueDate:       new Date(new Date(facture.issuedAt).getTime() + 30 * 24 * 3600 * 1000),
      storeInfo:     emetteur,
      customerInfo:  destinataire,
      items:         lignes,

      subtotal:    parseFloat(facture.subtotal.toString()),
      taxDetail:   taxJson,                                          // tableau multi-taux
      tax:         parseFloat(facture.taxTotal.toString()),
      taxRate:     taxJson.length === 1 ? taxJson[0].taux : null,   // null si multi-taux
      taxIncluded: true,
      fees:        parseFloat(facture.fees.toString()),
      discount:    parseFloat(facture.discount.toString()),
      total:       parseFloat(facture.total.toString()),
    };
  }

  /** Regroupe les lignes par taux de TVA pour le récapitulatif du ticket. */
  private static _recapTva(
    lignes: { taxRate: number; taxAmount: number; total: number }[]
  ): { taux: number; base: number; taxe: number }[] {
    const map = new Map<number, { base: number; taxe: number }>();

    for (const l of lignes) {
      if (l.taxRate === 0) continue;
      const vu = map.get(l.taxRate);
      if (vu) {
        vu.base += l.total;
        vu.taxe += l.taxAmount;
      } else {
        map.set(l.taxRate, { base: l.total, taxe: l.taxAmount });
      }
    }

    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([taux, v]) => ({
        taux,
        base: parseFloat(v.base.toFixed(2)),
        taxe: parseFloat(v.taxe.toFixed(2)),
      }));
  }

  static async getInvoices(storeId: string, options?: { skip?: number; take?: number; startDate?: Date; endDate?: Date }) {
    const skip = options?.skip || 0;
    const take = options?.take || 50;

    const whereClause: any = { storeId };

    if (options?.startDate || options?.endDate) {
      whereClause.issuedAt = {};
      if (options.startDate) whereClause.issuedAt.gte = options.startDate;
      if (options.endDate)   whereClause.issuedAt.lte = options.endDate;
    }

    const [invoices, total] = await Promise.all([
      db.invoice.findMany({
        where: whereClause,
        skip, take,
        orderBy: { issuedAt: "desc" },
      }),
      db.invoice.count({ where: whereClause }),
    ]);

    return {
      data: invoices.map((inv) => ({
        invoiceNumber: inv.number,
        orderId:       inv.orderId,
        customerName:  (inv.destinataireJson as any)?.name || "—",
        customerEmail: (inv.destinataireJson as any)?.email || "—",
        amount:        parseFloat(inv.total.toString()),
        itemCount:     ((inv.lignesJson as any[]) || []).length,
        status:        "ISSUED",
        date:          inv.issuedAt,
      })),
      total, skip, take,
    };
  }

  static async getRevenueStats(storeId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const orders = await db.order.findMany({
      where: {
        storeId,
        createdAt:     { gte: startDate },
        paymentStatus: "SUCCEEDED",
      },
      select: {
        totalAmount: true,
        taxAmount:   true,
        feesAmount:  true,
        createdAt:   true,
        status:      true,
      },
    });

    return {
      totalRevenue:        orders.reduce((s, o) => s + parseFloat(o.totalAmount.toString()), 0),
      totalTax:            orders.reduce((s, o) => s + parseFloat(o.taxAmount.toString()),   0),
      totalFees:           orders.reduce((s, o) => s + parseFloat(o.feesAmount.toString()),  0),
      netRevenue:          orders.reduce((s, o) => s + parseFloat(o.totalAmount.toString()) - parseFloat(o.feesAmount.toString()), 0),
      invoiceCount:        orders.length,
      averageInvoiceAmount: orders.length > 0
        ? orders.reduce((s, o) => s + parseFloat(o.totalAmount.toString()), 0) / orders.length
        : 0,
    };
  }
}
