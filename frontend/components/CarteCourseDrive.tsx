'use client';

/**
 * La carte d'un trajet ZupDrive : le départ, la destination, la route (quand
 * le serveur a pu la calculer) et le chauffeur pendant son approche.
 *
 * Propre à ZupDrive : la carte du suivi de livraison (CarteTrajet) montre un
 * commerce et un livreur, un autre métier. Fond OpenStreetMap, sans clé ni
 * compte ; si les tuiles n'arrivent pas, les points et le tracé restent
 * dessinés par le navigateur.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { LayerGroup, Map as CarteLeaflet } from 'leaflet';

import 'leaflet/dist/leaflet.css';

export interface PointCarte {
  latitude: number;
  longitude: number;
}

interface Props {
  depart: PointCarte;
  arrivee: PointCarte;
  /** Le tracé de la route, en [latitude, longitude] ; sinon une ligne droite pointillée. */
  trace?: [number, number][] | null;
  chauffeur?: PointCarte | null;
  hauteur?: number;
}

const pastille = (fond: string, contenu: string) => `
  <span style="
    display:flex;align-items:center;justify-content:center;
    width:26px;height:26px;border-radius:50%;
    background:${fond};border:2px solid #fff;font-size:13px;line-height:1;color:#fff;font-weight:700;
    box-shadow:0 0 0 1px rgba(0,0,0,.4);
  ">${contenu}</span>`;

const DEPART = pastille('#2563eb', 'A');
const ARRIVEE = pastille('#16a34a', 'B');
const CHAUFFEUR = pastille('#0f172a', '🚗');

export function CarteCourseDrive({ depart, arrivee, trace, chauffeur, hauteur = 260 }: Props) {
  const t = useTranslations('carteCourseDrive');
  const conteneur = useRef<HTMLDivElement>(null);
  const carte = useRef<CarteLeaflet | null>(null);
  const leaflet = useRef<typeof import('leaflet') | null>(null);
  const couche = useRef<LayerGroup | null>(null);
  const cadre = useRef('');
  const [prete, setPrete] = useState(false);

  useEffect(() => {
    let annule = false;
    (async () => {
      const L = await import('leaflet');
      if (annule || !conteneur.current || carte.current) return;
      leaflet.current = L;
      const instance = L.map(conteneur.current, {
        center: [depart.latitude, depart.longitude],
        zoom: 13,
        // Au milieu d'une page qui défile : la molette fait défiler, pas zoomer.
        scrollWheelZoom: false,
      });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(instance);
      couche.current = L.layerGroup().addTo(instance);
      carte.current = instance;
      setPrete(true);
    })();
    return () => {
      annule = true;
      carte.current?.remove();
      carte.current = null;
      couche.current = null;
      cadre.current = '';
    };
    // Une seule fois : les points se redessinent plus bas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = leaflet.current;
    if (!prete || !L || !carte.current || !couche.current) return;
    couche.current.clearLayers();

    const repere = (point: PointCarte, html: string, titre: string) =>
      L.marker([point.latitude, point.longitude], {
        icon: L.divIcon({ html, className: '', iconSize: [26, 26], iconAnchor: [13, 13] }),
        title: titre,
      })
        .bindTooltip(titre)
        .addTo(couche.current!);

    const ligne: [number, number][] =
      trace && trace.length >= 2
        ? trace
        : [
            [depart.latitude, depart.longitude],
            [arrivee.latitude, arrivee.longitude],
          ];
    L.polyline(ligne, {
      color: '#2563eb',
      weight: 4,
      opacity: 0.85,
      ...(trace && trace.length >= 2 ? {} : { dashArray: '6 8' }),
    }).addTo(couche.current);

    repere(depart, DEPART, t('depart'));
    repere(arrivee, ARRIVEE, t('destination'));
    if (chauffeur) repere(chauffeur, CHAUFFEUR, t('chauffeur'));

    // Recadrer quand le trajet change, pas à chaque position du chauffeur :
    // la carte ne doit pas échapper des mains de celui qui la déplace.
    const cle = `${depart.latitude},${depart.longitude};${arrivee.latitude},${arrivee.longitude};${!!chauffeur}`;
    if (cadre.current !== cle) {
      const points = [...ligne, ...(chauffeur ? [[chauffeur.latitude, chauffeur.longitude] as [number, number]] : [])];
      carte.current.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 16 });
      cadre.current = cle;
    }
  }, [prete, depart, arrivee, trace, chauffeur, t]);

  return (
    <div
      ref={conteneur}
      role="img"
      aria-label={t('libelle')}
      data-carte-course
      className="w-full overflow-hidden rounded-lg border border-slate-200"
      style={{ height: hauteur }}
    />
  );
}
