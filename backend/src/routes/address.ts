import { Router, Request, Response } from "express";
import { AddressService, completerIndice, fournisseurActif, indiceValide } from "../services/address.service";

const router = Router();

/**
 * Relais vers le service de recherche d'adresses.
 *
 * Passer par le serveur plutôt que d'appeler le fournisseur depuis le
 * navigateur évite les restrictions CORS, permet d'en changer sans toucher
 * aux pages, et garde la main sur le rythme des appels.
 */

// GET /addresses/search?q=...&country=be&lat=..&lon=.. - Suggestions d'adresses
// country, lat et lon sont facultatifs : ils ne font qu'ordonner les résultats.
router.get("/search", async (req: Request, res: Response) => {
  const requete = ((req.query.q as string) || "").trim();
  const limite = Math.min(parseInt((req.query.limit as string) || "5") || 5, 10);

  // Ce que le texte dit du pays (« 4000 Liège ») passe devant la supposition
  // du navigateur.
  const indice = completerIndice(requete, indiceValide({
    pays: req.query.country,
    latitude: req.query.lat,
    longitude: req.query.lon,
  }));

  const resultat = await AddressService.rechercher(requete, limite, indice);

  res.json({ ...resultat, provider: fournisseurActif() });
});

export default router;
