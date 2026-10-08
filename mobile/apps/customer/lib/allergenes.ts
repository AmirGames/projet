/** Les 14 allergènes à déclaration obligatoire (règlement (UE) 1169/2011, annexe II). */
export const NOMS_ALLERGENES: Record<string, string> = {
  GLUTEN: 'Gluten',
  CRUSTACEANS: 'Crustacés',
  EGGS: 'Œufs',
  FISH: 'Poissons',
  PEANUTS: 'Arachides',
  SOYBEANS: 'Soja',
  MILK: 'Lait',
  NUTS: 'Fruits à coque',
  CELERY: 'Céleri',
  MUSTARD: 'Moutarde',
  SESAME: 'Sésame',
  SULPHITES: 'Sulfites',
  LUPIN: 'Lupin',
  MOLLUSCS: 'Mollusques',
};

interface ProduitAllergenes {
  allergens?: string[];
  allergensDeclared?: boolean;
}

/** La phrase affichée sous un plat : allergènes présents, « aucun » ou « non renseignés ». */
export function texteAllergenes(produit: ProduitAllergenes): string {
  const liste = produit.allergens ?? [];
  if (liste.length > 0) return `Contient : ${liste.map((a) => NOMS_ALLERGENES[a] ?? a).join(', ')}`;
  return produit.allergensDeclared ? 'Sans allergène déclaré par le commerçant' : 'Allergènes non renseignés';
}
