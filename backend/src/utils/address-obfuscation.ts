/**
 * Obfuscation d'adresse pour protéger la confidentialité du client.
 *
 * Le livreur reçoit une adresse décalée de ±50m à ±100m de la vraie adresse,
 * ce qui lui permet de trouver l'immeuble mais pas d'identifier le client
 * exactement jusqu'à son arrivée.
 */

import { Point } from './geo';

/**
 * Génère une adresse obfusquée à proximité de l'adresse réelle.
 * L'offset est aléatoire, entre 50m et 100m dans une direction aléatoire.
 *
 * Mathématiques:
 * - 1 degré de latitude ≈ 111 km
 * - 1 degré de longitude ≈ 111 km * cos(latitude)
 * - Donc 50m ≈ 0.00045 degrés de latitude
 */
export function obfusquerAdresse(latitude: number, longitude: number): Point {
  // Distance en kilomètres : entre 0.05 km et 0.1 km (50m à 100m)
  const distanceKm = 0.05 + Math.random() * 0.05;

  // Angle aléatoire entre 0 et 2π
  const angle = Math.random() * 2 * Math.PI;

  // Convertir distance en degrés
  const dLat = distanceKm / 111;
  const dLng = distanceKm / (111 * Math.cos((latitude * Math.PI) / 180));

  // Appliquer le décalage selon l'angle
  const obfusquedLat = latitude + dLat * Math.sin(angle);
  const obfusquedLng = longitude + dLng * Math.cos(angle);

  return {
    latitude: parseFloat(obfusquedLat.toFixed(6)),
    longitude: parseFloat(obfusquedLng.toFixed(6)),
  };
}

/**
 * Calcule la distance réelle entre deux points (pour vérifier que le livreur
 * est assez proche de l'adresse réelle avant de la lui montrer).
 */
export function distanceReelleKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Vérifie si le livreur est assez proche de la vraie adresse.
 * Seuil: 200 mètres (pour couvrir les imprécisions GPS + marche vers la porte).
 */
export function estProcheAdresseReelle(
  driverLat: number,
  driverLng: number,
  realLat: number,
  realLng: number,
  seurilKm: number = 0.2
): boolean {
  const distance = distanceReelleKm(driverLat, driverLng, realLat, realLng);
  return distance <= seurilKm;
}
