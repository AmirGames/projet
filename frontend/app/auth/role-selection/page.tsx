"use client";

import { signalerErreur } from '@/lib/erreurs';
import { useState, useEffect } from "react";
import { telephoneInternational } from "@/lib/pays-infos";
import { paysDuNavigateur } from "@/lib/pays-client";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { slugify } from "@/lib/slug";
import { useTypesDeCommerce } from "@/lib/types-commerce";
import Link from "next/link";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { useTranslations } from 'next-intl';

interface Roles {
  customer: {
    active: boolean;
    customerId: string | null;
  };
  driver: {
    active: boolean;
    driverId: string | null;
    status: string | null;
  };
  merchant: {
    active: boolean;
    organizations: Array<{
      id: string;
      name: string;
      role: string;
    }>;
  };
}

export default function RoleSelectionPage() {
  const t = useTranslations('common');
  const tr = useTranslations('choixRole');
  const router = useRouter();
  const [roles, setRoles] = useState<Roles | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showMerchantForm, setShowMerchantForm] = useState(false);
  const [showDriverForm, setShowDriverForm] = useState(false);
  const [merchantFormData, setMerchantFormData] = useState({
    businessName: "",
    storeName: "",
    storeSlug: "",
    businessType: "",
    cuisineType: "",
    phone: "",
    address: "",
    city: "",
    postalCode: "",
    description: "",
  });
  const { etablissements, cuisines } = useTypesDeCommerce();
  const [driverFormData, setDriverFormData] = useState({
    name: "",
    email: "",
    phone: "",
    vehicleType: "",
    vehiclePlate: "",
  });

  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const data = await api.getRoles();
        setRoles(data.roles);
      } catch (err) {
        setError(tr('erreurRoles'));
        signalerErreur(err);
      } finally {
        setLoading(false);
      }
    };

    fetchRoles();
  }, [tr]);

  const handleBecomeMerchant = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      await api.becomeMerchant({
        ...merchantFormData,
        phone: telephoneInternational(merchantFormData.phone, paysDuNavigateur()),
        // Une cuisine n'a de sens qu'en restauration.
        cuisineType:
          merchantFormData.businessType === "restaurant" && merchantFormData.cuisineType
            ? merchantFormData.cuisineType
            : null,
      });
      // Refresh roles
      const data = await api.getRoles();
      setRoles(data.roles);
      setShowMerchantForm(false);
      setMerchantFormData({
        businessName: "",
        storeName: "",
        storeSlug: "",
        businessType: "",
        cuisineType: "",
        phone: "",
        address: "",
        city: "",
        postalCode: "",
        description: "",
      });
    } catch (err: any) {
      setError(err.message || tr('erreurCommerce'));
      signalerErreur(err);
    }
  };

  const handleBecomeDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      await api.becomeDriver({
        ...driverFormData,
        phone: telephoneInternational(driverFormData.phone, paysDuNavigateur()),
      });
      // Refresh roles
      const data = await api.getRoles();
      setRoles(data.roles);
      setShowDriverForm(false);
      setDriverFormData({
        name: "",
        email: "",
        phone: "",
        vehicleType: "",
        vehiclePlate: "",
      });
    } catch (err: any) {
      setError(err.message || tr('erreurLivreur'));
      signalerErreur(err);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-[#F7F7F6] flex items-center justify-center"><div className="text-gray-900">{tr('chargement')}</div></div>;
  }

  return (
    <div className="min-h-screen bg-[#F7F7F6] p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-2 text-center">
          {tr('titre')}
        </h1>
        <p className="text-gray-500 text-center mb-8">
          {tr('sousTitre')}
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg mb-8">
            {error}
          </div>
        )}

        {roles && (
          <div className="grid md:grid-cols-3 gap-6">
            {/* Customer Role */}
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <div className="flex items-center mb-4">
                <div
                  className={`w-4 h-4 rounded-full mr-3 ${
                    roles.customer.active ? "bg-green-500" : "bg-gray-500"
                  }`}
                />
                <h2 className="text-xl font-bold text-gray-900">{tr('client')}</h2>
              </div>
              <p className="text-gray-500 mb-4">
                {tr('clientAide')}
              </p>
              <div className="space-y-2 mb-6">
                <p className="text-sm text-gray-500">
                  <span className="text-green-600 font-semibold">{tr('actif')}</span>
                </p>
              </div>
              <button
                onClick={() => router.push("/client")}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
              >
                {tr('acceder')}
              </button>
            </div>

            {/* Merchant Role */}
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <div className="flex items-center mb-4">
                <div
                  className={`w-4 h-4 rounded-full mr-3 ${
                    roles.merchant.active ? "bg-green-500" : "bg-gray-500"
                  }`}
                />
                <h2 className="text-xl font-bold text-gray-900">{tr('commercant')}</h2>
              </div>
              <p className="text-gray-500 mb-4">
                {tr('commercantAide')}
              </p>
              {roles.merchant.active ? (
                <div className="space-y-2 mb-6">
                  {roles.merchant.organizations.map((org) => (
                    <div
                      key={org.id}
                      className="text-sm bg-gray-100 p-2 rounded text-gray-800"
                    >
                      <p className="font-semibold">{org.name}</p>
                      <p className="text-xs text-gray-500">{org.role}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 mb-6">
                  {tr('premiereBoutique')}
                </p>
              )}
              <div className="space-y-2">
                {roles.merchant.active && (
                  <button
                    onClick={() => {
                      // L'espace commerçant lit l'entreprise courante ; seule la
                      // page de connexion la retenait, et un commerçant tout
                      // juste créé ici était renvoyé vers la connexion.
                      const organisations = roles.merchant.organizations;
                      const courante = localStorage.getItem("currentOrgId");
                      if (organisations.length && !organisations.some((org) => org.id === courante)) {
                        localStorage.setItem("currentOrgId", organisations[0].id);
                      }
                      router.push("/merchant");
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
                  >
                    {tr('acceder')}
                  </button>
                )}
                <button
                  onClick={() => setShowMerchantForm(!showMerchantForm)}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg"
                >
                  {showMerchantForm
                    ? t('cancel')
                    : roles.merchant.active
                      ? tr('ajouterBoutique')
                      : tr('devenirCommercant')}
                </button>
              </div>
            </div>

            {/* Driver Role */}
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <div className="flex items-center mb-4">
                <div
                  className={`w-4 h-4 rounded-full mr-3 ${
                    roles.driver.active ? "bg-green-500" : "bg-gray-500"
                  }`}
                />
                <h2 className="text-xl font-bold text-gray-900">{tr('livreur')}</h2>
              </div>
              <p className="text-gray-500 mb-4">
                {tr('livreurAide')}
              </p>
              {roles.driver.active ? (
                <div className="space-y-2 mb-6">
                  <p className="text-sm text-gray-700">
                    <span className="text-green-600 font-semibold">
                      {roles.driver.status}
                    </span>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-500 mb-6">
                  {tr('rejoindre')}
                </p>
              )}
              <button
                onClick={() => setShowDriverForm(!showDriverForm)}
                disabled={roles.driver.active}
                className={`w-full font-bold py-2 px-4 rounded-lg ${
                  roles.driver.active
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-orange-600 hover:bg-orange-700 text-white"
                }`}
              >
                {roles.driver.active ? tr('candidature') : tr('devenirLivreur')}
              </button>
            </div>
          </div>
        )}

        {/* Merchant Form */}
        {showMerchantForm && (
          <div className="mt-8 bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">
              {tr('creerBoutique')}
            </h3>
            <form onSubmit={handleBecomeMerchant} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder={tr('nomEntreprise')}
                  value={merchantFormData.businessName}
                  onChange={(e) =>
                    setMerchantFormData({
                      ...merchantFormData,
                      businessName: e.target.value,
                    })
                  }
                  className="px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
                <input
                  type="text"
                  placeholder={tr('nomBoutique')}
                  value={merchantFormData.storeName}
                  onChange={(e) =>
                    setMerchantFormData({
                      ...merchantFormData,
                      storeName: e.target.value,
                      storeSlug: slugify(e.target.value),
                    })
                  }
                  className="px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
                <input
                  type="text"
                  placeholder={tr('urlBoutique')}
                  value={merchantFormData.storeSlug}
                  onChange={(e) =>
                    setMerchantFormData({
                      ...merchantFormData,
                      storeSlug: slugify(e.target.value, false),
                    })
                  }
                  className="px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
                <select
                  value={merchantFormData.businessType}
                  onChange={(e) =>
                    setMerchantFormData({
                      ...merchantFormData,
                      businessType: e.target.value,
                    })
                  }
                  className="px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                >
                  <option value="">{tr('typeEntreprise')}</option>
                  {etablissements.map((genre) => (
                    <option key={genre.code} value={genre.code}>
                      {genre.libelle}
                    </option>
                  ))}
                </select>
                {merchantFormData.businessType === "restaurant" && (
                  <select
                    aria-label={tr('typeCuisine')}
                    value={merchantFormData.cuisineType}
                    onChange={(e) =>
                      setMerchantFormData({
                        ...merchantFormData,
                        cuisineType: e.target.value,
                      })
                    }
                    className="px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">{tr('typeCuisineFacultatif')}</option>
                    {cuisines.map((cuisine) => (
                      <option key={cuisine.code} value={cuisine.code}>
                        {cuisine.libelle}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="tel"
                  placeholder={tr('telephone')}
                  value={merchantFormData.phone}
                  onChange={(e) =>
                    setMerchantFormData({
                      ...merchantFormData,
                      phone: e.target.value,
                    })
                  }
                  className="px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
                <AddressAutocomplete
                  placeholder={tr('adresse')}
                  value={merchantFormData.address}
                  onChange={(valeur) =>
                    setMerchantFormData((prev) => ({ ...prev, address: valeur }))
                  }
                  onSelect={(adresse) =>
                    setMerchantFormData((prev) => ({
                      ...prev,
                      address: adresse.street,
                      city: adresse.city || prev.city,
                      postalCode: adresse.postalCode || prev.postalCode,
                    }))
                  }
                  className="w-full px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
                <input
                  type="text"
                  placeholder={tr('ville')}
                  value={merchantFormData.city}
                  onChange={(e) =>
                    setMerchantFormData({
                      ...merchantFormData,
                      city: e.target.value,
                    })
                  }
                  className="px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
                <input
                  type="text"
                  placeholder={tr('codePostal')}
                  value={merchantFormData.postalCode}
                  onChange={(e) =>
                    setMerchantFormData({
                      ...merchantFormData,
                      postalCode: e.target.value,
                    })
                  }
                  className="px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>
              <textarea
                placeholder={tr('description')}
                value={merchantFormData.description}
                onChange={(e) =>
                  setMerchantFormData({
                    ...merchantFormData,
                    description: e.target.value,
                  })
                }
                className="w-full px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
              <button
                type="submit"
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg"
              >
                {tr('creerLaBoutique')}
              </button>
            </form>
          </div>
        )}

        {/* Driver Form */}
        {showDriverForm && (
          <div className="mt-8 bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">
              {tr('devenirLivreur')}
            </h3>
            <form onSubmit={handleBecomeDriver} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder={tr('nomComplet')}
                  value={driverFormData.name}
                  onChange={(e) =>
                    setDriverFormData({
                      ...driverFormData,
                      name: e.target.value,
                    })
                  }
                  className="px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
                <input
                  type="email"
                  placeholder={tr('email')}
                  value={driverFormData.email}
                  onChange={(e) =>
                    setDriverFormData({
                      ...driverFormData,
                      email: e.target.value,
                    })
                  }
                  className="px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
                <input
                  type="tel"
                  placeholder={tr('telephone')}
                  value={driverFormData.phone}
                  onChange={(e) =>
                    setDriverFormData({
                      ...driverFormData,
                      phone: e.target.value,
                    })
                  }
                  className="px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
                <select
                  value={driverFormData.vehicleType}
                  onChange={(e) =>
                    setDriverFormData({
                      ...driverFormData,
                      vehicleType: e.target.value,
                    })
                  }
                  className="px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                >
                  <option value="">{tr('typeVehicule')}</option>
                  <option value="scooter">{tr('scooter')}</option>
                  <option value="car">{tr('voiture')}</option>
                  <option value="bike">{tr('velo')}</option>
                </select>
                <input
                  type="text"
                  placeholder={tr('immatriculation')}
                  value={driverFormData.vehiclePlate}
                  onChange={(e) =>
                    setDriverFormData({
                      ...driverFormData,
                      vehiclePlate: e.target.value,
                    })
                  }
                  className="px-4 py-2 bg-gray-100 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg"
              >
                {tr('postuler')}
              </button>
            </form>
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            href="/client"
            className="text-blue-600 hover:text-blue-700 font-semibold"
          >
            {tr('retour')}
          </Link>
        </div>
      </div>
    </div>
  );
}
