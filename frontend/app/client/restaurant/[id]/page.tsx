'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

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

        router.replace(slug ? `/store/${slug}` : '/restaurants');
      } catch {
        setIntrouvable(true);
      }
    })();
  }, [params.id, router]);

  if (introuvable) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-white font-semibold mb-2">Ce commerce est introuvable</p>
          <Link href="/restaurants" className="text-orange-500 hover:underline">
            Voir tous les commerces
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600" />
    </div>
  );
}
