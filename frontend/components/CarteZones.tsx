'use client';

/**
 * La carte des zones de livraison.
 *
 * Les zones sont des anneaux autour de la boutique, et se réglaient au
 * kilomètre près dans un champ de saisie : « 3 km », sans que personne ne sache
 * ce que cela couvrait. Le commerçant devinait, et découvrait la portée réelle
 * de sa zone à la première commande refusée.
 *
 * Ici il voit : sa boutique sur la carte, ses anneaux dessinés, et une poignée
 * au bord de celui qu'il règle. Il tire la poignée, le rayon suit — en
 * kilomètres, et à l'écran.
 *
 * Le fond de carte vient d'OpenStreetMap. S'il n'arrive pas — réseau coupé,
 * fournisseur injoignable — la carte reste utilisable : les anneaux, la
 * boutique et la poignée sont dessinés par le navigateur, pas par le
 * fournisseur.
 */

import { useEffect, useRef, useState } from 'react';
import type { Circle, Polygon, Polyline, CircleMarker, Map as CarteLeaflet, Marker } from 'leaflet';

import 'leaflet/dist/leaflet.css';

export interface Sommet {
  latitude: number;
  longitude: number;
}

export interface ZoneCarte {
  id: string;
  name: string;
  type: 'RADIUS' | 'POLYGON';
  /** En kilomètres, uniquement pour le type RADIUS. */
  radiusKm: number | null;
  /** Uniquement pour le type POLYGON. */
  polygon: Sommet[] | null;
  color: string;
  opacity: number;
  isActive: boolean;
}

interface Props {
  latitude: number | null;
  longitude: number | null;
  zones: ZoneCarte[];
  /** La zone-anneau en cours de réglage : la seule dont le rayon se tire. */
  zoneActive?: { id: string | null; name: string; radiusKm: number } | null;
  /** La boutique a été déplacée sur la carte. */
  onPosition?: (latitude: number, longitude: number) => void;
  /** Le rayon de la zone active a changé, en kilomètres. */
  onRayon?: (km: number) => void;
  /**
   * Les sommets déjà posés d'un polygone en cours de dessin — `null` ou
   * `undefined` quand on n'est pas en train de dessiner. C'est le parent qui
   * porte la liste ; la carte ne fait qu'y ajouter un point à chaque clic.
   */
  dessin?: Sommet[] | null;
  /** Un clic sur la carte a posé un sommet (uniquement pendant le dessin). */
  onSommet?: (latitude: number, longitude: number) => void;
  /** Couleur d'aperçu du polygone en cours de dessin. */
  couleurDessin?: string;
  hauteur?: number;
}

/** Une pastille dessinée, plutôt qu'une image chargée ailleurs. */
const PASTILLE = `
  <span style="
    display:block;width:18px;height:18px;border-radius:50%;
    background:#f59e0b;border:3px solid #fff;
    box-shadow:0 0 0 1px rgba(0,0,0,.4);
  "></span>`;

const POIGNEE = `
  <span style="
    display:block;width:14px;height:14px;border-radius:50%;
    background:#fff;border:3px solid #f59e0b;cursor:grab;
    box-shadow:0 0 0 1px rgba(0,0,0,.4);
  "></span>`;

/** Deux décimales : le rayon se règle à dix mètres près, pas au centimètre. */
const arrondi = (km: number) => Math.round(km * 100) / 100;

