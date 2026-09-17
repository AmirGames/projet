// Un jour, plusieurs services — et la nuit qui déborde sur le lendemain.
//
// Un jour n'avait qu'une plage. Un restaurant qui sert à midi puis le soir
// devait déclarer 11 h 30 – 22 h 00 et se dire ouvert tout l'après-midi. Et une
// fermeture à 1 h du matin était refusée à la saisie, alors que c'est
// l'horaire normal d'un vendredi soir.

import { titre, check, j, uniq, post, put, get, terminer, sqlScalaire } from './outils.mjs';

const MDP = 'Password123!';

await j(await post('/api/auth/signup', { email: `p-${uniq}@t.fr`, password: MDP, name: `P ${uniq}` }));

const commercant = await j(
  await post('/api/auth/signup', { email: `m-${uniq}@t.fr`, password: MDP, name: `M ${uniq}` })
);
const T = commercant.accessToken;

const boutique = await j(
  await post(
    '/api/stores',
    {
      orgId: commercant.organization.id,
      name: `Trattoria ${uniq}`,
      slug: `trattoria-${uniq}`,
      phone: '0400000000',
    },
    T
  )
);
const storeId = boutique.store?.id || boutique.id;

const horairesDe = async (jour) => {
  const lu = await j(await get(`/api/store-hours/${storeId}`, T));
  return lu?.operatingHours?.[jour];
};

// ===== Deux services dans la même journée =====

titre('Le midi et le soir, dans la même journée');
const midiEtSoir = await put(
  `/api/store-hours/${storeId}/day/MON`,
  {
    closed: false,
    plages: [
      { open: '11:30', close: '14:00' },
      { open: '17:30', close: '22:00' },
    ],
  },
  T
);
check('les deux plages sont acceptées', midiEtSoir.status === 200, `statut ${midiEtSoir.status}`);

const lundi = await horairesDe('MON');
check('le jour en porte deux', lundi?.plages?.length === 2, JSON.stringify(lundi));
check('celle du midi', lundi?.plages?.[0]?.open === '11:30' && lundi?.plages?.[0]?.close === '14:00', JSON.stringify(lundi?.plages?.[0]));
check('et celle du soir', lundi?.plages?.[1]?.open === '17:30' && lundi?.plages?.[1]?.close === '22:00', JSON.stringify(lundi?.plages?.[1]));

// ===== La nuit =====

titre('Un vendredi qui ferme à une heure du matin');
// « L'heure d'ouverture doit précéder l'heure de fermeture » refusait
// l'horaire le plus courant du week-end.
const vendredi = await put(
  `/api/store-hours/${storeId}/day/FRI`,
  {
    closed: false,
    plages: [
      { open: '11:30', close: '14:00' },
      { open: '17:30', close: '01:00' },
    ],
  },
  T
);
check('la fermeture après minuit est acceptée', vendredi.status === 200, JSON.stringify(await j(vendredi))?.slice(0, 200));

const lu = await horairesDe('FRI');
check('elle est bien enregistrée', lu?.plages?.[1]?.close === '01:00', JSON.stringify(lu?.plages));

titre('Le samedi n’ouvre que le soir');
await put(
  `/api/store-hours/${storeId}/day/SAT`,
  { closed: false, plages: [{ open: '17:30', close: '01:00' }] },
  T
);
const samedi = await horairesDe('SAT');
check('une seule plage', samedi?.plages?.length === 1, JSON.stringify(samedi?.plages));

// ===== Ce que le client peut retirer =====

titre('Les créneaux de retrait suivent les services');
/**
 * C'est tout l'enjeu : proposer 15 h à un client alors que la cuisine est
 * fermée, c'est une commande que personne ne lui donnera.
 */
const creneaux = await j(await get(`/api/client/stores/${storeId}/pickup-slots?jours=7`));
const parJour = creneaux?.data || creneaux?.creneaux || creneaux;
const tous = (Array.isArray(parJour) ? parJour : []).flatMap((entree) =>
  (entree.creneaux || []).map((c) => ({ date: entree.date, libelle: c.libelle }))
);

check('des créneaux sont proposés', tous.length > 0, JSON.stringify(parJour)?.slice(0, 200));

// Aucun créneau ne doit tomber dans le trou de l'après-midi, tous jours
// confondus : 14 h 00 – 17 h 30 est fermé partout sauf le dimanche par défaut.
const lundiISO = (Array.isArray(parJour) ? parJour : []).find((entree) => {
  const d = new Date(`${entree.date}T12:00:00`);
  return d.getDay() === 1;
});

if (lundiISO) {
  const heures = lundiISO.creneaux.map((c) => c.libelle);
  const dansLeTrou = heures.filter((h) => h >= '14:00' && h < '17:30');
  check('rien entre les deux services du lundi', dansLeTrou.length === 0, dansLeTrou.join(','));
  check('mais bien le soir', heures.some((h) => h >= '17:30' && h < '22:00'), heures.slice(0, 10).join(','));
} else {
  check('un lundi figure dans la semaine proposée', false, 'aucun lundi');
  check('—', false, 'lundi absent');
}

