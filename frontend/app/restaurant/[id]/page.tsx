'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Ancienne vitrine par identifiant, devenue une simple redirection.
 *
 * Le site portait **trois** vitrines pour la même chose : celle-ci,
 * `/client/restaurant/<id>`, et `/store/<slug>`. Elles partageaient l'API mais
 * pas leur habillage, et divergeaient à chaque correction — une déclinaison
 * ajoutée ici manquait là, un plat épuisé signalé là restait commandable
 * ailleurs.
 *
 * Il n'en reste qu'une, `/store/<slug>` : l'adresse lisible est aussi celle
 * qu'un commerçant peut donner à ses clients. Les liens par identifiant
 * continuent de fonctionner, le temps d'un aller-retour.
 */
export default function AncienneVitrine() {
  const t = useTranslations('common');
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

        // Sans slug, rien à rediriger : la liste des commerces vaut mieux
        // qu'une page blanche.
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
