import { pertinenceCommerce, comparerRecommandations, fraisCommerce, minutesCommerce } from '../decouverte-commerces';

const commerce = { id: 'a', name: 'Chez Jules', isOpenNow: true, searchProducts: [{ name: 'Pizza végétarienne' }, { name: 'Burger maison' }] };

test('cherche dans les plats, sans accents, avec une petite faute et plusieurs mots', () => {
  expect(pertinenceCommerce(commerce, 'PIZZA vegetarienne')).toBeGreaterThan(0);
  expect(pertinenceCommerce(commerce, 'pizaa')).toBeGreaterThan(0);
  expect(pertinenceCommerce(commerce, 'burger Jules')).toBeGreaterThan(0);
  expect(pertinenceCommerce(commerce, 'pizza sushi')).toBe(0);
  expect(pertinenceCommerce(commerce, 'riz')).toBe(0);
});

test('privilégie les correspondances précises et ne recherche pas les aperçus épuisés', () => {
  const exact = pertinenceCommerce(commerce, 'pizza');
  expect(exact).toBeGreaterThan(pertinenceCommerce(commerce, 'pizaa'));
  expect(pertinenceCommerce({ ...commerce, products: [{ name: 'Sushi' }], searchProducts: [] }, 'sushi')).toBe(0);
});

test('classe les ouverts livrables avant les fermés et utilise la pertinence avant la vitesse', () => {
  const ferme = { ...commerce, id: 'b', isOpenNow: false };
  expect(comparerRecommandations(commerce, ferme)).toBeLessThan(0);
  expect(comparerRecommandations({ ...commerce, livraison: { livrable: true, frais: 3, deliveryMinutes: 30 } },
    { ...commerce, livraison: { livrable: false, frais: 0, deliveryMinutes: 5 } })).toBeLessThan(0);
  expect(comparerRecommandations(commerce, { ...commerce, estimatedDeliveryTime: '5 min' }, 18, 3)).toBeLessThan(0);
});

test('les délais et frais inconnus ou hors zone ne passent pas les filtres de livraison', () => {
  const horsZone = { ...commerce, estimatedDeliveryTime: '5 min', deliveryCost: 0, livraison: { livrable: false, frais: 0, deliveryMinutes: 5 } };
  expect(minutesCommerce(horsZone)).toBeNull();
  expect(fraisCommerce(horsZone)).toBeNull();
  expect(minutesCommerce({ ...commerce, estimatedDeliveryTime: 'inconnu' })).toBeNull();
  expect(fraisCommerce({ ...commerce, deliveryCost: '3.00' })).toBe(3);
});

test('les avis ont un poids lié à leur nombre et les égalités restent déterministes', () => {
  expect(comparerRecommandations({ ...commerce, rating: 4.8, totalRatings: 100 }, { ...commerce, rating: 5, totalRatings: 1 })).toBeLessThan(0);
  expect(comparerRecommandations(commerce, { ...commerce, id: 'b' })).toBeLessThan(0);
});
