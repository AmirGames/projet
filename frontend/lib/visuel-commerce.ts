/** Photographies locales utilisées uniquement quand une boutique n'a pas de bannière. */
const VISUELS: Record<string, { src: string; alt: string }> = {
  bakery: { src: '/images/shops-redesign/boulangerie.webp', alt: 'Pains et viennoiseries artisanales' },
  'bakery-pastry': { src: '/images/shops-redesign/boulangerie.webp', alt: 'Pains et viennoiseries artisanales' },
  groceries: { src: '/images/shops-redesign/epicerie.webp', alt: 'Produits d’épicerie de qualité' },
  grocery: { src: '/images/shops-redesign/epicerie.webp', alt: 'Produits d’épicerie de qualité' },
  deli: { src: '/images/shops-redesign/fromagerie.webp', alt: 'Sélection de fromages artisanaux' },
  cheese: { src: '/images/shops-redesign/fromagerie.webp', alt: 'Sélection de fromages artisanaux' },
  meat: { src: '/images/shops-redesign/boucherie.webp', alt: 'Pièces de viande préparées par un artisan boucher' },
  butcher: { src: '/images/shops-redesign/boucherie.webp', alt: 'Pièces de viande préparées par un artisan boucher' },
  grill: { src: '/images/shops-redesign/boucherie.webp', alt: 'Pièces de viande préparées par un artisan boucher' },
  flowers: { src: '/images/shops-redesign/fleuriste.webp', alt: 'Bouquet de fleurs fraîches' },
  florist: { src: '/images/shops-redesign/fleuriste.webp', alt: 'Bouquet de fleurs fraîches' },
  alcohol: { src: '/images/shops-redesign/cave.webp', alt: 'Bouteilles sélectionnées chez un caviste' },
  wine: { src: '/images/shops-redesign/cave.webp', alt: 'Bouteilles sélectionnées chez un caviste' },
  pizza: { src: '/images/shops-redesign/pizzeria.webp', alt: 'Pizza artisanale tout juste sortie du four' },
  produce: { src: '/images/shops-redesign/primeur.webp', alt: 'Fruits et légumes frais de saison' },
  greengrocer: { src: '/images/shops-redesign/primeur.webp', alt: 'Fruits et légumes frais de saison' },
};

const DEFAUT = { src: '/images/shops-redesign/epicerie.webp', alt: 'Commerce de proximité' };

export function visuelDeCommerce(famille?: string | null) {
  return (famille && VISUELS[famille.toLowerCase()]) || DEFAUT;
}
