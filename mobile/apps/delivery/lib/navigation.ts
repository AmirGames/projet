import { distanceM } from './deliveries';

/**
 * Le guidage virage par virage de la carte intégrée. Les étapes viennent du
 * même service que l'itinéraire (OSRM, `steps=true`) ; chacune commence par
 * une manœuvre, à un point précis, et court jusqu'à la suivante.
 */
export interface NavStep {
  /** depart, turn, continue, new name, roundabout, fork, merge, arrive… */
  type: string;
  /** right, slight left, straight, uturn… */
  modifier?: string;
  /** Le nom de la rue empruntée après la manœuvre (souvent vide). */
  name?: string;
  /** Au rond-point : le numéro de la sortie. */
  exit?: number;
  /** Longueur de l'étape, en mètres, de cette manœuvre à la suivante. */
  distance: number;
  /** Le point de la manœuvre. */
  lat: number;
  lng: number;
}

/** En deçà, la manœuvre est faite : le guidage passe à la suivante. */
export const MANEUVER_DONE_M = 25;

const DIRECTION: Record<string, string> = {
  uturn: 'Faites demi-tour',
  'sharp right': 'Tournez franchement à droite',
  right: 'Tournez à droite',
  'slight right': 'Serrez à droite',
  straight: 'Continuez tout droit',
  'slight left': 'Serrez à gauche',
  left: 'Tournez à gauche',
  'sharp left': 'Tournez franchement à gauche',
};

const ordinal = (n: number) => (n === 1 ? '1re' : `${n}e`);

/** « Tournez à droite sur Rue de Fer », « Au rond-point, prenez la 2e sortie ». */
export function instruction(step: NavStep): string {
  const on = step.name ? ` sur ${step.name}` : '';
  const toward = step.name ? ` vers ${step.name}` : '';
  const side = step.modifier?.includes('left') ? 'à gauche' : step.modifier?.includes('right') ? 'à droite' : '';
  switch (step.type) {
    case 'depart':
      return `Partez${on}`;
    case 'arrive':
      return 'Vous êtes arrivé à destination';
    case 'roundabout':
    case 'rotary':
      return step.exit ? `Au rond-point, prenez la ${ordinal(step.exit)} sortie${toward}` : `Prenez le rond-point${toward}`;
    case 'roundabout turn':
      return `Au rond-point, ${(DIRECTION[step.modifier || ''] || 'continuez').toLowerCase()}${on}`;
    case 'exit roundabout':
    case 'exit rotary':
      return `Sortez du rond-point${toward}`;
    case 'fork':
      return `À la bifurcation, prenez ${side || 'tout droit'}${toward}`;
    case 'merge':
      return `Insérez-vous ${side}${on}`.replace('  ', ' ');
    case 'on ramp':
      return `Prenez la bretelle ${side}${toward}`.replace('  ', ' ');
    case 'off ramp':
      return `Prenez la sortie ${side}${toward}`.replace('  ', ' ');
    case 'end of road':
      return `Au bout de la route, ${(DIRECTION[step.modifier || ''] || 'continuez').toLowerCase()}${on}`;
    default:
      // turn, continue, new name, notification…
      if (step.modifier && step.modifier !== 'straight') return `${DIRECTION[step.modifier] || 'Continuez'}${on}`;
      return `Continuez tout droit${on}`;
  }
}

/** La flèche de la manœuvre. */
export function maneuverIcon(step: NavStep): string {
  if (step.type === 'arrive') return '🏁';
  if (step.type === 'roundabout' || step.type === 'rotary' || step.type === 'roundabout turn') return '⟳';
  switch (step.modifier) {
    case 'uturn':
      return '⤺';
    case 'sharp right':
      return '↘';
    case 'right':
      return '→';
    case 'slight right':
      return '↗';
    case 'sharp left':
      return '↙';
    case 'left':
      return '←';
    case 'slight left':
      return '↖';
    default:
      return '↑';
  }
}

/**
 * L'index de la prochaine manœuvre, en partant de `from` (la première
 * étape, « depart », est l'endroit où l'itinéraire a été calculé) : une
 * manœuvre approchée à moins de MANEUVER_DONE_M est faite, on passe à la
 * suivante. L'itinéraire se recalcule de toute façon quand le livreur
 * avance ; ceci couvre l'entre-deux.
 */
export function nextManeuver(steps: NavStep[], from: number, driver: { lat: number; lng: number } | null): number {
  let i = Math.max(1, Math.min(from, steps.length - 1));
  if (!driver) return i;
  while (i < steps.length - 1 && distanceM(driver, steps[i]) < MANEUVER_DONE_M) i++;
  return i;
}
