'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

import { MapPin, Clock, Star, ShoppingCart, Minus, Plus, ArrowLeft } from 'lucide-react';

import { euro } from '@/lib/format';
import { useStoreLive } from '@/lib/use-store-live';
import {
  autresPaniers,
  cleDeLigne,
  enregistrerPanier,
  lirePanier,
  type LignePanier,
  type PanierBoutique,
} from '@/lib/paniers';

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
  image?: string;
  /** Basculé par le commerçant quand le plat n'est plus servi. */
  isAvailable?: boolean;
  /** La question posée : « Type de pâtes », « Taille ». */
  variantLabel?: string | null;
  variants?: Declinaison[];
}

interface Restaurant {
  id: string;
  name: string;
  description: string;
  cuisine: string;
  rating: number;
  deliveryTime: number;
  deliveryFee: number;
  address: string;
  isOpen: boolean;
  products: Product[];
  /**
   * Le menu groupé par catégorie, dans l'ordre voulu par le commerçant.
   * La page n'affichait que la liste à plat : les catégories créées côté
   * commerçant n'apparaissaient nulle part.
   */
  menu: Record<string, Product[]>;
}


const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function RestaurantDetailPage({ params }: { params: { id: string } }) {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<LignePanier[]>([]);
  // Les paniers laissés chez d'autres commerces : ils attendent leur tour.
  const [ailleurs, setAilleurs] = useState<PanierBoutique[]>([]);
  // La déclinaison retenue pour chaque plat, avant l'ajout au panier.
  const [choix, setChoix] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchRestaurant();
    loadCart();
  }, [params.id]);

  // Le menu évolue pendant que le client le lit : un plat peut passer en
  // épuisé à tout moment.
  useStoreLive(params.id as string, ({ productId, isAvailable }) => {
    setRestaurant((precedent) =>
      precedent
        ? {
            ...precedent,
            products: precedent.products.map((produit) =>
              produit.id === productId ? { ...produit, isAvailable } : produit
            ),
            menu: Object.fromEntries(
              Object.entries(precedent.menu).map(([categorie, produits]) => [
                categorie,
                produits.map((produit) =>
                  produit.id === productId ? { ...produit, isAvailable } : produit
                ),
              ])
            ),
          }
        : precedent
    );

    // Un plat devenu indisponible ne doit pas rester dans le panier — ni dans
    // celui enregistré, sinon il revient au prochain chargement.
    if (!isAvailable) {
      setCart((panier) => {
        const sansLeProduit = panier.filter((ligne) => ligne.productId !== productId);

        // Enregistré aussi, sinon le plat épuisé revient au prochain
        // chargement.
        if (sansLeProduit.length !== panier.length) {
          enregistrerPanier(params.id, sansLeProduit);
        }

        return sansLeProduit;
      });
    }
  },
  // Les déclinaisons changent aussi pendant la lecture du menu.
  ({ productId, variantes }) => {
    const lues = variantes.map((variante) => ({
      id: variante.id,
      label: variante.label,
      prixEffectif: variante.prixEffectif,
      isAvailable: variante.isAvailable,
    }));

    const remplacer = (produit: Product) =>
      produit.id === productId ? { ...produit, variants: lues } : produit;

    setRestaurant((precedent) =>
      precedent
        ? {
            ...precedent,
            products: precedent.products.map(remplacer),
            menu: Object.fromEntries(
              Object.entries(precedent.menu).map(([categorie, produits]) => [
                categorie,
                produits.map(remplacer),
              ])
            ),
          }
        : precedent
    );

    // Une déclinaison retenue ou déjà au panier mais devenue indisponible
    // ferait échouer la commande au dernier moment.
    const indisponibles = new Set(
      lues.filter((variante) => !variante.isAvailable).map((variante) => variante.id)
    );

    setChoix((precedent) =>
      indisponibles.has(precedent[productId] || '')
        ? Object.fromEntries(Object.entries(precedent).filter(([cle]) => cle !== productId))
        : precedent
    );

    setCart((panier) => {
      const garde = panier.filter(
        (ligne) => !(ligne.variantId && indisponibles.has(ligne.variantId))
      );

      if (garde.length !== panier.length) {
        enregistrerPanier(params.id, garde);
      }

      return garde;
    });
  });

  const fetchRestaurant = async () => {
    try {
      const res = await fetch(`${API_URL}/api/client/stores/${params.id}`, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) throw new Error('Erreur');
      const data = await res.json();
      const boutique = data.data || data.store || data;

      setRestaurant({
        id: boutique.id,
        name: boutique.name,
        description: boutique.description || '',
        cuisine: boutique.city || '',
        rating: Number(boutique.rating || 0),
        deliveryTime: 30,
        deliveryFee: Number(boutique.deliveryCost || 0),
        address: [boutique.address, boutique.city].filter(Boolean).join(', '),
        isOpen: boutique.isOpen,
        menu: Object.fromEntries(
          Object.entries(boutique.menu || {}).map(([categorie, produits]) => [
            categorie,
            (produits as any[]).map((produit) => ({
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
            })),
          ])
        ),
        products: (boutique.products || []).map((produit: any) => ({
          id: produit.id,
          name: produit.name,
          description: produit.description || '',
          price: Number(produit.price || 0),
          // Recopier les produits champ par champ laissait cette information
          // au bord de la route : le client voyait les plats épuisés comme
          // les autres et pouvait les commander.
          isAvailable: produit.isAvailable !== false,
          variantLabel: produit.variantLabel || null,
          variants: (produit.variants || []).map((variante: any) => ({
            id: variante.id,
            label: variante.label,
            prixEffectif: Number(variante.price ?? produit.price),
            isAvailable: variante.isAvailable !== false,
          })),
        })),
      });
    } catch (err) {
      console.error('Erreur:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadCart = () => {
    // Le panier de cette boutique, et seulement celui-là.
    setCart(lirePanier(params.id));
    setAilleurs(autresPaniers(params.id));
  };

  const saveCart = (lignes: LignePanier[]) => {
    setCart(lignes);
    enregistrerPanier(params.id, lignes, restaurant?.name);
  };

  const addToCart = (product: Product) => {
    // Le bouton est désactivé, mais une page restée ouverte peut avoir une
    // version périmée du menu : on refuse aussi ici.
    if (product.isAvailable === false) return;

    const declinaisons = product.variants || [];
    const choisie = declinaisons.find((v) => v.id === choix[product.id]);

    // Un plat qui se décline ne part pas au panier sans choix : la cuisine ne
    // saurait pas quoi préparer, et le serveur refuserait la commande.
    if (declinaisons.length > 0 && (!choisie || !choisie.isAvailable)) return;

    const cle = cleDeLigne(product.id, choisie?.id);
    const existant = cart.find((item) => cleDeLigne(item.productId, item.variantId) === cle);

    if (existant) {
      saveCart(
        cart.map((item) =>
          cleDeLigne(item.productId, item.variantId) === cle
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
      return;
    }

    saveCart([
      ...cart,
      {
        productId: product.id,
        name: product.name,
        description: product.description,
        // Le prix mémorisé est celui de la déclinaison choisie.
        price: choisie ? choisie.prixEffectif : product.price,
        quantity: 1,
        variantId: choisie?.id,
        variantNom: choisie?.label,
      },
    ]);
  };

  const updateQuantity = (cle: string, quantity: number) => {
    if (quantity <= 0) {
      saveCart(cart.filter((item) => cleDeLigne(item.productId, item.variantId) !== cle));
      return;
    }

    saveCart(
      cart.map((item) =>
        cleDeLigne(item.productId, item.variantId) === cle ? { ...item, quantity } : item
      )
    );
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl mb-4">Restaurant non trouvé</p>
          <Link href="/restaurants" className="text-green-400 hover:text-green-300">
            Retour à la liste
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header avec info resto */}
      <div className="bg-gradient-to-b from-green-600 to-gray-900 pb-8">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <Link
            href="/restaurants"
            className="inline-flex items-center gap-2 text-green-200 hover:text-white mb-6"
          >
            <ArrowLeft size={20} />
            Retour
          </Link>

          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-4xl font-bold mb-2">{restaurant.name}</h1>

              {/* Fermée, la boutique disparaissait de la liste : le client
                  croyait le commerce parti. Elle reste consultable, et le dit. */}
              {!restaurant.isOpen && (
                <p
                  role="status"
                  className="mb-4 inline-block rounded-lg border border-amber-700/50 bg-amber-900/30 px-3 py-2 text-sm text-amber-200"
                >
                  Momentanément indisponible — vous pouvez consulter le menu, mais pas commander
                  pour le moment.
                </p>
              )}

              <p className="text-green-100 mb-4">{restaurant.description}</p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Star size={18} className="text-yellow-500" />
                  <span>{restaurant.rating.toFixed(1)} / 5</span>
                </div>

                <div className="flex items-center gap-2">
                  <Clock size={18} />
                  <span>{restaurant.deliveryTime} min</span>
                </div>

                <div className="flex items-center gap-2">
                  <MapPin size={18} />
                  <span>{restaurant.address}</span>
                </div>

                <div>
                  <span className="px-3 py-1 bg-green-600 rounded-full text-xs font-medium">
                    {restaurant.cuisine}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Menu */}
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-bold mb-6">Menu</h2>

            {Object.keys(restaurant.menu).length > 0 ? (
              <div className="space-y-8">
                {Object.entries(restaurant.menu).map(([categorie, produits]) => (
                  <section key={categorie}>
                    {/* Les catégories du commerçant structurent le menu ; sans
                        elles, tout arrivait en une seule liste. */}
                    <h3 className="text-xl font-bold mb-3 pb-2 border-b border-gray-700">
                      {categorie}
                    </h3>

                    <div className="space-y-4">
                      {produits.map((product) => {
                        // Un plat épuisé reste affiché : le masquer laisserait
                        // le client chercher en vain ce qu'il commande
                        // d'habitude.
                        const epuise = product.isAvailable === false;

                        // Un plat qui se décline attend un choix avant d'aller
                        // au panier.
                        const declinaisons = product.variants || [];
                        const choisie = declinaisons.find((v) => v.id === choix[product.id]);
                        const prixAffiche = choisie ? choisie.prixEffectif : product.price;
                        const bloque =
                          epuise ||
                          (declinaisons.length > 0 && (!choisie || !choisie.isAvailable));

                        return (
                          <div
                            key={product.id}
                            className={`bg-gray-800 rounded-lg p-4 flex items-start justify-between transition ${
                              epuise ? 'opacity-60' : 'hover:bg-gray-750'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                {/* Un cran sous le titre de catégorie : le plan
                                    du document reste lisible. */}
                                <h4 className="font-bold text-lg">{product.name}</h4>
                                {epuise && (
                                  <span className="px-2 py-0.5 rounded border border-red-500/50 bg-red-500/15 text-red-300 text-xs font-semibold uppercase tracking-wide">
                                    Épuisé
                                  </span>
                                )}
                              </div>
                              <p className="text-gray-400 text-sm mb-2">{product.description}</p>
                              <p
                                className={`font-bold ${epuise ? 'text-gray-500' : 'text-green-400'}`}
                              >
                                {euro(prixAffiche)}
                              </p>

                              {declinaisons.length > 0 && (
                                <div className="mt-3">
                                  {product.variantLabel && (
                                    <p className="text-xs text-gray-400 mb-1.5">
                                      {product.variantLabel}
                                    </p>
                                  )}

                                  <div
                                    role="radiogroup"
                                    aria-label={product.variantLabel || `Déclinaisons de ${product.name}`}
                                    className="flex flex-wrap gap-2"
                                  >
                                    {declinaisons.map((declinaison) => {
                                      const retenue = choix[product.id] === declinaison.id;

                                      return (
                                        <button
                                          key={declinaison.id}
                                          type="button"
                                          role="radio"
                                          aria-checked={retenue}
                                          disabled={!declinaison.isAvailable || epuise}
                                          onClick={() =>
                                            setChoix((precedent) => ({
                                              ...precedent,
                                              [product.id]: declinaison.id,
                                            }))
                                          }
                                          title={
                                            declinaison.isAvailable
                                              ? undefined
                                              : `${declinaison.label} n'est plus disponible`
                                          }
                                          className={`px-3 py-1 rounded-full border text-sm transition ${
                                            !declinaison.isAvailable || epuise
                                              ? 'border-gray-700 text-gray-600 line-through cursor-not-allowed'
                                              : retenue
                                                ? 'border-green-500 bg-green-500/20 text-green-300'
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

                                  {!choisie && !epuise && (
                                    <p className="text-xs text-amber-300 mt-1.5">
                                      Choisissez une option pour commander.
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>

                            <button
                              onClick={() => addToCart(product)}
                              disabled={bloque}
                              aria-label={`Ajouter ${product.name} au panier`}
                              className={`ml-4 p-2 rounded-lg transition ${
                                bloque
                                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                  : 'bg-green-600 hover:bg-green-700'
                              }`}
                              title={
                                epuise
                                  ? 'Ce plat n\'est plus disponible'
                                  : bloque
                                    ? `Choisissez d'abord : ${product.variantLabel || 'une option'}`
                                    : 'Ajouter au panier'
                              }
                            >
                              <Plus size={20} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">Aucun produit disponible</p>
            )}
          </div>

          {/* Panier */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800 rounded-lg p-6 sticky top-6">
              <div className="flex items-center gap-2 mb-4">
                <ShoppingCart size={24} />
                <h3 className="text-xl font-bold">Panier</h3>
                {cartCount > 0 && (
                  <span className="ml-auto bg-green-600 text-white text-sm font-bold px-2 py-1 rounded-full">
                    {cartCount}
                  </span>
                )}
              </div>

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
                      <li key={autre.storeId}>
                        <Link
                          href={`/restaurant/${autre.storeId}`}
                          className="text-xs text-amber-300 hover:text-amber-200 underline"
                        >
                          {autre.storeName || 'Une autre boutique'} —{' '}
                          {autre.lignes.reduce((somme, ligne) => somme + ligne.quantity, 0)} article
                          {autre.lignes.reduce((somme, ligne) => somme + ligne.quantity, 0) > 1
                            ? 's'
                            : ''}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {cart.length === 0 ? (
                <p className="text-gray-400 py-8 text-center">Votre panier est vide</p>
              ) : (
                <>
                  <div className="space-y-3 mb-6 pb-6 border-b border-gray-700">
                    {cart.map((item) => {
                      const cle = cleDeLigne(item.productId, item.variantId);

                      return (
                        <div key={cle} className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">
                              {item.name}
                              {/* Sans le nom de la déclinaison, deux lignes du
                                  même plat seraient indistinguables. */}
                              {item.variantNom && (
                                <span className="text-gray-400"> — {item.variantNom}</span>
                              )}
                            </p>
                            <p className="text-gray-400 text-xs">{euro(item.price)}</p>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => updateQuantity(cle, item.quantity - 1)}
                              aria-label={`Retirer un ${item.name}`}
                              className="p-1 hover:bg-gray-700 rounded"
                            >
                              <Minus size={16} />
                            </button>
                            <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(cle, item.quantity + 1)}
                              aria-label={`Ajouter un ${item.name}`}
                              className="p-1 hover:bg-gray-700 rounded"
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Frais livraison */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm text-gray-400">
                      <span>Sous-total</span>
                      <span>{euro(total)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-400">
                      <span>Frais livraison</span>
                      <span>{euro(restaurant.deliveryFee)}</span>
                    </div>
                  </div>

                  <div className="border-t border-gray-700 pt-4 mb-4">
                    <div className="flex justify-between font-bold text-lg">
                      <span>Total</span>
                      <span className="text-green-400">
                        {euro(total + restaurant.deliveryFee)}
                      </span>
                    </div>
                  </div>

                  {/* Sans la boutique, la page de commande visait un
                      identifiant écrit en dur : la commande partait chez un
                      autre commerce. */}
                  {restaurant.isOpen ? (
                    <Link
                      href={`/checkout?boutique=${params.id}`}
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition block text-center"
                    >
                      Passer la commande
                    </Link>
                  ) : (
                    <p className="w-full rounded-lg bg-gray-700 py-3 px-4 text-center text-sm text-amber-300">
                      Commerce momentanément indisponible
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
