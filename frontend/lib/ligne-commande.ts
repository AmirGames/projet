/**
 * L'intitulé d'une ligne de commande.
 *
 * Le nom du plat seul ne suffit pas : « 4 fromages » ne dit pas s'il s'agit des
 * pâtes ou de la pizza, et la déclinaison choisie — pennes, grande taille —
 * n'apparaissait nulle part. La cuisine préparait donc au hasard.
 *
 * Cette fonction rend les trois morceaux séparément pour que chaque écran les
 * dispose à sa façon : la catégorie en surtitre, le plat, la déclinaison à côté.
 */

export interface LigneAffichable {
  product?: {
    name?: string | null;
    variantLabel?: string | null;
    category?: { name?: string | null } | null;
  } | null;
  variant?: { label?: string | null } | null;
  /** Certaines routes aplatissent la ligne plutôt que de l'imbriquer. */
  category?: string | null;
  variantNom?: string | null;
  name?: string | null;
  /** Les suppléments figés sur la ligne (OrderItem.selectedOptions). */
  selectedOptions?: { supplements?: { label?: string | null }[] } | null;
  /** Ou déjà aplatis (panier, historique client). */
  supplements?: { label?: string | null }[] | null;
}

export interface IntituleDeLigne {
  /** La catégorie du plat, quand il en a une. */
  categorie: string;
  /** Le nom du plat. */
  plat: string;
  /** La déclinaison retenue, précédée de sa question quand elle est connue. */
  declinaison: string;
  /** Les suppléments payés, « Bacon, Cheddar » ; vide sans supplément. */
  supplements: string;
}

export function intituleDeLaLigne(ligne: LigneAffichable): IntituleDeLigne {
  const categorie = ligne.product?.category?.name || ligne.category || '';
  const plat = ligne.product?.name || ligne.name || 'Produit supprimé';
  const declinaison = ligne.variant?.label || ligne.variantNom || '';
  const supplements = (ligne.selectedOptions?.supplements || ligne.supplements || [])
    .map((sup) => sup?.label)
    .filter(Boolean)
    .join(', ');

  return { categorie, plat, declinaison, supplements };
}

/** Le même intitulé sur une seule ligne, pour un ticket ou un export. */
export function intituleCourt(ligne: LigneAffichable): string {
  const { categorie, plat, declinaison, supplements } = intituleDeLaLigne(ligne);

  return [categorie && `${categorie} ·`, plat, declinaison && `— ${declinaison}`, supplements && `+ ${supplements}`]
    .filter(Boolean)
    .join(' ');
}
