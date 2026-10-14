import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowRight, Leaf, Lightbulb, ShieldCheck, UsersRound } from 'lucide-react';
import { accueilDe } from '@/lib/domaines';
import { EMAIL_CONTACT } from '@/lib/editeur';
import { EnTeteMarque } from '@/components/EnTeteMarque';
import { FooterZupOne } from '@/components/FooterZupOne';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('vitrineZupone');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

/** La vitrine du groupe ZupOne, qui présente ses deux plateformes. */
export default async function VitrineZupOne() {
  const t = await getTranslations('vitrineZupone');

  const valeurs = [
    { icone: Lightbulb, titre: t('innovationTitle'), texte: t('innovationText') },
    { icone: UsersRound, titre: t('proximityTitle'), texte: t('proximityText') },
    { icone: ShieldCheck, titre: t('trustTitle'), texte: t('trustText') },
    { icone: Leaf, titre: t('impactTitle'), texte: t('impactText') },
  ];

  const projets = [
    {
      nom: 'ZupEat',
      categorie: t('eatCategory'),
      titre: t('eatCardTitle'),
      texte: t('eatText'),
      action: t('eatAction'),
      href: accueilDe('public'),
      image: '/images/zupone/zupeat.webp',
      alt: t('eatImageAlt'),
      accent: 'orange',
    },
    {
      nom: 'ZupDrive',
      categorie: t('driveCategory'),
      titre: t('driveCardTitle'),
      texte: t('driveText'),
      action: t('driveAction'),
      href: accueilDe('drive'),
      image: '/images/zupone/zupdrive.webp',
      alt: t('driveImageAlt'),
      accent: 'blue',
    },
  ];

  return (
    <div className="min-h-screen bg-[#090B0E] text-[#F5F3EE]">
      <EnTeteMarque marque="zupone" themeSombre>
        <nav aria-label={t('navigationLabel')} className="hidden items-center gap-7 lg:flex">
          <a href="#accueil" className="rounded-sm text-sm font-medium text-white/80 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8B274]">
            {t('navHome')}
          </a>
          <a href="#plateformes" className="rounded-sm text-sm font-medium text-white/80 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8B274]">
            {t('navPlatforms')}
          </a>
          <a href="#valeurs" className="rounded-sm text-sm font-medium text-white/80 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8B274]">
            {t('navValues')}
          </a>
        </nav>
        <a
          href={`mailto:${EMAIL_CONTACT}`}
          className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full bg-[#E8C994] px-5 text-sm font-bold text-[#17130D] transition hover:bg-[#F1D9AE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#090B0E]"
        >
          {t('navContact')}<ArrowRight size={16} aria-hidden="true" />
        </a>
      </EnTeteMarque>

      <main>
        <section id="accueil" className="relative isolate min-h-[34rem] overflow-hidden md:min-h-[30rem]">
          <Image
            src="/images/zupone/hero.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="-z-20 object-cover object-[72%_center] md:object-center"
          />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-[#090B0E]/95 via-[#090B0E]/75 to-[#090B0E]/15" />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-[#090B0E]/90 via-transparent to-[#090B0E]/10" />
          <div className="mx-auto flex min-h-[34rem] max-w-7xl items-center px-5 py-16 md:min-h-[30rem] md:px-8 md:py-20">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[.25em] text-[#E8C994]">{t('badge')}</p>
              <h1 className="mt-5 text-[2.65rem] font-semibold leading-[1.02] tracking-[-.045em] text-white sm:text-5xl md:text-6xl">
                <span className="block">{t('heroTitleLead')}</span>
                <span className="mt-1 block text-[#E8C994]">{t('heroTitleAccent')}</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-white/80 md:text-lg">{t('heroText')}</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a href="#plateformes" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#E8C994] px-6 text-sm font-bold text-[#17130D] transition hover:bg-[#F1D9AE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#090B0E]">
                  {t('projectsAction')}<ArrowRight size={17} aria-hidden="true" />
                </a>
                <a href={`mailto:${EMAIL_CONTACT}`} className="inline-flex min-h-12 items-center rounded-full border border-white/35 px-6 text-sm font-semibold text-white transition hover:border-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8C994]">
                  {t('navContact')}
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="valeurs" aria-label={t('valuesLabel')} className="mx-auto max-w-7xl scroll-mt-24 px-5 pb-2 pt-8 md:px-8 md:pt-10">
          <div className="grid grid-cols-2 gap-x-6 gap-y-7 md:grid-cols-4 md:gap-0">
            {valeurs.map(({ icone: Icone, titre, texte }, index) => (
              <div key={titre} className={`flex items-start gap-3 md:px-6 ${index > 0 ? 'md:border-l md:border-white/10' : 'md:pl-0'} ${index === 3 ? 'md:pr-0' : ''}`}>
                <Icone className="mt-0.5 size-8 shrink-0 text-[#E8C994]" strokeWidth={1.6} aria-hidden="true" />
                <div>
                  <h2 className="text-sm font-semibold text-white">{titre}</h2>
                  <p className="mt-1 max-w-[14rem] text-xs leading-5 text-white/65">{texte}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="plateformes" aria-label={t('projectsLabel')} className="mx-auto max-w-7xl scroll-mt-24 px-5 pb-14 pt-10 md:px-8 md:pb-20 md:pt-14">
          <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
            {projets.map((projet) => (
              <article key={projet.nom} className={`group relative isolate min-h-[22rem] overflow-hidden rounded-[1.6rem] border ${projet.accent === 'orange' ? 'border-[#F26B24]/35' : 'border-[#2581F4]/35'}`}>
                <Image
                  src={projet.image}
                  alt={projet.alt}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="-z-20 object-cover object-center transition duration-700 group-hover:scale-[1.025]"
                />
                <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-black/90 via-black/65 to-black/5" />
                <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
                <div className="flex min-h-[22rem] max-w-[26rem] flex-col items-start px-6 py-7 sm:px-8 sm:py-8">
                  <p className={`text-xs font-semibold uppercase tracking-[.18em] ${projet.accent === 'orange' ? 'text-[#FFC28B]' : 'text-[#9CC7FF]'}`}>
                    {projet.categorie}
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-[-.035em] text-white sm:text-4xl">{projet.nom}</h2>
                  <h3 className="mt-6 max-w-[18rem] text-xl font-semibold leading-tight text-white sm:text-2xl">{projet.titre}</h3>
                  <p className="mt-3 max-w-[19rem] text-sm leading-6 text-white/80">{projet.texte}</p>
                  <Link
                    href={projet.href}
                    className={`mt-6 inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black hover:no-underline ${projet.accent === 'orange' ? 'bg-[#F26B24] text-white hover:bg-[#E35D17]' : 'bg-[#1674E8] text-white hover:bg-[#0F65D0]'}`}
                  >
                    {projet.action}<ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      <FooterZupOne />
    </div>
  );
}
