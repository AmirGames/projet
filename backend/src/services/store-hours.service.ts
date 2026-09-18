import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

/**
 * Les horaires d'ouverture d'une boutique.
 *
 * Un jour n'avait qu'une plage : une ouverture, une fermeture. Un restaurant
 * qui sert à midi puis le soir devait donc déclarer 11 h 30 – 22 h 00 et se
 * dire ouvert tout l'après-midi, ou renoncer à l'un des deux services. Et une
 * fermeture à 1 h du matin était refusée à la saisie — « l'heure d'ouverture
 * doit précéder l'heure de fermeture » —, alors que c'est l'horaire normal
 * d'un vendredi soir.
 *
 * Un jour porte donc désormais **une liste de plages**, et une plage dont la
 * fermeture précède l'ouverture se termine le lendemain.
 */

/** Une plage : un service. `close` avant `open` signifie « après minuit ». */
export interface Plage {
  open: string; // HH:mm
  close: string; // HH:mm
}

export interface DayHours {
  closed: boolean;
  plages: Plage[];
  /**
   * Ancien format, conservé pour ce qui lit encore un seul couple d'heures :
   * la première et la dernière heure de la journée.
   */
  open: string;
  close: string;
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
  start: string;
  end: string;
  maxOrders: number;
}

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export const JOURS = DAYS;

export const NOM_DU_JOUR: Record<string, string> = {
  MON: "Lundi",
  TUE: "Mardi",
  WED: "Mercredi",
  THU: "Jeudi",
  FRI: "Vendredi",
  SAT: "Samedi",
  SUN: "Dimanche",
};

/** Au-delà, c'est une erreur de saisie plutôt qu'un service de plus. */
const PLAGES_MAX = 4;

const HEURE = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;

const minutes = (heure: string) => {
  const [h, m] = heure.split(":").map(Number);
  return h * 60 + m;
};

/** Une plage en minutes depuis l'ouverture du jour, minuit franchi compris. */
const bornes = (plage: Plage) => {
  const debut = minutes(plage.open);
  let fin = minutes(plage.close);

  // 17 h 30 → 01 h 00 : la fermeture appartient au lendemain.
  if (fin <= debut) fin += 24 * 60;

  return { debut, fin };
};

const jour = (plages: Plage[]): DayHours => ({
  closed: false,
  plages,
  open: plages[0]?.open || "09:00",
  close: plages[plages.length - 1]?.close || "22:00",
});

const DEFAULT_HOURS: OperatingHours = {
  MON: jour([{ open: "09:00", close: "22:00" }]),
  TUE: jour([{ open: "09:00", close: "22:00" }]),
  WED: jour([{ open: "09:00", close: "22:00" }]),
  THU: jour([{ open: "09:00", close: "22:00" }]),
  FRI: jour([{ open: "09:00", close: "23:00" }]),
  SAT: jour([{ open: "10:00", close: "23:00" }]),
  SUN: jour([{ open: "10:00", close: "22:00" }]),
};

/**
 * Lit un jour quel que soit le format enregistré.
 *
 * Les boutiques existantes portent l'ancien `{ open, close, closed }` : le
 * migrer d'un coup en base aurait demandé un script et un temps d'arrêt, alors
 * qu'une lecture tolérante suffit. Le nouveau format s'écrit dès la première
 * modification.
 */
export function lireLeJour(brut: unknown): DayHours {
  const lu = (brut || {}) as Partial<DayHours> & { open?: string; close?: string };

  const plages = Array.isArray(lu.plages)
    ? lu.plages.filter((p) => p && HEURE.test(p.open) && HEURE.test(p.close))
    : lu.open && lu.close
      ? [{ open: lu.open, close: lu.close }]
      : [];

  return {
    closed: !!lu.closed,
    plages,
    open: plages[0]?.open || lu.open || "09:00",
    close: plages[plages.length - 1]?.close || lu.close || "22:00",
  };
}

function lireLesHoraires(brut: unknown): OperatingHours {
  const lu = (brut || {}) as Record<string, unknown>;
  const horaires = {} as OperatingHours;

  for (const code of DAYS) {
    const duJour = lu[code];
    horaires[code as keyof OperatingHours] = duJour
      ? lireLeJour(duJour)
      : DEFAULT_HOURS[code as keyof OperatingHours];
  }

  return horaires;
}

