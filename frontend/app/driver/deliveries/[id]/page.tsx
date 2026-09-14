'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Phone, CheckCircle, AlertCircle, Loader } from 'lucide-react';

import { euro } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Delivery {
  id: string;
  orderId: string;
  status: string;
  pickupAddress: string;
  deliveryAddress: string;
  customerName: string;
  customerPhone: string;
  distance?: number;
  totalAmount?: number;
  latitude?: number;
  longitude?: number;
  items?: any[];
}

export default function DeliveryTrackingPage() {
  const params = useParams();
  const router = useRouter();
  const deliveryId = params.id as string;

  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  const steps = ['Aller au restaurant', 'Récupérer la commande', 'Aller au client', 'Livrer & Confirmer'];

  useEffect(() => {
    loadDeliveryData();
    startLocationTracking();
  }, [deliveryId]);

  const loadDeliveryData = async () => {
    const token = localStorage.getItem('driverToken');
    if (!token) {
      router.push('/driver/login');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/drivers/deliveries/${deliveryId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setDelivery(data.data);
        determineCurrentStep(data.data.status);
      } else {
        setError('Livraison non trouvée');
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading delivery:', err);
      setError('Erreur lors du chargement de la livraison');
      setLoading(false);
    }
  };

  const determineCurrentStep = (status: string) => {
    const stepMap: Record<string, number> = {
      ACCEPTED: 0,
      PICKED_UP: 2,
      DELIVERED: 3,
    };
    setCurrentStep(stepMap[status] || 0);
  };

  const startLocationTracking = () => {
    if (!navigator.geolocation) return;

    navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });

        // Update server with location every 30 seconds
        const token = localStorage.getItem('driverToken');
        if (token && deliveryId) {
          fetch(`${API_URL}/api/drivers/deliveries/${deliveryId}/location`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            }),
          }).catch(err => console.error('Failed to update location:', err));
        }
      },
      (error) => console.error('Geolocation error:', error)
    );
  };

  const handleNextStep = async () => {
    if (!delivery) return;

    const token = localStorage.getItem('driverToken');
    if (!token) return;

    setUpdating(true);

    try {
      const nextStatuses = ['ACCEPTED', 'PICKED_UP', 'DELIVERED'];
      const nextStatus = nextStatuses[currentStep + 1];

      const response = await fetch(`${API_URL}/api/drivers/deliveries/${deliveryId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (response.ok) {
        const data = await response.json();
        setDelivery(data.data);
        setCurrentStep(currentStep + 1);

        if (nextStatus === 'DELIVERED') {
          setTimeout(() => {
            router.push('/driver');
          }, 2000);
        }
      } else {
        setError('Erreur lors de la mise à jour');
      }
    } catch (err) {
      setError('Erreur lors de la mise à jour de la livraison');
      console.error('Error updating delivery:', err);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader size={48} className="text-orange-600 animate-spin mx-auto mb-4" />
          <p className="text-white">Chargement de la livraison...</p>
        </div>
      </div>
    );
  }

  if (error || !delivery) {
    return (
      <div className="min-h-screen bg-gray-900">
        <header className="bg-gray-800 border-b border-gray-700">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <Link href="/driver" className="flex items-center gap-2 text-orange-500 hover:text-orange-400">
              <ArrowLeft size={20} />
              Retour
            </Link>
          </div>
        </header>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-red-900 border border-red-700 rounded-lg p-4 text-red-200 flex items-center gap-3">
            <AlertCircle size={24} />
            <p>{error || 'Erreur lors du chargement de la livraison'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link href="/driver" className="flex items-center gap-2 text-orange-500 hover:text-orange-400 mb-4">
            <ArrowLeft size={20} />
            Retour au tableau de bord
          </Link>
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-white">Livraison #{delivery.orderId.slice(0, 8)}</h1>
              <p className="text-gray-400">{delivery.customerName}</p>
            </div>
            {location && (
              <div className="text-right">
                <p className="text-gray-400 text-sm">Localisation active</p>
                <p className="text-green-400 font-semibold text-sm">✓ GPS activé</p>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Progress */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-white mb-6">Étapes de la livraison</h2>

          <div className="space-y-4">
            {steps.map((step, index) => {
              const isCompleted = index < currentStep;
              const isCurrent = index === currentStep;

              return (
                <div key={step} className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
                      isCompleted
                        ? 'bg-green-600 text-white'
                        : isCurrent
                        ? 'bg-orange-600 text-white'
                        : 'bg-gray-700 text-gray-400'
                    }`}
                  >
                    {isCompleted ? '✓' : index + 1}
                  </div>
                  <div className="flex-1">
                    <p className={`font-semibold ${isCompleted || isCurrent ? 'text-white' : 'text-gray-500'}`}>
                      {step}
                    </p>
                  </div>
                  {isCurrent && <Loader size={20} className="text-orange-600 animate-spin" />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Current Step Details */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-6">
                {currentStep === 0 && '📍 Allez au restaurant'}
                {currentStep === 1 && '📦 Récupérez la commande'}
                {currentStep === 2 && '🚗 Allez chez le client'}
                {currentStep === 3 && '✓ Confirmez la livraison'}
              </h2>

              {currentStep === 0 && (
                <div className="space-y-4">
                  <p className="text-gray-300 mb-4">Rendez-vous au restaurant pour récupérer la commande</p>
                  <div className="bg-gray-700 rounded-lg p-4 flex gap-3">
                    <MapPin size={24} className="text-orange-500 flex-shrink-0" />
                    <div>
                      <p className="text-white font-semibold">Restaurant</p>
                      <p className="text-gray-400">{delivery.pickupAddress}</p>
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 1 && (
                <div className="space-y-4">
                  <p className="text-gray-300 mb-4">Récupérez la commande auprès du restaurant</p>
                  {delivery.items && delivery.items.length > 0 && (
                    <div className="bg-gray-700 rounded-lg p-4 space-y-2">
                      <p className="text-white font-semibold mb-3">Articles à récupérer:</p>
                      {delivery.items.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-gray-300 text-sm">
                          <span>{item.name} x{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-4">
                  <p className="text-gray-300 mb-4">Livrez la commande à l'adresse du client</p>
                  <div className="bg-gray-700 rounded-lg p-4 flex gap-3">
                    <MapPin size={24} className="text-green-500 flex-shrink-0" />
                    <div>
                      <p className="text-white font-semibold">Client</p>
                      <p className="text-gray-400">{delivery.deliveryAddress}</p>
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-4">
                  <div className="bg-green-900 border border-green-700 rounded-lg p-4 flex gap-3">
                    <CheckCircle size={24} className="text-green-400 flex-shrink-0" />
                    <div>
                      <p className="text-green-200 font-semibold">Livraison complétée !</p>
                      <p className="text-green-300 text-sm">Merci pour votre travail</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Customer Info */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">Information du client</h2>

              <div className="space-y-4">
                <div className="bg-gray-700 rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-1">Nom</p>
                  <p className="text-white font-semibold">{delivery.customerName}</p>
                </div>

                <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2">
                  <Phone size={18} />
                  Appeler {delivery.customerPhone}
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800 rounded-lg p-6 sticky top-20 space-y-6">
              {/* Stats */}
              <div>
                <p className="text-gray-400 text-sm mb-2">Distance</p>
                <p className="text-white text-2xl font-bold">{delivery.distance || 0} km</p>
              </div>

              <div>
                <p className="text-gray-400 text-sm mb-2">Montant</p>
                <p className="text-green-400 text-2xl font-bold">{euro((delivery.totalAmount || 0))}</p>
              </div>

              {/* Action Button */}
              {currentStep < 3 && (
                <button
                  onClick={handleNextStep}
                  disabled={updating}
                  className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2"
                >
                  {updating ? (
                    <>
                      <Loader size={18} className="animate-spin" />
                      Mise à jour...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={18} />
                      Étape suivante
                    </>
                  )}
                </button>
              )}

              {currentStep === 3 && (
                <div className="text-center py-4">
                  <p className="text-green-400 font-semibold mb-4">✓ Livraison complétée !</p>
                  <p className="text-gray-400 text-sm">Retour au tableau de bord dans 2 secondes...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
