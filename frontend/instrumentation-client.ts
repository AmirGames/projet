import { installerSurveillanceNavigateur } from './lib/surveillance-navigateur';

// Avant que la page ne devienne interactive : une erreur au démarrage doit
// remonter elle aussi.
try {
  installerSurveillanceNavigateur();
} catch {
  // La surveillance ne doit jamais empêcher le site de s'afficher.
}