/**
 * Vérifie les plages d'un jour.
 *
 * Deux services qui se chevauchent compteraient deux fois les mêmes créneaux
 * de retrait : le client se verrait proposer 12 h 30 deux fois, et le
 * commerçant ne comprendrait pas pourquoi.
 */
export function verifierLesPlages(plages: Plage[]): Plage[] {
  if (plages.length === 0) {
    throw new ApiError(
      400,
      "Donnez au moins une plage horaire, ou fermez la journée",
      "NO_RANGE"
    );
  }

  if (plages.length > PLAGES_MAX) {
    throw new ApiError(400, `${PLAGES_MAX} plages au maximum par jour`, "TOO_MANY_RANGES");
  }

  for (const plage of plages) {
    if (!HEURE.test(plage.open) || !HEURE.test(plage.close)) {
      throw new ApiError(400, "Heure invalide : utilisez le format HH:mm", "INVALID_TIME_FORMAT");
    }

    if (plage.open === plage.close) {
      throw new ApiError(
        400,
        `${plage.open} – ${plage.close} : cette plage ne dure rien`,
        "EMPTY_RANGE"
      );
    }
  }

  // Triées par heure d'ouverture : c'est l'ordre dans lequel on les lit, et
  // celui qui rend le chevauchement décelable.
  const triees = [...plages].sort((a, b) => minutes(a.open) - minutes(b.open));

  for (let i = 1; i < triees.length; i++) {
    const precedente = bornes(triees[i - 1]);
    const actuelle = bornes(triees[i]);

    if (actuelle.debut < precedente.fin) {
      throw new ApiError(
        400,
        `${triees[i - 1].open} – ${triees[i - 1].close} et ${triees[i].open} – ${triees[i].close} se chevauchent`,
        "OVERLAPPING_RANGES"
      );
    }
  }

  // Une plage qui déborde sur le lendemain ne doit pas mordre sur la première
  // du jour suivant : on s'arrête à 24 h après la première ouverture.
  const derniere = bornes(triees[triees.length - 1]);
  const premiere = bornes(triees[0]);

  if (derniere.fin > premiere.debut + 24 * 60) {
    throw new ApiError(400, "Une journée ne peut pas dépasser vingt-quatre heures", "DAY_TOO_LONG");
  }

  return triees;
}

export class StoreHoursService {
  static async getHours(storeId: string) {
    const store = await db.store.findUnique({
      where: { id: storeId },
      select: { operatingHours: true, isOpen: true, pickupSlots: true },
    });

    if (!store) {
      throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
    }

    const operatingHours = lireLesHoraires(store.operatingHours);

    return {
      operatingHours,
      isOpen: store.isOpen,
      pickupSlots: (store.pickupSlots as unknown as PickupSlot[]) || [],
      /** Ce que dit l'horaire à cet instant, indépendamment du bouton. */
      ouvertMaintenant: this.ouvertMaintenant(operatingHours),
    };
  }

