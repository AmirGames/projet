"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  description?: string;
}

interface Category {
  id: string;
  name: string;
}

export default function StorefrontPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  // Use the demo store from Jour 4
  const storeId = "19c84158-7858-453f-9955-e95c01c4e895";

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        api.getProducts(storeId),
        api.getCategories(storeId),
      ]);

      setProducts(productsRes.products || []);
      setCategories(categoriesRes.categories || []);
    } catch (err) {
      console.error("Erreur:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadData();
      return;
    }

    try {
      const result = await api.searchProducts(storeId, searchQuery);
      setProducts(result.results || []);
    } catch (err) {
      console.error("Erreur:", err);
    }
  };

  const handleAddToCart = (product: Product) => {
    setCart([...cart, product]);
    alert(`${product.name} ajouté au panier!`);
  };

  const totalPrice = cart.reduce((sum, p) => sum + p.price, 0);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Pizzeria Liège</h1>
            <div className="bg-blue-600 px-4 py-2 rounded-lg">
              🛒 Panier ({cart.length})
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Rechercher un produit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg"
            />
            <button
              onClick={handleSearch}
              className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg font-bold"
            >
              Chercher
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {/* Categories */}
        {categories.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">Catégories</h2>
            <div className="flex gap-3 flex-wrap">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700"
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Products Grid */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4">Nos produits</h2>

          {loading ? (
            <p className="text-gray-400">Chargement...</p>
          ) : products.length === 0 ? (
            <p className="text-gray-400">Aucun produit trouvé</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="bg-gray-800 p-6 rounded-lg hover:bg-gray-700 transition"
                >
                  <h3 className="text-lg font-bold mb-2">{product.name}</h3>
                  <p className="text-gray-400 text-sm mb-4">SKU: {product.sku}</p>
                  <p className="text-gray-400 mb-4">
                    {product.description || "Délicieux!"}
                  </p>

                  <div className="flex justify-between items-center mb-4">
                    <span className="text-2xl font-bold text-green-400">
                      €{product.price}
                    </span>
                    <span className="text-sm text-gray-400">
                      Stock: {product.stock}
                    </span>
                  </div>

                  <button
                    onClick={() => handleAddToCart(product)}
                    disabled={product.stock === 0}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg"
                  >
                    {product.stock === 0 ? "Rupture de stock" : "Ajouter au panier"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cart Summary */}
        {cart.length > 0 && (
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-bold mb-4">Résumé du panier</h2>
            <div className="space-y-2 mb-6">
              {cart.map((item, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>{item.name}</span>
                  <span>€{item.price}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-700 pt-4 mb-6">
              <div className="flex justify-between text-lg font-bold">
                <span>Total:</span>
                <span className="text-green-400">€{totalPrice.toFixed(2)}</span>
              </div>
            </div>

                        <button 
              onClick={() => {
                // Save cart to localStorage
                localStorage.setItem("cart", JSON.stringify(cart));
                router.push("/checkout");
              }}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg"
            >
              Passer la commande
            </button>
          </div>
        )}
      </div>
    </div>
  );
}