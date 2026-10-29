'use client';


import { jetonAcces } from '@/lib/jeton-session';
import CompteVersementLivreur from '@/components/CompteVersementLivreur';
import { signalerErreur } from '@/lib/erreurs';
import { useState, useCallback } from 'react';
import { telephoneInternational } from '@/lib/pays-infos';
import { paysDuNavigateur } from '@/lib/pays-client';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, User, Mail, Phone, MapPin, FileText, Star } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Driver {
  /** Le compte des versements du lundi (jamais l'IBAN entier). */
  compte?: { ibanFin: string; titulaire?: string | null; valide: boolean } | null;
  id: string;
  name: string;
  email?: string;
  phone: string;
  vehicleType?: 'bike' | 'scooter' | 'car';
  vehiclePlate?: string | null;
  address?: string;
  rating: number | null;
  avis?: number;
  totalEarnings: number;
  completedDeliveries: number;
  isAvailable: boolean;
  status?: string;
  bceNumber?: string | null;
  bceStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  bceReviewReason?: string | null;
  documents?: Array<{
    type: string;
    status: string;
  }> | null;
  createdAt?: string;
}

interface VehicleChangeState {
  currentVehicleType: string;
  currentVehiclePlate: string | null;
  request: null | {
    id: string;
    currentVehicleType: string;
    requestedVehicleType: string;
    requestedVehiclePlate: string | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | string;
    reviewNote: string | null;
    documents: Array<{
      type: string;
      libelle: string;
      documentId: string | null;
      status: string;
      reviewNote: string | null;
      uploadedForRequest: boolean;
    }>;
    dossierComplet: boolean;
  };
}

