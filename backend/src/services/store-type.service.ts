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

/**
 * Les valeurs qu'envoyaient les anciens formulaires d'inscription.
 *
 * « Devenir commerçant » et l'inscription commerçant avaient chacun leur liste
 * recopiée — « Restaurant », « RESTAURANT », « FastFood », « CAFE »… — rangée
 * dans les réglages au lieu du champ `businessType`. La boutique n'avait donc
 * aucun genre : la recherche du client ne la trouvait pas.
 */
const ANCIENS_GENRES: Record<string, { businessType: string; cuisineType?: string }> = {
  restaurant: { businessType: "restaurant" },
  fastfood: { businessType: "restaurant" },
  cafe: { businessType: "restaurant", cuisineType: "coffee-tea" },
  bakery: { businessType: "restaurant", cuisineType: "bakery-pastry" },
  grocery: { businessType: "grocery" },
  pharmacy: { businessType: "pharmacy" },
  shop: { businessType: "shop" },
  other: { businessType: "shop" },
};

/**
 * Ramène un genre de commerce à un code connu, quelle que soit sa graphie.
 *
 * Un code déjà valide passe tel quel ; une ancienne valeur est traduite ; le
 * reste est écarté plutôt que stocké de travers.
 */
export function normaliserGenre(
  brut?: string | null,
  cuisine?: string | null
): { businessType: string | null; cuisineType: string | null } {
  const valeur = String(brut ?? "").trim();
  const minuscule = valeur.toLowerCase().replace(/[\s_-]+/g, "");

  const businessType = (CODES_ETABLISSEMENT as readonly string[]).includes(valeur)
    ? valeur
    : ANCIENS_GENRES[minuscule]?.businessType ?? null;

  const cuisineDemandee =
    cuisine && (CODES_CUISINE as readonly string[]).includes(cuisine) ? cuisine : null;

  return {
    businessType,
    cuisineType: aUneCuisine(businessType)
      ? cuisineDemandee ?? ANCIENS_GENRES[minuscule]?.cuisineType ?? null
      : null,
  };
}

/**
 * Les familles qu'affiche le client, à la manière des grandes plateformes.
 *
 * Quatre-vingt-dix-sept cuisines, c'est juste pour le commerçant qui se
 * décrit, bien trop pour un client qui cherche « une pizza » : il faudrait
 * faire défiler une rangée sans fin. On les regroupe donc en familles, chacune
 * avec son pictogramme. Les commerces qui ne font pas de restauration ont la
 * leur, d'après leur type d'établissement.
 *
 * Chaque cuisine appartient à une famille et une seule : un test le vérifie,
 * pour qu'une cuisine ajoutée à la liste ne passe pas à la trappe.
 */
