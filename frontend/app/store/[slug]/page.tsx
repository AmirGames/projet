'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MapPin, Phone, Clock, Star, X, Bike, Plus, Minus, Check, Trash2, ShoppingBag } from 'lucide-react';

import { euro } from '@/lib/format';
import { ChoixAdresseLivraison } from '@/components/ChoixAdresseLivraison';
import { EnTeteClient } from '@/components/EnTeteClient';
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
  const t = useTranslations('storefront');

  const [store, setStore] = useState<Store | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<LigneVitrine[]>([]);
  // La déclinaison retenue pour chaque plat, avant l'ajout au panier.
  const [choix, setChoix] = useState<Record<string, string>>({});
  // Les suppléments cochés pour chaque plat, avant l'ajout au panier.
  const [supChoisis, setSupChoisis] = useState<Record<string, string[]>>({});
  // La fiche du plat ouverte, et la quantité qu'on s'apprête à ajouter.
  const [produitOuvert, setProduitOuvert] = useState<Product | null>(null);
  const [quantite, setQuantite] = useState(1);
  // Le nom du dernier plat ajouté, le temps d'une confirmation.
  const [ajout, setAjout] = useState<string | null>(null);
  // La catégorie du menu en cours de lecture, pour l'onglet actif.
  const [categorieActive, setCategorieActive] = useState<string | null>(null);
  const ongletsRef = useRef<HTMLDivElement>(null);
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


  const addToCart = (product: Product, quantite = 1) => {
    const declinaisons = product.variants || [];
    const choisie = declinaisons.find((v) => v.id === choix[product.id]);

    // Un plat qui se décline attend un choix : le serveur refuserait la
    // commande, autant le dire avant.
    if (declinaisons.length > 0 && (!choisie || !choisie.isAvailable)) return false;
    // Un groupe obligatoire (« une sauce au choix ») attend aussi son choix.
    if (groupeManquant(product, supChoisis[product.id])) return false;

    const supplements = supplementsRetenus(product, supChoisis[product.id]);
    const nouvelle: LigneVitrine = {
      product,
      quantity: quantite,
      variante: choisie,
      supplements: supplements.length > 0 ? supplements : undefined,
    };
    const cle = cleDeLItem(nouvelle);

    setCart((prev) => {
      if (prev.some((item) => cleDeLItem(item) === cle)) {
        return prev.map((item) =>
          cleDeLItem(item) === cle ? { ...item, quantity: item.quantity + quantite } : item
        );
      }

      return [...prev, nouvelle];
    });
    setAjout(product.name);
    return true;
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

  // Échap referme le tiroir du panier, ou la fiche du plat.
  useEffect(() => {
    if (!showCart && !produitOuvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setShowCart(false);
      setProduitOuvert(null);
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [showCart, produitOuvert]);

  // La confirmation d'ajout s'efface d'elle-même.
  useEffect(() => {
    if (!ajout) return;
    const minuterie = window.setTimeout(() => setAjout(null), 2200);
    return () => window.clearTimeout(minuterie);
  }, [ajout]);

  // L'onglet de catégorie suit la lecture du menu.
  useEffect(() => {
    if (categories.length === 0) return;
    const observateur = new IntersectionObserver(
      (entrees) => {
        const visible = entrees.find((entree) => entree.isIntersecting);
        if (visible) setCategorieActive(visible.target.getAttribute('data-categorie'));
      },
      { rootMargin: '-140px 0px -60% 0px' }
    );
    document.querySelectorAll('[data-categorie]').forEach((section) => observateur.observe(section));
    return () => observateur.disconnect();
  }, [categories]);

  // L'onglet actif reste visible dans la barre qui défile.
  useEffect(() => {
    if (!categorieActive) return;
    ongletsRef.current
      ?.querySelector(`[data-onglet="${CSS.escape(categorieActive)}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [categorieActive]);

  const ouvrirProduit = (product: Product) => {
    setQuantite(1);
    setProduitOuvert(product);
  };

  /** Un plat sans déclinaison ni supplément s'ajoute d'un geste, sans fiche. */
  const ajoutDirect = (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    if ((product.variants || []).length > 0 || (product.supplements || []).length > 0) {
      ouvrirProduit(product);
      return;
    }
    addToCart(product);
  };

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

  // Les plats que les clients notent le mieux, mis en avant en tête du menu.
  const populaires = categories
    .flatMap((categorie) => categorie.products)
    .filter((produit) => produit.isAvailable && produit.note && produit.note.moyenne >= 4)
    .sort((a, b) => b.note!.moyenne - a.note!.moyenne || b.note!.nombre - a.note!.nombre)
    .slice(0, 8);

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <EnTeteClient />
        <div className="max-w-6xl mx-auto px-4 md:px-6 pt-4 animate-pulse" aria-busy="true">
          <span className="sr-only">{t('loading')}</span>
          <div className="h-40 md:h-56 rounded-3xl bg-gray-100" />
          <div className="mt-6 h-8 w-64 rounded bg-gray-100" />
          <div className="mt-3 h-4 w-96 max-w-full rounded bg-gray-100" />
          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-36 rounded-2xl bg-gray-100" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen bg-white">
        <EnTeteClient />
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <p className="text-6xl" aria-hidden="true">🍽️</p>
          <p className="mt-4 text-xl font-bold text-gray-900">{t('notFound')}</p>
          <Link
            href="/client"
            className="mt-6 inline-block rounded-full bg-gray-900 px-6 py-3 font-semibold text-white hover:bg-gray-800"
          >
            {t('backHome')}
          </Link>
        </div>
      </div>
    );
  }

  const produitPrix = (product: Product) =>
    Number((product.variants || []).find((v) => v.id === choix[product.id])?.prixEffectif ?? product.price) +
    sommeDesSupplements(supplementsRetenus(product, supChoisis[product.id]));

  return (
    <div className="min-h-screen bg-white text-gray-900 pb-28">
      <EnTeteClient />

      {/* La bannière et l'identité du commerce. */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-4">
        <div className="relative h-36 md:h-56 overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-orange-600 to-red-600">
          <div aria-hidden="true" className="absolute -right-10 -top-16 h-64 w-64 rounded-full bg-white/10" />
          <div aria-hidden="true" className="absolute right-40 -bottom-24 h-56 w-56 rounded-full bg-white/10" />
          <div aria-hidden="true" className="absolute -left-10 -bottom-20 h-48 w-48 rounded-full bg-black/5" />
        </div>

        <div className="relative -mt-12 md:-mt-14 px-2 md:px-6">
          {store.settings?.logo ? (
            <img
              src={store.settings.logo}
              alt={store.name}
              className="h-24 w-24 md:h-28 md:w-28 rounded-2xl bg-white object-contain p-2 shadow-lg ring-4 ring-white"
            />
          ) : (
            <span className="flex h-24 w-24 md:h-28 md:w-28 items-center justify-center rounded-2xl bg-white text-5xl font-extrabold text-orange-600 shadow-lg ring-4 ring-white">
              {store.name.charAt(0)}
            </span>
          )}
        </div>

        <div className="mt-4 px-2 md:px-6">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">{store.name}</h1>
            <button
              type="button"
              onClick={() => setShowCart(true)}
              className="relative mt-1 flex flex-shrink-0 items-center gap-2 rounded-full bg-gray-100 px-4 py-2.5 text-sm font-semibold hover:bg-gray-200"
            >
              <ShoppingBag size={18} />
              {t('cart')}
              {nombreArticles > 0 && (
                <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-orange-600 px-1 text-xs font-bold text-white">
                  {nombreArticles > 99 ? '99+' : nombreArticles}
                </span>
              )}
            </button>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
            {store.genreLibelle && <span>{store.genreLibelle}</span>}
            {store.genreLibelle && <span aria-hidden="true">·</span>}
            <span
              className={`inline-flex items-center gap-1.5 font-semibold ${
                store.isOpenNow === false ? 'text-red-600' : 'text-green-700'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${store.isOpenNow === false ? 'bg-red-500' : 'bg-green-500'}`}
                aria-hidden="true"
              />
              {store.isOpenNow === false ? t('closed') : t('open')}
            </span>
            {store.address && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin size={14} />
                  {store.address}
                  {store.postalCode ? ', ' + store.postalCode : ''}
                  {store.city ? ' ' + store.city : ''}
                </span>
              </>
            )}
            {store.phone && (
              <>
                <span aria-hidden="true">·</span>
                <a href={`tel:${store.phone}`} className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900">
                  <Phone size={14} />
                  {store.phone}
                </a>
              </>
            )}
          </p>
          {store.description && <p className="mt-3 max-w-3xl text-gray-600">{store.description}</p>}

          {/* Livraison à l'adresse du client : les frais se lisent avant de
              remplir le panier, plus seulement au moment de commander. */}
          <div className="mt-5 flex flex-col lg:flex-row lg:items-center gap-3 text-sm">
            <ChoixAdresseLivraison adresse={adresse} onChange={setAdresse} clair />
            {adresse && livraison && (
              livraison.livrable ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 font-semibold ${
                      livraison.frais > 0 ? 'bg-gray-100' : 'bg-green-50 text-green-700'
                    }`}
                  >
                    <Bike size={16} />
                    {livraison.frais > 0
                      ? t('deliveryFee', { montant: euro(livraison.frais) })
                      : t('freeDelivery')}
                  </span>
                  {livraison.zone?.deliveryMinutes != null && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-2 font-semibold">
                      <Clock size={16} />
                      {t('minutes', { n: livraison.zone.deliveryMinutes })}
                    </span>
                  )}
                  {livraison.minimum > 0 && (
                    <span className="rounded-full bg-gray-100 px-3 py-2 text-gray-600">
                      {t('minimum', { montant: euro(livraison.minimum) })}
                    </span>
                  )}
                </div>
              ) : (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
                  {t('notDelivered', { raison: livraison.raison || t('notDeliveredDefault') })}
                </p>
              )
            )}
          </div>

          {/* Une boutique fermée reste consultable : elle disparaissait
              purement et simplement de la liste des commerces. */}
          {store.isOpenNow === false && (
            <p role="status" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {store.enAttenteDeValidation
                ? t('pendingValidation')
                : commandeBloquee
                  ? t('unavailableNow')
                  : t('closedPickup')}
            </p>
          )}
        </div>
      </div>

      {/* Les catégories du menu, en onglets qui restent sous l'en-tête. */}
      {categories.length > 1 && (
        <nav
          aria-label={t('categoriesNav')}
          className="sticky top-16 z-30 mt-8 border-b border-gray-100 bg-white/95 backdrop-blur"
        >
          <div
            ref={ongletsRef}
            className="max-w-6xl mx-auto flex gap-1 overflow-x-auto px-4 md:px-6 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {categories.map((categorie) => {
              const active = categorieActive === categorie.id;
              return (
                <a
                  key={categorie.id}
                  href={`#categorie-${encodeURIComponent(categorie.id)}`}
                  data-onglet={categorie.id}
                  onClick={(e) => {
                    e.preventDefault();
                    document
                      .getElementById(`categorie-${encodeURIComponent(categorie.id)}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`flex-shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                    active ? 'bg-gray-900 text-white hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {categorie.name}
                </a>
              );
            })}
          </div>
        </nav>
      )}

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-8 space-y-12">
        {categories.length === 0 ? (
          <div className="rounded-3xl bg-gray-50 py-16 text-center">
            <p className="text-5xl" aria-hidden="true">🍽️</p>
            <p className="mt-3 text-lg font-semibold text-gray-700">{t('noProducts')}</p>
          </div>
        ) : (
          <>
            {populaires.length >= 2 && (
              <section>
                <h2 className="mb-4 text-2xl font-bold tracking-tight">{t('popular')}</h2>
                <div className="-mx-4 flex snap-x snap-mandatory scroll-pl-4 gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:scroll-pl-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {populaires.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => ouvrirProduit(product)}
                      className="group w-44 flex-shrink-0 snap-start text-left"
                    >
                      <div className="relative aspect-square overflow-hidden rounded-2xl bg-gray-100">
                        {product.images?.[0] ? (
                          <img
                            src={product.images[0].url}
                            alt={product.name}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <span className="flex h-full items-center justify-center text-5xl" aria-hidden="true">🍽️</span>
                        )}
                        <span
                          aria-hidden="true"
                          onClick={(e) => ajoutDirect(e, product)}
                          className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md transition group-hover:scale-110"
                        >
                          <Plus size={20} />
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-1 font-semibold">{product.name}</p>
                      <p className="flex items-center gap-1.5 text-sm text-gray-600">
                        {euro(product.price)}
                        <span aria-hidden="true">·</span>
                        <Star size={13} className="fill-gray-900 text-gray-900" />
                        {product.note!.moyenne.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {categories.map((category) => (
              <section
                key={category.id}
                id={`categorie-${encodeURIComponent(category.id)}`}
                data-categorie={category.id}
                className="scroll-mt-32"
              >
                <h2 className="mb-4 text-2xl font-bold tracking-tight">{category.name}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {category.products.map((product) => (
                    <CartePlat
                      key={product.id}
                      product={product}
                      onOuvrir={() => ouvrirProduit(product)}
                      onAjout={(e) => ajoutDirect(e, product)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </main>

      {/* La fiche d'un plat : déclinaisons, suppléments, quantité. */}
      {produitOuvert && (() => {
        const product =
          categories.flatMap((categorie) => categorie.products).find((p) => p.id === produitOuvert.id) ||
          produitOuvert;
        const declinaisons = product.variants || [];
        const choisie = declinaisons.find((v) => v.id === choix[product.id]);
        const manquant = groupeManquant(product, supChoisis[product.id]);
        const bloque =
          !product.isAvailable ||
          (declinaisons.length > 0 && (!choisie || !choisie.isAvailable)) ||
          Boolean(manquant);

        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setProduitOuvert(null)} aria-hidden="true" />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={product.name}
              className="relative flex max-h-[92vh] w-full sm:max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl"
            >
              <button
                type="button"
                onClick={() => setProduitOuvert(null)}
                aria-label={t('close')}
                className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md hover:bg-gray-50"
              >
                <X size={20} />
              </button>

              <div className="overflow-y-auto">
                {product.images?.[0] ? (
                  <img src={product.images[0].url} alt={product.name} className="h-56 sm:h-64 w-full object-cover" />
                ) : (
                  <div className="flex h-32 items-center justify-center bg-orange-50 text-6xl" aria-hidden="true">
                    🍽️
                  </div>
                )}

                <div className="p-6">
                  <h2 className="pr-8 text-2xl font-extrabold tracking-tight">{product.name}</h2>
                  <p className="mt-1 text-lg font-semibold">{euro(produitPrix(product))}</p>
                  {product.note && (
                    <p
                      className="mt-1 flex items-center gap-1 text-sm text-gray-600"
                      aria-label={t('ratedLabel', {
                        note: product.note.moyenne.toLocaleString('fr-FR'),
                        n: product.note.nombre,
                      })}
                    >
                      <Star size={14} className="fill-gray-900 text-gray-900" />
                      {product.note.moyenne.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ({product.note.nombre})
                    </p>
                  )}
                  {product.description && <p className="mt-3 text-gray-600">{product.description}</p>}

                  {/* Les déclinaisons : « Type de pâtes », « Taille »… */}
                  {declinaisons.length > 0 && (
                    <fieldset className="mt-6">
                      <legend className="flex w-full items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                        <span className="font-bold">{product.variantLabel || t('anOption')}</span>
                        <span className="rounded-full bg-gray-900 px-2.5 py-0.5 text-xs font-semibold text-white">
                          {t('required')}
                        </span>
                      </legend>
                      <div
                        role="radiogroup"
                        aria-label={product.variantLabel || t('variantsOf', { name: product.name })}
                        className="mt-1 divide-y divide-gray-100"
                      >
                        {declinaisons.map((declinaison) => {
                          const retenue = choix[product.id] === declinaison.id;
                          const indisponible = !declinaison.isAvailable || !product.isAvailable;
                          return (
                            <button
                              key={declinaison.id}
                              type="button"
                              role="radio"
                              aria-checked={retenue}
                              disabled={indisponible}
                              onClick={() => setChoix((precedent) => ({ ...precedent, [product.id]: declinaison.id }))}
                              title={indisponible ? t('noLongerAvailable', { label: declinaison.label }) : undefined}
                              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <span className={indisponible ? 'line-through' : ''}>
                                {declinaison.label}
                                {declinaison.prixEffectif !== product.price && (
                                  <span className="block text-sm text-gray-500">{euro(declinaison.prixEffectif)}</span>
                                )}
                              </span>
                              <span
                                aria-hidden="true"
                                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                                  retenue ? 'border-gray-900' : 'border-gray-300'
                                }`}
                              >
                                {retenue && <span className="h-2.5 w-2.5 rounded-full bg-gray-900" />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  )}

                  {/* Les suppléments payants : bacon, cheddar, sauce au choix. */}
                  {(product.supplements || []).map((groupe) => {
                    const coches = supChoisis[product.id] || [];
                    const nbDansGroupe = groupe.choices.filter((c) => coches.includes(c.id)).length;
                    const plein =
                      groupe.maxChoices != null && groupe.maxChoices > 1 && nbDansGroupe >= groupe.maxChoices;

                    return (
                      <fieldset key={groupe.id} className="mt-6">
                        <legend className="flex w-full items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3">
                          <span>
                            <span className="block font-bold">{groupe.name}</span>
                            {groupe.maxChoices != null && (
                              <span className="block text-sm text-gray-500">
                                {groupe.maxChoices === 1 ? t('oneChoice') : t('upTo', { n: groupe.maxChoices })}
                              </span>
                            )}
                          </span>
                          <span
                            className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              groupe.isRequired ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            {groupe.isRequired ? t('required') : t('optional')}
                          </span>
                        </legend>
                        <div
                          role="group"
                          aria-label={t('groupOf', { groupe: groupe.name, name: product.name })}
                          className="mt-1 divide-y divide-gray-100"
                        >
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
                                title={indisponible ? t('noLongerAvailable', { label: sup.label }) : undefined}
                                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <span className={indisponible ? 'line-through' : ''}>
                                  {sup.label}
                                  <span className="block text-sm text-gray-500">
                                    {sup.price > 0 ? `+${euro(sup.price)}` : t('free')}
                                  </span>
                                </span>
                                <span
                                  aria-hidden="true"
                                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center ${
                                    groupe.maxChoices === 1 ? 'rounded-full' : 'rounded-md'
                                  } border-2 ${coche ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300'}`}
                                >
                                  {coche && <Check size={13} strokeWidth={3} />}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-3 border-t border-gray-100 p-4">
                <div className="flex items-center rounded-full bg-gray-100" role="group" aria-label={t('quantity')}>
                  <button
                    type="button"
                    onClick={() => setQuantite((q) => Math.max(1, q - 1))}
                    disabled={quantite <= 1}
                    aria-label={t('removeOne', { name: product.name })}
                    className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-gray-200 disabled:opacity-40"
                  >
                    <Minus size={18} />
                  </button>
                  <span className="w-6 text-center font-semibold">{quantite}</span>
                  <button
                    type="button"
                    onClick={() => setQuantite((q) => Math.min(99, q + 1))}
                    aria-label={t('addOne', { name: product.name })}
                    className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-gray-200"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (addToCart(product, quantite)) setProduitOuvert(null);
                  }}
                  disabled={bloque}
                  aria-label={t('addNamed', { name: product.name })}
                  className="flex-1 rounded-full bg-orange-600 py-3.5 font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
                >
                  {!product.isAvailable
                    ? t('soldOut')
                    : declinaisons.length > 0 && !choisie
                      ? t('choose', { option: product.variantLabel || t('anOption') })
                      : manquant
                        ? t('choose', { option: manquant.name })
                        : t('addWithPrice', { prix: euro(produitPrix(product) * quantite) })}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* La confirmation d'ajout, discrète. */}
      {ajout && !showCart && (
        <div
          role="status"
          className="fixed left-1/2 bottom-24 z-50 -translate-x-1/2 flex max-w-[calc(100vw-2rem)] items-center gap-2 whitespace-nowrap rounded-full bg-white px-5 py-3 text-sm font-semibold text-gray-900 shadow-xl ring-1 ring-gray-200"
        >
          <Check size={16} className="flex-shrink-0 text-green-600" />
          {t('added', { name: ajout })}
        </div>
      )}

      {/* Le panier, toujours à portée de pouce dès qu'il contient quelque chose. */}
      {nombreArticles > 0 && !showCart && !produitOuvert && (
        <div className="fixed inset-x-4 bottom-4 z-40 md:inset-x-auto md:right-6 md:w-[26rem]">
          <button
            type="button"
            onClick={() => setShowCart(true)}
            className="flex w-full items-center justify-between gap-3 rounded-full bg-gray-900 py-3 pl-3 pr-6 text-white shadow-2xl transition hover:bg-gray-800"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 min-w-[2.5rem] items-center justify-center rounded-full bg-orange-600 px-2 font-bold">
                {nombreArticles > 99 ? '99+' : nombreArticles}
              </span>
              <span className="font-bold">{t('viewCart')}</span>
            </span>
            <span className="font-bold">{euro(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* Le tiroir du panier — il glisse par-dessus la page au lieu de la pousser. */}
      {showCart && (
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setShowCart(false)} aria-hidden="true" />
      )}
      {showCart && (
        <aside
          role="dialog"
          aria-label={t('cartTitle')}
          className="fixed top-0 right-0 z-50 flex h-full w-full sm:w-[26rem] flex-col bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">{t('cartTitle')}</h2>
              <p className="text-sm text-gray-500">
                {store.name}
                {nombreArticles > 0 && ` · ${t('items', { n: nombreArticles })}`}
              </p>
            </div>
            <button
              onClick={() => setShowCart(false)}
              aria-label={t('closeCart')}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100"
            >
              <X size={22} />
            </button>
          </div>

          {cart.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
                <ShoppingBag size={32} className="text-gray-400" />
              </span>
              <p className="mt-4 text-lg font-bold">{t('emptyCart')}</p>
              <p className="mt-1 text-gray-500">{t('emptyCartHint')}</p>
            </div>
          ) : (
            <>
              <ul className="flex-1 divide-y divide-gray-100 overflow-y-auto px-6">
                {cart.map((item) => {
                  const cle = cleDeLItem(item);

                  return (
                    <li key={cle} className="flex items-start gap-3 py-4">
                      <div className="min-w-0 flex-1">
                        {/* Sans le nom de la déclinaison, deux lignes du même
                            plat seraient indistinguables. */}
                        <p className="font-semibold">
                          {item.product.name}
                          {item.variante && <span className="font-normal text-gray-500"> — {item.variante.label}</span>}
                        </p>
                        {item.supplements && item.supplements.length > 0 && (
                          <p className="text-sm text-gray-500">
                            + {item.supplements.map((sup) => sup.label).join(', ')}
                          </p>
                        )}
                        <p className="mt-1 text-sm font-semibold">
                          {euro(prixDeLaLigne(item) * item.quantity)}
                          {item.quantity > 1 && (
                            <span className="font-normal text-gray-500">
                              {' '}· {t('unitPrice', { n: item.quantity, prix: euro(prixDeLaLigne(item)) })}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center rounded-full border border-gray-200">
                        <button
                          onClick={() => updateQuantity(cle, item.quantity - 1)}
                          aria-label={t('removeOne', { name: item.product.name })}
                          title={item.quantity === 1 ? t('remove', { name: item.product.name }) : undefined}
                          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100"
                        >
                          {item.quantity === 1 ? <Trash2 size={15} /> : <Minus size={15} />}
                        </button>
                        <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(cle, item.quantity + 1)}
                          aria-label={t('addOne', { name: item.product.name })}
                          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100"
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="space-y-2 border-t border-gray-100 px-6 py-5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('subtotal')}</span>
                  <span>{euro(cartTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('delivery')}</span>
                  {/* Les frais dépendent de l'adresse : sans elle, ils
                      s'affichent dans le tunnel, dès qu'elle est saisie. */}
                  <span className={fraisConnus === 0 ? 'font-semibold text-green-700' : ''}>
                    {fraisConnus == null
                      ? livraison && !livraison.livrable
                        ? t('notServed')
                        : t('deliveryByZone')
                      : fraisConnus > 0
                        ? euro(fraisConnus)
                        : t('deliveryFreeShort')}
                  </span>
                </div>
                {fraisDeService > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t('serviceFee')}</span>
                    <span>{euro(fraisDeService)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 text-lg font-extrabold">
                  <span>{t('total')}</span>
                  <span>{euro(cartTotal + (fraisConnus ?? 0) + fraisDeService)}</span>
                </div>

                {manqueAuMinimum > 0 && (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
                    {t('minimumMissing', { manque: euro(manqueAuMinimum), minimum: euro(livraison!.minimum) })}
                  </p>
                )}

                {/* Fermée par le bouton rapide ou en attente de validation,
                    elle ne prend rien ; hors de ses horaires, elle prend encore
                    des retraits sur un prochain créneau. */}
                {store.isOpenNow === false && (
                  <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
                    {store.enAttenteDeValidation
                      ? t('pendingValidation')
                      : commandeBloquee
                        ? t('unavailableNow')
                        : t('closedPickup')}
                  </p>
                )}

                {/* Hors des horaires, la commande reste possible : le tunnel
                    propose un créneau de retrait ultérieur et le serveur
                    l'accepte. Seuls le bouton rapide et un commerce non
                    validé la bloquent — ce que le serveur refuse aussi. */}
                <button
                  // La commande se passe sur une page à elle, `/checkout` : le
                  // panier y est déjà, enregistré sous cette boutique.
                  onClick={() => router.push(`/checkout?boutique=${store.id}`)}
                  disabled={commandeBloquee}
                  className="mt-3 w-full rounded-full bg-orange-600 py-4 text-base font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('checkout', { total: euro(cartTotal + (fraisConnus ?? 0) + fraisDeService) })}
                </button>
              </div>
            </>
          )}
        </aside>
      )}
    </div>
  );
}

/**
 * Un plat dans le menu : le texte à gauche, la photo à droite avec son bouton
 * « + ». Toute la carte ouvre la fiche du plat.
 */
function CartePlat({
  product,
  onOuvrir,
  onAjout,
}: {
  product: Product;
  onOuvrir: () => void;
  onAjout: (e: React.MouseEvent) => void;
}) {
  const t = useTranslations('storefront');

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOuvrir}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOuvrir();
        }
      }}
      className={`group flex cursor-pointer gap-4 rounded-2xl border border-gray-200 p-4 transition hover:border-gray-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
        product.isAvailable ? '' : 'opacity-60'
      }`}
    >
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold">{product.name}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm">
          <span className="font-semibold">{euro(product.price)}</span>
          {/* La note des clients, et seulement elle : sans avis, rien. */}
          {product.note && (
            <span
              className="inline-flex items-center gap-1 text-gray-600"
              aria-label={t('ratedLabel', {
                note: product.note.moyenne.toLocaleString('fr-FR'),
                n: product.note.nombre,
              })}
            >
              <Star size={13} className="fill-gray-900 text-gray-900" />
              {product.note.moyenne.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ({product.note.nombre})
            </span>
          )}
          {!product.isAvailable && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
              {t('soldOut')}
            </span>
          )}
        </p>
        {product.description && <p className="mt-2 line-clamp-2 text-sm text-gray-500">{product.description}</p>}
      </div>

      <div className="relative h-28 w-28 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
        {product.images && product.images.length > 0 ? (
          <img
            src={product.images[0].url}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-4xl" aria-hidden="true">
            🍽️
          </span>
        )}
        {/* Épuisé, le bouton reste à sa place mais ne répond plus. */}
        <button
          type="button"
          onClick={onAjout}
          disabled={!product.isAvailable}
          aria-label={t('addNamed', { name: product.name })}
          className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-900 shadow-md transition hover:scale-110 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:hover:scale-100"
        >
          <Plus size={20} />
        </button>
      </div>
    </div>
  );
}
