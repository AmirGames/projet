'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MapPin } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface AdresseChoisie {
  label: string;
  street: string;
  city: string;
  postalCode: string;
  /** Vide avec la Base Adresse Nationale, qui ne couvre que la France. */
  country: string;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Où se trouve, vraisemblablement, la personne qui tape.
 *
 * Sans cet indice, le serveur rend d'abord les adresses françaises : un client
 * belge devait taper le nom de sa ville pour voir enfin la sienne.
 */
interface Indice {
  pays?: string;
  latitude?: number;
  longitude?: number;
}

/** Fuseaux horaires propres à un pays : l'indice le plus fiable, et gratuit. */
const PAYS_PAR_FUSEAU: Record<string, string> = {
  'Europe/Brussels': 'be',
  'Europe/Paris': 'fr',
  'Europe/Luxembourg': 'lu',
  'Europe/Zurich': 'ch',
  'Europe/Monaco': 'mc',
};

/**
 * Le pays, deviné sans rien demander.
 *
 * Le fuseau horaire d'abord : bien des Belges ont un navigateur réglé en
 * « fr-FR », mais leur système est à l'heure de Bruxelles. La langue ensuite
 * (« fr-BE », « nl-BE »), faute de mieux.
 */
function devinerPays(): string | undefined {
  try {
    const fuseau = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (fuseau && PAYS_PAR_FUSEAU[fuseau]) return PAYS_PAR_FUSEAU[fuseau];
  } catch {
    // Intl absent : on passe à la langue.
  }

  const langues = typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [];
  for (const langue of langues) {
    const region = (langue || '').split('-')[1];
    if (region && /^[a-z]{2}$/i.test(region)) return region.toLowerCase();
  }

  return undefined;
}

/**
 * La position, seulement si la personne l'a déjà autorisée pour ce site.
 *
 * On ne déclenche jamais la demande d'autorisation pour un simple champ
 * d'adresse : le pays suffit à mettre les bonnes adresses en tête.
 */
async function positionDejaAutorisee(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.permissions) {
      return null;
    }

    const statut = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    if (statut.state !== 'granted') return null;

    return await new Promise((resoudre) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resoudre({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
        () => resoudre(null),
        { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 3000 }
      );
    });
  } catch {
    return null;
  }
}

/** Calculé une fois par page : le pays et la position ne bougent pas en tapant. */
let indicePromis: Promise<Indice> | null = null;

function obtenirIndice(): Promise<Indice> {
  if (!indicePromis) {
    indicePromis = positionDejaAutorisee().then((position) => ({
      pays: devinerPays(),
      ...(position || {}),
    }));
  }

  return indicePromis;
}

function parametresIndice(indice: Indice): string {
  const parametres = new URLSearchParams();
  if (indice.pays) parametres.set('country', indice.pays);
  if (typeof indice.latitude === 'number' && typeof indice.longitude === 'number') {
    // Deux décimales suffisent à orienter la recherche.
    parametres.set('lat', indice.latitude.toFixed(2));
    parametres.set('lon', indice.longitude.toFixed(2));
  }

  const texte = parametres.toString();
  return texte ? `&${texte}` : '';
}

interface Props {
  value: string;
  onChange: (valeur: string) => void;
  /** Appelé quand une suggestion est retenue : ville et code postal suivent. */
  onSelect?: (adresse: AdresseChoisie) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  id?: string;
}

/**
 * Champ d'adresse avec suggestions.
 *
 * Le service d'adresses est un confort : s'il est injoignable, le champ reste
 * une saisie libre ordinaire, sans message d'erreur ni blocage.
 */
