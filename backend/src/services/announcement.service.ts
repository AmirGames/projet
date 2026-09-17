import { db } from "./db";
import { logger } from "../config/logger";
import { emitNotification } from "../config/socket";

/**
 * Les annonces de la plateforme.
 *
 * « Diffuser une annonce » n'en diffusait aucune : une seule ligne était créée,
 * adressée à l'administrateur qui l'écrivait. Le public visé était enregistré à
 * côté, et personne ne le lisait jamais — ni le commerçant, ni le client, ni le
 * livreur ne recevait quoi que ce soit. L'écran annonçait pourtant « Annonce
 * diffusée ».
 *
 * Une annonce est donc désormais recopiée pour chaque destinataire : c'est par
 * l'adresse que les notifications se lisent, et une ligne unique ne pouvait
 * apparaître que dans une seule boîte.
 */

/** Les publics qu'une annonce peut viser. */
export const PUBLICS = {
  ALL: "Tout le monde",
  MERCHANTS: "Les commerçants",
  CUSTOMERS: "Les clients",
  DRIVERS: "Les livreurs",
} as const;

export type Public = keyof typeof PUBLICS;

export const PUBLICS_CONNUS = Object.keys(PUBLICS) as Public[];

export const libelleDuPublic = (code: string) => PUBLICS[code as Public] || code;

export class AnnouncementService {
  /**
   * Les adresses d'un public.
   *
   * Un compte peut être à la fois commerçant et client : l'ensemble écarte les
   * doublons, faute de quoi la même annonce arriverait deux fois.
   */
  static async destinataires(cible: Public): Promise<string[]> {
    const adresses = new Set<string>();

    if (cible === "ALL" || cible === "MERCHANTS") {
      const membres = await db.membership.findMany({
        select: { user: { select: { email: true } } },
      });

      for (const membre of membres) {
        if (membre.user?.email) adresses.add(membre.user.email);
      }
    }

    if (cible === "ALL" || cible === "CUSTOMERS") {
      const clients = await db.customer.findMany({ select: { email: true } });
      for (const client of clients) {
        if (client.email) adresses.add(client.email);
      }
    }

    if (cible === "ALL" || cible === "DRIVERS") {
      const livreurs = await db.driver.findMany({ select: { email: true } });
      for (const livreur of livreurs) {
        if (livreur.email) adresses.add(livreur.email);
      }
    }

    return [...adresses];
  }

  /**
   * Écrit l'annonce dans la boîte de chacun, et la pousse en direct.
   *
   * L'exemplaire de l'auteur est conservé : c'est lui que la page
   * d'administration liste, et c'est par lui qu'une annonce se retire.
   */
  static async diffuser(annonce: {
    title: string;
    message: string;
    priority?: string;
    targetAudience?: string;
    link?: string;
    auteur: string;
  }) {
    const cible = (
      PUBLICS_CONNUS.includes(annonce.targetAudience as Public)
        ? annonce.targetAudience
        : "ALL"
    ) as Public;

    const commun = {
      type: "PLATFORM_ANNOUNCEMENT" as const,
      title: annonce.title,
      message: annonce.message,
      priority: annonce.priority || "MEDIUM",
      targetAudience: cible,
      link: annonce.link,
      sentAt: new Date(),
    };

    // L'exemplaire de l'auteur : la trace de ce qui a été diffusé.
    const originale = await db.notification.create({
      data: { ...commun, recipientEmail: annonce.auteur },
    });

    const adresses = (await this.destinataires(cible)).filter(
      (adresse) => adresse !== annonce.auteur
    );

    for (const adresse of adresses) {
      const exemplaire = await db.notification.create({
        data: { ...commun, recipientEmail: adresse },
      });

      emitNotification(adresse, exemplaire);
    }

    logger.info("Annonce diffusée", { cible, destinataires: adresses.length });

    return { annonce: originale, destinataires: adresses.length };
  }
}
