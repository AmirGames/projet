'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { connexionTempsReel } from '@/lib/temps-reel';
import { LifeBuoy } from 'lucide-react';

import { FilSupport, type MessageSupport } from '@/components/FilSupport';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const SUJETS_RAPIDES = [
  'Le client ne répond pas',
  "Le commerce n'a pas préparé la commande",
  "Je n'arrive pas à trouver l'adresse",
  'Problème avec mon véhicule',
];

/** Chat en direct avec le support, pour le livreur. */
export default function SupportLivreurPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageSupport[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  const jeton = () => localStorage.getItem('driverToken');

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
      setErreur(e instanceof Error && e.message ? e.message : 'Le fil n\'a pas pu être chargé.');
    } finally {
      setChargement(false);
    }
  }, [router]);

  useEffect(() => {
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
        setErreur(donnees.error || "Le message n'est pas parti.");
        return false;
      }
      setErreur('');
      setMessages((liste) => (liste.some((m) => m.id === donnees.data.id) ? liste : [...liste, donnees.data]));
      return true;
    } catch {
      setErreur('Serveur injoignable.');
      return false;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <LifeBuoy className="text-orange-500" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-white">Support en direct</h1>
            <p className="text-gray-400 text-sm">
              Un souci pendant une course ? Écrivez-nous, la course en cours est jointe automatiquement.
            </p>
          </div>
        </div>

        {messages.length === 0 && !chargement && (
          <div className="flex flex-wrap gap-2">
            {SUJETS_RAPIDES.map((sujet) => (
              <button
                key={sujet}
                onClick={() => envoyer(sujet)}
                className="px-3 py-1.5 bg-gray-800 border border-gray-700 hover:border-orange-600 rounded-full text-sm text-gray-200"
              >
                {sujet}
              </button>
            ))}
          </div>
        )}

        {erreur && (
          <div className="bg-red-900/30 border border-red-700/50 text-red-200 rounded-lg p-3 text-sm">{erreur}</div>
        )}

        {chargement ? (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <FilSupport
            messages={messages}
            moi="DRIVER"
            surEnvoi={envoyer}
            vide="Posez votre question : l'équipe vous répond ici, en direct."
          />
        )}
      </div>
    </div>
  );
}
