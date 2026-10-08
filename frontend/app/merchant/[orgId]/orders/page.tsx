'use client';

import { signalerErreur } from '@/lib/erreurs';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import Link from 'next/link';

import { useCurrentStore } from '@/lib/current-store';
import { CarteCommandeCuisine, type CommandeCuisine } from '@/components/CarteCommandeCuisine';
import { numeroCourt } from '@/lib/numero-commande';
import { EVENEMENT_COMMANDES_CHANGEES } from '@/lib/reponse-commande';
import { useDonneesModifiees } from '@/lib/temps-reel';

import { euro, montantCommercant, sommeEuros } from '@/lib/format';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Order extends CommandeCuisine {
  customerEmail: string;
  rejectionReason?: string | null;
}

type OrderStatus = 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'REJECTED' | 'READY' | 'COMPLETED';

/** Les commandes qui demandent encore quelque chose à la cuisine. */
const STATUTS_EN_COURS = 'PENDING,ACCEPTED,PREPARING,READY';

const pastilleDeStatut: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-900',
  ACCEPTED: 'bg-sky-100 text-sky-900',
  PREPARING: 'bg-orange-100 text-orange-900',
  READY: 'bg-green-100 text-green-900',
  COMPLETED: 'bg-gray-100 text-gray-700',
  REJECTED: 'bg-red-100 text-red-800',
};

/** Explique au commerçant pourquoi aucun livreur n'est listé. */
function expliquerAbsence(
  d: { total: number; actifs: number; enLigne: number; libres: number; localises: number; plusProcheKm: number | null } | undefined,
  rayon: number | undefined,
  t: (cle: string, valeurs?: Record<string, string | number>) => string
): string | null {
  if (!d) return null;
  if (d.total === 0) return t('absence.aucunInscrit');
  if (d.actifs === 0) return t('absence.aucunValide', { n: d.total });
  if (d.enLigne === 0) return t('absence.aucunEnLigne');
  if (d.libres === 0) return t('absence.tousEnCourse', { n: d.enLigne });
  if (d.localises === 0) return t('absence.aucunePosition', { n: d.libres });
  if (d.plusProcheKm != null) return t('absence.tropLoin', { km: d.plusProcheKm.toFixed(1), rayon: rayon ?? '?' });
  return null;
}

/**
 * Les commandes du commerce.
 *
 * « En cours » est l'écran de cuisine : trois colonnes, de la commande à
 * accepter à la commande prête, chacune avec son action suivante. Rien n'est
 * décidé ici : chaque bouton appelle le serveur, qui vérifie l'appartenance au
 * commerce et la transition, puis la liste se relit.
 *
 * « Historique » garde toutes les commandes, filtrables, avec les chiffres.
 */
