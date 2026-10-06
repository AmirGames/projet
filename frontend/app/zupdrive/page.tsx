import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('accueilZupdrive');
  const prevenir = `mailto:${EMAIL_CONTACT}?subject=${encodeURIComponent(t('sujetPrevenir'))}`;

  const atouts = [
    {
      icone: '💶',
      titre: t('prix'),
      texte: t('prixTexte'),
    },
    {
      icone: '🪪',
      titre: t('pros'),
      texte: t('prosTexte'),
    },
    {
      icone: '🔑',
      titre: t('compte'),
      texte: t('compteTexte'),
    },
  ];

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <EnTeteMarque marque="zupdrive">
        <Link
          href={accueilDe('public')}
          className="hidden text-sm font-semibold text-gray-700 hover:text-gray-900 sm:inline"
        >
          {t('commanderZupeat')}
        </Link>
        <Link
          href="/devenir-chauffeur"
          className={`rounded-full px-5 py-2 text-sm font-semibold hover:no-underline ${MARQUES.zupdrive.bouton}`}
        >
          {t('devenirChauffeur')}
        </Link>
      </EnTeteMarque>

      <BandeauMarque
        marque="zupdrive"
        badge={t('bientot')}
        titre={t('titre')}
        texte={t('texte')}
        emojis={['🚗', '📍', '🧳', '🚕', '🛣️', '⭐']}
      >
        <Link
          href="/devenir-chauffeur"
          className="rounded-full bg-white px-8 py-4 text-center font-bold text-gray-900 hover:bg-gray-100 hover:no-underline"
        >
          {t('jeSuisChauffeur')}
        </Link>
        <a
          href={prevenir}
          className="rounded-full bg-white/15 px-8 py-4 text-center font-bold text-white ring-1 ring-white/40 hover:bg-white/25 hover:no-underline"
        >
          {t('prevenir')}
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
            <h2 className="text-3xl font-extrabold tracking-tight">{t('enAttendant')}</h2>
            <p className="mt-3 max-w-xl text-gray-600">
              {t('enAttendantTexte')}
            </p>
          </div>
          <Link
            href={accueilDe('public')}
            className={`flex-shrink-0 rounded-full px-8 py-4 font-bold hover:no-underline ${MARQUES.zupeat.bouton}`}
          >
            {t('decouvrir')}
          </Link>
        </section>
      </div>
    </div>
  );
}
