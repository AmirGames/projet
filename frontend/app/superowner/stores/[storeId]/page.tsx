'use client';

/**
 * La fiche d'une boutique, vue par la plateforme.
 *
 * La liste des boutiques était un cul-de-sac : des noms et des compteurs, rien
 * à ouvrir. On voit ici l'essentiel d'un commerce, et on corrige la courte
 * liste de champs dont la plateforme répond — adresse et coordonnées, adresse
 * publique, téléphone, e-mail.
 *
 * Le catalogue, les prix et les horaires n'y sont qu'en lecture : ils
 * appartiennent au commerçant, et c'est lui qui répond de ce que paie un
 * client.
 */

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, ExternalLink, MapPin, Pencil, Store as StoreIcon } from 'lucide-react';

import { euro } from '@/lib/format';

// Leaflet touche à `window` dès son chargement : pas de rendu côté serveur.
const CarteZones = dynamic(() => import('@/components/CarteZones').then((m) => m.CarteZones), {
  ssr: false,
  loading: () => (
    <div className="h-[320px] w-full rounded-lg border border-gray-700 bg-gray-800 flex items-center justify-center text-gray-500">
      Chargement de la carte…
    </div>
  ),
});

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Zone {
  id: string;
  name: string;
  radiusKm: number;
  baseFee: number;
  minOrder: number;
  isActive: boolean;
}

interface Fiche {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  isOpen: boolean;
  rating: number;
  deliveryCost: number;
  minDeliveryAmount: number;
  situee: boolean;
  chiffreDaffaires: number;
  createdAt: string;
  org: {
    id: string;
    name: string;
    status: string;
    tier: string;
    memberships: { role: string; user: { id: string; name: string; email: string } | null }[];
  };
  _count: { products: number; orders: number; categories: number };
  deliveryZones: Zone[];
  derniereCommande: { createdAt: string; status: string } | null;
}

/** Les champs que la plateforme corrige, et rien d'autre. */
const CHAMPS = [
  { champ: 'address', libelle: 'Adresse', type: 'text' },
  { champ: 'postalCode', libelle: 'Code postal', type: 'text' },
  { champ: 'city', libelle: 'Ville', type: 'text' },
  { champ: 'slug', libelle: 'Adresse publique', type: 'text' },
  { champ: 'phone', libelle: 'Téléphone', type: 'tel' },
  { champ: 'email', libelle: 'E-mail', type: 'email' },
  { champ: 'latitude', libelle: 'Latitude', type: 'text' },
  { champ: 'longitude', libelle: 'Longitude', type: 'text' },
] as const;

const jour = (date: string) => new Date(date).toLocaleDateString('fr-FR');

