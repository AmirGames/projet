'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { connexionTempsReel } from '@/lib/temps-reel';
import { MessageCircle, Phone, Circle, Package, SatelliteDish } from 'lucide-react';

import { FilSupport, type MessageSupport } from '@/components/FilSupport';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Conversation {
  driverId: string;
  driverName: string;
  phone: string | null;
  isOnline: boolean;
  enCourse: boolean;
  unread: number;
  lastMessage: { body: string; sender: string; createdAt: string } | null;
}

interface Livreur {
  id: string;
  name: string;
  phone: string;
  email: string;
  isOnline: boolean;
  currentOrderId: string | null;
  lastLocationUpdate: string | null;
  gpsLostAt: string | null;
}

/** Chat support : les conversations avec les livreurs, en direct. */
export default function DriverSupportPage() {
  const t = useTranslations('superownerDriverSupport');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selection, setSelection] = useState<string | null>(null);
  const [livreur, setLivreur] = useState<Livreur | null>(null);
  const [messages, setMessages] = useState<MessageSupport[]>([]);
  const [erreur, setErreur] = useState('');
  const selectionRef = useRef<string | null>(null);

  const jeton = () => localStorage.getItem('accessToken');

  const chargerConversations = useCallback(async () => {
    const token = jeton();
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/superowner/driver-support`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const donnees = await res.json();
      if (!res.ok) throw new Error(donnees.error);
      setConversations(donnees.data || []);
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : t('loadError'));
    }
  }, [t]);

  const ouvrir = useCallback(
    async (driverId: string) => {
      const token = jeton();
      if (!token) return;
      setSelection(driverId);
      selectionRef.current = driverId;
      try {
        const res = await fetch(`${API_URL}/api/superowner/driver-support/${driverId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const donnees = await res.json();
        if (!res.ok) throw new Error(donnees.error);
        setLivreur(donnees.data.driver);
        setMessages(donnees.data.messages);
        // Ouvrir le fil l'a marqué lu.
        setConversations((liste) => liste.map((c) => (c.driverId === driverId ? { ...c, unread: 0 } : c)));
      } catch (e) {
        setErreur(e instanceof Error && e.message ? e.message : t('loadError'));
      }
    },
    [t]
  );

  useEffectChargement(() => {
    chargerConversations();
  }, [chargerConversations]);

  // Chaque message de livreur arrive en direct : fil ouvert ou liste.
  useEffect(() => {
    const token = jeton();
    if (!token) return;

    const socket = connexionTempsReel();

    const surMessage = (message: MessageSupport & { driverName?: string }) => {
      if (message.driverId === selectionRef.current) {
        setMessages((liste) => (liste.some((m) => m.id === message.id) ? liste : [...liste, message]));
        if (message.sender === 'DRIVER') ouvrir(message.driverId);
      }
      chargerConversations();
    };

    const surLu = ({ driverId }: { driverId: string }) => {
      if (driverId !== selectionRef.current) return;
      setMessages((liste) =>
        liste.map((m) => (m.sender === 'SUPPORT' && !m.readAt ? { ...m, readAt: new Date().toISOString() } : m))
      );
    };

    socket.on('support-message', surMessage);
    socket.on('support-lu', surLu);

    // La connexion est partagée : on retire nos écouteurs, on ne la ferme pas.
    return () => {
      socket.off('support-message', surMessage);
      socket.off('support-lu', surLu);
    };
  }, [chargerConversations, ouvrir]);

  const repondre = async (texte: string) => {
    const token = jeton();
    if (!token || !selection) return false;
    try {
      const res = await fetch(`${API_URL}/api/superowner/driver-support/${selection}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: texte }),
      });
      const donnees = await res.json();
      if (!res.ok) {
        setErreur(donnees.error || t('sendError'));
        return false;
      }
      setErreur('');
      setMessages((liste) => (liste.some((m) => m.id === donnees.data.id) ? liste : [...liste, donnees.data]));
      chargerConversations();
      return true;
    } catch {
      setErreur(t('sendError'));
      return false;
    }
  };

  const totalNonLus = conversations.reduce((somme, c) => somme + c.unread, 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <MessageCircle className="text-orange-500" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('title')} {totalNonLus > 0 && <span className="text-orange-600">({totalNonLus})</span>}
          </h1>
          <p className="text-gray-500 text-sm">{t('description')}</p>
        </div>
      </div>

      {erreur && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">{erreur}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Conversations */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden lg:h-[75vh] overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="text-center text-gray-500 text-sm p-8">{t('empty')}</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.driverId}
                onClick={() => ouvrir(c.driverId)}
                className={`w-full text-left px-4 py-3 border-b border-gray-200 hover:bg-gray-50 ${
                  selection === c.driverId ? 'bg-gray-100' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-gray-900 flex items-center gap-2 min-w-0">
                    <Circle
                      size={8}
                      className={c.isOnline ? 'fill-green-500 text-green-500' : 'fill-gray-500 text-gray-500'}
                    />
                    <span className="truncate">{c.driverName}</span>
                    {c.enCourse && <Package size={14} className="text-orange-600 shrink-0" />}
                  </span>
                  {c.unread > 0 && (
                    <span className="bg-orange-600 text-white text-xs font-bold rounded-full px-2 py-0.5">{c.unread}</span>
                  )}
                </div>
                {c.lastMessage && (
                  <p className="text-xs text-gray-500 truncate mt-1">
                    {c.lastMessage.sender === 'SUPPORT' ? `${t('you')} : ` : ''}
                    {c.lastMessage.body}
                  </p>
                )}
              </button>
            ))
          )}
        </div>

        {/* Fil */}
        <div className="lg:col-span-2 space-y-3">
          {!selection || !livreur ? (
            <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-500">
              {t('selectConversation')}
            </div>
          ) : (
            <>
              <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-gray-900 font-semibold">{livreur.name}</p>
                  <p className="text-xs text-gray-500">{livreur.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className={livreur.isOnline ? 'text-green-600' : 'text-gray-500'}>
                    {livreur.isOnline ? t('online') : t('offline')}
                  </span>
                  {livreur.currentOrderId && (
                    <span className="text-orange-700 flex items-center gap-1">
                      <Package size={14} /> {t('onDelivery')}
                    </span>
                  )}
                  {livreur.gpsLostAt && (
                    <span className="text-amber-700 flex items-center gap-1">
                      <SatelliteDish size={14} /> {t('gpsLost')}
                    </span>
                  )}
                  {livreur.phone && (
                    <a
                      href={`tel:${livreur.phone}`}
                      className="flex items-center gap-1 px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-900"
                    >
                      <Phone size={14} /> {livreur.phone}
                    </a>
                  )}
                </div>
              </div>
              <FilSupport clair messages={messages} moi="SUPPORT" surEnvoi={repondre} hauteur="h-[58vh]" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
