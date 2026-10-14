import type { Metadata } from 'next';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import Link from '@/components/LienRegional';
import { ArrowRight, BadgeCheck, CarFront, Clock3, Crown, Plane, ShieldCheck, UsersRound } from 'lucide-react';
import { EMAIL_CONTACT } from '@/lib/editeur';
import { EnTeteMarque } from '@/components/EnTeteMarque';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titresPages');
  return { title: `ZupDrive — ${t('zupdrive')}`, description: t('zupdriveDescription') };
}

/** La vitrine ZupDrive présente le service en préparation sans promettre de date d'ouverture. */
export default function AccueilZupDrive() {
  const t = useTranslations('accueilZupdrive');
  const services = [
    { icone: CarFront, titre: t('standardTitle'), texte: t('standardText'), image: '/images/zupdrive/vtc-standard.webp', alt: t('standardImageAlt') },
    { icone: Crown, titre: t('premiumTitle'), texte: t('premiumText'), image: '/images/zupdrive/vtc-premium.webp', alt: t('premiumImageAlt') },
    { icone: Plane, titre: t('airportTitle'), texte: t('airportText'), image: '/images/zupdrive/transfert-aeroport.webp', alt: t('airportImageAlt') },
  ];
  const engagements = [
    { icone: BadgeCheck, titre: t('comfortTitle'), texte: t('comfortText') },
    { icone: ShieldCheck, titre: t('securityTitle'), texte: t('securityText') },
    { icone: Clock3, titre: t('punctualityTitle'), texte: t('punctualityText') },
    { icone: UsersRound, titre: t('personalTitle'), texte: t('personalText') },
  ];

  return (
    <div className="min-h-screen bg-white text-[#111827]">
      <EnTeteMarque marque="zupdrive" themeSombre>
        <nav aria-label={t('navigationLabel')} className="hidden items-center gap-6 xl:flex">
          <a href="#accueil" className="text-sm font-medium text-white/85 transition hover:text-[#168BFF]">{t('navAccueil')}</a>
          <a href="#services" className="text-sm font-medium text-white/85 transition hover:text-[#168BFF]">{t('navServices')}</a>
          <a href="#engagement" className="text-sm font-medium text-white/85 transition hover:text-[#168BFF]">{t('navEngagement')}</a>
          <Link href="/devenir-chauffeur" className="text-sm font-medium text-white/85 transition hover:text-[#168BFF]">{t('devenirChauffeur')}</Link>
        </nav>
        <Link href="/login" className="hidden min-h-10 items-center gap-2 rounded-full border border-white/40 px-4 text-sm font-semibold text-white transition hover:bg-white/10 sm:inline-flex">
          {t('seConnecter')}
        </Link>
        <Link href="/trajet" className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#087DFA] px-4 text-sm font-bold text-white transition hover:bg-[#0067D9] sm:px-5">
          {t('reserver')}<ArrowRight size={15} aria-hidden="true" />
        </Link>
      </EnTeteMarque>

      <main>
        <section id="accueil" className="relative isolate min-h-[35rem] overflow-hidden bg-[#07111D] text-white md:min-h-[40rem]">
          <Image src="/images/zupdrive/hero.webp" alt="" fill priority sizes="100vw" className="-z-20 object-cover object-[66%_center]" />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-[#06111E]/95 via-[#07111E]/75 to-[#07111E]/10" />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
          <div className="mx-auto max-w-7xl px-5 pb-36 pt-14 sm:px-8 sm:pt-20 md:pb-40 lg:px-10">
            <div className="max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-[.12em] text-[#168BFF]">{t('heroLabel')}</p>
              <h1 className="mt-2 text-[2.8rem] font-extrabold leading-[.98] tracking-[-.05em] sm:text-5xl md:text-6xl">
                {t('heroTitle')}<span className="block text-[#168BFF]">{t('heroAccent')}</span>
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-white/90 md:text-lg">{t('texte')}</p>
            </div>
          </div>

          <div className="absolute inset-x-5 bottom-5 mx-auto max-w-6xl rounded-2xl border border-gray-200 bg-white p-3 text-gray-900 shadow-[0_18px_55px_rgba(0,0,0,.28)] sm:inset-x-8 sm:bottom-7 sm:p-4 lg:inset-x-10">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
              <div className="flex min-h-14 items-center gap-3 rounded-xl border border-gray-200 px-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-50 text-[#087DFA]"><CarFront size={19} aria-hidden="true" /></span>
                <div><p className="text-[11px] text-gray-500">{t('bookingServiceLabel')}</p><p className="text-sm font-semibold">{t('bookingServiceValue')}</p></div>
              </div>
              <div className="flex min-h-14 items-center gap-3 rounded-xl border border-gray-200 px-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-50 text-[#087DFA]"><ShieldCheck size={18} aria-hidden="true" /></span>
                <div><p className="text-[11px] text-gray-500">{t('bookingPriceLabel')}</p><p className="text-sm font-semibold">{t('bookingPriceValue')}</p></div>
              </div>
              <Link href="/trajet" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-[#087DFA] px-7 text-sm font-bold text-white transition hover:bg-[#0067D9]">
                {t('reserver')}<ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section aria-label={t('promessesLabel')} className="bg-[#08111C] text-white">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-5 px-5 py-6 sm:px-8 md:grid-cols-4 md:gap-0 lg:px-10">
            {[
              { icone: BadgeCheck, titre: t('pros'), texte: t('prosTexte') },
              { icone: ShieldCheck, titre: t('securityShort'), texte: t('securityShortText') },
              { icone: Clock3, titre: t('speedTitle'), texte: t('speedText') },
              { icone: UsersRound, titre: t('availabilityTitle'), texte: t('availabilityText') },
            ].map(({ icone: Icone, titre, texte }, index) => (
              <div key={titre} className={`flex items-center gap-3 md:px-5 ${index > 0 ? 'md:border-l md:border-white/15' : 'md:pl-0'} ${index === 3 ? 'md:pr-0' : ''}`}>
                <Icone className="size-7 shrink-0 text-[#168BFF]" strokeWidth={1.8} aria-hidden="true" />
                <div><h2 className="text-sm font-bold">{titre}</h2><p className="mt-0.5 text-xs text-white/65">{texte}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section id="services" className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16 lg:px-10">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold tracking-[-.04em] sm:text-4xl">{t('servicesTitle')} <span className="text-[#087DFA]">{t('servicesAccent')}</span></h2>
            <p className="mt-2 text-sm text-gray-500">{t('servicesIntro')}</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3 md:gap-5">
            {services.map(({ icone: Icone, titre, texte, image, alt }, index) => (
              <Link key={titre} href="/trajet" className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_8px_28px_rgba(15,23,42,.08)] transition hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(15,23,42,.13)]">
                <div className="relative h-36 overflow-hidden sm:h-40">
                  <Image src={image} alt={alt} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover transition duration-500 group-hover:scale-[1.04]" />
                </div>
                <div className="relative px-5 pb-5 pt-5">
                  <span className="absolute -top-6 left-5 grid size-12 place-items-center rounded-full border-4 border-white bg-[#087DFA] text-white shadow-sm"><Icone size={21} aria-hidden="true" /></span>
                  <span className="absolute -right-1 -top-2 grid size-10 place-items-center rounded-full border border-gray-200 bg-white text-gray-800 transition group-hover:border-[#087DFA] group-hover:text-[#087DFA]"><ArrowRight size={17} aria-hidden="true" /></span>
                  <h3 className="mt-2 text-lg font-extrabold tracking-tight">{titre}</h3>
                  <p className="mt-1 min-h-10 text-sm leading-5 text-gray-600">{texte}</p>
                  <ul className="mt-3 space-y-1.5 text-xs text-gray-600">
                    {(index === 0 ? [t('standardPoint1'), t('standardPoint2'), t('standardPoint3')] : index === 1 ? [t('premiumPoint1'), t('premiumPoint2'), t('premiumPoint3')] : [t('airportPoint1'), t('airportPoint2'), t('airportPoint3')]).map((point) => (
                      <li key={point} className="flex items-center gap-2"><BadgeCheck size={14} className="shrink-0 text-[#087DFA]" aria-hidden="true" />{point}</li>
                    ))}
                  </ul>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section id="engagement" className="mx-auto max-w-7xl px-5 pb-12 sm:px-8 sm:pb-16 lg:px-10">
          <div className="grid overflow-hidden rounded-2xl bg-[#F4F7FB] md:grid-cols-[.9fr_1.1fr_1fr]">
            <div className="p-6 sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[.12em] text-[#087DFA]">{t('engagementEyebrow')}</p>
              <h2 className="mt-2 text-2xl font-extrabold leading-tight tracking-[-.04em]">{t('engagementTitle')} <span className="text-[#087DFA]">{t('engagementAccent')}</span></h2>
              <p className="mt-3 text-sm leading-6 text-gray-600">{t('engagementIntro')}</p>
              <a href={`mailto:${EMAIL_CONTACT}`} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full border border-[#087DFA] px-5 text-sm font-semibold text-gray-900 transition hover:bg-[#087DFA] hover:text-white">{t('enSavoirPlus')}<ArrowRight size={15} aria-hidden="true" /></a>
            </div>
            <div className="grid content-center gap-4 px-6 pb-7 sm:grid-cols-2 sm:px-8 md:py-7">
              {engagements.map(({ icone: Icone, titre, texte }) => (
                <div key={titre} className="flex items-start gap-3">
                  <Icone className="mt-0.5 size-6 shrink-0 text-[#087DFA]" strokeWidth={1.9} aria-hidden="true" />
                  <div><h3 className="text-sm font-bold">{titre}</h3><p className="mt-0.5 text-xs leading-5 text-gray-600">{texte}</p></div>
                </div>
              ))}
            </div>
            <div className="relative hidden min-h-64 md:block">
              <Image src="/images/zupdrive/vtc-premium.webp" alt={t('engagementImageAlt')} fill sizes="33vw" className="object-cover object-[45%_center]" />
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#F4F7FB] via-transparent to-transparent" />
            </div>
          </div>
        </section>

        <section className="relative isolate overflow-hidden bg-gradient-to-r from-[#0754AB] via-[#087DFA] to-[#0754AB] text-white">
          <div aria-hidden="true" className="absolute -left-20 -top-24 size-72 rounded-full border-[36px] border-white/5" />
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 px-5 py-8 sm:flex-row sm:items-center sm:px-8 lg:px-10">
            <div className="flex items-center gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15"><CarFront size={30} aria-hidden="true" /></span>
              <div><h2 className="text-xl font-extrabold sm:text-2xl">{t('mobileTitle')}</h2><p className="mt-1 text-sm text-white/85">{t('mobileText')}</p></div>
            </div>
            <Link href="/trajet" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-white px-5 text-sm font-bold text-[#0754AB] transition hover:bg-blue-50">{t('reserverEnLigne')}<ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </section>
      </main>
    </div>
  );
}

