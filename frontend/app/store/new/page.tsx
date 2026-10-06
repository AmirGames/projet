'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { espaceDAccueilLocal } from '@/lib/espace-utilisateur';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function CreateStorePage() {
  const t = useTranslations('nouvelleBoutique');
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [orgBlocked, setOrgBlocked] = useState<{ status: string; reason?: string } | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    address: '',
    city: '',
    postalCode: '',
    phone: '',
    email: '',
    /**
     * Les coordonnées de l'adresse retenue.
     *
     * Elles étaient jetées : la boutique naissait sans position, et la livraison
     * annonçait ensuite au client « cette boutique n'a pas encore situé son
     * adresse ». Le serveur sait aussi les retrouver seul, mais autant les lui
     * donner quand la suggestion les fournit.
     */
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
    /**
     * Ce que vend ce commerce, et ce qu'on y mange.
     *
     * Le formulaire ne le demandait pas : toute boutique naissait « restaurant »
     * sans genre, et le client ne pouvait ni distinguer une épicerie d'un
     * fleuriste, ni chercher une pizzeria.
     */
    businessType: 'restaurant',
    cuisineType: '',
  });

  // Les listes viennent du serveur : recopiées ici, elles auraient dérivé dès
  // la première addition.
  const [etablissements, setEtablissements] = useState<{ code: string; libelle: string }[]>([]);
  const [cuisines, setCuisines] = useState<{ code: string; libelle: string }[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/api/stores/types`)
      .then((r) => r.json())
      .then((lu) => {
        setEtablissements(lu?.data?.etablissements || []);
        setCuisines(lu?.data?.cuisines || []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const checkOrgStatus = async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      try {
        const res = await fetch(`${API_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;

        const data = await res.json();
        const org = data.organizations?.[0];
        if (org && org.status !== 'ACTIVE') {
          setOrgBlocked({
            status: org.status,
            reason: org.suspensionReason || org.closureReason,
          });
        }
      } catch {
        // Le backend reste la garantie : il refuse la création si le compte est bloqué.
      }
    };

    checkOrgStatus();
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setFormData((prev) => ({
      ...prev,
      name,
      slug: generateSlug(name),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        router.push('/login');
        return;
      }

      const meRes = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!meRes.ok) {
        setError(t('erreurAuth'));
        return;
      }

      const meData = await meRes.json();
      const orgId = meData.organizations?.[0]?.id;

      if (!orgId) {
        setError(t('aucuneOrganisation'));
        return;
      }

      const response = await fetch(`${API_URL}/api/stores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orgId,
          name: formData.name,
          slug: formData.slug,
          address: formData.address,
          city: formData.city,
          postalCode: formData.postalCode,
          phone: formData.phone,
          email: formData.email || undefined,
          description: formData.description,
          latitude: formData.latitude,
          longitude: formData.longitude,
          businessType: formData.businessType || undefined,
          // Une cuisine n'a de sens qu'en restauration.
          cuisineType:
            formData.businessType === 'restaurant' && formData.cuisineType
              ? formData.cuisineType
              : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setError(errorData?.error || errorData?.message || t('erreurCreation'));
        return;
      }

      router.push(espaceDAccueilLocal());
    } catch (err) {
      setError(t('erreurConnexion'));
      signalerErreur(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F6] text-gray-900">
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="max-w-2xl mx-auto">
          <Link href="/dashboard" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
            {t('retour')}
          </Link>
          <h1 className="text-3xl font-bold">{t('titre')}</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white border border-gray-200 rounded-lg p-8">
          {error && (
            <div className="bg-red-600 text-white p-4 rounded-lg mb-6">
              {error}
            </div>
          )}

          {orgBlocked && (
            <div
              className={`${
                orgBlocked.status === 'SUSPENDED' ? 'bg-yellow-100 border-yellow-500/50' : 'bg-red-100 border-red-500/50'
              } border p-4 rounded-lg mb-6`}
            >
              <p className={`font-bold ${orgBlocked.status === 'SUSPENDED' ? 'text-yellow-600' : 'text-red-600'}`}>
                {orgBlocked.status === 'SUSPENDED'
                  ? t('suspendu')
                  : t('ferme')}
              </p>
              <p className="text-sm text-gray-700 mt-1">
                {t('bloqueRaison', { raison: orgBlocked.reason || t('nonSpecifiee') })}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-4">{t('infos')}</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-700 mb-2 font-medium">
                    {t('nom')}
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleNameChange}
                    placeholder={t('nomExemple')}
                    className="w-full px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-gray-700 mb-2 font-medium">
                    {t('slug')}
                  </label>
                  <input
                    type="text"
                    name="slug"
                    value={formData.slug}
                    onChange={handleChange}
                    placeholder="ma-pizzeria"
                    className="w-full px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="businessType" className="block text-gray-700 mb-2 font-medium">
                      {t('typeEntreprise')}
                    </label>
                    <select
                      id="businessType"
                      name="businessType"
                      value={formData.businessType}
                      onChange={handleChange}
                      className="w-full px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      {etablissements.map((genre) => (
                        <option key={genre.code} value={genre.code}>
                          {genre.libelle}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Une épicerie n'a pas de cuisine : le champ n'apparaît que
                      là où il a un sens. */}
                  {formData.businessType === 'restaurant' && (
                    <div>
                      <label htmlFor="cuisineType" className="block text-gray-700 mb-2 font-medium">
                        {t('typeCuisine')}
                      </label>
                      <select
                        id="cuisineType"
                        name="cuisineType"
                        value={formData.cuisineType}
                        onChange={handleChange}
                        className="w-full px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">{t('selectionnez')}</option>
                        {cuisines.map((genre) => (
                          <option key={genre.code} value={genre.code}>
                            {genre.libelle}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-gray-700 mb-2 font-medium">
                    {t('description')}
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder={t('descriptionAide')}
                    rows={3}
                    className="w-full px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold mb-4">{t('adresseTitre')}</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-700 mb-2 font-medium">
                    {t('adresseTitre')}
                  </label>
                  <AddressAutocomplete
                    value={formData.address}
                    onChange={(valeur) =>
                      setFormData({
                        ...formData,
                        address: valeur,
                        // Taper par-dessus une suggestion rendrait sa position
                        // fausse.
                        latitude: undefined,
                        longitude: undefined,
                      })
                    }
                    onSelect={(adresse) =>
                      setFormData({
                        ...formData,
                        address: adresse.street,
                        city: adresse.city || formData.city,
                        postalCode: adresse.postalCode || formData.postalCode,
                        latitude: adresse.latitude ?? undefined,
                        longitude: adresse.longitude ?? undefined,
                      })
                    }
                    placeholder={t('adresseExemple')}
                    className="w-full px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-700 mb-2 font-medium">
                      {t('ville')}
                    </label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      placeholder={t('villeExemple')}
                      className="w-full px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-700 mb-2 font-medium">
                      {t('codePostal')}
                    </label>
                    <input
                      type="text"
                      name="postalCode"
                      value={formData.postalCode}
                      onChange={handleChange}
                      placeholder="4000"
                      className="w-full px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold mb-4">{t('contact')}</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-700 mb-2 font-medium">
                    {t('telephone')}
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+32 4 XX XX XX XX"
                    className="w-full px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 mb-2 font-medium">
                    {t('email')}
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder={t('emailExemple')}
                    className="w-full px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-6">
              <button
                type="submit"
                disabled={loading || orgBlocked !== null}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg"
              >
                {loading ? t('creation') : t('creer')}
              </button>
              <Link
                href="/dashboard"
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold py-3 px-4 rounded-lg text-center"
              >
                {t('annuler')}
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
