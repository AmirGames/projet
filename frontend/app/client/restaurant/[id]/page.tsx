'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import { useTranslations } from 'next-intl';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Troisième vitrine du site, devenue une simple redirection.
 *
 * Elle était la plus en retard des trois : ni panier par commerce, ni
 * déclinaisons, et elle poussait vers `/client/checkout`, un tunnel qui
 * envoyait un panier réparti sur plusieurs commerces dans un format que l'API
 * refuse. Tout passe désormais par `/store/<slug>`.
 */
export default function AncienneVitrineClient() {
  const t = useTranslations('clientRestaurant');
  const params = useParams();
  const router = useRouter();
  const [introuvable, setIntrouvable] = useState(false);

  useEffect(() => {
    const id = params.id as string;

    if (!id) return;

    (async () => {
      try {
        const reponse = await fetch(`${API_URL}/api/client/stores/${id}`);

        if (!reponse.ok) {
          setIntrouvable(true);
          return;
        }

        const lu = await reponse.json();
        const slug = lu?.data?.slug;

        router.replace(slug ? `/store/${slug}` : '/client');
      } catch {
        setIntrouvable(true);
      }
    })();
  }, [params.id, router]);

  if (introuvable) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="text-center">
          <p className="mb-2 font-semibold text-gray-900">{t('notFound')}</p>
          <Link href="/client" className="font-semibold text-[#A94F00] underline underline-offset-4 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">
            {t('seeAll')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div role="status" aria-label={t('loading')} className="size-10 animate-spin rounded-full border-2 border-neutral-200 border-b-[#FF7A00]" />
    </div>
  );
}

