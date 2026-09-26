"use client";

import { useParams } from "next/navigation";
import { useState, useCallback } from "react";
import { Tag, Plus, Trash2, Edit2 } from "lucide-react";
import { useTranslations } from 'next-intl';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ProductTag {
  id: string;
  name: string;
  description?: string;
  color?: string;
  slug?: string;
  productIds?: string[];
}

interface TagsResponse {
  data: ProductTag[];
  total: number;
  skip: number;
  take: number;
}

export default function ProductTagPage() {
  const params = useParams<{ orgId: string }>();
  const t = useTranslations('common');
  const [tags, setTags] = useState<ProductTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [skip, setSkip] = useState(0);
  const [total, setTotal] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    color: "#3B82F6",
  });

  const storeId = params.orgId;
  const take = 20;

  const fetchTags = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        skip: skip.toString(),
        take: take.toString(),
      });

      const res = await fetch(`${API_URL}/api/product-tags/${storeId}?${query}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });

      if (!res.ok) throw new Error("Erreur lors du chargement des étiquettes");
      const data: TagsResponse = await res.json();
      setTags(data.data);
      setTotal(data.total);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur s'est produite");
    } finally {
      setLoading(false);
    }
  }, [skip, storeId]);

  useEffectChargement(() => {
    fetchTags();
  }, [skip, fetchTags]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      color: "#3B82F6",
    });
    setEditingId(null);
  };

  const openModal = (tag?: ProductTag) => {
    if (tag) {
      setFormData({
        name: tag.name,
        description: tag.description || "",
        color: tag.color || "#3B82F6",
      });
      setEditingId(tag.id);
    } else {
      resetForm();
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const saveTag = async () => {
    if (!formData.name.trim()) {
      setError("Le nom de l'étiquette est requis");
      return;
    }

    try {
      const url = editingId
        ? `/api/product-tags/${storeId}/${editingId}`
        : `/api/product-tags/${storeId}`;
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("Erreur lors de la sauvegarde");
      fetchTags();
      closeModal();
      setSuccess(editingId ? "Étiquette mise à jour" : "Étiquette créée");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur s'est produite");
    }
  };

  const deleteTag = async (tagId: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette étiquette ?"))
      return;

    try {
      const res = await fetch(`${API_URL}/api/product-tags/${storeId}/${tagId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });

      if (!res.ok) throw new Error("Erreur lors de la suppression");
      fetchTags();
      setSuccess("Étiquette supprimée");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur s'est produite");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Tag className="w-8 h-8" />
            Étiquettes de Produits
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gérez les étiquettes pour vos produits
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 dark:bg-green-700 dark:hover:bg-green-600"
        >
          <Plus className="w-5 h-5" />
          Nouvelle Étiquette
        </button>
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

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {editingId ? "Modifier l'étiquette" : "Créer une étiquette"}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nom
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Nom de l'étiquette"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Description"
                  rows={3}
                  maxLength={200}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Couleur
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    name="color"
                    value={formData.color}
                    onChange={handleInputChange}
                    className="w-12 h-10 border rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.color}
                    readOnly
                    className="flex-1 px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Annuler
              </button>
              <button
                onClick={saveTag}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : tags.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <Tag className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Aucune étiquette trouvée</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 hover:shadow-lg transition"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: tag.color || "#3B82F6" }}
                  />
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {tag.name}
                  </h3>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openModal(tag)}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition"
                    title={t('edit')}
                  >
                    <Edit2 className="w-4 h-4 text-blue-600" />
                  </button>
                  <button
                    onClick={() => deleteTag(tag.id)}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition"
                    title={t('delete')}
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </div>

              {tag.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {tag.description}
                </p>
              )}

              {tag.productIds && tag.productIds.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    {tag.productIds.length} produit{tag.productIds.length !== 1 ? "s" : ""}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Affichage {skip + 1} à {Math.min(skip + take, total)} sur {total}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setSkip(Math.max(0, skip - take))}
            disabled={skip === 0}
            className="px-3 py-1 border rounded-lg disabled:opacity-50 dark:border-gray-600"
          >
            Précédent
          </button>
          <button
            onClick={() => setSkip(skip + take)}
            disabled={skip + take >= total}
            className="px-3 py-1 border rounded-lg disabled:opacity-50 dark:border-gray-600"
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}
