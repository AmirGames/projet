'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface TypeDeCommerce {
  code: string;
  libelle: string;
}

/**
 * Les genres de commerce et de cuisine, tels que le serveur les connaît.
 *
 * Chaque formulaire d'inscription avait sa liste recopiée — « RESTAURANT »,
 * « FastFood »… — que ni l'API ni la recherche ne comprenaient. La liste vient
 * désormais du serveur, comme sur la création de boutique.
 */
export function useTypesDeCommerce() {
  const [etablissements, setEtablissements] = useState<TypeDeCommerce[]>([]);
  const [cuisines, setCuisines] = useState<TypeDeCommerce[]>([]);

  useEffect(() => {
    let annule = false;

    fetch(`${API_URL}/api/stores/types`)
      .then((r) => r.json())
      .then((lu) => {
        if (annule) return;
        setEtablissements(lu?.data?.etablissements || []);
        setCuisines(lu?.data?.cuisines || []);
      })
      .catch(() => undefined);

    return () => {
      annule = true;
    };
  }, []);

  return { etablissements, cuisines };
}