  /**
   * Créneaux de retrait réellement proposables.
   *
   * Un champ d'heure libre laissait le client choisir 9 h alors que la
   * boutique ouvre à 11 h : la commande partait, et personne n'était là pour
   * la lui donner. On ne propose donc que ce qui existe — et, depuis que les
   * journées ont plusieurs services, rien entre les deux.
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
      const journee = new Date();
      journee.setDate(journee.getDate() + decalage);
      journee.setHours(0, 0, 0, 0);

      // getDay() commence au dimanche ; notre table commence au lundi.
      const code = DAYS[(journee.getDay() + 6) % 7];
      const horaires = operatingHours[code as keyof OperatingHours];

      if (!horaires || horaires.closed) continue;

      const creneaux: { valeur: string; libelle: string }[] = [];

      for (const plage of horaires.plages) {
        const [heureOuverture, minuteOuverture] = plage.open.split(":").map(Number);
        const [heureFermeture, minuteFermeture] = plage.close.split(":").map(Number);

        const ouverture = new Date(journee);
        ouverture.setHours(heureOuverture, minuteOuverture, 0, 0);

        const fermeture = new Date(journee);
        fermeture.setHours(heureFermeture, minuteFermeture, 0, 0);

        // Une fermeture après minuit appartient au lendemain.
        if (fermeture <= ouverture) fermeture.setDate(fermeture.getDate() + 1);

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
      }

      if (creneaux.length === 0) continue;

      creneaux.sort((a, b) => a.valeur.localeCompare(b.valeur));

      resultat.push({
        date: journee.toISOString().slice(0, 10),
        libelle:
          decalage === 0
            ? "Aujourd'hui"
            : decalage === 1
              ? "Demain"
              : journee.toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }),
        creneaux,
      });
    }

    return resultat;
  }

  static async updateDay(storeId: string, day: string, dayHours: Partial<DayHours>) {
    if (!DAYS.includes(day)) {
      throw new ApiError(400, "Invalid day of week", "INVALID_DAY");
    }

    const lu = lireLeJour(dayHours);

    // Une journée fermée garde ses plages : les rouvrir ne doit pas obliger à
    // tout ressaisir.
    const retenu: DayHours = lu.closed
      ? { ...jour(lu.plages.length ? lu.plages : [{ open: "09:00", close: "22:00" }]), closed: true }
      : jour(verifierLesPlages(lu.plages));

    const current = await this.getHours(storeId);

    return await db.store.update({
      where: { id: storeId },
      data: { operatingHours: { ...current.operatingHours, [day]: retenu } as any },
      select: { operatingHours: true },
    });
  }

  static async toggleDay(storeId: string, day: string) {
    if (!DAYS.includes(day)) {
      throw new ApiError(400, "Invalid day of week", "INVALID_DAY");
    }

    const current = await this.getHours(storeId);
    const dayHours = current.operatingHours[day as keyof OperatingHours];

    return await db.store.update({
      where: { id: storeId },
      data: {
        operatingHours: {
          ...current.operatingHours,
          [day]: { ...dayHours, closed: !dayHours.closed },
        } as any,
      },
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
    const updated = slots.map((s) => (s.id === slotId ? { id: slotId, ...slot } : s));

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

  /**
   * La boutique est-elle ouverte à cet instant, d'après ses horaires.
   *
   * L'ancien calcul comparait deux chaînes : « 23:30 >= 17:30 && 23:30 <= 01:00 »
   * était faux, et un commerce ouvert jusqu'à 1 h du matin se croyait fermé
   * dès 17 h 31. Il faut donc regarder la veille autant que le jour même.
   */
  static ouvertMaintenant(operatingHours: OperatingHours, maintenant = new Date()): boolean {
    const minuteDuJour = maintenant.getHours() * 60 + maintenant.getMinutes();
    const indexAujourdhui = (maintenant.getDay() + 6) % 7;

    // Le jour même, puis la veille pour une plage qui a franchi minuit.
    for (const recul of [0, 1]) {
      const code = DAYS[(indexAujourdhui - recul + 7) % 7];
      const horaires = operatingHours[code as keyof OperatingHours];

      if (!horaires || horaires.closed) continue;

      const instant = minuteDuJour + recul * 24 * 60;

      for (const plage of horaires.plages) {
        const { debut, fin } = bornes(plage);
        if (instant >= debut && instant < fin) return true;
      }
    }

    return false;
  }

  /**
   * La boutique est-elle ouverte à cet instant, tout compris.
   *
   * Deux interrupteurs distincts, jamais croisés jusqu'ici : le planning
   * hebdomadaire (`operatingHours`, un jour fermé, un service terminé) et le
   * bouton rapide (`isOpen`, une fermeture exceptionnelle — un imprévu, une
   * rupture de stock totale). Un jour fermé dans le planning doit fermer la
   * boutique même si le bouton rapide est resté sur « ouverte » ; et le
   * bouton rapide doit pouvoir fermer même pendant un service normalement
   * ouvert. Les deux doivent donc être vrais à la fois.
   */
  static isOpenNow(store: { operatingHours: unknown; isOpen: boolean }): boolean {
    if (store.isOpen === false) return false;
    return this.ouvertMaintenant(lireLesHoraires(store.operatingHours));
  }

  private static validateTimeFormat(start: string, end: string) {
    if (!HEURE.test(start) || !HEURE.test(end)) {
      throw new ApiError(400, "Invalid time format. Use HH:mm", "INVALID_TIME_FORMAT");
    }

    if (start >= end) {
      throw new ApiError(400, "Opening time must be before closing time", "INVALID_TIME_RANGE");
    }
  }
}
