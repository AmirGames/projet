'use client';

import { useEffect, useState } from 'react';
import { Check, Phone, X, AlertTriangle } from 'lucide-react';
import {
  MOTIFS_DU_COMMERCANT,
  MOTIFS_POUR_LE_COMMERCANT,
  TEMPS_DE_PREPARATION,
  EVENEMENT_COMMANDES_CHANGEES,
  accepterCommande,
  refuserCommande,
  avancerCommande,
  delaiRestant,
  heure,
  type MotifDeRefus,
} from '@/lib/reponse-commande';

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
const ETAPES = [
  { valeur: 'PREPARING', libelle: 'En préparation' },
  { valeur: 'READY', libelle: 'Prête' },
  { valeur: 'COMPLETED', libelle: 'Remise' },
];

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
      setErreur(e instanceof Error ? e.message : 'Action impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const telephone = commande.customerPhone ? (
    <a
      href={`tel:${commande.customerPhone.replace(/\s+/g, '')}`}
      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
    >
      <Phone size={14} /> Appeler le client ({commande.customerPhone})
    </a>
  ) : null;

  if (commande.status === 'REJECTED') {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-red-600">
          {MOTIFS_POUR_LE_COMMERCANT[commande.rejectionReason || ''] || 'Commande refusée'}
        </p>
        {commande.rejectionNote && (
          <p className="text-gray-500">« {commande.rejectionNote} »</p>
        )}
        {commande.paymentStatus === 'REFUNDED' && (
          <p className="text-gray-500">Payée en ligne : le client a été remboursé.</p>
        )}
        {commande.paymentStatus === 'SUCCEEDED' && (
          <p className="flex items-center gap-1 text-amber-600">
            <AlertTriangle size={14} /> Payée en ligne : le remboursement automatique a échoué, contactez le support.
          </p>
        )}
      </div>
    );
  }

  if (commande.status === 'COMPLETED') {
    return <p className="text-sm text-gray-500">Commande remise.</p>;
  }

  const formulaireDeRefus = refus && (
    <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="text-sm font-semibold text-red-700">Pourquoi refuser ?</p>
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
            {m.libelle}
          </button>
        ))}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
        placeholder="Précision pour le client (facultatif)"
        className="w-full rounded bg-gray-100 border border-gray-300 px-3 py-2 text-sm"
      />
      {commande.paymentStatus === 'SUCCEEDED' && (
        <p className="text-xs text-amber-600">
          Cette commande est payée en ligne : le client sera remboursé automatiquement.
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => motif && agir(() => refuserCommande(storeId, commande.id, motif, note))}
          disabled={!motif || envoi}
          className="flex-1 rounded bg-red-600 text-white hover:bg-red-700 px-3 py-2 text-sm font-semibold disabled:opacity-40"
        >
          {envoi ? '...' : 'Confirmer le refus'}
        </button>
        <button
          type="button"
          onClick={() => setRefus(false)}
          className="rounded bg-gray-100 hover:bg-gray-200 px-3 py-2 text-sm"
        >
          Retour
        </button>
      </div>
    </div>
  );

  if (commande.status === 'PENDING') {
    return (
      <div className="space-y-3">
        {commande.echeance && (
          <p className="text-sm text-yellow-700">
            À accepter avant {heure(commande.echeance)} ({delaiRestant(commande.echeance, maintenant)}),
            sinon elle sera refusée automatiquement.
          </p>
        )}
        {commande.deliveryType === 'PICKUP' && commande.pickupTime && (
          <p className="text-sm text-gray-700">Retrait prévu à {heure(commande.pickupTime)}</p>
        )}
        {telephone}

        {refus ? (
          formulaireDeRefus
        ) : (
          <>
            <div>
              <p className="text-xs text-gray-500 mb-2">Temps de préparation</p>
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
                    {minutes} min
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => agir(() => accepterCommande(storeId, commande.id, preparation))}
                disabled={envoi}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-green-600 text-white hover:bg-green-700 px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                <Check size={16} /> {envoi ? '...' : 'Accepter'}
              </button>
              <button
                type="button"
                onClick={() => setRefus(true)}
                disabled={envoi}
                className="inline-flex items-center justify-center gap-1 rounded bg-gray-100 hover:bg-red-700 px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                <X size={16} /> Rejeter
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
          Prête vers {heure(commande.estimatedReadyAt)}
          {commande.preparationMinutes ? ` (${commande.preparationMinutes} min annoncées)` : ''}
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
                    ? 'bg-gray-600/50 border-gray-300 text-gray-500'
                    : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                }`}
              >
                {etape.libelle}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setRefus(true)}
            disabled={envoi}
            className="text-xs text-red-600 hover:text-red-700"
          >
            Annuler la commande (imprévu)…
          </button>
        </>
      )}
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
    </div>
  );
}
