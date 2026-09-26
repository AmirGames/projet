'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BellRing, Bike, Volume2, X } from 'lucide-react';
import { useCurrentStore } from '@/lib/current-store';
import { EVENEMENT_COMMANDES_CHANGEES, delaiRestant } from '@/lib/reponse-commande';
import { useDonneesModifiees, useTempsReel } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/** Filet de sécurité si la connexion en direct tombe. */
const RELECTURE_MS = 30000;
/** Une sonnerie toutes les… */
const SONNERIE_MS = 3000;

interface CommandeEnAttente {
  id: string;
  customerName: string;
  echeance?: string;
}

/** Deux notes courtes, assez fortes pour s'entendre en cuisine. */
function sonner(contexte: AudioContext) {
  const debut = contexte.currentTime;

  [880, 1175].forEach((frequence, rang) => {
    const oscillateur = contexte.createOscillator();
    const volume = contexte.createGain();

    oscillateur.type = 'square';
    oscillateur.frequency.value = frequence;
    volume.gain.setValueAtTime(0.0001, debut + rang * 0.25);
    volume.gain.exponentialRampToValueAtTime(0.3, debut + rang * 0.25 + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, debut + rang * 0.25 + 0.22);

    oscillateur.connect(volume).connect(contexte.destination);
    oscillateur.start(debut + rang * 0.25);
    oscillateur.stop(debut + rang * 0.25 + 0.24);
  });
}

/**
 * La sonnerie des nouvelles commandes.
 *
 * Comme la tablette d'une plateforme de livraison : tant qu'une commande
 * attend d'être acceptée, ça sonne, sur n'importe quelle page de l'espace
 * commerçant, et un bandeau mène à la commande. Sans cela, le commerçant ne
 * voyait une commande qu'en rechargeant la page.
 */