export default function DriverProfilePage() {
  const t = useTranslations('driverProfile');
  const router = useRouter();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [bceNumber, setBceNumber] = useState('');
  const [bceSaving, setBceSaving] = useState(false);
  const [vehicleChange, setVehicleChange] = useState<VehicleChangeState | null>(null);
  const [vehicleTypeDraft, setVehicleTypeDraft] = useState<'bike' | 'scooter' | 'car'>('scooter');
  const [vehiclePlateDraft, setVehiclePlateDraft] = useState('');
  const [vehicleChangeSaving, setVehicleChangeSaving] = useState(false);
  const [vehicleDocumentUploading, setVehicleDocumentUploading] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
  });

  const loadDriverData = useCallback(async () => {
    const token = jetonAcces();
    if (!token) {
      router.push('/driver/login');
      return;
    }

    try {
      const [response, documentsResponse] = await Promise.all([
        fetch(`${API_URL}/api/drivers/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/drivers/documents`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (response.ok) {
        const data = await response.json();
        const dossier = documentsResponse.ok ? await documentsResponse.json() : null;
        const documents = Array.isArray(dossier?.data?.documents) ? dossier.data.documents : null;
        const vehicleState = dossier?.data?.vehicleChange as VehicleChangeState | undefined;
        setDriver({ ...data.data, documents });
        setVehicleChange(vehicleState ?? null);
        setVehicleTypeDraft((vehicleState?.request?.status === 'PENDING' ? vehicleState.request.requestedVehicleType : data.data.vehicleType === 'bike' ? 'scooter' : 'bike') as 'bike' | 'scooter' | 'car');
        setVehiclePlateDraft(vehicleState?.request?.requestedVehiclePlate || '');
        setBceNumber(data.data.bceNumber || '');
        setFormData({
          name: data.data.name || '',
          email: data.data.email || '',
          phone: data.data.phone || '',
          address: data.data.address || '',
        });
      } else if (response.status === 401) {
        router.push('/driver/login');
      }
    } catch (err) {
      signalerErreur('Error loading driver data:', err);
      setError(t('erreurChargement'));
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffectChargement(() => {
    loadDriverData();
  }, [loadDriverData]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = jetonAcces();
    if (!token) return;

    try {
      setError('');
      setSuccess('');

      const response = await fetch(`${API_URL}/api/drivers/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          phone: formData.phone ? telephoneInternational(formData.phone, paysDuNavigateur()) : formData.phone,
        })
      });

      if (response.ok) {
        setSuccess(t('misAJour'));
        setIsEditing(false);
        loadDriverData();
      } else {
        const data = await response.json();
        setError(data.error || t('erreurMiseAJour'));
      }
    } catch (err) {
      signalerErreur('Error updating profile:', err);
      setError(t('erreurConnexion'));
    }
  };

  const handleUpdateBce = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = jetonAcces();
    if (!token || bceSaving) return;
    setBceSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`${API_URL}/api/drivers/me/bce`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bceNumber }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || t('erreurMiseAJourBce'));
        return;
      }
      setBceNumber(data.data?.bceNumber || bceNumber);
      setSuccess(t('bceSoumis'));
      await loadDriverData();
    } catch (err) {
      signalerErreur('Error updating BCE number:', err);
      setError(t('erreurConnexion'));
    } finally {
      setBceSaving(false);
    }
  };

  const submitVehicleChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = jetonAcces();
    if (!token || vehicleChangeSaving) return;
    setVehicleChangeSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`${API_URL}/api/drivers/vehicle-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ vehicleType: vehicleTypeDraft, vehiclePlate: vehicleTypeDraft === 'bike' ? null : vehiclePlateDraft }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || t('vehicleChangeError'));
        return;
      }
      setSuccess(t('vehicleChangeSubmitted'));
      await loadDriverData();
    } catch (err) {
      signalerErreur('Error requesting vehicle change:', err);
      setError(t('erreurConnexion'));
    } finally {
      setVehicleChangeSaving(false);
    }
  };

  const uploadVehicleDocument = async (type: string, file?: File) => {
    const token = jetonAcces();
    const request = vehicleChange?.request;
    if (!token || !request || !file || vehicleDocumentUploading) return;
    setVehicleDocumentUploading(type);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('type', type);
      const response = await fetch(`${API_URL}/api/drivers/vehicle-change/${request.id}/documents/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || t('vehicleChangeError'));
        return;
      }
      setSuccess(t('vehicleDocumentUploaded'));
      await loadDriverData();
    } catch (err) {
      signalerErreur('Error uploading vehicle change document:', err);
      setError(t('erreurConnexion'));
    } finally {
      setVehicleDocumentUploading(null);
    }
  };

  const cancelVehicleChange = async () => {
    const token = jetonAcces();
    const request = vehicleChange?.request;
    if (!token || !request || request.status !== 'PENDING') return;
    setVehicleChangeSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/drivers/vehicle-change/${request.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error || t('vehicleChangeError'));
        return;
      }
      setSuccess(t('vehicleChangeCancelled'));
      await loadDriverData();
    } catch (err) {
      signalerErreur('Error cancelling vehicle change:', err);
      setError(t('erreurConnexion'));
    } finally {
      setVehicleChangeSaving(false);
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-900">{t('chargement')}</p>
        </div>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-900 text-lg mb-4">{t('erreurProfil')}</p>
          <button
            onClick={() => router.push('/driver')}
            className="bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded-lg"
          >
            {t('retourTableau')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="pt-4">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/driver">
                <button className="p-2 hover:bg-gray-100 rounded-lg transition">
                  <ArrowLeft size={20} className="text-gray-500" />
                </button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{t('monProfil')}</h1>
                <p className="text-gray-500 text-sm">{t('gerez')}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Messages */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800">{success}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Sidebar - Stats */}
          <div className="space-y-6">
            {/* Profile Avatar */}
            <div className="bg-white ring-1 ring-gray-200 rounded-lg p-6 text-center">
              <div className="w-24 h-24 bg-linear-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center text-white text-4xl font-bold mx-auto mb-4">
                {driver.name.charAt(0)}
              </div>
              <p className="text-gray-900 text-lg font-semibold">{driver.name}</p>
              <div className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-semibold ${
                driver.status === 'VALIDATED'
                  ? 'bg-green-50 text-green-600'
                  : driver.status === 'PENDING'
                  ? 'bg-yellow-50 text-yellow-600'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {driver.status === 'VALIDATED' && t('statutValide')}
                {driver.status === 'PENDING' && t('statutEnAttente')}
                {!driver.status && t('statutNouveau')}
              </div>
            </div>

            {/* Stats */}
            <div className="bg-white ring-1 ring-gray-200 rounded-lg p-6 space-y-4">
              <div className="border-b border-gray-200 pb-4">
                <p className="text-gray-500 text-sm mb-2">{t('noteMoyenne')}</p>
                <div className="flex items-center gap-2">
                  <Star size={24} className="text-yellow-500" />
                  <div>
                    {driver.rating == null ? (
                      <p className="text-gray-900 font-semibold">{t('pasEncoreNote')}</p>
                    ) : (
                      <>
                        <p className="text-gray-900 text-xl font-bold">
                          {driver.rating.toFixed(1).replace('.', ',')}
                        </p>
                        <p className="text-gray-500 text-xs">{driver.avis} avis</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-b border-gray-200 pb-4">
                <p className="text-gray-500 text-sm mb-2">{t('livraisonsCompletees')}</p>
                <p className="text-gray-900 text-2xl font-bold">{driver.completedDeliveries}</p>
              </div>

              <div>
                <p className="text-gray-500 text-sm mb-2">{t('revenusTotaux')}</p>
                <p className="text-gray-900 text-2xl font-bold">
                  {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(driver.totalEarnings || 0)}
                </p>
              </div>
            </div>

            {/* Documents Status */}
            <div className="bg-white ring-1 ring-gray-200 rounded-lg p-6">
              <p className="text-gray-900 font-semibold mb-4 flex items-center gap-2">
                <FileText size={18} />
                {t('documentsRequis')}
              </p>
              <div className="space-y-3">
                {[
                  ['identity', t('carteIdentite')],
                  ['license', t('permis')],
                  ['insurance', t('assurance')],
                ].map(([type, label]) => {
                  const approuve = driver.documents?.some((document) => document.type === type && document.status === 'APPROVED') ?? false;
                  const charge = driver.documents !== null && driver.documents !== undefined;
                  return (
                    <div key={type} className="flex items-center justify-between">
                      <span className="text-gray-500 text-sm">{label}</span>
                      <span className={`text-sm font-semibold ${!charge ? 'text-gray-500' : approuve ? 'text-green-600' : 'text-red-600'}`}>
                        {!charge ? '—' : approuve ? '✓' : '✗'}
                      </span>
                    </div>
                  );
                })}
              </div>
              {!driver.documents && (
                <p className="mt-3 text-xs text-gray-500" role="status">{t('documentsIndisponibles')}</p>
              )}
            </div>
          </div>

          {/* Right Side - Profile Form */}
          <div className="lg:col-span-2">
            {(driver.status === 'ACTIVE' || vehicleChange?.request?.status === 'PENDING') && (
            <section className="mb-6 bg-white ring-1 ring-gray-200 rounded-lg p-8" aria-labelledby="vehicle-change-title">
              <h2 id="vehicle-change-title" className="text-xl font-bold text-gray-900">{t('vehicleChangeTitle')}</h2>
              <p className="mt-2 text-sm text-gray-600">
                {t('vehicleCurrent', { vehicle: t(`vehicleTypes.${driver.vehicleType || 'bike'}`) })}
              </p>

              {vehicleChange?.request?.status === 'PENDING' ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="status">
                    {t('vehicleChangePending', { vehicle: t(`vehicleTypes.${vehicleChange.request.requestedVehicleType}`) })}
                    <br />{t('vehicleKeepCurrent')}
                  </div>
                  <ul className="space-y-3">
                    {vehicleChange.request.documents.map((document) => {
                      const canUpload = ['MISSING', 'REJECTED', 'EXPIRED'].includes(document.status);
                      return (
                        <li key={document.type} className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
                          <div>
                            <p className="font-medium text-gray-900">{document.libelle}</p>
                            <p className={`text-sm ${document.status === 'APPROVED' ? 'text-green-700' : document.status === 'PENDING' ? 'text-amber-700' : 'text-gray-600'}`}>
                              {document.status === 'APPROVED' ? t('vehicleDocumentApproved') : document.status === 'PENDING' ? t('vehicleDocumentPending') : document.status === 'MISSING' ? t('vehicleDocumentMissing') : t('vehicleDocumentNeedsReplacement')}
                            </p>
                            {document.reviewNote && <p className="mt-1 text-sm text-red-700">{document.reviewNote}</p>}
                          </div>
                          {canUpload && (
                            <label className="cursor-pointer rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700">
                              {vehicleDocumentUploading === document.type ? t('vehicleDocumentUploading') : t('vehicleDocumentAdd')}
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                className="sr-only"
                                disabled={vehicleDocumentUploading !== null}
                                onChange={(event) => {
                                  void uploadVehicleDocument(document.type, event.currentTarget.files?.[0]);
                                  event.currentTarget.value = '';
                                }}
                              />
                            </label>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <button type="button" onClick={cancelVehicleChange} disabled={vehicleChangeSaving} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    {vehicleChangeSaving ? t('vehicleChangeSaving') : t('vehicleChangeCancel')}
                  </button>
                </div>
              ) : (
                <>
                  {vehicleChange?.request?.status === 'APPROVED' && (
                    <p className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-800" role="status">{t('vehicleChangeApproved')}</p>
                  )}
                  {vehicleChange?.request?.status === 'REJECTED' && (
                    <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="status">
                      {t('vehicleChangeRejected')} {vehicleChange.request.reviewNote || ''}
                    </p>
                  )}
                  <form onSubmit={submitVehicleChange} className="mt-4 space-y-4">
                    <div>
                      <label htmlFor="requested-vehicle" className="mb-1 block text-sm font-medium text-gray-700">{t('vehicleChangeChoose')}</label>
                      <select id="requested-vehicle" value={vehicleTypeDraft} onChange={(event) => setVehicleTypeDraft(event.target.value as 'bike' | 'scooter' | 'car')} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-orange-600">
                        {(['bike', 'scooter', 'car'] as const).filter((type) => type !== driver.vehicleType).map((type) => (
                          <option key={type} value={type}>{t(`vehicleTypes.${type}`)}</option>
                        ))}
                      </select>
                    </div>
                    {vehicleTypeDraft !== 'bike' && (
                      <div>
                        <label htmlFor="requested-vehicle-plate" className="mb-1 block text-sm font-medium text-gray-700">{t('vehicleChangePlate')}</label>
                        <input id="requested-vehicle-plate" required maxLength={20} value={vehiclePlateDraft} onChange={(event) => setVehiclePlateDraft(event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-orange-600" />
                      </div>
                    )}
                    <p className="text-sm text-gray-600">{t('vehicleChangeExplanation')}</p>
                    <button type="submit" disabled={vehicleChangeSaving || (vehicleTypeDraft !== 'bike' && !vehiclePlateDraft.trim())} className="rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white hover:bg-orange-700 disabled:opacity-50">
                      {vehicleChangeSaving ? t('vehicleChangeSaving') : t('vehicleChangeSubmit')}
                    </button>
                  </form>
                </>
              )}
            </section>
            )}

            <div className="bg-white ring-1 ring-gray-200 rounded-lg p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">{t('infosPerso')}</h2>
                <button
                  onClick={() => {
                    setIsEditing(!isEditing);
                    if (driver) {
                      setFormData({
                        name: driver.name || '',
                        email: driver.email || '',
                        phone: driver.phone || '',
                        address: driver.address || '',
                      });
                    }
                  }}
                  className={`font-semibold py-2 px-4 rounded-lg transition ${
                    isEditing
                      ? 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                      : 'bg-orange-600 text-white hover:bg-orange-700'
                  }`}
                >
                  {isEditing ? t('cancel') : t('edit')}
                </button>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-6">
                {/* Name */}
                <div>
                  <label className="flex items-center gap-2 text-gray-500 text-sm mb-2">
                    <User size={16} />
                    {t('nomComplet')}
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    className="w-full bg-gray-100 text-gray-900 rounded-lg px-4 py-2 disabled:opacity-60 focus:outline-hidden focus:ring-2 focus:ring-orange-600"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="flex items-center gap-2 text-gray-500 text-sm mb-2">
                    <Mail size={16} />
                    {t('email')}
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    className="w-full bg-gray-100 text-gray-900 rounded-lg px-4 py-2 disabled:opacity-60 focus:outline-hidden focus:ring-2 focus:ring-orange-600"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="flex items-center gap-2 text-gray-500 text-sm mb-2">
                    <Phone size={16} />
                    {t('telephone')}
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    className="w-full bg-gray-100 text-gray-900 rounded-lg px-4 py-2 disabled:opacity-60 focus:outline-hidden focus:ring-2 focus:ring-orange-600"
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="flex items-center gap-2 text-gray-500 text-sm mb-2">
                    <MapPin size={16} />
                    {t('adresse')}
                  </label>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    rows={3}
                    className="w-full bg-gray-100 text-gray-900 rounded-lg px-4 py-2 disabled:opacity-60 focus:outline-hidden focus:ring-2 focus:ring-orange-600"
                  />
                </div>

                {/* Submit Button */}
                {isEditing && (
                  <div className="pt-6 border-t border-gray-200">
                    <button
                      type="submit"
                      className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-lg transition"
                    >
                      {t('enregistrer')}
                    </button>
                  </div>
                )}
              </form>
            </div>

            <section className="mt-6 bg-white ring-1 ring-gray-200 rounded-lg p-8" aria-labelledby="bce-title">
              <h2 id="bce-title" className="text-xl font-bold text-gray-900">{t('bceTitre')}</h2>
              <p className="mt-2 text-sm text-gray-600">{t('bceExplication')}</p>
              <p className={`mt-3 text-sm font-semibold ${driver.bceStatus === 'VERIFIED' ? 'text-green-700' : driver.bceStatus === 'REJECTED' ? 'text-red-700' : 'text-amber-700'}`}>
                {driver.bceStatus === 'VERIFIED' ? t('bceVerifie') : driver.bceStatus === 'REJECTED' ? t('bceRefuse') : t('bceEnAttente')}
              </p>
              {driver.bceReviewReason && <p className="mt-1 text-sm text-red-700">{driver.bceReviewReason}</p>}
              <form onSubmit={handleUpdateBce} className="mt-4 space-y-3">
                <label htmlFor="bceNumber" className="block text-sm font-medium text-gray-700">{t('bceNumero')}</label>
                <input id="bceNumber" name="bceNumber" type="text" required maxLength={32} autoComplete="off" value={bceNumber} onChange={(e) => setBceNumber(e.target.value)} placeholder="0123.456.749" className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-orange-600" />
                <button type="submit" disabled={bceSaving || !bceNumber.trim()} className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg">
                  {bceSaving ? t('bceEnvoi') : t('bceEnregistrer')}
                </button>
              </form>
            </section>

            <CompteVersementLivreur compte={driver?.compte} onSaved={loadDriverData} />

            {/* Quick Links */}
            <div className="mt-6 grid grid-cols-2 gap-4">
              <Link href="/driver/earnings">
                <button className="w-full bg-white hover:bg-gray-100 text-gray-900 font-semibold py-3 rounded-lg transition border border-gray-200">
                  {t('voirRevenus')}
                </button>
              </Link>
              <Link href="/driver/deliveries">
                <button className="w-full bg-white hover:bg-gray-100 text-gray-900 font-semibold py-3 rounded-lg transition border border-gray-200">
                  {t('historique')}
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