export const FAMILLES = [
  { code: "pizza", libelle: "Pizzas", emoji: "🍕", cuisines: ["pizza", "italian"] },
  { code: "burgers", libelle: "Burgers", emoji: "🍔", cuisines: ["burgers", "american"] },
  { code: "kebab", libelle: "Kebab", emoji: "🌯", cuisines: ["kebab", "turkish"] },
  { code: "halal", libelle: "Halal", emoji: "🥙", cuisines: ["halal"] },
  { code: "chicken", libelle: "Poulet", emoji: "🍗", cuisines: ["chicken", "chicken-wings", "southern", "soul-food"] },
  { code: "fast-food", libelle: "Fast food", emoji: "🍟", cuisines: ["snacks", "fish-and-chips", "comfort-food"] },
  { code: "sandwiches", libelle: "Sandwichs", emoji: "🥪", cuisines: ["salads-sandwiches"] },
  {
    code: "sushi",
    libelle: "Sushis",
    emoji: "🍣",
    cuisines: ["sushi", "japanese-sushi", "japanese-ramen", "japanese-other", "poke"],
  },
  {
    code: "chinese",
    libelle: "Chinoise",
    emoji: "🥡",
    cuisines: [
      "chinese-cantonese",
      "chinese-hotpot",
      "chinese-noodles",
      "chinese-other",
      "chinese-sichuan",
      "chinese-taiwanese",
    ],
  },
  {
    code: "asian",
    libelle: "Asiatique",
    emoji: "🍜",
    cuisines: [
      "asian",
      "asian-other",
      "asian-fusion",
      "thai",
      "vietnamese",
      "korean",
      "indonesian",
      "malaysian",
      "filipino",
      "burmese",
    ],
  },
  { code: "indian", libelle: "Indienne", emoji: "🍛", cuisines: ["indian", "pakistani", "bangladeshi"] },
  {
    code: "oriental",
    libelle: "Orientale",
    emoji: "🧆",
    cuisines: ["lebanese", "middle-eastern", "moroccan", "israeli", "egyptian", "mediterranean", "greek"],
  },
  { code: "mexican", libelle: "Mexicaine", emoji: "🌮", cuisines: ["mexican", "tacos", "burrito", "tex-mex"] },
  { code: "grill", libelle: "Grill", emoji: "🥩", cuisines: ["grill", "barbecue", "argentinian", "brazilian"] },
  { code: "seafood", libelle: "Poisson", emoji: "🦐", cuisines: ["fish-seafood", "seafood"] },
  {
    code: "french",
    libelle: "Française",
    emoji: "🥖",
    cuisines: [
      "french",
      "fine-dining",
      "european",
      "european-other",
      "german",
      "spanish",
      "portuguese",
      "russian",
      "georgian",
      "pub-food",
      "modern-australian",
    ],
  },
  {
    code: "healthy",
    libelle: "Healthy",
    emoji: "🥗",
    cuisines: ["healthy", "vegetarian-vegan", "juice-smoothies"],
  },
  {
    code: "bakery",
    libelle: "Boulangerie",
    emoji: "🥐",
    cuisines: ["bakery", "bakery-pastry", "breakfast-brunch", "crepes"],
  },
  { code: "desserts", libelle: "Desserts", emoji: "🍰", cuisines: ["desserts", "desserts-other", "cake", "ice-cream"] },
  { code: "coffee", libelle: "Café", emoji: "☕", cuisines: ["coffee-tea", "bubble-tea"] },
  {
    code: "world",
    libelle: "Du monde",
    emoji: "🌍",
    cuisines: [
      "african-ethiopian",
      "african-other",
      "caribbean",
      "cajun-creole",
      "hawaiian",
      "kosher",
      "chilean",
      "colombian",
      "ecuadorian",
      "empanadas",
      "guatemalan",
      "latin-american-other",
      "peruvian",
      "venezuelan",
      "other",
    ],
  },
  // Les commerces hors restauration, d'après leur type d'établissement.
  { code: "groceries", libelle: "Courses", emoji: "🛒", etablissements: ["supermarket", "grocery"] },
  { code: "deli", libelle: "Épicerie fine", emoji: "🧀", etablissements: ["deli"] },
  { code: "alcohol", libelle: "Alcool", emoji: "🍷", cuisines: ["alcohol"], etablissements: ["liquor"] },
  { code: "flowers", libelle: "Fleurs", emoji: "💐", etablissements: ["florist"] },
  { code: "pharmacy", libelle: "Parapharmacie", emoji: "💊", etablissements: ["pharmacy"] },
  { code: "shop", libelle: "Boutiques", emoji: "🛍️", etablissements: ["shop"] },
] as const satisfies readonly {
  code: string;
  libelle: string;
  emoji: string;
  cuisines?: readonly string[];
  etablissements?: readonly string[];
}[];

export type Famille = (typeof FAMILLES)[number];

const FAMILLE_PAR_CUISINE = new Map<string, Famille>();
const FAMILLE_PAR_ETABLISSEMENT = new Map<string, Famille>();
for (const famille of FAMILLES) {
  for (const cuisine of ("cuisines" in famille ? famille.cuisines : []) as readonly string[]) {
    FAMILLE_PAR_CUISINE.set(cuisine, famille);
  }
  for (const etab of ("etablissements" in famille ? famille.etablissements : []) as readonly string[]) {
    FAMILLE_PAR_ETABLISSEMENT.set(etab, famille);
  }
}

/**
 * Ce que le client lit d'un commerce : sa famille (pour filtrer) et le libellé
 * le plus précis connu — « Japonaise : sushis » plutôt que « Sushis ».
 */
export function genreDuCommerce(store: { businessType?: string | null; cuisineType?: string | null }) {
  const famille =
    (aUneCuisine(store.businessType) || !store.businessType
      ? FAMILLE_PAR_CUISINE.get(store.cuisineType || "")
      : undefined) ?? FAMILLE_PAR_ETABLISSEMENT.get(store.businessType || "");

  return {
    famille: famille?.code ?? null,
    genreLibelle:
      (aUneCuisine(store.businessType) || !store.businessType ? libelleDeLaCuisine(store.cuisineType) : null) ??
      libelleDeLEtablissement(store.businessType) ??
      null,
  };
}

/** Les familles telles que l'écran les affiche, sans la table de rattachement. */
export const FAMILLES_AFFICHEES = FAMILLES.map(({ code, libelle, emoji }) => ({ code, libelle, emoji }));
