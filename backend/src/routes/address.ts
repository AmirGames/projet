import { Router, Request, Response } from "express";
import { AddressService, fournisseurActif } from "../services/address.service";

const router = Router();

/**
 * Relais vers le service de recherche d'adresses.
 *
 * Passer par le serveur plutôt que d'appeler le fournisseur depuis le
 * navigateur évite les restrictions CORS, permet d'en changer sans toucher
 * aux pages, et garde la main sur le rythme des appels.
 */

// GET /addresses/search?q=... - Suggestions d'adresses
router.get("/search", async (req: Request, res: Response) => {
  const requete = ((req.query.q as string) || "").trim();
  const limite = Math.min(parseInt((req.query.limit as string) || "5") || 5, 10);

  const resultat = await AddressService.rechercher(requete, limite);

  res.json({ ...resultat, provider: fournisseurActif() });
});

export default router;
