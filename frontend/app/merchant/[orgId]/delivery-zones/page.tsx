'use client';


import { jetonAcces } from '@/lib/jeton-session';
import { signalerErreur } from '@/lib/erreurs';
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Edit2, Trash2, Search, MapPin, Crosshair } from 'lucide-react';
import { useCurrentStore } from '@/lib/current-store';

import { euro } from '@/lib/format';
import { useTranslations } from 'next-intl';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';

// Leaflet touche à `window` dès son chargement : la carte ne peut pas être
// rendue côté serveur.
const CarteZones = dynamic(() => import('@/components/CarteZones'), {
  ssr: false,
  loading: () => <ChargementCarte />,
});

function ChargementCarte() {
  const t = useTranslations('suiviLivraison');

  return (
    <div className="h-[560px] w-full rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-500">
      {t('chargementCarte')}
    </div>
  );
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Sommet {
  latitude: number;
  longitude: number;
}

interface DeliveryZone {
  id: string;
  name: string;
  type: 'RADIUS' | 'POLYGON';
  /** Rayon en kilomètres depuis la boutique : uniquement pour le type RADIUS. */
  radiusKm: number | null;
  /** Les sommets du polygone : uniquement pour le type POLYGON. */
  polygon: Sommet[] | null;
  color: string;
  opacity: number;
  baseFee: number;
  minOrder: number;
  /** Livraison offerte dès ce montant d'articles ; nul pour jamais. */
  freeAbove?: number | null;
  deliveryMinutes: number | null;
  isActive: boolean;
}

export default function DeliveryZonesPage() {
  const t = useTranslations('merchantdeliveryzones');

  const { storeId } = useCurrentStore();
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'RADIUS' as 'RADIUS' | 'POLYGON',
    radiusKm: '',
    color: '#f59e0b',
    opacity: '0.35',
    baseFee: '',
    minOrder: '',
    freeAbove: '',
    deliveryMinutes: '',
  });
  const [formError, setFormError] = useState('');
  /** Les sommets déjà posés du polygone en cours de dessin ; `null` hors dessin. */
  const [dessin, setDessin] = useState<Sommet[] | null>(null);

  /**
   * La boutique, pour la carte.
   *
   * Les zones sont des anneaux autour d'elle : sans son point, elles ne
   * s'appliquent à rien, et le commerçant réglait des kilomètres à l'aveugle.
   */
  const [boutique, setBoutique] = useState<{
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    city: string | null;
    postalCode: string | null;
  } | null>(null);
  const [messageCarte, setMessageCarte] = useState('');
  const [erreurCarte, setErreurCarte] = useState('');
  const [situation, setSituation] = useState(false);

  const chargerBoutique = useCallback(async () => {
    if (!storeId) return;

    try {
      const jeton = jetonAcces();
      const reponse = await fetch(`${API_URL}/api/stores/${storeId}`, {
        headers: jeton ? { Authorization: `Bearer ${jeton}` } : {},
      });
      if (!reponse.ok) return;

      const lue = await reponse.json();
      const magasin = lue.store || lue;

      setBoutique({
        latitude: magasin.latitude == null ? null : Number(magasin.latitude),
        longitude: magasin.longitude == null ? null : Number(magasin.longitude),
        address: magasin.address || null,
        city: magasin.city || null,
        postalCode: magasin.postalCode || null,
      });
    } catch {
      // La carte est un confort : son absence ne doit pas emporter la page.
    }
  }, [storeId]);

  /**
   * Qui livre. Avec les livreurs de la plateforme, ces zones ne servent pas :
   * le rayon et les frais sont ceux de la plateforme.
   */
  const [livreursPlateforme, setLivreursPlateforme] = useState(false);

  useEffect(() => {
    const jeton = jetonAcces();
    if (!storeId || !jeton) return;

    fetch(`${API_URL}/api/store-settings/${storeId}`, { headers: { Authorization: `Bearer ${jeton}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((lu) => {
        if (lu) setLivreursPlateforme(lu.settings?.delivery?.useOwnDelivery !== true);
      })
      .catch(() => undefined);
  }, [storeId]);

  /** Enregistre la position de la boutique : c'est le centre de toutes les zones. */
  const enregistrerPosition = async (latitude: number, longitude: number) => {
    setErreurCarte('');
    setMessageCarte('');

    // L'affichage suit tout de suite : attendre le serveur ferait sauter le
    // point sous la souris.
    setBoutique((actuelle) => (actuelle ? { ...actuelle, latitude, longitude } : actuelle));

    try {
      const token = jetonAcces();
      const reponse = await fetch(`${API_URL}/api/stores/${storeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        // Six décimales : une dizaine de centimètres, largement au-delà de ce
        // qu'un doigt sur une carte peut viser.
        body: JSON.stringify({
          latitude: Number(latitude.toFixed(6)),
          longitude: Number(longitude.toFixed(6)),
        }),
      });

      if (!reponse.ok) {
        const lue = await reponse.json().catch(() => null);
        setErreurCarte(lue?.error || t('positionNonEnregistree'));
        await chargerBoutique();
        return;
      }

      setMessageCarte(t('positionEnregistree'));
    } catch {
      setErreurCarte(t('serverError'));
      await chargerBoutique();
    }
  };

  /** Retrouve la boutique depuis son adresse, plutôt que de la chercher à l'œil. */
  const situerDepuisLAdresse = async () => {
    const texte = [boutique?.address, boutique?.postalCode, boutique?.city]
      .filter(Boolean)
      .join(' ');

    if (texte.trim().length < 3) {
      setErreurCarte(t('adresseDabord'));
      return;
    }

    setSituation(true);
    setErreurCarte('');
    setMessageCarte('');

    try {
      const reponse = await fetch(
        `${API_URL}/api/addresses/search?q=${encodeURIComponent(texte)}`
      );
      const lue = await reponse.json().catch(() => null);
      const point = (lue?.suggestions || []).find(
        (s: { latitude: number | null }) => s.latitude != null
      );

      if (!point) {
        setErreurCarte(t('adresseIntrouvable'));
        return;
      }

      await enregistrerPosition(point.latitude, point.longitude);
    } catch {
      setErreurCarte(t('serviceAdresses'));
    } finally {
      setSituation(false);
    }
  };

  const fetchZones = useCallback(async () => {
    try {
      const token = jetonAcces();
      const response = await fetch(`${API_URL}/api/delivery-zones?storeId=${storeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setZones(data.zones || []);
      }
    } catch (error) {
      signalerErreur('Error fetching delivery zones:', error);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  // Une zone dessinée par un collègue, l'adresse de la boutique déplacée :
  // la carte suit.
  useDonneesModifiees(
    ['delivery-zones', 'stores'],
    () => {
      fetchZones();
      chargerBoutique();
    },
    { storeId, actif: Boolean(storeId) }
  );

  useEffectChargement(() => {
    if (storeId) {
      fetchZones();
      chargerBoutique();
    }
  }, [storeId, chargerBoutique, fetchZones]);

  const handleSaveZone = async () => {
    setFormError('');

    if (!formData.name.trim()) {
      setFormError(t('nomRequis'));
      return;
    }

    if (!formData.baseFee) {
      setFormError(t('fraisRequis'));
      return;
    }

    const baseFeeNum = parseFloat(formData.baseFee);
    if (baseFeeNum < 0) {
      setFormError(t('fraisPositifs'));
      return;
    }

    let rayon = 0;

    if (formData.type === 'RADIUS') {
      // Sans rayon, aucune adresse ne peut être rattachée à la zone : elle ne
      // s'appliquerait jamais.
      rayon = parseFloat(formData.radiusKm);
      if (!(rayon > 0)) {
        setFormError(t('rayonRequis'));
        return;
      }
    } else {
      // À la création, ou après avoir cliqué « Redessiner » : les nouveaux
      // sommets font foi. Sinon, une zone existante garde son tracé.
      if (dessin && dessin.length > 0 && dessin.length < 3) {
        setFormError(t('polygoneTrois'));
        return;
      }
      if (!editingZone && (!dessin || dessin.length < 3)) {
        setFormError(t('dessinez'));
        return;
      }
    }

    setSaving(true);
    try {
      const token = jetonAcces();
      const payload: Record<string, unknown> = {
        storeId,
        name: formData.name,
        type: formData.type,
        color: formData.color,
        opacity: parseFloat(formData.opacity),
        baseFee: parseFloat(formData.baseFee),
        minOrder: formData.minOrder ? parseFloat(formData.minOrder) : 0,
        // Vide : la livraison n'est jamais offerte d'office.
        freeAbove: formData.freeAbove ? parseFloat(formData.freeAbove) : null,
        deliveryMinutes: formData.deliveryMinutes ? parseInt(formData.deliveryMinutes, 10) : null,
      };

      if (formData.type === 'RADIUS') {
        payload.radiusKm = rayon;
      } else if (dessin && dessin.length >= 3) {
        payload.polygon = dessin;
      }

      const url = editingZone
        ? `${API_URL}/api/delivery-zones/${editingZone.id}`
        : `${API_URL}/api/delivery-zones`;

      const response = await fetch(url, {
        method: editingZone ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const donnees = await response.json().catch(() => null);

      if (response.ok) {
        await fetchZones();
        setShowForm(false);
        setEditingZone(null);
        setFormData({ name: '', type: 'RADIUS', radiusKm: '', color: '#f59e0b', opacity: '0.35', baseFee: '', minOrder: '', freeAbove: '', deliveryMinutes: '' }); setDessin(null);
      } else {
        // Un refus muet laissait croire que la zone était enregistrée.
        setFormError(donnees?.error || t('saveError'));
      }
    } catch (error) {
      signalerErreur('Error saving delivery zone:', error);
      setFormError(t('serverError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteZone = async (id: string) => {
    if (!confirm(t('confirmerSuppression'))) return;

    setSaving(true);
    try {
      const token = jetonAcces();
      const response = await fetch(`${API_URL}/api/delivery-zones/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        await fetchZones();
      }
    } catch (error) {
      signalerErreur('Error deleting delivery zone:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleEditZone = (zone: DeliveryZone) => {
    setEditingZone(zone);
    setFormData({
      name: zone.name,
      type: zone.type,
      radiusKm: zone.radiusKm?.toString() || '',
      color: zone.color || '#f59e0b',
      opacity: (zone.opacity ?? 0.35).toString(),
      baseFee: zone.baseFee.toString(),
      minOrder: zone.minOrder?.toString() || '',
      freeAbove: zone.freeAbove != null ? zone.freeAbove.toString() : '',
      deliveryMinutes: zone.deliveryMinutes?.toString() || '',
    });
    // On ne repart pas en dessin : le tracé existant reste tel quel, sauf si
    // le commerçant clique explicitement sur « Redessiner cette zone ».
    setDessin(null);
    setFormError('');
    setShowForm(true);
  };

  /** Efface le tracé existant pour en reposer un nouveau, sommet par sommet. */
  const redessinerZone = () => setDessin([]);

  const handleAddZone = () => {
    setEditingZone(null);
    setFormData({ name: '', type: 'RADIUS', radiusKm: '', color: '#f59e0b', opacity: '0.35', baseFee: '', minOrder: '', freeAbove: '', deliveryMinutes: '' }); setDessin(null);
    setFormError('');
    setShowForm(true);
  };

  const filteredZones = zones.filter(
    (zone) =>
      zone.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      zone.baseFee.toString().includes(searchTerm)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="text-gray-900">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <MapPin className="text-amber-500" />
              {t('titre')}
            </h1>
            <p className="text-gray-500 mt-2">{t('gerez')}</p>
            {livreursPlateforme && (
              <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {t('livreursPlateforme')}
              </p>
            )}
          </div>
          <button
            onClick={handleAddZone}
            className="bg-orange-600 text-white hover:bg-orange-700 flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2 rounded-lg transition"
          >
            <Plus size={20} />
            {t('ajouter')}
          </button>
        </div>

        {/* La carte : la boutique, ses anneaux, et la poignée du rayon réglé.
            Le rayon se saisissait en kilomètres sans que rien ne dise ce qu'il
            couvrait. */}
        <div className="bg-white rounded-lg p-6 mb-8 border border-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-xl font-bold text-gray-900">{t('votreCarte')}</h2>

            {boutique && boutique.latitude == null && (
              <button
                type="button"
                onClick={situerDepuisLAdresse}
                disabled={situation}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-900 rounded-lg transition text-sm"
              >
                <Crosshair size={16} />
                {situation ? t('recherche') : t('situer')}
              </button>
            )}
          </div>

          {messageCarte && (
            <p role="status" className="text-sm text-green-600 mb-3">
              {messageCarte}
            </p>
          )}
          {erreurCarte && (
            <p role="status" className="text-sm text-red-600 mb-3">
              {erreurCarte}
            </p>
          )}

          {boutique?.latitude == null && (
            <p className="text-sm text-amber-700 mb-3">
              {t('nonSituee')}
            </p>
          )}

          {boutique?.latitude != null && (
            <p className="text-sm text-gray-500 mb-3">
              {t('positionFixee')}
            </p>
          )}

          <CarteZones
            latitude={boutique?.latitude ?? null}
            longitude={boutique?.longitude ?? null}
            zones={zones}
            zoneActive={
              showForm && formData.type === 'RADIUS'
                ? {
                    id: editingZone?.id ?? null,
                    name: formData.name || t('nouvelleZone'),
                    radiusKm: parseFloat(formData.radiusKm) || 0,
                  }
                : null
            }
            // Le point ne se règle qu'une fois, à la première mise en place :
            // une fois la boutique située, il devient fixe. Le déplacer plus
            // tard changerait silencieusement l'adresse de facturation et la
            // portée de toutes les zones déjà réglées — ça doit passer par les
            // réglages de la boutique (et par le support, une fois validée).
            onPosition={boutique?.latitude == null ? enregistrerPosition : undefined}
            onRayon={(km) => setFormData((actuel) => ({ ...actuel, radiusKm: String(km) }))}
            dessin={showForm && formData.type === 'POLYGON' ? dessin : null}
            onSommet={(latitude, longitude) =>
              setDessin((actuel) => [...(actuel || []), { latitude, longitude }])
            }
            couleurDessin={formData.color}
          />
        </div>

        {/* Create/Edit Form */}
        {showForm && (
          <div className="bg-white rounded-lg p-6 mb-8 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingZone ? t('modifierZone') : t('nouvelleZoneLivraison')}
            </h2>
            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-800">
                {formError}
              </div>
            )}
            {/* L'explication accompagne le formulaire : c'est en réglant une
                zone qu'on se demande laquelle s'appliquera. */}
            <p className="text-xs text-gray-500 mb-4">{t('zonesExplanation')}</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label htmlFor="zone-nom" className="text-gray-700 text-sm block mb-2">
                  {t('nomZone')}
                </label>
                <input
                  id="zone-nom"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('exempleNom')}
                  className="w-full px-3 py-2 bg-gray-100 text-gray-900 rounded-sm border border-gray-300 focus:border-amber-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label htmlFor="zone-forme" className="text-gray-700 text-sm block mb-2">
                  {t('forme')}
                </label>
                {editingZone ? (
                  // La forme d'une zone ne se change pas après coup : ça
                  // reviendrait à en recréer une autre sous le même nom.
                  <p className="px-3 py-2 bg-white text-gray-700 rounded-sm border border-gray-200 text-sm">
                    {formData.type === 'RADIUS' ? t('rayonAnneau') : t('polygoneDessine')}
                  </p>
                ) : (
                  <select
                    id="zone-forme"
                    value={formData.type}
                    onChange={(e) => {
                      const type = e.target.value as 'RADIUS' | 'POLYGON';
                      setFormData({ ...formData, type });
                      setDessin(type === 'POLYGON' ? [] : null);
                    }}
                    className="w-full px-3 py-2 bg-gray-100 text-gray-900 rounded-sm border border-gray-300 focus:border-amber-500 focus:outline-hidden"
                  >
                    <option value="RADIUS">{t('optionRayon')}</option>
                    <option value="POLYGON">{t('optionPolygone')}</option>
                  </select>
                )}
              </div>
              {formData.type === 'RADIUS' ? (
                <div>
                  {/* Le rayon fait la zone : sans lui, aucune adresse ne peut y
                      être rattachée et la zone ne s'applique jamais. */}
                  <label htmlFor="zone-rayon" className="text-gray-700 text-sm block mb-2">
                    {t('rayonKm')}
                  </label>
                  <input
                    id="zone-rayon"
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={formData.radiusKm}
                    onChange={(e) => setFormData({ ...formData, radiusKm: e.target.value })}
                    placeholder="3"
                    className="w-full px-3 py-2 bg-gray-100 text-gray-900 rounded-sm border border-gray-300 focus:border-amber-500 focus:outline-hidden"
                  />
                </div>
              ) : (
                <div>
                  <span className="text-gray-700 text-sm block mb-2">{t('trace')}</span>
                  {dessin != null ? (
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-2 bg-white text-gray-700 rounded-sm border border-gray-200 text-sm flex-1">
                        {t('sommets', { n: dessin.length })}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDessin((actuel) => (actuel && actuel.length > 0 ? actuel.slice(0, -1) : actuel))}
                        disabled={dessin.length === 0}
                        title={t('retirerSommet')}
                        className="px-2 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-900 rounded-sm text-sm"
                      >
                        ↩︎
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={redessinerZone}
                      className="w-full px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-sm border border-gray-300 text-sm"
                    >
                      {t('redessiner')}
                    </button>
                  )}
                </div>
              )}
              <div>
                <label htmlFor="zone-frais" className="text-gray-700 text-sm block mb-2">
                  {t('frais')}
                </label>
                <input
                  id="zone-frais"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.baseFee}
                  onChange={(e) => setFormData({ ...formData, baseFee: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-gray-100 text-gray-900 rounded-sm border border-gray-300 focus:border-amber-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label htmlFor="zone-minimum" className="text-gray-700 text-sm block mb-2">
                  {t('minimum')}
                </label>
                <input
                  id="zone-minimum"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.minOrder}
                  onChange={(e) => setFormData({ ...formData, minOrder: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-gray-100 text-gray-900 rounded-sm border border-gray-300 focus:border-amber-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label htmlFor="zone-offerte" className="text-gray-700 text-sm block mb-2">
                  {t('offerteDes')}
                </label>
                <input
                  id="zone-offerte"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.freeAbove}
                  onChange={(e) => setFormData({ ...formData, freeAbove: e.target.value })}
                  placeholder={t('jamais')}
                  className="w-full px-3 py-2 bg-gray-100 text-gray-900 rounded-sm border border-gray-300 focus:border-amber-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label htmlFor="zone-duree" className="text-gray-700 text-sm block mb-2">
                  {t('duree')}
                </label>
                <input
                  id="zone-duree"
                  type="number"
                  step="5"
                  min="5"
                  value={formData.deliveryMinutes}
                  onChange={(e) => setFormData({ ...formData, deliveryMinutes: e.target.value })}
                  placeholder="30"
                  className="w-full px-3 py-2 bg-gray-100 text-gray-900 rounded-sm border border-gray-300 focus:border-amber-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label htmlFor="zone-couleur" className="text-gray-700 text-sm block mb-2">
                  {t('couleur')}
                </label>
                <input
                  id="zone-couleur"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-full h-10 px-1 py-1 bg-gray-100 rounded-sm border border-gray-300 cursor-pointer"
                />
              </div>
              <div>
                <label htmlFor="zone-opacite" className="text-gray-700 text-sm block mb-2">
                  {t('opacite', { n: Math.round(parseFloat(formData.opacity) * 100) })}
                </label>
                <input
                  id="zone-opacite"
                  type="range"
                  min="0.1"
                  max="0.9"
                  step="0.05"
                  value={formData.opacity}
                  onChange={(e) => setFormData({ ...formData, opacity: e.target.value })}
                  className="w-full mt-3"
                />
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              {t('regle')}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleSaveZone}
                disabled={saving}
                className="bg-orange-600 text-white hover:bg-orange-700 px-4 py-2 rounded-sm transition disabled:opacity-50"
              >
                {editingZone ? t('mettreAJour') : t('create')}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingZone(null);
                  setFormData({ name: '', type: 'RADIUS', radiusKm: '', color: '#f59e0b', opacity: '0.35', baseFee: '', minOrder: '', freeAbove: '', deliveryMinutes: '' }); setDessin(null);
                }}
                className="px-4 py-2 bg-gray-100 text-gray-900 rounded-sm hover:bg-gray-200 transition"
              >
                {t('annuler')}
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-gray-500" size={20} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('rechercher')}
              className="w-full pl-10 pr-4 py-2 bg-white text-gray-900 rounded-lg border border-gray-200 focus:border-amber-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Zones Grid */}
        {filteredZones.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredZones.map((zone) => (
              <div key={zone.id} className="bg-white rounded-lg p-6 border border-gray-200 hover:border-amber-500 transition">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0 border border-white/30"
                        style={{ backgroundColor: zone.color }}
                        title={t('couleurCarte', { couleur: zone.color })}
                      />
                      <h3 className="text-lg font-bold text-gray-900">{zone.name}</h3>
                    </div>
                    <p className="text-gray-500 text-sm">
                      {zone.type === 'RADIUS' ? t('zoneRayon') : t('zonePolygone')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditZone(zone)}
                      className="p-2 text-amber-600 hover:bg-gray-100 rounded-sm transition"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDeleteZone(zone.id)}
                      disabled={saving}
                      className="p-2 text-red-600 hover:bg-gray-100 rounded-sm transition disabled:opacity-50"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">{t('fraisBase')}</span>
                    <span className="text-gray-900 font-semibold">{euro(zone.baseFee)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">{t('commandeMin')}</span>
                    <span className="text-gray-900 font-semibold">{euro(zone.minOrder)}</span>
                  </div>
                  {zone.freeAbove != null && zone.baseFee > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">{t('offerteDesCarte')}</span>
                      <span className="text-green-600 font-semibold">{euro(zone.freeAbove)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">{zone.type === 'RADIUS' ? t('rayon') : t('sommetsTitre')}</span>
                    <span className="text-gray-900 font-semibold">
                      {zone.type === 'RADIUS' ? t('km', { n: zone.radiusKm ?? 0 }) : t('points', { n: zone.polygon?.length ?? 0 })}
                    </span>
                  </div>
                  {zone.deliveryMinutes && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">{t('dureeAnnoncee')}</span>
                      <span className="text-gray-900 font-semibold">{t('minutes', { n: zone.deliveryMinutes })}</span>
                    </div>
                  )}
                  <div className="text-xs pt-2 border-t border-gray-200">
                    {zone.isActive ? (
                      <span className="text-green-600">{t('zoneLivree')}</span>
                    ) : (
                      <span className="text-orange-600">{t('zoneDesactivee')}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <MapPin className="mx-auto text-gray-400 mb-4" size={48} />
            <p className="text-gray-500 text-lg">
              {zones.length === 0 ? t('aucuneZone') : t('aucuneTrouvee')}
            </p>
            {zones.length === 0 && (
              <button
                onClick={handleAddZone}
                className="bg-orange-600 text-white hover:bg-orange-700 mt-4 px-4 py-2 rounded-lg transition inline-flex items-center gap-2"
              >
                <Plus size={20} />
                {t('premiere')}
              </button>
            )}
          </div>
        )}

        {/* Stats */}
        {zones.length > 0 && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <p className="text-gray-500 text-sm">{t('totalZones')}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{zones.length}</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <p className="text-gray-500 text-sm">{t('fraisMoyen')}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {euro(zones.length > 0 ? zones.reduce((sum, z) => sum + Number(z.baseFee || 0), 0) / zones.length : 0)}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <p className="text-gray-500 text-sm">{t('commandeMinMax')}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {euro(Math.max(...zones.map((z) => z.minOrder)))}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
