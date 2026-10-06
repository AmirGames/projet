'use client';

import { useCallback, useState } from 'react';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCurrentStore } from '@/lib/current-store';
import { lienVersEspace } from '@/lib/domaines';
import { ExternalLink, PackageX, Wallet } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { euro, montantCommercant } from '@/lib/format';
import { numeroCourt } from '@/lib/numero-commande';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Les commandes qui demandent encore quelque chose à la cuisine. */
const STATUTS_EN_COURS = 'PENDING,ACCEPTED,PREPARING,READY';

interface Jour {
  /** « 2026-10-02 », jour de Bruxelles. */
  jour: string;
  commandes: number;
  chiffreAffaires: number;
}

interface CommandeEnCours {
  id: string;
  customerName: string;
  status: string;
  deliveryType: string;
  totalAmount: number | string;
  feesAmount?: number | string;
  serviceFeeAmount?: number | string;
  items: { quantity: number; product: { name: string } }[];
}

interface ProduitEpuise {
  id: string;
  name: string;
  isAvailable: boolean;
}

interface Releve {
  id: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: string;
}

const pastilleDeStatut: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-900',
  ACCEPTED: 'bg-sky-100 text-sky-900',
  PREPARING: 'bg-orange-100 text-orange-900',
  READY: 'bg-green-100 text-green-900',
};

/** « 2 oct. » ou « 27 sept. – 3 oct. ». */
const jourCourt = (date: string) =>
  new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Brussels' });

/**
 * Le tableau de bord du commerce : ce qui demande une action aujourd'hui.
 *
 * Les chiffres viennent des statistiques du serveur, jour par jour à l'heure
 * de Bruxelles ; une commande refusée n'y est pas une vente. Le seul geste
 * possible d'ici, remettre un plat en vente, passe par la route de
 * disponibilité du catalogue, qui vérifie l'appartenance au commerce.
 */