export default function OrdersPage() {
  const locale = useLocale();
  const t = useTranslations('merchantOrders');
  const tMotif = useTranslations('motifsRefus');
  const tc = useTranslations('merchantOrders.cuisine');
  const { storeId } = useCurrentStore();
  const params = useParams();
  const router = useRouter();
  const orgId = params?.orgId as string;

  const [vue, setVue] = useState<'enCours' | 'historique'>('enCours');
  const [enCours, setEnCours] = useState<Order[]>([]);
  const [duJour, setDuJour] = useState<Order[]>([]);
  const [recherche, setRecherche] = useState('');
  const [maintenant, setMaintenant] = useState(() => Date.now());

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<any>(null);
  const [useOwnDelivery, setUseOwnDelivery] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState<string | null>(null);
  const [availableDeliveryMen, setAvailableDeliveryMen] = useState<any[]>([]);
  const [driversDiagnostic, setDriversDiagnostic] = useState<string | null>(null);
  const [dispatchMessage, setDispatchMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loadingDeliveryMen, setLoadingDeliveryMen] = useState(false);

  const itemsPerPage = 20;

  const jeton = useCallback(() => {
    const valeur = localStorage.getItem('accessToken') || localStorage.getItem('token');
    if (!valeur) router.push('/login');
    return valeur;
  }, [router]);

  // Les commandes à traiter, et celles du jour pour le total des terminées.
  const fetchEnCours = useCallback(async () => {
    const token = jeton();
    if (!token) return;

    try {
      const [reponse, reponseDuJour] = await Promise.all([
        fetch(`${API_URL}/api/order-management/${storeId}?status=${STATUTS_EN_COURS}&take=100`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/order-management/${storeId}/today`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!reponse.ok) throw new Error('Failed to fetch orders');

      const donnees = await reponse.json();
      setEnCours(donnees.data || []);

      if (reponseDuJour.ok) {
        const jour = await reponseDuJour.json();
        setDuJour(jour.orders || []);
      }
    } catch (error) {
      signalerErreur('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }, [jeton, storeId]);

  const fetchOrders = useCallback(async () => {
    const token = jeton();
    if (!token) return;

    try {
      const query = new URLSearchParams({
        skip: String(page * itemsPerPage),
        take: String(itemsPerPage),
        ...(filter !== 'ALL' && { status: filter }),
      });

      const response = await fetch(`${API_URL}/api/order-management/${storeId}?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch orders');

      const data = await response.json();
      setOrders(data.data || []);
      setTotal(data.total || 0);
    } catch (error) {
      signalerErreur('Error fetching orders:', error);
    }
  }, [filter, page, jeton, storeId]);

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');

      const response = await fetch(`${API_URL}/api/order-management/${storeId}/stats/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch stats');

      setStats(await response.json());
    } catch (error) {
      signalerErreur('Error fetching stats:', error);
    }
  }, [storeId]);

  const relire = useCallback(() => {
    fetchEnCours();
    fetchOrders();
    fetchStats();
  }, [fetchEnCours, fetchOrders, fetchStats]);

  // Ailleurs aussi : un collègue, le livreur, le client, une annulation
  // automatique. La liste suit sans qu'on recharge.
  useDonneesModifiees('orders', relire, { storeId, actif: Boolean(storeId) });

  const fetchDeliverySettings = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${API_URL}/api/store-settings/${storeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) return;

      const data = await response.json();
      setUseOwnDelivery(data.settings?.delivery?.useOwnDelivery || false);
    } catch (error) {
      signalerErreur('Error fetching delivery settings:', error);
    }
  }, [storeId]);

  useEffectChargement(() => {
    if (storeId) {
      fetchEnCours();
      fetchStats();
      fetchDeliverySettings();
    }
  }, [storeId, fetchEnCours, fetchStats, fetchDeliverySettings]);

  // L'historique ne se charge que s'il est ouvert, et à chaque filtre ou page.
  useEffectChargement(() => {
    if (storeId && vue === 'historique') fetchOrders();
  }, [storeId, vue, fetchOrders]);

  // Une commande arrive, ou quelqu'un y répond : la liste se relit seule.
  useEffect(() => {
    if (!storeId) return;
    window.addEventListener(EVENEMENT_COMMANDES_CHANGEES, relire);
    return () => window.removeEventListener(EVENEMENT_COMMANDES_CHANGEES, relire);
  }, [storeId, relire]);

  // Les « il y a 4 min » et « prête dans 6 min » avancent tout seuls.
  useEffect(() => {
    const minuteur = setInterval(() => setMaintenant(Date.now()), 20000);
    return () => clearInterval(minuteur);
  }, []);

  const handleCallDelivery = async (orderId: string) => {
    try {
      setLoadingDeliveryMen(true);
      setShowDeliveryModal(orderId);
      setDispatchMessage(null);
      setDriversDiagnostic(null);
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      if (!token) return;

      // Récupérer la liste des livreurs disponibles (rayon réglé par la plateforme)
      const response = await fetch(`${API_URL}/api/drivers/available?storeId=${storeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || data?.message || t('erreurStatut', { statut: response.status }));
      }

      setAvailableDeliveryMen(data.deliveryMen || []);
      if ((data.deliveryMen || []).length === 0) {
        setDriversDiagnostic(expliquerAbsence(data.diagnostic, data.radiusKm, t));
      }
    } catch (error) {
      signalerErreur('Error fetching available drivers:', error);
      setAvailableDeliveryMen([]);
      setDriversDiagnostic(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingDeliveryMen(false);
    }
  };

  const handleSelectDriver = async (driverId: string | null, orderId: string) => {
    try {
      setDispatchMessage(null);
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      if (!token) return;

      // Proposer la course au livreur sélectionné (ou au plus proche si aucun
      // n'est désigné, ou s'il n'est plus éligible).
      const response = await fetch(`${API_URL}/api/orders/${orderId}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(driverId ? { driverId } : {}),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setDispatchMessage({ ok: false, text: data?.error || data?.message || t('courseNonProposee') });
        return;
      }

      if (data?.data?.propose === false && !data?.data?.driverId) {
        // Personne n'a reçu la course : le dire au lieu de fermer la fenêtre
        // comme si tout s'était bien passé.
        setDispatchMessage({ ok: false, text: data.message });
        return;
      }

      setShowDeliveryModal(null);
      relire();
    } catch (error) {
      signalerErreur('Error selecting driver:', error);
      setDispatchMessage({ ok: false, text: t('injoignable') });
    }
  };

  // La recherche porte sur le numéro et le nom du client des commandes en cours.
  const visibles = useMemo(() => {
    const cherche = recherche.trim().toLowerCase().replace(/^#/, '');
    if (!cherche) return enCours;
    return enCours.filter(
      (c) => c.id.toLowerCase().startsWith(cherche) || c.customerName.toLowerCase().includes(cherche)
    );
  }, [enCours, recherche]);

  // Les plus anciennes d'abord : c'est l'ordre dans lequel la cuisine travaille.
  const parAnciennete = (a: Order, b: Order) =>
    new Date(a.submittedAt || a.createdAt).getTime() - new Date(b.submittedAt || b.createdAt).getTime();

  const colonnes = [
    {
      cle: 'aAccepter',
      pastille: 'bg-amber-500',
      compteur: 'bg-amber-100 text-amber-900',
      commandes: visibles.filter((c) => c.status === 'PENDING').sort(parAnciennete),
      vide: tc('videAAccepter'),
    },
    {
      cle: 'enPreparation',
      pastille: 'bg-orange-600',
      compteur: 'bg-orange-100 text-orange-900',
      commandes: visibles.filter((c) => c.status === 'ACCEPTED' || c.status === 'PREPARING').sort(parAnciennete),
      vide: tc('videEnPreparation'),
    },
    {
      cle: 'pretes',
      pastille: 'bg-green-600',
      compteur: 'bg-green-100 text-green-900',
      commandes: visibles.filter((c) => c.status === 'READY').sort(parAnciennete),
      vide: tc('videPretes'),
    },
  ];

  const terminees = duJour.filter((c) => c.status === 'COMPLETED');
  const totalPages = Math.ceil(total / itemsPerPage);

  // Qui livre cette commande : figé à la commande, sinon le réglage du commerce.
  const parLaPlateforme = (c: Order) => (c.deliveryMode ? c.deliveryMode === 'PLATFORM' : !useOwnDelivery);

  return (
    // La page passe au thème clair de la maquette ; elle recouvre la marge du
    // cadre pour que le fond aille d'un bord à l'autre.
    <div className="-m-6 min-h-[calc(100vh-4.5rem)] bg-[#F7F7F6] text-gray-900">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#ECECEA] bg-white px-6 py-4 lg:px-8">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <div role="tablist" aria-label={t('title')} className="flex gap-1 rounded-full bg-gray-100 p-1">
          {(['enCours', 'historique'] as const).map((cle) => (
            <button
              key={cle}
              type="button"
              role="tab"
              aria-selected={vue === cle}
              onClick={() => setVue(cle)}
              className={`rounded-full px-4 py-1.5 text-sm transition ${
                vue === cle ? 'bg-white font-bold shadow-xs' : 'font-semibold text-gray-600 hover:text-gray-900'
              }`}
            >
              {tc(cle)}
            </button>
          ))}
        </div>
        {vue === 'enCours' && (
          <label className="ml-auto flex w-full items-center gap-2 rounded-full bg-gray-100 px-4 py-2 sm:w-72">
            <Search size={16} className="shrink-0 text-gray-500" aria-hidden="true" />
            <span className="sr-only">{tc('rechercher')}</span>
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder={tc('rechercher')}
              className="w-full bg-transparent text-sm outline-hidden placeholder:text-gray-500"
            />
          </label>
        )}
      </div>

      {vue === 'enCours' ? (
        loading ? (
          <div className="flex h-96 items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-b-2 border-orange-600" />
              <p className="text-gray-500">{t('loading')}</p>
            </div>
          </div>
        ) : (
          <div className="grid items-start gap-5 px-6 pb-10 pt-6 lg:grid-cols-3 lg:px-8">
            {colonnes.map((colonne) => (
              <section key={colonne.cle} aria-labelledby={`colonne-${colonne.cle}`} className="flex flex-col gap-3">
                <div className="flex items-center gap-2 px-1">
                  <span className={`h-2.5 w-2.5 rounded-full ${colonne.pastille}`} aria-hidden="true" />
                  <h2 id={`colonne-${colonne.cle}`} className="text-base font-extrabold">
                    {tc(colonne.cle)}
                  </h2>
                  <span className={`rounded-full px-2 text-xs font-extrabold tabular-nums ${colonne.compteur}`}>
                    {colonne.commandes.length}
                  </span>
                </div>

                {colonne.commandes.length === 0 ? (
                  <p className="rounded-[18px] border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                    {colonne.vide}
                  </p>
                ) : (
                  colonne.commandes.map((commande) => (
                    <CarteCommandeCuisine
                      key={commande.id}
                      storeId={storeId as string}
                      orgId={orgId}
                      commande={commande}
                      maintenant={maintenant}
                      livreurDeLaPlateforme={parLaPlateforme(commande)}
                      surChangement={relire}
                      surChoisirLivreur={handleCallDelivery}
                    />
                  ))
                )}

                {colonne.cle === 'pretes' && (
                  <div className="flex justify-between rounded-[18px] border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">
                    <span>{tc('termineesAujourdhui')}</span>
                    <b className="tabular-nums text-gray-900">
                      {terminees.length} · {euro(sommeEuros(terminees, montantCommercant))}
                    </b>
                  </div>
                )}
              </section>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-6 px-6 pb-10 pt-6 lg:px-8">
          {stats && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
              {[
                { libelle: t('statsTotal'), valeur: stats.totalOrders },
                { libelle: t('statsPending'), valeur: stats.pending },
                { libelle: t('statsAccepted'), valeur: stats.accepted },
                { libelle: t('statusLabel.PREPARING'), valeur: stats.preparing || 0 },
                { libelle: t('statsReady'), valeur: stats.ready },
                { libelle: t('statsCompleted'), valeur: stats.completed },
              ].map((chiffre) => (
                <div key={chiffre.libelle} className="rounded-[18px] border border-[#ECECEA] bg-white p-4">
                  <p className="mb-1 text-xs font-semibold text-gray-500">{chiffre.libelle}</p>
                  <p className="text-2xl font-extrabold tabular-nums">{chiffre.valeur}</p>
                </div>
              ))}
              <div className="rounded-[18px] border border-[#ECECEA] bg-white p-4">
                <p className="mb-1 text-xs font-semibold text-gray-500">{t('statsRevenue')}</p>
                <p className="text-2xl font-extrabold tabular-nums">{euro(stats.totalRevenue, 0)}</p>
                {/* Ce que le commerçant a encaissé pour les livreurs de la
                    plateforme : hors de son chiffre, à reverser avec la commission. */}
                {stats.platformDeliveryFees > 0 && (
                  <p className="mt-1 text-xs text-amber-800">
                    {tc('livraisonAReverser', { montant: euro(stats.platformDeliveryFees) })}
                  </p>
                )}
                {stats.platformServiceFees > 0 && (
                  <p className="mt-1 text-xs text-amber-800">
                    {tc('fraisAReverser', { montant: euro(stats.platformServiceFees) })}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {(['ALL', 'PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'REJECTED'] as const).map((status) => (
              <button
                key={status}
                type="button"
                aria-pressed={filter === status}
                onClick={() => {
                  setFilter(status);
                  setPage(0);
                }}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  filter === status
                    ? 'bg-gray-900 text-white'
                    : 'border border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                {status === 'ALL' ? t('filterAll') : t(`statusLabel.${status}`)}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-[18px] border border-[#ECECEA] bg-white">
            {orders.length === 0 ? (
              <p className="p-8 text-center text-gray-500">{t('empty')}</p>
            ) : (
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                    <th className="px-5 py-3">{tc('colonneNumero')}</th>
                    <th className="px-5 py-3">{t('date')}</th>
                    <th className="px-5 py-3">{tc('colonneClient')}</th>
                    <th className="px-5 py-3">{t('status')}</th>
                    <th className="px-5 py-3 text-right">{t('amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <Link
                          href={`/merchant/${orgId}/orders/${order.id}`}
                          className="font-extrabold tabular-nums text-gray-900 hover:text-orange-600"
                        >
                          {numeroCourt(order.id)}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-gray-500">
                        {new Date(order.createdAt).toLocaleString(locale, {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-semibold">{order.customerName}</span>
                        <span className="block text-xs text-gray-500">
                          {order.items.length}{' '}
                          {order.items.length > 1 ? t('orderItems_plural') : t('orderItems_singular')}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${pastilleDeStatut[order.status] || ''}`}>
                          {t(`statusLabel.${order.status}`)}
                        </span>
                        {order.status === 'REJECTED' && order.rejectionReason && (
                          <span className="mt-1 block text-xs text-gray-500">
                            {tMotif.has(`commercant.${order.rejectionReason}`) ? tMotif(`commercant.${order.rejectionReason}`) : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-bold tabular-nums">
                        {euro(montantCommercant(order))}
                        {/* Il livre lui-même : la livraison est à lui, mais à part. */}
                        {order.deliveryMode === 'OWN' && Number(order.feesAmount) > 0 && (
                          <span className="block text-xs font-normal text-gray-500">
                            {tc('plusLivraison', { montant: euro(order.feesAmount) })}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-[18px] border border-[#ECECEA] bg-white px-5 py-3">
              <p className="text-sm text-gray-500">{t('paginationPage', { page: page + 1, totalPages })}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="rounded-full border border-gray-200 px-4 py-2 text-sm font-bold hover:bg-gray-50 disabled:opacity-40"
                >
                  {t('paginationPrev')}
                </button>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page === totalPages - 1}
                  className="rounded-full border border-gray-200 px-4 py-2 text-sm font-bold hover:bg-gray-50 disabled:opacity-40"
                >
                  {t('paginationNext')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showDeliveryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titre-livreurs"
            className="w-full max-w-md rounded-3xl bg-white text-gray-900 shadow-2xl"
          >
            <div className="border-b border-gray-100 p-6">
              <h2 id="titre-livreurs" className="text-xl font-extrabold">
                {tc('livreursDisponibles')}
              </h2>
              <p className="mt-1 text-sm text-gray-500">{tc('livreursAProximite')}</p>
            </div>

            <div className="p-6">
              {loadingDeliveryMen ? (
                <div className="py-8 text-center">
                  <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-orange-600" />
                  <p className="text-sm text-gray-500">{tc('rechercheLivreur')}</p>
                </div>
              ) : availableDeliveryMen.length === 0 ? (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-red-50 p-4 text-center">
                    <p className="text-sm font-bold text-red-800">{tc('aucunLivreur')}</p>
                    {driversDiagnostic && <p className="mt-2 text-xs text-gray-600">{driversDiagnostic}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectDriver(null, showDeliveryModal)}
                    className="w-full rounded-full bg-gray-900 px-4 py-3 text-sm font-extrabold text-white hover:bg-black"
                  >
                    {tc('relancerRecherche')}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableDeliveryMen.map((delivery) => (
                    <button
                      key={delivery.id}
                      type="button"
                      onClick={() => handleSelectDriver(delivery.id, showDeliveryModal)}
                      className="w-full rounded-2xl border border-gray-200 p-3 text-left transition hover:border-gray-900"
                    >
                      <p className="font-bold">{delivery.name}</p>
                      <p className="text-xs text-gray-500">{delivery.phone}</p>
                      <p className="mt-1 text-xs font-bold text-green-700">
                        {tc('distance', { km: delivery.distance?.toFixed(1) ?? '?' })}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {dispatchMessage && (
              <p className={`px-6 pb-2 text-sm ${dispatchMessage.ok ? 'text-green-700' : 'text-amber-800'}`}>
                {dispatchMessage.text}
              </p>
            )}

            <div className="flex justify-end border-t border-gray-100 p-6">
              <button
                type="button"
                onClick={() => {
                  setShowDeliveryModal(null);
                  setDispatchMessage(null);
                }}
                className="rounded-full border border-gray-200 px-5 py-2.5 text-sm font-bold hover:bg-gray-50"
              >
                {tc('fermer')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
