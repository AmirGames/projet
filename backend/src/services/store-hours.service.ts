import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

export interface DayHours {
  open: string; // HH:mm format
  close: string; // HH:mm format
  closed: boolean;
}

export interface OperatingHours {
  MON: DayHours;
  TUE: DayHours;
  WED: DayHours;
  THU: DayHours;
  FRI: DayHours;
  SAT: DayHours;
  SUN: DayHours;
}

export interface PickupSlot {
  id?: string;
  start: string; // HH:mm format
  end: string; // HH:mm format
  maxOrders: number;
}

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const DEFAULT_HOURS: OperatingHours = {
  MON: { open: "09:00", close: "22:00", closed: false },
  TUE: { open: "09:00", close: "22:00", closed: false },
  WED: { open: "09:00", close: "22:00", closed: false },
  THU: { open: "09:00", close: "22:00", closed: false },
  FRI: { open: "09:00", close: "23:00", closed: false },
  SAT: { open: "10:00", close: "23:00", closed: false },
  SUN: { open: "10:00", close: "22:00", closed: false },
};

export class StoreHoursService {
  static async getHours(storeId: string) {
    const store = await db.store.findUnique({
      where: { id: storeId },
      select: { operatingHours: true, isOpen: true, pickupSlots: true },
    });

    if (!store) {
      throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
    }

    const hours = (typeof store.operatingHours === 'object' && store.operatingHours ? store.operatingHours : {}) as Partial<OperatingHours>;

    return {
      operatingHours: { ...DEFAULT_HOURS, ...hours },
      isOpen: store.isOpen,
      pickupSlots: (store.pickupSlots as unknown as PickupSlot[]) || [],
    };
  }


  /**
   * Créneaux de retrait réellement proposables.
   *
   * Un champ d'heure libre laissait le client choisir 9 h alors que la
   * boutique ouvre à 11 h : la commande partait, et personne n'était là pour
   * la lui donner. On ne propose donc que ce qui existe.
   */
  static async creneauxDeRetrait(
    storeId: string,
    options: { jours?: number; pasMinutes?: number; delaiPreparationMinutes?: number } = {}
  ) {
    const jours = options.jours ?? 7;
    const pas = options.pasMinutes ?? 15;
    const delai = options.delaiPreparationMinutes ?? 30;

    const { operatingHours } = await this.getHours(storeId);

    // Le plus tôt possible : maintenant, plus le temps de préparer.
    const plancher = new Date(Date.now() + delai * 60 * 1000);
    const resultat: {
      date: string;
      libelle: string;
      creneaux: { valeur: string; libelle: string }[];
    }[] = [];

    for (let decalage = 0; decalage < jours; decalage++) {
      const jour = new Date();
      jour.setDate(jour.getDate() + decalage);
      jour.setHours(0, 0, 0, 0);

      // getDay() commence au dimanche ; notre table commence au lundi.
      const code = DAYS[(jour.getDay() + 6) % 7];
      const horaires = operatingHours[code as keyof OperatingHours];

      if (!horaires || horaires.closed) continue;

      const [heureOuverture, minuteOuverture] = horaires.open.split(":").map(Number);
      const [heureFermeture, minuteFermeture] = horaires.close.split(":").map(Number);

      const ouverture = new Date(jour);
      ouverture.setHours(heureOuverture, minuteOuverture, 0, 0);

      const fermeture = new Date(jour);
      fermeture.setHours(heureFermeture, minuteFermeture, 0, 0);

      // Une fermeture après minuit appartient au lendemain.
      if (fermeture <= ouverture) fermeture.setDate(fermeture.getDate() + 1);

      const creneaux: { valeur: string; libelle: string }[] = [];

      for (
        const instant = new Date(ouverture);
        instant < fermeture;
        instant.setMinutes(instant.getMinutes() + pas)
      ) {
        if (instant < plancher) continue;

        creneaux.push({
          valeur: instant.toISOString(),
          libelle: instant.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        });
      }

      if (creneaux.length === 0) continue;

      resultat.push({
        date: jour.toISOString().slice(0, 10),
        libelle:
          decalage === 0
            ? "Aujourd'hui"
            : decalage === 1
              ? "Demain"
              : jour.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
        creneaux,
      });
    }

    return resultat;
  }

