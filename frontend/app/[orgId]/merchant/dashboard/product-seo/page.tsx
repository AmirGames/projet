"use client";

import { useState } from "react";
import { Search } from "lucide-react";

interface ProductSeo {
  id: string;
  productId: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  slug?: string;
  ogImage?: string;
  ogDescription?: string;
}

export default function ProductSeoPage({
  params,
}: {
  params: { orgId: string };
}) {
  const [productId, setProductId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formData, setFormData] = useState({
    metaTitle: "",
    metaDescription: "",
    metaKeywords: "",
    slug: "",
    ogImage: "",
    ogDescription: "",
  });

  const storeId = params.orgId;

  const fetchSeo = async () => {
    if (!productId) {
      setError("Veuillez entrer un ID de produit");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/product-seo/${storeId}/${productId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!res.ok) throw new Error("Erreur lors du chargement du SEO");
      const data: ProductSeo = await res.json();
      setFormData({
        metaTitle: data.metaTitle || "",
        metaDescription: data.metaDescription || "",
        metaKeywords: data.metaKeywords || "",
        slug: data.slug || "",
        ogImage: data.ogImage || "",
        ogDescription: data.ogDescription || "",
      });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur s'est produite");
    } finally {
      setLoading(false);
    }
  };

  const updateSeo = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/product-seo/${storeId}/${productId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("Erreur lors de la mise à jour");
      setSuccess("SEO mis à jour avec succès");
      setError("");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur s'est produite");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Search className="w-8 h-8" />
          SEO du Produit
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Optimisez les métadonnées SEO et les balises Open Graph
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-100 text-red-700 rounded-lg dark:bg-red-900 dark:text-red-200">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-100 text-green-700 rounded-lg dark:bg-green-900 dark:text-green-200">
          {success}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Sélectionner un Produit
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            placeholder="Entrez l'ID du produit"
            className="flex-1 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <button
            onClick={fetchSeo}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-700 dark:hover:bg-blue-600"
          >
            Charger
          </button>
        </div>
      </div>

      {loading && productId ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : productId ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Métadonnées SEO
            </h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Titre Meta
              </label>
              <input
                type="text"
                name="metaTitle"
                value={formData.metaTitle}
                onChange={handleInputChange}
                placeholder="Titre de la page (60 caractères max)"
                maxLength={60}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {formData.metaTitle.length}/60
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description Meta
              </label>
              <textarea
                name="metaDescription"
                value={formData.metaDescription}
                onChange={handleInputChange}
                placeholder="Description (160 caractères max)"
                maxLength={160}
                rows={3}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {formData.metaDescription.length}/160
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Mots-clés
              </label>
              <input
                type="text"
                name="metaKeywords"
                value={formData.metaKeywords}
                onChange={handleInputChange}
                placeholder="Séparés par des virgules"
                maxLength={200}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Slug
              </label>
              <input
                type="text"
                name="slug"
                value={formData.slug}
                onChange={handleInputChange}
                placeholder="URL amicale (ex: mon-produit)"
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Open Graph
            </h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Image OG
              </label>
              <input
                type="url"
                name="ogImage"
                value={formData.ogImage}
                onChange={handleInputChange}
                placeholder="https://example.com/image.jpg"
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              {formData.ogImage && (
                <img
                  src={formData.ogImage}
                  alt="OG Preview"
                  className="mt-2 w-full h-40 object-cover rounded-lg"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description OG
              </label>
              <textarea
                name="ogDescription"
                value={formData.ogDescription}
                onChange={handleInputChange}
                placeholder="Description pour les réseaux sociaux"
                maxLength={200}
                rows={3}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {formData.ogDescription.length}/200
              </p>
            </div>

            <button
              onClick={updateSeo}
              disabled={loading}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 dark:bg-green-700 dark:hover:bg-green-600"
            >
              Enregistrer le SEO
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            Sélectionnez un produit pour modifier son SEO
          </p>
        </div>
      )}
    </div>
  );
}
