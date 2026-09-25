'use client';

import Link from 'next/link';
import { forwardRef, type ComponentProps } from 'react';
import { ajouterRegion } from '@/i18n/chemins-regionaux';
import { useRegion } from '@/lib/region-context';

/**
 * Remplaçant de next/link pour les pages publiques : un lien vers une page
 * régionale (/restaurants, /store/…, /cgu…) reçoit le préfixe de la région
 * en cours (/be-fr/restaurants), ce qui évite au visiteur un détour par la
 * redirection du middleware. Les autres liens passent inchangés.
 */
const LienRegional = forwardRef<HTMLAnchorElement, ComponentProps<typeof Link>>(function LienRegional(
  { href, ...props },
  ref,
) {
  const region = useRegion();
  const cible = region && typeof href === 'string' ? ajouterRegion(href, region.code) : href;
  return <Link ref={ref} href={cible} {...props} />;
});

export default LienRegional;
