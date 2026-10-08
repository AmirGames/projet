"use client";

import { useState, useEffect } from "react";
import { Image as ImageIcon, Trash2, GripVertical } from "lucide-react";

import { useCurrentStore } from "@/lib/current-store";
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Media {
  id: string;
  url: string;
  alt?: string;
  type: "image" | "video";
  displayOrder: number;
}

interface MediaResponse {
  data: Media[];
}

export default function ProductMediaPage() {
  const t = useTranslations('merchantproductmedia');
  const [productId, setProductId] = useState("");
  const [produits, setProduits] = useState<{ id: string; name: string }[]>([]);

  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaAlt, setMediaAlt] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [draggedItem, setDraggedItem] = useState<string | null>(null);

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

  const fetchMedia = async () => {
    if (!productId) {
      setError(t('saisirId'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/product-media/${storeId}/${productId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });

      if (!res.ok) throw new Error(t('erreurChargement'));
      const data: MediaResponse = await res.json();
      setMedia(data.data.sort((a, b) => a.displayOrder - b.displayOrder));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setLoading(false);
    }
  };

  const addMedia = async () => {
    if (!mediaUrl) {
      setError(t('urlRequise'));
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/product-media/${storeId}/${productId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: JSON.stringify({
          url: mediaUrl,
          alt: mediaAlt,
          type: mediaType,
        }),
      });

      if (!res.ok) throw new Error(t('erreurAjout'));
      fetchMedia();
      setMediaUrl("");
      setMediaAlt("");
      setMediaType("image");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    }
  };

  const deleteMedia = async (mediaId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/product-media/${storeId}/${mediaId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });

      if (!res.ok) throw new Error(t('deleteError'));
      fetchMedia();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    }
  };

  const reorderMedia = async (newOrder: Media[]) => {
    const mediaOrder = newOrder.map((m) => m.id);
    try {
      const res = await fetch(
        `${API_URL}/api/product-media/${storeId}/${productId}/reorder`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
          },
          body: JSON.stringify({ mediaOrder }),
        }
      );

      if (!res.ok) throw new Error(t('erreurOrdre'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    }
  };

  const handleDragStart = (mediaId: string) => {
    setDraggedItem(mediaId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetId: string) => {
    if (!draggedItem || draggedItem === targetId) return;

    const draggedIndex = media.findIndex((m) => m.id === draggedItem);
    const targetIndex = media.findIndex((m) => m.id === targetId);

    const newMedia = [...media];
    [newMedia[draggedIndex], newMedia[targetIndex]] = [
      newMedia[targetIndex],
      newMedia[draggedIndex],
    ];

    setMedia(newMedia);
    reorderMedia(newMedia);
    setDraggedItem(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <ImageIcon className="w-8 h-8" />
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

      <div className="bg-white p-6 rounded-lg shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t('charger')}
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('produit')}
            </label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="">{t('choisirProduit')}</option>
              {produits.map((produit) => (
                <option key={produit.id} value={produit.id}>
                  {produit.name}
                </option>
              ))}
            </select>
          </div>

          {productId && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('url')}
                </label>
                <input
                  type="url"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('texteAlt')}
                </label>
                <input
                  type="text"
                  value={mediaAlt}
                  onChange={(e) => setMediaAlt(e.target.value)}
                  placeholder={t('descriptionMedia')}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('type')}
                </label>
                <select
                  value={mediaType}
                  onChange={(e) => setMediaType(e.target.value as "image" | "video")}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="image">{t('image')}</option>
                  <option value="video">{t('video')}</option>
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={addMedia}
                  className="bg-orange-600 text-white hover:bg-orange-700 flex-1 px-4 py-2 rounded-lg"
                >
                  {t('ajouter')}
                </button>
                <button
                  onClick={fetchMedia}
                  className="bg-orange-600 text-white hover:bg-orange-700 flex-1 px-4 py-2 rounded-lg"
                >
                  {t('chargerMedias')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : media.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <ImageIcon className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400">{t('aucun')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {media.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => handleDragStart(item.id)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(item.id)}
              className="bg-white rounded-lg shadow-sm overflow-hidden cursor-move hover:shadow-lg transition"
            >
              <div className="relative aspect-square bg-gray-100">
                {item.type === "image" ? (
                  <img
                    src={item.url}
                    alt={item.alt || t('produit')}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video
                    src={item.url}
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute top-2 left-2 flex items-center gap-2">
                  <GripVertical className="w-4 h-4 bg-white ring-1 ring-gray-200 bg-opacity-50 text-gray-900 p-1 rounded-sm" />
                  <span className="px-2 py-1 bg-white ring-1 ring-gray-200 bg-opacity-50 text-gray-900 text-xs rounded-sm">
                    {item.type}
                  </span>
                </div>
              </div>
              <div className="p-3">
                {item.alt && (
                  <p className="text-sm text-gray-400 truncate">
                    {item.alt}
                  </p>
                )}
                <p className="text-xs text-gray-500">
                  {t("ordre", { n: item.displayOrder })}
                </p>
                <button
                  onClick={() => deleteMedia(item.id)}
                  className="mt-2 w-full p-2 bg-red-100 text-red-700 rounded-sm hover:bg-red-200 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('supprimer')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