export function AlerteCommandes({ orgId }: { orgId: string }) {
  const { storeId } = useCurrentStore();
  const [enAttente, setEnAttente] = useState<CommandeEnAttente[]>([]);
  const [sonBloque, setSonBloque] = useState(false);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const contexteRef = useRef<AudioContext | null>(null);

  const charger = useCallback(async () => {
    if (!storeId) return;

    const jeton = localStorage.getItem('accessToken');
    if (!jeton) return;

    try {
      const reponse = await fetch(
        `${API_URL}/order-management/${storeId}?status=PENDING&take=20`,
        { headers: { Authorization: `Bearer ${jeton}` } }
      );
      if (!reponse.ok) return;

      const donnees = await reponse.json();
      setEnAttente(donnees.data || []);
      setMaintenant(Date.now());
    } catch {
      // Hors ligne : on garde l'état connu, la relecture suivante corrigera.
    }
  }, [storeId]);

  // Au chargement, puis régulièrement, puis à chaque action faite ici.
  useEffectChargement(() => {
    charger();
  }, [charger]);

  useEffect(() => {
    const minuteur = setInterval(charger, RELECTURE_MS);
    window.addEventListener(EVENEMENT_COMMANDES_CHANGEES, charger);

    return () => {
      clearInterval(minuteur);
      window.removeEventListener(EVENEMENT_COMMANDES_CHANGEES, charger);
    };
  }, [charger]);

  // En direct : une commande arrive, ou un collègue y a répondu.
  const surEvenement = (donnees: { storeId?: string }) => {
    if (donnees?.storeId && donnees.storeId !== storeId) return;
    // Les écrans de commandes ouverts se relisent aussi.
    window.dispatchEvent(new Event(EVENEMENT_COMMANDES_CHANGEES));
  };

  useTempsReel('commande-nouvelle', surEvenement, Boolean(storeId));
  useTempsReel('commande-traitee', surEvenement, Boolean(storeId));

  // Un livreur a accepté une commande en préparation : il arrive au commerce.
  const [livreursTrouves, setLivreursTrouves] = useState<{ orderId: string; livreur: string; numero: string }[]>([]);
  useTempsReel(
    'livreur-trouve',
    (donnees: { orderId: string; storeId?: string; livreur: string; numero: string }) => {
      if (donnees?.storeId && donnees.storeId !== storeId) return;
      setLivreursTrouves((liste) => [...liste.filter((l) => l.orderId !== donnees.orderId), donnees]);
      window.dispatchEvent(new Event(EVENEMENT_COMMANDES_CHANGEES));
      if (contexteRef.current && contexteRef.current.state === 'running') sonner(contexteRef.current);
    },
    Boolean(storeId)
  );

  // Le message s'efface de lui-même : il annonce, il n'attend pas de réponse.
  useEffect(() => {
    if (livreursTrouves.length === 0) return;
    const minuteur = setTimeout(() => setLivreursTrouves((liste) => liste.slice(1)), 15000);
    return () => clearTimeout(minuteur);
  }, [livreursTrouves]);

  const bandeauLivreurs = livreursTrouves.length > 0 && (
    <div role="status" className="border-b border-green-500/60 bg-green-500/15 px-6 py-3">
      {livreursTrouves.map((l) => (
        <div key={l.orderId} className="flex items-center gap-3 text-sm">
          <Bike size={20} className="text-green-300 flex-shrink-0" />
          <p className="flex-1 text-green-100">
            <span className="font-bold text-green-200">Livreur trouvé</span> — {l.livreur} a accepté la commande #{l.numero} et arrive au commerce.
          </p>
          <button
            onClick={() => setLivreursTrouves((liste) => liste.filter((x) => x.orderId !== l.orderId))}
            className="text-green-200 hover:text-white"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );

  // Toute autre écriture sur les commandes de la boutique (annulée, modifiée,
  // livrée) : la liste d'attente peut avoir changé.
  useDonneesModifiees(['orders', 'order-management'], charger, {
    storeId,
    actif: Boolean(storeId),
  });

  // La sonnerie, tant qu'il reste une commande à accepter.
  useEffect(() => {
    if (enAttente.length === 0) return;

    if (!contexteRef.current) {
      try {
        const Contexte =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        contexteRef.current = new Contexte();
      } catch {
        return;
      }
    }

    const contexte = contexteRef.current;

    const jouer = () => {
      // Le navigateur bloque le son tant que personne n'a touché la page :
      // on le dit, plutôt que de rester muet.
      if (contexte.state === 'suspended') {
        contexte.resume().catch(() => undefined);
        setSonBloque(contexte.state === 'suspended');
        if (contexte.state === 'suspended') return;
      }
      setSonBloque(false);
      sonner(contexte);
    };

    jouer();
    const minuteur = setInterval(jouer, SONNERIE_MS);

    return () => clearInterval(minuteur);
  }, [enAttente.length]);

  // Le titre de l'onglet clignote aussi : il se voit depuis un autre onglet.
  useEffect(() => {
    if (enAttente.length === 0) return;

    const titre = document.title;
    let alterne = false;
    const minuteur = setInterval(() => {
      alterne = !alterne;
      document.title = alterne
        ? `🔔 ${enAttente.length} nouvelle${enAttente.length > 1 ? 's' : ''} commande${enAttente.length > 1 ? 's' : ''}`
        : titre;
    }, 1000);

    return () => {
      clearInterval(minuteur);
      document.title = titre;
    };
  }, [enAttente.length]);

  if (enAttente.length === 0) return bandeauLivreurs || null;

  const activerLeSon = () => {
    contexteRef.current
      ?.resume()
      .then(() => setSonBloque(false))
      .catch(() => undefined);
  };

  return (
    <>
    {bandeauLivreurs}
    <div
      role="alert"
      className="border-b border-yellow-500/60 bg-yellow-500/15 px-6 py-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <BellRing size={22} className="text-yellow-300 flex-shrink-0 animate-pulse" />
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-bold text-yellow-200">
            {enAttente.length} nouvelle{enAttente.length > 1 ? 's' : ''} commande
            {enAttente.length > 1 ? 's' : ''} à accepter
          </p>
          <p className="text-yellow-100/80 truncate">
            {enAttente
              .map((c) => `${c.customerName}${c.echeance ? ` (${delaiRestant(c.echeance, maintenant)})` : ''}`)
              .join(' · ')}
          </p>
        </div>
        {sonBloque && (
          <button
            onClick={activerLeSon}
            className="inline-flex items-center gap-1 rounded-lg bg-yellow-600 hover:bg-yellow-500 px-3 py-2 text-sm font-semibold text-gray-900"
          >
            <Volume2 size={16} /> Activer la sonnerie
          </button>
        )}
        <Link
          href={`/merchant/${orgId}/orders?filtre=PENDING`}
          className="rounded-lg bg-green-600 hover:bg-green-500 px-4 py-2 text-sm font-semibold text-white"
        >
          Voir les commandes
        </Link>
      </div>
    </div>
    </>
  );
}
