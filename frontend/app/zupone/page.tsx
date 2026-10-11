import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { accueilDe, lienVersEspace } from '@/lib/domaines';
import { MARQUES, type Marque } from '@/lib/marques';
import { EnTeteMarque } from '@/components/EnTeteMarque';

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
        <a href="#plateformes" className="hidden rounded-sm text-sm font-semibold text-gray-700 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black sm:inline">
          {t('navPlatforms')}
        </a>
        <a href="#rejoindre" className="hidden rounded-sm text-sm font-semibold text-gray-700 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black sm:inline">
          {t('navJoin')}
        </a>
        <Link
          href={accueilDe('public')}
          className={`rounded-full px-5 py-2 text-sm font-semibold hover:no-underline ${MARQUES.zupeat.bouton}`}
        >
          {t('navOrder')}
        </Link>
      </EnTeteMarque>

      <main>
        <section className="mx-auto max-w-7xl px-4 pt-5 md:px-6 md:pt-8">
          <div className="relative isolate overflow-hidden rounded-[2rem] bg-[#111111] px-6 py-8 text-white sm:px-10 sm:py-10 md:rounded-[2.5rem] md:px-14 md:py-14">
            <div aria-hidden="true" className="absolute -right-20 -top-28 size-96 rounded-full bg-[#FF7A00]/15 blur-3xl" />
            <div className="relative grid items-center gap-10 lg:grid-cols-[1.05fr_.95fr]">
              <div className="max-w-2xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold text-white/90 backdrop-blur">
                  <span className="size-2 rounded-full bg-[#FF7A00]" />{t('badge')}
                </span>
                <h1 className="mt-6 text-4xl font-black leading-[.98] tracking-[-.06em] sm:text-5xl md:text-6xl">{t('heroTitle')}</h1>
                <p className="mt-5 max-w-xl text-base leading-7 text-white/75 md:text-lg">{t('heroText')}</p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link href={accueilDe('public')} className="inline-flex min-h-14 items-center justify-center rounded-full bg-[#FF7A00] px-7 font-bold text-black transition hover:bg-[#E66E00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black">
                    {t('eatAction')}
                  </Link>
                  <a href="#rejoindre" className="inline-flex min-h-14 items-center justify-center rounded-full border border-white/25 bg-white/5 px-7 font-bold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">
                    {t('navJoin')}
                  </a>
                </div>
                <p className="mt-5 text-sm text-white/60">{t('singleSignupText')}</p>
              </div>
              <div aria-label={t('heroVisualLabel')} className="relative mx-auto grid w-full max-w-xl grid-cols-2 gap-3 sm:gap-4">
                {[
                  { image: '/images/shops-redesign/boulangerie.webp', alt: t('bakeryAlt') },
                  { image: '/images/shops-redesign/primeur.webp', alt: t('grocerAlt') },
                  { image: '/images/shops-redesign/fromagerie.webp', alt: t('cheeseAlt') },
                  { image: '/images/shops-redesign/pizzeria.webp', alt: t('pizzeriaAlt') },
                ].map((visuel, index) => (
                  <div key={visuel.image} className={`overflow-hidden rounded-3xl border border-white/10 bg-white/10 shadow-2xl ${index % 2 ? 'translate-y-5' : ''}`}>
                    <img src={visuel.image} alt={visuel.alt} className="aspect-[1.15] w-full object-cover transition duration-500 hover:scale-105" />
                  </div>
                ))}
                <div aria-hidden="true" className="absolute -bottom-2 left-1/2 grid size-14 -translate-x-1/2 place-items-center rounded-2xl border border-white/10 bg-[#FF7A00] text-2xl text-black shadow-xl">Z</div>
              </div>
            </div>
          </div>
        </section>

      {/* Une carte par plateforme, à ses couleurs. */}
      <section id="plateformes" className="mx-auto grid max-w-7xl scroll-mt-20 grid-cols-1 gap-6 px-4 py-16 md:grid-cols-2 md:px-6 md:py-20">
        {plateformes.map((p) => {
          const theme = MARQUES[p.marque];
          return (
            <div key={p.nom} className="group flex flex-col overflow-hidden rounded-[2rem] border border-neutral-200 bg-white transition duration-300 hover:-translate-y-1 hover:shadow-xl">
              <div className={`relative h-36 ${theme.bandeau}`}>
                <span aria-hidden="true" className="absolute -bottom-6 right-6 select-none text-8xl transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110">
                  {p.emoji}
                </span>
                <span
                  className={`absolute left-6 top-6 rounded-full px-3 py-1 text-xs font-bold ${
                    p.disponible ? 'bg-white text-green-800' : 'bg-white/20 text-white'
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
                  className={`self-start rounded-full px-6 py-3 font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 hover:no-underline ${theme.bouton}`}
                >
                  {p.action}
                </Link>
              </div>
            </div>
          );
        })}
      </section>

      <section className="bg-[#F7F6F4] px-4 py-16 md:px-6 md:py-20">
        <h2 className="mb-10 text-center text-3xl font-extrabold tracking-tight md:text-4xl">{t('oneAccountTitle')}</h2>
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {atouts.map((point) => (
            <div key={point.titre} className="rounded-3xl border border-neutral-200 bg-white p-7 transition hover:-translate-y-1 hover:shadow-lg">
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FF7A00] text-xl text-black" aria-hidden="true">
                {point.icone}
              </span>
              <h3 className="mb-2 text-lg font-bold">{point.titre}</h3>
              <p className="text-gray-600">{point.texte}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="rejoindre" className="scroll-mt-20 px-4 py-16 md:px-6 md:py-20">
        <h2 className="mb-10 text-center text-3xl font-extrabold tracking-tight md:text-4xl">{t('joinTitle')}</h2>
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {rejoindre.map((r) => (
            <Link
              key={r.titre}
              href={r.lien}
              className="group flex flex-col rounded-[2rem] border border-neutral-200 bg-white p-8 text-gray-900 transition hover:-translate-y-1 hover:no-underline hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]"
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
      </main>
      <footer className="border-t border-neutral-200 bg-[#F7F6F4]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-neutral-600 sm:flex-row sm:items-center sm:justify-between md:px-8">
          <Link href="/zupone" className="inline-flex items-center gap-2 rounded-lg font-black text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-xl bg-black text-xs text-white">Z</span>ZupOne
          </Link>
          <p>{t('footerCopyright', { year: new Date().getFullYear() })}</p>
          <nav aria-label={t('footerLegal')} className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/mentions-legales" className="rounded-sm hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">{t('footerLegalNotice')}</Link>
            <Link href="/confidentialite" className="rounded-sm hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">{t('footerPrivacy')}</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