export default function FicheBoutiquePage() {
  const params = useParams();
  const storeId = params.storeId as string;

  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [enEdition, setEnEdition] = useState(false);
  const [formulaire, setFormulaire] = useState<Record<string, string>>({});

  const jeton = () => localStorage.getItem('accessToken');

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur('');

    try {
      const reponse = await fetch(`${API_URL}/api/superowner/stores/${storeId}`, {
        headers: { Authorization: `Bearer ${jeton()}` },
      });

      if (!reponse.ok) {
        throw new Error(
          reponse.status === 404 ? 'Cette boutique est introuvable' : 'Chargement impossible'
        );
      }

      const lu = await reponse.json();
      setFiche(lu.store);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setChargement(false);
    }
  }, [storeId]);

  useEffect(() => {
    charger();
  }, [charger]);

  const ouvrirEdition = () => {
    if (!fiche) return;

    setMessage('');
    setErreur('');
    setFormulaire({
      address: fiche.address || '',
      postalCode: fiche.postalCode || '',
      city: fiche.city || '',
      slug: fiche.slug,
      phone: fiche.phone || '',
      email: fiche.email || '',
      latitude: fiche.latitude != null ? String(fiche.latitude) : '',
      longitude: fiche.longitude != null ? String(fiche.longitude) : '',
    });
    setEnEdition(true);
  };

  const enregistrer = async () => {
    if (!fiche) return;

    setErreur('');
    setMessage('');

    /**
     * N'envoyer que ce qui a bougé.
     *
     * Tout renvoyer ferait entrer au journal des champs réécrits à l'identique,
     * et noierait les vraies corrections.
     */
    const change: Record<string, string> = {};

    for (const { champ } of CHAMPS) {
      const avant =
        champ === 'latitude' || champ === 'longitude'
          ? fiche[champ] != null
            ? String(fiche[champ])
            : ''
          : (fiche[champ as keyof Fiche] as string | null) || '';

      if ((formulaire[champ] ?? '') !== avant) change[champ] = formulaire[champ] ?? '';
    }

    if (Object.keys(change).length === 0) {
      setErreur('Aucun changement à enregistrer');
      return;
    }

    try {
      const reponse = await fetch(`${API_URL}/api/superowner/stores/${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton()}` },
        body: JSON.stringify(change),
      });

      const lu = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        setErreur(lu?.error || 'Correction refusée');
        return;
      }

      setMessage(lu?.message || 'Correction enregistrée');
      setEnEdition(false);
      await charger();
    } catch {
      setErreur('Erreur de connexion');
    }
  };

  if (chargement) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!fiche) {
    return (
      <div className="space-y-4">
        <Link href="/superowner/stores" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm">
          <ArrowLeft size={16} /> Retour aux boutiques
        </Link>
        <p className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {erreur || 'Cette boutique est introuvable'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/superowner/stores"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-2"
        >
          <ArrowLeft size={16} /> Retour aux boutiques
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-2">
              <StoreIcon className="w-7 h-7" />
              {fiche.name}
            </h1>
            <p className="text-gray-400 mt-1">
              <Link href="/superowner/organizations" className="hover:underline">
                {fiche.org.name}
              </Link>{' '}
              · formule {fiche.org.tier} · {fiche.isOpen ? 'ouverte' : 'fermée'}
            </p>
          </div>

          <div className="flex gap-2">
            <a
              href={`/store/${fiche.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition"
            >
              <ExternalLink size={14} />
              Voir la vitrine
            </a>
            {!enEdition && (
              <button
                onClick={ouvrirEdition}
                className="inline-flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition"
              >
                <Pencil size={14} />
                Corriger
              </button>
            )}
          </div>
        </div>
      </div>

      {erreur && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {erreur}
        </div>
      )}

      {message && (
        <div role="status" className="p-4 bg-green-900/20 text-green-300 rounded-lg border border-green-500/20">
          {message}
        </div>
      )}

      {/* Sans coordonnées, la boutique est invisible de l'attribution des courses
          et des zones de livraison. C'est le premier point à regarder quand un
          commerçant dit ne plus recevoir de livreur. */}
      {!fiche.situee && (
        <div className="p-4 bg-amber-900/20 text-amber-200 rounded-lg border border-amber-600/40 flex gap-3">
          <AlertTriangle size={20} className="flex-shrink-0 text-amber-400" />
          <div>
            <p className="font-semibold">Cette boutique n&apos;est pas située</p>
            <p className="text-sm text-amber-200/80">
              Sans coordonnées, aucun livreur ne lui est proposé et ses zones de livraison ne
              s&apos;appliquent pas. Corrigez son adresse : elle sera située automatiquement.
            </p>
          </div>
        </div>
      )}

      {enEdition ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-white">Corriger la fiche</h2>
            {/* Dire la limite, plutôt que de laisser chercher le champ absent. */}
            <p className="text-sm text-gray-400 mt-1">
              La plateforme ne corrige que ces champs. Le nom, le catalogue, les prix et les
              horaires appartiennent au commerçant. Chaque correction part au journal et lui est
              annoncée.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CHAMPS.map(({ champ, libelle, type }) => (
              <div key={champ}>
                <label htmlFor={`champ-${champ}`} className="block text-sm text-gray-400 mb-1">
                  {libelle}
                </label>
                <input
                  id={`champ-${champ}`}
                  type={type}
                  value={formulaire[champ] ?? ''}
                  onChange={(e) => setFormulaire({ ...formulaire, [champ]: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                />
              </div>
            ))}
          </div>

          {/* Une adresse que le service ne sait pas situer laissait le support
              sans recours : il fallait trouver des coordonnées ailleurs et les
              recopier. Ici, le point se pose à la main. */}
          <div>
            <p className="text-sm text-gray-400 mb-2">
              Ou posez la boutique directement sur la carte.
            </p>
            <CarteZones
              latitude={
                formulaire.latitude ? Number(formulaire.latitude) : (fiche.latitude ?? null)
              }
              longitude={
                formulaire.longitude ? Number(formulaire.longitude) : (fiche.longitude ?? null)
              }
              zones={[]}
              hauteur={320}
              onPosition={(latitude, longitude) =>
                setFormulaire((actuel) => ({
                  ...actuel,
                  latitude: latitude.toFixed(6),
                  longitude: longitude.toFixed(6),
                }))
              }
            />
          </div>

          <p className="text-xs text-gray-500">
            Laissez la latitude et la longitude vides en corrigeant l&apos;adresse : la boutique
            sera située d&apos;après celle-ci.
          </p>

          <div className="flex gap-2">
            <button
              onClick={enregistrer}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-medium transition"
            >
              Enregistrer la correction
            </button>
            <button
              onClick={() => setEnEdition(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-3">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <MapPin size={18} className="text-orange-500" />
              Coordonnées
            </h2>

            <dl className="text-sm space-y-2">
              {[
                ['Adresse', [fiche.address, fiche.postalCode, fiche.city].filter(Boolean).join(', ')],
                ['Adresse publique', `/store/${fiche.slug}`],
                ['Téléphone', fiche.phone],
                ['E-mail', fiche.email],
                [
                  'Position',
                  fiche.situee ? `${fiche.latitude}, ${fiche.longitude}` : 'non située',
                ],
              ].map(([libelle, valeur]) => (
                <div key={libelle as string} className="flex justify-between gap-4">
                  <dt className="text-gray-400">{libelle}</dt>
                  <dd className="text-white text-right">{valeur || '—'}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-3">
            <h2 className="font-semibold text-white">Activité</h2>

            <dl className="text-sm space-y-2">
              {[
                ['Produits', String(fiche._count.products)],
                ['Catégories', String(fiche._count.categories)],
                ['Commandes', String(fiche._count.orders)],
                ['Chiffre d’affaires', euro(fiche.chiffreDaffaires)],
                ['Note', `${fiche.rating.toFixed(2)} / 5`],
                [
                  'Dernière commande',
                  fiche.derniereCommande ? jour(fiche.derniereCommande.createdAt) : 'aucune',
                ],
                ['Ouverte depuis', jour(fiche.createdAt)],
              ].map(([libelle, valeur]) => (
                <div key={libelle} className="flex justify-between gap-4">
                  <dt className="text-gray-400">{libelle}</dt>
                  <dd className="text-white">{valeur}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-3">
            <h2 className="font-semibold text-white">Livraison</h2>
            {/* En lecture seule : ces montants sont ceux du commerçant. */}
            <p className="text-xs text-gray-500">
              Réglé par le commerçant — la plateforme ne le modifie pas.
            </p>

            {fiche.deliveryZones.length === 0 ? (
              <p className="text-sm text-gray-400">
                Aucune zone : la boutique facture {euro(fiche.deliveryCost)} partout, à partir de{' '}
                {euro(fiche.minDeliveryAmount)}.
              </p>
            ) : (
              <ul className="text-sm space-y-1">
                {fiche.deliveryZones.map((zone) => (
                  <li key={zone.id} className="flex justify-between gap-4">
                    <span className="text-gray-400">
                      {zone.name} · {zone.radiusKm} km{!zone.isActive && ' (inactive)'}
                    </span>
                    <span className="text-white">
                      {euro(zone.baseFee)} · min. {euro(zone.minOrder)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-3">
            <h2 className="font-semibold text-white">Qui contacter</h2>

            {fiche.org.memberships.length === 0 ? (
              <p className="text-sm text-gray-400">Aucun compte rattaché.</p>
            ) : (
              <ul className="text-sm space-y-2">
                {fiche.org.memberships.map((adhesion) => (
                  <li key={adhesion.user?.id || adhesion.role} className="flex justify-between gap-4">
                    <span className="text-white">{adhesion.user?.name || '—'}</span>
                    <span className="text-gray-400">{adhesion.user?.email}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
