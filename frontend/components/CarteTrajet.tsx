'use client';

/**
 * Le fond de carte du suivi de livraison.
 *
 * Le trajet se lisait sur un plan dessiné à la main : un trait, trois repères,
 * et une pastille qui glissait entre les deux extrémités. Cela répondait à
 * « c'est encore loin ? », jamais à « il en est où ? » — un livreur aux deux
 * tiers du trajet pouvait être dans la rue d'à côté comme à l'autre bout de la
 * ville, le trait était le même.
 *
 * Ici le client voit les trois points là où ils sont vraiment : le commerce,
 * son adresse, et le livreur entre les deux. Le fond vient d'OpenStreetMap,
 * comme la carte des zones — ni clé, ni compte.
 *
 * Si les tuiles n'arrivent pas — réseau coupé, fournisseur injoignable — la
 * carte reste lisible : les points et le trajet sont dessinés par le
 * navigateur, pas par le fournisseur.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Map as CarteLeaflet, Marker, Polyline } from 'leaflet';

import 'leaflet/dist/leaflet.css';

export interface PointCarte {
  latitude: number;
  longitude: number;
}

interface Props {
  /** Le commerce, d'où part la commande. */
  retrait?: PointCarte | null;
  /** L'adresse du client. */
  destination?: PointCarte | null;
  /** Le livreur, s'il a déjà donné sa position. */
  livreur?: PointCarte | null;
  livree?: boolean;
  hauteur?: number;
}

/** Des pastilles dessinées, plutôt que des images chargées ailleurs. */
const pastille = (fond: string, contenu: string) => `
  <span style="
    display:flex;align-items:center;justify-content:center;
    width:26px;height:26px;border-radius:50%;
    background:${fond};border:2px solid #fff;font-size:13px;line-height:1;
    box-shadow:0 0 0 1px rgba(0,0,0,.4);
  ">${contenu}</span>`;

const COMMERCE = pastille('#475569', '🏪');
const MAISON = pastille('#16a34a', '🏠');
const LIVREUR = pastille('#ea580c', '🛵');

export function CarteTrajet({ retrait, destination, livreur, livree, hauteur = 260 }: Props) {
  const t = useTranslations('carteTrajet');
  const conteneur = useRef<HTMLDivElement>(null);
  const carte = useRef<CarteLeaflet | null>(null);
  const leaflet = useRef<typeof import('leaflet') | null>(null);

  const points = useRef<{ retrait: Marker | null; destination: Marker | null; livreur: Marker | null }>({
    retrait: null,
    destination: null,
    livreur: null,
  });
  const trajet = useRef<{ parcouru: Polyline | null; restant: Polyline | null }>({
    parcouru: null,
    restant: null,
  });

  // Le cadrage ne se refait qu'à l'ouverture : le recalculer à chaque position
  // reçue arracherait la carte des mains du client qui vient de la déplacer.
  const cadre = useRef(false);

  const [prete, setPrete] = useState(false);

  useEffect(() => {
    let annule = false;

    (async () => {
      const L = await import('leaflet');
      if (annule || !conteneur.current || carte.current) return;

      leaflet.current = L;

      const instance = L.map(conteneur.current, {
        center: [retrait?.latitude ?? 46.6, retrait?.longitude ?? 2.5],
        zoom: retrait ? 13 : 5,
        // Le suivi se lit sur un téléphone, au milieu d'une page qui défile :
        // la molette doit faire défiler la page, pas zoomer la carte.
        scrollWheelZoom: false,
      });

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(instance);

      carte.current = instance;
      setPrete(true);
    })();

    return () => {
      annule = true;
      carte.current?.remove();
      carte.current = null;
      points.current = { retrait: null, destination: null, livreur: null };
      trajet.current = { parcouru: null, restant: null };
      cadre.current = false;
    };
    // Volontairement une seule fois : les points se mettent à jour plus bas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = leaflet.current;
    if (!prete || !L || !carte.current) return;

    const poser = (
      cle: 'retrait' | 'destination' | 'livreur',
      point: PointCarte | null | undefined,
      html: string,
      titre: string
    ) => {
      if (!point) {
        points.current[cle]?.remove();
        points.current[cle] = null;
        return;
      }

      const existant = points.current[cle];

      if (existant) {
        existant.setLatLng([point.latitude, point.longitude]);
        return;
      }

      points.current[cle] = L.marker([point.latitude, point.longitude], {
        icon: L.divIcon({ html, className: '', iconSize: [26, 26], iconAnchor: [13, 13] }),
        title: titre,
      })
        .bindTooltip(titre)
        .addTo(carte.current!);
    };

    poser('retrait', retrait, COMMERCE, t('commerce'));
    poser('destination', destination, MAISON, t('yourAddress'));
    // Une fois livrée, la pastille du livreur n'a plus rien à montrer : elle
    // resterait figée sur sa dernière position, comme s'il était encore en
    // route.
    poser('livreur', livree ? null : livreur, LIVREUR, t('driver'));

    // Deux traits plutôt qu'un : ce qui est fait est plein, ce qui reste est
    // pointillé. Sans livreur, le trajet entier reste à faire.
    const tracer = (
      cle: 'parcouru' | 'restant',
      de: PointCarte | null | undefined,
      vers: PointCarte | null | undefined,
      style: { color: string; dashArray?: string }
    ) => {
      if (!de || !vers) {
        trajet.current[cle]?.remove();
        trajet.current[cle] = null;
        return;
      }

      const segment: [number, number][] = [
        [de.latitude, de.longitude],
        [vers.latitude, vers.longitude],
      ];

      const existant = trajet.current[cle];

      if (existant) {
        existant.setLatLngs(segment);
        return;
      }

      trajet.current[cle] = L.polyline(segment, { weight: 4, opacity: 0.9, ...style }).addTo(
        carte.current!
      );
    };

    const depuis = livree ? destination : livreur;

    tracer('parcouru', retrait, depuis, { color: '#ea580c' });
    tracer('restant', depuis ?? retrait, destination, { color: '#94a3b8', dashArray: '6 8' });

    if (!cadre.current) {
      const connus = [retrait, livreur, destination].filter(Boolean) as PointCarte[];

      if (connus.length >= 2) {
        carte.current.fitBounds(
          L.latLngBounds(connus.map((p) => [p.latitude, p.longitude] as [number, number])),
          { padding: [40, 40], maxZoom: 16 }
        );
        cadre.current = true;
      } else if (connus.length === 1) {
        carte.current.setView([connus[0].latitude, connus[0].longitude], 14);
      }
    }
  }, [prete, retrait, destination, livreur, livree, t]);

  return (
    <div
      ref={conteneur}
      data-carte-trajet
      style={{ height: `${hauteur}px` }}
      className="w-full rounded-lg overflow-hidden border border-gray-700 bg-gray-900 z-0"
    />
  );
}

/**
 * Export par défaut, pour `next/dynamic` : repris par
 * `import(...).then((m) => m.X)`, le module atterrit dans un morceau que le
 * manifeste ne retrouve plus après un changement de dépendances.
 */
export default CarteTrajet;
