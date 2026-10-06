import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { accueilDe } from '@/lib/domaines';
import { EMAIL_CONTACT } from '@/lib/editeur';
import { MARQUES } from '@/lib/marques';
import { EnTeteMarque } from '@/components/EnTeteMarque';
import { BandeauMarque } from '@/components/BandeauMarque';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titresPages');
  return { title: `ZupDrive — ${t('zupdrive')}`, description: t('zupdriveDescription') };
}

/**
 * L'accueil de zupdrive.com (voir ACCUEIL dans lib/domaines.ts).
 *
 * Le service VTC n'est pas encore ouvert : la page l'annonce, recrute les
 * chauffeurs et renvoie les clients vers ZupEat en attendant. Elle ne promet
 * ni date ni ville.
 */
export default function AccueilZupDrive() {
  const prevenir = `mailto:${EMAIL_CONTACT}?subject=${encodeURIComponent('Prévenez-moi de l’ouverture de ZupDrive')}`;

  const atouts = [
    {
      icone: '💶',
      titre: 'Prix connu à l’avance',
      texte: 'Le montant de la course est affiché avant la réservation.',
    },
    {
      icone: '🪪',
      titre: 'Chauffeurs professionnels',
      texte: 'Carte VTC ou autorisation régionale, permis et assurance : chaque dossier est vérifié.',
    },
    {
      icone: '🔑',
      titre: 'Un seul compte',
      texte: 'Votre compte ZupOne sert pour vos trajets comme pour vos commandes.',
    },
  ];

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <EnTeteMarque marque="zupdrive">
        <Link
          href={accueilDe('public')}
          className="hidden text-sm font-semibold text-gray-700 hover:text-gray-900 sm:inline"
        >
          Commander sur ZupEat
        </Link>
        <Link
          href="/devenir-chauffeur"
          className={`rounded-full px-5 py-2 text-sm font-semibold hover:no-underline ${MARQUES.zupdrive.bouton}`}
        >
          Devenir chauffeur
        </Link>
      </EnTeteMarque>

      <BandeauMarque
        marque="zupdrive"
        badge="Bientôt disponible"
        titre="Vos trajets avec chauffeur, près de chez vous"
        texte="ZupDrive prépare son service de transport de personnes (VTC). Vous réserverez votre chauffeur depuis le même compte que vos commandes ZupEat."
        emojis={['🚗', '📍', '🧳', '🚕', '🛣️', '⭐']}
      >
        <Link
          href="/devenir-chauffeur"
          className="rounded-full bg-white px-8 py-4 text-center font-bold text-gray-900 hover:bg-gray-100 hover:no-underline"
        >
          Je suis chauffeur
        </Link>
        <a
          href={prevenir}
          className="rounded-full bg-white/15 px-8 py-4 text-center font-bold text-white ring-1 ring-white/40 hover:bg-white/25 hover:no-underline"
        >
          Être prévenu de l&apos;ouverture
        </a>
      </BandeauMarque>

      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-14 md:grid-cols-3 md:px-6">
        {atouts.map((a) => (
          <div key={a.titre} className="rounded-3xl p-8 ring-1 ring-gray-200">
            <span className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl text-3xl ${MARQUES.zupdrive.teinte}`} aria-hidden="true">
              {a.icone}
            </span>
            <h2 className="mb-2 text-xl font-bold">{a.titre}</h2>
            <p className="text-gray-600">{a.texte}</p>
          </div>
        ))}
      </section>

      {/* En attendant l'ouverture : la plateforme sœur, à ses couleurs. */}
      <div className="mx-auto max-w-7xl px-4 pb-16 md:px-6">
        <section className="flex flex-col items-start gap-6 rounded-3xl bg-orange-50 p-8 md:flex-row md:items-center md:justify-between md:p-12">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight">En attendant, ZupEat est ouvert</h2>
            <p className="mt-3 max-w-xl text-gray-600">
              Commandez chez les restaurants et commerces de votre quartier, livrés ou à emporter.
            </p>
          </div>
          <Link
            href={accueilDe('public')}
            className={`flex-shrink-0 rounded-full px-8 py-4 font-bold hover:no-underline ${MARQUES.zupeat.bouton}`}
          >
            Découvrir ZupEat
          </Link>
        </section>
      </div>
    </div>
  );
}
