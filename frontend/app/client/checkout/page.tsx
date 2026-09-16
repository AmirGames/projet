'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Ancien tunnel de commande, devenu une simple redirection.
 *
 * Il envoyait un panier réparti sur plusieurs commerces dans un format que
 * l'API refuse : la commande ne partait jamais. Le site tient désormais **un
 * panier par commerce**, et `/checkout` en commande un à la fois — en
 * retrouvant la boutique depuis le panier, ou en la faisant choisir quand il y
 * en a plusieurs.
 */
export default function AncienTunnel() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/checkout');
  }, [router]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600" />
    </div>
  );
}
