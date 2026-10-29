import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";
import { emitNotification } from "../realtime/socket";
import { notifierPlateforme } from "../notifications/notification.service";
import { FileUploadService } from "../files/file-upload.service";
import { libelleDuDocument, piecesAttendues, TypeDocument } from "./driver-approval.service";

export type TypeVehiculeLivreur = "bike" | "scooter" | "car";
const TYPES_VEHICULE: TypeVehiculeLivreur[] = ["bike", "scooter", "car"];

function estDateValide(date: Date | null) {
  return date === null || date.getTime() > Date.now();
}

function libelleVehicule(type: string) {
  return ({ bike: "vélo", scooter: "scooter", car: "voiture" } as Record<string, string>)[type] || type;
}

export const DriverVehicleChangeService = {
  async etat(driverId: string) {
    const [livreur, demande] = await Promise.all([
      db.courier.findUnique({ where: { id: driverId }, select: { vehicleType: true, vehiclePlate: true } }),
      db.courierVehicleChangeRequest.findFirst({
        where: { driverId },
        orderBy: { createdAt: "desc" },
        include: { documents: { orderBy: { createdAt: "desc" } } },
      }),
    ]);
    if (!livreur) throw new ApiError(404, "Livreur introuvable", "DRIVER_NOT_FOUND");

    if (!demande) return { currentVehicleType: livreur.vehicleType, currentVehiclePlate: livreur.vehiclePlate, request: null };

    const documents = await db.courierDocument.findMany({
      where: { driverId },
      orderBy: { createdAt: "desc" },
    });
    const documentsRequis = piecesAttendues(demande.requestedVehicleType).map((type) => {
      // Une nouvelle pièce déposée pour la demande prime sur l'ancienne :
      // une pièce refusée/en attente ne peut pas être contournée par un ancien accord.
      const piece = documents.find((doc) => doc.type === type);
      return {
        type,
        libelle: libelleDuDocument(type),
        documentId: piece?.id ?? null,
        status: piece && estDateValide(piece.expiryDate) ? piece.status : piece ? "EXPIRED" : "MISSING",
        reviewNote: piece?.reviewNote ?? null,
        expiryDate: piece?.expiryDate ?? null,
        uploadedForRequest: piece?.vehicleChangeRequestId === demande.id,
      };
    });

    return {
      currentVehicleType: livreur.vehicleType,
      currentVehiclePlate: livreur.vehiclePlate,
      request: {
        id: demande.id,
        currentVehicleType: demande.currentVehicleType,
        requestedVehicleType: demande.requestedVehicleType,
        requestedVehiclePlate: demande.requestedVehiclePlate,
        status: demande.status,
        reviewNote: demande.reviewNote,
        createdAt: demande.createdAt,
        documents: documentsRequis,
        dossierComplet: documentsRequis.every((document) => document.status === "APPROVED"),
      },
    };
  },

  async historiqueAdmin(driverId: string) {
    const requests = await db.courierVehicleChangeRequest.findMany({
      where: { driverId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        documents: { orderBy: { createdAt: "desc" } },
        driver: { include: { documents: { orderBy: { createdAt: "desc" } } } },
      },
    });
    return requests.map((request) => ({
      ...request,
      requiredDocuments: piecesAttendues(request.requestedVehicleType).map((type) => {
        const document = request.driver.documents.find((piece) => piece.type === type);
        return {
          type,
          libelle: libelleDuDocument(type),
          documentId: document?.id ?? null,
          documentUrl: document?.documentUrl ?? null,
          status: document && estDateValide(document.expiryDate) ? document.status : document ? "EXPIRED" : "MISSING",
          reviewNote: document?.reviewNote ?? null,
          expiryDate: document?.expiryDate ?? null,
        };
      }),
    }));
  },

  async demander(driverId: string, input: { vehicleType: TypeVehiculeLivreur; vehiclePlate?: string | null }) {
    if (!TYPES_VEHICULE.includes(input.vehicleType)) {
      throw new ApiError(400, "Type de véhicule invalide", "INVALID_VEHICLE_TYPE");
    }
    const livreur = await db.courier.findUnique({ where: { id: driverId } });
    if (!livreur) throw new ApiError(404, "Livreur introuvable", "DRIVER_NOT_FOUND");
    if (livreur.status !== "ACTIVE") {
      throw new ApiError(403, "Seul un livreur déjà validé peut demander un changement de véhicule.", "DRIVER_NOT_ACTIVE");
    }
    if (livreur.vehicleType === input.vehicleType) {
      throw new ApiError(400, "Ce véhicule est déjà celui de votre compte.", "VEHICLE_UNCHANGED");
    }

    const plaque = input.vehicleType === "bike" ? null : input.vehiclePlate?.trim().toUpperCase();
    if (input.vehicleType !== "bike" && !plaque) {
      throw new ApiError(400, "La plaque d'immatriculation est obligatoire pour ce véhicule.", "VEHICLE_PLATE_REQUIRED");
    }
    if (plaque && plaque.length > 20) {
      throw new ApiError(400, "La plaque d'immatriculation ne peut pas dépasser 20 caractères.", "INVALID_VEHICLE_PLATE");
    }

    try {
      const demande = await db.courierVehicleChangeRequest.create({
        data: {
          driverId,
          currentVehicleType: livreur.vehicleType,
          requestedVehicleType: input.vehicleType,
          requestedVehiclePlate: plaque,
        },
      });
      await notifierPlateforme(
        "Changement de véhicule demandé",
        `${livreur.name} demande le passage de ${libelleVehicule(livreur.vehicleType)} à ${libelleVehicule(input.vehicleType)}.`,
        "/superowner/zupeat/drivers?status=VEHICLE_CHANGE_PENDING"
      );
      return demande;
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        throw new ApiError(409, "Une demande de changement de véhicule est déjà en cours.", "VEHICLE_CHANGE_ALREADY_PENDING");
      }
      throw error;
    }
  },

  async deposerFichier(
    driverId: string,
    requestId: string,
    piece: { type: TypeDocument; file: Buffer; filename: string; mimeType?: string; expiryDate?: string | null }
  ) {
    const demande = await db.courierVehicleChangeRequest.findFirst({ where: { id: requestId, driverId, status: "PENDING" } });
    if (!demande) throw new ApiError(404, "Demande de changement introuvable ou déjà clôturée.", "VEHICLE_CHANGE_NOT_FOUND");
    if (!piecesAttendues(demande.requestedVehicleType).includes(piece.type)) {
      throw new ApiError(400, "Cette pièce n'est pas requise pour le véhicule demandé.", "DOCUMENT_NOT_REQUIRED");
    }

    const expiryDate = piece.expiryDate ? new Date(piece.expiryDate) : null;
    if (expiryDate && (Number.isNaN(expiryDate.getTime()) || expiryDate.getTime() < Date.now())) {
      throw new ApiError(400, `${libelleDuDocument(piece.type)} : date d'expiration invalide ou déjà passée.`, "DOCUMENT_EXPIRED");
    }

    const { url } = await FileUploadService.uploadDocument(
      piece.file,
      `driver-${driverId}-vehicle-change-${requestId}-${piece.type}-${Date.now()}`,
      "drivers",
      piece.mimeType
    );
    const uploaded = await db.courierDocument.create({
      data: {
        driverId,
        vehicleChangeRequestId: requestId,
        type: piece.type,
        documentUrl: url,
        expiryDate,
        status: "PENDING",
      },
    });

    await notifierPlateforme(
      `Document de changement de véhicule — ${libelleDuDocument(piece.type)}`,
      "Une nouvelle pièce attend la validation du support.",
      "/superowner/zupeat/drivers?status=VEHICLE_CHANGE_PENDING"
    );
    return uploaded;
  },

  async annuler(driverId: string, requestId: string) {
    const annulee = await db.courierVehicleChangeRequest.updateMany({
      where: { id: requestId, driverId, status: "PENDING" },
      data: { status: "CANCELLED", reviewedAt: new Date(), reviewNote: "Annulée par le livreur." },
    });
    if (annulee.count !== 1) throw new ApiError(404, "Demande introuvable ou déjà clôturée.", "VEHICLE_CHANGE_NOT_FOUND");
  },

  async examiner(driverId: string, requestId: string, adminId: string, decision: { status: "APPROVED" | "REJECTED"; reason?: string }) {
    const request = await db.courierVehicleChangeRequest.findFirst({
      where: { id: requestId, driverId, status: "PENDING" },
      include: { documents: { orderBy: { createdAt: "desc" } }, driver: { include: { documents: { orderBy: { createdAt: "desc" } } } } },
    });
    if (!request) throw new ApiError(404, "Demande introuvable ou déjà traitée.", "VEHICLE_CHANGE_NOT_FOUND");
    if (decision.status === "REJECTED" && !decision.reason?.trim()) {
      throw new ApiError(400, "Un motif est nécessaire pour refuser la demande.", "MISSING_REASON");
    }
    if (request.driver.vehicleType !== request.currentVehicleType) {
      throw new ApiError(409, "Le véhicule actif a changé depuis la demande. Rechargez le dossier.", "VEHICLE_CHANGE_STALE");
    }

    if (decision.status === "APPROVED") {
      if (request.driver.currentOrderId) {
        throw new ApiError(409, "Le changement sera effectif après la livraison en cours. Réessayez ensuite.", "ACTIVE_DELIVERY");
      }
      const piecesManquantes = piecesAttendues(request.requestedVehicleType).filter((type) => {
        const latest = request.driver.documents.find((document) => document.type === type);
        return !latest || latest.status !== "APPROVED" || !estDateValide(latest.expiryDate);
      });
      if (piecesManquantes.length) {
        throw new ApiError(400, `Pièces requises non validées : ${piecesManquantes.map(libelleDuDocument).join(", ")}.`, "VEHICLE_CHANGE_DOCUMENTS_INCOMPLETE");
      }

      await db.$transaction(async (tx) => {
        const updatedRequest = await tx.courierVehicleChangeRequest.updateMany({
          where: { id: requestId, driverId, status: "PENDING", currentVehicleType: request.currentVehicleType },
          data: { status: "APPROVED", reviewedBy: adminId, reviewedAt: new Date(), reviewNote: null },
        });
        if (updatedRequest.count !== 1) throw new ApiError(409, "La demande a déjà été traitée.", "VEHICLE_CHANGE_STALE");

        const updatedDriver = await tx.courier.updateMany({
          where: { id: driverId, vehicleType: request.currentVehicleType, currentOrderId: null },
          data: {
            vehicleType: request.requestedVehicleType,
            vehiclePlate: request.requestedVehiclePlate,
            licensePlate: request.requestedVehiclePlate,
          },
        });
        if (updatedDriver.count !== 1) throw new ApiError(409, "Le véhicule actif a changé pendant la validation.", "VEHICLE_CHANGE_STALE");
      });
    } else {
      const updated = await db.courierVehicleChangeRequest.updateMany({
        where: { id: requestId, driverId, status: "PENDING" },
        data: { status: "REJECTED", reviewedBy: adminId, reviewedAt: new Date(), reviewNote: decision.reason!.trim() },
      });
      if (updated.count !== 1) throw new ApiError(409, "La demande a déjà été traitée.", "VEHICLE_CHANGE_STALE");
    }

    const titre = decision.status === "APPROVED" ? "Changement de véhicule accepté" : "Changement de véhicule refusé";
    const message = decision.status === "APPROVED"
      ? `Votre véhicule est maintenant enregistré comme ${libelleVehicule(request.requestedVehicleType)}. Les prochaines courses utiliseront ce véhicule.`
      : `Votre véhicule actuel reste inchangé. Motif : ${decision.reason!.trim()}`;
    await this.prevenirLivreur(driverId, titre, message);
    logger.info("Driver vehicle change reviewed", { driverId, requestId, status: decision.status, adminId });
    return { status: decision.status, vehicleType: decision.status === "APPROVED" ? request.requestedVehicleType : request.currentVehicleType };
  },

  async prevenirLivreur(driverId: string, title: string, message: string) {
    try {
      const driver = await db.courier.findUnique({ where: { id: driverId }, select: { email: true } });
      if (!driver) return;
      const notification = await db.notification.create({
        data: { type: "PLATFORM_ANNOUNCEMENT", title, message, recipientEmail: driver.email, link: "/driver/profile" },
      });
      emitNotification(driver.email, notification);
    } catch (error) {
      logger.warn("Vehicle change notification failed", { driverId, error: error instanceof Error ? error.message : error });
    }
  },
};
