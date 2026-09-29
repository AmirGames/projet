import { useCallback, useEffect, useState } from 'react';

/** Charge une ressource de l'API, avec état de chargement, erreur et rechargement. */
export function useChargement<T>(charger: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(true);

  const recharger = useCallback(async () => {
    setEnCours(true);
    setErreur(null);
    try {
      setData(await charger());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setEnCours(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    recharger();
  }, [recharger]);

  return { data, erreur, enCours, recharger };
}
