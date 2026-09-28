'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ShoppingCart, MapPin, Phone, Clock, Star, X, Bike } from 'lucide-react';

import { euro } from '@/lib/format';
import { ChoixAdresseLivraison } from '@/components/ChoixAdresseLivraison';
import { useAdresseLivraisonEnregistree, type AdresseLivraison } from '@/lib/adresseLivraison';
import { useParametreAdresse } from '@/lib/navigateur';
import { useStoreLive } from '@/lib/use-store-live';
import { useDonneesModifiees } from '@/lib/temps-reel';
import {
  cleDeLigne,
  enregistrerPanier,
  EVENEMENT_PANIER_DISTANT,
  lirePanier,
  type SupplementPanier,
} from '@/lib/paniers';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Store {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  /** « Pizzas », « Japonaise : sushis », « Fleuriste »… */
  genreLibelle?: string | null;
  phone?: string | null;
  email?: string | null;
  /** Fermée momentanément (bouton rapide du commerçant) : la vitrine reste lisible, la commande non. */
  isOpen?: boolean;
  /** Ce que disent à la fois le planning hebdomadaire et le bouton rapide, croisés. */
  isOpenNow?: boolean;
  /** Commerce pas encore validé : la fiche se lit, aucune commande ne passe. */
  enAttenteDeValidation?: boolean;
  /** Le logo que le commerçant a déposé depuis ses paramètres. */
  settings?: { logo?: string | null } | null;
  createdAt: string;
}

/** Une déclinaison du plat : penne, spaghetti, tagliatelle. */
interface Declinaison {
  id: string;
  label: string;
  /** Ce que le client paiera réellement, déclinaison ou plat. */
  prixEffectif: number;
  isAvailable: boolean;
}

/** Un groupe de suppléments payants : « Suppléments », « Sauce ». */
interface GroupeSupplements {
  id: string;
  name: string;
  isRequired: boolean;
  /** Vide : sans limite. */
  maxChoices: number | null;
  /** Prix TTC, tels que le client les paiera. */
  choices: { id: string; label: string; price: number; isAvailable: boolean }[];
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  isAvailable: boolean;
  images: Array<{ url: string }>;
  /** La question posée : « Type de pâtes », « Taille ». */
  variantLabel?: string | null;
  variants?: Declinaison[];
  supplements?: GroupeSupplements[];
  /** La note des clients, calculée sur les avis publiés. Nulle sans avis. */
  note?: { moyenne: number; nombre: number } | null;
}

/** Les conditions de livraison de la boutique à l'adresse du client. */
interface Livraison {
  livrable: boolean;
  zone: { name: string; minOrder: number; deliveryMinutes: number | null } | null;
  distanceKm: number | null;
  frais: number;
  minimum: number;
  raison: string;
}

interface Category {
  id: string;
  name: string;
  products: Product[];
}

/** Une ligne du panier en mémoire. */
interface LigneVitrine {
  product: Product;
  quantity: number;
  variante?: Declinaison;
  supplements?: SupplementPanier[];
}

const sommeDesSupplements = (supplements?: SupplementPanier[]) =>
  (supplements || []).reduce((somme, sup) => somme + sup.price, 0);

/**
 * Le prix d'une ligne : celui de la déclinaison retenue, sinon du plat, plus
 * les suppléments choisis.
 */
const prixDeLaLigne = (item: LigneVitrine) =>
  Number((Number(item.variante?.prixEffectif ?? item.product.price ?? 0) + sommeDesSupplements(item.supplements)).toFixed(2));

const cleDeLItem = (item: LigneVitrine) => cleDeLigne(item.product.id, item.variante?.id, item.supplements);

/** Les suppléments retenus pour un plat, lus dans ses groupes (seulement les disponibles). */
const supplementsRetenus = (product: Product, ids: string[] = []): SupplementPanier[] =>
  (product.supplements || []).flatMap((groupe) =>
    groupe.choices
      .filter((c) => c.isAvailable && ids.includes(c.id))
      .map((c) => ({ id: c.id, label: c.label, price: c.price })),
  );

/** Le groupe obligatoire encore sans choix, s'il y en a un. */
const groupeManquant = (product: Product, ids: string[] = []) =>
  (product.supplements || []).find(
    (groupe) => groupe.isRequired && !groupe.choices.some((c) => c.isAvailable && ids.includes(c.id)),
  );

