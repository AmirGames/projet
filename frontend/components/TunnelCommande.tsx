'use client';

/**
 * Commander en tant qu'invité : coordonnées, mode de livraison, adresse.
 *
 * Ce tunnel n'existait qu'à un seul endroit, la vitrine `/store/[slug]`. La
 * page `/checkout`, celle où mène « Passer la commande » depuis la fiche d'un
 * restaurant, en avait une version appauvrie : un menu déroulant « Livraison »
 * et **aucun champ d'adresse**. Le client choisissait la livraison sans jamais
 * pouvoir dire où livrer, et la commande partait sans adresse, sans frais de
 * zone et sans le détail du panier.
 *
 * Le formulaire vit donc ici, une fois, et s'affiche sur la page `/checkout`,
 * où mènent la vitrine comme les paniers de l'accueil. Il y prend la forme
 * d'une page de paiement en deux colonnes : les détails de la livraison, le
 * mode et le moyen de paiement à gauche ; la boutique, le panier, le code
 * promo et le total à droite.
 *
 * Il s'ouvrait auparavant en fenêtre par-dessus la vitrine, un long formulaire
 * à faire défiler dans une boîte de quelques centimètres de haut.
 */

import { useEffect, useState } from 'react';
import { telephoneInternational } from '@/lib/pays-infos';
import { paysDuNavigateur } from '@/lib/pays-client';
import {
  AlertCircle,
  Bike,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CreditCard,
  MapPin,
  MessageSquare,
  ShoppingCart,
  Store as IconeBoutique,
  Tag,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { euro } from '@/lib/format';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { lireAdresseLivraison } from '@/lib/adresseLivraison';
import { cleDeLigne, nombreDArticles, totalDuPanier, type LignePanier } from '@/lib/paniers';
import { useAuth } from '@/lib/auth-context';
import { StripePayment } from '@/components/stripe-payment';
import { DelaiAnnulation } from '@/components/DelaiAnnulation';
import AcceptationConditions from '@/components/AcceptationConditions';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Les conditions de livraison à l'adresse saisie. */
interface Livraison {
  livrable: boolean;
  zone: { name: string; minOrder: number; deliveryMinutes: number | null } | null;
  distanceKm: number | null;
  frais: number;
  minimum: number;
  raison: string;
  forfaitBoutique: boolean;
}

interface MoyenDePaiement {
  id: string;
  type: string;
  name: string;
  isDefault: boolean;
}

export interface CommandePassee {
  id: string;
  numero: string;
}

/** Ce que la page sait de la boutique : l'essentiel suffit à commander. */
export interface BoutiqueCommandee {
  id: string;
  name: string;
  slug?: string | null;
  address?: string | null;
  city?: string | null;
  logo?: string | null;
}

interface Props {
  boutique: BoutiqueCommandee;
  lignes: LignePanier[];
  /** La commande est passée : au parent de vider le panier et de l'annoncer. */
  surCommandePassee: (commande: CommandePassee) => void;
  /**
   * La boutique est-elle dans ses horaires en ce moment.
   *
   * Fermée, elle prend encore des retraits sur un créneau à venir, mais pas de
   * livraison : celle-ci part tout de suite, et personne ne la préparerait.
   */
  ouverteMaintenant?: boolean;
}

export function TunnelCommande({
  boutique,
  lignes,
  surCommandePassee,
  ouverteMaintenant,
}: Props) {
  const livraisonFermee = ouverteMaintenant === false;
  const { user } = useAuth();
  const [livraison, setLivraison] = useState<Livraison | null>(null);
  // Créneaux réellement proposables, déduits des horaires de la boutique.
  const [creneaux, setCreneaux] = useState<
    { date: string; libelle: string; creneaux: { valeur: string; libelle: string }[] }[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [conditionsAcceptees, setConditionsAcceptees] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const router = useRouter();
  /**
   * Ce qui partira au commerçant une fois le délai de repentir écoulé.
   *
   * Tant qu'il court, rien n'est transmis : « Retour » ramène à la boutique,
   * le panier intact, pour y ajouter le dessert oublié.
   */
  const [enAttente, setEnAttente] = useState<{ partir: () => void } | null>(null);
  /**
   * La commande attend le paiement en ligne.
   *
   * Elle n'est pas encore partie au commerçant : elle ne lui parvient qu'une
   * fois l'encaissement confirmé. Le panier est gardé jusque-là.
   */
  const [aPayer, setAPayer] = useState<(CommandePassee & { montant: number }) | null>(null);
  /**
   * Les moyens de paiement du commerçant.
   *
   * Ils étaient réglables côté commerçant sans être montrés au client : au
   * moment de payer, aucun choix n'apparaissait.
   */
  const [moyens, setMoyens] = useState<MoyenDePaiement[]>([]);
  const [moyenChoisi, setMoyenChoisi] = useState('');
  // Le code promo : saisi, puis vérifié par le serveur.
  const [code, setCode] = useState('');
  const [remise, setRemise] = useState<{ code: string; montant: number } | null>(null);
  const [codeEnCours, setCodeEnCours] = useState(false);
  const [codeRefuse, setCodeRefuse] = useState('');

  /**
   * Les blocs repliés derrière leur bouton « Modifier ».
   *
   * Ils s'ouvrent tant qu'il manque quelque chose : un invité voit d'emblée
   * les champs à remplir, un client connecté ne voit que le résumé de ce que
   * son profil a déjà rempli.
   */
  const [contactOuvert, setContactOuvert] = useState(true);
  const [adresseOuverte, setAdresseOuverte] = useState(true);
  const [notesOuvertes, setNotesOuvertes] = useState(false);
  const [panierDeplie, setPanierDeplie] = useState(false);
  const [promoOuverte, setPromoOuverte] = useState(false);

  const [checkoutForm, setCheckoutForm] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    deliveryType: (livraisonFermee ? 'PICKUP' : 'DELIVERY') as 'PICKUP' | 'DELIVERY',
    deliveryAddress: '',
    deliveryCity: '',
    // L'API l'accepte depuis toujours, aucun écran ne le demandait : la
    // commande partait sans code postal, et le livreur devinait.
    deliveryPostal: '',
    // Renseignées quand le client retient une suggestion d'adresse.
    deliveryLat: undefined as number | undefined,
    deliveryLng: undefined as number | undefined,
    pickupTime: '',
    notes: '',
  });

  // L'état d'ouverture peut arriver après le premier affichage : on bascule
  // alors sur le retrait, seul mode possible.
  useEffect(() => {
    if (livraisonFermee) {
      setCheckoutForm((formulaire) =>
        formulaire.deliveryType === 'PICKUP' ? formulaire : { ...formulaire, deliveryType: 'PICKUP' }
      );
    }
  }, [livraisonFermee]);

  // L'adresse retenue sur l'accueil pré-remplit la livraison.
  useEffect(() => {
    const retenue = lireAdresseLivraison();
    if (!retenue?.street) return;
    if (retenue.city) setAdresseOuverte(false);

    setCheckoutForm((formulaire) =>
      formulaire.deliveryAddress
        ? formulaire
        : {
            ...formulaire,
            deliveryAddress: retenue.street,
            deliveryCity: retenue.city,
            deliveryPostal: retenue.postalCode,
            deliveryLat: retenue.latitude ?? undefined,
            deliveryLng: retenue.longitude ?? undefined,
          }
    );
  }, []);

  // Charger les informations du profil utilisateur si connecté.
  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    let annule = false;

    fetch(`${API_URL}/api/client/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => {
        if (annule || !donnees?.data) return;

        const profil = donnees.data;
        if (profil.name && profil.email && profil.phone) setContactOuvert(false);
        if (profil.address && profil.city) setAdresseOuverte(false);
        setCheckoutForm((formulaire) => ({
          ...formulaire,
          customerName: profil.name || formulaire.customerName,
          customerEmail: profil.email || formulaire.customerEmail,
          customerPhone: profil.phone || formulaire.customerPhone,
          // L'adresse choisie sur l'accueil prime sur celle du profil.
          deliveryAddress: formulaire.deliveryAddress || profil.address || '',
          deliveryCity: formulaire.deliveryAddress ? formulaire.deliveryCity : profil.city || formulaire.deliveryCity,
          deliveryPostal: formulaire.deliveryAddress
            ? formulaire.deliveryPostal
            : profil.postalCode || formulaire.deliveryPostal,
        }));
      })
      .catch(() => undefined);

    return () => {
      annule = true;
    };
  }, [user]);

  // Les conditions de livraison se lisent dès que l'adresse est retenue.
  useEffect(() => {
    if (!boutique.id || checkoutForm.deliveryType !== 'DELIVERY') {
      setLivraison(null);
      return;
    }

    const { deliveryLat, deliveryLng, deliveryAddress, deliveryCity, deliveryPostal } = checkoutForm;
    let annule = false;

    const situee = deliveryLat !== undefined && deliveryLng !== undefined;
    // À défaut de suggestion retenue, le serveur situe l'adresse écrite.
    const ecrite = [deliveryAddress, deliveryPostal, deliveryCity].filter(Boolean).join(' ');

    if (!situee && ecrite.trim().length < 3) {
      setLivraison(null);
      return;
    }

    const parametres = situee
      ? `?lat=${deliveryLat}&lng=${deliveryLng}`
      : `?adresse=${encodeURIComponent(ecrite)}`;

    // Sans temporisation, chaque frappe interrogerait le service d'adresses.
    const minuteur = setTimeout(() => {
      fetch(`${API_URL}/api/client/stores/${boutique.id}/zone-livraison${parametres}`)
        .then((reponse) => (reponse.ok ? reponse.json() : null))
        .then((donnees) => {
          if (!annule && donnees) setLivraison(donnees.data || null);
        })
        .catch(() => undefined);
    }, situee ? 0 : 500);

    return () => {
      annule = true;
      clearTimeout(minuteur);
    };
  }, [
    boutique.id,
    checkoutForm.deliveryType,
    checkoutForm.deliveryLat,
    checkoutForm.deliveryLng,
    checkoutForm.deliveryAddress,
    checkoutForm.deliveryCity,
    checkoutForm.deliveryPostal,
  ]);

  // Un champ d'heure libre laissait choisir 9 h alors que la boutique ouvre à
  // 11 h : la commande partait et personne n'était là pour la remettre.
  useEffect(() => {
    if (!boutique.id || checkoutForm.deliveryType !== 'PICKUP') return;

    let annule = false;

    fetch(`${API_URL}/api/client/stores/${boutique.id}/pickup-slots`)
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => {
        if (!annule && donnees) setCreneaux(donnees.data || []);
      })
      .catch(() => undefined);

    return () => {
      annule = true;
    };
  }, [boutique.id, checkoutForm.deliveryType]);

  useEffect(() => {
    if (!boutique.id) return;

    let annule = false;

    fetch(`${API_URL}/api/client/stores/${boutique.id}/payment-methods`)
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => {
        if (annule || !donnees) return;

        const proposes: MoyenDePaiement[] = donnees.data || [];
        setMoyens(proposes);

        // Celui que le commerçant a mis par défaut, sinon le premier.
        const parDefaut = proposes.find((moyen) => moyen.isDefault) || proposes[0];
        if (parDefaut) setMoyenChoisi(parDefaut.id);
      })
      .catch(() => undefined);

    return () => {
      annule = true;
    };
  }, [boutique.id]);

  // Les frais de service de la plateforme, annoncés avant de valider : le
  // serveur les ajoute de toute façon.
  const [fraisDeService, setFraisDeService] = useState(0);

  useEffect(() => {
    let annule = false;
    fetch(`${API_URL}/api/client/service-fee`)
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => {
        if (!annule && donnees?.data) setFraisDeService(Number(donnees.data.frais) || 0);
      })
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, []);

  const sousTotal = totalDuPanier(lignes);

  /**
   * Les frais réellement facturés : ceux de la zone de livraison.
   *
   * La vitrine ajoutait 10 % de « frais de service » qui n'existaient nulle part
   * ailleurs — ni réglables, ni prélevés par le serveur.
   */
  const fraisDeLivraison =
    checkoutForm.deliveryType === 'DELIVERY' && livraison?.livrable ? livraison.frais : 0;
  const montantRemise = remise?.montant ?? 0;
  const total = Math.max(0, sousTotal + fraisDeLivraison + fraisDeService - montantRemise);

  /** Le panier atteint-il le minimum de la zone. */
  const sousLeMinimum =
    checkoutForm.deliveryType === 'DELIVERY' &&
    Boolean(livraison?.livrable) &&
    sousTotal < (livraison?.minimum ?? 0);

  /**
   * Vérifier le code promo auprès du serveur.
   *
   * Le composant existant appelait la route sans `storeId`, que celle-ci exige :
   * tout code était donc refusé par un « Paramètre storeId requis ».
   */
  const appliquerLeCode = async () => {
    const saisi = code.trim();
    if (!saisi) return;

    setCodeEnCours(true);
    setCodeRefuse('');

    try {
      const reponse = await fetch(
        `${API_URL}/api/promotions/validate?storeId=${boutique.id}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: saisi,
            cartTotal: Number(sousTotal.toFixed(2)),
            productIds: lignes.map((ligne) => ligne.productId),
          }),
        }
      );

      const lu = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        setRemise(null);
        setCodeRefuse(lu?.error || "Ce code promo n'est pas valable");
        return;
      }

      const montant = Number(lu?.discountAmount ?? lu?.data?.discountAmount ?? 0);

      if (!(montant > 0)) {
        setRemise(null);
        setCodeRefuse("Ce code n'accorde aucune remise sur ce panier");
        return;
      }

      setRemise({ code: saisi, montant });
    } catch {
      setCodeRefuse('Vérification impossible pour le moment');
    } finally {
      setCodeEnCours(false);
    }
  };

  const retirerLeCode = () => {
    setRemise(null);
    setCode('');
    setCodeRefuse('');
  };

  const commander = async () => {
    setCheckoutError('');

    if (!checkoutForm.customerName || !checkoutForm.customerEmail || !checkoutForm.customerPhone) {
      setCheckoutError('Veuillez remplir tous les champs obligatoires');
      setContactOuvert(true);
      return;
    }

    if (
      checkoutForm.deliveryType === 'DELIVERY' &&
      (!checkoutForm.deliveryAddress || !checkoutForm.deliveryCity)
    ) {
      setCheckoutError("Veuillez remplir l'adresse de livraison");
      setAdresseOuverte(true);
      return;
    }

    if (checkoutForm.deliveryType === 'PICKUP' && !checkoutForm.pickupTime) {
      setCheckoutError('Veuillez sélectionner une heure de retrait');
      return;
    }

    if (lignes.length === 0) {
      setCheckoutError('Votre panier est vide');
      return;
    }

    // Payée en espèces, la commande part au commerçant dès sa création : le
    // délai se place avant. Payée en ligne, elle n'attend que l'encaissement :
    // le délai se place au clic sur « Payer ».
    const moyen = moyens.find((m) => m.id === moyenChoisi);
    if (moyen?.type === 'CASH') {
      setEnAttente({ partir: () => void envoyer() });
      return;
    }

    await envoyer();
  };

  const envoyer = async () => {
    setSubmitting(true);

    try {
      const orderData = {
        conditionsAcceptees,
        storeId: boutique.id,
        customerName: checkoutForm.customerName,
        customerEmail: checkoutForm.customerEmail,
        customerPhone: telephoneInternational(checkoutForm.customerPhone, paysDuNavigateur()),
        deliveryType: checkoutForm.deliveryType,
        deliveryAddress: checkoutForm.deliveryAddress || undefined,
        deliveryCity: checkoutForm.deliveryCity || undefined,
        deliveryPostal: checkoutForm.deliveryPostal || undefined,
        deliveryLat: checkoutForm.deliveryLat,
        deliveryLng: checkoutForm.deliveryLng,
        pickupTime: checkoutForm.pickupTime || undefined,
        notes: checkoutForm.notes || undefined,
        // Le code part tel quel : le serveur recalcule la remise, comme il
        // recalcule les prix et les frais de livraison.
        promoCode: remise?.code || undefined,
        paymentMethodId: moyenChoisi || undefined,
        // L'API attend des euros (Decimal 10,2), pas des centimes.
        totalAmount: Number(total.toFixed(2)),
        taxAmount: 0,
        // Le serveur recalcule ces frais depuis la zone : on envoie ce qu'on a
        // affiché, il tranche.
        feesAmount: Number(fraisDeLivraison.toFixed(2)),
        // Le détail du panier : sans lui la commande n'enregistre qu'un montant,
        // et la facture comme le détail de commande restent vides.
        items: lignes.map((ligne) => ({
          productId: ligne.productId,
          quantity: ligne.quantity,
          price: ligne.price,
          // La cuisine a besoin de savoir laquelle préparer.
          ...(ligne.variantId ? { variantId: ligne.variantId } : {}),
        })),
      };

      const response = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        const erreur = await response.json().catch(() => null);
        setCheckoutError(erreur?.error || 'Erreur lors de la création de la commande');
        return;
      }

      const recue = await response.json();
      const id = recue.order?.id || recue.id;
      const commande = { id, numero: String(id).slice(-8).toUpperCase() };

      if (recue.order?.paiementEnLigne) {
        setAPayer({ ...commande, montant: Number(recue.order.totalAmount) });
        return;
      }

      surCommandePassee(commande);
    } catch (error) {
      console.error('Checkout error:', error);
      setCheckoutError('Erreur de connexion. Veuillez réessayer.');
    } finally {
      setSubmitting(false);
    }
  };

  const champ =
    'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-red-500';
  const carte = 'bg-gray-800 border border-gray-700 rounded-2xl';
  const boutonModifier =
    'shrink-0 rounded-full bg-gray-700 hover:bg-gray-600 px-4 py-2 text-sm font-semibold transition-colors';

  const enLivraison = checkoutForm.deliveryType === 'DELIVERY';
  const articles = nombreDArticles(lignes);
  const adresseBoutique = [boutique.address, boutique.city].filter(Boolean).join(', ');
  const contactComplet = Boolean(
    checkoutForm.customerName && checkoutForm.customerEmail && checkoutForm.customerPhone
  );
  const adresseComplete = Boolean(checkoutForm.deliveryAddress && checkoutForm.deliveryCity);

  const alerte = checkoutError ? (
    <div className="bg-red-600/20 border border-red-600/50 rounded-lg p-4 flex gap-3">
      <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
      <p className="text-red-400 text-sm">{checkoutError}</p>
    </div>
  ) : null;

  const libelleDuCreneau = (valeur: string) => {
    for (const jour of creneaux) {
      const trouve = jour.creneaux.find((c) => c.valeur === valeur);
      if (trouve) return `${jour.libelle}, ${trouve.libelle}`;
    }
    return valeur;
  };

  const delai = enAttente ? (
    <DelaiAnnulation
      lieu={enLivraison ? checkoutForm.deliveryAddress || 'Livraison' : `Retrait chez ${boutique.name}`}
      precisionLieu={
        enLivraison
          ? [checkoutForm.deliveryPostal, checkoutForm.deliveryCity].filter(Boolean).join(' ')
          : adresseBoutique
      }
      horaire={
        enLivraison
          ? livraison?.zone?.deliveryMinutes
            ? `Livraison : environ ${livraison.zone.deliveryMinutes} minutes`
            : 'Livraison dès que possible'
          : checkoutForm.pickupTime
            ? `Retrait : ${libelleDuCreneau(checkoutForm.pickupTime)}`
            : 'Retrait'
      }
      boutique={boutique.name}
      lignes={lignes}
      surPartir={() => {
        const { partir } = enAttente;
        setEnAttente(null);
        partir();
      }}
      surRetour={() => {
        setEnAttente(null);
        if (boutique.slug) router.push(`/store/${boutique.slug}`);
      }}
    />
  ) : null;

  if (aPayer) {
    return (
      <div className={`${carte} max-w-xl mx-auto p-6 space-y-4`}>
        {delai}
        <h3 className="font-bold text-lg">Paiement en ligne</h3>
        <p className="text-sm text-gray-400">
          Commande n° {aPayer.numero} — {euro(aPayer.montant)}. Elle sera transmise à{' '}
          {boutique.name} dès le paiement accepté.
        </p>
        <StripePayment
          orderId={aPayer.id}
          amount={aPayer.montant}
          customerEmail={checkoutForm.customerEmail}
          customerName={checkoutForm.customerName}
          demanderConfirmation={(payer) => setEnAttente({ partir: payer })}
          onPaymentComplete={(reussi) => {
            if (reussi) surCommandePassee({ id: aPayer.id, numero: aPayer.numero });
          }}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
      {delai}
      {/* ——— Colonne de gauche : où, comment, avec quoi ——— */}
      <div className="space-y-6 min-w-0">
        <section className={`${carte} p-6`}>
          <h2 className="text-xl font-bold mb-2">
            {enLivraison ? 'Détails de la livraison' : 'Détails du retrait'}
          </h2>

          {/* L'adresse, ou la boutique où passer prendre la commande. */}
          <div className="py-4 border-b border-gray-700">
            {enLivraison ? (
              <>
                <div className="flex items-center gap-4">
                  <MapPin size={22} className="text-gray-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">
                      {checkoutForm.deliveryAddress || 'Adresse de livraison'}
                    </p>
                    <p className="text-sm text-gray-400 truncate">
                      {adresseComplete
                        ? [checkoutForm.deliveryPostal, checkoutForm.deliveryCity]
                            .filter(Boolean)
                            .join(' ')
                        : 'Où devons-nous livrer ?'}
                    </p>
                  </div>
                  {!adresseOuverte && (
                    <button
                      type="button"
                      onClick={() => setAdresseOuverte(true)}
                      className={boutonModifier}
                    >
                      Modifier
                    </button>
                  )}
                </div>

                {adresseOuverte && (
                  <div className="mt-4 space-y-4">
                    <div>
                      <label
                        htmlFor="livraison-adresse"
                        className="text-sm text-gray-400 block mb-2"
                      >
                        Adresse *
                      </label>
                      <AddressAutocomplete
                        id="livraison-adresse"
                        value={checkoutForm.deliveryAddress}
                        onChange={(valeur) =>
                          setCheckoutForm({
                            ...checkoutForm,
                            deliveryAddress: valeur,
                            // Taper par-dessus une suggestion retenue rendrait ses
                            // coordonnées fausses.
                            deliveryLat: undefined,
                            deliveryLng: undefined,
                          })
                        }
                        onSelect={(adresse) =>
                          setCheckoutForm({
                            ...checkoutForm,
                            deliveryAddress: adresse.street,
                            deliveryCity: adresse.city || checkoutForm.deliveryCity,
                            deliveryPostal: adresse.postalCode || checkoutForm.deliveryPostal,
                            // Les coordonnées de l'adresse choisie étaient jetées :
                            // sans elles, le suivi ne peut afficher ni distance
                            // restante ni durée estimée.
                            deliveryLat: adresse.latitude ?? undefined,
                            deliveryLng: adresse.longitude ?? undefined,
                          })
                        }
                        className={champ}
                        placeholder="123 rue de la Paix"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-2">
                        <label
                          htmlFor="livraison-ville"
                          className="text-sm text-gray-400 block mb-2"
                        >
                          Ville *
                        </label>
                        <input
                          id="livraison-ville"
                          type="text"
                          value={checkoutForm.deliveryCity}
                          onChange={(e) =>
                            setCheckoutForm({ ...checkoutForm, deliveryCity: e.target.value })
                          }
                          className={champ}
                          placeholder="Paris"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="livraison-code-postal"
                          className="text-sm text-gray-400 block mb-2"
                        >
                          Code postal
                        </label>
                        <input
                          id="livraison-code-postal"
                          type="text"
                          inputMode="numeric"
                          value={checkoutForm.deliveryPostal}
                          onChange={(e) =>
                            setCheckoutForm({ ...checkoutForm, deliveryPostal: e.target.value })
                          }
                          className={champ}
                          placeholder="75002"
                        />
                      </div>
                    </div>

                    {adresseComplete && (
                      <button
                        type="button"
                        onClick={() => setAdresseOuverte(false)}
                        className={boutonModifier}
                      >
                        Valider l&apos;adresse
                      </button>
                    )}
                  </div>
                )}

                {/* Les conditions de la zone, dites avant de payer et non après. */}
                {livraison && !livraison.forfaitBoutique && (
                  <div
                    role="status"
                    className={`mt-4 rounded-lg px-3 py-2 text-sm border ${
                      !livraison.livrable
                        ? 'border-red-700/50 bg-red-900/20 text-red-200'
                        : sousTotal < livraison.minimum
                          ? 'border-amber-700/50 bg-amber-900/20 text-amber-200'
                          : 'border-green-700/50 bg-green-900/20 text-green-200'
                    }`}
                  >
                    {!livraison.livrable ? (
                      <p>{livraison.raison}</p>
                    ) : (
                      <>
                        <p className="font-semibold">
                          Zone « {livraison.zone?.name} »
                          {livraison.distanceKm !== null && ` — ${livraison.distanceKm} km`}
                        </p>
                        <p>
                          Livraison {euro(livraison.frais)}
                          {livraison.zone?.deliveryMinutes
                            ? `, environ ${livraison.zone.deliveryMinutes} min`
                            : ''}
                          {livraison.minimum > 0 && ` — minimum ${euro(livraison.minimum)}`}
                        </p>
                        {sousTotal < livraison.minimum && (
                          <p className="mt-1">
                            Il vous manque {euro(livraison.minimum - sousTotal)} pour atteindre
                            le minimum de cette zone.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-4">
                <IconeBoutique size={22} className="text-gray-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">Retrait chez {boutique.name}</p>
                  <p className="text-sm text-gray-400 truncate">
                    {adresseBoutique || 'À la boutique'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Les coordonnées du client. */}
          <div className="py-4 border-b border-gray-700">
            <div className="flex items-center gap-4">
              <User size={22} className="text-gray-300 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">
                  {checkoutForm.customerName || 'Vos informations'}
                </p>
                <p className="text-sm text-gray-400 truncate">
                  {contactComplet
                    ? `${checkoutForm.customerEmail} · ${checkoutForm.customerPhone}`
                    : 'Nom, e-mail et téléphone pour vous tenir informé'}
                </p>
              </div>
              {!contactOuvert && (
                <button
                  type="button"
                  onClick={() => setContactOuvert(true)}
                  className={boutonModifier}
                >
                  Modifier
                </button>
              )}
            </div>

            {contactOuvert && (
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="client-nom" className="text-sm text-gray-400 block mb-2">
                    Nom complet *
                  </label>
                  <input
                    id="client-nom"
                    type="text"
                    value={checkoutForm.customerName}
                    onChange={(e) =>
                      setCheckoutForm({ ...checkoutForm, customerName: e.target.value })
                    }
                    className={champ}
                    placeholder="Jean Dupont"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="client-email" className="text-sm text-gray-400 block mb-2">
                      Email *
                    </label>
                    <input
                      id="client-email"
                      type="email"
                      value={checkoutForm.customerEmail}
                      onChange={(e) =>
                        setCheckoutForm({ ...checkoutForm, customerEmail: e.target.value })
                      }
                      className={champ}
                      placeholder="jean@example.com"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="client-telephone"
                      className="text-sm text-gray-400 block mb-2"
                    >
                      Téléphone *
                    </label>
                    <input
                      id="client-telephone"
                      type="tel"
                      value={checkoutForm.customerPhone}
                      onChange={(e) =>
                        setCheckoutForm({ ...checkoutForm, customerPhone: e.target.value })
                      }
                      className={champ}
                      placeholder="+33 6 12 34 56 78"
                    />
                  </div>
                </div>

                {contactComplet && (
                  <button
                    type="button"
                    onClick={() => setContactOuvert(false)}
                    className={boutonModifier}
                  >
                    Valider
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Les instructions : sonnette, étage, allergies. */}
          <div className="pt-4">
            <div className="flex items-center gap-4">
              <MessageSquare size={22} className="text-gray-300 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">Instructions</p>
                <p className="text-sm text-gray-400 truncate">
                  {checkoutForm.notes ||
                    (enLivraison
                      ? 'Étage, code d’entrée, allergies…'
                      : 'Allergies, précisions pour la boutique…')}
                </p>
              </div>
              {!notesOuvertes && (
                <button
                  type="button"
                  onClick={() => setNotesOuvertes(true)}
                  className={boutonModifier}
                >
                  {checkoutForm.notes ? 'Modifier' : 'Ajouter'}
                </button>
              )}
            </div>

            {notesOuvertes && (
              <div className="mt-4 space-y-3">
                <textarea
                  aria-label="Instructions"
                  value={checkoutForm.notes}
                  onChange={(e) => setCheckoutForm({ ...checkoutForm, notes: e.target.value })}
                  className={`${champ} h-20`}
                  placeholder="Instructions spéciales, allergies, etc..."
                />
                <button
                  type="button"
                  onClick={() => setNotesOuvertes(false)}
                  className={boutonModifier}
                >
                  Valider
                </button>
              </div>
            )}
          </div>

          <h2 className="text-xl font-bold mt-8 mb-4">Options de livraison</h2>
          <div className="space-y-3" role="radiogroup" aria-label="Mode de livraison">
            <label
              className={`flex items-center gap-4 rounded-xl border-2 px-5 py-4 transition-colors ${
                enLivraison ? 'border-white bg-gray-700/40' : 'border-gray-700'
              } ${
                livraisonFermee
                  ? 'opacity-50 cursor-not-allowed'
                  : 'cursor-pointer hover:border-gray-500'
              }`}
            >
              <input
                type="radio"
                name="deliveryType"
                value="DELIVERY"
                checked={enLivraison}
                disabled={livraisonFermee}
                onChange={() => setCheckoutForm({ ...checkoutForm, deliveryType: 'DELIVERY' })}
                className="sr-only"
              />
              <Bike size={24} className="text-green-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">Livraison</p>
                <p className="text-sm text-gray-400">
                  {livraisonFermee
                    ? 'Indisponible : la boutique est fermée pour le moment'
                    : livraison?.livrable && livraison.zone?.deliveryMinutes
                      ? `Environ ${livraison.zone.deliveryMinutes} minutes · Livré chez vous`
                      : 'Livré chez vous'}
                </p>
              </div>
              {livraison?.livrable && (
                <span className="text-sm text-gray-300 whitespace-nowrap">
                  {livraison.frais > 0 ? `+${euro(livraison.frais)}` : 'Offerte'}
                </span>
              )}
            </label>

            <label
              className={`flex items-center gap-4 rounded-xl border-2 px-5 py-4 cursor-pointer transition-colors hover:border-gray-500 ${
                !enLivraison ? 'border-white bg-gray-700/40' : 'border-gray-700'
              }`}
            >
              <input
                type="radio"
                name="deliveryType"
                value="PICKUP"
                checked={!enLivraison}
                onChange={() => setCheckoutForm({ ...checkoutForm, deliveryType: 'PICKUP' })}
                className="sr-only"
              />
              <CalendarClock size={24} className="text-gray-300 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">Retrait sur place</p>
                <p className="text-sm text-gray-400">
                  Choisissez une heure et passez la récupérer
                </p>
              </div>
            </label>
          </div>

          {/* Un champ d'heure libre laissait choisir une heure où la boutique
              est fermée : seuls ses vrais créneaux sont proposés. */}
          {!enLivraison && (
            <div className="mt-4">
              <label htmlFor="creneau" className="text-sm text-gray-400 block mb-2">
                Heure de retrait *
              </label>

              {creneaux.length === 0 ? (
                <p className="text-sm text-amber-300 bg-amber-900/20 border border-amber-700/40 rounded-lg px-3 py-2">
                  Aucun créneau de retrait disponible pour les prochains jours. Choisissez la
                  livraison, ou revenez plus tard.
                </p>
              ) : (
                <select
                  id="creneau"
                  value={checkoutForm.pickupTime}
                  onChange={(e) => setCheckoutForm({ ...checkoutForm, pickupTime: e.target.value })}
                  className={champ}
                >
                  <option value="">Choisir un créneau</option>
                  {creneaux.map((jour) => (
                    <optgroup key={jour.date} label={jour.libelle}>
                      {jour.creneaux.map((creneau) => (
                        <option key={creneau.valeur} value={creneau.valeur}>
                          {creneau.libelle}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </div>
          )}
        </section>

        {/* Les moyens de paiement du commerçant. Ils existaient en base sans
            qu'aucun écran ne les montre au client. */}
        {moyens.length > 0 && (
          <section className={`${carte} p-6`}>
            <h2 className="text-xl font-bold mb-4">Moyen de paiement</h2>
            <div className="space-y-3" role="radiogroup" aria-label="Moyen de paiement">
              {moyens.map((moyen) => (
                <label
                  key={moyen.id}
                  className={`flex items-center gap-4 rounded-xl border-2 px-5 py-4 cursor-pointer transition-colors hover:border-gray-500 ${
                    moyenChoisi === moyen.id ? 'border-white bg-gray-700/40' : 'border-gray-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="moyenDePaiement"
                    value={moyen.id}
                    checked={moyenChoisi === moyen.id}
                    onChange={() => setMoyenChoisi(moyen.id)}
                    className="sr-only"
                  />
                  <CreditCard size={22} className="text-gray-300 shrink-0" />
                  <span className="flex-1 font-semibold">{moyen.name}</span>
                </label>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ——— Colonne de droite : la boutique, le panier, le total ——— */}
      <aside className={`${carte} overflow-hidden lg:sticky lg:top-6`}>
        {/* La boutique : un clic ramène à son menu pour compléter le panier. */}
        {boutique.slug ? (
          <Link
            href={`/store/${boutique.slug}`}
            className="flex items-center gap-4 p-6 text-white hover:text-white hover:bg-gray-700/40 transition-colors"
          >
            <EnTeteBoutique boutique={boutique} adresse={adresseBoutique} />
            <ChevronRight size={20} className="text-gray-400 shrink-0" />
          </Link>
        ) : (
          <div className="flex items-center gap-4 p-6">
            <EnTeteBoutique boutique={boutique} adresse={adresseBoutique} />
          </div>
        )}

        {/* Le récapitulatif du panier, replié comme un reçu. */}
        <div className="border-t-8 border-gray-900">
          <button
            type="button"
            onClick={() => setPanierDeplie((deplie) => !deplie)}
            aria-expanded={panierDeplie}
            className="w-full flex items-center gap-4 px-6 py-5 hover:bg-gray-700/40 transition-colors text-left"
          >
            <ShoppingCart size={22} className="text-gray-300 shrink-0" />
            <span className="flex-1 font-semibold">
              Récapitulatif du panier ({articles} article{articles > 1 ? 's' : ''})
            </span>
            <ChevronDown
              size={20}
              className={`text-gray-400 transition-transform ${panierDeplie ? 'rotate-180' : ''}`}
            />
          </button>

          {panierDeplie && (
            <ul className="px-6 pb-5 space-y-3">
              {lignes.map((ligne) => (
                <li
                  key={cleDeLigne(ligne.productId, ligne.variantId)}
                  className="flex justify-between gap-4 text-sm"
                >
                  <span className="min-w-0">
                    <span className="text-gray-400">{ligne.quantity} × </span>
                    {ligne.name}
                    {/* Sans le nom de la déclinaison, deux lignes du même plat
                        seraient indistinguables. */}
                    {ligne.variantNom && (
                      <span className="text-gray-400"> — {ligne.variantNom}</span>
                    )}
                  </span>
                  <span className="whitespace-nowrap">{euro(ligne.price * ligne.quantity)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Le code promo, derrière son lien comme le reste des options. */}
        <div className="border-t-8 border-gray-900 px-6 py-5">
          <h3 className="text-lg font-bold mb-3">Promotion</h3>

          {remise ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-green-700/50 bg-green-900/20 px-3 py-2 text-sm text-green-200">
              <span>
                Code « {remise.code} » appliqué — {euro(remise.montant)} de remise
              </span>
              <button
                type="button"
                onClick={retirerLeCode}
                className="text-green-300 underline hover:text-green-100"
              >
                Retirer
              </button>
            </div>
          ) : promoOuverte ? (
            <div className="flex gap-2">
              <input
                id="code-promo"
                type="text"
                aria-label="Code promotionnel"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') appliquerLeCode();
                }}
                className={champ}
                placeholder="BIENVENUE10"
                autoFocus
              />
              <button
                type="button"
                onClick={appliquerLeCode}
                disabled={codeEnCours || code.trim().length === 0}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {codeEnCours ? 'Vérification…' : 'Appliquer'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPromoOuverte(true)}
              className="w-full flex items-center gap-4 text-left hover:text-white text-gray-200"
            >
              <Tag size={20} className="text-gray-300 shrink-0" />
              <span className="flex-1 font-semibold">Ajouter un code promotionnel</span>
              <ChevronRight size={20} className="text-gray-400" />
            </button>
          )}

          {codeRefuse && (
            <p role="status" className="mt-2 text-sm text-amber-300">
              {codeRefuse}
            </p>
          )}
        </div>

        {/* Le total, puis le bouton : on sait ce qu'on paie avant de cliquer. */}
        <div className="border-t-8 border-gray-900 px-6 py-5 space-y-3">
          <h3 className="text-lg font-bold">Total de la commande</h3>
          <div className="flex justify-between text-gray-300">
            <span>Sous-total</span>
            <span>{euro(sousTotal)}</span>
          </div>
          {fraisDeService > 0 && (
            <div className="flex justify-between text-gray-300">
              <span>Frais de service</span>
              <span>{euro(fraisDeService)}</span>
            </div>
          )}
          <div className="flex justify-between text-gray-300">
            <span>
              Livraison
              {enLivraison && livraison?.zone ? ` — ${livraison.zone.name}` : ''}
            </span>
            <span>{enLivraison ? euro(fraisDeLivraison) : 'Retrait sur place'}</span>
          </div>
          {remise && (
            <div className="flex justify-between text-green-300">
              <span>Remise — {remise.code}</span>
              <span>− {euro(remise.montant)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold border-t border-gray-700 pt-3">
            <span>Total</span>
            <span>{euro(total)}</span>
          </div>

          {alerte}

          <AcceptationConditions
            coche={conditionsAcceptees}
            onChange={setConditionsAcceptees}
            documents={[{ href: '/cgv', libelle: 'les conditions générales de vente' }]}
          />

          <button
            onClick={commander}
            // Hors zone ou sous le minimum, le serveur refuserait : autant le dire
            // avant que le client valide.
            disabled={
              submitting ||
              !conditionsAcceptees ||
              sousLeMinimum ||
              (enLivraison && livraison?.livrable === false)
            }
            className="w-full py-4 bg-red-600 hover:bg-red-700 rounded-xl text-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting
              ? 'Traitement...'
              : sousLeMinimum
                ? `Minimum ${euro(livraison?.minimum ?? 0)}`
                : enLivraison && livraison?.livrable === false
                  ? 'Adresse non livrée'
                  : 'Confirmer la Commande'}
          </button>

          <p className="text-xs text-gray-500 leading-relaxed">
            En confirmant, vous transmettez votre commande à {boutique.name}. Elle sera
            préparée dès que la boutique l&apos;aura acceptée ; vous en serez averti par e-mail.
          </p>
        </div>
      </aside>
    </div>
  );
}

/** Le logo, le nom et l'adresse de la boutique, en tête du récapitulatif. */
function EnTeteBoutique({ boutique, adresse }: { boutique: BoutiqueCommandee; adresse: string }) {
  return (
    <>
      {boutique.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={boutique.logo}
          alt=""
          className="w-14 h-14 rounded-full object-cover bg-gray-700 shrink-0"
        />
      ) : (
        <span className="w-14 h-14 rounded-full bg-red-600 text-white flex items-center justify-center text-xl font-bold shrink-0">
          {boutique.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block font-semibold text-lg truncate">{boutique.name}</span>
        {adresse && <span className="block text-sm text-gray-400 truncate">{adresse}</span>}
      </span>
    </>
  );
}
