'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { WifiOff, MapPinOff, SatelliteDish } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type EtatGps = 'ok' | 'refuse' | 'faible';

function suivreReseau(avertir: () => void) {
  window.addEventListener('online', avertir);
  window.addEventListener('offline', avertir);
  return () => {
    window.removeEventListener('online', avertir);
    window.removeEventListener('offline', avertir);
  };
}

/**
 * L'état de la connexion et du GPS côté livreur.
 *
 * Un téléphone qui perd le réseau ou le signal GPS n'envoie plus rien, et
 * rien ne le disait au livreur : il croyait être suivi, le client voyait une
 * pastille figée. Ce hook suit les deux, et rappelle `surRetour` dès que le
 * réseau revient pour renvoyer la position sans attendre le prochain envoi.
 */
export function useSignalGps(surRetour?: () => void) {
  const enLigne = useSyncExternalStore(suivreReseau, () => navigator.onLine, () => true);
  const [gps, setGps] = useState<EtatGps>('ok');

  useEffect(() => {
    if (!surRetour) return;
    const allume = () => surRetour();
    window.addEventListener('online', allume);
    return () => window.removeEventListener('online', allume);
  }, [surRetour]);

  const positionRecue = useCallback(() => setGps('ok'), []);

  const erreurPosition = useCallback((erreur: GeolocationPositionError) => {
    // 1 : refus de l'autorisation ; 2 et 3 : pas de fix ou délai dépassé.
    setGps(erreur.code === 1 ? 'refuse' : 'faible');
  }, []);

  return { enLigne, gps, positionRecue, erreurPosition };
}

interface Props {
  enLigne: boolean;
  gps: EtatGps;
  /** Le serveur n'a plus reçu de position depuis un moment. */
  perduCoteServeur?: boolean;
}

/** Le bandeau qui dit au livreur pourquoi il n'est plus suivi, et quoi faire. */
export function AlerteSignal({ enLigne, gps, perduCoteServeur }: Props) {
  const t = useTranslations('alerteSignal');
  if (!enLigne) {
    return (
      <div role="alert" className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm flex gap-3">
        <WifiOff size={20} className="flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">{t('horsConnexion')}</p>
          <p className="text-red-800/80">
            {t('horsConnexionAide')}
          </p>
        </div>
      </div>
    );
  }

  if (gps === 'refuse') {
    return (
      <div role="alert" className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm flex gap-3">
        <MapPinOff size={20} className="flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">{t('refusee')}</p>
          <p className="text-red-800/80">
            {t('refuseeAide')}
          </p>
        </div>
      </div>
    );
  }

  if (gps === 'faible' || perduCoteServeur) {
    return (
      <div role="alert" className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-sm flex gap-3">
        <SatelliteDish size={20} className="flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">{t('faible')}</p>
          <p className="text-amber-800/80">
            {t('faibleAide')}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
