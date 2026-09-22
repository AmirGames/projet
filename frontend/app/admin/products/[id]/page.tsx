'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { apiClient } from '@/lib/api';

export default function ProductDetailPage() {
  const t = useTranslations('adminProductDetail');
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    sku: '',
  });

  useEffect(() => {
    fetchProduct();
  }, [productId]);

  const fetchProduct = async () => {
    try {
      // Note: The API doesn't have a getProduct by ID endpoint, so we'll show a placeholder
      // In production, you'd implement GET /api/products/:id
      setLoading(false);
    } catch (error) {
      console.error(t('error'), error);
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Update product logic would go here
      // In production, you'd implement PUT /api/products/:id
      router.push('/admin/products');
    } catch (error) {
      console.error('Erreur mise à jour produit:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirm(t('deleteConfirm'))) {
      try {
        await apiClient.deleteProduct(productId);
        router.push('/admin/products');
      } catch (error) {
        console.error(t('deleteError'), error);
      }
    }
  };

  if (loading) return <div className="text-center py-8">{t('loading')}</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/products" className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{t('title')}</h1>
            <p className="text-gray-400 mt-1">{t('subtitle')}</p>
          </div>
        </div>
        <button
          onClick={handleDelete}
          className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
        >
          <Trash2 size={18} />
          {t('deleteButton')}
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-6">
        <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4 text-gray-400 text-sm">
          {t('productIdLabel', { id: productId })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">{t('productNameLabel')}</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder={t('productNamePlaceholder')}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{t('skuLabel')}</label>
            <input
              type="text"
              name="sku"
              value={formData.sku}
              onChange={handleChange}
              placeholder={t('skuPlaceholder')}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">{t('descriptionLabel')}</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder={t('descriptionPlaceholder')}
            rows={4}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">{t('priceLabel')}</label>
          <input
            type="number"
            name="price"
            value={formData.price}
            onChange={handleChange}
            placeholder={t('pricePlaceholder')}
            step="0.01"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-3 justify-end">
          <Link
            href="/admin/products"
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            {t('cancelButton')}
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors font-medium"
          >
            {saving ? t('saving') : t('submitButton')}
          </button>
        </div>
      </form>
    </div>
  );
}