  static async updateHours(storeId: string, hours: Partial<OperatingHours>) {
    const current = await this.getHours(storeId);
    const updated = { ...current.operatingHours, ...hours };

    return await db.store.update({
      where: { id: storeId },
      data: { operatingHours: updated as any },
      select: { operatingHours: true },
    });
  }

  static async updateDay(storeId: string, day: string, dayHours: DayHours) {
    if (!DAYS.includes(day)) {
      throw new ApiError(400, "Invalid day of week", "INVALID_DAY");
    }

    this.validateTimeFormat(dayHours.open, dayHours.close);

    const current = await this.getHours(storeId);
    const updated = {
      ...current.operatingHours,
      [day]: dayHours,
    };

    return await db.store.update({
      where: { id: storeId },
      data: { operatingHours: updated as any },
      select: { operatingHours: true },
    });
  }

  static async toggleDay(storeId: string, day: string) {
    if (!DAYS.includes(day)) {
      throw new ApiError(400, "Invalid day of week", "INVALID_DAY");
    }

    const current = await this.getHours(storeId);
    const dayHours = current.operatingHours[day as keyof OperatingHours];

    const updated = {
      ...current.operatingHours,
      [day]: {
        ...dayHours,
        closed: !dayHours.closed,
      },
    };

    return await db.store.update({
      where: { id: storeId },
      data: { operatingHours: updated as any },
      select: { operatingHours: true },
    });
  }

  static async setStoreStatus(storeId: string, isOpen: boolean) {
    return await db.store.update({
      where: { id: storeId },
      data: { isOpen },
      select: { isOpen: true },
    });
  }

  static async addPickupSlot(storeId: string, slot: PickupSlot) {
    this.validateTimeFormat(slot.start, slot.end);

    if (slot.maxOrders < 1) {
      throw new ApiError(400, "Max orders must be at least 1", "INVALID_MAX_ORDERS");
    }

    const store = await db.store.findUnique({
      where: { id: storeId },
      select: { pickupSlots: true },
    });

    if (!store) {
      throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
    }

    const slots = (store.pickupSlots as unknown as PickupSlot[]) || [];
    const newSlot = {
      id: `slot_${Date.now()}`,
      start: slot.start,
      end: slot.end,
      maxOrders: slot.maxOrders,
    };

    return await db.store.update({
      where: { id: storeId },
      data: { pickupSlots: [...slots, newSlot] as any },
      select: { pickupSlots: true },
    });
  }

  static async updatePickupSlot(storeId: string, slotId: string, slot: PickupSlot) {
    this.validateTimeFormat(slot.start, slot.end);

    if (slot.maxOrders < 1) {
      throw new ApiError(400, "Max orders must be at least 1", "INVALID_MAX_ORDERS");
    }

    const store = await db.store.findUnique({
      where: { id: storeId },
      select: { pickupSlots: true },
    });

    if (!store) {
      throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
    }

    const slots = (store.pickupSlots as unknown as PickupSlot[]) || [];
    const updated = slots.map((s) =>
      s.id === slotId ? { id: slotId, ...slot } : s
    );

    return await db.store.update({
      where: { id: storeId },
      data: { pickupSlots: updated as any },
      select: { pickupSlots: true },
    });
  }

  static async deletePickupSlot(storeId: string, slotId: string) {
    const store = await db.store.findUnique({
      where: { id: storeId },
      select: { pickupSlots: true },
    });

    if (!store) {
      throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
    }

    const slots = (store.pickupSlots as unknown as PickupSlot[]) || [];
    const updated = slots.filter((s) => s.id !== slotId);

    return await db.store.update({
      where: { id: storeId },
      data: { pickupSlots: updated as any },
      select: { pickupSlots: true },
    });
  }

  static isStoreOpen(operatingHours: OperatingHours): boolean {
    const now = new Date();
    const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const dayKey = days[now.getDay()] as keyof OperatingHours;
    const dayHours = operatingHours[dayKey];

    if (dayHours.closed) {
      return false;
    }

    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;

    return currentTime >= dayHours.open && currentTime <= dayHours.close;
  }

  private static validateTimeFormat(start: string, end: string) {
    const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;

    if (!timeRegex.test(start) || !timeRegex.test(end)) {
      throw new ApiError(400, "Invalid time format. Use HH:mm", "INVALID_TIME_FORMAT");
    }

    if (start >= end) {
      throw new ApiError(400, "Opening time must be before closing time", "INVALID_TIME_RANGE");
    }
  }
}