const vendrediISO = (Array.isArray(parJour) ? parJour : []).find((entree) => {
  const d = new Date(`${entree.date}T12:00:00`);
  return d.getDay() === 5;
});

if (vendrediISO) {
  // Le service du vendredi soir déborde : des créneaux après minuit existent,
  // et ils appartiennent bien à la nuit du vendredi.
  const apresMinuit = vendrediISO.creneaux.filter((c) => {
    const heure = new Date(c.valeur);
    return heure.getHours() < 2 && heure.getDay() === 6;
  });
  check('la nuit du vendredi déborde sur samedi', apresMinuit.length > 0, `${vendrediISO.creneaux.length} créneaux`);
} else {
  check('un vendredi figure dans la semaine proposée', false, 'aucun vendredi');
}

// ===== Les saisies impossibles =====

titre('Deux services qui se chevauchent sont refusés');
// Sans ce contrôle, le même créneau serait proposé deux fois au client.
const chevauchement = await put(
  `/api/store-hours/${storeId}/day/TUE`,
  {
    closed: false,
    plages: [
      { open: '11:30', close: '15:00' },
      { open: '14:00', close: '22:00' },
    ],
  },
  T
);
check('le refus est net', chevauchement.status === 400, `statut ${chevauchement.status}`);
check(
  'et il nomme les deux plages',
  /chevauchent/i.test((await j(chevauchement))?.error || ''),
  (await j(chevauchement))?.error
);

titre('Une plage vide est refusée');
const vide = await put(
  `/api/store-hours/${storeId}/day/TUE`,
  { closed: false, plages: [{ open: '12:00', close: '12:00' }] },
  T
);
check('elle ne dure rien', vide.status === 400, `statut ${vide.status}`);

titre('Un jour ouvert sans aucune plage est refusé');
const aucune = await put(`/api/store-hours/${storeId}/day/TUE`, { closed: false, plages: [] }, T);
check('il faut au moins un service', aucune.status === 400, `statut ${aucune.status}`);

titre('Le jour d’avant n’a pas bougé');
const mardi = await horairesDe('TUE');
check('le mardi est resté intact', (mardi?.plages?.length || 0) >= 1, JSON.stringify(mardi));

// ===== Fermer, puis rouvrir =====

titre('Fermer un jour garde ses horaires');
// Fermer le dimanche puis le rouvrir ne doit pas obliger à tout ressaisir.
await put(
  `/api/store-hours/${storeId}/day/SUN`,
  { closed: false, plages: [{ open: '17:30', close: '22:00' }] },
  T
);
await put(`/api/store-hours/${storeId}/day/SUN`, { closed: true, plages: [{ open: '17:30', close: '22:00' }] }, T);

const dimancheFerme = await horairesDe('SUN');
check('le dimanche est fermé', dimancheFerme?.closed === true, `${dimancheFerme?.closed}`);
check('mais ses horaires sont conservés', dimancheFerme?.plages?.[0]?.open === '17:30', JSON.stringify(dimancheFerme?.plages));

const creneauxSansDimanche = await j(await get(`/api/client/stores/${storeId}/pickup-slots?jours=7`));
const listeSansDimanche = creneauxSansDimanche?.data || creneauxSansDimanche?.creneaux || creneauxSansDimanche;
const unDimanche = (Array.isArray(listeSansDimanche) ? listeSansDimanche : []).find((entree) => {
  const d = new Date(`${entree.date}T12:00:00`);
  return d.getDay() === 0;
});
check('et plus aucun retrait le dimanche', !unDimanche, JSON.stringify(unDimanche)?.slice(0, 120));

// ===== L'ancien format reste lisible =====

titre('Une boutique enregistrée à l’ancienne reste lisible');
/**
 * Les boutiques existantes portent `{ open, close, closed }` : une lecture
 * tolérante évite un script de migration et un temps d'arrêt.
 */
await sqlScalaire(
  `UPDATE "Store" SET "operatingHours" = '{"WED":{"open":"08:00","close":"19:00","closed":false}}'::jsonb WHERE id = '${storeId}'`
);

const mercredi = await horairesDe('WED');
check('l’ancien couple devient une plage', mercredi?.plages?.length === 1, JSON.stringify(mercredi));
check('avec la bonne ouverture', mercredi?.plages?.[0]?.open === '08:00', JSON.stringify(mercredi?.plages?.[0]));
check('et la bonne fermeture', mercredi?.plages?.[0]?.close === '19:00', JSON.stringify(mercredi?.plages?.[0]));

titre('Et la modifier l’écrit au nouveau format');
await put(
  `/api/store-hours/${storeId}/day/WED`,
  {
    closed: false,
    plages: [
      { open: '08:00', close: '13:00' },
      { open: '15:00', close: '19:00' },
    ],
  },
  T
);

const enBase = await sqlScalaire(
  `SELECT ("operatingHours"->'WED'->'plages')::text FROM "Store" WHERE id = '${storeId}'`
);
check('les deux plages sont en base', enBase.includes('15:00'), enBase?.slice(0, 200));

await terminer();
