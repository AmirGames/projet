/**
 * Ce que vend un commerce, et ce qu'on y mange.
 *
 * L'inscription ne demandait ni l'un ni l'autre : toute boutique était un
 * « restaurant » sans genre. Le client ne pouvait donc ni distinguer une
 * épicerie d'un fleuriste, ni chercher une pizzeria — alors que c'est la
 * première chose qu'il cherche.
 *
 * Les deux listes vivent ici, et non dans un `<select>` : l'écran, l'API et la
 * recherche doivent parler des mêmes valeurs. Une liste recopiée dans le
 * formulaire aurait dérivé dès la première addition.
 */

/** Le type d'établissement. */
export const TYPES_ETABLISSEMENT = [
  { code: "restaurant", libelle: "Restaurant" },
  { code: "grocery", libelle: "Épicerie" },
  { code: "supermarket", libelle: "Supermarché" },
  { code: "deli", libelle: "Commerce de bouche" },
  { code: "liquor", libelle: "Magasin d'alcool" },
  { code: "florist", libelle: "Fleuriste" },
  { code: "pharmacy", libelle: "Parapharmacie" },
  { code: "shop", libelle: "Boutique" },
] as const;

/**
 * Le type de cuisine.
 *
 * Il n'a de sens que pour la restauration : une épicerie n'en a pas.
 */
