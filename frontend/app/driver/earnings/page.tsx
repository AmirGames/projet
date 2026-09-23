'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft, Wallet, Package, Star, CalendarDays } from 'lucide-react';
import { euro } from '@/lib/format';
import { MesVersements } from '@/components/MesVersements';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const t = useTranslations('driverEarnings');
interface CourseRemuneree {
  id: string;
  orderId: string;
  deliveredAt: string;
  orderAmount: number;
  earning: number;
}

interface Revenus {
  total: number;
  today: number;
  week: number;
  month: number;
  deliveryCount: number;
  /** Nulle tant que personne ne l'a noté. */
  rating: number | null;
  avis?: number;
  deliveries: CourseRemuneree[];
}

export default function RevenusLivreurPage() {
  const router = useRouter();
  const t = useTranslations('driverEarnings');

  const [revenus, setRevenus] = useState<Revenus | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    // Vérifier l'authentification avant de charger les données
    const token = localStorage.getItem('driverToken') || localStorage.getItem('accessToken');
    if (!token) {
      router.push('/driver/login');
    }
  }, [router]);

  const charger = useCallback(async () => {
    const token = localStorage.getItem('driverToken') || localStorage.getItem('accessToken');

    if (!token) {
      router.push('/driver/login');
      return;
    }

    try {
      const reponse = await fetch(`${API_URL}/api/drivers/earnings`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setErreur(donnees.error || 'Impossible de charger vos revenus');
        return;
      }

      setRevenus(donnees);
    } catch {
      setErreur('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    charger();
  }, [charger]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <Link
            href="/driver"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-2"
          >
            <ArrowLeft size={16} /> {t('backToDashboard')}
          </Link>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Wallet size={28} className="text-green-500" />
            {t('title')}
          </h1>
          <p className="text-gray-400 mt-1">
            {t('subtitle')}
          </p>
        </div>

        {erreur && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-400">
            {erreur}
          </div>
        )}

        {/* Ce qui est dû et ce qui est versé passe avant les totaux par
            période : c'est la question qu'un livreur se pose d'abord. */}
        <MesVersements />

        {revenus && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <p className="text-gray-400 text-sm mb-2">{t('today')}</p>
                <p className="text-3xl font-bold text-green-400">{euro(revenus.today)}</p>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <p className="text-gray-400 text-sm mb-2">{t('thisWeek')}</p>
                <p className="text-3xl font-bold">{euro(revenus.week)}</p>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <p className="text-gray-400 text-sm mb-2">{t('thisMonth')}</p>
                <p className="text-3xl font-bold">{euro(revenus.month)}</p>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <p className="text-gray-400 text-sm mb-2">{t('allTime')}</p>
                <p className="text-3xl font-bold">{euro(revenus.total)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-400 text-sm">{t('deliveriesCompleted')}</p>
                  <Package size={20} className="text-blue-500" />
                </div>
                <p className="text-3xl font-bold">{revenus.deliveryCount}</p>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-400 text-sm">{t('averageRating')}</p>
                  <Star size={20} className="text-yellow-500" />
                </div>
                {revenus.rating == null ? (
                  <p className="text-gray-500 text-lg font-semibold mt-2">{t('notRated')}</p>
                ) : (
                  <p className="text-3xl font-bold">
                    {revenus.rating.toFixed(2).replace('.', ',')} / 5
                    <span className="text-gray-500 text-sm font-normal"> · {revenus.avis} {t('reviews')}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <CalendarDays size={20} className="text-orange-500" />
                {t('deliveryDetails')}
              </h2>

              {revenus.deliveries.length === 0 ? (
                <p className="text-gray-400">
                  {t('noDeliveries')}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-gray-400 border-b border-gray-700">
                      <tr>
                        <th className="text-left py-2">{t('order')}</th>
                        <th className="text-left py-2">{t('deliveredOn')}</th>
                        <th className="text-right py-2">{t('orderAmount')}</th>
                        <th className="text-right py-2">{t('yourEarning')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {revenus.deliveries.map((course) => (
                        <tr key={course.id}>
                          <td className="py-3">{course.orderId.slice(-8).toUpperCase()}</td>
                          <td className="py-3 text-gray-400">
                            {new Date(course.deliveredAt).toLocaleString('fr-FR')}
                          </td>
                          <td className="py-3 text-right text-gray-400">
                            {euro(course.orderAmount)}
                          </td>
                          <td className="py-3 text-right font-bold text-green-400">
                            {euro(course.earning)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
