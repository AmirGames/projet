import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../auth/auth.middleware";
import { userIdRequis } from "../auth/utilisateur-requis";
import { CustomerAccountService } from "./customer-account.service";
import { adressesFavoritesSchema } from "./adresses-favorites";
import { CustomerCartService, panierSchema } from "../orders/customer-cart.service";
import {
  COMMENTAIRE_MAX,
  NOTE_MAX,
  NOTE_MIN,
  noterLivreur,
} from "../drivers/driver-rating.service";
import { ClientCompteService, clientConnecte } from "./client-compte.service";

// Espace du client connecté : toujours le client du compte (jamais un
// identifiant fourni par le navigateur). Monté sur /api/client (voir app.ts).
const router = Router();

const profilSchema = z.object({
  name: z.string().min(2, "Nom minimum 2 caractères").optional(),
  phone: z.string().min(9, "Téléphone invalide").optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
});

// GET /api/client/me/addresses - Profil et destinations des commandes du compte.
router.get("/me/addresses", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);
    res.json({ success: true, data: await ClientCompteService.adresses(client) });
  } catch (err) {
    next(err);
  }
});

// Le carnet est toujours celui du compte connecté, jamais un identifiant fourni par le navigateur.
router.put("/me/addresses", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);
    const { addresses } = z.object({ addresses: adressesFavoritesSchema }).parse(req.body);
    res.json({ success: true, data: await ClientCompteService.enregistrerAdresses(client.id, addresses) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /client/me/suppression - Ce que la suppression du compte ZupEat implique
 *
 * Les stores exigent de pouvoir supprimer dans l'application le compte qu'on
 * y a créé. Seul le compte ZupEat est concerné : un compte livreur ou un
 * espace commerçant rattaché à la même adresse reste actif, et on le dit
 * avant de confirmer (voir customer-account.service.ts).
 */
router.get("/me/suppression", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = userIdRequis(req);
    res.json({ success: true, data: CustomerAccountService.public(await CustomerAccountService.apercu(userId)) });
  } catch (err) {
    next(err);
  }
});

// POST /client/me/suppression - Supprimer son compte ZupEat
router.post("/me/suppression", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = userIdRequis(req);
    const { motif } = z.object({ motif: z.string().max(500).optional() }).parse(req.body ?? {});
    const apercu = await CustomerAccountService.supprimer(userId, motif);
    res.json({
      success: true,
      data: CustomerAccountService.public(apercu),
      message: CustomerAccountService.message(apercu),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/me - Profil du client connecté
router.get("/me", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);

    res.json({ success: true, data: await ClientCompteService.profil(client) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/client/me - Mise à jour de ses propres coordonnées
router.put("/me", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);
    const body = profilSchema.parse(req.body);

    res.json({
      message: "Profil mis à jour",
      data: await ClientCompteService.modifierProfil(client.id, body),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/me/orders - Historique des commandes du client connecté
router.get("/me/orders", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);

    res.json({ success: true, data: await ClientCompteService.commandes(client) });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/deliveries/:orderId - Suivi de livraison d'une commande
router.get("/deliveries/:orderId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);

    const suivi = await ClientCompteService.suiviLivraison(client, req.params.orderId as string);

    res.json({ success: true, data: suivi });
  } catch (err) {
    next(err);
  }
});

const noteSchema = z.object({
  note: z
    .number({ error: "La note est un nombre" })
    .int("La note est un entier")
    .min(NOTE_MIN, `La note va de ${NOTE_MIN} à ${NOTE_MAX}`)
    .max(NOTE_MAX, `La note va de ${NOTE_MIN} à ${NOTE_MAX}`),
  commentaire: z.string().max(COMMENTAIRE_MAX).optional(),
});

// POST /api/client/deliveries/:orderId/rating - Noter le livreur d'une course
router.post(
  "/deliveries/:orderId/rating",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = await clientConnecte(req);
      const corps = noteSchema.parse(req.body);

      const resultat = await noterLivreur({
        orderId: req.params.orderId as string,
        customerId: client.id,
        note: corps.note,
        commentaire: corps.commentaire,
      });

      res.status(201).json({
        success: true,
        message: "Merci, votre note est enregistrée",
        data: {
          note: resultat.note.note,
          commentaire: resultat.note.commentaire,
          donneeLe: resultat.note.createdAt,
          livreur: { moyenne: resultat.moyenne, avis: resultat.avis },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/client/me/favorites - Get customer favorites (protected)
router.get("/me/favorites", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);

    res.json({
      success: true,
      data: await ClientCompteService.favoris(client)
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/client/me/favorites - Add to favorites (protected)
router.post("/me/favorites", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);
    const { storeId } = req.body;

    if (!storeId) {
      throw new ApiError(400, "storeId requis", "INVALID_REQUEST");
    }

    const favorite = await ClientCompteService.ajouterFavori(client.id, storeId);

    res.status(201).json({
      success: true,
      message: "Ajouté aux favoris",
      data: favorite
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/client/me/favorites/:storeId - Remove from favorites (protected)
router.delete("/me/favorites/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);
    const { storeId } = req.params;

    await ClientCompteService.retirerFavori(client.id, storeId as string);

    res.json({
      success: true,
      message: "Supprimé des favoris"
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/me/paniers - Les paniers du compte, quel que soit l'appareil
router.get("/me/paniers", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);
    res.json({ success: true, data: await CustomerCartService.lister(client.id) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/client/me/paniers/:storeId - Remplace le panier d'un commerce (vide : vidé)
router.put("/me/paniers/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);
    const recu = panierSchema.parse(req.body);
    const panier = await CustomerCartService.enregistrer(client, req.params.storeId as string, recu);
    res.json({ success: true, data: panier });
  } catch (err) {
    next(err);
  }
});

export default router;
