'use client';


import { jetonAcces } from '@/lib/jeton-session';
import { signalerErreur } from '@/lib/erreurs';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { filtrePays } from '@/i18n/regions';
import { useRegion } from '@/lib/region-context';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ImageNext from 'next/image';
import { Star, Heart, ChevronLeft, ChevronRight, ChevronDown, Search, Check, Bike, Clock, Tag, ArrowRight, CreditCard, Store, MapPin, ShoppingBag } from 'lucide-react';

import { RechercheAdresseLivraison } from '@/components/RechercheAdresseLivraison';
import {
  lireAdresseLivraison,
  useAdresseLivraisonEnregistree,
  type AdresseLivraison,
} from '@/lib/adresseLivraison';

import { euro } from '@/lib/format';
import { visuelDeFamille } from '@/lib/visuels-familles';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { visuelDeCommerce } from '@/lib/visuel-commerce';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Store {
  id: string;
  name: string;
  slug: string;
  description?: string;
  address?: string;
  city?: string;
  /** Moyenne des avis publiés, null tant que personne n'a noté. */
  rating?: number | null;
  totalRatings?: number;
  /** Part des avis à 4 ou 5 étoiles, null sans avis. */
  satisfactionPercentage?: number | null;
  latitude?: number;
  longitude?: number;
  distance?: number;
  estimatedDeliveryTime?: string;
  deliveryCost?: number;
  /** Fermée momentanément (bouton rapide du commerçant) : visible, mais on n'y commande pas. */
  isOpen?: boolean;
  /** Ce que disent à la fois le planning hebdomadaire et le bouton rapide, croisés. */
  isOpenNow?: boolean;
  products?: any[];
  /** La famille (« pizza », « sushi »…) qui sert de filtre, et le libellé précis. */
  famille?: string | null;
  genreLibelle?: string | null;
  /** Le logo que le commerçant a déposé depuis ses paramètres. */
  settings?: { logo?: string | null; banner?: string | null } | null;
  /** Les frais jusqu'à l'adresse du client, quand elle est connue. */
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
  emoji: string;
}

type Filtre = 'livraisonOfferte' | 'mieuxNotes' | 'ouvert';

/** Les frais qui s'appliquent vraiment : ceux de la zone, sinon le forfait. */
const fraisDe = (store: Store) =>
  store.livraison ? (store.livraison.livrable ? store.livraison.frais : Infinity) : store.deliveryCost || 0;

/** Livre-t-il à l'adresse ? Sans adresse connue, on ne le sait pas : oui par défaut. */
const livrable = (store: Store) => store.livraison?.livrable !== false;

const livraisonOfferte = (store: Store) => livrable(store) && fraisDe(store) === 0;

const minutesDe = (store: Store) => store.livraison?.deliveryMinutes ?? null;

/** Une note qui compte : au moins un avis, et 4 étoiles ou plus. */
const bienNote = (store: Store) => !!store.totalRatings && (store.rating ?? 0) >= 4;

