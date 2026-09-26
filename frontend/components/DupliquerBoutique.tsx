'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, X } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const enSlug = (texte: string) =>
  texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

/**
 * Ouvrir une boutique de plus sur le modèle d'une autre : catalogue,
 * catégories, horaires, zones et taxes sont recopiés, seuls le nom, l'adresse
 * et le téléphone sont demandés.
 */
export default function DupliquerBoutique({
  source,
  onClose,
  onDone,
}: {
  source: { id: string; name: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('dupliquerBoutique');
  const [form, setForm] = useState({ name: '', address: '', postalCode: '', city: '', phone: '' });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const champ = (cle: keyof typeof form) => ({
    value: form[cle],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [cle]: e.target.value })),
    className: 'w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-orange-600 outline-none',
  });

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    try {
      const token = localStorage.getItem('accessToken');
      const corps = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== ''));
      const res = await fetch(`${API_URL}/api/stores/${source.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...corps, slug: enSlug(form.name) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || t('error'));
      }
      onDone();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('error'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={envoyer}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-md space-y-4"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">{t('title', { name: source.name })}</h2>
            <p className="text-sm text-gray-400 mt-1">{t('help')}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white" aria-label={t('cancel')}>
            <X size={20} />
          </button>
        </div>

        <label className="block text-sm text-gray-300">
          {t('name')} *
          <input required minLength={2} placeholder={t('namePlaceholder')} {...champ('name')} />
        </label>
        <label className="block text-sm text-gray-300">
          {t('address')}
          <input {...champ('address')} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-gray-300">
            {t('postalCode')}
            <input {...champ('postalCode')} />
          </label>
          <label className="block text-sm text-gray-300">
            {t('city')}
            <input {...champ('city')} />
          </label>
        </div>
        <label className="block text-sm text-gray-300">
          {t('phone')}
          <input type="tel" {...champ('phone')} />
        </label>

        {erreur && <p className="text-sm text-red-400">{erreur}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-gray-300 hover:text-white">
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={envoi || enSlug(form.name).length < 2}
            className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <Copy size={16} />
            {envoi ? t('submitting') : t('submit')}
          </button>
        </div>
      </form>
    </div>
  );
}
