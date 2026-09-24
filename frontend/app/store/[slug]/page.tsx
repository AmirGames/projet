'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { ShoppingCart, MapPin, Phone, Clock, Star, Check } from 'lucide-react';

import { euro } from '@/lib/format';
import { TunnelCommande } from '@/components/TunnelCommande';
import { useStoreLive } from '@/lib/use-store-live';
import {
  autresPaniers,
  enregistrerPanier,
  lirePanier,
  viderPanier,
  type LignePanier,
  type PanierBoutique,
} from '@/lib/paniers';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Store {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
  /** Fermée momentanément (bouton rapide du commerçant) : la vitrine reste lisible, la commande non. */
  isOpen?: boolean;
  /** Ce que disent à la fois le planning hebdomadaire et le bouton rapide, croisés. */
  isOpenNow?: boolean;
  /** Commerce pas encore validé : la fiche se lit, aucune commande ne passe. */
  enAttenteDeValidation?: boolean;
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
}

interface Category {
  id: string;
  name: string;
  products: Product[];
}

interface OrderConfirmation {
  id: string;
  orderNumber: string;
}

export default function StorefrontPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [store, setStore] = useState<Store | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<
    { product: Product; quantity: number; variante?: Declinaison }[]
  >([]);
  // La déclinaison retenue pour chaque plat, avant l'ajout au panier.
  const [choix, setChoix] = useState<Record<string, string>>({});
  // Les paniers laissés chez d'autres commerces : ils attendent leur tour.
  const [ailleurs, setAilleurs] = useState<PanierBoutique[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  /**
   * La boutique dont le panier a déjà été lu.
   *
   * Le panier était relu à chaque changement du menu. Comme la disponibilité
   * arrive en direct et modifie le menu, une déclinaison épuisée sortait du
   * panier puis y revenait aussitôt, ressuscitée depuis le stockage : le client
   * pouvait commander un plat qui venait d'être retiré.
   */
  const panierLu = useRef<string | null>(null);
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null);

  useEffect(() => {
    if (slug) {
      fetchStoreData();
    }
  }, [slug]);

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

        return {
          // Le catalogue peut avoir changé depuis : à défaut, on reconstitue le
          // strict nécessaire pour afficher et commander la ligne.
          product:
            produit || {
              id: ligne.productId,
              name: ligne.name,
              description: ligne.description || '',
              price: ligne.price,
              isAvailable: ligne.isAvailable !== false,
              images: [],
            },
          quantity: ligne.quantity,
          variante: ligne.variantId
            ? {
                id: ligne.variantId,
                label: ligne.variantNom || '',
                prixEffectif: ligne.price,
                isAvailable: true,
              }
            : undefined,
        };
      })
    );

    setAilleurs(autresPaniers(store.id));
  }, [store?.id, loading, categories]);

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
      })),
      store.name
    );
  }, [cart, store?.id, store?.name]);


  const fetchStoreData = async () => {
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
                    enAttenteDeValidation: !!menuData.data.enAttenteDeValidation,
                  }
                : actuelle
            );
          }
          const menu = (menuData.data?.menu || {}) as Record<string, any[]>;

          setCategories(
            Object.entries(menu).map(([nom, produits]) => ({
              id: nom,
              name: nom,
              products: produits.map((produit) => ({
                id: produit.id,
                name: produit.name,
                description: produit.description || '',
                price: Number(produit.price || 0),
                isAvailable: produit.isAvailable !== false,
                variantLabel: produit.variantLabel || null,
                variants: (produit.variants || []).map((variante: any) => ({
                  id: variante.id,
                  label: variante.label,
                  prixEffectif: Number(variante.prixEffectif ?? produit.price),
                  isAvailable: variante.isAvailable !== false,
                })),
                images: (produit.media || produit.images || []).map((image: any) => ({
                  url: image.url,
                })),
              })),
            }))
          );
        }
      }
    } catch (error) {
      console.error('Error fetching store:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * La clé d'une ligne de panier.
   *
   * Indexer par produit ferait de « penne » et « spaghetti » du même plat une
   * seule ligne : le client en commanderait deux sans savoir lesquelles.
   */
  const cleDeLigne = (productId: string, variantId?: string) =>
    variantId ? `${productId}:${variantId}` : productId;

  const addToCart = (product: Product) => {
    const declinaisons = product.variants || [];
    const choisie = declinaisons.find((v) => v.id === choix[product.id]);

    // Un plat qui se décline attend un choix : le serveur refuserait la
    // commande, autant le dire avant.
    if (declinaisons.length > 0 && (!choisie || !choisie.isAvailable)) return;

    const cle = cleDeLigne(product.id, choisie?.id);

    setCart((prev) => {
      const existing = prev.find(
        (item) => cleDeLigne(item.product.id, item.variante?.id) === cle
      );

      if (existing) {
        return prev.map((item) =>
          cleDeLigne(item.product.id, item.variante?.id) === cle
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...prev, { product, quantity: 1, variante: choisie }];
    });
  };

  const removeFromCart = (cle: string) => {
    setCart((prev) =>
      prev.filter((item) => cleDeLigne(item.product.id, item.variante?.id) !== cle)
    );
  };

  const updateQuantity = (cle: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(cle);
      return;
    }

    setCart((prev) =>
      prev.map((item) =>
        cleDeLigne(item.product.id, item.variante?.id) === cle ? { ...item, quantity } : item
      )
    );
  };

  /** Le prix d'une ligne : celui de la déclinaison retenue, sinon du plat. */
  const prixDeLaLigne = (item: { product: Product; variante?: Declinaison }) =>
    Number(item.variante?.prixEffectif ?? item.product.price ?? 0);

  const cartTotal = cart.reduce((sum, item) => sum + prixDeLaLigne(item) * item.quantity, 0);

  /** Le panier tel que le tunnel de commande l'attend. */
  const lignesDuPanier: LignePanier[] = cart.map((item) => ({
    productId: item.product.id,
    name: item.product.name,
    description: item.product.description,
    price: prixDeLaLigne(item),
    quantity: item.quantity,
    isAvailable: item.product.isAvailable,
    ...(item.variante ? { variantId: item.variante.id, variantNom: item.variante.label } : {}),
  }));

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
            <div>
              <h1 className="text-4xl font-bold mb-2">{store.name}</h1>
              <p className="text-white/90 max-w-2xl">{store.description}</p>
            </div>
            <button
              onClick={() => setShowCart(!showCart)}
              className="relative bg-white text-red-600 px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-gray-100 transition-colors"
            >
              <ShoppingCart size={20} />
              Panier
              {cart.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                  {cart.length}
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
        </div>
      </header>

      <div className="flex">
        {/* Main Content */}
        <main className={`flex-1 transition-all ${showCart ? 'max-w-4xl' : 'w-full'}`}>
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
                        className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden hover:border-red-600 transition-colors"
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

                        {/* Product Info */}
                        <div className="p-4 space-y-3">
                          <h3 className="font-bold text-lg">{product.name}</h3>
                          <p className="text-gray-400 text-sm">{product.description}</p>

                          {/* Rating */}
                          <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                size={16}
                                className={i < 4 ? 'fill-yellow-400 text-yellow-400' : 'text-gray-600'}
                              />
                            ))}
                            <span className="text-xs text-gray-500 ml-2">(24 avis)</span>
                          </div>

                          {/* Price & Stock */}
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-2xl font-bold text-red-400">
                                {euro(
                                  (product.variants || []).find((v) => v.id === choix[product.id])
                                    ?.prixEffectif ?? product.price
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

                          {/* Add to Cart Button */}
                          {(() => {
                            const declinaisons = product.variants || [];
                            const choisie = declinaisons.find((v) => v.id === choix[product.id]);
                            const bloque =
                              !product.isAvailable ||
                              (declinaisons.length > 0 && (!choisie || !choisie.isAvailable));

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

        {/* Shopping Cart Sidebar */}
        {showCart && (
          <aside className="w-96 bg-gray-800 border-l border-gray-700 p-6 overflow-y-auto max-h-screen">
            <h2 className="text-2xl font-bold mb-4">Votre Panier</h2>

            {/* Un panier laissé chez un autre commerce n'est pas perdu : il
                attend, et on le lui rappelle plutôt que de le lui resservir
                ici par erreur. */}
            {ailleurs.length > 0 && (
              <div className="mb-4 rounded-lg border border-amber-700/40 bg-amber-900/15 px-3 py-2">
                <p className="text-xs text-amber-200 font-semibold mb-1">
                  {ailleurs.length === 1
                    ? 'Un panier vous attend ailleurs'
                    : `${ailleurs.length} paniers vous attendent ailleurs`}
                </p>
                <ul className="space-y-0.5">
                  {ailleurs.map((autre) => (
                    <li key={autre.storeId} className="text-xs">
                      {/* Le rappel n'était qu'un constat : on pouvait voir
                          qu'un panier attendait ailleurs, sans aucun moyen de
                          le reprendre. */}
                      <a
                        href={`/checkout?boutique=${autre.storeId}`}
                        className="text-amber-300 hover:text-amber-200 hover:underline"
                      >
                        {autre.storeName || 'Une autre boutique'} —{' '}
                        {autre.lignes.reduce((somme, ligne) => somme + ligne.quantity, 0)} article
                        {autre.lignes.reduce((somme, ligne) => somme + ligne.quantity, 0) > 1
                          ? 's'
                          : ''}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {cart.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Votre panier est vide</p>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  {cart.map((item) => {
                    const cle = cleDeLigne(item.product.id, item.variante?.id);

                    return (
                      <div key={cle} className="bg-gray-700 rounded-lg p-4 space-y-2">
                        <h3 className="font-semibold">
                          {item.product.name}
                          {/* Sans le nom de la déclinaison, deux lignes du même
                              plat seraient indistinguables. */}
                          {item.variante && (
                            <span className="text-gray-400"> — {item.variante.label}</span>
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
                    {/* Les frais dépendent de l'adresse : ils s'affichent dans
                        le tunnel, dès que le client l'a saisie. */}
                    <span>selon la zone</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t border-gray-700 pt-3">
                    <span>Total</span>
                    <span>{euro(cartTotal)}</span>
                  </div>

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
                      {commandeBloquee
                        ? 'Momentanément indisponible — commande impossible pour le moment.'
                        : 'Fermé pour le moment — commandez pour un retrait sur un prochain créneau.'}
                    </p>
                  )}

                  <button
                    onClick={() => setShowCheckout(true)}
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

      {/* Confirmation Modal */}
      {orderConfirmation && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg max-w-md w-full text-center p-8 space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-green-600/20 border border-green-600 rounded-full flex items-center justify-center">
                <Check size={32} className="text-green-400" />
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-bold mb-2">Commande Confirmée!</h2>
              <p className="text-gray-400">Votre commande a été créée avec succès</p>
            </div>

            <div className="bg-gray-700 rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-1">Numéro de commande</p>
              <p className="text-2xl font-bold text-red-400">#{orderConfirmation.orderNumber}</p>
            </div>

            <div className="bg-blue-600/20 border border-blue-600/50 rounded-lg p-4">
              <p className="text-blue-400 text-sm">
                Vous recevrez bientôt un email de confirmation avec les détails de votre commande.
              </p>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => setOrderConfirmation(null)}
                className="w-full py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors"
              >
                Retour à la boutique
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckout && !orderConfirmation && store && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-gray-800 border border-gray-700 rounded-lg max-w-2xl w-full my-8">
            <div className="border-b border-gray-700 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Informations de Livraison</h2>
              <button
                onClick={() => setShowCheckout(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            {/* Le même tunnel que la page /checkout : il n'existait qu'ici, si
                bien que l'autre chemin de commande n'avait pas de champ
                d'adresse. */}
            <TunnelCommande
              boutique={{ id: store.id, name: store.name }}
              lignes={lignesDuPanier}
              ouverteMaintenant={store.isOpenNow}
              surAnnulation={() => setShowCheckout(false)}
              surCommandePassee={(commande) => {
                setOrderConfirmation({ id: commande.id, orderNumber: commande.numero });

                // La commande est passée : ce panier-là n'a plus lieu d'être.
                setCart([]);
                viderPanier(store.id);
                setAilleurs(autresPaniers(store.id));
                setShowCheckout(false);
                setShowCart(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