export const TYPES_CUISINE = [
  { code: "african-ethiopian", libelle: "Africaine : éthiopienne" },
  { code: "african-other", libelle: "Africaine : autre" },
  { code: "alcohol", libelle: "Alcool" },
  { code: "american", libelle: "Américaine" },
  { code: "argentinian", libelle: "Argentine" },
  { code: "asian", libelle: "Asiatique" },
  { code: "asian-other", libelle: "Asiatique : autre" },
  { code: "asian-fusion", libelle: "Asiatique (fusion)" },
  { code: "bakery", libelle: "Boulangerie" },
  { code: "bakery-pastry", libelle: "Boulangerie et pâtisserie" },
  { code: "bangladeshi", libelle: "Bangladaise" },
  { code: "pub-food", libelle: "Cuisine de bar/pub" },
  { code: "barbecue", libelle: "Barbecue" },
  { code: "brazilian", libelle: "Brésilienne" },
  { code: "breakfast-brunch", libelle: "Petit-déjeuner et brunch" },
  { code: "bubble-tea", libelle: "Bubble Tea" },
  { code: "burgers", libelle: "Burgers" },
  { code: "burmese", libelle: "Birmane" },
  { code: "burrito", libelle: "Burrito" },
  { code: "cajun-creole", libelle: "Cadienne/Créole" },
  { code: "cake", libelle: "Gâteau" },
  { code: "caribbean", libelle: "Caribéenne" },
  { code: "chicken", libelle: "Poulet" },
  { code: "chilean", libelle: "Chilienne" },
  { code: "chinese-cantonese", libelle: "Chinoise : cantonaise" },
  { code: "chinese-hotpot", libelle: "Chinoise : fondue chinoise" },
  { code: "chinese-noodles", libelle: "Chinoise : nouilles et raviolis" },
  { code: "chinese-other", libelle: "Chinoise : autre" },
  { code: "chinese-sichuan", libelle: "Chinoise : sichuanaise" },
  { code: "chinese-taiwanese", libelle: "Chinoise : taïwanaise" },
  { code: "coffee-tea", libelle: "Café et thé" },
  { code: "colombian", libelle: "Colombienne" },
  { code: "crepes", libelle: "Crêpes ou crêperie" },
  { code: "comfort-food", libelle: "Plats réconfortants" },
  { code: "desserts", libelle: "Desserts" },
  { code: "desserts-other", libelle: "Desserts : autre" },
  { code: "ecuadorian", libelle: "Équatorienne" },
  { code: "egyptian", libelle: "Égyptienne" },
  { code: "empanadas", libelle: "Empanadas" },
  { code: "european", libelle: "Européenne" },
  { code: "european-other", libelle: "Européenne : autre" },
  { code: "filipino", libelle: "Philippine" },
  { code: "fish-and-chips", libelle: "Fish & chips" },
  { code: "fish-seafood", libelle: "Poisson et fruits de mer" },
  { code: "french", libelle: "Française" },
  { code: "georgian", libelle: "Géorgienne" },
  { code: "german", libelle: "Allemande" },
  { code: "fine-dining", libelle: "Gastronomique" },
  { code: "greek", libelle: "Grecque" },
  { code: "guatemalan", libelle: "Guatémaltèque" },
  { code: "halal", libelle: "Halal" },
  { code: "hawaiian", libelle: "Hawaïenne" },
  { code: "healthy", libelle: "Saine" },
  { code: "ice-cream", libelle: "Glaces et yaourts glacés" },
  { code: "indian", libelle: "Indienne" },
  { code: "indonesian", libelle: "Indonésienne" },
  { code: "israeli", libelle: "Israélienne" },
  { code: "italian", libelle: "Italienne" },
  { code: "japanese-other", libelle: "Japonaise : autre" },
  { code: "japanese-ramen", libelle: "Japonaise : ramens" },
  { code: "japanese-sushi", libelle: "Japonaise : sushis" },
  { code: "juice-smoothies", libelle: "Jus et smoothies" },
  { code: "kebab", libelle: "Kebab" },
  { code: "korean", libelle: "Coréenne" },
  { code: "kosher", libelle: "Casher" },
  { code: "latin-american-other", libelle: "Latino-américaine : autre" },
  { code: "lebanese", libelle: "Libanaise" },
  { code: "malaysian", libelle: "Malaisienne" },
  { code: "mediterranean", libelle: "Méditerranéenne" },
  { code: "mexican", libelle: "Mexicaine" },
  { code: "middle-eastern", libelle: "Moyen-orientale" },
  { code: "modern-australian", libelle: "Australienne (nouvelle cuisine)" },
  { code: "moroccan", libelle: "Marocaine" },
  { code: "pakistani", libelle: "Pakistanaise" },
  { code: "peruvian", libelle: "Péruvienne" },
  { code: "pizza", libelle: "Pizzas" },
  { code: "poke", libelle: "Poke (poisson cru)" },
  { code: "portuguese", libelle: "Portugaise" },
  { code: "russian", libelle: "Russe" },
  { code: "salads-sandwiches", libelle: "Salades/Sandwichs" },
  { code: "seafood", libelle: "Fruits de mer" },
  { code: "snacks", libelle: "Snacks" },
  { code: "soul-food", libelle: "Afro-américaine" },
  { code: "southern", libelle: "Plats du sud des États-Unis" },
  { code: "spanish", libelle: "Espagnole" },
  { code: "grill", libelle: "Grill" },
  { code: "sushi", libelle: "Sushis" },
  { code: "tacos", libelle: "Tacos" },
  { code: "tex-mex", libelle: "Tex Mex" },
  { code: "thai", libelle: "Thaï" },
  { code: "turkish", libelle: "Turque" },
  { code: "vegetarian-vegan", libelle: "Végétarienne/Végétalienne" },
  { code: "venezuelan", libelle: "Vénézuélienne" },
  { code: "vietnamese", libelle: "Vietnamienne" },
  { code: "chicken-wings", libelle: "Ailes de poulet" },
  { code: "other", libelle: "Autre" },
] as const;

export const CODES_ETABLISSEMENT = TYPES_ETABLISSEMENT.map((t) => t.code);
export const CODES_CUISINE = TYPES_CUISINE.map((t) => t.code);

const LIBELLE_ETABLISSEMENT = new Map(TYPES_ETABLISSEMENT.map((t) => [t.code, t.libelle]));
const LIBELLE_CUISINE = new Map(TYPES_CUISINE.map((t) => [t.code, t.libelle]));

export const libelleDeLEtablissement = (code?: string | null) =>
  (code && LIBELLE_ETABLISSEMENT.get(code as never)) || null;

export const libelleDeLaCuisine = (code?: string | null) =>
  (code && LIBELLE_CUISINE.get(code as never)) || null;

/** Seule la restauration a une cuisine : ailleurs, le champ n'a pas de sens. */
export const aUneCuisine = (businessType?: string | null) => businessType === "restaurant";
