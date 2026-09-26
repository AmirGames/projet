'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Etat = 'indisponible' | 'refuse' | 'inactif' | 'actif' | 'chargement';

const sansAbonnement = () => () => {};

/** Les notifications impossibles ici, ou refusées ; null sinon. */
function constatDuNavigateur(): 'indisponible' | 'refuse' | null {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return 'indisponible';
  if (Notification.permission === 'denied') return 'refuse';
  return null;
}

/** La clé VAPID arrive en base64 URL ; PushManager l'attend en octets. */
function cleEnOctets(base64: string) {
  const complement = '='.repeat((4 - (base64.length % 4)) % 4);
  const brut = atob((base64 + complement).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(brut, (c) => c.charCodeAt(0));
}

/** Le service worker des notifications, enregistré une seule fois. */
export async function serviceWorkerNotifications() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

/**
 * Affiche une notification système quand la page n'est pas au premier plan.
 *
 * Filet de sécurité quand le push n'est pas configuré côté serveur : l'onglet
 * ouvert mais caché reçoit l'événement temps réel, et le signale au système.
 */
export async function notifierSiCache(titre: string, corps: string, tag: string, url = '/driver') {
  if (typeof document === 'undefined' || !document.hidden) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  const enregistrement = await serviceWorkerNotifications();
  if (enregistrement) {
    enregistrement.showNotification(titre, { body: corps, tag, data: { url } });
  } else {
    new Notification(titre, { body: corps, tag });
  }
}

/**
 * Activation des notifications du livreur.
 *
 * Sans elles, une course proposée pendant que le téléphone est dans la poche
 * expirait sans avoir été vue : l'application ne pouvait prévenir que si elle
 * était affichée.
 */
export function ActiverNotifications() {
  // Ce que le navigateur interdit l'emporte sur l'état suivi ici.
  const constat = useSyncExternalStore(sansAbonnement, constatDuNavigateur, () => null);
  const [etatSuivi, setEtat] = useState<Etat>('chargement');
  const etat = constat ?? etatSuivi;
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (constatDuNavigateur()) return;

    (async () => {
      const enregistrement = await serviceWorkerNotifications();
      const abonnement = await enregistrement?.pushManager?.getSubscription().catch(() => null);
      setEtat(Notification.permission === 'granted' && (abonnement || !enregistrement?.pushManager) ? 'actif' : 'inactif');
    })();
  }, []);

  const activer = async () => {
    const token = localStorage.getItem('driverToken');
    if (!token) return;

    setEtat('chargement');
    setMessage('');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setEtat(permission === 'denied' ? 'refuse' : 'inactif');
      return;
    }

    try {
      const enregistrement = await serviceWorkerNotifications();
      const config = await fetch(`${API_URL}/api/drivers/push/config`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json());

      // Push non configuré sur le serveur : les notifications restent
      // possibles tant que l'onglet est ouvert, même en arrière-plan.
      if (!enregistrement?.pushManager || !config?.data?.enabled || !config.data.publicKey) {
        setEtat('actif');
        setMessage("Notifications actives tant que l'application reste ouverte.");
        return;
      }

      const abonnement =
        (await enregistrement.pushManager.getSubscription()) ||
        (await enregistrement.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: cleEnOctets(config.data.publicKey),
        }));

      const res = await fetch(`${API_URL}/api/drivers/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(abonnement.toJSON()),
      });

      if (!res.ok) throw new Error();

      await fetch(`${API_URL}/api/drivers/push/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      setEtat('actif');
    } catch {
      setEtat('inactif');
      setMessage("L'activation a échoué. Réessayez.");
    }
  };

  const desactiver = async () => {
    const token = localStorage.getItem('driverToken');
    const enregistrement = await serviceWorkerNotifications();
    const abonnement = await enregistrement?.pushManager?.getSubscription().catch(() => null);
    await abonnement?.unsubscribe().catch(() => {});
    if (token) {
      await fetch(`${API_URL}/api/drivers/push/subscribe`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    setEtat('inactif');
  };

  if (etat === 'indisponible') return null;

  return (
    <div className="space-y-2">
      <p className="text-gray-400 text-sm flex items-center gap-2">
        <Bell size={16} /> Notifications
      </p>

      {etat === 'refuse' ? (
        <p className="text-xs text-amber-300 flex gap-2">
          <BellOff size={14} className="flex-shrink-0 mt-0.5" />
          Bloquées par le navigateur. Autorisez-les dans les réglages du site pour être prévenu des courses.
        </p>
      ) : etat === 'actif' ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-green-400 flex items-center gap-2">
            <BellRing size={16} /> Activées
          </span>
          <button onClick={desactiver} className="text-xs text-gray-400 hover:text-white underline">
            Désactiver
          </button>
        </div>
      ) : (
        <button
          onClick={activer}
          disabled={etat === 'chargement'}
          className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg"
        >
          Activer les notifications
        </button>
      )}

      {message && <p className="text-xs text-gray-400">{message}</p>}
    </div>
  );
}
