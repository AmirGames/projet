'use client';

/**
 * Suivi en temps réel de la livraison.
 *
 * Affiche une carte avec:
 * - Position du restaurant (prise en charge)
 * - Position du client (livraison)
 * - Position actuelle du livreur
 * - Trajet et temps d'arrivée estimé
 * - Actualisation en temps réel via WebSocket
 */

import { useEffect, useRef, useState } from 'react';
import type { Map as CarteLeaflet, CircleMarker } from 'leaflet';
import { MapPin, Clock, Truck, AlertCircle } from 'lucide-react';
import L from 'leaflet';

import 'leaflet/dist/leaflet.css';

interface DeliveryTracking {
  orderId: string;
  driverId?: string;
  driverLat?: number;
  driverLng?: number;
  pickupLat: number;
  pickupLng: number;
  deliveryLat: number;
  deliveryLng: number;
  status: string;
  estimatedTimeLeft?: number;
}

interface Props {
  orderId: string;
  delivery: DeliveryTracking;
  driverName?: string;
}

const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const estimatedTimeFromDistance = (km: number): number => {
  // Moyenne 30 km/h en ville + temps de manœuvre
  return Math.max(2, Math.round(km * 2));
};

export function SuiviLivraisonClient({ orderId, delivery, driverName }: Props) {
  const mapRef = useRef<CarteLeaflet | null>(null);
  const markersRef = useRef<{ [key: string]: CircleMarker }>({});
  const lineRef = useRef<L.Polyline | null>(null);
  const [currentDelivery, setCurrentDelivery] = useState<DeliveryTracking>(delivery);
  const [error, setError] = useState('');
  const socketRef = useRef<WebSocket | null>(null);

  // Initialiser la carte
  useEffect(() => {
    const element = document.getElementById(`map-${orderId}`);
    if (!element || mapRef.current) return;

    // Centre de la carte entre pickup et delivery
    const centerLat = (delivery.pickupLat + delivery.deliveryLat) / 2;
    const centerLng = (delivery.pickupLng + delivery.deliveryLng) / 2;

    const map = L.map(element).setView([centerLat, centerLng], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // Marker pour le restaurant (pickup)
    const pickupMarker = L.circleMarker([delivery.pickupLat, delivery.pickupLng], {
      radius: 10,
      fillColor: '#f59e0b',
      color: '#fff',
      weight: 3,
      opacity: 1,
      fillOpacity: 0.8,
    })
      .bindPopup('🏪 Restaurant')
      .addTo(map);

    markersRef.current.pickup = pickupMarker;

    // Marker pour la destination (delivery)
    const deliveryMarker = L.circleMarker([delivery.deliveryLat, delivery.deliveryLng], {
      radius: 10,
      fillColor: '#22c55e',
      color: '#fff',
      weight: 3,
      opacity: 1,
      fillOpacity: 0.8,
    })
      .bindPopup('📍 Destination')
      .addTo(map);

    markersRef.current.delivery = deliveryMarker;

    // Marker pour le livreur
    if (delivery.driverLat && delivery.driverLng) {
      const driverMarker = L.circleMarker([delivery.driverLat, delivery.driverLng], {
        radius: 12,
        fillColor: '#3b82f6',
        color: '#fff',
        weight: 3,
        opacity: 1,
        fillOpacity: 0.9,
      })
        .bindPopup('🚗 Livreur')
        .addTo(map);

      markersRef.current.driver = driverMarker;

      // Trajet du livreur à la destination
      lineRef.current = L.polyline(
        [
          [delivery.driverLat, delivery.driverLng],
          [delivery.deliveryLat, delivery.deliveryLng],
        ],
        { color: '#3b82f6', weight: 2, opacity: 0.7, dashArray: '5, 5' }
      ).addTo(map);
    }

    // Fit bounds pour voir tous les points
    const group = new L.FeatureGroup([pickupMarker, deliveryMarker]);
    if (markersRef.current.driver) {
      group.addLayer(markersRef.current.driver);
    }
    map.fitBounds(group.getBounds().pad(0.1));

    return () => {
      // Cleanup optionnel - garder la carte
    };
  }, [orderId, delivery]);

  // Écouter les mises à jour WebSocket
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_API_URL?.replace('http', 'ws') || 'ws://localhost:3001'}`
    );

    ws.onopen = () => {
      console.log('WebSocket connecté');
      ws.send(JSON.stringify({ event: 'join-order', orderId }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.orderId === orderId) {
          if (data.location) {
            // Mise à jour position du livreur
            setCurrentDelivery((prev) => ({
              ...prev,
              driverLat: data.location.latitude,
              driverLng: data.location.longitude,
            }));

            // Mettre à jour le marker du livreur
            if (mapRef.current && data.location.latitude && data.location.longitude) {
              if (markersRef.current.driver) {
                markersRef.current.driver.setLatLng([
                  data.location.latitude,
                  data.location.longitude,
                ]);
              } else {
                const driverMarker = L.circleMarker(
                  [data.location.latitude, data.location.longitude],
                  {
                    radius: 12,
                    fillColor: '#3b82f6',
                    color: '#fff',
                    weight: 3,
                    opacity: 1,
                    fillOpacity: 0.9,
                  }
                )
                  .bindPopup('🚗 Livreur')
                  .addTo(mapRef.current);

                markersRef.current.driver = driverMarker;
              }

              // Mettre à jour la ligne
              if (lineRef.current) {
                mapRef.current.removeLayer(lineRef.current);
              }

              lineRef.current = L.polyline(
                [
                  [data.location.latitude, data.location.longitude],
                  [currentDelivery.deliveryLat, currentDelivery.deliveryLng],
                ],
                { color: '#3b82f6', weight: 2, opacity: 0.7, dashArray: '5, 5' }
              ).addTo(mapRef.current);
            }
          }

          // Mise à jour statut
          if (data.status) {
            setCurrentDelivery((prev) => ({
              ...prev,
              status: data.status,
            }));
          }
        }
      } catch (err) {
        console.error('Erreur WebSocket:', err);
      }
    };

    ws.onerror = () => {
      setError('Erreur de connexion au suivi');
    };

    socketRef.current = ws;

    return () => {
      ws.close();
    };
  }, [orderId]);

  const timeRemaining = currentDelivery.driverLat
    ? estimatedTimeFromDistance(
        distanceKm(
          currentDelivery.driverLat,
          currentDelivery.driverLng || 0,
          currentDelivery.deliveryLat,
          currentDelivery.deliveryLng
        )
      )
    : undefined;

  const distance = currentDelivery.driverLat
    ? distanceKm(
        currentDelivery.driverLat,
        currentDelivery.driverLng || 0,
        currentDelivery.deliveryLat,
        currentDelivery.deliveryLng
      )
    : undefined;

  return (
    <div className="space-y-4">
      {/* Carte */}
      <div
        id={`map-${orderId}`}
        className="w-full h-96 rounded-lg border border-gray-700 shadow-lg"
      />

      {/* Infos */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
        {error && (
          <div className="bg-red-900/20 border border-red-600/30 rounded p-2 flex gap-2 text-sm text-red-400">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {currentDelivery.status === 'ACCEPTED' && (
          <div className="flex items-center gap-3 bg-blue-900/20 border border-blue-600/30 rounded p-3">
            <Truck size={18} className="text-blue-400 flex-shrink-0" />
            <div>
              <p className="text-blue-400 font-semibold text-sm">
                {driverName || 'Livreur'} est en route
              </p>
              <p className="text-gray-400 text-xs">La course est acceptée</p>
            </div>
          </div>
        )}

        {timeRemaining && distance !== undefined && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-700/50 rounded p-3">
              <p className="text-gray-400 text-xs mb-1">Distance</p>
              <p className="text-white font-bold text-lg flex items-center gap-1">
                <MapPin size={16} className="text-orange-500" />
                {distance.toFixed(1)} km
              </p>
            </div>
            <div className="bg-gray-700/50 rounded p-3">
              <p className="text-gray-400 text-xs mb-1">Temps estimé</p>
              <p className="text-white font-bold text-lg flex items-center gap-1">
                <Clock size={16} className="text-green-500" />
                {timeRemaining} min
              </p>
            </div>
          </div>
        )}

        {currentDelivery.status === 'COMPLETED' && (
          <div className="bg-green-900/20 border border-green-600/30 rounded p-3 text-center">
            <p className="text-green-400 font-semibold">✓ Commande livrée</p>
          </div>
        )}
      </div>
    </div>
  );
}
