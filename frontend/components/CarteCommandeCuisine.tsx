'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Phone, Search, Truck } from 'lucide-react';

import { euro, montantCommercant } from '@/lib/format';
import { numeroCourt } from '@/lib/numero-commande';
import {
  MOTIFS_DU_COMMERCANT,
  TEMPS_DE_PREPARATION,
  EVENEMENT_COMMANDES_CHANGEES,
  accepterCommande,
  refuserCommande,
  avancerCommande,
  heure,
  type MotifDeRefus,
} from '@/lib/reponse-commande';

/** Une commande telle que la liste du commerçant la reçoit. */
export interface CommandeCuisine {
  id: string;
  customerName: string;
  customerPhone?: string | null;
  totalAmount: number | string;
  feesAmount?: number | string;
  serviceFeeAmount?: number | string;
  status: string;
  paymentStatus: string;
  paymentMethodName?: string | null;
  deliveryType: string;
  /** Qui livre, figé à la commande : OWN (le commerçant) ou PLATFORM. */
  deliveryMode?: 'OWN' | 'PLATFORM' | null;
  createdAt: string;
  submittedAt?: string | null;
  pickupTime?: string | null;
  /** L'heure limite pour répondre, tant que la commande est en attente. */
  echeance?: string | null;
  estimatedReadyAt?: string | null;
  preparationMinutes?: number | null;
  items: {
    id: string;
    quantity: number;
    product: { name: string };
    variant?: { label: string } | null;
  }[];
  delivery?: {
    status: string;
    driverId?: string | null;
    driver?: { name?: string | null } | null;
    /** Un livreur qui termine sa livraison a réservé la course : elle démarre dès qu'il est libre. */
    reservee?: boolean;
  } | null;
}


/** Les minutes écoulées (positives) ou restantes (négatives) depuis une date. */
function minutesDepuis(date: string, maintenant: number) {
  return Math.floor((maintenant - new Date(date).getTime()) / 60000);
}

/**
 * Une commande, sur l'écran de cuisine du commerçant.
 *
 * Elle porte l'action suivante, et une seule mise en avant : accepter (avec le
 * temps de préparation), lancer la préparation, la marquer prête, la remettre.
 * Les règles restent celles du serveur : la carte n'appelle que les routes
 * d'acceptation, de refus et de changement d'état, qui vérifient tout.
 */
