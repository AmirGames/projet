"use client";

import { useState, useEffect } from "react";
import { Search } from "lucide-react";

import { useCurrentStore } from "@/lib/current-store";
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

export default function ProductSeoPage() {
  const t = useTranslations('merchantproductseo');
  const [productId, setProductId] = useState("");
  const [produits, setProduits] = useState<{ id: string; name: string }[]>([]);

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

  const { storeId } = useCurrentStore();

  // Le produit choisi appartient à la boutique : il s'efface quand elle change.
  const [boutiqueDuProduit, setBoutiqueDuProduit] = useState(storeId);
  if (storeId !== boutiqueDuProduit) {
    setBoutiqueDuProduit(storeId);
    if (storeId) setProductId("");
  }

  // Saisir un identifiant de produit à la main était impraticable : on propose
  // la liste des produits de la boutique sélectionnée.
  useEffect(() => {
    if (!storeId) return;

    const charger = async () => {
      try {
        const res = await fetch(`${API_URL}/api/products?storeId=${storeId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("accessToken")}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setProduits(data.products || []);
      } catch {
        // La page reste utilisable : l'identifiant peut être saisi autrement.
      }
    };

    charger();
  }, [storeId]);

  const fetchSeo = async () => {
    if (!productId) {
      setError(t('saisirId'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/product-seo/${storeId}/${productId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });

      if (!res.ok) throw new Error(t('erreurChargement'));
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
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setLoading(false);
    }
  };

  const updateSeo = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/product-seo/${storeId}/${productId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error(t('updateError'));
      setSuccess(t('misAJour'));
      setError("");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
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
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Search className="w-8 h-8" />
          {t('titre')}
        </h1>
        <p className="text-gray-400 mt-1">
          {t('sousTitre')}
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-100 text-green-700 rounded-lg">
          {success}
        </div>
      )}

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t('selectionner')}
        </h2>
        <div className="flex gap-2">
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-lg"
          >
            <option value="">{t('choisirProduit')}</option>
            {produits.map((produit) => (
              <option key={produit.id} value={produit.id}>
                {produit.name}
              </option>
            ))}
          </select>
          <button
            onClick={fetchSeo}
            disabled={loading}
            className="bg-orange-600 text-white hover:bg-orange-700 px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {t('charger')}
          </button>
        </div>
      </div>

      {loading && productId ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : productId ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {t('metadonnees')}
            </h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('titreMeta')}
              </label>
              <input
                type="text"
                name="metaTitle"
                value={formData.metaTitle}
                onChange={handleInputChange}
                placeholder={t('titrePlaceholder')}
                maxLength={60}
                className="w-full px-3 py-2 border rounded-lg"
              />
              <p className="text-xs text-gray-500 mt-1">
                {formData.metaTitle.length}/60
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('descriptionMeta')}
              </label>
              <textarea
                name="metaDescription"
                value={formData.metaDescription}
                onChange={handleInputChange}
                placeholder={t('descriptionPlaceholder')}
                maxLength={160}
                rows={3}
                className="w-full px-3 py-2 border rounded-lg"
              />
              <p className="text-xs text-gray-500 mt-1">
                {formData.metaDescription.length}/160
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('motsCles')}
              </label>
              <input
                type="text"
                name="metaKeywords"
                value={formData.metaKeywords}
                onChange={handleInputChange}
                placeholder={t('separes')}
                maxLength={200}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('slug')}
              </label>
              <input
                type="text"
                name="slug"
                value={formData.slug}
                onChange={handleInputChange}
                placeholder={t('slugPlaceholder')}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {t('openGraph')}
            </h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('imageOg')}
              </label>
              <input
                type="url"
                name="ogImage"
                value={formData.ogImage}
                onChange={handleInputChange}
                placeholder="https://example.com/image.jpg"
                className="w-full px-3 py-2 border rounded-lg"
              />
              {formData.ogImage && (
                <img
                  src={formData.ogImage}
                  alt={t('apercuOg')}
                  className="mt-2 w-full h-40 object-cover rounded-lg"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('descriptionOg')}
              </label>
              <textarea
                name="ogDescription"
                value={formData.ogDescription}
                onChange={handleInputChange}
                placeholder={t('descriptionOgPlaceholder')}
                maxLength={200}
                rows={3}
                className="w-full px-3 py-2 border rounded-lg"
              />
              <p className="text-xs text-gray-500 mt-1">
                {formData.ogDescription.length}/200
              </p>
            </div>

            <button
              onClick={updateSeo}
              disabled={loading}
              className="bg-orange-600 text-white hover:bg-orange-700 w-full px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {t('enregistrer')}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Search className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400">
            {t('selectionnez')}
          </p>
        </div>
      )}
    </div>
  );
}
