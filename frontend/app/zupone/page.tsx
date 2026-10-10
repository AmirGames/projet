import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { accueilDe, lienVersEspace } from '@/lib/domaines';
import { MARQUES, type Marque } from '@/lib/marques';
import { EnTeteMarque } from '@/components/EnTeteMarque';
import { BandeauMarque } from '@/components/BandeauMarque';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('vitrineZupone');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

/**
 * La vitrine du groupe, servie à la racine de zupone.com (voir ACCUEIL dans
 * lib/domaines.ts).
 *
 * Elle présente les plateformes et renvoie chacun là où il agit : le client
 * vers ZupEat et les métiers actuellement ouverts, sur leur propre domaine.
 * Rien ne s'y passe derrière une connexion.
 */
export default async function VitrineZupOne() {
  const t = await getTranslations('vitrineZupone');

  const plateformes: {
    nom: string;
    marque: Marque;
    emoji: string;
    etat: string;
    texte: string;
    lien: string;
    action: string;
    disponible: boolean;
  }[] = [
    {
      nom: 'ZupEat',
      marque: 'zupeat',
      emoji: '🍔',
      etat: t('available'),
      texte: t('eatText'),
      lien: accueilDe('public'),
      action: t('eatAction'),
      disponible: true,
    },
  ];

  const atouts = [
    { icone: '🔑', titre: t('singleSignupTitle'), texte: t('singleSignupText') },
    { icone: '📍', titre: t('localTitle'), texte: t('localText') },
    { icone: '🔒', titre: t('paymentTitle'), texte: t('paymentText') },
  ];

  const rejoindre: { icone: string; marque: Marque; titre: string; texte: string; lien: string; action: string; bientot?: boolean }[] = [
    {
      icone: '🏪',
      marque: 'zupeat',
      titre: t('merchantTitle'),
      texte: t('merchantText'),
      lien: lienVersEspace('pro', '/devenir-commercant'),
      action: t('merchantAction'),
    },
    {
      icone: '🛵',
      marque: 'zupeat',
      titre: t('courierTitle'),
      texte: t('courierText'),
      lien: lienVersEspace('livreur', '/devenir-livreur'),
      action: t('courierAction'),
    },
  ];

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <EnTeteMarque marque="zupone">
        <a href="#plateformes" className="hidden text-sm font-semibold text-gray-700 hover:text-gray-900 sm:inline">
          {t('navPlatforms')}
        </a>
        <a href="#rejoindre" className="hidden text-sm font-semibold text-gray-700 hover:text-gray-900 sm:inline">
          {t('navJoin')}
        </a>
        <Link
          href={accueilDe('public')}
          className={`rounded-full px-5 py-2 text-sm font-semibold hover:no-underline ${MARQUES.zupeat.bouton}`}
        >
          {t('navOrder')}
        </Link>
      </EnTeteMarque>

      <BandeauMarque
        marque="zupone"
        badge={t('badge')}
        titre={t('heroTitle')}
        texte={t('heroText')}
        emojis={['🍕', '🚗', '🥐', '🛵', '🏪', '📍']}
      >
        <Link
          href={accueilDe('public')}
          className="rounded-full bg-white px-8 py-4 text-center font-bold text-gray-900 hover:bg-gray-100 hover:no-underline"
        >
          {t('eatAction')}
        </Link>
        <a
          href="#rejoindre"
          className="rounded-full bg-white/15 px-8 py-4 text-center font-bold text-white ring-1 ring-white/40 hover:bg-white/25 hover:no-underline"
        >
          {t('navJoin')}
        </a>
      </BandeauMarque>

      {/* Une carte par plateforme, à ses couleurs. */}
      <section id="plateformes" className="mx-auto grid max-w-7xl scroll-mt-20 grid-cols-1 gap-6 px-4 py-14 md:grid-cols-2 md:px-6">
        {plateformes.map((p) => {
          const theme = MARQUES[p.marque];
          return (
            <div key={p.nom} className="group flex flex-col overflow-hidden rounded-3xl ring-1 ring-gray-200 transition hover:shadow-xl">
              <div className={`relative h-36 ${theme.bandeau}`}>
                <span aria-hidden="true" className="absolute -bottom-6 right-6 select-none text-8xl transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110">
                  {p.emoji}
                </span>
                <span
                  className={`absolute left-6 top-6 rounded-full px-3 py-1 text-xs font-bold ${
                    p.disponible ? 'bg-white text-green-700' : 'bg-white/20 text-white'
                  }`}
                >
                  {p.etat}
                </span>
              </div>
              <div className="flex flex-1 flex-col p-8">
                <h2 className="text-3xl font-extrabold tracking-tight">{p.nom}</h2>
                <p className="mb-8 mt-3 flex-1 text-gray-600">{p.texte}</p>
                <Link
                  href={p.lien}
                  className={`self-start rounded-full px-6 py-3 font-bold hover:no-underline ${theme.bouton}`}
                >
                  {p.action}
                </Link>
              </div>
            </div>
          );
        })}
      </section>

      <section className="bg-gray-50 px-4 py-16 md:px-6">
        <h2 className="mb-10 text-center text-3xl font-extrabold tracking-tight md:text-4xl">{t('oneAccountTitle')}</h2>
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {atouts.map((point) => (
            <div key={point.titre} className="rounded-3xl bg-white p-7 ring-1 ring-gray-200">
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-900 text-xl" aria-hidden="true">
                {point.icone}
              </span>
              <h3 className="mb-2 text-lg font-bold">{point.titre}</h3>
              <p className="text-gray-600">{point.texte}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="rejoindre" className="scroll-mt-20 px-4 py-16 md:px-6">
        <h2 className="mb-10 text-center text-3xl font-extrabold tracking-tight md:text-4xl">{t('joinTitle')}</h2>
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {rejoindre.map((r) => (
            <Link
              key={r.titre}
              href={r.lien}
              className="group flex flex-col rounded-3xl p-8 text-gray-900 ring-1 ring-gray-200 transition hover:-translate-y-1 hover:no-underline hover:shadow-xl"
            >
              <span className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl text-3xl ${MARQUES[r.marque].teinte}`} aria-hidden="true">
                {r.icone}
              </span>
              <h3 className="mb-2 text-xl font-bold">{r.titre}</h3>
              {r.bientot && (
                <span className={`mb-3 self-start rounded-full px-3 py-1 text-xs font-bold ${MARQUES[r.marque].teinte}`}>
                  {t('comingSoon')}
                </span>
              )}
              <p className="mb-6 flex-1 text-gray-600">{r.texte}</p>
              <span className={`font-bold ${MARQUES[r.marque].accent}`}>
                {r.action} <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