const note = (valeur: number) =>
  valeur.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function ClientHomePage() {
  const t = useTranslations('clientHome');
  const region = useRegion();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  // `undefined` tant que le navigateur n'a pas été lu.
  const adresseEnregistree = useAdresseLivraisonEnregistree();
  const [adresseChoisie, setAdresse] = useState<AdresseLivraison | null | undefined>(undefined);
  const adresse = adresseChoisie !== undefined ? adresseChoisie : adresseEnregistree;
  const [sortBy, setSortBy] = useState('rating');
  // Les familles de cuisine (Pizzas, Sushis…), et celle que le client a choisie.
  const [familles, setFamilles] = useState<Famille[]>([]);
  const [familleChoisie, setFamilleChoisie] = useState<string | null>(null);
  // Les filtres rapides, à la manière des pastilles des grandes plateformes.
  const [filtres, setFiltres] = useState<Set<Filtre>>(new Set());
  const router = useRouter();
  // Les commerces mis en favoris par le client connecté.
  const [favoris, setFavoris] = useState<Set<string>>(new Set());

  useEffect(() => {
    const token = jetonAcces();
    if (!token) return;
    fetch(`${API_URL}/api/client/me/favorites`, { headers: { Authorization: `Bearer ${token}` } })
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) =>
        setFavoris(new Set((donnees?.data || []).map((f: { storeId: string }) => f.storeId))),
      )
      .catch(() => undefined);
  }, []);

  // Le cœur est dans le lien de la carte : sans preventDefault, le clic
  // ouvrait la boutique au lieu d'ajouter aux favoris.
  const basculerFavori = async (e: React.MouseEvent, storeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const token = jetonAcces();
    if (!token) {
      router.push('/login');
      return;
    }
    const estFavori = favoris.has(storeId);
    const suivant = new Set(favoris);
    if (estFavori) suivant.delete(storeId);
    else suivant.add(storeId);
    setFavoris(suivant);
    try {
      const reponse = await fetch(
        estFavori ? `${API_URL}/api/client/me/favorites/${storeId}` : `${API_URL}/api/client/me/favorites`,
        {
          method: estFavori ? 'DELETE' : 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: estFavori ? undefined : JSON.stringify({ storeId }),
        },
      );
      if (!reponse.ok) throw new Error();
    } catch {
      setFavoris(favoris);
    }
  };

  useEffect(() => {
    fetch(`${API_URL}/api/stores/types`)
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => setFamilles(donnees?.data?.familles || []))
      .catch(() => undefined);
  }, []);

  // Toutes les familles s'affichent, même sans commerce pour l'instant : la
  // rangée garde la même allure d'une adresse à l'autre.
  const rangee = useRef<HTMLUListElement>(null);
  const defiler = (sens: 1 | -1) =>
    rangee.current?.scrollBy({ left: sens * rangee.current.clientWidth * 0.8, behavior: 'smooth' });

  const loadStores = useCallback(async () => {
    try {
      setLoading(true);
      // Les commerces du pays de la région choisie ; ceux « près de moi »
      // restent affaire de distance, frontière comprise.
      const response = await fetch(`${API_URL}/api/client/stores${filtrePays(region)}`);
      if (!response.ok) throw new Error('Failed to load stores');

      const data = await response.json();
      const storeList = data.data || [];
      setStores(storeList);
    } catch (err) {
      signalerErreur('Error loading stores:', err);
    } finally {
      setLoading(false);
    }
  }, [region]);

  const loadNearbyStores = useCallback(async (lat: number, lng: number) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/client/stores/nearby?latitude=${lat}&longitude=${lng}&maxDistance=10`);
      if (!response.ok) throw new Error('Failed to load nearby stores');

      const data = await response.json();
      const storeList = data.data || [];
      setStores(storeList);
    } catch (err) {
      signalerErreur('Error loading nearby stores:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Les restaurants proches de l'adresse, ou tous faute de coordonnées. */
  const chargerPour = useCallback(
    (choisie: AdresseLivraison | null) => {
      if (choisie?.latitude != null && choisie?.longitude != null) {
        loadNearbyStores(choisie.latitude, choisie.longitude);
      } else {
        loadStores();
      }
    },
    [loadNearbyStores, loadStores]
  );

  // L'adresse enregistrée lors d'une visite précédente sert d'emblée ; sans
  // elle, on ouvre directement la saisie.
  const stockageLu = adresseEnregistree !== undefined;
  useEffectChargement(() => {
    if (stockageLu) chargerPour(lireAdresseLivraison());
  }, [stockageLu, chargerPour]);

  const basculerFiltre = (filtre: Filtre) =>
    setFiltres((actuels) => {
      const suivants = new Set(actuels);
      if (suivants.has(filtre)) suivants.delete(filtre);
      else suivants.add(filtre);
      return suivants;
    });

  const effacerFiltres = () => {
    setFiltres(new Set());
    setFamilleChoisie(null);
  };

  const filteredStores = useMemo(() => {
    // Copie : trier `stores` en place modifiait l'état sans que React le sache.
    let filtered = familleChoisie
      ? stores.filter((store) => store.famille === familleChoisie)
      : [...stores];

    if (filtres.has('livraisonOfferte')) filtered = filtered.filter(livraisonOfferte);
    if (filtres.has('mieuxNotes')) filtered = filtered.filter(bienNote);
    if (filtres.has('ouvert')) filtered = filtered.filter((store) => store.isOpenNow !== false);

    if (sortBy === 'rating') {
      filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortBy === 'distance') {
      filtered.sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));
    } else if (sortBy === 'delivery') {
      filtered.sort((a, b) => fraisDe(a) - fraisDe(b));
    }

    // Quel que soit le tri, celles qui livrent à l'adresse passent devant
    // celles où l'on ne peut que retirer sur place, et les ouvertes devant
    // les fermées (tri stable).
    filtered.sort((a, b) => Number(livrable(b)) - Number(livrable(a)));
    filtered.sort((a, b) => Number(b.isOpenNow !== false) - Number(a.isOpenNow !== false));

    return filtered;
  }, [stores, sortBy, familleChoisie, filtres]);

  /**
   * Les rangées mises en avant, seulement sur la vue d'ensemble : un client
   * qui filtre veut une liste, pas des vitrines. Une rangée de deux
   * commerces n'apporte rien : il en faut au moins trois.
   */
  const vueDEnsemble = !familleChoisie && filtres.size === 0;
  const rangees = useMemo(() => {
    if (!vueDEnsemble || stores.length < 4) return [];
    const ouverts = stores.filter((store) => store.isOpenNow !== false && livrable(store));
    const liste = [
      {
        cle: 'mieuxNotes',
        titre: t('sectionTopRated'),
        commerces: ouverts.filter(bienNote).sort((a, b) => (b.rating || 0) - (a.rating || 0)),
      },
      {
        cle: 'livraisonOfferte',
        titre: t('sectionFreeDelivery'),
        commerces: ouverts.filter(livraisonOfferte),
      },
      {
        cle: 'rapides',
        titre: t('sectionFastest'),
        commerces: ouverts
          .filter((store) => minutesDe(store) != null)
          .sort((a, b) => (minutesDe(a) ?? 0) - (minutesDe(b) ?? 0)),
      },
    ];
    return liste
      .map((rangee) => ({ ...rangee, commerces: rangee.commerces.slice(0, 10) }))
      .filter((rangee) => rangee.commerces.length >= 3);
  }, [vueDEnsemble, stores, t]);

  const carte = (store: Store, enRangee = false) => (
    <CarteCommerce
      key={store.id}
      store={store}
      favori={favoris.has(store.id)}
      onFavori={(e) => basculerFavori(e, store.id)}
      enRangee={enRangee}
    />
  );

  const filtresRapides: { cle: Filtre; libelle: string; icone: typeof Tag }[] = [
    { cle: 'livraisonOfferte', libelle: t('filterFreeDelivery'), icone: Tag },
    { cle: 'mieuxNotes', libelle: t('filterTopRated'), icone: Star },
    { cle: 'ouvert', libelle: t('filterOpenNow'), icone: Clock },
  ];

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <title>{`${t('titreOnglet')} — ZupEat`}</title>

      <section className="relative isolate overflow-hidden bg-[#150D08] text-white">
        <ImageNext src="/images/zupeat/home-hero.webp" alt="" fill priority sizes="100vw" className="-z-20 object-cover object-[68%_center]" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-black/95 via-black/75 to-black/10" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-transparent to-black/25" />
        <div className="mx-auto max-w-7xl px-5 pb-8 pt-10 sm:px-8 sm:pb-9 sm:pt-14 lg:px-10 lg:pt-16">
          <div className="max-w-2xl">
            <p className="text-xs font-extrabold uppercase tracking-[.14em] text-[#FF7A00] sm:text-sm">{t('heroEyebrow')}</p>
            <h1 className="mt-3 text-[2.7rem] font-black leading-[.99] tracking-[-.055em] text-white sm:text-5xl md:text-6xl">
              <span className="block">{t('heroTitleLead')}</span>
              <span className="block text-[#FF7A00]">{t('heroTitleAccent')}</span>
              <span className="block">{t('heroTitleEnd')}</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/85 sm:text-base sm:leading-7">{t('heroSubtitle')}</p>
            <p className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-white/80 sm:text-sm">
              <Check size={16} className="rounded-full bg-[#FF7A00] p-0.5 text-black" aria-hidden="true" />{t('heroOrderWithoutAccount')}
            </p>
            <div className="mt-5 flex max-w-2xl flex-col gap-2 rounded-full bg-white p-1.5 shadow-[0_12px_35px_rgba(0,0,0,.3)] sm:flex-row sm:items-center">
              <RechercheAdresseLivraison
                adresse={adresse}
                onChange={(choisie) => {
                  setAdresse(choisie);
                  chargerPour(choisie);
                }}
                className="mb-0 min-h-12 flex-1 rounded-full border-0 bg-white px-4 py-3 text-gray-900 transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]"
              />
              <Link href="#commerces" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#FF5A00] px-6 text-sm font-bold text-white transition hover:bg-[#E64D00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2">{t('heroAction')} <ArrowRight size={17} aria-hidden="true" /></Link>
            </div>
            <Link href="/restaurants" className="mt-3 inline-flex rounded-sm text-xs font-semibold text-white/80 underline underline-offset-4 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] sm:text-sm">{t('seeAll')}</Link>
          </div>

          <ul aria-label={t('heroBenefitsLabel')} className="mt-7 grid max-w-4xl grid-cols-2 gap-x-5 gap-y-4 border-t border-white/20 pt-5 sm:grid-cols-4 sm:gap-4">
            {[
              { icon: Bike, title: t('benefitDelivery'), text: t('benefitDeliveryText') },
              { icon: Store, title: t('benefitPickup'), text: t('benefitPickupText') },
              { icon: CreditCard, title: t('benefitPayment'), text: t('benefitPaymentText') },
              { icon: Heart, title: t('benefitLocal'), text: t('benefitLocalText') },
            ].map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-center gap-2.5 text-white">
                <Icon size={21} strokeWidth={1.8} className="shrink-0 text-[#FF7A00]" aria-hidden="true" />
                <span><span className="block text-xs font-bold">{title}</span><span className="mt-0.5 block text-[10px] leading-4 text-white/65">{text}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pt-6 md:px-6 md:pt-8">
        {/* Catégories interactives : elles filtrent la liste réelle des commerces. */}
        {familles.length > 0 && (
          <nav aria-label={t('categories')} className="relative mt-0 rounded-2xl border border-gray-100 bg-white px-2 py-3 shadow-[0_8px_30px_rgba(15,23,42,.07)] sm:px-4">
            {/* Un fondu sous la flèche : les catégories y glissent au lieu de
                buter contre elle. */}
            <div className="hidden md:flex absolute inset-y-0 left-0 z-10 w-16 items-center justify-start pointer-events-none bg-linear-to-r from-white via-white/90 to-transparent">
              <button
                type="button"
                onClick={() => defiler(-1)}
                aria-label={t('previous')}
                className="pointer-events-auto w-9 h-9 flex items-center justify-center rounded-full bg-white text-gray-900 shadow-md ring-1 ring-gray-200 hover:bg-gray-50"
              >
                <ChevronLeft size={20} />
              </button>
            </div>
            <ul
              ref={rangee}
              className="flex gap-1 md:gap-2 pb-1 md:px-10 overflow-x-auto scroll-smooth scrollbar-none [&::-webkit-scrollbar]:hidden"
            >
              {familles.map((famille) => {
                const choisie = familleChoisie === famille.code;
                return (
                  <li key={famille.code}>
                    <button
                      type="button"
                      aria-pressed={choisie}
                      title={famille.libelle}
                      onClick={() => setFamilleChoisie(choisie ? null : famille.code)}
                      className={`group w-[4.5rem] shrink-0 flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] ${choisie ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex size-12 items-center justify-center rounded-full text-[1.7rem] leading-none transition ${
                          choisie
                          ? 'bg-[#FF7A00] shadow-sm'
                            : 'bg-gray-100 group-hover:bg-orange-50'
                        }`}
                      >
                        {famille.emoji}
                      </span>
                      <span
                        className={`w-full px-1 truncate text-center text-[11px] ${
                          choisie ? 'font-bold text-gray-900' : 'font-medium text-gray-700'
                        }`}
                      >
                        {famille.libelle}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="hidden md:flex absolute inset-y-0 right-0 z-10 w-16 items-center justify-end pointer-events-none bg-linear-to-l from-white via-white/90 to-transparent">
              <button
                type="button"
                onClick={() => defiler(1)}
                aria-label={t('next')}
                className="pointer-events-auto w-9 h-9 flex items-center justify-center rounded-full bg-white text-gray-900 shadow-md ring-1 ring-gray-200 hover:bg-gray-50"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </nav>
        )}

        {/* Les filtres rapides et le tri, en pastilles. */}
        <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none [&::-webkit-scrollbar]:hidden">
          {filtresRapides.map(({ cle, libelle, icone: Icone }) => {
            const actif = filtres.has(cle);
            return (
              <button
                key={cle}
                type="button"
                aria-pressed={actif}
                onClick={() => basculerFiltre(cle)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  actif ? 'bg-[#FF7A00] text-black' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
              >
                <Icone size={15} className={actif && cle === 'mieuxNotes' ? 'fill-white' : ''} />
                {libelle}
              </button>
            );
          })}

          <label className="relative shrink-0">
            <span className="sr-only">{t('sortByRating')}</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="appearance-none cursor-pointer rounded-full bg-gray-100 py-2 pl-4 pr-9 text-sm font-semibold text-gray-900 hover:bg-gray-200 focus:outline-hidden focus:ring-2 focus:ring-orange-500"
            >
              <option value="rating">{t('sortByRating')}</option>
              <option value="distance">{t('sortByDistance')}</option>
              <option value="delivery">{t('sortByDelivery')}</option>
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
          </label>

          {(filtres.size > 0 || familleChoisie) && (
            <button
              type="button"
              onClick={effacerFiltres}
              className="shrink-0 px-3 py-2 text-sm font-semibold text-orange-600 hover:text-orange-700"
            >
              {t('resetFilters')}
            </button>
          )}
        </div>
      </div>

        <div id="commerces" className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-10">
        {loading ? (
          <GrilleEnChargement />
        ) : filteredStores.length === 0 ? (
          <div className="mx-auto max-w-md rounded-3xl bg-gray-50 px-6 py-14 text-center">
            <Search size={40} className="mx-auto mb-4 text-gray-300" />
            {familleChoisie || filtres.size > 0 ? (
              <>
                <p className="text-lg font-semibold">
                  {familleChoisie && filtres.size === 0 ? t('emptyCategory') : t('emptyFilters')}
                </p>
                <button
                  type="button"
                  onClick={effacerFiltres}
                  className="mt-5 rounded-full bg-gray-900 px-6 py-3 text-sm font-semibold text-white hover:bg-gray-800"
                >
                  {t('seeAll')}
                </button>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">{t('noRestaurantsFound')}</p>
                <p className="mt-1 text-gray-500">{t('tryAnotherAddress')}</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-12">
            {rangees.map((rangee) => (
              <Rangee key={rangee.cle} titre={rangee.titre} precedent={t('previous')} suivant={t('next')}>
                {rangee.commerces.map((store) => carte(store, true))}
              </Rangee>
            ))}

            <section>
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                    {familleChoisie
                      ? familles.find((famille) => famille.code === familleChoisie)?.libelle
                      : adresse?.latitude != null
                        ? t('nearbyRestaurants')
                        : t('allRestaurants')}{' '}
                    <span className="text-sm font-medium text-gray-400">({filteredStores.length})</span>
                  </h2>
                  {adresse && <p className="mt-1 text-xs text-gray-500">{t('deliveryAddressHeading', { address: adresse.label })}</p>}
                </div>
                <Link href="/restaurants" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#D94B00] underline underline-offset-4 transition hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] sm:text-sm">{t('seeAll')}<ArrowRight size={14} aria-hidden="true" /></Link>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4 lg:gap-x-5 xl:grid-cols-6">
                {filteredStores.map((store) => carte(store))}
              </div>
            </section>
          </div>
        )}
      </div>
      <section id="comment-ca-marche" className="mx-auto mt-4 max-w-7xl scroll-mt-20 px-5 py-10 md:px-8 md:py-14">
        <div className="rounded-[1.75rem] bg-[#FFF2E9] px-5 py-7 sm:px-8 md:py-9">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#D94B00]">{t('howEyebrow')}</p>
          <h2 className="mt-2 text-2xl font-black tracking-[-.045em] sm:text-3xl md:text-4xl">{t('howTitle')}</h2>
          <div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
            {[1, 2, 3, 4].map((numero) => {
              const Icone = [MapPin, Store, CreditCard, Bike][numero - 1];
              return <article key={numero} className="relative flex items-start gap-3 lg:gap-2">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#FF5A00] text-sm font-black text-white">{numero}</span>
                <div className="min-w-0">
                  <Icone className="mb-2 size-7 text-[#E94F00]" strokeWidth={2} aria-hidden="true" />
                  <h3 className="text-sm font-extrabold tracking-tight sm:text-base">{t(`howStep${numero}Title`)}</h3>
                  <p className="mt-1 text-xs leading-5 text-neutral-700">{t(`howStep${numero}Description`)}</p>
                </div>
              </article>;
            })}
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-3 px-5 pb-10 md:grid-cols-3 md:px-8 md:pb-14">
        {[
          { href: '/restaurants', image: '/images/zupeat/consumer.webp', title: 'partnerCustomerTitle', description: 'partnerCustomerDescription' },
          { href: '/devenir-commercant', image: '/images/zupeat/merchant.webp', title: 'partnerMerchantTitle', description: 'partnerMerchantDescription' },
          { href: '/devenir-livreur', image: '/images/zupeat/courier.webp', title: 'partnerDriverTitle', description: 'partnerDriverDescription' },
        ].map((carte) => <Link key={carte.href} href={carte.href} className="group relative min-h-64 overflow-hidden rounded-2xl bg-neutral-900 p-6 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] focus-visible:ring-offset-2 md:p-7">
          <img src={carte.image} alt="" className="absolute inset-0 size-full object-cover opacity-55 transition duration-500 group-hover:scale-[1.03] group-hover:opacity-65" loading="lazy" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
          <div className="relative max-w-sm">
            <h2 className="text-xl font-black leading-tight tracking-tight md:text-2xl">{t(carte.title)}</h2>
            <p className="mt-3 text-sm leading-5 text-white/90">{t(carte.description)}</p>
            <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#FF5A00] px-4 py-2.5 text-xs font-bold text-white">{t('partnerAction')} <ArrowRight size={15} aria-hidden="true" /></span>
          </div>
        </Link>)}
      </section>
      <section className="mx-auto max-w-7xl px-5 pb-12 md:px-8 md:pb-16">
        <div className="relative isolate flex min-h-44 flex-col justify-center overflow-hidden rounded-[1.75rem] bg-[#FFF2E9] px-6 py-7 sm:px-9 md:flex-row md:items-center md:justify-between">
          <div className="max-w-lg">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[#D94B00]">ZupEat</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-.04em] sm:text-3xl">{t('mobileTitle')}</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-700">{t('mobileDescription')}</p>
            <Link href="#commerces" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#FF5A00] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#D94B00]">{t('heroAction')}<ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-12 hidden h-72 w-36 rotate-[-8deg] rounded-[2.2rem] border-[7px] border-[#171717] bg-white p-2 shadow-2xl md:block">
            <div className="h-full overflow-hidden rounded-[1.6rem] bg-[#FFF8F3]">
              <div className="flex items-center justify-between px-3 py-4 text-[10px] font-black text-gray-900"><span>Zup<span className="text-[#FF5A00]">Eat</span></span><ShoppingBag size={13} className="text-[#FF5A00]" /></div>
              <img src="/images/zupeat/home-hero.webp" alt="" className="h-24 w-full object-cover" loading="lazy" />
              <div className="space-y-2 p-2"><span className="block h-2 w-3/4 rounded bg-neutral-200"/><span className="block h-2 w-full rounded bg-neutral-100"/><div className="mt-3 rounded-lg bg-white p-2 shadow-sm"><span className="block h-12 rounded bg-[#FFEEE2]"/><span className="mt-2 block h-2 w-4/5 rounded bg-neutral-200"/></div></div>
            </div>
          </div>
        </div>
      </section>
      {stores.some((store) => (store.totalRatings || 0) > 0 && store.rating != null) && <section className="bg-neutral-50 py-12 md:py-16"><div className="mx-auto max-w-7xl px-5 md:px-8"><p className="text-sm font-bold uppercase tracking-[.16em] text-[#A94F00]">{t('reviewsEyebrow')}</p><h2 className="mt-2 text-3xl font-black tracking-[-.045em]">{t('reviewsTitle')}</h2><p className="mt-2 max-w-2xl text-sm text-neutral-600">{t('reviewsDescription')}</p><div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{stores.filter((store) => (store.totalRatings || 0) > 0 && store.rating != null).sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 3).map((store) => <Link key={store.id} href={`/store/${store.slug}`} className="rounded-3xl bg-white p-6 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]"><div className="flex items-center gap-2 text-lg font-black"><Star className="size-5 fill-[#FF7A00] text-[#FF7A00]"/>{note(store.rating!)}<span className="text-xs font-medium text-neutral-500">({store.totalRatings} {t('reviews')}</span></div><h3 className="mt-3 font-bold">{store.name}</h3><p className="mt-1 text-sm text-neutral-600">{store.genreLibelle || t('localShop')}</p></Link>)}</div></div></section>}
    </div>
  );
}

/** Une rangée qui défile horizontalement, avec ses flèches sur grand écran. */
function Rangee({
  titre,
  precedent,
  suivant,
  children,
}: {
  titre: string;
  precedent: string;
  suivant: string;
  children: React.ReactNode;
}) {
  const liste = useRef<HTMLDivElement>(null);
  const defiler = (sens: 1 | -1) =>
    liste.current?.scrollBy({ left: sens * liste.current.clientWidth * 0.8, behavior: 'smooth' });

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold tracking-tight">{titre}</h2>
        <div className="hidden md:flex gap-2">
          <button
            type="button"
            onClick={() => defiler(-1)}
            aria-label={precedent}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={() => defiler(1)}
            aria-label={suivant}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      <div
        ref={liste}
        className="-mx-4 flex snap-x snap-mandatory scroll-pl-4 md:scroll-pl-0 gap-5 overflow-x-auto scroll-smooth px-4 pb-2 md:mx-0 md:px-0 scrollbar-none [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </section>
  );
}

/**
 * La carte d'un commerce : une grande vignette, le nom, la note, puis une
 * ligne d'infos (frais, délai, distance). Toute la carte mène à la vitrine.
 */
function CarteCommerce({
  store,
  favori,
  onFavori,
  enRangee,
}: {
  store: Store;
  favori: boolean;
  onFavori: (e: React.MouseEvent) => void;
  enRangee: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations('clientHome');
  const ferme = store.isOpenNow === false;
  const minutes = minutesDe(store);
  const delai = minutes != null ? t('minutes', { n: minutes }) : store.estimatedDeliveryTime;
  const nouveau = !store.totalRatings;

  // Les frais jusqu'à l'adresse retenue ; à défaut, le forfait de la boutique.
  let frais: React.ReactNode = null;
  if (store.livraison) {
    frais = store.livraison.livrable
      ? store.livraison.frais > 0
        ? t('deliveryFeeShort', { montant: euro(store.livraison.frais) })
        : null
      : <span className="text-amber-600">{t('pickupOnly')}</span>;
  } else if (store.deliveryCost) {
    frais = t('deliveryFeeShort', { montant: euro(store.deliveryCost) });
  }

  const infos = [
    store.genreLibelle,
    frais,
    delai,
    store.distance ? t('distance', { km: store.distance.toLocaleString(locale) }) : null,
  ].filter(Boolean);

  return (
    <Link
      href={`/store/${store.slug}`}
      className={`group block rounded-2xl text-gray-900 hover:text-gray-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-4 ${
        enRangee ? 'w-[78%] sm:w-[300px] shrink-0 snap-start' : ''
      }`}
    >
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-gray-100">
        {/* La photo de couverture du commerçant ; à défaut, l'illustration de
            sa catégorie (une pizza pour une pizzeria). Le logo se pose en
            pastille ; sans logo, l'emoji de la catégorie le remplace sur une
            photo, et l'illustration se suffit à elle-même. */}
        {store.settings?.banner ? (
          <img
            src={store.settings.banner}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <img src={visuelDeCommerce(store.famille).src} alt={visuelDeCommerce(store.famille).alt} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
        )}
        {(store.settings?.logo || store.settings?.banner) && (
          <div className="absolute bottom-3 left-3">
            {store.settings?.logo ? (
              <img
                src={store.settings.logo}
                alt={store.name}
                className="h-12 w-12 rounded-xl bg-white object-contain p-1 shadow-md"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-2xl shadow-md"
              >
                {visuelDeFamille(store.famille).emoji}
              </span>
            )}
          </div>
        )}

        {/* Ce qui fait cliquer : la livraison offerte, en étiquette. */}
        {!ferme && livraisonOfferte(store) && (
                <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-[#FF7A00] px-2.5 py-1 text-xs font-bold text-black shadow-sm">
            <Bike size={13} />
            {t('filterFreeDelivery')}
          </span>
        )}

        <button
          type="button"
          onClick={onFavori}
          aria-pressed={favori}
          aria-label={favori ? t('removeFavorite') : t('addFavorite')}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-sm transition hover:scale-110"
        >
          <Heart size={18} className={favori ? 'fill-red-500 text-red-500' : 'text-gray-900'} />
        </button>

        {/* Une boutique fermée disparaissait de la liste : le client croyait
            le commerce parti. Elle reste, voilée. */}
        {ferme && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/55">
            <span className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-gray-900">
              {store.isOpen === false ? t('temporarilyUnavailable') : t('closedNow')}
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <h3 className="min-w-0 truncate text-base font-semibold">{store.name}</h3>
        {store.totalRatings && store.rating != null ? (
          <span
            className="flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-sm font-semibold"
            title={`${store.totalRatings} ${t('reviews')}`}
          >
            {note(store.rating)}
            <Star size={13} className="fill-gray-900" />
            <span className="font-normal text-gray-500">({store.totalRatings})</span>
          </span>
        ) : (
          nouveau && (
            <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">
              {t('newStore')}
            </span>
          )
        )}
      </div>
      {infos.length > 0 && (
        <p className="mt-0.5 truncate text-sm text-gray-500">
          {infos.map((info, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              {info}
            </span>
          ))}
        </p>
      )}
    </Link>
  );
}

/** Des cartes grises en attendant les commerces : la page ne saute pas. */
function GrilleEnChargement() {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4 lg:gap-x-5 xl:grid-cols-6" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-video rounded-2xl bg-gray-100" />
          <div className="mt-3 h-4 w-2/3 rounded-sm bg-gray-100" />
          <div className="mt-2 h-3 w-1/2 rounded-sm bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

