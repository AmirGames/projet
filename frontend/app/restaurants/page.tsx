import { permanentRedirect } from 'next/navigation';
import { accueilDe } from '@/lib/domaines';

/**
 * Ancienne liste des commerces, devenue une simple redirection.
 *
 * Elle doublait l'accueil client (`/client`, la racine de zupeat.com) en
 * moins bien : ni adresse de livraison, ni frais jusqu'au client, ni familles,
 * ni favoris, un délai fixe de 30 min et la ville en guise de cuisine. Les
 * deux listes divergeaient à chaque correction ; il n'en reste qu'une.
 *
 * Les anciens liens (/fr-fr/restaurants, favoris, moteurs de recherche)
 * mènent désormais à l'accueil public.
 */
export default function AncienneListeCommerces() {
  permanentRedirect(accueilDe('public'));
}
