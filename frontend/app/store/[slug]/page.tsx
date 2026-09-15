'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ShoppingCart, MapPin, Phone, Clock, Star, AlertCircle, Check } from 'lucide-react';

import { euro } from '@/lib/format';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { useStoreLive } from '@/lib/use-store-live';

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
  createdAt: string;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  isAvailable: boolean;
  images: Array<{ url: string }>;
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
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  // Créneaux réellement proposables, déduits des horaires de la boutique.
  const [creneaux, setCreneaux] = useState<
    { date: string; libelle: string; creneaux: { valeur: string; libelle: string }[] }[]
  >([]);
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  const [checkoutForm, setCheckoutForm] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    deliveryType: 'DELIVERY' as 'PICKUP' | 'DELIVERY',
    deliveryAddress: '',
    deliveryCity: '',
    // Renseignées quand le client retient une suggestion d'adresse.
    deliveryLat: undefined as number | undefined,
    deliveryLng: undefined as number | undefined,
    pickupTime: '',
    notes: '',
  });

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
  });

  // Un champ d'heure libre laissait choisir 9 h alors que la boutique ouvre à
  // 11 h : la commande partait et personne n'était là pour la remettre.
  useEffect(() => {
    if (!store?.id || checkoutForm.deliveryType !== 'PICKUP') return;

    let annule = false;

    fetch(`${API_URL}/api/client/stores/${store.id}/pickup-slots`)
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => {
        if (!annule && donnees) setCreneaux(donnees.data || []);
      })
      .catch(() => undefined);

    return () => {
      annule = true;
    };
  }, [store?.id, checkoutForm.deliveryType]);

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

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
    } else {
      setCart(prev =>
        prev.map(item =>
          item.product.id === productId
            ? { ...item, quantity }
            : item
        )
      );
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + Number(item.product.price || 0) * item.quantity, 0);
  const cartServiceFee = cartTotal * 0.1;
  const cartGrandTotal = cartTotal + cartServiceFee;

  const handleCheckout = async () => {
    setCheckoutError('');

    if (!checkoutForm.customerName || !checkoutForm.customerEmail || !checkoutForm.customerPhone) {
      setCheckoutError('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (checkoutForm.deliveryType === 'DELIVERY' && (!checkoutForm.deliveryAddress || !checkoutForm.deliveryCity)) {
      setCheckoutError('Veuillez remplir l\'adresse de livraison');
      return;
    }

    if (checkoutForm.deliveryType === 'PICKUP' && !checkoutForm.pickupTime) {
      setCheckoutError('Veuillez sélectionner une heure de retrait');
      return;
    }

    if (cart.length === 0) {
      setCheckoutError('Votre panier est vide');
      return;
    }

    setSubmitting(true);

    try {
      if (!store) {
        setCheckoutError('Erreur: boutique non trouvée');
        return;
      }

      const orderData = {
        storeId: store.id,
        customerName: checkoutForm.customerName,
        customerEmail: checkoutForm.customerEmail,
        customerPhone: checkoutForm.customerPhone,
        deliveryType: checkoutForm.deliveryType,
        deliveryAddress: checkoutForm.deliveryAddress || undefined,
        deliveryCity: checkoutForm.deliveryCity || undefined,
        deliveryLat: checkoutForm.deliveryLat,
        deliveryLng: checkoutForm.deliveryLng,
        pickupTime: checkoutForm.pickupTime || undefined,
        notes: checkoutForm.notes || undefined,
        // L'API attend des euros (Decimal 10,2), pas des centimes.
        totalAmount: Number(cartGrandTotal.toFixed(2)),
        taxAmount: 0,
        feesAmount: Number(cartServiceFee.toFixed(2)),
        // Le détail du panier : sans lui la commande n'enregistrait qu'un
        // montant, et la facture comme le détail de commande restaient vides.
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          price: Number(item.product.price),
        })),
      };

      const response = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        const error = await response.json();
        setCheckoutError(error.error || 'Erreur lors de la création de la commande');
        return;
      }

      const orderResponse = await response.json();
      setOrderConfirmation({
        id: orderResponse.order.id,
        orderNumber: orderResponse.order.id.slice(-8).toUpperCase(),
      });

      setCart([]);
      setShowCheckout(false);
      setShowCart(false);
    } catch (error) {
      console.error('Checkout error:', error);
      setCheckoutError('Erreur de connexion. Veuillez réessayer.');
    } finally {
      setSubmitting(false);
    }
  };

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
              <span>Ouvert</span>
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
                              <p className="text-2xl font-bold text-red-400">{euro(product.price)}</p>
                              <p className="text-xs text-gray-500">
                                {product.isAvailable ? 'Disponible' : 'Épuisé'}
                              </p>
                            </div>
                          </div>

                          {/* Add to Cart Button */}
                          <button
                            onClick={() => addToCart(product)}
                            disabled={!product.isAvailable}
                            className={`w-full py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors ${
                              !product.isAvailable
                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                : 'bg-red-600 hover:bg-red-700 text-white'
                            }`}
                          >
                            <ShoppingCart size={18} />
                            Ajouter au panier
                          </button>
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

            {cart.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Votre panier est vide</p>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  {cart.map(item => (
                    <div key={item.product.id} className="bg-gray-700 rounded-lg p-4 space-y-2">
                      <h3 className="font-semibold">{item.product.name}</h3>
                      <div className="flex items-center justify-between">
                        <p className="text-red-400">{euro(item.product.price)}</p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                            className="w-6 h-6 bg-gray-600 hover:bg-gray-500 rounded text-sm"
                          >
                            −
                          </button>
                          <span className="w-8 text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                            className="w-6 h-6 bg-gray-600 hover:bg-gray-500 rounded text-sm"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="text-xs text-red-400 hover:text-red-300 w-full text-left"
                      >
                        Supprimer
                      </button>
                    </div>
                  ))}
                </div>

                {/* Cart Summary */}
                <div className="border-t border-gray-700 pt-4 space-y-3">
                  <div className="flex justify-between">
                    <span>Sous-total</span>
                    <span>{euro(cartTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Frais de service</span>
                    <span>{euro((cartTotal * 0.1))}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t border-gray-700 pt-3">
                    <span>Total</span>
                    <span>{euro(cartGrandTotal)}</span>
                  </div>

                  <button
                    onClick={() => setShowCheckout(true)}
                    className="w-full py-3 bg-red-600 hover:bg-red-700 rounded-lg font-bold transition-colors mt-4"
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
                onClick={() => {
                  setOrderConfirmation(null);
                  setCheckoutForm({
                    customerName: '',
                    customerEmail: '',
                    customerPhone: '',
                    deliveryType: 'DELIVERY',
                    deliveryAddress: '',
                    deliveryCity: '',
                    deliveryLat: undefined,
                    deliveryLng: undefined,
                    pickupTime: '',
                    notes: '',
                  });
                }}
                className="w-full py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors"
              >
                Retour à la boutique
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckout && !orderConfirmation && (
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

            <div className="p-6 space-y-6 max-h-96 overflow-y-auto">
              {checkoutError && (
                <div className="bg-red-600/20 border border-red-600/50 rounded-lg p-4 flex gap-3">
                  <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-red-400 text-sm">{checkoutError}</p>
                </div>
              )}

              {/* Customer Info */}
              <div className="space-y-4">
                <h3 className="font-bold text-lg">Vos Informations</h3>
                <div>
                  <label className="text-sm text-gray-400 block mb-2">Nom complet *</label>
                  <input
                    type="text"
                    value={checkoutForm.customerName}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, customerName: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                    placeholder="Jean Dupont"
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-400 block mb-2">Email *</label>
                  <input
                    type="email"
                    value={checkoutForm.customerEmail}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, customerEmail: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                    placeholder="jean@example.com"
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-400 block mb-2">Téléphone *</label>
                  <input
                    type="tel"
                    value={checkoutForm.customerPhone}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, customerPhone: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                    placeholder="+33 6 12 34 56 78"
                  />
                </div>
              </div>

              {/* Delivery Type */}
              <div className="space-y-4">
                <h3 className="font-bold text-lg">Mode de Livraison</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 bg-gray-700 rounded cursor-pointer hover:bg-gray-600 transition-colors">
                    <input
                      type="radio"
                      name="deliveryType"
                      value="DELIVERY"
                      checked={checkoutForm.deliveryType === 'DELIVERY'}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, deliveryType: e.target.value as any })}
                      className="w-4 h-4"
                    />
                    <div className="flex-1">
                      <p className="font-semibold">Livraison à domicile</p>
                      <p className="text-xs text-gray-400">Livraison à votre adresse</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-gray-700 rounded cursor-pointer hover:bg-gray-600 transition-colors">
                    <input
                      type="radio"
                      name="deliveryType"
                      value="PICKUP"
                      checked={checkoutForm.deliveryType === 'PICKUP'}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, deliveryType: e.target.value as any })}
                      className="w-4 h-4"
                    />
                    <div className="flex-1">
                      <p className="font-semibold">Retrait sur place</p>
                      <p className="text-xs text-gray-400">Récupérez votre commande à la boutique</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Delivery Address */}
              {checkoutForm.deliveryType === 'DELIVERY' && (
                <div className="space-y-4">
                  <h3 className="font-bold text-lg">Adresse de Livraison</h3>
                  <div>
                    <label className="text-sm text-gray-400 block mb-2">Adresse *</label>
                    <AddressAutocomplete
                      value={checkoutForm.deliveryAddress}
                      onChange={(valeur) =>
                        setCheckoutForm({
                          ...checkoutForm,
                          deliveryAddress: valeur,
                          // Taper par-dessus une suggestion retenue rendrait
                          // ses coordonnées fausses.
                          deliveryLat: undefined,
                          deliveryLng: undefined,
                        })
                      }
                      onSelect={(adresse) =>
                        setCheckoutForm({
                          ...checkoutForm,
                          deliveryAddress: adresse.street,
                          deliveryCity: adresse.city || checkoutForm.deliveryCity,
                          // Les coordonnées de l'adresse choisie étaient
                          // jetées : sans elles, le suivi ne peut afficher ni
                          // distance restante ni durée estimée.
                          deliveryLat: adresse.latitude ?? undefined,
                          deliveryLng: adresse.longitude ?? undefined,
                        })
                      }
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                      placeholder="123 rue de la Paix"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-gray-400 block mb-2">Ville *</label>
                    <input
                      type="text"
                      value={checkoutForm.deliveryCity}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, deliveryCity: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                      placeholder="Paris"
                    />
                  </div>
                </div>
              )}

              {/* Pickup Time */}
              {checkoutForm.deliveryType === 'PICKUP' && (
                <div className="space-y-4">
                  <h3 className="font-bold text-lg">Heure de Retrait</h3>
                  <div>
                    <label htmlFor="creneau" className="text-sm text-gray-400 block mb-2">
                      Sélectionnez une heure *
                    </label>

                    {creneaux.length === 0 ? (
                      <p className="text-sm text-amber-300 bg-amber-900/20 border border-amber-700/40 rounded px-3 py-2">
                        Aucun créneau de retrait disponible pour les prochains jours.
                        Choisissez la livraison, ou revenez plus tard.
                      </p>
                    ) : (
                      <select
                        id="creneau"
                        value={checkoutForm.pickupTime}
                        onChange={(e) =>
                          setCheckoutForm({ ...checkoutForm, pickupTime: e.target.value })
                        }
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                      >
                        <option value="">Choisir un créneau</option>
                        {creneaux.map((jour) => (
                          <optgroup key={jour.date} label={jour.libelle}>
                            {jour.creneaux.map((creneau) => (
                              <option key={creneau.valeur} value={creneau.valeur}>
                                {creneau.libelle}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-4">
                <h3 className="font-bold text-lg">Notes (Optionnel)</h3>
                <textarea
                  value={checkoutForm.notes}
                  onChange={(e) => setCheckoutForm({ ...checkoutForm, notes: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500 h-20"
                  placeholder="Instructions spéciales, allergies, etc..."
                />
              </div>

              {/* Order Summary */}
              <div className="bg-gray-700 rounded-lg p-4 space-y-2">
                <h3 className="font-bold mb-3">Résumé de la Commande</h3>
                <div className="flex justify-between text-sm">
                  <span>Sous-total</span>
                  <span>{euro(cartTotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Frais de service (10%)</span>
                  <span>{euro(cartServiceFee)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg border-t border-gray-600 pt-2">
                  <span>Total</span>
                  <span className="text-red-400">{euro(cartGrandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="border-t border-gray-700 p-6 flex gap-3">
              <button
                onClick={() => setShowCheckout(false)}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded font-semibold transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleCheckout}
                disabled={submitting}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 rounded font-semibold transition-colors disabled:opacity-50"
              >
                {submitting ? 'Traitement...' : 'Confirmer la Commande'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
