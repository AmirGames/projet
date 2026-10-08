'use client';


import { jetonAcces } from '@/lib/jeton-session';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { connexionTempsReel } from '@/lib/temps-reel';
import { LifeBuoy } from 'lucide-react';

import { FilSupport, type MessageSupport } from '@/components/FilSupport';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Les sujets proposés d'un clic (`sujets.<rang>` des traductions). */
const SUJETS_RAPIDES = [0, 1, 2, 3];

/** Chat en direct avec le support, pour le livreur. */
export default function SupportLivreurPage() {
  const t = useTranslations('supportLivreur');
  const router = useRouter();
  const [messages, setMessages] = useState<MessageSupport[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  const jeton = () => jetonAcces();

  const charger = useCallback(async () => {
    const token = jeton();
    if (!token) {
      router.push('/driver/login');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/drivers/support/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const donnees = await res.json();
      if (!res.ok) throw new Error(donnees.error);
      setMessages(donnees.data || []);
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : t('filEchec'));
    } finally {
      setChargement(false);
    }
  }, [router, t]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  // Les réponses du support arrivent en direct.
  useEffect(() => {
    const token = jeton();
    if (!token) return;

    const socket = connexionTempsReel();

    const surMessage = (message: MessageSupport) => {
      setMessages((liste) => (liste.some((m) => m.id === message.id) ? liste : [...liste, message]));
      if (message.sender === 'SUPPORT') {
        fetch(`${API_URL}/api/drivers/support/read`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    };

    // Le support a lu : les coches passent au double.
    const surLu = () => {
      setMessages((liste) =>
        liste.map((m) => (m.sender === 'DRIVER' && !m.readAt ? { ...m, readAt: new Date().toISOString() } : m))
      );
    };

    socket.on('support-message', surMessage);
    socket.on('support-lu', surLu);

    // La connexion est partagée : on retire nos écouteurs, on ne la ferme pas.
    return () => {
      socket.off('support-message', surMessage);
      socket.off('support-lu', surLu);
    };
  }, []);

  const envoyer = async (texte: string) => {
    const token = jeton();
    if (!token) return false;

    try {
      const res = await fetch(`${API_URL}/api/drivers/support/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: texte }),
      });
      const donnees = await res.json();
      if (!res.ok) {
        setErreur(donnees.error || t('messageEchec'));
        return false;
      }
      setErreur('');
      setMessages((liste) => (liste.some((m) => m.id === donnees.data.id) ? liste : [...liste, donnees.data]));
      return true;
    } catch {
      setErreur(t('injoignable'));
      return false;
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <LifeBuoy className="text-orange-500" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('titre')}</h1>
            <p className="text-gray-500 text-sm">
              {t('aide')}
            </p>
          </div>
        </div>

        {messages.length === 0 && !chargement && (
          <div className="flex flex-wrap gap-2">
            {SUJETS_RAPIDES.map((rang) => t(`sujets.${rang}`)).map((sujet) => (
              <button
                key={sujet}
                onClick={() => envoyer(sujet)}
                className="px-3 py-1.5 bg-white border border-gray-200 hover:border-orange-600 rounded-full text-sm text-gray-800"
              >
                {sujet}
              </button>
            ))}
          </div>
        )}

        {erreur && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">{erreur}</div>
        )}

        {chargement ? (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <FilSupport
                clair
            messages={messages}
            moi="DRIVER"
            surEnvoi={envoyer}
            vide={t('vide')}
          />
        )}
      </div>
    </div>
  );
}