export function CarteZones({
  latitude,
  longitude,
  zones,
  zoneActive,
  onPosition,
  onRayon,
  dessin,
  onSommet,
  couleurDessin = '#f59e0b',
  hauteur = 560,
}: Props) {
  const conteneur = useRef<HTMLDivElement>(null);
  const carte = useRef<CarteLeaflet | null>(null);
  const boutique = useRef<Marker | null>(null);
  const anneaux = useRef<Circle[]>([]);
  const polygones = useRef<Polygon[]>([]);
  const anneauActif = useRef<Circle | null>(null);
  const poignee = useRef<Marker | null>(null);
  const traceDessin = useRef<Polyline | null>(null);
  const sommetsDessin = useRef<CircleMarker[]>([]);
  const leaflet = useRef<typeof import('leaflet') | null>(null);

  const [prete, setPrete] = useState(false);

  // Les rappels changent à chaque rendu : les garder dans une référence évite
  // de redéclarer les écouteurs de la carte à chaque frappe au clavier.
  const rappels = useRef({ onPosition, onRayon, onSommet, dessin });
  rappels.current = { onPosition, onRayon, onSommet, dessin };

  // ===== La carte, une seule fois =====
  useEffect(() => {
    let annule = false;

    (async () => {
      const L = await import('leaflet');
      if (annule || !conteneur.current || carte.current) return;

      leaflet.current = L;

      const centre: [number, number] = [latitude ?? 46.6, longitude ?? 2.5];

      const instance = L.map(conteneur.current, {
        center: centre,
        // Sans coordonnées, on montre le pays plutôt qu'un champ au hasard.
        zoom: latitude == null ? 5 : 13,
        scrollWheelZoom: false,
      });

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(instance);

      // Trois usages du clic, dans l'ordre : poser un sommet si l'on dessine
      // un polygone ; sinon poser la boutique si elle n'a pas encore de point
      // (ensuite, seul le point lui-même se déplace, pour qu'un clic sur la
      // carte ne déplace jamais le commerce par mégarde).
      instance.on('click', (evenement) => {
        if (rappels.current.dessin != null) {
          rappels.current.onSommet?.(evenement.latlng.lat, evenement.latlng.lng);
          return;
        }
        if (boutique.current) return;
        rappels.current.onPosition?.(evenement.latlng.lat, evenement.latlng.lng);
      });

      carte.current = instance;
      setPrete(true);
    })();

    return () => {
      annule = true;
      carte.current?.remove();
      carte.current = null;
    };
    // Volontairement une seule fois : la position se met à jour plus bas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== La boutique =====
  useEffect(() => {
    const L = leaflet.current;
    if (!prete || !L || !carte.current) return;

    if (latitude == null || longitude == null) {
      boutique.current?.remove();
      boutique.current = null;
      return;
    }

    if (!boutique.current) {
      boutique.current = L.marker([latitude, longitude], {
        // Déplaçable : c'est ainsi qu'on situe une boutique que le service
        // d'adresses a mal placée, ou pas placée du tout.
        draggable: !!rappels.current.onPosition,
        icon: L.divIcon({ html: PASTILLE, className: '', iconSize: [18, 18], iconAnchor: [9, 9] }),
        title: 'Votre boutique — déplacez-la pour la situer',
      }).addTo(carte.current);

      boutique.current.on('dragend', () => {
        const point = boutique.current?.getLatLng();
        if (point) rappels.current.onPosition?.(point.lat, point.lng);
      });
    } else {
      boutique.current.setLatLng([latitude, longitude]);
    }

    carte.current.setView([latitude, longitude], Math.max(carte.current.getZoom(), 12));
  }, [prete, latitude, longitude]);

  // ===== Les anneaux (type RADIUS) =====
  useEffect(() => {
    const L = leaflet.current;
    if (!prete || !L || !carte.current) return;

    for (const anneau of anneaux.current) anneau.remove();
    anneaux.current = [];

    if (latitude == null || longitude == null) return;

    const rayons = zones.filter((zone): zone is ZoneCarte & { radiusKm: number } => zone.type === 'RADIUS' && zone.radiusKm != null);

    // Du plus large au plus étroit : sinon le grand anneau recouvre les petits
    // et on ne voit plus qu'un disque.
    const triees = [...rayons].sort((a, b) => b.radiusKm - a.radiusKm);

    for (const zone of triees) {
      if (zone.id === zoneActive?.id) continue;

      anneaux.current.push(
        L.circle([latitude, longitude], {
          radius: zone.radiusKm * 1000,
          color: zone.isActive ? zone.color : '#64748b',
          weight: 2,
          fillColor: zone.isActive ? zone.color : '#64748b',
          fillOpacity: zone.isActive ? zone.opacity : 0.06,
        })
          .bindTooltip(`${zone.name} — ${zone.radiusKm} km`)
          .addTo(carte.current)
      );
    }
  }, [prete, latitude, longitude, zones, zoneActive?.id]);

  // ===== Les polygones (type POLYGON) =====
  useEffect(() => {
    const L = leaflet.current;
    if (!prete || !L || !carte.current) return;

    for (const forme of polygones.current) forme.remove();
    polygones.current = [];

    const formes = zones.filter((zone) => zone.type === 'POLYGON' && zone.polygon && zone.polygon.length >= 3);

    for (const zone of formes) {
      const sommets = (zone.polygon as Sommet[]).map((s) => [s.latitude, s.longitude] as [number, number]);

      polygones.current.push(
        L.polygon(sommets, {
          color: zone.isActive ? zone.color : '#64748b',
          weight: 2,
          fillColor: zone.isActive ? zone.color : '#64748b',
          fillOpacity: zone.isActive ? zone.opacity : 0.06,
        })
          .bindTooltip(zone.name)
          .addTo(carte.current)
      );
    }
  }, [prete, zones]);

  // ===== Le polygone en cours de dessin =====
  useEffect(() => {
    const L = leaflet.current;
    if (!prete || !L || !carte.current) return;

    traceDessin.current?.remove();
    traceDessin.current = null;
    for (const point of sommetsDessin.current) point.remove();
    sommetsDessin.current = [];

    if (!dessin || dessin.length === 0) return;

    const points = dessin.map((s) => [s.latitude, s.longitude] as [number, number]);

    // Une ligne, pas encore un polygone fermé : on ne sait pas si le dernier
    // sommet est vraiment le dernier tant que le commerçant n'a pas cliqué
    // sur « Terminer la zone ».
    traceDessin.current = (points.length >= 2 ? L.polygon(points, { color: couleurDessin, weight: 2, fillColor: couleurDessin, fillOpacity: 0.15, dashArray: '6 4' }) : L.polyline(points, { color: couleurDessin, weight: 2, dashArray: '6 4' })).addTo(carte.current);

    for (const [lat, lng] of points) {
      sommetsDessin.current.push(
        L.circleMarker([lat, lng], { radius: 5, color: couleurDessin, fillColor: '#fff', fillOpacity: 1, weight: 2 }).addTo(
          carte.current
        )
      );
    }
  }, [prete, dessin, couleurDessin]);

  // ===== L'anneau en cours de réglage, et sa poignée =====
  useEffect(() => {
    const L = leaflet.current;
    if (!prete || !L || !carte.current) return;

    const retirer = () => {
      anneauActif.current?.remove();
      anneauActif.current = null;
      poignee.current?.remove();
      poignee.current = null;
    };

    if (!zoneActive || latitude == null || longitude == null || !(zoneActive.radiusKm > 0)) {
      retirer();
      return;
    }

    const rayonMetres = zoneActive.radiusKm * 1000;

    if (!anneauActif.current) {
      anneauActif.current = L.circle([latitude, longitude], {
        radius: rayonMetres,
        color: '#f59e0b',
        weight: 3,
        fillOpacity: 0.12,
      }).addTo(carte.current);
    } else {
      anneauActif.current.setLatLng([latitude, longitude]);
      anneauActif.current.setRadius(rayonMetres);
    }

    // La poignée se pose plein est du centre : une position stable, que le
    // commerçant retrouve d'un réglage à l'autre. Un degré de longitude vaut
    // 111,32 km à l'équateur, et se resserre en remontant vers le pôle.
    const degresParMetre = 1 / (111320 * Math.cos((latitude * Math.PI) / 180));
    const positionPoignee = L.latLng(latitude, longitude + rayonMetres * degresParMetre);

    if (!poignee.current) {
      poignee.current = L.marker(positionPoignee, {
        draggable: true,
        icon: L.divIcon({ html: POIGNEE, className: '', iconSize: [14, 14], iconAnchor: [7, 7] }),
        title: 'Tirez pour régler le rayon',
      }).addTo(carte.current);

      // Le rayon suit la poignée pendant qu'on la tire, et non au relâcher :
      // c'est ce qui rend le réglage lisible.
      poignee.current.on('drag', () => {
        const point = poignee.current?.getLatLng();
        if (!point || !leaflet.current) return;

        const metres = leaflet.current.latLng(latitude, longitude).distanceTo(point);
        anneauActif.current?.setRadius(metres);
        rappels.current.onRayon?.(arrondi(metres / 1000));
      });
    } else {
      poignee.current.setLatLng(positionPoignee);
    }
  }, [prete, latitude, longitude, zoneActive]);

  return (
    <div>
      <div
        ref={conteneur}
        data-carte-zones
        style={{ height: `${hauteur}px` }}
        className="w-full rounded-lg overflow-hidden border border-slate-700 bg-slate-800 z-0"
      />

      <p className="text-xs text-slate-400 mt-2">
        {latitude == null
          ? 'Votre boutique n’est pas encore située : renseignez son adresse ou posez-la sur la carte.'
          : dessin != null
            ? 'Cliquez sur la carte pour poser les sommets de la zone, dans l’ordre.'
            : zoneActive
              ? 'Tirez la poignée orange pour régler le rayon.'
              : onPosition
                ? 'Déplacez le point de la boutique pour corriger sa position.'
                : ''}
      </p>
    </div>
  );
}

/**
 * Export par défaut, pour `next/dynamic`.
 *
 * Chargé par `import(...).then((m) => m.CarteZones)`, le module se retrouvait
 * dans un chunk que le manifeste ne retrouvait plus après un changement de
 * dépendances : « Loading chunk … failed (http://…/_next/undefined) ». La forme
 * par défaut est celle que `dynamic()` résout sans détour.
 */
export default CarteZones;
