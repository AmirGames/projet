'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Edit2, Trash2, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Category {
  id: string;
  name: string;
  displayOrder: number;
  storeId: string;
  products?: Array<{ id: string; name: string }>;
  createdAt: string;
}

function SortableCategory({ category, onEdit, onDelete }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-red-600 transition-colors ${
        isDragging ? 'shadow-lg shadow-red-600' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400"
            title="Glissez pour réorganiser"
          >
            <GripVertical size={18} />
          </button>
          <div>
            <p className="font-bold text-lg">{category.name}</p>
            <p className="text-xs text-gray-500">
              {category.products?.length || 0} produit{category.products?.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onEdit(category)}
            className="p-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
            title="Modifier"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={() => onDelete(category.id)}
            className="p-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
            title="Supprimer"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {category.products && category.products.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <p className="text-xs text-gray-400 mb-2">Produits:</p>
          <div className="flex flex-wrap gap-2">
            {category.products.map((product: any) => (
              <span
                key={product.id}
                className="bg-gray-700 px-2 py-1 rounded text-xs text-gray-300"
              >
                {product.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CategoriesPage() {
  const params = useParams();
  const orgId = params?.orgId as string;

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
  });
  const [message, setMessage] = useState('');
  const [isReordering, setIsReordering] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (orgId) {
      fetchStoreAndCategories();
    }
  }, [orgId]);

  const fetchStoreAndCategories = async () => {
    try {
      const token = localStorage.getItem('accessToken');

      const storeResponse = await fetch(`${API_URL}/api/stores/${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (storeResponse.ok) {
        const storeData = await storeResponse.json();
        const fetchedStoreId = storeData.store?.id || storeData.id;
        setStoreId(fetchedStoreId);

        const categoriesResponse = await fetch(`${API_URL}/api/categories?orgId=${orgId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (categoriesResponse.ok) {
          const data = await categoriesResponse.json();
          const sorted = (data.categories || []).sort((a: Category, b: Category) => a.displayOrder - b.displayOrder);
          setCategories(sorted);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = categories.findIndex(c => c.id === active.id);
      const newIndex = categories.findIndex(c => c.id === over.id);

      const newOrder = arrayMove(categories, oldIndex, newIndex);
      setCategories(newOrder);

      setIsReordering(true);
      try {
        const token = localStorage.getItem('accessToken');
        const ordering = newOrder.map((cat, index) => ({
          id: cat.id,
          displayOrder: index,
        }));

        await fetch(`${API_URL}/api/categories/reorder`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ storeId, ordering }),
        });

        setMessage('✅ Catégories réorganisées');
        setTimeout(() => setMessage(''), 3000);
      } catch (error) {
        console.error('Error reordering:', error);
        setMessage('❌ Erreur lors de la réorganisation');
        fetchStoreAndCategories();
      } finally {
        setIsReordering(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setMessage('❌ Le nom de la catégorie est requis');
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');

      if (editingCategory) {
        const response = await fetch(`${API_URL}/api/categories/${editingCategory.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: formData.name }),
        });

        if (response.ok) {
          const updated = await response.json();
          setCategories(prev => prev.map(c => c.id === editingCategory.id ? updated.category : c));
          setMessage('✅ Catégorie mise à jour avec succès');
          resetForm();
          setTimeout(() => setMessage(''), 3000);
        } else {
          setMessage('❌ Erreur lors de la mise à jour');
        }
      } else {
        if (!storeId) {
          setMessage('❌ Erreur: store non trouvé');
          return;
        }

        const response = await fetch(`${API_URL}/api/categories`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            storeId,
            name: formData.name,
            displayOrder: categories.length,
          }),
        });

        if (response.ok) {
          const created = await response.json();
          setCategories(prev => [created.category, ...prev]);
          setMessage('✅ Catégorie créée avec succès');
          resetForm();
          setTimeout(() => setMessage(''), 3000);
        } else {
          setMessage('❌ Erreur lors de la création');
        }
      }
    } catch (error) {
      console.error('Error saving category:', error);
      setMessage('❌ Erreur lors de la sauvegarde');
    }
  };

  const handleDelete = async (categoryId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette catégorie?')) {
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/categories/${categoryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setCategories(prev => prev.filter(c => c.id !== categoryId));
        setMessage('✅ Catégorie supprimée');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('❌ Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      setMessage('❌ Erreur lors de la suppression');
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({ name: category.name });
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingCategory(null);
    setFormData({ name: '' });
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-900">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-400">Chargement des catégories...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">📂 Gestion des Catégories</h1>
            <p className="text-gray-400 mt-1">Organisez vos produits par catégories (glissez pour réorganiser)</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
            disabled={isReordering}
          >
            <Plus size={20} /> Ajouter Catégorie
          </button>
        </div>

        {message && (
          <div className={`p-4 rounded-lg ${
            message.includes('✅')
              ? 'bg-green-600/20 border border-green-600/50 text-green-400'
              : 'bg-red-600/20 border border-red-600/50 text-red-400'
          }`}>
            {message}
          </div>
        )}

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Total de catégories</p>
          <p className="text-3xl font-bold">{categories.length}</p>
        </div>

        <div className="space-y-3">
          {categories.length === 0 ? (
            <div className="text-center py-12 bg-gray-800 border border-gray-700 rounded-lg">
              <p className="text-gray-400">Aucune catégorie créée. Commencez à en créer une!</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={categories.map(c => c.id)}
                strategy={verticalListSortingStrategy}
                disabled={isReordering}
              >
                {categories.map(category => (
                  <SortableCategory
                    key={category.id}
                    category={category}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div className="bg-blue-600/20 border border-blue-600/50 rounded-lg p-4">
          <p className="text-blue-400 text-sm">
            💡 Les catégories aident à organiser votre catalogue. Glissez les catégories pour les réorganiser.
          </p>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg max-w-md w-full">
            <div className="border-b border-gray-700 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">
                {editingCategory ? 'Modifier Catégorie' : 'Ajouter Catégorie'}
              </h2>
              <button
                onClick={resetForm}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="text-sm text-gray-400 block mb-2">Nom de la catégorie</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-red-500"
                  placeholder="Ex: Pizzas, Desserts, Boissons..."
                  autoFocus
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded font-semibold transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 rounded font-semibold transition-colors"
                >
                  {editingCategory ? 'Mettre à jour' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
