"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  status: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [storeId, setStoreId] = useState("");
  const [loading, setLoading] = useState(true);
  const [newProduct, setNewProduct] = useState({
    sku: "",
    name: "",
    price: "",
    stock: "",
  });

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.push("/login");
      return;
    }

    // For demo, use the store from Jour 4
    const demoStoreId = "19c84158-7858-453f-9955-e95c01c4e895";
    setStoreId(demoStoreId);
    loadProducts(demoStoreId);
  }, [router]);

  const loadProducts = async (store: string) => {
    try {
      const response = await api.getProducts(store);
      setProducts(response.products || []);
    } catch (err) {
      console.error("Erreur:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("accessToken");

    if (!token) return;

    try {
      await api.createProduct(
        storeId,
        newProduct.sku,
        newProduct.name,
        parseFloat(newProduct.price),
        parseInt(newProduct.stock),
        token
      );

      // Reload products
      await loadProducts(storeId);
      setNewProduct({ sku: "", name: "", price: "", stock: "" });
    } catch (err) {
      console.error("Erreur:", err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg"
          >
            Déconnexion
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {/* Add Product Form */}
        <div className="bg-gray-800 p-6 rounded-lg mb-8">
          <h2 className="text-xl font-bold mb-4">Ajouter un produit</h2>
          <form onSubmit={handleAddProduct} className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="SKU"
              value={newProduct.sku}
              onChange={(e) =>
                setNewProduct({ ...newProduct, sku: e.target.value })
              }
              className="px-4 py-2 bg-gray-700 text-white rounded-lg"
              required
            />
            <input
              type="text"
              placeholder="Nom du produit"
              value={newProduct.name}
              onChange={(e) =>
                setNewProduct({ ...newProduct, name: e.target.value })
              }
              className="px-4 py-2 bg-gray-700 text-white rounded-lg"
              required
            />
            <input
              type="number"
              placeholder="Prix"
              value={newProduct.price}
              onChange={(e) =>
                setNewProduct({ ...newProduct, price: e.target.value })
              }
              className="px-4 py-2 bg-gray-700 text-white rounded-lg"
              required
            />
            <input
              type="number"
              placeholder="Stock"
              value={newProduct.stock}
              onChange={(e) =>
                setNewProduct({ ...newProduct, stock: e.target.value })
              }
              className="px-4 py-2 bg-gray-700 text-white rounded-lg"
              required
            />
            <button
              type="submit"
              className="col-span-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold"
            >
              Ajouter le produit
            </button>
          </form>
        </div>

        {/* Products List */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-4">Produits</h2>

          {loading ? (
            <p className="text-gray-400">Chargement...</p>
          ) : products.length === 0 ? (
            <p className="text-gray-400">Aucun produit</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="pb-3">SKU</th>
                    <th className="pb-3">Nom</th>
                    <th className="pb-3">Prix</th>
                    <th className="pb-3">Stock</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr
                      key={product.id}
                      className="border-b border-gray-700 hover:bg-gray-700"
                    >
                      <td className="py-3">{product.sku}</td>
                      <td className="py-3">{product.name}</td>
                      <td className="py-3">${product.price}</td>
                      <td className="py-3">{product.stock}</td>
                      <td className="py-3">
                        <span className="px-2 py-1 bg-green-600 rounded-full text-sm">
                          {product.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}