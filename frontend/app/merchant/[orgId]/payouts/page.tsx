'use client';

/**
 * Les reversements du commerçant.
 *
 * Ses clients paient en ligne, l'argent passe par la plateforme, qui lui
 * reverse chaque semaine ses ventes moins sa commission. Il ne voyait nulle
 * part ce qu'on lui devait ni ce qu'on lui avait versé : voici ses relevés,
 * ligne par ligne, avec l'explication de chaque code.
 */

import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import { Banknote } from 'lucide-react';

import { euro } from '@/lib/format';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import ReleveReversement, { type Releve } from '@/components/ReleveReversement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Resume {
  id: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: string;
  orderCount: number;
}

const ETATS: Record<string, string> = {
  PENDING: 'En préparation',
  PAID: 'Versé',
  CARRIED: 'Reporté',
  CANCELLED: 'Annulé',
};

export default function ReversementsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [releves, setReleves] = useState<Resume[]>([]);
  const [ouvert, setOuvert] = useState<Releve | null>(null);
  const [erreur, setErreur] = useState('');

  const entetes = () => ({ Authorization: `Bearer ${localStorage.getItem('accessToken')}` });

  const ouvrir = async (id: string) => {
    const rep = await fetch(`${API_URL}/api/merchant-payouts/${id}`, { headers: entetes() });
    if (rep.ok) setOuvert((await rep.json()).data);
  };

  const charger = useCallback(async () => {
    try {
      const rep = await fetch(`${API_URL}/api/merchant-payouts?orgId=${orgId}`, { headers: entetes() });
      if (!rep.ok) throw new Error('Relevés illisibles');
      const liste: Resume[] = (await rep.json()).data || [];
      setReleves(liste);
      // Le dernier relevé s'ouvre d'office.
      if (liste[0]) {
        const detail = await fetch(`${API_URL}/api/merchant-payouts/${liste[0].id}`, { headers: entetes() });
        if (detail.ok) setOuvert((await detail.json()).data);
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    }
  }, [orgId]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Banknote /> Reversements
        </h1>
        <p className="text-gray-500 mt-1">
          Chaque lundi, la plateforme vous vire vos ventes payées en ligne de la semaine écoulée,
          commission déduite.
        </p>
      </div>

      {erreur && <p className="text-red-600">{erreur}</p>}

      {releves.length === 0 ? (
        <p className="text-gray-500">Aucun relevé pour l&apos;instant : le premier arrive le lundi qui suit vos premières ventes.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {releves.map((r) => {
              const veille = new Date(new Date(r.periodEnd).getTime() - 1);
              return (
                <button
                  key={r.id}
                  onClick={() => ouvrir(r.id)}
                  className={`w-full text-left p-4 hover:bg-gray-50 ${ouvert?.id === r.id ? 'bg-gray-50' : ''}`}
                >
                  <p className="text-gray-900 font-semibold">
                    {new Date(r.periodStart).toLocaleDateString('fr-FR')} – {veille.toLocaleDateString('fr-FR')}
                  </p>
                  <p className="text-sm flex justify-between">
                    <span className="text-gray-500">{ETATS[r.status] || r.status}</span>
                    <span className={r.amount < 0 ? 'text-red-600' : 'text-green-600'}>{euro(r.amount)}</span>
                  </p>
                </button>
              );
            })}
          </div>
          <div className="lg:col-span-2">{ouvert && <ReleveReversement releve={ouvert} />}</div>
        </div>
      )}
    </div>
  );
}
