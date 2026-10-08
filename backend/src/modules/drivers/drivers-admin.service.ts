import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { piecesAttendues } from "./driver-approval.service";
import { DriverSupportService } from "./driver-support.service";

/** Administration des livreurs par la plateforme : liste des dossiers et fil de support. */
export const DriversAdminService = {
  /**
   * Les livreurs, et où en est leur dossier.
   *
   * La plateforme n'avait aucune page sur ses livreurs : elle ne pouvait ni les
   * voir, ni les valider, ni les écarter. N'importe qui s'inscrivait et recevait
   * une course dans la minute.
   */
  async lister({ limit, offset, statut }: { limit: number; offset: number; statut: string }) {
    const where = statut && statut !== "ALL" ? { status: statut } : {};

    const [livreurs, total, parEtat] = await Promise.all([
      db.courier.findMany({
        where,
        skip: offset,
        take: limit,
        include: {
          documents: { select: { type: true, status: true, expiryDate: true } },
          _count: { select: { deliveries: true } },
        },
        // Les dossiers à traiter d'abord : c'est ce que la plateforme vient
        // faire ici.
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      }),
      db.courier.count({ where }),
      db.courier.groupBy({ by: ["status"], _count: true }),
    ]);

    return {
      drivers: livreurs.map((livreur) => {
        const attendues = piecesAttendues(livreur.vehicleType);
        const validees = new Set(
          livreur.documents.filter((piece) => piece.status === "APPROVED").map((p) => p.type)
        );

        return {
          id: livreur.id,
          name: livreur.name,
          email: livreur.email,
          phone: livreur.phone,
          vehicleType: livreur.vehicleType,
          vehiclePlate: livreur.vehiclePlate,
          status: livreur.status,
          statusReason: livreur.statusReason,
          approvedAt: livreur.approvedAt,
          isOnline: livreur.isOnline,
          // Nul tant que personne ne l'a noté : classer les livreurs sur un 5
          // par défaut revenait à ne pas les classer du tout.
          rating: livreur.totalRatings > 0 ? Number(livreur.rating) : null,
          avis: livreur.totalRatings,
          totalDeliveries: livreur.totalDeliveries,
          totalEarnings: Number(livreur.totalEarnings),
          courses: livreur._count.deliveries,
          // De quoi voir d'un coup d'œil ce qu'il reste à examiner.
          piecesDeposees: livreur.documents.length,
          piecesValidees: validees.size,
          piecesAttendues: attendues.length,
          dossierComplet: attendues.every((type) => validees.has(type)),
          suppressionDemandeeLe: livreur.suppressionDemandeeLe,
          createdAt: livreur.createdAt,
        };
      }),
      counts: Object.fromEntries(parEtat.map((ligne) => [ligne.status, ligne._count])),
      pagination: { total, limit, offset },
    };
  },

  /** Le fil de support d'un livreur, marqué lu côté équipe. */
  async filDeSupport(driverId: string) {
    const [messages, livreur] = await Promise.all([
      DriverSupportService.fil(driverId),
      db.courier.findUnique({
        where: { id: driverId },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          isOnline: true,
          currentOrderId: true,
          latitude: true,
          longitude: true,
          lastLocationUpdate: true,
          gpsLostAt: true,
        },
      }),
    ]);

    if (!livreur) throw new ApiError(404, "Livreur introuvable", "DRIVER_NOT_FOUND");

    await DriverSupportService.marquerLu(driverId, "SUPPORT");
    return { driver: livreur, messages };
  },
};
