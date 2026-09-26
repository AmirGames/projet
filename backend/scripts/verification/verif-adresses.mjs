// Recherche d'adresses : les deux fournisseurs, le filtre par pays et le
// repli quand le service tombe.

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { titre, check, terminer } from './outils.mjs';
import { ouvrirFauxServiceAdresses } from './faux-service-adresses.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const faux = await ouvrirFauxServiceAdresses(4599);

/**
 * Lance une API avec la configuration d'adresses voulue.
 *
 * Le fournisseur se lit au démarrage : le tester sans relancer le serveur
 * reviendrait à ne vérifier qu'un seul des deux.
 */
async function demarrerApi(port, env) {
  const enfant = spawn(
    process.execPath,
    [join(RACINE, 'node_modules', '.bin', 'tsx'), join(RACINE, 'src', 'server.ts')],
    {
      cwd: RACINE,
      env: { ...process.env, PORT: String(port), ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  // Sans consommer la sortie, le tampon se remplit et le processus se bloque.
  enfant.stdout.on('data', () => undefined);
  enfant.stderr.on('data', () => undefined);

  const limite = Date.now() + 40000;

  while (Date.now() < limite) {
    try {
      const reponse = await fetch(`http://127.0.0.1:${port}/health`);
      if (reponse.ok) return enfant;
    } catch {
      // Pas encore prête.
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  enfant.kill();
  throw new Error(`API de test injoignable sur le port ${port}`);
}

const chercher = async (port, requete) => {
  const reponse = await fetch(
    `http://127.0.0.1:${port}/api/addresses/search?q=${encodeURIComponent(requete)}`
  );
  return reponse.json();
};

// ===== Base Adresse Nationale =====

titre('Base Adresse Nationale (France)');
const apiBan = await demarrerApi(4610, {
  ADDRESS_PROVIDER: 'ban',
  ADDRESS_API_URL: faux.urlBan,
});

const ban = await chercher(4610, 'rue de la republique');
check('le fournisseur est annoncé', ban.provider === 'ban', ban.provider);
check('une suggestion revient', ban.suggestions?.length === 1, `n=${ban.suggestions?.length}`);

const adresseBan = ban.suggestions?.[0];
check('la voie est extraite', adresseBan?.street === '20 Rue de la République', adresseBan?.street);
check('la ville est extraite', adresseBan?.city === 'Lyon', adresseBan?.city);
check('le code postal est extrait', adresseBan?.postalCode === '69002', adresseBan?.postalCode);
check('le pays est la France', adresseBan?.country === 'France', adresseBan?.country);
check('la latitude est un nombre', adresseBan?.latitude === 45.764, `${adresseBan?.latitude}`);
check('la longitude est un nombre', adresseBan?.longitude === 4.8357, `${adresseBan?.longitude}`);

titre('Saisie trop courte');
const courte = await chercher(4610, 'ru');
check('rien n\'est demandé au fournisseur', courte.suggestions?.length === 0, `n=${courte.suggestions?.length}`);
check('le service reste annoncé disponible', courte.available === true, `${courte.available}`);

titre('Mise en cache');
faux.vider();
await chercher(4610, 'rue de la republique');
check('une saisie déjà vue ne rappelle pas le fournisseur', faux.appels.length === 0, `n=${faux.appels.length}`);

titre('Panne du fournisseur');
faux.tomberEnPanne();
const panne = await chercher(4610, 'une adresse jamais demandee');
check('la réponse reste un 200', Array.isArray(panne.suggestions), JSON.stringify(panne)?.slice(0, 120));
check('aucune suggestion', panne.suggestions?.length === 0, `n=${panne.suggestions?.length}`);
check('la saisie manuelle est annoncée', panne.available === false, `${panne.available}`);
faux.tomberEnPanne(false);

apiBan.kill();

// ===== Photon, couverture mondiale =====

titre('Photon (monde entier)');
// Sans filtre explicite, l'API lirait celui du .env — fr,be dans
// .env.example — et la Suisse disparaîtrait d'une recherche « monde entier ».
const apiPhoton = await demarrerApi(4611, {
  ADDRESS_PROVIDER: 'photon',
  PHOTON_API_URL: faux.urlPhoton,
  ADDRESS_COUNTRIES: '',
});

const monde = await chercher(4611, 'rue neuve bruxelles');
check('le fournisseur est annoncé', monde.provider === 'photon', monde.provider);
check('les trois pays reviennent', monde.suggestions?.length === 3, `n=${monde.suggestions?.length}`);

const belge = monde.suggestions?.find((s) => s.city === 'Bruxelles');
check('une adresse belge est proposée', !!belge, JSON.stringify(monde.suggestions?.map((s) => s.city)));
check(
  'le numéro et la voie sont réunis',
  belge?.street === '12 Rue Neuve',
  belge?.street
);
check('le pays est renseigné', belge?.country === 'Belgique', belge?.country);
check('le libellé est reconstitué', /12 Rue Neuve.*1000.*Bruxelles.*Belgique/.test(belge?.label || ''), belge?.label);
check('les coordonnées suivent', belge?.latitude === 50.8503, `${belge?.latitude}`);

const suisse = monde.suggestions?.find((s) => s.country === 'Suisse');
check('une adresse suisse est proposée', !!suisse, JSON.stringify(monde.suggestions?.map((s) => s.country)));

apiPhoton.kill();

// ===== Limitation à quelques pays =====

titre('Limitation à la France et la Belgique');
const apiLimite = await demarrerApi(4612, {
  ADDRESS_PROVIDER: 'photon',
  PHOTON_API_URL: faux.urlPhoton,
  ADDRESS_COUNTRIES: 'fr,be',
});

const limite = await chercher(4612, 'rue neuve');
const pays = (limite.suggestions || []).map((s) => s.country);

check('la Belgique passe', pays.includes('Belgique'), JSON.stringify(pays));
check('la France passe', pays.includes('France'), JSON.stringify(pays));
check('la Suisse est écartée', !pays.includes('Suisse'), JSON.stringify(pays));

apiLimite.kill();

// ===== La France et la Belgique ensemble =====

titre('Mode mixte : la BAN pour la France, Photon pour le reste');
/**
 * La BAN s'arrête aux frontières : un commerce belge n'était pas trouvable.
 * Basculer tout sur Photon aurait fait perdre la précision française — d'où
 * l'interrogation des deux, la BAN d'abord.
 */
const apiMixte = await demarrerApi(4613, {
  ADDRESS_PROVIDER: 'ban+photon',
  ADDRESS_API_URL: faux.urlBan,
  PHOTON_API_URL: faux.urlPhoton,
  ADDRESS_COUNTRIES: 'fr,be',
});

const mixte = await chercher(4613, 'rue neuve');
const villes = (mixte.suggestions || []).map((s) => s.city);

check('le service répond', mixte.available === true, `${mixte.available}`);
check('l’adresse française de la BAN est là', villes.includes('Lyon'), JSON.stringify(villes));
check('l’adresse belge de Photon aussi', villes.includes('Bruxelles'), JSON.stringify(villes));
check('la Suisse reste écartée', !villes.includes('Zurich'), JSON.stringify(villes));

// La BAN est la plus fine sur la France : ses résultats passent devant.
check('la BAN passe en premier', villes[0] === 'Lyon', JSON.stringify(villes));

const belgeMixte = (mixte.suggestions || []).find((s) => s.city === 'Bruxelles');
check('la belge porte son pays', belgeMixte?.country === 'Belgique', belgeMixte?.country);
check('et ses coordonnées', belgeMixte?.latitude === 50.8503, `${belgeMixte?.latitude}`);

titre('Un seul fournisseur en panne ne vide pas la recherche');
// Sans cela, la panne de l'un ferait basculer toute la saisie en manuel alors
// que l'autre a des résultats.
const apiMoitie = await demarrerApi(4614, {
  ADDRESS_PROVIDER: 'ban+photon',
  ADDRESS_API_URL: 'http://127.0.0.1:4599/inexistant-ban',
  PHOTON_API_URL: faux.urlPhoton,
  ADDRESS_COUNTRIES: 'fr,be',
});

const moitie = await chercher(4614, 'rue neuve');
check('le service reste annoncé disponible', moitie.available === true, `${moitie.available}`);
check(
  'les adresses de l’autre fournisseur reviennent',
  (moitie.suggestions || []).some((s) => s.city === 'Bruxelles'),
  JSON.stringify((moitie.suggestions || []).map((s) => s.city))
);

// ===== Google Places (New) =====

titre('Google Places rend des adresses complètes');
/**
 * La clé ne quitte jamais le serveur : la requête part de l'API, pas du
 * navigateur. Le faux service refuse d'ailleurs une requête sans clé, faute de
 * quoi on ne saurait pas si elle est bien transmise.
 */
const apiGoogle = await demarrerApi(4615, {
  ADDRESS_PROVIDER: 'google',
  GOOGLE_PLACES_API_URL: faux.urlGoogle,
  GOOGLE_MAPS_API_KEY: 'cle-de-test',
  ADDRESS_COUNTRIES: '',
});

faux.vider();
const google = await chercher(4615, '20 rue de la republique');

check('le fournisseur est annoncé', google.provider === 'google', google.provider);
check('des suggestions reviennent', (google.suggestions || []).length >= 1, `n=${google.suggestions?.length}`);

const lyon = (google.suggestions || []).find((s) => s.city === 'Lyon');
check('la voie est reconstituée', lyon?.street === '20 Rue de la République', lyon?.street);
check('le code postal est extrait', lyon?.postalCode === '69002', lyon?.postalCode);
check('le pays aussi', lyon?.country === 'France', lyon?.country);
// C'est ce qui évite un second appel « Place Details » par adresse retenue.
check('les coordonnées sont là', lyon?.latitude === 45.764, `${lyon?.latitude}`);

titre('La clé part bien, et seulement au serveur');
check('le faux service l’a reçue', faux.clesRecues.includes('cle-de-test'), JSON.stringify(faux.clesRecues));

titre('Le filtre par pays s’applique aussi');
const apiGoogleFr = await demarrerApi(4616, {
  ADDRESS_PROVIDER: 'google',
  GOOGLE_PLACES_API_URL: faux.urlGoogle,
  GOOGLE_MAPS_API_KEY: 'cle-de-test',
  ADDRESS_COUNTRIES: 'fr,be',
});

const filtrees = await chercher(4616, 'rue');
const paysRendus = (filtrees.suggestions || []).map((s) => s.country);
check('la Suisse est écartée', !paysRendus.includes('Suisse'), JSON.stringify(paysRendus));
check('la France reste', paysRendus.includes('France'), JSON.stringify(paysRendus));
check('la Belgique aussi', paysRendus.includes('Belgique'), JSON.stringify(paysRendus));

titre('Sans clé, le fournisseur le dit');
// Une liste vide se lirait « aucune adresse ne correspond » : c'est faux, et
// le commerçant chercherait l'erreur dans sa saisie.
const apiSansCle = await demarrerApi(4617, {
  ADDRESS_PROVIDER: 'google',
  GOOGLE_PLACES_API_URL: faux.urlGoogle,
  GOOGLE_MAPS_API_KEY: '',
});

const sansCle = await chercher(4617, 'rue de la republique');
check('le service se déclare indisponible', sansCle.available === false, `${sansCle.available}`);
check('et ne rend rien', (sansCle.suggestions || []).length === 0, `n=${sansCle.suggestions?.length}`);

titre('Une clé refusée ne ferme pas la saisie');
// Clé révoquée, quota dépassé, API non activée : la saisie manuelle prend le
// relais plutôt que de bloquer une commande.
faux.tomberEnPanne();
const enPanne = await chercher(4615, 'rue de la republique');
check('la recherche ne lève pas', !!enPanne, 'aucune réponse');
check('le repli manuel est annoncé', enPanne.available === false, `${enPanne.available}`);
faux.tomberEnPanne(false);

apiGoogle.kill();
apiGoogleFr.kill();
apiSansCle.kill();

apiMixte.kill();
apiMoitie.kill();

await faux.fermer();
await terminer();
