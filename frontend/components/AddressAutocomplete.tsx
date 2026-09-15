'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface AdresseChoisie {
  label: string;
  street: string;
  city: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
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
  placeholder = 'Commencez à saisir une adresse...',
  className = '',
  required,
  id,
}: Props) {
  const [suggestions, setSuggestions] = useState<AdresseChoisie[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [chargement, setChargement] = useState(false);
  const [indiceActif, setIndiceActif] = useState(-1);
  const [serviceIndisponible, setServiceIndisponible] = useState(false);

  const conteneur = useRef<HTMLDivElement>(null);
  // Une sélection ne doit pas relancer une recherche sur le texte qu'elle vient
  // d'écrire dans le champ.
  const ignorerProchaineRecherche = useRef(false);

  const rechercher = useCallback(async (requete: string) => {
    if (requete.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    setChargement(true);

    try {
      const reponse = await fetch(
        `${API_URL}/api/addresses/search?q=${encodeURIComponent(requete)}`
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
        placeholder={placeholder}
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
                    {[adresse.postalCode, adresse.city].filter(Boolean).join(' ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {serviceIndisponible && value.trim().length >= 3 && (
        <p className="text-xs text-gray-500 mt-1">
          Suggestions indisponibles — saisissez l&apos;adresse manuellement.
        </p>
      )}
    </div>
  );
}
