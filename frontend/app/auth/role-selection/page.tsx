"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
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
        setError("Erreur lors du chargement des rôles");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchRoles();
  }, []);

  const handleBecomeMerchant = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      await api.becomeMerchant({
        ...merchantFormData,
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
      setError(err.message || "Erreur lors de la création du commerce");
      console.error(err);
    }
  };

  const handleBecomeDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      await api.becomeDriver(driverFormData);
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
      setError(err.message || "Erreur lors de la création du profil livreur");
      console.error(err);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-900 flex items-center justify-center"><div className="text-white">Chargement...</div></div>;
  }

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-2 text-center">
          Mes Rôles
        </h1>
        <p className="text-gray-400 text-center mb-8">
          Gérez vos différents rôles dans ZupOne
        </p>

        {error && (
          <div className="bg-red-600/20 border border-red-600/50 text-red-200 p-4 rounded-lg mb-8">
            {error}
          </div>
        )}

        {roles && (
          <div className="grid md:grid-cols-3 gap-6">
            {/* Customer Role */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center mb-4">
                <div
                  className={`w-4 h-4 rounded-full mr-3 ${
                    roles.customer.active ? "bg-green-500" : "bg-gray-500"
                  }`}
                />
                <h2 className="text-xl font-bold text-white">Client</h2>
              </div>
              <p className="text-gray-400 mb-4">
                Commandez auprès des commerçants
              </p>
              <div className="space-y-2 mb-6">
                <p className="text-sm text-gray-400">
                  <span className="text-green-400 font-semibold">Actif</span>
                </p>
              </div>
              <button
                onClick={() => router.push("/client")}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
              >
                Accéder
              </button>
            </div>

            {/* Merchant Role */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center mb-4">
                <div
                  className={`w-4 h-4 rounded-full mr-3 ${
                    roles.merchant.active ? "bg-green-500" : "bg-gray-500"
                  }`}
                />
                <h2 className="text-xl font-bold text-white">Commerçant</h2>
              </div>
              <p className="text-gray-400 mb-4">
                Gérez votre boutique et vos commandes
              </p>
              {roles.merchant.active ? (
                <div className="space-y-2 mb-6">
                  {roles.merchant.organizations.map((org) => (
                    <div
                      key={org.id}
                      className="text-sm bg-gray-700 p-2 rounded text-gray-200"
                    >
                      <p className="font-semibold">{org.name}</p>
                      <p className="text-xs text-gray-400">{org.role}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 mb-6">
                  Créer votre première boutique
                </p>
              )}
              <div className="space-y-2">
                {roles.merchant.active && (
                  <button
                    onClick={() => router.push("/merchant")}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
                  >
                    Accéder
                  </button>
                )}
                <button
                  onClick={() => setShowMerchantForm(!showMerchantForm)}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg"
                >
                  {showMerchantForm
                    ? t('cancel')
                    : roles.merchant.active
                      ? "+ Ajouter une boutique"
                      : "Devenir commerçant"}
                </button>
              </div>
            </div>

            {/* Driver Role */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center mb-4">
                <div
                  className={`w-4 h-4 rounded-full mr-3 ${
                    roles.driver.active ? "bg-green-500" : "bg-gray-500"
                  }`}
                />
                <h2 className="text-xl font-bold text-white">Livreur</h2>
              </div>
              <p className="text-gray-400 mb-4">
                Livrez les commandes et gagnez
              </p>
              {roles.driver.active ? (
                <div className="space-y-2 mb-6">
                  <p className="text-sm text-gray-300">
                    <span className="text-green-400 font-semibold">
                      {roles.driver.status}
                    </span>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-400 mb-6">
                  Rejoindre notre réseau de livreurs
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
                {roles.driver.active ? "Candidature en cours" : "Devenir livreur"}
              </button>
            </div>
          </div>
        )}

        {/* Merchant Form */}
        {showMerchantForm && (
          <div className="mt-8 bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h3 className="text-2xl font-bold text-white mb-6">
              Créer une boutique
            </h3>
            <form onSubmit={handleBecomeMerchant} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Nom de l'entreprise"
                  value={merchantFormData.businessName}
                  onChange={(e) =>
                    setMerchantFormData({
                      ...merchantFormData,
                      businessName: e.target.value,
                    })
                  }
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
                <input
                  type="text"
                  placeholder="Nom de la boutique"
                  value={merchantFormData.storeName}
                  onChange={(e) =>
                    setMerchantFormData({
                      ...merchantFormData,
                      storeName: e.target.value,
                    })
                  }
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
                <input
                  type="text"
                  placeholder="URL de la boutique (slug)"
                  value={merchantFormData.storeSlug}
                  onChange={(e) =>
                    setMerchantFormData({
                      ...merchantFormData,
                      storeSlug: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                    })
                  }
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
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
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                >
                  <option value="">Type d'entreprise</option>
                  {etablissements.map((genre) => (
                    <option key={genre.code} value={genre.code}>
                      {genre.libelle}
                    </option>
                  ))}
                </select>
                {merchantFormData.businessType === "restaurant" && (
                  <select
                    aria-label="Type de cuisine"
                    value={merchantFormData.cuisineType}
                    onChange={(e) =>
                      setMerchantFormData({
                        ...merchantFormData,
                        cuisineType: e.target.value,
                      })
                    }
                    className="px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Type de cuisine (facultatif)</option>
                    {cuisines.map((cuisine) => (
                      <option key={cuisine.code} value={cuisine.code}>
                        {cuisine.libelle}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="tel"
                  placeholder="Téléphone"
                  value={merchantFormData.phone}
                  onChange={(e) =>
                    setMerchantFormData({
                      ...merchantFormData,
                      phone: e.target.value,
                    })
                  }
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
                <AddressAutocomplete
                  placeholder="Adresse"
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
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
                <input
                  type="text"
                  placeholder="Ville"
                  value={merchantFormData.city}
                  onChange={(e) =>
                    setMerchantFormData({
                      ...merchantFormData,
                      city: e.target.value,
                    })
                  }
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
                <input
                  type="text"
                  placeholder="Code postal"
                  value={merchantFormData.postalCode}
                  onChange={(e) =>
                    setMerchantFormData({
                      ...merchantFormData,
                      postalCode: e.target.value,
                    })
                  }
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>
              <textarea
                placeholder="Description de votre boutique"
                value={merchantFormData.description}
                onChange={(e) =>
                  setMerchantFormData({
                    ...merchantFormData,
                    description: e.target.value,
                  })
                }
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
              <button
                type="submit"
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg"
              >
                Créer la boutique
              </button>
            </form>
          </div>
        )}

        {/* Driver Form */}
        {showDriverForm && (
          <div className="mt-8 bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h3 className="text-2xl font-bold text-white mb-6">
              Devenir livreur
            </h3>
            <form onSubmit={handleBecomeDriver} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Nom complet"
                  value={driverFormData.name}
                  onChange={(e) =>
                    setDriverFormData({
                      ...driverFormData,
                      name: e.target.value,
                    })
                  }
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={driverFormData.email}
                  onChange={(e) =>
                    setDriverFormData({
                      ...driverFormData,
                      email: e.target.value,
                    })
                  }
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
                <input
                  type="tel"
                  placeholder="Téléphone"
                  value={driverFormData.phone}
                  onChange={(e) =>
                    setDriverFormData({
                      ...driverFormData,
                      phone: e.target.value,
                    })
                  }
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
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
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                >
                  <option value="">Type de véhicule</option>
                  <option value="scooter">Scooter / Moto</option>
                  <option value="car">Voiture</option>
                  <option value="bike">Vélo</option>
                </select>
                <input
                  type="text"
                  placeholder="Immatriculation"
                  value={driverFormData.vehiclePlate}
                  onChange={(e) =>
                    setDriverFormData({
                      ...driverFormData,
                      vehiclePlate: e.target.value,
                    })
                  }
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg"
              >
                Postuler comme livreur
              </button>
            </form>
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            href="/client"
            className="text-blue-400 hover:text-blue-300 font-semibold"
          >
            ← Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
