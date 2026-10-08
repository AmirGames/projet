'use client';

import { useEffect, useState } from 'react';
import { Check, Phone, X, AlertTriangle } from 'lucide-react';
import {
  MOTIFS_DU_COMMERCANT,
  TEMPS_DE_PREPARATION,
  EVENEMENT_COMMANDES_CHANGEES,
  accepterCommande,
  refuserCommande,
  avancerCommande,
  delaiRestant,
  heure,
  type MotifDeRefus,
} from '@/lib/reponse-commande';
import { useTranslations } from 'next-intl';

export interface CommandeARepondre {
  id: string;
  status: string;
  deliveryType: string;
  customerPhone?: string | null;
  paymentStatus?: string;
  pickupTime?: string | null;
  /** L'heure limite pour répondre, tant que la commande est en attente. */
  echeance?: string | null;
  estimatedReadyAt?: string | null;
  preparationMinutes?: number | null;
  rejectionReason?: string | null;
  rejectionNote?: string | null;
}

/** Les étapes qui suivent l'acceptation, dans l'ordre. */
// Le libellé : `etapes.<valeur>` des traductions.
const ETAPES = [{ valeur: 'PREPARING' }, { valeur: 'READY' }, { valeur: 'COMPLETED' }];

/**
 * Répondre à une commande, comme sur une tablette de plateforme de livraison.
 *
 * En attente : choisir le temps de préparation, puis accepter — ou rejeter
 * avec un motif. Acceptée : la faire avancer, ou l'annuler sur un imprévu.
 * Refusée : dire pourquoi, et s'il reste un remboursement à faire.
 */
