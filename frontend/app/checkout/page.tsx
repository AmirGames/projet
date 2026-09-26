'use client';

/**
 * Commander depuis la fiche d'un commerce, sans compte.
 *
 * Cette page était une maquette : un identifiant de boutique écrit en dur, un
 * menu déroulant « Livraison » **sans aucun champ d'adresse**, et une commande
 * envoyée sans adresse, sans frais de zone et sans le détail du panier. Le
 * client qui choisissait la livraison n'avait nulle part où dire où livrer.
 *
 * Elle affiche désormais le même tunnel que la vitrine, sur la boutique dont
 * vient le panier.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check } from 'lucide-react';

import { euro } from '@/lib/format';
import { TunnelCommande, type BoutiqueCommandee } from '@/components/TunnelCommande';
import { useHydrate } from '@/lib/navigateur';
import { useTranslations } from 'next-intl';
import {
  autresPaniers,
  nombreDArticles,
  totalDuPanier,
  viderPanier,
  type LignePanier,
  type PanierBoutique,
} from '@/lib/paniers';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function CheckoutPage() {
  const t = useTranslations('common');
  const router = useRouter();

  const [boutique, setBoutique] = useState<BoutiqueCommandee | null>(null);
  // Hors des horaires, le tunnel ne propose que le retrait sur un créneau.
  const [ouverteMaintenant, setOuverteMaintenant] = useState<boolean | undefined>(undefined);
  // Les autres paniers en attente : c'est au client de dire lequel il commande.
  const [aChoisir, setAChoisir] = useState<PanierBoutique[]>([]);
  const [lignes, setLignes] = useState<LignePanier[]>([]);
  const [chargement, setChargement] = useState(true);
  const [confirmation, setConfirmation] = useState<{ id: string; numero: string } | null>(null);

  /**
   * De quelle boutique s'agit-il.
   *
   * La fiche du commerce le dit (`?boutique=`). Sans ce paramètre — un lien
   * gardé en favori, un retour en arrière — on se rabat sur le panier en cours
   * s'il n'y en a qu'un, et on demande sinon.
   *
   * La requête est lue ici et non par `useSearchParams`, qui obligerait à
   * envelopper la page d'une frontière Suspense pour se construire.
   */
  const hydrate = useHydrate();
  const [panierLu, setPanierLu] = useState(false);
  const [boutiqueRetenue, setBoutiqueRetenue] = useState<string | null>(null);

  // Lu une fois, dans le navigateur : l'adresse de la page et les paniers
  // n'existent pas au rendu serveur.
  if (hydrate && !panierLu) {
    setPanierLu(true);
    const demandee = new URLSearchParams(window.location.search).get('boutique') || '';
    const paniers = autresPaniers(undefined);

    const retenu = demandee
      ? paniers.find((panier) => panier.storeId === demandee)
      : paniers.length === 1
        ? paniers[0]
        : undefined;

    if (!retenu) {
      // Un identifiant annoncé sans panier : la boutique existe peut-être, mais
      // il n'y a rien à commander.
      setAChoisir(paniers);
    } else {
      setLignes(retenu.lignes);
      setBoutique({ id: retenu.storeId, name: retenu.storeName, slug: retenu.storeSlug });
      setBoutiqueRetenue(retenu.storeId);
    }
    setChargement(false);
  }

  // La route publique donne l'état d'ouverture, l'adresse et le logo de la
  // boutique, et le nom quand celui enregistré manque (panier composé avant
  // cette version).
  useEffect(() => {
    if (!boutiqueRetenue) return;

    fetch(`${API_URL}/api/client/stores/${boutiqueRetenue}`)
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => {
        if (typeof donnees?.data?.isOpenNow === 'boolean') {
          setOuverteMaintenant(donnees.data.isOpenNow);
        }
        const lue = donnees?.data;
        if (!lue) return;
        setBoutique((actuelle) => ({
          id: boutiqueRetenue,
          name: actuelle?.name || lue.name || '',
          slug: actuelle?.slug || lue.slug,
          address: lue.address,
          city: lue.city,
          logo: lue.settings?.logo,
        }));
      })
      .catch(() => undefined);
  }, [boutiqueRetenue]);

  if (chargement) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
        <p className="text-gray-400">Chargement de votre panier…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          {/* Sans retour, un client qui veut corriger son panier n'a que le
              bouton du navigateur — et il ne le trouve pas sur téléphone. */}
          <button
            type="button"
            onClick={() => router.back()}
            title={t('back')}
            aria-label={t('back')}
            className="p-2 hover:bg-gray-700 rounded-lg transition"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Passer la commande</h1>
            {boutique && <p className="text-sm text-gray-400">{boutique.name}</p>}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        {confirmation ? (
          <div className="max-w-md mx-auto bg-gray-800 border border-gray-700 rounded-lg text-center p-8 space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-green-600/20 border border-green-600 rounded-full flex items-center justify-center">
                <Check size={32} className="text-green-400" />
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-bold mb-2">Commande envoyée</h2>
              <p className="text-gray-400">
                Le commerce doit maintenant la confirmer. Vous recevrez un e-mail dès qu&apos;il
                l&apos;aura acceptée, avec l&apos;heure prévue.
              </p>
            </div>

            <div className="bg-gray-700 rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-1">Numéro de commande</p>
              <p className="text-2xl font-bold text-red-400">#{confirmation.numero}</p>
            </div>

            <Link
              href={`/track?commande=${confirmation.id}`}
              className="block w-full py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors"
            >
              Suivre ma commande
            </Link>
          </div>
        ) : !boutique ? (
          <div className="max-w-md mx-auto bg-gray-800 border border-gray-700 rounded-lg p-8 space-y-4">
            {aChoisir.length === 0 ? (
              <>
                <h2 className="text-xl font-bold">Votre panier est vide</h2>
                <p className="text-gray-400 text-sm">
                  Choisissez un commerce et composez votre commande.
                </p>
                <Link
                  href="/client"
                  className="inline-block py-2 px-4 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors"
                >
                  Voir les commerces
                </Link>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold">Quel panier voulez-vous commander&nbsp;?</h2>
                {/* Une commande ne peut porter que sur un commerce : mélanger
                    deux paniers n'aurait ni livreur ni cuisine communs. */}
                <p className="text-gray-400 text-sm">
                  Vous avez un panier chez plusieurs commerces. Une commande ne concerne qu&apos;un
                  commerce à la fois.
                </p>
                <ul className="space-y-2">
                  {aChoisir.map((panier) => (
                    <li key={panier.storeId}>
                      <Link
                        href={`/checkout?boutique=${panier.storeId}`}
                        className="flex items-center justify-between bg-gray-700 hover:bg-gray-600 rounded-lg px-4 py-3 transition-colors"
                      >
                        <span className="font-semibold">
                          {panier.storeName || 'Commerce'}
                          <span className="block text-xs text-gray-400">
                            {nombreDArticles(panier.lignes)} article
                            {nombreDArticles(panier.lignes) > 1 ? 's' : ''}
                          </span>
                        </span>
                        <span className="text-red-400">{euro(totalDuPanier(panier.lignes))}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : (
          <TunnelCommande
            boutique={boutique}
            lignes={lignes}
            ouverteMaintenant={ouverteMaintenant}
            surCommandePassee={(commande) => {
              setConfirmation({ id: commande.id, numero: commande.numero });
              viderPanier(boutique.id);
              setLignes([]);
            }}
          />
        )}
      </div>
    </div>
  );
}
