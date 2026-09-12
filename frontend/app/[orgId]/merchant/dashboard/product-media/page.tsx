"use client";

import { useState } from "react";
import { Image as ImageIcon, Trash2, GripVertical } from "lucide-react";

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

export default function ProductMediaPage({
  params,
}: {
  params: { orgId: string };
}) {
  const [productId, setProductId] = useState("");
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaAlt, setMediaAlt] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [draggedItem, setDraggedItem] = useState<string | null>(null);

  const storeId = params.orgId;

  const fetchMedia = async () => {
    if (!productId) {
      setError("Veuillez entrer un ID de produit");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/product-media/${storeId}/${productId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!res.ok) throw new Error("Erreur lors du chargement des médias");
      const data: MediaResponse = await res.json();
      setMedia(data.data.sort((a, b) => a.displayOrder - b.displayOrder));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur s'est produite");
    } finally {
      setLoading(false);
    }
  };

  const addMedia = async () => {
    if (!mediaUrl) {
      setError("L'URL du média est requise");
      return;
    }

    try {
      const res = await fetch(`/api/product-media/${storeId}/${productId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          url: mediaUrl,
          alt: mediaAlt,
          type: mediaType,
        }),
      });

      if (!res.ok) throw new Error("Erreur lors de l'ajout du média");
      fetchMedia();
      setMediaUrl("");
      setMediaAlt("");
      setMediaType("image");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur s'est produite");
    }
  };

  const deleteMedia = async (mediaId: string) => {
    try {
      const res = await fetch(`/api/product-media/${storeId}/${mediaId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!res.ok) throw new Error("Erreur lors de la suppression");
      fetchMedia();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur s'est produite");
    }
  };

  const reorderMedia = async (newOrder: Media[]) => {
    const mediaOrder = newOrder.map((m) => m.id);
    try {
      const res = await fetch(
        `/api/product-media/${storeId}/${productId}/reorder`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({ mediaOrder }),
        }
      );

      if (!res.ok) throw new Error("Erreur lors de la réorganisation");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur s'est produite");
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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ImageIcon className="w-8 h-8" />
          Médias des Produits
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Gérez les images et vidéos de vos produits
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-100 text-red-700 rounded-lg dark:bg-red-900 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Charger un média
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              ID du Produit
            </label>
            <input
              type="text"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder="Entrez l'ID du produit"
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          {productId && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  URL du Média
                </label>
                <input
                  type="url"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Texte Alternatif
                </label>
                <input
                  type="text"
                  value={mediaAlt}
                  onChange={(e) => setMediaAlt(e.target.value)}
                  placeholder="Description du média"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Type de Média
                </label>
                <select
                  value={mediaType}
                  onChange={(e) => setMediaType(e.target.value as "image" | "video")}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  <option value="image">Image</option>
                  <option value="video">Vidéo</option>
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={addMedia}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
                >
                  Ajouter le Média
                </button>
                <button
                  onClick={fetchMedia}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
                >
                  Charger les Médias
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
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Aucun média pour ce produit</p>
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
              className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden cursor-move hover:shadow-lg transition"
            >
              <div className="relative aspect-square bg-gray-100 dark:bg-gray-700">
                {item.type === "image" ? (
                  <img
                    src={item.url}
                    alt={item.alt || "Produit"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video
                    src={item.url}
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute top-2 left-2 flex items-center gap-2">
                  <GripVertical className="w-4 h-4 bg-gray-900 bg-opacity-50 text-white p-1 rounded" />
                  <span className="px-2 py-1 bg-gray-900 bg-opacity-50 text-white text-xs rounded">
                    {item.type}
                  </span>
                </div>
              </div>
              <div className="p-3">
                {item.alt && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                    {item.alt}
                  </p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  Ordre: {item.displayOrder}
                </p>
                <button
                  onClick={() => deleteMedia(item.id)}
                  className="mt-2 w-full p-2 bg-red-100 text-red-700 rounded hover:bg-red-200 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
