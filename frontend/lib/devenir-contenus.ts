import { getTranslations } from 'next-intl/server';
import type { Avantage, ContenuDevenir, Etape, Question } from '@/components/PageDevenir';
import { EMAIL_CONTACT } from '@/lib/editeur';
import type { Pays } from '@/lib/pays-infos';

/**
 * Contenu des pages « Devenir … » par rôle et par pays. Les prérequis et la
 * FAQ suivent la réglementation du pays ; le reste est commun.
 *
 * Les textes vivent dans les traductions (`devenirContenus.<rôle>`, et
 * `devenirContenus.<rôle>.<pays>` pour ce qui dépend du pays) ; ici ne restent
 * que les icônes et les liens.
 *
 * Ajouter un pays : l'ajouter dans lib/pays.ts, puis compléter chaque rôle
 * dans messages/*.json (TypeScript signale les manquants dans PAYS_COUVERTS).
 */
export type RoleDevenir = 'livreur' | 'commercant' | 'chauffeur';

const PAYS_COUVERTS: Record<Pays, true> = { BE: true, FR: true };

// Une icône par avantage, dans l'ordre des traductions.
const ICONES: Record<RoleDevenir, string[]> = {
  livreur: ['🕒', '📍', '💶'],
  commercant: ['🏪', '🔔', '🛵'],
  chauffeur: ['🕒', '📍', '💶'],
};

/** Ce qui change d'un pays à l'autre ; le chauffeur belge a aussi son accroche et son bouton. */
interface ContenuDuPays {
  etapes: Etape[];
  prerequis: string[];
  questions: Question[];
  accroche?: string;
  cta?: string;
}

export async function contenuDevenir(role: RoleDevenir, pays: Pays): Promise<ContenuDevenir> {
  const t = await getTranslations(`devenirContenus.${role}`);
  const duPays = t.raw(PAYS_COUVERTS[pays] ? pays : 'BE') as ContenuDuPays;
  const avantages = (t.raw('avantages') as Omit<Avantage, 'icone'>[]).map((avantage, i) => ({
    icone: ICONES[role][i],
    ...avantage,
  }));

  const contenu: ContenuDevenir = {
    badge: t('badge'),
    titre: t('titre'),
    accroche: duPays.accroche ?? t('accroche'),
    cta: { libelle: duPays.cta ?? t('cta'), href: '' },
    avantages,
    etapes: duPays.etapes,
    prerequis: duPays.prerequis,
    questions: duPays.questions,
  };

  if (role === 'livreur') {
    return {
      ...contenu,
      cta: { ...contenu.cta, href: '/driver/signup' },
      conditions: { libelle: t('conditions'), href: '/conditions-livreurs' },
    };
  }

  if (role === 'commercant') {
    return {
      ...contenu,
      cta: { ...contenu.cta, href: '/merchant/register' },
      conditions: { libelle: t('conditions'), href: '/conditions-commercants' },
    };
  }

  // En Belgique, le dossier chauffeur se remplit en ligne (licence LVC, voir
  // docs/zupdrive.md) ; ailleurs, la candidature reste un simple contact.
  return {
    ...contenu,
    marque: 'ZupDrive',
    cta: {
      ...contenu.cta,
      href:
        pays === 'BE'
          ? '/chauffeur'
          : `mailto:${EMAIL_CONTACT}?subject=${encodeURIComponent(t('sujetCandidature'))}`,
    },
  };
}
