'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Bike, Check, ChevronDown, Clock3, Search, Star, Store as StoreIcon, X } from 'lucide-react';
import { euro } from '@/lib/format';
import { filtrePays } from '@/i18n/regions';
import { useRegion } from '@/lib/region-context';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { useAdresseLivraisonEnregistree, type AdresseLivraison } from '@/lib/adresseLivraison';
import { visuelDeCommerce } from '@/lib/visuel-commerce';
import { RechercheAdresseLivraison } from '@/components/RechercheAdresseLivraison';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Commerce {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  city?: string | null;
  rating?: number | null;
  totalRatings?: number;
  estimatedDeliveryTime?: string | null;
  deliveryCost?: number | null;
  distance?: number | null;
  isOpenNow?: boolean;
  famille?: string | null;
  genreLibelle?: string | null;
  products?: { id: string; name: string }[];
  settings?: { banner?: string | null; logo?: string | null } | null;
  livraison?: {
    livrable: boolean;
    frais: number;
    minimum: number;
    deliveryMinutes: number | null;
  } | null;
}

interface Famille {
  code: string;
  libelle: string;
  emoji?: string;
}

type Tri = 'recommended' | 'rating' | 'delivery' | 'distance';
type Filtre = 'freeDelivery' | 'fast' | 'topRated' | 'open';

const normaliser = (texte: string) =>
  texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').trim();

const minutesDe = (commerce: Commerce) =>
  commerce.livraison?.deliveryMinutes ??
  (commerce.estimatedDeliveryTime ? Number.parseInt(commerce.estimatedDeliveryTime, 10) || null : null);

const fraisDe = (commerce: Commerce) => {
  if (commerce.livraison) return commerce.livraison.livrable ? commerce.livraison.frais : null;
  return commerce.deliveryCost;
};

const livraisonOfferte = (commerce: Commerce) => {
  if (commerce.livraison) return commerce.livraison.livrable && commerce.livraison.frais === 0;
  return commerce.deliveryCost === 0;
};

