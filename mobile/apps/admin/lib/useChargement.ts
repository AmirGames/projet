import { useCallback, useState } from 'react';
import { useEffectChargement } from './useEffectChargement';
import { useDerniereValeur } from './useDerniereValeur';

/** Charge une ressource de l'API, avec état de chargement, erreur et rechargement. */
export function useChargement<T>(charger: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(true);

  // La dernière fonction de chargement ; `deps` dit quand relire.
  const chargerRef = useDerniereValeur(charger);

  const recharger = useCallback(async () => {
    setEnCours(true);
    setErreur(null);
    try {
      setData(await chargerRef.current());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setEnCours(false);
    }
  }, [chargerRef]);

  useEffectChargement(() => {
    recharger();
    // `deps` est celui de l'appelant : vérifié chez lui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recharger, ...deps]);

  return { data, erreur, enCours, recharger };
}
