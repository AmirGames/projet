'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useState } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useEffectChargement } from '@/lib/use-effect-chargement';

interface Category {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export default function AdminCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCategory, setNewCategory] = useState({ name: '', description: '' });
  const [showForm, setShowForm] = useState(false);

  const fetchCategories = async () => {
    try {
      const storeId = localStorage.getItem('storeId') || '19c84158-7858-453f-9955-e95c01c4e895';
      const data = await apiClient.getCategories(storeId);
      setCategories(Array.isArray(data) ? data : data.categories || []);
    } catch (error) {
      signalerErreur('Erreur chargement catégories:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffectChargement(() => {
    fetchCategories();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const storeId = localStorage.getItem('storeId') || '19c84158-7858-453f-9955-e95c01c4e895';
      const token = localStorage.getItem('accessToken') || '';
      await apiClient.createCategory(storeId, newCategory.name, token);
      setNewCategory({ name: '', description: '' });
      setShowForm(false);
      fetchCategories();
    } catch (error) {
      signalerErreur('Erreur création:', error);
    }
  };

  const handleDelete = async (categoryId: string) => {
    if (confirm('Supprimer cette catégorie?')) {
      try {
        await apiClient.deleteCategory(categoryId);
        setCategories(categories.filter(c => c.id !== categoryId));
      } catch (error) {
        signalerErreur('Erreur suppression:', error);
      }
    }
  };

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Catégories</h1>
          <p className="text-gray-400 mt-1">{categories.length} catégories</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={20} />
          Nouvelle catégorie
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Nom</label>
              <input
                type="text"
                value={newCategory.name}
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                placeholder="Ex: Électronique"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea
                value={newCategory.description}
                onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                placeholder="Description de la catégorie"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                rows={3}
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded-lg transition-colors"
              >
                Créer
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded-lg transition-colors"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.length > 0 ? (
          categories.map((category) => (
            <div key={category.id} className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <h3 className="text-lg font-bold mb-2">{category.name}</h3>
              <p className="text-sm text-gray-400 mb-4">{category.description}</p>
              <div className="flex gap-2">
                <button className="flex-1 flex items-center justify-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 px-3 py-2 rounded-lg transition-colors">
                  <Edit size={16} />
                  Éditer
                </button>
                <button
                  onClick={() => handleDelete(category.id)}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 px-3 py-2 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                  Supprimer
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full text-center py-8 text-gray-400">
            Aucune catégorie
          </div>
        )}
      </div>
    </div>
  );
}