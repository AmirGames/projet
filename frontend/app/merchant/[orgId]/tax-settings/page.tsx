'use client';


import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Trash2, Edit2, Plus, X, Info } from 'lucide-react';
import Link from 'next/link';

import { useCurrentStore } from '@/lib/current-store';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface TaxSetting {
  id: string;
  name: string;
  rate: number;
  applicableTo: string;
  status: string;
  categoryIds: string[];
  productIds: string[];
  included: boolean;
}

interface Categorie { id: string; name: string }
interface Produit   { id: string; name: string; categoryId: string | null }

const VIDE_FORM = {
  name: '',
  rate: '',
  applicableTo: 'all',
  included: true,
  categoryIds: [] as string[],
  productIds:  [] as string[],
};

export default function TaxSettingsPage() {
  const t = useTranslations('merchanttaxsettings');
  const { storeId } = useCurrentStore();
  const params  = useParams();
  const router  = useRouter();
  const orgId   = params?.orgId as string;

  const [taxes,      setTaxes]      = useState<TaxSetting[]>([]);
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [produits,   setProduits]   = useState<Produit[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(0);
  const [total,      setTotal]      = useState(0);

  const itemsPerPage = 20;

  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [enEdition,     setEnEdition]     = useState<TaxSetting | null>(null);
  const [message,       setMessage]       = useState('');
  const [envoi,         setEnvoi]         = useState(false);
  const [formulaire,    setFormulaire]    = useState(VIDE_FORM);

  /* ── Chargement ─────────────────────────────────────────────────────────── */

  const charger = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      if (!token) { router.push('/login'); return; }

      const [rTaxes, rCats, rProd] = await Promise.all([
        fetch(`${API_URL}/api/tax-settings/${storeId}?skip=${page * itemsPerPage}&take=${itemsPerPage}`,
          { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/categories/store/${storeId}`,
          { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/products/store/${storeId}?take=200`,
          { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (rTaxes.ok) {
        const d = await rTaxes.json();
        setTaxes(d.data || []);
        setTotal(d.total || 0);
      }
      if (rCats.ok) {
        const d = await rCats.json();
        // L'endpoint /categories/store/:id renvoie { categories: [...] }
        setCategories(Array.isArray(d) ? d : d.categories || d.data || []);
      }
      if (rProd.ok) {
        const d = await rProd.json();
        // L'endpoint /products/store/:id renvoie { products: [...] }
        setProduits(Array.isArray(d) ? d : d.products || d.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [storeId, page, router]);

  useEffect(() => { charger(); }, [charger]);

  /* ── Modale ─────────────────────────────────────────────────────────────── */

  const ouvrirModale = (taxe?: TaxSetting) => {
    setEnEdition(taxe || null);
    setFormulaire(taxe ? {
      name:         taxe.name,
      rate:         String(taxe.rate),
      applicableTo: taxe.applicableTo,
      included:     taxe.included ?? true,
      categoryIds:  taxe.categoryIds || [],
      productIds:   taxe.productIds  || [],
    } : VIDE_FORM);
    setMessage('');
    setModaleOuverte(true);
  };

  const toggleCategorie = (id: string) => {
    setFormulaire(f => ({
      ...f,
      categoryIds: f.categoryIds.includes(id)
        ? f.categoryIds.filter(c => c !== id)
        : [...f.categoryIds, id],
    }));
  };

  const toggleProduit = (id: string) => {
    setFormulaire(f => ({
      ...f,
      productIds: f.productIds.includes(id)
        ? f.productIds.filter(p => p !== id)
        : [...f.productIds, id],
    }));
  };

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();

    const taux = Number(formulaire.rate);
    if (!formulaire.name.trim() || Number.isNaN(taux) || taux < 0 || taux > 100) {
      setMessage('❌ Indiquez un nom et un taux compris entre 0 et 100');
      return;
    }
    if (formulaire.applicableTo === 'categories' && formulaire.categoryIds.length === 0) {
      setMessage('❌ Sélectionnez au moins une catégorie');
      return;
    }
    if (formulaire.applicableTo === 'products' && formulaire.productIds.length === 0) {
      setMessage('❌ Sélectionnez au moins un produit');
      return;
    }

    setEnvoi(true);
    setMessage('');

    try {
      const token = localStorage.getItem('accessToken');
      const url = enEdition
        ? `${API_URL}/api/tax-settings/${storeId}/${enEdition.id}`
        : `${API_URL}/api/tax-settings/${storeId}`;

      const reponse = await fetch(url, {
        method:  enEdition ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          name:         formulaire.name.trim(),
          rate:         taux,
          applicableTo: formulaire.applicableTo,
          included:     formulaire.included,
          categoryIds:  formulaire.applicableTo === 'categories' ? formulaire.categoryIds : [],
          productIds:   formulaire.applicableTo === 'products'   ? formulaire.productIds  : [],
        }),
      });

      const donnees = await reponse.json();
      if (!reponse.ok) {
        setMessage(`❌ ${donnees.error || 'Enregistrement impossible'}`);
        return;
      }

      setModaleOuverte(false);
      charger();
    } catch {
      setMessage('❌ Erreur de connexion au serveur');
    } finally {
      setEnvoi(false);
    }
  };

  const supprimer = async (taxId: string) => {
    if (!confirm('Supprimer cette taxe ?')) return;
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      const r = await fetch(`${API_URL}/api/tax-settings/${storeId}/${taxId}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) setTaxes(taxes.filter(t => t.id !== taxId));
    } catch (err) {
      console.error(err);
    }
  };

  /* ── Rendu ──────────────────────────────────────────────────────────────── */

  const totalPages = Math.ceil(total / itemsPerPage);

  const libelleCible = (taxe: TaxSetting) => {
    if (taxe.applicableTo === 'all') return 'Tous les produits';
    if (taxe.applicableTo === 'categories') {
      const noms = taxe.categoryIds
        .map(id => categories.find(c => c.id === id)?.name)
        .filter(Boolean);
      return noms.length ? noms.join(', ') : `${taxe.categoryIds.length} catégorie(s)`;
    }
    if (taxe.applicableTo === 'products') {
      const noms = taxe.productIds
        .map(id => produits.find(p => p.id === id)?.name)
        .filter(Boolean);
      return noms.length ? noms.join(', ') : `${taxe.productIds.length} produit(s)`;
    }
    return taxe.applicableTo;
  };

  if (loading && taxes.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4" />
          <p className="text-gray-400">Chargement des taxes…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Taxes</h1>
          <p className="text-gray-400 mt-1">
            Configurez les taux de TVA et attribuez-les à des catégories ou des produits.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => ouvrirModale()}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg font-medium transition-colors"
          >
            <Plus size={18} /> Nouvelle taxe
          </button>
          <Link href={`/merchant/${orgId}/dashboard`} className="text-gray-400 hover:text-gray-300 text-sm">
            ← Retour
          </Link>
        </div>
      </div>

      {/* Explication du fonctionnement */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-sm text-blue-300 flex gap-3">
        <Info size={18} className="shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium">Comment ça marche ?</p>
          <p>
            La règle la plus précise l&apos;emporte : un taux attribué à un <strong>produit</strong> prime
            sur un taux attribué à sa <strong>catégorie</strong>, qui prime sur le taux
            appliqué à <strong>tous les produits</strong>.
          </p>
          <p>
            Exemple : 6 % sur la catégorie &laquo; Nourriture &raquo; et 21 % sur la catégorie
            &laquo; Boissons &raquo;. Une commande avec une pizza et une bière produira un ticket
            avec les deux taux séparés.
          </p>
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700 border-b border-gray-600">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">Nom</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Taux</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Prix</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Applicable à</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Statut</th>
                <th className="px-6 py-3 text-center text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {taxes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                    Aucune taxe configurée — cliquez sur &laquo; Nouvelle taxe &raquo; pour commencer.
                  </td>
                </tr>
              ) : (
                taxes.map((taxe) => (
                  <tr key={taxe.id} className="border-b border-gray-700 hover:bg-gray-700/50 transition">
                    <td className="px-6 py-4 font-medium">{taxe.name}</td>
                    <td className="px-6 py-4">
                      <span className="text-blue-400 font-bold">{Number(taxe.rate).toFixed(2)} %</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {taxe.included === false ? 'HT (ajoutée)' : 'TTC (comprise)'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-300 max-w-xs truncate">
                      {libelleCible(taxe)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        taxe.status === 'ACTIVE'
                          ? 'bg-green-600/20 text-green-400'
                          : 'bg-gray-600/20 text-gray-400'
                      }`}>
                        {taxe.status === 'ACTIVE' ? t('active') : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => ouvrirModale(taxe)}
                          title={t('edit')}
                          className="p-1 hover:bg-gray-600 rounded transition"
                        >
                          <Edit2 size={16} className="text-blue-400" />
                        </button>
                        <button
                          onClick={() => supprimer(taxe.id)}
                          title={t('delete')}
                          className="p-1 hover:bg-gray-600 rounded transition"
                        >
                          <Trash2 size={16} className="text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700">
            <p className="text-sm text-gray-400">Page {page + 1} sur {totalPages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-sm"
              >Précédent</button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page === totalPages - 1}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-sm"
              >Suivant</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modale ─────────────────────────────────────────────────────────── */}
      {modaleOuverte && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center p-4 z-50 overflow-y-auto">
          <form
            onSubmit={enregistrer}
            className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-lg space-y-5 my-8"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">
                {enEdition ? 'Modifier la taxe' : 'Nouvelle taxe'}
              </h2>
              <button type="button" onClick={() => setModaleOuverte(false)} className="p-1 hover:bg-gray-700 rounded">
                <X size={20} />
              </button>
            </div>

            {message && (
              <div className="bg-gray-700 rounded-lg p-3 text-sm">{message}</div>
            )}

            <div>
              <label className="block text-sm text-gray-400 mb-1">Nom</label>
              <input
                type="text" required minLength={2}
                value={formulaire.name}
                onChange={e => setFormulaire({ ...formulaire, name: e.target.value })}
                placeholder="Ex : TVA restauration"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Taux (%)</label>
                <input
                  type="number" required step="0.1" min="0" max="100"
                  value={formulaire.rate}
                  onChange={e => setFormulaire({ ...formulaire, rate: e.target.value })}
                  placeholder="Ex : 6"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Type de prix</label>
                <select
                  value={formulaire.included ? 'ttc' : 'ht'}
                  onChange={e => setFormulaire({ ...formulaire, included: e.target.value === 'ttc' })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="ttc">Prix TTC (taxe comprise)</option>
                  <option value="ht">Prix HT (taxe ajoutée)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Appliquer à</label>
              <select
                value={formulaire.applicableTo}
                onChange={e => setFormulaire({ ...formulaire, applicableTo: e.target.value, categoryIds: [], productIds: [] })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
              >
                <option value="all">Tous les produits</option>
                <option value="categories">Certaines catégories</option>
                <option value="products">Certains produits</option>
              </select>
            </div>

            {/* Sélection des catégories */}
            {formulaire.applicableTo === 'categories' && (
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Catégories concernées <span className="text-orange-400">*</span>
                </label>
                {categories.length === 0 ? (
                  <p className="text-sm text-gray-500">Aucune catégorie créée pour l&apos;instant.</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-600 rounded-lg p-2">
                    {categories.map(cat => (
                      <label key={cat.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={formulaire.categoryIds.includes(cat.id)}
                          onChange={() => toggleCategorie(cat.id)}
                          className="accent-orange-500"
                        />
                        {cat.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Sélection des produits */}
            {formulaire.applicableTo === 'products' && (
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Produits concernés <span className="text-orange-400">*</span>
                </label>
                {produits.length === 0 ? (
                  <p className="text-sm text-gray-500">Aucun produit créé pour l&apos;instant.</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-600 rounded-lg p-2">
                    {/* Groupés par catégorie pour s'y retrouver */}
                    {categories.map(cat => {
                      const prods = produits.filter(p => p.categoryId === cat.id);
                      if (!prods.length) return null;
                      return (
                        <div key={cat.id}>
                          <p className="px-2 py-1 text-xs text-gray-500 uppercase tracking-wide">{cat.name}</p>
                          {prods.map(prod => (
                            <label key={prod.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 cursor-pointer text-sm">
                              <input
                                type="checkbox"
                                checked={formulaire.productIds.includes(prod.id)}
                                onChange={() => toggleProduit(prod.id)}
                                className="accent-orange-500"
                              />
                              {prod.name}
                            </label>
                          ))}
                        </div>
                      );
                    })}
                    {/* Produits sans catégorie */}
                    {produits.filter(p => !p.categoryId).map(prod => (
                      <label key={prod.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={formulaire.productIds.includes(prod.id)}
                          onChange={() => toggleProduit(prod.id)}
                          className="accent-orange-500"
                        />
                        {prod.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="submit" disabled={envoi}
                className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 rounded-lg font-medium transition-colors"
              >
                {envoi ? t('saving') : t('save')}
              </button>
              <button
                type="button" onClick={() => setModaleOuverte(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
