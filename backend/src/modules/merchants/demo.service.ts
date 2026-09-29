import { createHash } from "crypto";
import type { Request } from "express";

import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { AuthService } from "../auth/auth.service";
import { oublierStatut } from "../../middleware/compte-restreint";

/**
 * Le commerce de démonstration.
 *
 * Un compte commerçant public, pour qu'un prospect essaie l'espace pro sans
 * s'inscrire : ses identifiants s'affichent sur la page de connexion. Comme
 * tout le monde s'y connecte, il est remis à zéro chaque nuit (demo.jobs.ts).
 *
 * Ce qui le tient hors du réel :
 *   - la boutique n'est jamais listée aux clients et ne prend aucune commande
 *     (client.routes.ts, order.service.ts) ;
 *   - les reversements l'ignorent (merchant-payout.service.ts) ;
 *   - aucune coordonnée bancaire, aucun envoi, aucun changement de mot de
 *     passe (middleware/compte-demo.ts) ;
 *   - les clients d'exemple portent une adresse en `.invalid`, où rien ne part
 *     (email.service.ts).
 *
 * Remise à zéro : chaque nuit, mais aussi dès que le visiteur s'en va —
 *   - il se déconnecte ;
 *   - un autre visiteur (autre IP ou autre navigateur) se connecte alors que
 *     le précédent n'a plus donné signe de vie depuis INACTIF_MS ;
 *   - plus personne n'a rien fait depuis ABANDON_MS (onglet fermé sans se
 *     déconnecter).
 * Un nouveau venu qui arrive pendant qu'un autre est encore actif ne remet
 * rien à zéro : il effacerait le travail de celui-ci. Il partage l'état.
 *
 * Activé par DEMO_MERCHANT_ENABLED=true ; DEMO_MERCHANT_PASSWORD est alors
 * obligatoire. Le mot de passe est public par nature : n'en réutilisez aucun.
 */

const SLUG_ORGANISATION = "commerce-demo";
const SLUG_BOUTIQUE = "boulangerie-demo";
const ADRESSE_FICTIVE = (nom: string) => `${nom}@exemple.invalid`;

/** Un visiteur est parti s'il n'a rien fait depuis 5 min quand un autre arrive. */
const INACTIF_MS = 5 * 60 * 1000;
/** Plus rien depuis 15 min : la démo est abandonnée, on la remet à zéro. */
const ABANDON_MS = 15 * 60 * 1000;
/** L'activité n'est écrite qu'une fois par période, par empreinte. */
const PAS_ACTIVITE_MS = 30 * 1000;

const activiteRecente = new Map<string, number>();
let remiseEnCours: Promise<boolean> | null = null;

/**
 * Qui est le visiteur : son adresse IP et son navigateur, hachés. Derrière
 * Caddy, `req.ip` est celle du client (TRUST_PROXY). Deux personnes sur la
 * même connexion avec le même navigateur passent pour une seule : suffisant
 * pour une démo.
 */
export function empreinteVisiteur(req: Request): string {
  const agent = String(req.headers["user-agent"] ?? "");
  return createHash("sha256").update(`${req.ip ?? ""}|${agent}`).digest("hex").slice(0, 32);
}

export type ConfigurationDemo = { email: string; password: string };

/** Les identifiants de la démo, ou null si elle n'est pas activée. */
export function configurationDemo(): ConfigurationDemo | null {
  if (process.env.DEMO_MERCHANT_ENABLED !== "true") return null;

  const password = process.env.DEMO_MERCHANT_PASSWORD?.trim();
  if (!password || password.length < 8) {
    logger.error("Commerce de démonstration ignoré : DEMO_MERCHANT_PASSWORD absent ou trop court (8 caractères)");
    return null;
  }

  const email = (process.env.DEMO_MERCHANT_EMAIL?.trim() || "demo@zupeat.com").toLowerCase();
  return { email, password };
}

const PRODUITS = [
  { categorie: "Pains", nom: "Baguette tradition", prix: 1.3, sku: "DEMO-PAIN-1", stock: 50 },
  { categorie: "Pains", nom: "Pain aux céréales", prix: 3.2, sku: "DEMO-PAIN-2", stock: 30 },
  { categorie: "Viennoiseries", nom: "Croissant", prix: 1.4, sku: "DEMO-VIEN-1", stock: 40 },
  { categorie: "Viennoiseries", nom: "Pain au chocolat", prix: 1.6, sku: "DEMO-VIEN-2", stock: 40 },
  { categorie: "Pâtisseries", nom: "Éclair au chocolat", prix: 3.5, sku: "DEMO-PATI-1", stock: 20 },
  { categorie: "Pâtisseries", nom: "Tarte aux fraises", prix: 18, sku: "DEMO-PATI-2", stock: 8 },
] as const;

