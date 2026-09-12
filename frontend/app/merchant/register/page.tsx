'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle, Loader } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface FormData {
  businessName: string;
  email: string;
  password: string;
  confirmPassword: string;
  businessType: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  website?: string;
  description: string;
  storeName: string;
  storeSlug: string;
}

interface FormErrors {
  [key: string]: string;
}

export default function MerchantRegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [successMessage, setSuccessMessage] = useState('');
  const [apiError, setApiError] = useState('');

  const [formData, setFormData] = useState<FormData>({
    businessName: '',
    email: '',
    password: '',
    confirmPassword: '',
    businessType: 'RESTAURANT',
    phone: '',
    address: '',
    city: '',
    postalCode: '',
    website: '',
    description: '',
    storeName: '',
    storeSlug: '',
  });

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.businessName.trim()) {
      newErrors.businessName = 'Le nom de l\'entreprise est requis';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'L\'email est requis';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email invalide';
    }

    if (!formData.password) {
      newErrors.password = 'Le mot de passe est requis';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Le mot de passe doit contenir au moins 8 caractères';
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Les mots de passe ne correspondent pas';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Le téléphone est requis';
    }

    if (!formData.address.trim()) {
      newErrors.address = 'L\'adresse est requise';
    }

    if (!formData.city.trim()) {
      newErrors.city = 'La ville est requise';
    }

    if (!formData.postalCode.trim()) {
      newErrors.postalCode = 'Le code postal est requis';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'La description est requise';
    }

    if (!formData.storeName.trim()) {
      newErrors.storeName = 'Le nom de la boutique est requis';
    }

    if (!formData.storeSlug.trim()) {
      newErrors.storeSlug = 'L\'URL de la boutique est requise';
    } else if (!/^[a-z0-9-]+$/.test(formData.storeSlug)) {
      newErrors.storeSlug = 'L\'URL ne peut contenir que des lettres minuscules, chiffres et tirets';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));

    // Auto-generate storeSlug from storeName
    if (name === 'storeName') {
      const slug = value
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      setFormData(prev => ({
        ...prev,
        storeSlug: slug,
      }));
    }

    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setApiError('');
    setSuccessMessage('');

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/merchant-register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessName: formData.businessName,
          email: formData.email,
          password: formData.password,
          businessType: formData.businessType,
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          postalCode: formData.postalCode,
          website: formData.website || null,
          description: formData.description,
          storeName: formData.storeName,
          storeSlug: formData.storeSlug,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setApiError(data.message || 'Erreur lors de l\'inscription');
        return;
      }

      setSuccessMessage('Inscription réussie! Redirection vers votre tableau de bord...');
      setSubmitted(true);

      // Store credentials
      if (data.accessToken) {
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('userEmail', formData.email);
      }

      // Redirect after 2 seconds
      setTimeout(() => {
        router.push(`/merchant/${data.organizationId}/dashboard`);
      }, 2000);
    } catch (error) {
      setApiError('Une erreur est survenue. Veuillez réessayer.');
      console.error('Registration error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Inscrivez votre Commerçant</h1>
          <p className="text-gray-400">Créez votre compte et lancez votre site de commande en 5 minutes</p>
        </div>

        {/* Success Message */}
        {submitted && successMessage && (
          <div className="mb-6 p-4 bg-green-600/20 border border-green-600/50 rounded-lg flex items-center gap-3">
            <CheckCircle size={24} className="text-green-400" />
            <div>
              <p className="font-semibold text-green-400">Succès!</p>
              <p className="text-green-400/80 text-sm">{successMessage}</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {apiError && (
          <div className="mb-6 p-4 bg-red-600/20 border border-red-600/50 rounded-lg flex items-center gap-3">
            <AlertCircle size={24} className="text-red-400" />
            <div>
              <p className="font-semibold text-red-400">Erreur</p>
              <p className="text-red-400/80 text-sm">{apiError}</p>
            </div>
          </div>
        )}

        {/* Registration Form */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Section 1: Information Commerciale */}
            <div>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center text-sm">1</span>
                Informations Commerciales
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Nom de l'Entreprise *
                  </label>
                  <input
                    type="text"
                    name="businessName"
                    value={formData.businessName}
                    onChange={handleChange}
                    className={`w-full px-4 py-2 bg-gray-700 border rounded-lg text-white focus:outline-none focus:border-red-500 ${
                      errors.businessName ? 'border-red-500' : 'border-gray-600'
                    }`}
                    placeholder="Ex: Restaurant ACME"
                  />
                  {errors.businessName && <p className="text-red-400 text-sm mt-1">{errors.businessName}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Type de Commerce *
                  </label>
                  <select
                    name="businessType"
                    value={formData.businessType}
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                  >
                    <option value="RESTAURANT">Restaurant</option>
                    <option value="CAFE">Café</option>
                    <option value="BAKERY">Boulangerie</option>
                    <option value="SHOP">Boutique</option>
                    <option value="GROCERY">Épicerie</option>
                    <option value="OTHER">Autre</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Email Professionnel *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className={`w-full px-4 py-2 bg-gray-700 border rounded-lg text-white focus:outline-none focus:border-red-500 ${
                      errors.email ? 'border-red-500' : 'border-gray-600'
                    }`}
                    placeholder="contact@example.com"
                  />
                  {errors.email && <p className="text-red-400 text-sm mt-1">{errors.email}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Téléphone *
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className={`w-full px-4 py-2 bg-gray-700 border rounded-lg text-white focus:outline-none focus:border-red-500 ${
                      errors.phone ? 'border-red-500' : 'border-gray-600'
                    }`}
                    placeholder="+33 6 12 34 56 78"
                  />
                  {errors.phone && <p className="text-red-400 text-sm mt-1">{errors.phone}</p>}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description du Commerce *
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={3}
                    className={`w-full px-4 py-2 bg-gray-700 border rounded-lg text-white focus:outline-none focus:border-red-500 ${
                      errors.description ? 'border-red-500' : 'border-gray-600'
                    }`}
                    placeholder="Décrivez votre commerce, spécialités, etc..."
                  />
                  {errors.description && <p className="text-red-400 text-sm mt-1">{errors.description}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Site Web (optionnel)
                  </label>
                  <input
                    type="url"
                    name="website"
                    value={formData.website}
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                    placeholder="https://example.com"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Adresse */}
            <div>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center text-sm">2</span>
                Adresse
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Adresse *
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    className={`w-full px-4 py-2 bg-gray-700 border rounded-lg text-white focus:outline-none focus:border-red-500 ${
                      errors.address ? 'border-red-500' : 'border-gray-600'
                    }`}
                    placeholder="123 Rue de la Paix"
                  />
                  {errors.address && <p className="text-red-400 text-sm mt-1">{errors.address}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Ville *
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    className={`w-full px-4 py-2 bg-gray-700 border rounded-lg text-white focus:outline-none focus:border-red-500 ${
                      errors.city ? 'border-red-500' : 'border-gray-600'
                    }`}
                    placeholder="Paris"
                  />
                  {errors.city && <p className="text-red-400 text-sm mt-1">{errors.city}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Code Postal *
                  </label>
                  <input
                    type="text"
                    name="postalCode"
                    value={formData.postalCode}
                    onChange={handleChange}
                    className={`w-full px-4 py-2 bg-gray-700 border rounded-lg text-white focus:outline-none focus:border-red-500 ${
                      errors.postalCode ? 'border-red-500' : 'border-gray-600'
                    }`}
                    placeholder="75001"
                  />
                  {errors.postalCode && <p className="text-red-400 text-sm mt-1">{errors.postalCode}</p>}
                </div>
              </div>
            </div>

            {/* Section 3: Boutique */}
            <div>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center text-sm">3</span>
                Configuration de la Boutique
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Nom de la Boutique *
                  </label>
                  <input
                    type="text"
                    name="storeName"
                    value={formData.storeName}
                    onChange={handleChange}
                    className={`w-full px-4 py-2 bg-gray-700 border rounded-lg text-white focus:outline-none focus:border-red-500 ${
                      errors.storeName ? 'border-red-500' : 'border-gray-600'
                    }`}
                    placeholder="Ma Boutique"
                  />
                  {errors.storeName && <p className="text-red-400 text-sm mt-1">{errors.storeName}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    URL de la Boutique *
                  </label>
                  <div className="flex items-center">
                    <span className="px-3 py-2 bg-gray-700 border border-gray-600 border-r-0 rounded-l-lg text-gray-400 text-sm">
                      app.local/store/
                    </span>
                    <input
                      type="text"
                      name="storeSlug"
                      value={formData.storeSlug}
                      onChange={handleChange}
                      className={`flex-1 px-4 py-2 bg-gray-700 border rounded-r-lg text-white focus:outline-none focus:border-red-500 ${
                        errors.storeSlug ? 'border-red-500' : 'border-gray-600'
                      }`}
                      placeholder="ma-boutique"
                    />
                  </div>
                  {errors.storeSlug && <p className="text-red-400 text-sm mt-1">{errors.storeSlug}</p>}
                </div>
              </div>

              <p className="text-gray-400 text-sm mt-2">
                💡 L'URL se génère automatiquement à partir du nom de la boutique. Elle ne peut contenir que des lettres minuscules, chiffres et tirets.
              </p>
            </div>

            {/* Section 4: Sécurité */}
            <div>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center text-sm">4</span>
                Sécurité
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Mot de Passe *
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className={`w-full px-4 py-2 bg-gray-700 border rounded-lg text-white focus:outline-none focus:border-red-500 ${
                      errors.password ? 'border-red-500' : 'border-gray-600'
                    }`}
                    placeholder="••••••••"
                  />
                  {errors.password && <p className="text-red-400 text-sm mt-1">{errors.password}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Confirmer le Mot de Passe *
                  </label>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className={`w-full px-4 py-2 bg-gray-700 border rounded-lg text-white focus:outline-none focus:border-red-500 ${
                      errors.confirmPassword ? 'border-red-500' : 'border-gray-600'
                    }`}
                    placeholder="••••••••"
                  />
                  {errors.confirmPassword && <p className="text-red-400 text-sm mt-1">{errors.confirmPassword}</p>}
                </div>
              </div>

              <p className="text-gray-400 text-sm mt-2">
                🔒 Minimum 8 caractères. Utilisez une combinaison de lettres, chiffres et caractères spéciaux.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader size={20} className="animate-spin" />
                  Création en cours...
                </>
              ) : (
                'Créer mon Compte & Ma Boutique'
              )}
            </button>

            {/* Sign In Link */}
            <p className="text-center text-gray-400 text-sm">
              Déjà inscrit?{' '}
              <a href="/login" className="text-red-400 hover:text-red-300 font-semibold">
                Se connecter
              </a>
            </p>
          </form>
        </div>

        {/* Info Box */}
        <div className="mt-6 p-4 bg-blue-600/20 border border-blue-600/50 rounded-lg">
          <p className="text-blue-400 text-sm">
            ℹ️ <strong>Après inscription:</strong> Votre boutique en ligne sera créée automatiquement et accessible depuis votre tableau de bord. Vous pourrez immédiatement ajouter des produits et commencer à recevoir des commandes.
          </p>
        </div>
      </div>
    </div>
  );
}
