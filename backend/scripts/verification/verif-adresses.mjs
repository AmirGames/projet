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
const apiPhoton = await demarrerApi(4611, {
  ADDRESS_PROVIDER: 'photon',
  PHOTON_API_URL: faux.urlPhoton,
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

apiMixte.kill();
apiMoitie.kill();

await faux.fermer();
await terminer();