export function ReponseCommande({
  storeId,
  commande,
  surChangement,
}: {
  storeId: string;
  commande: CommandeARepondre;
  /** La commande a changé : relire la liste ou le détail. */
  surChangement: () => void;
}) {
  const t = useTranslations('reponseCommande');
  const tMotif = useTranslations('motifsRefus');
  const tDelai = useTranslations('delai');
  const [preparation, setPreparation] = useState(20);
  const [refus, setRefus] = useState(false);
  const [motif, setMotif] = useState<MotifDeRefus | ''>('');
  const [note, setNote] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [maintenant, setMaintenant] = useState(() => Date.now());

  // Le compte à rebours avance tout seul.
  useEffect(() => {
    if (commande.status !== 'PENDING') return;
    const minuteur = setInterval(() => setMaintenant(Date.now()), 15000);
    return () => clearInterval(minuteur);
  }, [commande.status]);

  const agir = async (action: () => Promise<any>) => {
    setEnvoi(true);
    setErreur('');

    try {
      await action();
      surChangement();
      setRefus(false);
      setMotif('');
      setNote('');
      // La sonnerie et les autres écrans se remettent à jour.
      window.dispatchEvent(new Event(EVENEMENT_COMMANDES_CHANGEES));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : t('actionImpossible'));
    } finally {
      setEnvoi(false);
    }
  };

  const telephone = commande.customerPhone ? (
    <a
      href={`tel:${commande.customerPhone.replace(/\s+/g, '')}`}
      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
    >
      <Phone size={14} /> {t('appeler', { telephone: commande.customerPhone })}
    </a>
  ) : null;

  if (commande.status === 'REJECTED') {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-red-600">
          {commande.rejectionReason && tMotif.has(`commercant.${commande.rejectionReason}`) ? tMotif(`commercant.${commande.rejectionReason}`) : t('refusee')}
        </p>
        {commande.rejectionNote && (
          <p className="text-gray-500">« {commande.rejectionNote} »</p>
        )}
        {commande.paymentStatus === 'REFUNDED' && (
          <p className="text-gray-500">{t('rembourse')}</p>
        )}
        {commande.paymentStatus === 'SUCCEEDED' && (
          <p className="flex items-center gap-1 text-amber-600">
            <AlertTriangle size={14} /> {t('remboursementEchoue')}
          </p>
        )}
      </div>
    );
  }

  if (commande.status === 'COMPLETED') {
    return <p className="text-sm text-gray-500">{t('remise')}</p>;
  }

  const formulaireDeRefus = refus && (
    <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="text-sm font-semibold text-red-700">{t('pourquoi')}</p>
      <div className="grid grid-cols-2 gap-2">
        {MOTIFS_DU_COMMERCANT.map((m) => (
          <button
            key={m.valeur}
            type="button"
            onClick={() => setMotif(m.valeur)}
            className={`rounded px-3 py-2 text-xs font-medium border transition-colors ${
              motif === m.valeur
                ? 'bg-red-600 border-red-500 text-white'
                : 'bg-gray-100 border-gray-300 hover:bg-gray-200'
            }`}
          >
            {tMotif(`commercant.${m.valeur}`)}
          </button>
        ))}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
        placeholder={t('precision')}
        className="w-full rounded-sm bg-gray-100 border border-gray-300 px-3 py-2 text-sm"
      />
      {commande.paymentStatus === 'SUCCEEDED' && (
        <p className="text-xs text-amber-600">
          {t('seraRembourse')}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => motif && agir(() => refuserCommande(storeId, commande.id, motif, note))}
          disabled={!motif || envoi}
          className="flex-1 rounded-sm bg-red-600 text-white hover:bg-red-700 px-3 py-2 text-sm font-semibold disabled:opacity-40"
        >
          {envoi ? '...' : t('confirmerRefus')}
        </button>
        <button
          type="button"
          onClick={() => setRefus(false)}
          className="rounded-sm bg-gray-100 hover:bg-gray-200 px-3 py-2 text-sm"
        >
          {t('retour')}
        </button>
      </div>
    </div>
  );

  if (commande.status === 'PENDING') {
    return (
      <div className="space-y-3">
        {commande.echeance && (
          <p className="text-sm text-yellow-700">
            {t('aAccepterAvant', { heure: heure(commande.echeance), delai: delaiRestant(commande.echeance, maintenant, tDelai) })}
          </p>
        )}
        {commande.deliveryType === 'PICKUP' && commande.pickupTime && (
          <p className="text-sm text-gray-700">{t('retraitPrevu', { heure: heure(commande.pickupTime) })}</p>
        )}
        {telephone}

        {refus ? (
          formulaireDeRefus
        ) : (
          <>
            <div>
              <p className="text-xs text-gray-500 mb-2">{t('tempsPreparation')}</p>
              <div className="grid grid-cols-6 gap-1">
                {TEMPS_DE_PREPARATION.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => setPreparation(minutes)}
                    className={`rounded px-1 py-2 text-xs font-medium border transition-colors ${
                      preparation === minutes
                        ? 'bg-green-600 border-green-500 text-white'
                        : 'bg-gray-100 border-gray-300 hover:bg-gray-200'
                    }`}
                  >
                    {t('minutes', { n: minutes })}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => agir(() => accepterCommande(storeId, commande.id, preparation))}
                disabled={envoi}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-sm bg-green-600 text-white hover:bg-green-700 px-3 py-2 text-sm font-semibold disabled:opacity-50"
              >
                <Check size={16} /> {envoi ? '...' : t('accepter')}
              </button>
              <button
                type="button"
                onClick={() => setRefus(true)}
                disabled={envoi}
                className="inline-flex items-center justify-center gap-1 rounded-sm bg-gray-100 hover:bg-red-50 hover:text-red-700 px-3 py-2 text-sm font-semibold disabled:opacity-50"
              >
                <X size={16} /> {t('rejeter')}
              </button>
            </div>
          </>
        )}
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      </div>
    );
  }

  // Acceptée, en préparation ou prête.
  const rang = ETAPES.findIndex((e) => e.valeur === commande.status);

  return (
    <div className="space-y-3">
      {commande.estimatedReadyAt && (
        <p className="text-sm text-gray-700">
          {commande.preparationMinutes
            ? t('preteVersAnnonce', { heure: heure(commande.estimatedReadyAt), n: commande.preparationMinutes })
            : t('preteVers', { heure: heure(commande.estimatedReadyAt) })}
        </p>
      )}
      {telephone}

      {refus ? (
        formulaireDeRefus
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {ETAPES.map((etape, index) => (
              <button
                key={etape.valeur}
                type="button"
                onClick={() => agir(() => avancerCommande(storeId, commande.id, etape.valeur))}
                disabled={envoi || index <= rang}
                className={`rounded px-2 py-2 text-xs font-medium border transition-colors disabled:cursor-default ${
                  index <= rang
                    ? 'bg-gray-100 border-gray-200 text-gray-400'
                    : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                }`}
              >
                {t(`etapes.${etape.valeur}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setRefus(true)}
            disabled={envoi}
            className="text-xs text-red-600 hover:text-red-700"
          >
            {t('annulerImprevu')}
          </button>
        </>
      )}
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
    </div>
  );
}