export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  className = '',
  required,
  id,
}: Props) {
  const t = useTranslations('addressAutocomplete');
  const [suggestions, setSuggestions] = useState<AdresseChoisie[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [chargement, setChargement] = useState(false);
  const [indiceActif, setIndiceActif] = useState(-1);
  const [serviceIndisponible, setServiceIndisponible] = useState(false);

  // Utiliser la traduction si pas de placeholder fourni
  const placeholderValue = placeholder ?? t('placeholder');

  const conteneur = useRef<HTMLDivElement>(null);
  // Une sélection ne doit pas relancer une recherche sur le texte qu'elle vient
  // d'écrire dans le champ.
  const ignorerProchaineRecherche = useRef(false);
  const indice = useRef<Indice>({});

  useEffect(() => {
    let actif = true;
    obtenirIndice().then((trouve) => {
      if (actif) indice.current = trouve;
    });
    return () => {
      actif = false;
    };
  }, []);

  const rechercher = useCallback(async (requete: string) => {
    if (requete.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    setChargement(true);

    try {
      const reponse = await fetch(
        `${API_URL}/api/addresses/search?q=${encodeURIComponent(requete)}${parametresIndice(indice.current)}`
      );

      if (!reponse.ok) {
        setSuggestions([]);
        return;
      }

      const donnees = await reponse.json();
      setSuggestions(donnees.suggestions || []);
      setServiceIndisponible(donnees.available === false);
    } catch {
      setSuggestions([]);
      setServiceIndisponible(true);
    } finally {
      setChargement(false);
    }
  }, []);

  // Temporisation : on n'interroge pas le service à chaque frappe.
  useEffect(() => {
    if (ignorerProchaineRecherche.current) {
      ignorerProchaineRecherche.current = false;
      return;
    }

    const minuteur = setTimeout(() => rechercher(value), 300);
    return () => clearTimeout(minuteur);
  }, [value, rechercher]);

  // Refermer la liste au clic à l'extérieur.
  useEffect(() => {
    const auClic = (e: MouseEvent) => {
      if (conteneur.current && !conteneur.current.contains(e.target as Node)) {
        setOuvert(false);
      }
    };

    document.addEventListener('mousedown', auClic);
    return () => document.removeEventListener('mousedown', auClic);
  }, []);

  const choisir = (adresse: AdresseChoisie) => {
    ignorerProchaineRecherche.current = true;
    onChange(adresse.street || adresse.label);
    onSelect?.(adresse);
    setSuggestions([]);
    setOuvert(false);
    setIndiceActif(-1);
  };

  const auClavier = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!ouvert || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceActif((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceActif((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && indiceActif >= 0) {
      e.preventDefault();
      choisir(suggestions[indiceActif]);
    } else if (e.key === 'Escape') {
      setOuvert(false);
    }
  };

  return (
    <div ref={conteneur} className="relative">
      <input
        id={id}
        type="text"
        value={value}
        required={required}
        placeholder={placeholderValue}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOuvert(true);
          setIndiceActif(-1);
        }}
        onFocus={() => setOuvert(true)}
        onKeyDown={auClavier}
        className={className}
      />

      {chargement && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
          …
        </span>
      )}

      {ouvert && suggestions.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-64 overflow-y-auto">
          {suggestions.map((adresse, index) => (
            <li key={`${adresse.label}-${index}`}>
              <button
                type="button"
                onMouseEnter={() => setIndiceActif(index)}
                onClick={() => choisir(adresse)}
                className={`w-full text-left px-3 py-2 flex items-start gap-2 transition-colors ${
                  index === indiceActif ? 'bg-gray-700' : 'hover:bg-gray-700'
                }`}
              >
                <MapPin size={14} className="text-orange-500 mt-1 flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm text-white truncate">{adresse.street}</span>
                  <span className="block text-xs text-gray-400 truncate">
                    {[
                      [adresse.postalCode, adresse.city].filter(Boolean).join(' '),
                      // Sans le pays, deux villes homonymes sont
                      // indiscernables dès qu'on sort de France.
                      adresse.country,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {serviceIndisponible && value.trim().length >= 3 && (
        <p className="text-xs text-gray-500 mt-1">
          {t('suggestionsUnavailable')}
        </p>
      )}
    </div>
  );
}
