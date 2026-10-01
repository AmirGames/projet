'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, X } from 'lucide-react';

import { connexionTempsReel } from '@/lib/temps-reel';

interface Alerte {
  genre: 'avertissement' | 'retiree';
  deliveryId: string;
  message: string;
}

/**
 * Ce que la surveillance des courses dit au livreur, sur toutes les pages de
 * son espace : on l'attend au commerce, il s'éloigne, ou la course lui a été
 * retirée. Une course retirée ne lui appartient plus : s'il était sur sa
 * page, il revient au tableau de bord.
 */
export function AlertesCourseLivreur() {
  const t = useTranslations('driverCourseAlerts');
  const router = useRouter();
  const pathname = usePathname();
  const [alerte, setAlerte] = useState<Alerte | null>(null);

  useEffect(() => {
    const socket = connexionTempsReel();

    const surAvertissement = (d: { deliveryId: string; message: string }) =>
      setAlerte({ genre: 'avertissement', deliveryId: d.deliveryId, message: d.message });
    const surRetrait = (d: { deliveryId: string; message: string }) => {
      setAlerte({ genre: 'retiree', deliveryId: d.deliveryId, message: d.message });
      if (pathname?.startsWith(`/driver/deliveries/${d.deliveryId}`)) router.push('/driver');
    };

    socket.on('course-avertissement', surAvertissement);
    socket.on('course-retiree', surRetrait);
    // La connexion est partagée : on retire nos écouteurs, on ne la ferme pas.
    return () => {
      socket.off('course-avertissement', surAvertissement);
      socket.off('course-retiree', surRetrait);
    };
  }, [pathname, router]);

  if (!alerte) return null;

  const retiree = alerte.genre === 'retiree';
  return (
    <div
      role="alert"
      className={`fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-xl rounded-lg border p-4 shadow-lg flex gap-3 ${
        retiree ? 'bg-red-950 border-red-700 text-red-100' : 'bg-amber-950 border-amber-700 text-amber-100'
      }`}
    >
      <AlertTriangle className="flex-shrink-0 mt-0.5" size={20} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold">{t(retiree ? 'withdrawnTitle' : 'warningTitle')}</p>
        <p className="text-sm mt-1">{alerte.message}</p>
      </div>
      <button onClick={() => setAlerte(null)} aria-label={t('dismiss')} className="flex-shrink-0 opacity-80 hover:opacity-100">
        <X size={18} />
      </button>
    </div>
  );
}
