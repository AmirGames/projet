'use client';

import Link from '@/components/LienRegional';
import { useStockageLocal } from '@/lib/navigateur';
import { useTranslations } from 'next-intl';

/**
 * Le lien de l'en-tête des pages de présentation : « Connexion » pour un
 * visiteur, « Mon espace » pour quelqu'un déjà connecté (le tableau de bord
 * l'oriente selon ses rôles).
 */
export function LienConnexion() {
  const t = useTranslations('enTeteClient');
  const connecte = Boolean(useStockageLocal('accessToken'));
  return (
    <Link
      href={connecte ? '/dashboard' : '/login'}
      className="hidden font-semibold text-slate-900 hover:text-primary sm:inline"
    >
      {connecte ? t('monEspace') : t('connexion')}
    </Link>
  );
}
