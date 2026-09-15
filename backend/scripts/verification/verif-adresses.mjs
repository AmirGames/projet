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

await faux.fermer();
await terminer();
