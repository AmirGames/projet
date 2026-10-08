'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useState, useCallback } from 'react';
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
import { useCurrentStore } from '@/lib/current-store';

import { useTranslations } from 'next-intl';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';
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
  const t = useTranslations('merchantCategories');
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
      className={`bg-white border border-gray-200 rounded-lg p-4 hover:border-red-600 transition-colors ${
        isDragging ? 'shadow-lg shadow-red-600' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-500"
            title={t('glissez')}
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
            className="bg-gray-100 text-gray-700 hover:bg-gray-200 p-2 rounded-sm transition-colors"
            title={t('edit')}
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={() => onDelete(category.id)}
            className="bg-red-50 text-red-700 hover:bg-red-100 p-2 rounded-sm transition-colors"
            title={t('delete')}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {category.products && category.products.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-500 mb-2">{t('produits')}</p>
          <div className="flex flex-wrap gap-2">
            {category.products.map((product: any) => (
              <span
                key={product.id}
                className="bg-gray-100 px-2 py-1 rounded-sm text-xs text-gray-700"
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
  const t = useTranslations('merchantCategories');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const { storeId } = useCurrentStore();
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

  const fetchStoreAndCategories = useCallback(async () => {
    if (!storeId) return;

    try {
      const token = localStorage.getItem('accessToken');

      const categoriesResponse = await fetch(`${API_URL}/api/categories?storeId=${storeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (categoriesResponse.ok) {
        const data = await categoriesResponse.json();
        const sorted = (data.categories || []).sort((a: Category, b: Category) => a.displayOrder - b.displayOrder);
        setCategories(sorted);
      }
    } catch (error) {
      signalerErreur('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  // Une catégorie ajoutée ou réordonnée ailleurs, ou un plat qui change de
  // catégorie (le compte par catégorie bouge) : la liste suit.
  useDonneesModifiees(['categories', 'products'], () => fetchStoreAndCategories(), {
    storeId,
    actif: Boolean(storeId),
  });

  useEffectChargement(() => {
    if (storeId) {
      fetchStoreAndCategories();
    }
  }, [storeId, fetchStoreAndCategories]);

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

        setMessage(t('msgReorganisees'));
        setTimeout(() => setMessage(''), 3000);
      } catch (error) {
        signalerErreur('Error reordering:', error);
        setMessage(t('msgErreurReorg'));
        fetchStoreAndCategories();
      } finally {
        setIsReordering(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setMessage(t('msgNomRequis'));
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
          setMessage(t('msgMiseAJour'));
          resetForm();
          await fetchStoreAndCategories();
          setTimeout(() => setMessage(''), 3000);
        } else {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData.error || errorData.message || t('updateError');
          setMessage(`❌ ${errorMsg}`);
        }
      } else {
        if (!storeId) {
          setMessage(t('msgStoreIntrouvable'));
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
          setMessage(t('msgCreee'));
          resetForm();
          await fetchStoreAndCategories();
          setTimeout(() => setMessage(''), 3000);
        } else {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData.error || errorData.message || t('createError');
          setMessage(`❌ ${errorMsg}`);
        }
      }
    } catch (error) {
      signalerErreur('Error saving category:', error);
      setMessage(t('msgErreurSauvegarde'));
    }
  };

  const handleDelete = async (categoryId: string) => {
    if (!confirm(t('confirmerSuppression'))) {
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/categories/${categoryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setMessage(t('msgSupprimee'));
        await fetchStoreAndCategories();
        setTimeout(() => setMessage(''), 3000);
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || errorData.message || t('deleteError');
        setMessage(`❌ ${errorMsg}`);
      }
    } catch (error) {
      signalerErreur('Error deleting category:', error);
      setMessage(t('msgErreurSuppression'));
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
      <div className="flex h-screen">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-500">{t('chargement')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-gray-900">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{t('titreGestion')}</h1>
            <p className="text-gray-500 mt-1">{t('sousTitreGestion')}</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-orange-600 text-white hover:bg-orange-700 px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
            disabled={isReordering}
          >
            <Plus size={20} /> {t('ajouter')}
          </button>
        </div>

        {message && (
          <div className={`p-4 rounded-lg ${
            message.includes('✅')
              ? 'bg-green-50 border border-green-200 text-green-600'
              : 'bg-red-50 border border-red-200 text-red-600'
          }`}>
            {message}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-gray-500 text-sm">{t('total')}</p>
          <p className="text-3xl font-bold">{categories.length}</p>
        </div>

        <div className="space-y-3">
          {categories.length === 0 ? (
            <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
              <p className="text-gray-500">{t('aucune')}</p>
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

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-600 text-sm">
            {t('astuce')}
          </p>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-lg max-w-md w-full">
            <div className="border-b border-gray-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">
                {editingCategory ? t('modifier') : t('ajouter')}
              </h2>
              <button
                onClick={resetForm}
                className="text-gray-500 hover:text-gray-900 text-2xl"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="text-sm text-gray-500 block mb-2">{t('nom')}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-100 border border-gray-300 rounded-sm px-3 py-2 text-gray-900 focus:outline-hidden focus:border-red-500"
                  placeholder={t('exempleNom')}
                  autoFocus
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-sm font-semibold transition-colors"
                >
                  {t('annuler')}
                </button>
                <button
                  type="submit"
                  className="bg-orange-600 text-white hover:bg-orange-700 flex-1 py-2 rounded-sm font-semibold transition-colors"
                >
                  {editingCategory ? t('update') : t('create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
