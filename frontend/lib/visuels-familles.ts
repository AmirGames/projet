/**
 * L'illustration d'un commerce qui n'a encore déposé ni photo ni logo : les
 * couleurs et l'emoji de sa famille (une pizza pour une pizzeria, un croissant
 * pour une boulangerie), plutôt qu'une initiale sur un aplat.
 *
 * Les codes et les emojis sont ceux des familles du serveur
 * (backend/src/modules/stores/store-type.service.ts, FAMILLES). Une famille
 * inconnue ou absente prend l'illustration par défaut.
 *
 * Les couleurs vont dans un `style` en ligne : Tailwind ne génère pas une
 * classe composée à l'exécution.
 */
export interface VisuelFamille {
  emoji: string;
  /** Le dégradé, du coin sombre au coin clair. */
  de: string;
  a: string;
}

const VISUELS: Record<string, VisuelFamille> = {
  pizza: { emoji: '🍕', de: '#7c2d12', a: '#ea580c' },
  burgers: { emoji: '🍔', de: '#78350f', a: '#f59e0b' },
  kebab: { emoji: '🌯', de: '#7c2d12', a: '#d97706' },
  halal: { emoji: '🥙', de: '#064e3b', a: '#10b981' },
  chicken: { emoji: '🍗', de: '#9a3412', a: '#fb923c' },
  'fast-food': { emoji: '🍟', de: '#991b1b', a: '#f59e0b' },
  sandwiches: { emoji: '🥪', de: '#854d0e', a: '#eab308' },
  sushi: { emoji: '🍣', de: '#881337', a: '#f43f5e' },
  chinese: { emoji: '🥡', de: '#7f1d1d', a: '#dc2626' },
  asian: { emoji: '🍜', de: '#7c2d12', a: '#f97316' },
  indian: { emoji: '🍛', de: '#713f12', a: '#ca8a04' },
  oriental: { emoji: '🧆', de: '#78350f', a: '#d97706' },
  mexican: { emoji: '🌮', de: '#14532d', a: '#65a30d' },
  grill: { emoji: '🥩', de: '#450a0a', a: '#b91c1c' },
  seafood: { emoji: '🦐', de: '#0c4a6e', a: '#0ea5e9' },
  french: { emoji: '🥖', de: '#1e3a8a', a: '#3b82f6' },
  healthy: { emoji: '🥗', de: '#14532d', a: '#22c55e' },
  bakery: { emoji: '🥐', de: '#92400e', a: '#fbbf24' },
  desserts: { emoji: '🍰', de: '#831843', a: '#f472b6' },
  coffee: { emoji: '☕', de: '#422006', a: '#a16207' },
  world: { emoji: '🌍', de: '#134e4a', a: '#14b8a6' },
  groceries: { emoji: '🛒', de: '#14532d', a: '#16a34a' },
  deli: { emoji: '🧀', de: '#713f12', a: '#facc15' },
  alcohol: { emoji: '🍷', de: '#4c0519', a: '#be123c' },
  flowers: { emoji: '💐', de: '#701a75', a: '#e879f9' },
  pharmacy: { emoji: '💊', de: '#164e63', a: '#06b6d4' },
  shop: { emoji: '🛍️', de: '#3b0764', a: '#a855f7' },
};

const PAR_DEFAUT: VisuelFamille = { emoji: '🍽️', de: '#9a3412', a: '#f97316' };

export function visuelDeFamille(famille: string | null | undefined): VisuelFamille {
  return (famille && VISUELS[famille]) || PAR_DEFAUT;
}
