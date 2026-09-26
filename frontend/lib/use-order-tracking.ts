'use client';

import { useEffect, useState, useCallback } from 'react';
import { connexionTempsReel, suivreSalon, useConnexionTempsReel } from '@/lib/temps-reel';
import { useStockageLocal } from '@/lib/navigateur';

interface OrderUpdate {
  orderId: string;
  status: string;
  timestamp: string;
  message?: string;
  title?: string;
  [key: string]: any;
}

interface DeliveryUpdate {
  orderId: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  eta?: number;
  /** Le livreur n'envoie plus sa position (true), ou elle est revenue (false). */
  gpsLost?: boolean;
  /** Le livreur est à moins de 300 m : le client peut descendre. */
  livreurProche?: boolean;
  timestamp: string;
}

export interface StatusNotification {
  status: string;
  title: string;
  message: string;
  timestamp: string;
}

export function useOrderTracking(orderId: string) {
  const [orderStatus, setOrderStatus] = useState<string>('');
  const [deliveryLocation, setDeliveryLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [gpsPerdu, setGpsPerdu] = useState<boolean | null>(null);
  // Suivie tant qu'une commande est ouverte par un compte connecté.
  const jetonPresent = Boolean(useStockageLocal('accessToken'));
  const isConnected = useConnexionTempsReel(Boolean(orderId) && jetonPresent);
  const [notification, setNotification] = useState<StatusNotification | null>(null);
  const [livreurProche, setLivreurProche] = useState(false);

  useEffect(() => {
    if (!orderId) return;

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    // La connexion de l'onglet : le salon de la commande est rejoint à
    // chaque (re)connexion, et quitté au départ de l'écran.
    const socketInstance = connexionTempsReel();
    const quitter = suivreSalon('order', orderId);

    const surCommande = (data: OrderUpdate) => {
      if (data.orderId === orderId) {
        setOrderStatus(data.status);

        // Afficher la notification si elle existe
        if (data.title && data.message) {
          setNotification({
            status: data.status,
            title: data.title,
            message: data.message,
            timestamp: data.timestamp || new Date().toISOString(),
          });

          // Masquer la notification après 5 secondes
          setTimeout(() => {
            setNotification(null);
          }, 5000);
        }

        console.log('Order status updated:', data.status);
      }
    };

    const surLivraison = (data: DeliveryUpdate) => {
      if (data.orderId === orderId) {
        if (data.location) {
          setDeliveryLocation(data.location);
          setGpsPerdu(false);
        }
        if (typeof data.gpsLost === 'boolean') {
          setGpsPerdu(data.gpsLost);
        }
        if (data.eta !== undefined) {
          setEta(data.eta);
        }
        // Prévenu une fois, à 300 m : le bandeau, et une notification du
        // téléphone si le client l'a permise — la page est souvent en fond.
        if (data.livreurProche) {
          setLivreurProche(true);
          const titre = 'Votre livreur est bientôt là';
          const texte = 'Vous pouvez descendre devant la porte.';
          setNotification({
            status: 'PICKED_UP',
            title: titre,
            message: texte,
            timestamp: data.timestamp || new Date().toISOString(),
          });
          setTimeout(() => setNotification(null), 10000);
          try {
            navigator.vibrate?.([200, 100, 200]);
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification(titre, { body: texte });
            }
          } catch {
            // Un navigateur qui refuse : le bandeau suffit.
          }
        }
        console.log('Delivery updated:', data);
      }
    };

    socketInstance.on('order-update', surCommande);
    socketInstance.on('delivery-update', surLivraison);

    // La connexion est partagée : on retire nos écouteurs, on ne la ferme pas.
    return () => {
      socketInstance.off('order-update', surCommande);
      socketInstance.off('delivery-update', surLivraison);
      quitter();
    };
  }, [orderId]);

  const updateOrderStatus = useCallback((status: string) => {
    setOrderStatus(status);
  }, []);

  const updateDeliveryLocation = useCallback((location: { latitude: number; longitude: number }, eta?: number) => {
    setDeliveryLocation(location);
    if (eta !== undefined) {
      setEta(eta);
    }
  }, []);

  return {
    orderStatus,
    deliveryLocation,
    eta,
    /** null tant qu'aucun événement n'a tranché : s'en remettre au chargement initial. */
    gpsPerdu,
    /** Le livreur approche : poussé en direct, en plus de ce que dit la course. */
    livreurProche,
    isConnected,
    notification,
    updateOrderStatus,
    updateDeliveryLocation,
  };
}