export function CarteCommandeCuisine({
  storeId,
  orgId,
  commande,
  maintenant,
  livreurDeLaPlateforme,
  surChangement,
  surChoisirLivreur,
}: {
  storeId: string;
  orgId: string;
  commande: CommandeCuisine;
  /** L'heure de l'écran, avancée par la page pour toutes les cartes à la fois. */
  maintenant: number;
  /** La course part chez un livreur de la plateforme (et non du commerce). */
  livreurDeLaPlateforme: boolean;
  surChangement: () => void;
  surChoisirLivreur: (orderId: string) => void;
}) {
  const t = useTranslations('merchantOrders.cuisine');
  const [preparation, setPreparation] = useState(20);
  const [refus, setRefus] = useState(false);
  const [motif, setMotif] = useState<MotifDeRefus | ''>('');
  const [note, setNote] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const enAttente = commande.status === 'PENDING';
  const livraison = commande.deliveryType === 'DELIVERY';

  const agir = async (action: () => Promise<unknown>) => {
    setEnvoi(true);
    setErreur('');

    try {
      await action();
      setRefus(false);
      setMotif('');
      setNote('');
      surChangement();
      // La sonnerie et les autres écrans se remettent à jour.
      window.dispatchEvent(new Event(EVENEMENT_COMMANDES_CHANGEES));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : t('actionImpossible'));
    } finally {
      setEnvoi(false);
    }
  };

  const depuis = minutesDepuis(commande.submittedAt || commande.createdAt, maintenant);

  // Le temps qu'il reste avant l'heure annoncée au client, ou le retard pris.
  const restant = commande.estimatedReadyAt ? -minutesDepuis(commande.estimatedReadyAt, maintenant) : null;
  const avancement =
    restant !== null && commande.preparationMinutes
      ? Math.min(100, Math.max(4, 100 - (restant / commande.preparationMinutes) * 100))
      : null;

  const mode = livraison
    ? t('livraison')
    : commande.pickupTime
      ? t('retraitA', { heure: heure(commande.pickupTime) })
      : t('retrait');

  const paiement =
    commande.paymentStatus === 'SUCCEEDED'
      ? t('payeeEnLigne')
      : commande.paymentMethodName === 'CASH'
        ? t('aEncaisserEspeces')
        : t('aEncaisser');

  const bordure = enAttente
    ? 'border-2 border-amber-400 shadow-[0_8px_24px_-14px_rgba(217,119,6,.6)]'
    : 'border border-[#ECECEA]';

  const boutonSecondaire =
    'rounded-full border border-gray-200 bg-white px-4 py-3 text-sm font-bold transition hover:bg-gray-50 disabled:opacity-40';
  const boutonPrincipal =
    'rounded-full px-4 py-3 text-sm font-extrabold text-white transition disabled:opacity-50';

  // L'étape suivante de la commande acceptée, avec son libellé.
  const suite =
    commande.status === 'ACCEPTED'
      ? { statut: 'PREPARING', libelle: t('lancerPreparation') }
      : commande.status === 'PREPARING'
        ? { statut: 'READY', libelle: t('marquerPrete') }
        : commande.status === 'READY'
          ? { statut: 'COMPLETED', libelle: livraison ? t('remettreAuLivreur') : t('clientServi') }
          : null;

  return (
    <article className={`flex flex-col gap-3 rounded-[18px] bg-white p-4 text-gray-900 ${bordure}`}>
      <div className="flex items-baseline justify-between gap-2">
        <Link
          href={`/merchant/${orgId}/orders/${commande.id}`}
          className="font-extrabold tabular-nums text-gray-900 hover:text-orange-600"
        >
          {numeroCourt(commande.id)}
        </Link>
        {enAttente ? (
          <span className="text-[13px] font-extrabold text-amber-700">
            {depuis < 1 ? t('aLInstant') : t('ilYa', { minutes: depuis })}
          </span>
        ) : commande.status === 'READY' ? (
          <span className="text-[13px] font-bold text-green-700">{t('prete')}</span>
        ) : restant !== null ? (
          <span className={`text-[13px] font-extrabold ${restant < 0 ? 'text-red-700' : 'text-orange-800'}`}>
            {restant < 0 ? t('enRetard', { minutes: -restant }) : t('preteDans', { minutes: restant })}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold">{mode}</span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
            commande.paymentStatus === 'SUCCEEDED' ? 'bg-gray-100' : 'bg-amber-100 text-amber-900'
          }`}
        >
          {paiement}
        </span>
      </div>

      <ul className="space-y-1 text-sm">
        {commande.items.map((ligne) => (
          <li key={ligne.id} className="flex gap-2">
            <b className="min-w-[1.6rem] tabular-nums">{ligne.quantity}×</b>
            <span>
              {ligne.product.name}
              {ligne.variant?.label && <span className="text-gray-500"> — {ligne.variant.label}</span>}
            </span>
          </li>
        ))}
      </ul>

      {avancement !== null && commande.status !== 'READY' && (
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
          <div
            className={`h-full rounded-full ${restant !== null && restant < 0 ? 'bg-red-600' : 'bg-orange-600'}`}
            style={{ width: `${avancement}%` }}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate text-gray-500">{commande.customerName}</span>
        <b className="tabular-nums">{euro(montantCommercant(commande))}</b>
      </div>

      {enAttente && commande.echeance && (
        <p className="text-xs font-semibold text-amber-800">
          {t('repondreAvant', { heure: heure(commande.echeance) })}
        </p>
      )}

      {/* La course de la plateforme : où en est la recherche du livreur. */}
      {livraison &&
        livreurDeLaPlateforme &&
        (commande.status === 'PREPARING' || commande.status === 'READY') &&
        (commande.delivery?.driverId ? (
          <div className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2 text-[13px]">
            <Truck size={16} className="shrink-0 text-green-700" aria-hidden="true" />
            <span className="font-bold text-green-900">
              {commande.delivery.status === 'PICKED_UP'
                ? t('livreurEnRoute', { nom: commande.delivery.driver?.name?.split(' ')[0] || t('leLivreur') })
                : t('livreurTrouve', { nom: commande.delivery.driver?.name?.split(' ')[0] || t('leLivreur') })}
            </span>
          </div>
        ) : commande.delivery?.reservee ? (
          <div className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2 text-[13px]">
            <Truck size={16} className="shrink-0 text-green-700" aria-hidden="true" />
            <span className="font-bold text-green-900">{t('livreurReserve')}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px]">
            <span className="flex items-center gap-2 font-bold text-amber-900">
              <Search size={15} aria-hidden="true" />
              {t('rechercheLivreur')}
            </span>
            <button
              type="button"
              onClick={() => surChoisirLivreur(commande.id)}
              className="font-bold text-gray-900 underline underline-offset-2 hover:text-orange-600"
            >
              {t('choisirLivreur')}
            </button>
          </div>
        ))}

      {refus ? (
        <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-bold text-red-900">{t('pourquoiRefuser')}</p>
          <div className="grid grid-cols-2 gap-2">
            {MOTIFS_DU_COMMERCANT.map((m) => (
              <button
                key={m.valeur}
                type="button"
                aria-pressed={motif === m.valeur}
                onClick={() => setMotif(m.valeur)}
                className={`rounded-xl border px-2 py-2 text-xs font-bold transition ${
                  motif === m.valeur
                    ? 'border-red-700 bg-red-700 text-white'
                    : 'border-red-200 bg-white text-red-900 hover:bg-red-100'
                }`}
              >
                {t(`motifs.${m.valeur}`)}
              </button>
            ))}
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            aria-label={t('precision')}
            placeholder={t('precision')}
            className="w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400"
          />
          {commande.paymentStatus === 'SUCCEEDED' && (
            <p className="text-xs text-red-900">{t('remboursementAuto')}</p>
          )}
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <button type="button" onClick={() => setRefus(false)} className={boutonSecondaire}>
              {t('retour')}
            </button>
            <button
              type="button"
              onClick={() => motif && agir(() => refuserCommande(storeId, commande.id, motif, note))}
              disabled={!motif || envoi}
              className={`${boutonPrincipal} bg-red-700 hover:bg-red-800`}
            >
              {envoi ? '…' : enAttente ? t('confirmerRefus') : t('confirmerAnnulation')}
            </button>
          </div>
        </div>
      ) : enAttente ? (
        <>
          <div>
            <p className="mb-1.5 text-xs font-bold text-gray-500">{t('preteDansCombien')}</p>
            <div className="grid grid-cols-6 gap-1">
              {TEMPS_DE_PREPARATION.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  aria-pressed={preparation === minutes}
                  aria-label={t('minutes', { minutes })}
                  onClick={() => setPreparation(minutes)}
                  className={`rounded-[10px] border py-2 text-[13px] font-bold tabular-nums transition ${
                    preparation === minutes
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-200 bg-white hover:border-gray-400'
                  }`}
                >
                  {minutes}′
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <button
              type="button"
              onClick={() => setRefus(true)}
              disabled={envoi}
              className={`${boutonSecondaire} text-red-700`}
            >
              {t('refuser')}
            </button>
            <button
              type="button"
              onClick={() => agir(() => accepterCommande(storeId, commande.id, preparation))}
              disabled={envoi}
              className={`${boutonPrincipal} bg-orange-600 hover:bg-orange-700`}
            >
              {envoi ? '…' : t('accepterEn', { minutes: preparation })}
            </button>
          </div>
        </>
      ) : (
        suite && (
          <button
            type="button"
            onClick={() => agir(() => avancerCommande(storeId, commande.id, suite.statut))}
            disabled={envoi}
            className={`${boutonPrincipal} ${
              commande.status === 'PREPARING' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-gray-900 hover:bg-black'
            }`}
          >
            {envoi ? '…' : suite.libelle}
          </button>
        )
      )}

      {erreur && <p className="text-sm font-semibold text-red-700">{erreur}</p>}

      {!refus && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          {commande.customerPhone ? (
            <a
              href={`tel:${commande.customerPhone.replace(/\s+/g, '')}`}
              className="inline-flex items-center gap-1 font-bold text-gray-600 hover:text-orange-600"
            >
              <Phone size={13} aria-hidden="true" /> {t('appeler')}
            </a>
          ) : (
            <span />
          )}
          {/* Un imprévu après l'acceptation : annuler reste possible, avec un motif. */}
          {!enAttente && (
            <button
              type="button"
              onClick={() => setRefus(true)}
              disabled={envoi}
              className="font-bold text-gray-400 hover:text-red-700"
            >
              {t('annulerImprevu')}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
