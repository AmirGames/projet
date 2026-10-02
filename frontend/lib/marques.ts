/**
 * L'identité visuelle de chaque plateforme du groupe.
 *
 * Un même design (en-tête blanc, grand bandeau arrondi, boutons en pastilles)
 * décliné en une couleur par marque : le noir pour ZupOne, le groupe ;
 * l'orange pour ZupEat ; le bleu pour ZupDrive.
 *
 * Les classes sont écrites en entier : Tailwind ne génère pas une classe
 * composée à l'exécution (`bg-${couleur}-600`).
 */
export type Marque = 'zupone' | 'zupeat' | 'zupdrive';

export interface ThemeMarque {
  nom: string;
  /** Le carré du logo, avec son initiale. */
  logo: string;
  /** Le grand bandeau d'accroche. */
  bandeau: string;
  /** Le bouton principal, sur fond blanc. */
  bouton: string;
  /** Une pastille ou un encadré teinté. */
  teinte: string;
  /** Un mot, un chiffre ou une coche mis en valeur. */
  accent: string;
}

export const MARQUES: Record<Marque, ThemeMarque> = {
  zupone: {
    nom: 'ZupOne',
    logo: 'bg-gray-900 text-white',
    bandeau: 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700',
    bouton: 'bg-gray-900 text-white hover:bg-gray-800',
    teinte: 'bg-gray-100 text-gray-800',
    accent: 'text-gray-900',
  },
  zupeat: {
    nom: 'ZupEat',
    logo: 'bg-orange-600 text-white',
    bandeau: 'bg-gradient-to-br from-orange-500 via-orange-600 to-red-600',
    bouton: 'bg-orange-600 text-white hover:bg-orange-700',
    teinte: 'bg-orange-50 text-orange-700',
    accent: 'text-orange-600',
  },
  zupdrive: {
    nom: 'ZupDrive',
    logo: 'bg-blue-600 text-white',
    bandeau: 'bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700',
    bouton: 'bg-blue-600 text-white hover:bg-blue-700',
    teinte: 'bg-blue-50 text-blue-700',
    accent: 'text-blue-600',
  },
};

/** La marque d'après son nom affiché (« ZupEat », « ZupDrive »…), ZupEat à défaut. */
export function marqueDuNom(nom: string | undefined): Marque {
  const trouvee = (Object.keys(MARQUES) as Marque[]).find((cle) => MARQUES[cle].nom === nom);
  return trouvee ?? 'zupeat';
}