const JOUR_ET_NUIT = Object.fromEntries(
  ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((jour) => [
    jour,
    { closed: false, plages: [{ open: "07:00", close: "19:00" }] },
  ])
);

export class DemoMerchantService {
  /** Le commerce de démonstration existe-t-il pour cette organisation ? */
  static async estDemo(orgId: string): Promise<boolean> {
    const org = await db.organization.findUnique({ where: { id: orgId }, select: { isDemo: true } });
    return org?.isDemo === true;
  }

  /** Le commerce de démo dont ce compte est membre, s'il y en a un. */
  private static async commerceDuCompte(userId: string) {
    const lien = await db.membership.findFirst({
      where: { userId, org: { isDemo: true } },
      select: { org: { select: { id: true, demoVisiteurHash: true, demoActiviteAt: true } } },
    });
    return lien?.org ?? null;
  }

  /**
   * À la connexion du compte démo : un visiteur différent du précédent, qui
   * est parti depuis, trouve une démo remise à zéro.
   */
  static async surLaConnexion(userId: string, empreinte: string) {
    const org = await this.commerceDuCompte(userId);
    if (!org) return;

    const autreVisiteur = Boolean(org.demoVisiteurHash) && org.demoVisiteurHash !== empreinte;
    const precedentParti =
      !org.demoActiviteAt || Date.now() - org.demoActiviteAt.getTime() > INACTIF_MS;

    if (autreVisiteur && !precedentParti) {
      // Le précédent est encore là : on partage son état, sans le lui effacer.
      await db.organization.update({ where: { id: org.id }, data: { demoActiviteAt: new Date() } });
      return;
    }

    if (autreVisiteur) await this.reinitialiser();

    await db.organization.update({
      where: { id: org.id },
      data: { demoVisiteurHash: empreinte, demoActiviteAt: new Date() },
    });
  }

  /** À la déconnexion : le dernier visiteur qui s'en va emporte ses modifications. */
  static async surLaDeconnexion(userId: string, empreinte: string) {
    const org = await this.commerceDuCompte(userId);
    if (org?.demoVisiteurHash === empreinte) await this.reinitialiser();
  }

  /** Une requête du compte démo : le visiteur est là. */
  static async noterActivite(orgId: string, empreinte: string) {
    const cle = `${orgId}:${empreinte}`;
    const maintenant = Date.now();
    if (maintenant - (activiteRecente.get(cle) ?? 0) < PAS_ACTIVITE_MS) return;
    activiteRecente.set(cle, maintenant);

    // Le visiteur d'origine est gardé : le nouveau venu qui partage son état
    // ne doit pas lui voler sa place.
    await db.organization.updateMany({
      where: { id: orgId, demoVisiteurHash: null },
      data: { demoVisiteurHash: empreinte },
    });
    await db.organization.update({ where: { id: orgId }, data: { demoActiviteAt: new Date() } });
  }

  /** La démo est abandonnée (onglet fermé, plus d'activité) : remise à zéro. */
  static async reinitialiserSiAbandonnee() {
    if (!configurationDemo()) return false;

    const abandonnee = await db.organization.findFirst({
      where: { isDemo: true, demoActiviteAt: { lt: new Date(Date.now() - ABANDON_MS) } },
      select: { id: true },
    });

    return abandonnee ? this.reinitialiser() : false;
  }

  /**
   * Remet la démonstration à son état d'origine : compte, commerce, boutique,
   * produits et quelques commandes d'exemple. Sans effet si elle est désactivée.
   */
  static async reinitialiser(): Promise<boolean> {
    // Deux remises à zéro en même temps (déconnexion + tâche de fond) se
    // marcheraient dessus : la seconde attend la première. Valable pour une
    // instance de l'API ; à plusieurs, la démo reste sur une seule.
    if (remiseEnCours) return remiseEnCours;

    remiseEnCours = this.remettreAZero().finally(() => {
      remiseEnCours = null;
    });
    return remiseEnCours;
  }