export function MarketplaceDirectory() {
  const t = useTranslations('clientDirectory');
  const locale = useLocale();
  const region = useRegion();
  const adresseEnregistree = useAdresseLivraisonEnregistree();
  const [adresseChoisie, setAdresseChoisie] = useState<AdresseLivraison | null | undefined>(undefined);
  const adresse = adresseChoisie !== undefined ? adresseChoisie : adresseEnregistree;
  const adresseLue = adresseEnregistree !== undefined;
  const [commerces, setCommerces] = useState<Commerce[]>([]);
  const [familles, setFamilles] = useState<Famille[]>([]);
  const [recherche, setRecherche] = useState('');
  const [famille, setFamille] = useState('');
  const [filtres, setFiltres] = useState<Set<Filtre>>(new Set());
  const [tri, setTri] = useState<Tri>('recommended');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);

  const chargerCommerces = useCallback(async () => {
    const avecCoordonnees = adresse?.latitude != null && adresse.longitude != null;
    const url = avecCoordonnees
      ? API_URL + '/api/client/stores/nearby?latitude=' + adresse.latitude + '&longitude=' + adresse.longitude + '&maxDistance=10'
      : API_URL + '/api/client/stores' + filtrePays(region);
    setChargement(true);
    try {
      const reponse = await fetch(url);
      if (!reponse.ok) throw new Error('Chargement des boutiques impossible');
      const donnees = await reponse.json();
      setCommerces(Array.isArray(donnees?.data) ? donnees.data : []);
      setErreur(false);
    } catch {
      setErreur(true);
    } finally {
      setChargement(false);
    }
  }, [adresse, region]);

  useEffectChargement(() => {
    if (adresseLue) void chargerCommerces();
  }, [adresseLue, chargerCommerces]);

  useEffect(() => {
    const controleur = new AbortController();
    fetch(API_URL + '/api/stores/types', { signal: controleur.signal })
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => {
        if (!controleur.signal.aborted) {
          setFamilles(Array.isArray(donnees?.data?.familles) ? donnees.data.familles : []);
        }
      })
      .catch(() => undefined);
    return () => controleur.abort();
  }, []);

  const resultat = useMemo(() => {
    const terme = normaliser(recherche);
    const filtered = commerces.filter((commerce) => {
      const correspondCategorie = !famille || commerce.famille === famille;
      const contenu = [
        commerce.name,
        commerce.city,
        commerce.genreLibelle,
        commerce.description,
        ...(commerce.products || []).map((produit) => produit.name),
      ].filter(Boolean).join(' ');
      const correspondRecherche = !terme || normaliser(contenu).includes(terme);
      const correspondFiltres =
        (!filtres.has('freeDelivery') || livraisonOfferte(commerce)) &&
        (!filtres.has('fast') || (minutesDe(commerce) != null && minutesDe(commerce)! <= 30)) &&
        (!filtres.has('topRated') || (!!commerce.totalRatings && (commerce.rating || 0) >= 4.8)) &&
        (!filtres.has('open') || commerce.isOpenNow !== false);
      return correspondCategorie && correspondRecherche && correspondFiltres;
    });

    const comparateurs: Record<Tri, (a: Commerce, b: Commerce) => number> = {
      recommended: (a, b) =>
        Number(b.isOpenNow !== false) - Number(a.isOpenNow !== false) ||
        Number(b.livraison?.livrable !== false) - Number(a.livraison?.livrable !== false) ||
        (b.rating || 0) - (a.rating || 0),
      rating: (a, b) => (b.rating || 0) - (a.rating || 0),
      delivery: (a, b) =>
        (minutesDe(a) ?? 999) - (minutesDe(b) ?? 999) ||
        (fraisDe(a) ?? 99999) - (fraisDe(b) ?? 99999),
      distance: (a, b) => (a.distance ?? 999) - (b.distance ?? 999),
    };
    return [...filtered].sort(comparateurs[tri]);
  }, [commerces, famille, filtres, recherche, tri]);

  const basculerFiltre = (cle: Filtre) =>
    setFiltres((actuels) => {
      const suivants = new Set(actuels);
      if (suivants.has(cle)) suivants.delete(cle);
      else suivants.add(cle);
      return suivants;
    });

  const effacerFiltres = () => {
    setRecherche('');
    setFamille('');
    setFiltres(new Set());
    setTri('recommended');
  };

  const filtresRapides: { cle: Filtre; libelle: string; icone: typeof Bike }[] = [
    { cle: 'freeDelivery', libelle: t('freeDelivery'), icone: Bike },
    { cle: 'fast', libelle: t('fast'), icone: Clock3 },
    { cle: 'topRated', libelle: t('topRated'), icone: Star },
    { cle: 'open', libelle: t('openNow'), icone: Check },
  ];

  return (
    <main className="bg-white text-gray-900">
      <section className="relative isolate overflow-hidden bg-neutral-950 text-white" aria-labelledby="directory-title">
        <div aria-hidden="true" className="absolute inset-0 -z-20 bg-cover bg-[center_56%]" style={{ backgroundImage: "url('/images/zupeat/home-hero.webp')" }} />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-black/95 via-black/75 to-black/30" />
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
          <p className="text-sm font-bold uppercase tracking-[.16em] text-[#FF7A00]">{t('eyebrow')}</p>
          <h1 id="directory-title" className="mt-3 max-w-3xl text-4xl font-black tracking-[-.055em] sm:text-5xl md:text-6xl">
            {t('title')}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-white/80">{t('subtitle')}</p>
          <div className="mt-8 grid max-w-4xl gap-3 lg:grid-cols-[1fr_1.05fr]">
            <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 shadow-sm transition focus-within:ring-2 focus-within:ring-[#FF7A00]">
              <Search aria-hidden="true" className="size-5 shrink-0 text-neutral-500" />
              <span className="sr-only">{t('searchLabel')}</span>
              <input
                type="search"
                value={recherche}
                onChange={(event) => setRecherche(event.target.value)}
                placeholder={t('searchPlaceholder')}
                className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none placeholder:text-neutral-500"
              />
              {recherche && (
                <button
                  type="button"
                  onClick={() => setRecherche('')}
                  aria-label={t('clearSearch')}
                  className="rounded-full p-2 transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              )}
            </label>
            <RechercheAdresseLivraison
              adresse={adresse}
              onChange={(choisie) => setAdresseChoisie(choisie)}
              className="mb-0 min-h-14 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-12" aria-labelledby="results-title">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <h2 id="results-title" className="text-2xl font-black tracking-tight">{familles.find((item) => item.code === famille)?.libelle || t('allShops')}</h2>
            <p className="mt-1 text-sm text-neutral-600" aria-live="polite">
              {chargement ? t('loading') : t(resultat.length === 1 ? 'oneResult' : 'manyResults', { count: resultat.length })}
              {adresse?.label ? ' · ' + t('deliveringTo', { address: adresse.label }) : ''}
            </p>
          </div>
          <label className="relative inline-flex min-h-12 w-full items-center rounded-full border border-neutral-200 bg-white sm:w-auto">
            <span className="sr-only">{t('sortLabel')}</span>
            <select
              value={tri}
              onChange={(event) => setTri(event.target.value as Tri)}
              className="h-12 w-full appearance-none rounded-full bg-transparent pl-4 pr-10 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] sm:w-52"
            >
              <option value="recommended">{t('sortRecommended')}</option>
              <option value="rating">{t('sortRating')}</option>
              <option value="delivery">{t('sortDelivery')}</option>
              <option value="distance" disabled={adresse?.latitude == null}>{t('sortDistance')}</option>
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 size-4" />
          </label>
        </div>

        <div className="mt-7 grid gap-8 lg:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-7 rounded-3xl border border-neutral-200 bg-white p-5">
              <fieldset>
                <legend className="text-sm font-bold">{t('categories')}</legend>
                <div className="mt-3 flex flex-col gap-1">
                  <CategoryFilter label={t('all')} active={!famille} onClick={() => setFamille('')} />
                  {familles.map((item) => (
                    <CategoryFilter
                      key={item.code}
                      label={item.libelle}
                      emoji={item.emoji}
                      active={famille === item.code}
                      onClick={() => setFamille(famille === item.code ? '' : item.code)}
                    />
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-sm font-bold">{t('filters')}</legend>
                <div className="mt-3 space-y-3">
                  {filtresRapides.map(({ cle, libelle }) => (
                    <label key={cle} className="flex cursor-pointer items-center gap-3 text-sm text-neutral-700">
                      <input
                        type="checkbox"
                        checked={filtres.has(cle)}
                        onChange={() => basculerFiltre(cle)}
                        className="size-4 rounded border-neutral-300 accent-[#FF7A00] focus-visible:ring-2 focus-visible:ring-[#FF7A00]"
                      />
                      {libelle}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </aside>

          <div className="min-w-0">
            <div className="no-scrollbar -mx-5 mb-6 flex gap-2 overflow-x-auto px-5 pb-1 lg:hidden" aria-label={t('categories')}>
              <CategoryChip label={t('all')} active={!famille} onClick={() => setFamille('')} />
              {familles.map((item) => (
                <CategoryChip
                  key={item.code}
                  label={item.libelle}
                  emoji={item.emoji}
                  active={famille === item.code}
                  onClick={() => setFamille(famille === item.code ? '' : item.code)}
                />
              ))}
            </div>

            <div className="no-scrollbar -mx-5 mb-6 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:px-0" aria-label={t('filters')}>
              {filtresRapides.map(({ cle, libelle, icone: Icone }) => {
                const actif = filtres.has(cle);
                return (
                  <button
                    key={cle}
                    type="button"
                    aria-pressed={actif}
                    onClick={() => basculerFiltre(cle)}
                    className={'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] focus-visible:ring-offset-2 ' + (actif ? 'bg-[#FF7A00] text-black' : 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200')}
                  >
                    <Icone aria-hidden="true" className="size-4" />
                    {libelle}
                  </button>
                );
              })}
            </div>

            {erreur ? (
              <div role="alert" className="rounded-3xl bg-neutral-50 p-8 text-center">
                <StoreIcon aria-hidden="true" className="mx-auto size-8 text-neutral-400" />
                <p className="mt-3 font-semibold">{t('loadError')}</p>
                <button type="button" onClick={() => void chargerCommerces()} className="mt-4 rounded-full bg-black px-5 py-3 text-sm font-bold text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">
                  {t('retry')}
                </button>
              </div>
            ) : chargement ? (
              <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
                {Array.from({ length: 6 }, (_, index) => (
                  <div key={index} aria-hidden="true" className="animate-pulse">
                    <div className="aspect-[1.55] rounded-3xl bg-neutral-100" />
                    <div className="mt-3 h-5 w-2/3 rounded bg-neutral-100" />
                    <div className="mt-2 h-4 w-1/2 rounded bg-neutral-100" />
                  </div>
                ))}
              </div>
            ) : resultat.length === 0 ? (
              <div className="rounded-3xl bg-neutral-50 px-6 py-16 text-center">
                <Search aria-hidden="true" className="mx-auto size-8 text-neutral-400" />
                <p className="mt-3 font-semibold">{t('noResults')}</p>
                <button type="button" onClick={effacerFiltres} className="mt-4 rounded-full bg-black px-5 py-3 text-sm font-bold text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">
                  {t('clearFilters')}
                </button>
              </div>
            ) : (
              <div className="grid gap-x-5 gap-y-9 sm:grid-cols-2 xl:grid-cols-3">
                {resultat.map((commerce) => {
                  const visuel = visuelDeCommerce(commerce.famille);
                  const minutes = minutesDe(commerce);
                  const frais = fraisDe(commerce);
                  return (
                    <Link
                      key={commerce.id}
                      href={'/store/' + commerce.slug}
                      className="group block overflow-hidden rounded-2xl border border-neutral-100 bg-white text-gray-900 shadow-[0_8px_28px_rgba(15,23,42,.07)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(15,23,42,.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] focus-visible:ring-offset-4"
                    >
                      <div className="relative aspect-[1.55] overflow-hidden bg-neutral-100">
                        <img
                          src={commerce.settings?.banner || visuel.src}
                          alt={commerce.settings?.banner ? t('storeBannerAlt', { name: commerce.name }) : visuel.alt}
                          className="size-full object-cover transition duration-500 group-hover:scale-[1.04]"
                          loading="lazy"
                        />
                        {commerce.isOpenNow === false && (
                          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-neutral-800 shadow-sm">{t('closed')}</span>
                        )}
                        {livraisonOfferte(commerce) && (
                          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-[#FF7A00] px-3 py-1.5 text-xs font-bold text-black shadow-sm">
                            <Bike aria-hidden="true" className="size-3.5" />{t('freeDelivery')}
                          </span>
                        )}
                        {commerce.settings?.logo && (
                          <img
                            src={commerce.settings.logo}
                            alt={t('storeLogoAlt', { name: commerce.name })}
                            className="absolute bottom-3 right-3 size-12 rounded-xl bg-white object-contain p-1 shadow-md"
                            loading="lazy"
                          />
                        )}
                      </div>
                      <div className="flex items-start justify-between gap-3 px-4 pt-3">
                        <h3 className="min-w-0 truncate text-lg font-bold tracking-tight">{commerce.name}</h3>
                        {commerce.rating != null && (commerce.totalRatings || 0) > 0 && (
                          <span
                            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-sm font-bold"
                            aria-label={t('ratingAndReviews', {
                              rating: commerce.rating.toLocaleString(locale, { maximumFractionDigits: 1 }),
                              count: commerce.totalRatings || 0,
                            })}
                          >
                            <Star aria-hidden="true" className="size-3.5 fill-current" />
                            {commerce.rating.toLocaleString(locale, { maximumFractionDigits: 1 })}
                            <span className="font-normal text-neutral-500">({commerce.totalRatings})</span>
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate px-4 text-sm text-neutral-600">
                        {[commerce.genreLibelle, commerce.city].filter(Boolean).join(' · ') || t('shopFallback')}
                      </p>
                      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pb-4 text-xs font-semibold text-neutral-700">
                        {minutes != null && <span className="inline-flex items-center gap-1"><Clock3 aria-hidden="true" className="size-3.5" />{t('minutes', { count: minutes })}</span>}
                        {frais != null && <span>{minutes != null ? '· ' : ''}{frais === 0 ? t('freeDelivery') : t('deliveryFee', { amount: euro(frais) })}</span>}
                        {commerce.distance != null && <span>· {commerce.distance.toLocaleString(locale, { maximumFractionDigits: 1 })} {t('kilometres')}</span>}
                      </p>
                      <span className="sr-only">{t('openShop', { name: commerce.name })}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function CategoryFilter({
  label,
  emoji,
  active,
  onClick,
}: {
  label: string;
  emoji?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={'flex min-h-10 items-center gap-2 rounded-xl px-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] ' + (active ? 'bg-orange-50 font-bold text-black' : 'font-medium text-neutral-700 hover:bg-neutral-50')}
    >
      {emoji && <span aria-hidden="true">{emoji}</span>}
      {label}
    </button>
  );
}

function CategoryChip({
  label,
  emoji,
  active,
  onClick,
}: {
  label: string;
  emoji?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={'flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] ' + (active ? 'bg-[#FF7A00] text-black' : 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200')}
    >
      {emoji && <span aria-hidden="true">{emoji}</span>}
      {label}
    </button>
  );
}