export default function MerchantDashboard() {
  const t = useTranslations('merchantDashboard');
  const tStatut = useTranslations('merchantOrders.statusLabel');
  const params = useParams();
  const router = useRouter();
  const orgId = params?.orgId as string;

  const { storeId, currentStore, stores, loading: storesLoading } = useCurrentStore();

  const [jours, setJours] = useState<Jour[]>([]);
  const [enCours, setEnCours] = useState<CommandeEnCours[]>([]);
  const [epuises, setEpuises] = useState<ProduitEpuise[]>([]);
  const [releve, setReleve] = useState<Releve | null>(null);
  const [remiseEnVente, setRemiseEnVente] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // silencieux : une relecture en direct ne remplace pas la page par
  // « Chargement… » à chaque commande qui arrive.
  const fetchDashboardData = useCallback(
    async (silencieux = false) => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        router.push('/login');
        return;
      }
      if (!storeId) {
        setLoading(false);
        return;
      }

      const auth = { Authorization: `Bearer ${token}` };
      if (!silencieux) setLoading(true);
      setError('');

      try {
        const [statsRes, enCoursRes, produitsRes, relevesRes] = await Promise.all([
          fetch(`${API_URL}/api/order-management/${storeId}/stats/overview?days=7`, { headers: auth }),
          fetch(`${API_URL}/api/order-management/${storeId}?status=${STATUTS_EN_COURS}&take=6`, { headers: auth }),
          fetch(`${API_URL}/api/products?storeId=${storeId}&limit=300`, { headers: auth }),
          fetch(`${API_URL}/api/merchant-payouts?orgId=${orgId}`, { headers: auth }),
        ]);

        if (!statsRes.ok) throw new Error('stats');

        setJours((await statsRes.json()).parJour || []);
        setEnCours(enCoursRes.ok ? (await enCoursRes.json()).data || [] : []);
        setEpuises(
          produitsRes.ok
            ? ((await produitsRes.json()).products || []).filter((p: ProduitEpuise) => !p.isAvailable)
            : []
        );
        // Un employé sans accès aux relevés voit simplement la carte vide.
        setReleve(relevesRes.ok ? ((await relevesRes.json()).data || [])[0] || null : null);
      } catch {
        setError(t('loadError'));
      } finally {
        setLoading(false);
      }
    },
    [orgId, storeId, router, t]
  );

  useEffectChargement(() => {
    // On attend la liste des boutiques pour charger directement la bonne.
    if (orgId && !storesLoading) fetchDashboardData();
  }, [orgId, storesLoading, fetchDashboardData]);

  // Les chiffres suivent les commandes et le catalogue en direct.
  useDonneesModifiees(['orders', 'products', 'organizations'], () => fetchDashboardData(true), {
    orgId,
    storeId,
    actif: Boolean(orgId && !storesLoading),
  });

  const remettreEnVente = async (produit: ProduitEpuise) => {
    setRemiseEnVente(produit.id);
    try {
      const reponse = await fetch(`${API_URL}/api/products/${produit.id}/availability`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({ isAvailable: true, storeId }),
      });
      if (!reponse.ok) throw new Error();
      setEpuises((liste) => liste.filter((p) => p.id !== produit.id));
    } catch {
      setError(t('restockError'));
    } finally {
      setRemiseEnVente(null);
    }
  };

  if (loading) return <div className="py-8 text-center text-gray-500">{t('loading')}</div>;

  if (!storeId) {
    return (
      <div className="mx-auto max-w-md rounded-[18px] border border-[#ECECEA] bg-white p-8 text-center">
        <p className="font-bold">{t('storeEmpty')}</p>
        <Link
          href="/merchant"
          className="mt-4 inline-block rounded-full bg-orange-600 px-5 py-2.5 text-sm font-extrabold text-white hover:bg-orange-700"
        >
          {t('createStore')}
        </Link>
      </div>
    );
  }

  const aujourdhui = jours[jours.length - 1] || { jour: '', commandes: 0, chiffreAffaires: 0 };
  const semaine = jours.reduce((somme, j) => somme + j.chiffreAffaires, 0);
  const plusHaut = Math.max(...jours.map((j) => j.chiffreAffaires), 1);

  const chiffres = [
    { libelle: t('kpiSalesToday'), valeur: euro(aujourdhui.chiffreAffaires) },
    { libelle: t('kpiOrdersToday'), valeur: String(aujourdhui.commandes) },
    {
      libelle: t('kpiAverageToday'),
      valeur: euro(aujourdhui.commandes ? aujourdhui.chiffreAffaires / aujourdhui.commandes : 0),
    },
    { libelle: t('kpiInProgress'), valeur: String(enCours.length), lien: `/merchant/${orgId}/orders` },
  ];

  const carte = 'rounded-[18px] border border-[#ECECEA] bg-white';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-500 first-letter:uppercase">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight">{currentStore?.name}</h1>
          {stores.length > 1 && <p className="mt-1 text-sm text-gray-500">{t('changeSwitcher')}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/merchant/${orgId}/store-hours`}
            className={`rounded-full px-3 py-1.5 text-sm font-bold ${
              currentStore?.isOpen ? 'bg-green-50 text-green-800' : 'bg-gray-100 text-gray-600'
            }`}
          >
            <span
              className={`mr-1.5 inline-block h-2 w-2 rounded-full ${currentStore?.isOpen ? 'bg-green-600' : 'bg-gray-400'}`}
              aria-hidden="true"
            />
            {currentStore?.isOpen ? t('storeOpen') : t('storeClosed')}
          </Link>
          {currentStore?.slug && (
            <a
              href={lienVersEspace('public', `/store/${currentStore.slug}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-bold text-gray-900 hover:border-gray-400"
            >
              {t('seeStorefront')} <ExternalLink size={14} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {chiffres.map((chiffre) => {
          const contenu = (
            <>
              <p className="text-sm font-semibold text-gray-500">{chiffre.libelle}</p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums sm:text-3xl">{chiffre.valeur}</p>
            </>
          );
          return chiffre.lien ? (
            <Link key={chiffre.libelle} href={chiffre.lien} className={`${carte} p-5 text-gray-900 hover:border-gray-300`}>
              {contenu}
            </Link>
          ) : (
            <div key={chiffre.libelle} className={`${carte} p-5`}>
              {contenu}
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className={`${carte} p-6`} aria-labelledby="titre-semaine">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="titre-semaine" className="text-lg font-extrabold">
              {t('weekTitle')}
            </h2>
            <p className="text-sm text-gray-500">
              {t('weekTotal')} <b className="tabular-nums text-gray-900">{euro(semaine)}</b>
            </p>
          </div>
          {/* Une barre par jour ; aujourd'hui en orange. Le montant exact est écrit au-dessus. */}
          <div className="mt-6 flex h-48 items-end gap-2 sm:gap-3">
            {jours.map((j, index) => {
              const estAujourdhui = index === jours.length - 1;
              return (
                <div key={j.jour} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="text-[11px] font-bold tabular-nums text-gray-500">
                    {j.chiffreAffaires > 0 ? euro(j.chiffreAffaires, 0) : ''}
                  </span>
                  <div
                    className={`w-full rounded-t-lg rounded-b ${estAujourdhui ? 'bg-orange-600' : 'bg-orange-200'}`}
                    style={{ height: `${Math.max(3, (j.chiffreAffaires / plusHaut) * 100)}%` }}
                    title={`${jourCourt(j.jour)} : ${euro(j.chiffreAffaires)}, ${j.commandes} commande(s)`}
                  />
                  <span className={`text-xs ${estAujourdhui ? 'font-extrabold text-gray-900' : 'font-semibold text-gray-500'}`}>
                    {estAujourdhui
                      ? t('today')
                      : new Date(j.jour).toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' })}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <section className={`${carte} p-6`} aria-labelledby="titre-epuises">
            <h2 id="titre-epuises" className="flex items-center gap-2 text-lg font-extrabold">
              <PackageX size={18} className="text-orange-600" aria-hidden="true" />
              {t('soldOutTitle')}
            </h2>
            {epuises.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">{t('soldOutNone')}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {epuises.slice(0, 4).map((produit) => (
                  <li key={produit.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-semibold">{produit.name}</span>
                    <button
                      type="button"
                      onClick={() => remettreEnVente(produit)}
                      disabled={remiseEnVente === produit.id}
                      className="shrink-0 rounded-full border border-gray-200 px-3 py-1 text-xs font-bold hover:border-gray-900 disabled:opacity-40"
                    >
                      {t('restock')}
                    </button>
                  </li>
                ))}
                {epuises.length > 4 && (
                  <li>
                    <Link href={`/merchant/${orgId}/products`} className="text-xs font-bold text-gray-500 hover:text-orange-600">
                      {t('soldOutMore', { count: epuises.length - 4 })}
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </section>

          <Link href={`/merchant/${orgId}/payouts`} className={`${carte} block p-6 text-gray-900 hover:border-gray-300`}>
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              <Wallet size={18} className="text-orange-600" aria-hidden="true" />
              {t('payoutTitle')}
            </h2>
            {releve ? (
              <>
                <p className="mt-2 text-2xl font-extrabold tabular-nums">{euro(releve.amount)}</p>
                <p className="mt-1 text-sm text-gray-500">
                  {t('payoutPeriod', { debut: jourCourt(releve.periodStart), fin: jourCourt(releve.periodEnd) })} ·{' '}
                  {t(`payoutStatus.${releve.status}` as any)}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-gray-500">{t('payoutNone')}</p>
            )}
          </Link>
        </div>
      </div>

      <section className={`${carte} overflow-hidden`} aria-labelledby="titre-en-cours">
        <div className="flex items-center justify-between gap-2 px-6 py-4">
          <h2 id="titre-en-cours" className="text-lg font-extrabold">
            {t('inProgressTitle')}
          </h2>
          <Link href={`/merchant/${orgId}/orders`} className="text-sm font-bold text-gray-900 hover:text-orange-600">
            {t('inProgressAll')}
          </Link>
        </div>
        {enCours.length === 0 ? (
          <p className="border-t border-gray-100 px-6 py-5 text-sm text-gray-500">{t('inProgressNone')}</p>
        ) : (
          <ul>
            {enCours.map((commande) => (
              <li key={commande.id} className="border-t border-gray-100">
                <Link
                  href={`/merchant/${orgId}/orders/${commande.id}`}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-6 py-3 text-sm text-gray-900 hover:bg-gray-50 sm:grid-cols-[7rem_minmax(0,1fr)_auto_6rem]"
                >
                  <b className="tabular-nums">{numeroCourt(commande.id)}</b>
                  <span className="min-w-0 truncate text-gray-600">
                    {commande.customerName} ·{' '}
                    {commande.items.map((ligne) => `${ligne.quantity} × ${ligne.product.name}`).join(', ')}
                  </span>
                  <span className={`justify-self-start rounded-full px-2.5 py-0.5 text-xs font-bold ${pastilleDeStatut[commande.status] || ''}`}>
                    {tStatut(commande.status as any)}
                  </span>
                  <b className="col-span-3 tabular-nums sm:col-span-1 sm:text-right">{euro(montantCommercant(commande))}</b>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
