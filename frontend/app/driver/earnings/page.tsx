'use client';


import { jetonAcces } from '@/lib/jeton-session';
import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Wallet, Package, Star, CalendarDays, Gift } from 'lucide-react';
import { euro } from '@/lib/format';
import { MesVersements } from '@/components/MesVersements';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { numeroCourt } from '@/lib/numero-commande';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
interface CourseRemuneree {
  id: string;
  orderId: string;
  deliveredAt: string;
  earning: number;
  /** Laissé en commandant, compris dans le gain. */
  pourboire?: number;
  /** Laissé après la livraison, en plus du gain. */
  pourboireApres?: number;
}

interface Revenus {
  total: number;
  today: number;
  week: number;
  month: number;
  deliveryCount: number;
  /** Le détail des pourboires, compris dans les montants ci-dessus. */
  pourboires?: { today: number; week: number; month: number; total: number };
  /** Nulle tant que personne ne l'a noté. */
  rating: number | null;
  avis?: number;
  deliveries: CourseRemuneree[];
}

export default function RevenusLivreurPage() {
  const locale = useLocale();
  const t = useTranslations('driverEarnings');
  const router = useRouter();

  const [revenus, setRevenus] = useState<Revenus | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    // Vérifier l'authentification avant de charger les données
    const token = jetonAcces();
    if (!token) {
      router.push('/driver/login');
    }
  }, [router]);

  const charger = useCallback(async () => {
    const token = jetonAcces();

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
        setErreur(donnees.error || t('loadingError'));
        return;
      }

      setRevenus(donnees);
    } catch {
      setErreur(t('connectionError'));
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-gray-900 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <Link
            href="/driver"
            className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 text-sm mb-2"
          >
            <ArrowLeft size={16} /> {t('backToDashboard')}
          </Link>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Wallet size={28} className="text-green-500" />
            {t('title')}
          </h1>
          <p className="text-gray-500 mt-1">
            {t('subtitle')}
          </p>
        </div>

        {erreur && (
          <div className="bg-red-100 border border-red-500/50 rounded-lg p-4 text-red-600">
            {erreur}
          </div>
        )}

        {/* Ce qui est dû et ce qui est versé passe avant les totaux par
            période : c'est la question qu'un livreur se pose d'abord. */}
        <MesVersements />

        {revenus && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <p className="text-gray-500 text-sm mb-2">{t('today')}</p>
                <p className="text-3xl font-bold text-green-600">{euro(revenus.today)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <p className="text-gray-500 text-sm mb-2">{t('thisWeek')}</p>
                <p className="text-3xl font-bold">{euro(revenus.week)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <p className="text-gray-500 text-sm mb-2">{t('thisMonth')}</p>
                <p className="text-3xl font-bold">{euro(revenus.month)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <p className="text-gray-500 text-sm mb-2">{t('allTime')}</p>
                <p className="text-3xl font-bold">{euro(revenus.total)}</p>
              </div>
            </div>

            {revenus.pourboires && (
              <div className="bg-white border border-yellow-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Gift size={20} className="text-yellow-600" />
                    {t('tipsTitle')}
                  </h2>
                  <p className="text-xs text-gray-500">{t('tipsIncluded')}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {([
                    ['today', revenus.pourboires.today],
                    ['thisWeek', revenus.pourboires.week],
                    ['thisMonth', revenus.pourboires.month],
                    ['allTime', revenus.pourboires.total],
                  ] as const).map(([cle, montant]) => (
                    <div key={cle}>
                      <p className="text-gray-500 text-sm mb-1">{t(cle)}</p>
                      <p className="text-2xl font-bold text-yellow-600">{euro(montant)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-500 text-sm">{t('deliveriesCompleted')}</p>
                  <Package size={20} className="text-blue-500" />
                </div>
                <p className="text-3xl font-bold">{revenus.deliveryCount}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-500 text-sm">{t('averageRating')}</p>
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

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <CalendarDays size={20} className="text-orange-500" />
                {t('deliveryDetails')}
              </h2>

              {revenus.deliveries.length === 0 ? (
                <p className="text-gray-500">
                  {t('noDeliveries')}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-gray-500 border-b border-gray-200">
                      <tr>
                        <th className="text-left py-2">{t('order')}</th>
                        <th className="text-left py-2">{t('deliveredOn')}</th>
                        <th className="text-right py-2">{t('tip')}</th>
                        <th className="text-right py-2">{t('yourEarning')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {revenus.deliveries.map((course) => (
                        <tr key={course.id}>
                          <td className="py-3">{numeroCourt(course.orderId)}</td>
                          <td className="py-3 text-gray-500">
                            {new Date(course.deliveredAt).toLocaleString(locale)}
                          </td>
                          <td className="py-3 text-right text-yellow-600">
                            {(course.pourboire ?? 0) + (course.pourboireApres ?? 0) > 0
                              ? euro((course.pourboire ?? 0) + (course.pourboireApres ?? 0))
                              : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="py-3 text-right font-bold text-green-600">
                            {euro(course.earning + (course.pourboireApres ?? 0))}
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
