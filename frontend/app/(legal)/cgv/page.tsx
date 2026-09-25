import type { Metadata } from 'next';
import Link from 'next/link';
import { EDITEUR } from '@/lib/editeur';

export const metadata: Metadata = { title: 'Conditions générales de vente — Zupone' };

export default function Cgv() {
  return (
    <>
      <h1>Conditions générales de vente</h1>
      <p>
        Ces conditions s’appliquent à toute commande passée par un client auprès d’un commerçant via
        Zupone. Le vendeur est le commerçant dont l’identité figure sur la vitrine ; Zupone agit en
        intermédiaire et encaisse le paiement pour son compte.
      </p>

      <h2>1. Commande</h2>
      <p>
        Le client compose son panier, choisit le retrait ou la livraison, et valide après avoir vu le
        récapitulatif : produits, frais de livraison, frais de service et total TTC. La commande est
        ferme une fois le paiement accepté ; le commerçant peut la refuser (rupture, fermeture, zone
        non desservie), auquel cas le client est intégralement remboursé.
      </p>

      <h2>2. Prix</h2>
      <p>
        Les prix sont affichés en euros TTC, fixés par chaque commerçant. S’y ajoutent, affichés avant
        validation :
      </p>
      <ul>
        <li>les frais de livraison, selon la zone de l’adresse ;</li>
        <li>des frais de service de 0,25 € par commande, perçus par Zupone ;</li>
        <li>le cas échéant, un minimum de commande propre au commerçant.</li>
      </ul>

      <h2>3. Paiement</h2>
      <p>
        Le paiement s’effectue par carte bancaire via notre prestataire Stripe. Zupone ne stocke
        jamais les données de carte. Le débit intervient à la validation de la commande.
      </p>

      <h2>4. Retrait et livraison</h2>
      <p>
        Les délais et créneaux sont indicatifs. En livraison, le client doit être joignable à
        l’adresse indiquée ; une preuve de remise peut être recueillie par le livreur. Le suivi de la
        course est disponible en temps réel.
      </p>

      <h2>5. Annulation</h2>
      <p>
        Le client peut annuler sans frais tant que le commerçant n’a pas accepté la commande, dans le
        délai affiché. Au-delà, l’annulation n’est plus possible, la préparation ayant commencé.
      </p>

      <h2>6. Droit de rétractation</h2>
      <p>
        Conformément à l’article L221-28 du Code de la consommation, le droit de rétractation ne
        s’applique pas aux denrées susceptibles de se détériorer ou de se périmer rapidement, ni aux
        biens confectionnés selon les spécifications du client. Pour les autres produits non
        périssables, le client dispose de 14 jours à compter de la réception pour se rétracter, en
        contactant <a href={`mailto:${EDITEUR.email}`}>{EDITEUR.email}</a>.
      </p>

      <h2>7. Réclamations</h2>
      <p>
        Produit manquant, erroné ou non conforme : signalez-le depuis votre espace (support) ou à{' '}
        <a href={`mailto:${EDITEUR.email}`}>{EDITEUR.email}</a> dans les 48 heures, avec si possible
        une photo. Un remboursement total ou partiel est accordé lorsque la réclamation est fondée.
        Les garanties légales de conformité et des vices cachés restent applicables.
      </p>

      <h2>8. Allergènes et alcool</h2>
      <p>
        Les informations sur les allergènes sont fournies par le commerçant ; en cas de doute,
        contactez-le avant de commander. La vente d’alcool est interdite aux mineurs : une pièce
        d’identité peut être demandée à la remise.
      </p>

      <h2>9. Litiges</h2>
      <p>
        Voir la médiation dans les <Link href="/mentions-legales">mentions légales</Link>. Droit
        français applicable.
      </p>
    </>
  );
}
