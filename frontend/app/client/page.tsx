'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { filtrePays } from '@/i18n/regions';
import { useRegion } from '@/lib/region-context';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Star, Heart, ChevronLeft, ChevronRight, ChevronDown, Search, Check, Bike, Clock, Tag } from 'lucide-react';

import { ChoixAdresseLivraison } from '@/components/ChoixAdresseLivraison';
import {
  lireAdresseLivraison,
  useAdresseLivraisonEnregistree,
  type AdresseLivraison,
} from '@/lib/adresseLivraison';

import { euro } from '@/lib/format';
import { useEffectChargement } from '@/lib/use-effect-chargement';

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
  settings?: { logo?: string | null } | null;
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

/**
 * Le fond de la vignette d'un commerce. Les boutiques n'ont pas (encore) de
 * photo de couverture : un aplat doux, toujours le même pour une boutique
 * donnée, met son logo en valeur sans que la liste ressemble à un damier.
 */
const FONDS = [
  'bg-orange-100',
  'bg-rose-100',
  'bg-amber-100',
  'bg-lime-100',
  'bg-sky-100',
  'bg-violet-100',
  'bg-emerald-100',
  'bg-red-100',
];
const fondDe = (store: Store) => {
  let somme = 0;
  for (const lettre of store.id) somme = (somme + lettre.charCodeAt(0)) % 997;
  return FONDS[somme % FONDS.length];
};

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
    const token = localStorage.getItem('accessToken');
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
    const token = localStorage.getItem('accessToken');
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
      emoji={familles.find((famille) => famille.code === store.famille)?.emoji}
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
      <title>Accueil client — ZupEat</title>

      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4 md:pt-6">
        {/* L'accroche : un grand aplat chaleureux, et l'adresse au centre du
            jeu — sans elle, ni frais ni délais justes. */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-orange-600 to-red-600 px-6 py-10 md:px-12 md:py-14 text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 hidden select-none lg:grid grid-cols-3 gap-x-10 gap-y-8 text-7xl rotate-6"
          >
            <span className="drop-shadow-xl">🍕</span>
            <span className="drop-shadow-xl">🍔</span>
            <span className="drop-shadow-xl">🥗</span>
            <span className="drop-shadow-xl">🍣</span>
            <span className="drop-shadow-xl">🥐</span>
            <span className="drop-shadow-xl">🌮</span>
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-white/10" />

          <div className="relative max-w-2xl">
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">{t('heroTitle')}</h1>
            <p className="mt-4 text-lg md:text-xl text-orange-50/90">{t('heroSubtitle')}</p>

            {/* Adresse de livraison — une fois retenue, elle se résume à une
                pastille qu'on touche pour la changer. */}
            <div className="mt-8 flex flex-col md:flex-row md:items-start gap-3">
              <ChoixAdresseLivraison
                adresse={adresse}
                saisieOuverteSansAdresse
                onChange={(choisie) => {
                  setAdresse(choisie);
                  chargerPour(choisie);
                }}
              />
            </div>

            <p className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-white/90">
              <Check size={16} className="rounded-full bg-white/20 p-0.5" />
              {t('heroOrderWithoutAccount')}
            </p>
          </div>
        </section>

        {/* Les catégories, à la manière des grandes plateformes : une rangée
            qui défile, un clic filtre, un second clic annule. */}
        {familles.length > 0 && (
          <nav aria-label={t('categories')} className="relative mt-8">
            {/* Un fondu sous la flèche : les catégories y glissent au lieu de
                buter contre elle. */}
            <div className="hidden md:flex absolute inset-y-0 left-0 z-10 w-16 items-center justify-start pointer-events-none bg-gradient-to-r from-white via-white/90 to-transparent">
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
              className="flex gap-1 md:gap-3 pb-2 md:px-10 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                      className="group w-20 flex-shrink-0 flex flex-col items-center gap-2 py-1"
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-16 w-16 items-center justify-center rounded-full text-3xl leading-none transition ${
                          choisie
                            ? 'bg-orange-100 ring-2 ring-orange-500 scale-105'
                            : 'bg-gray-100 group-hover:bg-orange-50 group-hover:scale-105'
                        }`}
                      >
                        {famille.emoji}
                      </span>
                      <span
                        className={`w-full px-1 truncate text-center text-xs ${
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
            <div className="hidden md:flex absolute inset-y-0 right-0 z-10 w-16 items-center justify-end pointer-events-none bg-gradient-to-l from-white via-white/90 to-transparent">
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
        <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filtresRapides.map(({ cle, libelle, icone: Icone }) => {
            const actif = filtres.has(cle);
            return (
              <button
                key={cle}
                type="button"
                aria-pressed={actif}
                onClick={() => basculerFiltre(cle)}
                className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  actif ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
              >
                <Icone size={15} className={actif && cle === 'mieuxNotes' ? 'fill-white' : ''} />
                {libelle}
              </button>
            );
          })}

          <label className="relative flex-shrink-0">
            <span className="sr-only">{t('sortByRating')}</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="appearance-none cursor-pointer rounded-full bg-gray-100 py-2 pl-4 pr-9 text-sm font-semibold text-gray-900 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
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
              className="flex-shrink-0 px-3 py-2 text-sm font-semibold text-orange-600 hover:text-orange-700"
            >
              {t('resetFilters')}
            </button>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-10">
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
              <h2 className="mb-5 text-2xl font-bold tracking-tight">
                {familleChoisie
                  ? familles.find((famille) => famille.code === familleChoisie)?.libelle
                  : adresse?.latitude != null
                    ? t('nearbyRestaurants')
                    : t('allRestaurants')}{' '}
                <span className="font-medium text-gray-400">({filteredStores.length})</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-8">
                {filteredStores.map((store) => carte(store))}
              </div>
            </section>
          </div>
        )}
      </div>
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
        className="-mx-4 flex snap-x snap-mandatory scroll-pl-4 md:scroll-pl-0 gap-5 overflow-x-auto scroll-smooth px-4 pb-2 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
  emoji,
  favori,
  onFavori,
  enRangee,
}: {
  store: Store;
  emoji?: string;
  favori: boolean;
  onFavori: (e: React.MouseEvent) => void;
  enRangee: boolean;
}) {
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
    store.distance ? t('distance', { km: store.distance.toLocaleString('fr-FR') }) : null,
  ].filter(Boolean);

  return (
    <Link
      href={`/store/${store.slug}`}
      className={`group block rounded-2xl text-gray-900 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-4 ${
        enRangee ? 'w-[78%] sm:w-[300px] flex-shrink-0 snap-start' : ''
      }`}
    >
      <div className={`relative aspect-[16/9] overflow-hidden rounded-2xl ${fondDe(store)}`}>
        {/* Le motif de la famille, en filigrane, puis le logo en majesté. */}
        {emoji && (
          <span
            aria-hidden="true"
            className="absolute -right-3 -bottom-5 select-none text-[7rem] leading-none opacity-30 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6"
          >
            {emoji}
          </span>
        )}
        <div className="absolute inset-0 flex items-center justify-center transition-transform duration-500 group-hover:scale-105">
          {store.settings?.logo ? (
            <img
              src={store.settings.logo}
              alt={store.name}
              className="h-20 w-20 md:h-24 md:w-24 rounded-2xl bg-white object-contain p-2 shadow-lg"
            />
          ) : (
            <span className="flex h-20 w-20 md:h-24 md:w-24 items-center justify-center rounded-2xl bg-white text-4xl font-extrabold text-orange-600 shadow-lg">
              {store.name.charAt(0)}
            </span>
          )}
        </div>

        {/* Ce qui fait cliquer : la livraison offerte, en étiquette. */}
        {!ferme && livraisonOfferte(store) && (
          <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-green-600 px-2.5 py-1 text-xs font-bold text-white shadow">
            <Bike size={13} />
            {t('filterFreeDelivery')}
          </span>
        )}

        <button
          type="button"
          onClick={onFavori}
          aria-pressed={favori}
          aria-label={favori ? t('removeFavorite') : t('addFavorite')}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow transition hover:scale-110"
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
            className="flex flex-shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-sm font-semibold"
            title={`${store.totalRatings} ${t('reviews')}`}
          >
            {note(store.rating)}
            <Star size={13} className="fill-gray-900" />
            <span className="font-normal text-gray-500">({store.totalRatings})</span>
          </span>
        ) : (
          nouveau && (
            <span className="flex-shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-8" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[16/9] rounded-2xl bg-gray-100" />
          <div className="mt-3 h-4 w-2/3 rounded bg-gray-100" />
          <div className="mt-2 h-3 w-1/2 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}
