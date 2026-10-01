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

const writtenOrdinal = (n: number) => (n === 1 ? '1re' : `${n}e`);

/** À voix haute, « 2e » se lit mal : « deuxième ». */
const SPOKEN_ORDINALS = ['', 'première', 'deuxième', 'troisième', 'quatrième', 'cinquième', 'sixième', 'septième', 'huitième', 'neuvième', 'dixième'];
const spokenOrdinal = (n: number) => SPOKEN_ORDINALS[n] || writtenOrdinal(n);

/**
 * « Tournez à droite sur Rue de Fer », « Au rond-point, prenez la 2e sortie ».
 * `spoken` : la même consigne, écrite pour la synthèse vocale.
 */
export function instruction(step: NavStep, spoken = false): string {
  const ordinal = spoken ? spokenOrdinal : writtenOrdinal;
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

/** « 200 mètres », « 1,5 kilomètre » : arrondi comme le dirait un GPS. */
function spokenDistance(metres: number): string {
  if (metres >= 950) {
    const km = Math.round(metres / 100) / 10;
    return `${String(km).replace('.', ',')} kilomètre${km >= 2 ? 's' : ''}`;
  }
  const rounded = metres >= 100 ? Math.round(metres / 50) * 50 : Math.max(10, Math.round(metres / 10) * 10);
  return `${rounded} mètres`;
}

/**
 * La consigne à annoncer : avec la distance (« Dans 200 mètres, tournez à
 * droite sur Rue de Fer ») à l'approche, sans elle au moment de tourner.
 */
export function spokenInstruction(step: NavStep, metres: number | null): string {
  if (step.type === 'arrive') {
    return metres == null ? 'Vous êtes arrivé à destination' : `Dans ${spokenDistance(metres)}, vous arriverez à destination`;
  }
  const text = instruction(step, true);
  if (metres == null) return text;
  return `Dans ${spokenDistance(metres)}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/** Au moment de la manœuvre : la consigne seule, sans distance. */
const NOW_M = 60;
/** À l'approche d'une manœuvre lointaine : un rappel, avec la distance. */
const APPROACH_M = 400;
/** Une manœuvre annoncée de plus loin que ceci aura son rappel à l'approche. */
const FAR_M = 600;

/** Ce qui a déjà été dit d'une manœuvre. */
export type Phase = 'announced' | 'approach' | 'now';

/**
 * Faut-il parler, et pour dire quoi : une manœuvre est annoncée en la
 * découvrant, rappelée à 400 m si elle était à plus de 600 m, puis dite au
 * moment de tourner (60 m). Rien n'est dit deux fois.
 */
export function voiceAnnouncement(
  step: NavStep,
  metres: number,
  phase: Phase | undefined
): { next: Phase; text: string } | null {
  if (metres <= NOW_M) return phase === 'now' ? null : { next: 'now', text: spokenInstruction(step, null) };
  // Déjà proche : pas de rappel à 400 m, ce serait la même phrase.
  if (!phase) return { next: metres <= FAR_M ? 'approach' : 'announced', text: spokenInstruction(step, metres) };
  if (phase === 'announced' && metres <= APPROACH_M) return { next: 'approach', text: spokenInstruction(step, metres) };
  return null;
}
