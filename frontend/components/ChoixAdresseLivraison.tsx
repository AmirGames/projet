'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, MapPin, Navigation } from 'lucide-react';

import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import {
  enregistrerAdresseLivraison,
  type AdresseLivraison,
} from '@/lib/adresseLivraison';

interface Props {
  /** `undefined` tant que le navigateur n'a pas été lu, `null` sans adresse. */
  adresse: AdresseLivraison | null | undefined;
  onChange: (adresse: AdresseLivraison) => void;
  /**
   * Sans adresse : le champ s'affiche d'emblée (accueil), ou un simple
   * bouton invite à la saisir (vitrine d'un commerce).
   */
  saisieOuverteSansAdresse?: boolean;
}

/**
 * L'adresse de livraison, à la manière des grandes plateformes : un champ
 * avec suggestions tant qu'elle n'est pas choisie, puis une pastille
 * « Livrer à … » qu'on touche pour la changer.
 *
 * Le choix est enregistré dans le navigateur : il vaut pour l'accueil, les
 * vitrines et le tunnel de commande.
 */
export function ChoixAdresseLivraison({ adresse, onChange, saisieOuverteSansAdresse = false }: Props) {
  const t = useTranslations('deliveryAddress');
  const [edition, setEdition] = useState(false);
  const [saisie, setSaisie] = useState('');

  if (adresse === undefined) return null;

  const retenir = (choisie: AdresseLivraison) => {
    enregistrerAdresseLivraison(choisie);
    setSaisie('');
    setEdition(false);
    onChange(choisie);
  };

  const parGPS = () => {
    if (!navigator.geolocation) {
      alert(t('geolocationNotSupported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        retenir({
          label: t('currentPosition'),
          street: '',
          city: '',
          postalCode: '',
          latitude: coords.latitude,
          longitude: coords.longitude,
        }),
      () => alert(t('cantAccessLocation'))
    );
  };

  const saisieVisible = edition || (adresse === null && saisieOuverteSansAdresse);

  if (saisieVisible) {
    return (
      <div className="flex-1 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <MapPin className="absolute left-4 top-3 z-10 text-gray-400 pointer-events-none" size={20} />
          <AddressAutocomplete
            value={saisie}
            onChange={setSaisie}
            onSelect={(choisie) =>
              retenir({
                label: [choisie.street, choisie.city].filter(Boolean).join(', ') || choisie.label,
                street: choisie.street,
                city: choisie.city,
                postalCode: choisie.postalCode,
                latitude: choisie.latitude,
                longitude: choisie.longitude,
              })
            }
            placeholder={t('placeholder')}
            className="w-full pl-12 pr-4 py-3 rounded-lg text-gray-900 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={parGPS}
          className="bg-white text-red-600 font-semibold py-3 px-6 rounded-lg hover:bg-orange-50 flex items-center justify-center gap-2"
        >
          <Navigation size={18} />
          {t('myLocation')}
        </button>
        {(adresse || !saisieOuverteSansAdresse) && (
          <button
            type="button"
            onClick={() => {
              setSaisie('');
              setEdition(false);
            }}
            className="py-3 px-4 rounded-lg text-white/90 hover:bg-white/10"
          >
            {t('cancel')}
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEdition(true)}
      title={t('change')}
      className="flex items-center gap-2 bg-white text-gray-900 py-3 px-4 rounded-full hover:bg-orange-50 max-w-full"
    >
      <MapPin size={18} className="text-red-600 flex-shrink-0" />
      {adresse ? (
        <>
          <span className="text-gray-500 flex-shrink-0">{t('deliverTo')}</span>
          <span className="font-semibold truncate">{adresse.label}</span>
        </>
      ) : (
        <span className="font-semibold">{t('enterAddress')}</span>
      )}
      <ChevronDown size={18} className="flex-shrink-0" />
    </button>
  );
}
