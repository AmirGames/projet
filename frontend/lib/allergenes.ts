/** Les 14 allergènes à déclaration obligatoire (règlement (UE) 1169/2011, annexe II). */
export const ALLERGENES = [
  'GLUTEN', 'CRUSTACEANS', 'EGGS', 'FISH', 'PEANUTS', 'SOYBEANS', 'MILK',
  'NUTS', 'CELERY', 'MUSTARD', 'SESAME', 'SULPHITES', 'LUPIN', 'MOLLUSCS',
] as const;

export type Allergene = (typeof ALLERGENES)[number];

/** Ce que le commerçant a déclaré : `declare` distingue « aucun » de « non renseigné ». */
export interface DeclarationAllergenes {
  allergens: Allergene[];
  declare: boolean;
}

export const declarationVide = (): DeclarationAllergenes => ({ allergens: [], declare: false });

/** Vrai quand la déclaration est complète : au moins un allergène, ou « aucun » confirmé. */
export const declarationComplete = (d: DeclarationAllergenes) => d.declare || d.allergens.length > 0;
