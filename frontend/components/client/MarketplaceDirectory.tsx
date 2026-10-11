'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bike, Clock3, Search, Star, Store as StoreIcon, X } from 'lucide-react';
import { filtrePays } from '@/i18n/regions';
import { useRegion } from '@/lib/region-context';
import { visuelDeCommerce } from '@/lib/visuel-commerce';

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
  isOpenNow?: boolean;
  famille?: string | null;
  genreLibelle?: string | null;
  settings?: { banner?: string | null; logo?: string | null } | null;
}

interface Famille { code: string; libelle: string; emoji?: string }

export function MarketplaceDirectory() {
  const region = useRegion();
  const [commerces, setCommerces] = useState<Commerce[]>([]);
  const [familles, setFamilles] = useState<Famille[]>([]);
  const [recherche, setRecherche] = useState('');
  const [famille, setFamille] = useState('');
  const [ouvertsSeulement, setOuvertsSeulement] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    const controleur = new AbortController();
    fetch(`${API_URL}/api/client/stores${filtrePays(region)}`, { signal: controleur.signal })
      .then(async (reponse) => {
        if (!reponse.ok) throw new Error('Chargement des boutiques impossible');
        const donnees = await reponse.json();
        setErreur(false);
        setCommerces(Array.isArray(donnees?.data) ? donnees.data : []);
      })
      .catch(() => { if (!controleur.signal.aborted) setErreur(true); })
      .finally(() => { if (!controleur.signal.aborted) setChargement(false); });
    return () => controleur.abort();
  }, [region]);

  useEffect(() => {
    const controleur = new AbortController();
    fetch(`${API_URL}/api/stores/types`, { signal: controleur.signal })
      .then((reponse) => reponse.ok ? reponse.json() : null)
      .then((donnees) => setFamilles(Array.isArray(donnees?.data?.familles) ? donnees.data.familles : []))
      .catch(() => undefined);
    return () => controleur.abort();
  }, []);

  const resultat = useMemo(() => {
    const terme = recherche.trim().toLocaleLowerCase('fr');
    return commerces.filter((commerce) => {
      const correspondCategorie = !famille || commerce.famille === famille;
      const correspondRecherche = !terme || [commerce.name, commerce.city, commerce.genreLibelle, commerce.description]
        .filter(Boolean).join(' ').toLocaleLowerCase('fr').includes(terme);
      return correspondCategorie && correspondRecherche && (!ouvertsSeulement || commerce.isOpenNow !== false);
    });
  }, [commerces, famille, recherche, ouvertsSeulement]);

  return (
    <main className="min-h-[65vh] bg-white text-black">
      <section className="bg-[#FFF6EC]">
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
          <p className="text-sm font-bold uppercase tracking-[.16em] text-[#A94F00]">Vos commerces de quartier</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-[-.055em] sm:text-5xl md:text-6xl">Les bonnes adresses, tout près de vous.</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-neutral-650">Parcourez les boutiques disponibles dans votre région et trouvez votre prochain coup de cœur.</p>
          <label className="mt-8 flex max-w-2xl items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-2 shadow-sm focus-within:ring-2 focus-within:ring-[#FF7A00]">
            <Search aria-hidden="true" className="size-5 shrink-0 text-neutral-500" />
            <span className="sr-only">Rechercher une boutique</span>
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Boulangerie, fleurs, pizza…" className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-neutral-500" />
            {recherche && <button type="button" onClick={() => setRecherche('')} aria-label="Effacer la recherche" className="rounded-full p-2 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]"><X className="size-4" /></button>}
          </label>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-12" aria-labelledby="boutiques-title">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div><h2 id="boutiques-title" className="text-2xl font-black tracking-tight">Toutes les boutiques</h2><p className="mt-1 text-sm text-neutral-600">{chargement ? 'Chargement des commerces…' : `${resultat.length} ${resultat.length === 1 ? 'commerce disponible' : 'commerces disponibles'}`}</p></div>
          <label className="inline-flex min-h-11 items-center gap-3 self-start rounded-full border border-neutral-200 px-4 text-sm font-semibold sm:self-auto">
            <input type="checkbox" checked={ouvertsSeulement} onChange={(e) => setOuvertsSeulement(e.target.checked)} className="size-4 accent-[#FF7A00] focus-visible:ring-2 focus-visible:ring-[#FF7A00]" />
            Ouverts maintenant
          </label>
        </div>

        {familles.length > 0 && <div className="mt-7 flex gap-2 overflow-x-auto pb-2" aria-label="Filtrer par catégorie">
          <button type="button" aria-pressed={!famille} onClick={() => setFamille('')} className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] ${!famille ? 'bg-[#FF7A00] text-black' : 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200'}`}>Tout voir</button>
          {familles.map((item) => <button key={item.code} type="button" aria-pressed={famille === item.code} onClick={() => setFamille(famille === item.code ? '' : item.code)} className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] ${famille === item.code ? 'bg-[#FF7A00] text-black' : 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200'}`}>{item.emoji ? `${item.emoji} ` : ''}{item.libelle}</button>)}
        </div>}

        {erreur ? <div role="alert" className="mt-10 rounded-3xl bg-neutral-50 p-8 text-center"><StoreIcon className="mx-auto size-8 text-neutral-400" /><p className="mt-3 font-semibold">Les commerces n’ont pas pu être chargés.</p><p className="mt-1 text-sm text-neutral-600">Réessayez dans quelques instants.</p></div>
          : chargement ? <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} aria-hidden="true" className="animate-pulse"><div className="aspect-[1.65] rounded-3xl bg-neutral-100" /><div className="mt-3 h-5 w-2/3 rounded bg-neutral-100" /><div className="mt-2 h-4 w-1/2 rounded bg-neutral-100" /></div>)}</div>
          : resultat.length === 0 ? <div className="mt-10 rounded-3xl bg-neutral-50 px-6 py-16 text-center"><Search className="mx-auto size-8 text-neutral-400" /><p className="mt-3 font-semibold">Aucune boutique ne correspond à votre recherche.</p><button type="button" onClick={() => { setRecherche(''); setFamille(''); setOuvertsSeulement(false); }} className="mt-4 rounded-full bg-black px-5 py-3 text-sm font-bold text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]">Réinitialiser les filtres</button></div>
            : <div className="mt-8 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{resultat.map((commerce) => {
              const visuel = visuelDeCommerce(commerce.famille);
              return <Link key={commerce.id} href={`/store/${commerce.slug}`} className="group rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] focus-visible:ring-offset-4">
                <div className="relative aspect-[1.65] overflow-hidden rounded-3xl bg-neutral-100"><img src={commerce.settings?.banner || visuel.src} alt={commerce.settings?.banner ? `Vitrine de ${commerce.name}` : visuel.alt} className="size-full object-cover transition duration-500 group-hover:scale-[1.04]" loading="lazy" />{commerce.isOpenNow === false && <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-neutral-800">Fermé actuellement</span>}</div>
                <div className="mt-3 flex items-start justify-between gap-3"><h3 className="truncate text-lg font-bold tracking-tight">{commerce.name}</h3>{commerce.rating != null && (commerce.totalRatings || 0) > 0 && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-neutral-100 px-2 py-1 text-xs font-bold"><Star aria-hidden="true" className="size-3 fill-current" />{commerce.rating.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</span>}</div>
                <p className="mt-1 truncate text-sm text-neutral-600">{[commerce.genreLibelle, commerce.city].filter(Boolean).join(' · ') || 'Commerce de proximité'}</p>
                {commerce.estimatedDeliveryTime && <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-700"><Clock3 className="size-3.5" />{commerce.estimatedDeliveryTime}<Bike aria-hidden="true" className="ml-1 size-3.5" />Livraison</p>}
              </Link>;
            })}</div>}
      </section>
    </main>
  );
}