  private static async remettreAZero(): Promise<boolean> {
    const config = configurationDemo();
    if (!config) return false;

    activiteRecente.clear();

    const passwordHash = await AuthService.hashPassword(config.password);

    const utilisateur = await db.user.upsert({
      where: { email: config.email },
      update: { passwordHash, emailVerified: true, status: "ACTIVE", name: "Compte démo" },
      create: {
        email: config.email,
        name: "Compte démo",
        passwordHash,
        emailVerified: true,
      },
    });

    const existante = await db.organization.findUnique({ where: { slug: SLUG_ORGANISATION } });

    // Le compte démo ne doit pas voir un slug ou une adresse pris par un vrai
    // commerce : ce ne serait plus la démo qu'on écraserait.
    if (existante && !existante.isDemo) {
      logger.error("Commerce de démonstration ignoré : le slug est pris par un vrai commerce", {
        slug: SLUG_ORGANISATION,
      });
      return false;
    }

    const org = existante
      ? await db.organization.update({
          where: { id: existante.id },
          data: {
            name: "Boulangerie Démo",
            status: "ACTIVE",
            tier: "PREMIUM",
            approvedAt: existante.approvedAt ?? new Date(),
            suspensionReason: null,
            suspensionDate: null,
            closureReason: null,
            closureDate: null,
            closedUntil: null,
            isArchivedPermanently: false,
            demoVisiteurHash: null,
            demoActiviteAt: null,
          },
        })
      : await db.organization.create({
          data: {
            name: "Boulangerie Démo",
            slug: SLUG_ORGANISATION,
            tier: "PREMIUM",
            isDemo: true,
            approvedAt: new Date(),
          },
        });

    oublierStatut(org.id);

    // Le compte démo est seul dans son équipe : un visiteur n'y a pas invité
    // quelqu'un d'autre. (Les invitations sont fermées aussi, voir compte-demo.)
    await db.membership.deleteMany({ where: { orgId: org.id, userId: { not: utilisateur.id } } });
    const lien = await db.membership.findFirst({ where: { orgId: org.id, userId: utilisateur.id } });
    if (!lien) {
      await db.membership.create({ data: { orgId: org.id, userId: utilisateur.id, role: "ADMIN" } });
    }

    // Ordre imposé par les clés : les commandes partent avant les produits
    // (OrderItem.product est en Restrict).
    const boutiques = await db.store.findMany({ where: { orgId: org.id }, select: { id: true } });
    const ids = boutiques.map((b) => b.id);
    await db.order.deleteMany({ where: { storeId: { in: ids } } });
    await db.product.deleteMany({ where: { storeId: { in: ids } } });
    await db.category.deleteMany({ where: { storeId: { in: ids } } });
    await db.store.deleteMany({ where: { orgId: org.id } });

    const boutique = await db.store.create({
      data: {
        orgId: org.id,
        name: "Boulangerie Démo",
        slug: SLUG_BOUTIQUE,
        address: "1 rue du Pain",
        city: "Lyon",
        postalCode: "69001",
        countryCode: "fr",
        phone: "0400000000",
        description: "Boutique d'essai : rien n'y est réel.",
        businessType: "shop",
        latitude: 45.764,
        longitude: 4.8357,
        operatingHours: JOUR_ET_NUIT,
        isOpen: true,
      },
    });

    const categories = new Map<string, string>();
    let ordre = 0;
    for (const nom of new Set(PRODUITS.map((p) => p.categorie))) {
      const categorie = await db.category.create({ data: { storeId: boutique.id, name: nom, displayOrder: ordre++ } });
      categories.set(nom, categorie.id);
    }

    const produits: Awaited<ReturnType<typeof db.product.create>>[] = [];
    for (const p of PRODUITS) {
      produits.push(
        await db.product.create({
          data: {
            storeId: boutique.id,
            categoryId: categories.get(p.categorie),
            sku: p.sku,
            name: p.nom,
            price: p.prix,
            stock: p.stock,
            status: "ACTIVE",
          },
        })
      );
    }

    // Quelques commandes d'exemple, pour que le tableau de bord ne soit pas
    // vide. Créées ici directement : la boutique n'en prend aucune vraie.
    const exemples: { statut: "PENDING" | "PREPARING" | "READY" | "COMPLETED"; client: string; lignes: [number, number][] }[] = [
      { statut: "PENDING", client: "marie", lignes: [[0, 2], [2, 3]] },
      { statut: "PREPARING", client: "paul", lignes: [[4, 2]] },
      { statut: "READY", client: "sofia", lignes: [[5, 1], [3, 2]] },
      { statut: "COMPLETED", client: "yanis", lignes: [[1, 1], [2, 2]] },
    ];

    for (const exemple of exemples) {
      const lignes = exemple.lignes.map(([indice, quantite]) => {
        const produit = produits[indice];
        const prix = Number(produit.price);
        return { productId: produit.id, quantity: quantite, price: prix, total: Math.round(prix * quantite * 100) / 100 };
      });
      const total = Math.round(lignes.reduce((somme, l) => somme + l.total, 0) * 100) / 100;

      await db.order.create({
        data: {
          storeId: boutique.id,
          customerName: exemple.client.charAt(0).toUpperCase() + exemple.client.slice(1),
          customerEmail: ADRESSE_FICTIVE(exemple.client),
          customerPhone: "",
          deliveryType: "PICKUP",
          status: exemple.statut,
          totalAmount: total,
          taxAmount: 0,
          feesAmount: 0,
          items: { create: lignes },
        },
      });
    }

    logger.info("Commerce de démonstration remis à zéro", { orgId: org.id, email: config.email });
    return true;
  }
}
