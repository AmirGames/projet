'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Store as StoreIcon, Search, Package, ShoppingCart, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

interface Boutique {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
  isOpen: boolean;
  rating: number;
  createdAt: string;
  organization: { id: string; name: string; status: string };
  productCount: number;
  orderCount: number;
}

const COULEURS_ORG: Record<string, string> = {
  ACTIVE: 'bg-green-500/20 text-green-400',
  SUSPENDED: 'bg-orange-500/20 text-orange-400',
  CLOSED: 'bg-red-500/20 text-red-400',
};

export default function BoutiquesAdminPage() {
  const t = useTranslations('adminStores');
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);
  const [total, setTotal] = useState(0);
  const [recherche, setRecherche] = useState('');
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const charger = useCallback(async () => {
    setLoading(true);
    setErreur('');

    try {
      const token = localStorage.getItem('accessToken');
      const parametres = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        ...(recherche ? { search: recherche } : {}),
      });

      const reponse = await fetch(`${API_URL}/api/admin/stores?${parametres}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setErreur(donnees.error || 'Impossible de charger les boutiques');
        return;
      }

      setBoutiques(donnees.stores || []);
      setTotal(donnees.pagination?.total ?? 0);
    } catch {
      setErreur('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  }, [offset, recherche]);

  useEffect(() => {
    // Petite temporisation pour ne pas interroger l'API à chaque frappe.
    const minuteur = setTimeout(charger, recherche ? 350 : 0);
    return () => clearTimeout(minuteur);
  }, [charger, recherche]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <StoreIcon size={28} className="text-green-500" />
          Boutiques
        </h1>
        <p className="text-gray-400 mt-1">
          Toutes les boutiques de la plateforme, tous commerçants confondus
        </p>
      </div>

      {erreur && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-400">
          {erreur}
        </div>
      )}

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={recherche}
          onChange={(e) => {
            setOffset(0);
            setRecherche(e.target.value);
          }}
          placeholder="Rechercher par nom, ville ou identifiant..."
          className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-green-500"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
        </div>
      ) : boutiques.length === 0 ? (
        <div className="text-center py-12 bg-gray-800 border border-gray-700 rounded-lg">
          <StoreIcon size={40} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">Aucune boutique ne correspond à cette recherche</p>
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-900/50 border-b border-gray-700 text-gray-300">
                <tr>
                  <th className="px-6 py-3 text-left">Boutique</th>
                  <th className="px-6 py-3 text-left">Commerçant</th>
                  <th className="px-6 py-3 text-center">Produits</th>
                  <th className="px-6 py-3 text-center">Commandes</th>
                  <th className="px-6 py-3 text-center">État</th>
                  <th className="px-6 py-3 text-right">Vitrine</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {boutiques.map((boutique) => (
                  <tr key={boutique.id} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-semibold">{boutique.name}</p>
                      <p className="text-xs text-gray-500">
                        {boutique.city || 'Ville non renseignée'}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/admin/merchants`}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        {boutique.organization?.name || '—'}
                      </Link>
                      <span
                        className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                          COULEURS_ORG[boutique.organization?.status] ||
                          'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {boutique.organization?.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center gap-1 text-gray-300">
                        <Package size={14} /> {boutique.productCount}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center gap-1 text-gray-300">
                        <ShoppingCart size={14} /> {boutique.orderCount}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          boutique.isOpen
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {boutique.isOpen ? 'Ouverte' : 'Fermée'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <a
                        href={`${SITE_URL}/store/${boutique.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
                      >
                        Voir <ExternalLink size={14} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          {total === 0
            ? 'Aucune boutique'
            : `${offset + 1} à ${Math.min(offset + limit, total)} sur ${total}`}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            Précédent
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}