export default function StorefrontPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const router = useRouter();

  const [store, setStore] = useState<Store | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<LigneVitrine[]>([]);
  // La déclinaison retenue pour chaque plat, avant l'ajout au panier.
  const [choix, setChoix] = useState<Record<string, string>>({});
  // Les suppléments cochés pour chaque plat, avant l'ajout au panier.
  const [supChoisis, setSupChoisis] = useState<Record<string, string[]>>({});
  // Arrivé depuis le panier de l'accueil (?panier=1) : le panier s'ouvre
  // d'emblée, tant que le client n'y a pas touché.
  const panierDemande = useParametreAdresse('panier') === '1';
  const [panierChoisi, setShowCart] = useState<boolean | null>(null);
  const showCart = panierChoisi ?? panierDemande;
  // Les frais de service de la plateforme : le serveur les ajoute à toute
  // commande, livrée ou à emporter. Le panier ne les montrait pas, si bien que
  // son total était plus bas que celui réellement payé.
  const [fraisDeService, setFraisDeService] = useState(0);

  useEffect(() => {
    let annule = false;
    fetch(`${API_URL}/api/client/service-fee`)
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => {
        if (!annule && donnees?.data) setFraisDeService(Number(donnees.data.frais) || 0);
      })
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, []);

  /**
   * La boutique dont le panier a déjà été lu.
   *
   * Le panier était relu à chaque changement du menu. Comme la disponibilité
   * arrive en direct et modifie le menu, une déclinaison épuisée sortait du
   * panier puis y revenait aussitôt, ressuscitée depuis le stockage : le client
   * pouvait commander un plat qui venait d'être retiré.
   */
  const panierLu = useRef<string | null>(null);
  // Le panier modifié sur un autre appareil du compte (le téléphone) : on le relit.
  const [relecturePanier, setRelecturePanier] = useState(0);
  // L'adresse choisie sur l'accueil (ou ici) et ce qu'il en coûte d'y livrer.
  const adresseEnregistree = useAdresseLivraisonEnregistree();
  const [adresseChoisie, setAdresse] = useState<AdresseLivraison | null | undefined>(undefined);
  const adresse = adresseChoisie !== undefined ? adresseChoisie : adresseEnregistree;
  const [livraison, setLivraison] = useState<Livraison | null>(null);

  // La requête des conditions de livraison, null sans adresse exploitable.
  const requeteLivraison = (() => {
    if (!store?.id || !adresse) return null;
    const situee = adresse.latitude != null && adresse.longitude != null;
    const ecrite = [adresse.street, adresse.postalCode, adresse.city].filter(Boolean).join(' ');
    if (!situee && !ecrite) return null;
    const parametres = situee
      ? `?lat=${adresse.latitude}&lng=${adresse.longitude}`
      : `?adresse=${encodeURIComponent(ecrite)}`;
    return `${store.id}/zone-livraison${parametres}`;
  })();

  if (requeteLivraison === null && livraison !== null) setLivraison(null);

  useEffect(() => {
    if (requeteLivraison === null) return;

    let annule = false;
    fetch(`${API_URL}/api/client/stores/${requeteLivraison}`)
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => {
        if (!annule) setLivraison(donnees?.data || null);
      })
      .catch(() => {
        if (!annule) setLivraison(null);
      });

    return () => {
      annule = true;
    };
  }, [requeteLivraison]);

  // Le menu change pendant que le client compose son panier.
  useStoreLive(store?.id, ({ productId, isAvailable }) => {
    setCategories((precedentes) =>
      precedentes.map((categorie) => ({
        ...categorie,
        products: categorie.products.map((produit) =>
          produit.id === productId ? { ...produit, isAvailable } : produit
        ),
      }))
    );

    // Laisser un plat épuisé dans le panier ferait échouer la commande au
    // dernier moment, après la saisie de l'adresse.
    if (!isAvailable) {
      setCart((panier) => panier.filter((ligne) => ligne.product.id !== productId));
    }
  },
  // Une déclinaison épuisée doit sortir des choix et du panier.
  ({ productId, variantes }) => {
    const lues = variantes.map((variante) => ({
      id: variante.id,
      label: variante.label,
      prixEffectif: variante.prixEffectif,
      isAvailable: variante.isAvailable,
    }));

    setCategories((precedentes) =>
      precedentes.map((categorie) => ({
        ...categorie,
        products: categorie.products.map((produit) =>
          produit.id === productId ? { ...produit, variants: lues } : produit
        ),
      }))
    );

    const indisponibles = new Set(
      lues.filter((variante) => !variante.isAvailable).map((variante) => variante.id)
    );

    setChoix((precedent) =>
      indisponibles.has(precedent[productId] || '')
        ? Object.fromEntries(Object.entries(precedent).filter(([cle]) => cle !== productId))
        : precedent
    );

    setCart((panier) =>
      panier.filter((ligne) => !(ligne.variante && indisponibles.has(ligne.variante.id)))
    );
  });

  /**
   * Le panier de cette boutique, relu à l'arrivée.
   *
   * Il n'était gardé qu'en mémoire : quitter la page le perdait. Et comme tout
   * était rangé sous une clé unique, celui du commerce précédent s'affichait
   * ici.
   */
  useEffect(() => {
    // Une fois par boutique, et seulement quand le menu est arrivé : les lignes
    // s'enrichissent du catalogue vivant.
    if (!store?.id || loading || panierLu.current === store.id) return;

    panierLu.current = store.id;

    const lignes = lirePanier(store.id);
    const catalogue = categories.flatMap((categorie) => categorie.products);

    setCart(
      lignes.map((ligne) => {
        const produit = catalogue.find((candidat) => candidat.id === ligne.productId);
        // Le prix gardé inclut les suppléments : la base s'en déduit, sans
        // quoi ils seraient comptés deux fois.
        const prixDeBase = Number((ligne.price - sommeDesSupplements(ligne.supplements)).toFixed(2));

        return {
          // Le catalogue peut avoir changé depuis : à défaut, on reconstitue le
          // strict nécessaire pour afficher et commander la ligne.
          product:
            produit || {
              id: ligne.productId,
              name: ligne.name,
              description: ligne.description || '',
              price: prixDeBase,
              isAvailable: ligne.isAvailable !== false,
              images: [],
            },
          quantity: ligne.quantity,
          variante: ligne.variantId
            ? {
                id: ligne.variantId,
                label: ligne.variantNom || '',
                prixEffectif: prixDeBase,
                isAvailable: true,
              }
            : undefined,
          supplements: ligne.supplements?.length ? ligne.supplements : undefined,
        };
      })
    );

  }, [store?.id, loading, categories, relecturePanier]);

  useEffect(() => {
    if (!store?.id) return;
    const surPanierDistant = (evenement: Event) => {
      if ((evenement as CustomEvent<{ storeId: string }>).detail?.storeId !== store.id) return;
      panierLu.current = null;
      setRelecturePanier((n) => n + 1);
    };
    window.addEventListener(EVENEMENT_PANIER_DISTANT, surPanierDistant);
    return () => window.removeEventListener(EVENEMENT_PANIER_DISTANT, surPanierDistant);
  }, [store?.id]);

  // Chaque modification est enregistrée sous la boutique courante, et nulle
  // part ailleurs.
  useEffect(() => {
    /**
     * Jamais avant d'avoir lu.
     *
     * Le panier commence vide en mémoire : enregistrer cet état initial
     * écrasait le panier gardé du dernier passage, et le client retrouvait son
     * commerce les mains vides.
     */
    if (!store?.id || panierLu.current !== store.id) return;

    enregistrerPanier(
      store.id,
      cart.map((item) => ({
        productId: item.product.id,
        name: item.product.name,
        description: item.product.description,
        price: prixDeLaLigne(item),
        quantity: item.quantity,
        isAvailable: item.product.isAvailable,
        ...(item.variante ? { variantId: item.variante.id, variantNom: item.variante.label } : {}),
        ...(item.supplements?.length ? { supplements: item.supplements } : {}),
      })),
      store.name,
      store.slug
    );
  }, [cart, store?.id, store?.name, store?.slug]);


  const fetchStoreData = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/stores/slug/${slug}`);
      if (response.ok) {
        const data = await response.json();
        setStore(data.store);

        // Le menu vient de la route publique : /api/products exige un compte,
        // si bien qu'un visiteur non connecté voyait la vitrine vide. Elle
        // renvoie en prime le menu déjà groupé par catégorie, dans l'ordre
        // voulu par le commerçant.
        const menuResponse = await fetch(`${API_URL}/api/client/stores/${data.store.id}`);
        if (menuResponse.ok) {
          const menuData = await menuResponse.json();

          // L'état d'ouverture n'est calculé que par cette route — horaires,
          // bouton rapide et validation du commerce croisés. Sans lui, la
          // vitrine affichait « Ouvert » et laissait commander une boutique
          // fermée, que le serveur refusait ensuite.
          if (typeof menuData.data?.isOpenNow === 'boolean') {
            setStore((actuelle) =>
              actuelle
                ? {
                    ...actuelle,
                    isOpenNow: menuData.data.isOpenNow,
                    isOpen:
                      typeof menuData.data.isOpen === 'boolean' ? menuData.data.isOpen : actuelle.isOpen,
                    enAttenteDeValidation: menuData.data.enAttenteDeValidation === true,
                    genreLibelle: menuData.data.genreLibelle ?? actuelle.genreLibelle ?? null,
                  }
                : actuelle
            );
          }
          const menu = (menuData.data?.menu || {}) as Record<string, any[]>;

          const lues: Category[] = Object.entries(menu).map(([nom, produits]) => ({
              id: nom,
              name: nom,
              products: produits.map((produit) => ({
                id: produit.id,
                name: produit.name,
                description: produit.description || '',
                price: Number(produit.price || 0),
                isAvailable: produit.isAvailable !== false,
                variantLabel: produit.variantLabel || null,
                note:
                  produit.note && produit.note.nombre > 0
                    ? { moyenne: Number(produit.note.moyenne), nombre: Number(produit.note.nombre) }
                    : null,
                variants: (produit.variants || []).map((variante: any) => ({
                  id: variante.id,
                  label: variante.label,
                  prixEffectif: Number(variante.prixEffectif ?? produit.price),
                  isAvailable: variante.isAvailable !== false,
                })),
                supplements: (produit.supplements || []).map((groupe: any) => ({
                  id: groupe.id,
                  name: groupe.name,
                  isRequired: Boolean(groupe.isRequired),
                  maxChoices: groupe.maxChoices ?? null,
                  choices: (groupe.choices || []).map((c: any) => ({
                    id: c.id,
                    label: c.label,
                    price: Number(c.price) || 0,
                    isAvailable: c.isAvailable !== false,
                  })),
                })),
                images: (produit.media || produit.images || []).map((image: any) => ({
                  url: image.url,
                })),
              })),
            }));

          setCategories(lues);
          return lues;
        }
      }
    } catch (error) {
      signalerErreur('Error fetching store:', error);
    } finally {
      setLoading(false);
    }

    return null;
  }, [slug]);

  useEffectChargement(() => {
    if (slug) {
      fetchStoreData();
    }
  }, [slug, fetchStoreData]);

  /**
   * Remet le panier d'accord avec le menu relu.
   *
   * Un plat retiré ou épuisé en sort ; un plat dont le prix a changé garde sa
   * quantité mais prend le nouveau prix. Sans cela, le panier affichait un
   * total que le serveur refuserait au moment de payer.
   */
  const rapprocherLePanier = (menu: Category[]) => {
    const parId = new Map(menu.flatMap((categorie) => categorie.products).map((produit) => [produit.id, produit]));

    setCart((panier) =>
      panier.flatMap((ligne) => {
        const frais = parId.get(ligne.product.id);
        if (!frais || !frais.isAvailable) return [];

        // Un supplément retiré ou épuisé sort la ligne entière : la garder sans
        // lui servirait au client un plat qu'il n'a pas composé.
        const ids = (ligne.supplements || []).map((sup) => sup.id);
        const supplements = supplementsRetenus(frais, ids);
        if (supplements.length !== ids.length || groupeManquant(frais, ids)) return [];
        const avecSupplements = supplements.length > 0 ? supplements : undefined;

        if (!ligne.variante) return [{ ...ligne, product: frais, supplements: avecSupplements }];

        const variante = frais.variants?.find((v) => v.id === ligne.variante!.id);
        if (!variante || !variante.isAvailable) return [];

        return [{ ...ligne, product: frais, variante, supplements: avecSupplements }];
      })
    );
  };

  // Le commerçant change son menu, ses prix, ses horaires : la vitrine suit,
  // et le panier avec elle.
  useDonneesModifiees(
    ['products', 'categories', 'store-hours', 'stores', 'promotions', 'reviews', 'product-media'],
    async () => {
      const menu = await fetchStoreData();
      if (menu) rapprocherLePanier(menu);
    },
    { storeId: store?.id, delaiMs: 800, actif: Boolean(store?.id) }
  );

  const addToCart = (product: Product) => {
    const declinaisons = product.variants || [];
    const choisie = declinaisons.find((v) => v.id === choix[product.id]);

    // Un plat qui se décline attend un choix : le serveur refuserait la
    // commande, autant le dire avant.
    if (declinaisons.length > 0 && (!choisie || !choisie.isAvailable)) return;
    // Un groupe obligatoire (« une sauce au choix ») attend aussi son choix.
    if (groupeManquant(product, supChoisis[product.id])) return;

    const supplements = supplementsRetenus(product, supChoisis[product.id]);
    const nouvelle: LigneVitrine = {
      product,
      quantity: 1,
      variante: choisie,
      supplements: supplements.length > 0 ? supplements : undefined,
    };
    const cle = cleDeLItem(nouvelle);

    setCart((prev) => {
      if (prev.some((item) => cleDeLItem(item) === cle)) {
        return prev.map((item) =>
          cleDeLItem(item) === cle ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      return [...prev, nouvelle];
    });
  };

  /**
   * Coche ou décoche un supplément. Dans un groupe à un seul choix, le
   * nouveau remplace l'ancien ; ailleurs, le plafond du groupe est respecté.
   */
  const basculerSupplement = (product: Product, groupe: GroupeSupplements, id: string) => {
    setSupChoisis((precedent) => {
      const actuels = precedent[product.id] || [];
      if (actuels.includes(id)) {
        return { ...precedent, [product.id]: actuels.filter((x) => x !== id) };
      }
      const duGroupe = groupe.choices.map((c) => c.id);
      const dejaDansLeGroupe = actuels.filter((x) => duGroupe.includes(x));
      if (groupe.maxChoices === 1) {
        return { ...precedent, [product.id]: [...actuels.filter((x) => !duGroupe.includes(x)), id] };
      }
      if (groupe.maxChoices != null && dejaDansLeGroupe.length >= groupe.maxChoices) return precedent;
      return { ...precedent, [product.id]: [...actuels, id] };
    });
  };

  const removeFromCart = (cle: string) => {
    setCart((prev) => prev.filter((item) => cleDeLItem(item) !== cle));
  };

  const updateQuantity = (cle: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(cle);
      return;
    }

    setCart((prev) =>
      prev.map((item) =>
        cleDeLItem(item) === cle ? { ...item, quantity } : item
      )
    );
  };

  // Échap referme le tiroir du panier.
  useEffect(() => {
    if (!showCart) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowCart(false);
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [showCart]);

  // Le badge compte les articles, pas les lignes : 1 × 4 Fromages et
  // 2 × Kebab font 3 articles, pas 2.
  const nombreArticles = cart.reduce((somme, item) => somme + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + prixDeLaLigne(item) * item.quantity, 0);
  // Les frais ne s'ajoutent que s'ils sont connus, c'est-à-dire l'adresse
  // retenue et desservie.
  const fraisConnus = livraison?.livrable ? livraison.frais : null;
  const manqueAuMinimum =
    livraison?.livrable && livraison.minimum > cartTotal ? livraison.minimum - cartTotal : 0;

  /**
   * Les seuls cas où le serveur refuse toute commande : bouton rapide sur
   * « fermé », ou commerce pas encore validé. Hors des horaires, le retrait
   * sur un prochain créneau reste possible — à 10 h, on réserve pour midi.
   */
  const commandeBloquee = store?.isOpen === false || store?.enAttenteDeValidation === true;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-400">Chargement de la boutique...</p>
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="text-center">
          <p className="text-gray-400 text-lg">Boutique non trouvée</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Header with Store Info */}
      <header className="bg-gradient-to-r from-red-600 to-orange-600 py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {store.settings?.logo && (
                <img
                  src={store.settings.logo}
                  alt={store.name}
                  className="h-20 w-20 shrink-0 rounded-xl bg-white object-contain p-1 shadow-lg"
                />
              )}
              <div>
                <h1 className="text-4xl font-bold mb-2">{store.name}</h1>
                {store.genreLibelle && (
                  <span className="inline-block mb-2 rounded-full bg-white/20 px-3 py-0.5 text-sm font-semibold">
                    {store.genreLibelle}
                  </span>
                )}
                <p className="text-white/90 max-w-2xl">{store.description}</p>
              </div>
            </div>
            <button
              onClick={() => setShowCart(!showCart)}
              className="relative bg-white text-red-600 px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-gray-100 transition-colors"
            >
              <ShoppingCart size={20} />
              Panier
              {nombreArticles > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-600 text-white min-w-[1.5rem] h-6 px-1 rounded-full flex items-center justify-center text-xs font-bold">
                  {nombreArticles > 99 ? '99+' : nombreArticles}
                </span>
              )}
            </button>
          </div>

          {/* Store Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 text-white text-sm">
            {store.address && (
              <div className="flex items-center gap-2">
                <MapPin size={18} />
                <span>{store.address}{store.postalCode ? ', ' + store.postalCode : ''}{store.city ? ' ' + store.city : ''}</span>
              </div>
            )}
            {store.phone && (
              <div className="flex items-center gap-2">
                <Phone size={18} />
                <span>{store.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Clock size={18} />
              <span className={store.isOpenNow === false ? 'text-red-600 font-medium' : ''}>
                {store.isOpenNow === false ? 'Fermé' : 'Ouvert'}
              </span>
            </div>
          </div>

          {/* Livraison à l'adresse du client : les frais se lisent avant de
              remplir le panier, plus seulement au moment de commander. */}
          <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
            <ChoixAdresseLivraison adresse={adresse} onChange={setAdresse} />
            {adresse && livraison && (
              livraison.livrable ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-white">
                  <span className="flex items-center gap-2 font-semibold">
                    <Bike size={18} />
                    {livraison.frais > 0 ? `Livraison ${euro(livraison.frais)}` : 'Livraison gratuite'}
                  </span>
                  {livraison.minimum > 0 && (
                    <span className="text-white/90">Minimum {euro(livraison.minimum)}</span>
                  )}
                  {livraison.zone?.deliveryMinutes != null && (
                    <span className="text-white/90">≈ {livraison.zone.deliveryMinutes} min</span>
                  )}
                </div>
              ) : (
                <p className="rounded-lg bg-black/25 px-3 py-2 text-amber-100">
                  {livraison.raison || 'Livraison indisponible à cette adresse.'} Le retrait sur place reste possible.
                </p>
              )
            )}
          </div>
        </div>
      </header>

      <div>
        {/* Main Content — sa largeur ne dépend plus du panier : ouvrir ce
            dernier décalait toute la page vers la gauche. */}
        <main className="w-full">
          <div className="max-w-6xl mx-auto p-6 space-y-8">
            {categories.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 text-lg">Aucun produit disponible pour le moment</p>
              </div>
            ) : (
              categories.map(category => (
                <section key={category.id}>
                  <h2 className="text-2xl font-bold mb-4 text-white">{category.name}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {category.products.map(product => (
                      <div
                        key={product.id}
                        className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden hover:border-red-600 transition-colors flex flex-col"
                      >
                        {/* Product Image */}
                        {product.images && product.images.length > 0 ? (
                          <img
                            src={product.images[0].url}
                            alt={product.name}
                            className="w-full h-48 object-cover bg-gray-700"
                          />
                        ) : (
                          <div className="w-full h-48 bg-gray-700 flex items-center justify-center">
                            <span className="text-4xl">🍽️</span>
                          </div>
                        )}

                        {/* Product Info — en colonne, pour que le prix et le
                            bouton se calent en bas de la carte : sans cela, ils
                            remontaient d'autant qu'il manquait une note ou une
                            ligne de description, et les cartes d'une même
                            rangée ne s'alignaient plus. */}
                        <div className="p-4 flex flex-col gap-3 flex-1">
                          <h3 className="font-bold text-lg">{product.name}</h3>
                          <p className="text-gray-400 text-sm">{product.description}</p>

                          {/* La note des clients, et seulement elle : quatre
                              étoiles et « 24 avis » s'affichaient en dur sous
                              chaque plat, même créé à l'instant. Sans avis, rien. */}
                          {product.note && (
                            <div
                              className="flex items-center gap-1"
                              aria-label={`Noté ${product.note.moyenne.toLocaleString('fr-FR')} sur 5 par ${product.note.nombre} client${product.note.nombre > 1 ? 's' : ''}`}
                            >
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  size={16}
                                  className={
                                    i < Math.round(product.note!.moyenne)
                                      ? 'fill-yellow-400 text-yellow-400'
                                      : 'text-gray-600'
                                  }
                                />
                              ))}
                              <span className="text-xs text-gray-500 ml-2">
                                {product.note.moyenne.toLocaleString('fr-FR')} ({product.note.nombre} avis)
                              </span>
                            </div>
                          )}

                          {/* Price & Stock */}
                          <div className="mt-auto flex items-center justify-between">
                            <div>
                              <p className="text-2xl font-bold text-red-400">
                                {euro(
                                  Number(
                                    (product.variants || []).find((v) => v.id === choix[product.id])
                                      ?.prixEffectif ?? product.price
                                  ) + sommeDesSupplements(supplementsRetenus(product, supChoisis[product.id]))
                                )}
                              </p>
                              <p className="text-xs text-gray-500">
                                {product.isAvailable ? 'Disponible' : 'Épuisé'}
                              </p>
                            </div>
                          </div>

                          {/* Les déclinaisons : « Type de pâtes », « Taille »… */}
                          {(product.variants || []).length > 0 && (
                            <div>
                              {product.variantLabel && (
                                <p className="text-xs text-gray-400 mb-1.5">{product.variantLabel}</p>
                              )}

                              <div
                                role="radiogroup"
                                aria-label={product.variantLabel || `Déclinaisons de ${product.name}`}
                                className="flex flex-wrap gap-2"
                              >
                                {(product.variants || []).map((declinaison) => {
                                  const retenue = choix[product.id] === declinaison.id;
                                  const indisponible =
                                    !declinaison.isAvailable || !product.isAvailable;

                                  return (
                                    <button
                                      key={declinaison.id}
                                      type="button"
                                      role="radio"
                                      aria-checked={retenue}
                                      disabled={indisponible}
                                      onClick={() =>
                                        setChoix((precedent) => ({
                                          ...precedent,
                                          [product.id]: declinaison.id,
                                        }))
                                      }
                                      title={
                                        indisponible
                                          ? `${declinaison.label} n'est plus disponible`
                                          : undefined
                                      }
                                      className={`px-3 py-1 rounded-full border text-sm transition ${
                                        indisponible
                                          ? 'border-gray-700 text-gray-600 line-through cursor-not-allowed'
                                          : retenue
                                            ? 'border-red-500 bg-red-500/20 text-red-300'
                                            : 'border-gray-600 text-gray-300 hover:border-gray-400'
                                      }`}
                                    >
                                      {declinaison.label}
                                      {declinaison.prixEffectif !== product.price && (
                                        <span className="text-xs opacity-70">
                                          {' '}
                                          {euro(declinaison.prixEffectif)}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Les suppléments payants : bacon, cheddar, sauce au choix. */}
                          {(product.supplements || []).map((groupe) => {
                            const coches = supChoisis[product.id] || [];
                            const nbDansGroupe = groupe.choices.filter((c) => coches.includes(c.id)).length;
                            const plein = groupe.maxChoices != null && groupe.maxChoices > 1 && nbDansGroupe >= groupe.maxChoices;

                            return (
                              <div key={groupe.id}>
                                <p className="text-xs text-gray-400 mb-1.5">
                                  {groupe.name}
                                  {groupe.isRequired && <span className="text-red-400"> · obligatoire</span>}
                                  {groupe.maxChoices != null && (
                                    <span className="text-gray-500">
                                      {' '}· {groupe.maxChoices === 1 ? '1 au choix' : `${groupe.maxChoices} au plus`}
                                    </span>
                                  )}
                                </p>
                                <div role="group" aria-label={`${groupe.name} de ${product.name}`} className="flex flex-wrap gap-2">
                                  {groupe.choices.map((sup) => {
                                    const coche = coches.includes(sup.id);
                                    const indisponible = !sup.isAvailable || !product.isAvailable;
                                    return (
                                      <button
                                        key={sup.id}
                                        type="button"
                                        aria-pressed={coche}
                                        disabled={indisponible || (plein && !coche)}
                                        onClick={() => basculerSupplement(product, groupe, sup.id)}
                                        title={indisponible ? `${sup.label} n'est plus disponible` : undefined}
                                        className={`px-3 py-1 rounded-full border text-sm transition ${
                                          indisponible
                                            ? 'border-gray-700 text-gray-600 line-through cursor-not-allowed'
                                            : coche
                                              ? 'border-red-500 bg-red-500/20 text-red-300'
                                              : plein
                                                ? 'border-gray-700 text-gray-500 cursor-not-allowed'
                                                : 'border-gray-600 text-gray-300 hover:border-gray-400'
                                        }`}
                                      >
                                        {sup.label}
                                        <span className="text-xs opacity-70">
                                          {' '}
                                          {sup.price > 0 ? `+${euro(sup.price)}` : 'offert'}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}

                          {/* Add to Cart Button */}
                          {(() => {
                            const declinaisons = product.variants || [];
                            const choisie = declinaisons.find((v) => v.id === choix[product.id]);
                            const manquant = groupeManquant(product, supChoisis[product.id]);
                            const bloque =
                              !product.isAvailable ||
                              (declinaisons.length > 0 && (!choisie || !choisie.isAvailable)) ||
                              Boolean(manquant);

                            return (
                              <button
                                onClick={() => addToCart(product)}
                                disabled={bloque}
                                aria-label={`Ajouter ${product.name} au panier`}
                                className={`w-full py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors ${
                                  bloque
                                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                    : 'bg-red-600 hover:bg-red-700 text-white'
                                }`}
                              >
                                <ShoppingCart size={18} />
                                {declinaisons.length > 0 && !choisie
                                  ? `Choisissez : ${product.variantLabel || 'une option'}`
                                  : manquant
                                    ? `Choisissez : ${manquant.name}`
                                    : 'Ajouter au panier'}
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </main>

        {/* Shopping Cart Drawer — il glisse par-dessus la page au lieu de
            la pousser. */}
        {showCart && (
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setShowCart(false)}
            aria-hidden="true"
          />
        )}
        {showCart && (
          <aside
            role="dialog"
            aria-label="Votre panier"
            className="fixed top-0 right-0 z-50 h-full w-full sm:w-96 bg-gray-800 border-l border-gray-700 p-6 overflow-y-auto shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Votre Panier</h2>
              <button
                onClick={() => setShowCart(false)}
                aria-label="Fermer le panier"
                className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700"
              >
                <X size={22} />
              </button>
            </div>

            {cart.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Votre panier est vide</p>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  {cart.map((item) => {
                    const cle = cleDeLItem(item);

                    return (
                      <div key={cle} className="bg-gray-700 rounded-lg p-4 space-y-2">
                        <h3 className="font-semibold">
                          {item.product.name}
                          {/* Sans le nom de la déclinaison, deux lignes du même
                              plat seraient indistinguables. */}
                          {item.variante && (
                            <span className="text-gray-400"> — {item.variante.label}</span>
                          )}
                          {item.supplements && item.supplements.length > 0 && (
                            <span className="block text-xs font-normal text-gray-400">
                              + {item.supplements.map((sup) => sup.label).join(', ')}
                            </span>
                          )}
                        </h3>
                        <div className="flex items-center justify-between">
                          <p className="text-red-400">{euro(prixDeLaLigne(item))}</p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateQuantity(cle, item.quantity - 1)}
                              aria-label={`Retirer un ${item.product.name}`}
                              className="w-6 h-6 bg-gray-600 hover:bg-gray-500 rounded text-sm"
                            >
                              −
                            </button>
                            <span className="w-8 text-center">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(cle, item.quantity + 1)}
                              aria-label={`Ajouter un ${item.product.name}`}
                              className="w-6 h-6 bg-gray-600 hover:bg-gray-500 rounded text-sm"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <button
                          onClick={() => removeFromCart(cle)}
                          className="text-xs text-red-400 hover:text-red-300 w-full text-left"
                        >
                          Supprimer
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Cart Summary */}
                <div className="border-t border-gray-700 pt-4 space-y-3">
                  <div className="flex justify-between">
                    <span>Sous-total</span>
                    <span>{euro(cartTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Livraison</span>
                    {/* Les frais dépendent de l'adresse : sans elle, ils
                        s'affichent dans le tunnel, dès qu'elle est saisie. */}
                    <span>
                      {fraisConnus == null
                        ? livraison && !livraison.livrable
                          ? 'non desservi'
                          : 'selon la zone'
                        : fraisConnus > 0
                          ? euro(fraisConnus)
                          : 'Gratuite'}
                    </span>
                  </div>
                  {fraisDeService > 0 && (
                    <div className="flex justify-between">
                      <span>Frais de service</span>
                      <span>{euro(fraisDeService)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold border-t border-gray-700 pt-3">
                    <span>Total</span>
                    <span>{euro(cartTotal + (fraisConnus ?? 0) + fraisDeService)}</span>
                  </div>

                  {manqueAuMinimum > 0 && (
                    <p className="rounded-lg border border-amber-700/50 bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
                      Encore {euro(manqueAuMinimum)} pour atteindre le minimum de livraison (
                      {euro(livraison!.minimum)}).
                    </p>
                  )}

                  {/* Une boutique fermée reste consultable : elle disparaissait
                      purement et simplement de la liste des commerces. Fermée par
                      le bouton rapide ou en attente de validation, elle ne prend
                      rien ; hors de ses horaires, elle prend encore des retraits
                      sur un prochain créneau. */}
                  {store?.isOpenNow === false && (
                    <p
                      role="status"
                      className="rounded-lg border border-amber-700/50 bg-amber-900/30 px-3 py-2 text-sm text-amber-200"
                    >
                      {store?.enAttenteDeValidation
                        ? 'Boutique pas encore ouverte aux commandes.'
                        : commandeBloquee
                          ? 'Momentanément indisponible — commande impossible pour le moment.'
                          : 'Fermé pour le moment — commandez pour un retrait sur un prochain créneau.'}
                    </p>
                  )}

                  {/* Hors des horaires, la commande reste possible : le tunnel
                      propose un créneau de retrait ultérieur et le serveur
                      l'accepte. Seuls le bouton rapide et un commerce non
                      validé la bloquent — ce que le serveur refuse aussi. */}
                  <button
                    // La commande se passe sur une page à elle, `/checkout` : le
                    // panier y est déjà, enregistré sous cette boutique.
                    onClick={() => router.push(`/checkout?boutique=${store!.id}`)}
                    disabled={commandeBloquee}
                    className="w-full py-3 bg-red-600 hover:bg-red-700 rounded-lg font-bold transition-colors mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Passer la Commande
                  </button>
                </div>
              </>
            )}
          </aside>
        )}
      </div>

    </div>
  );
}
