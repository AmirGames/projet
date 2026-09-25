import type { Metadata } from 'next';
import Link from 'next/link';
import { EDITEUR } from '@/lib/editeur';

export const metadata: Metadata = { title: 'Conditions générales d’utilisation — Zupone' };

export default function Cgu() {
  return (
    <>
      <h1>Conditions générales d’utilisation</h1>
      <p>
        Les présentes conditions encadrent l’accès et l’usage de la plateforme Zupone, éditée par{' '}
        {EDITEUR.raisonSociale} (voir les <Link href="/mentions-legales">mentions légales</Link>).
        Utiliser le site, avec ou sans compte, vaut acceptation de ces conditions.
      </p>

      <h2>1. Objet</h2>
      <p>
        Zupone permet aux clients de commander auprès de commerces de proximité, en retrait ou en
        livraison, aux commerçants de gérer leur boutique en ligne et aux livreurs de réaliser des
        courses. Les ventes elles-mêmes relèvent des{' '}
        <Link href="/cgv">conditions générales de vente</Link>.
      </p>

      <h2>2. Compte</h2>
      <ul>
        <li>La commande est possible sans compte ; le compte permet de suivre ses commandes et de retrouver ses paniers.</li>
        <li>Les informations fournies doivent être exactes et tenues à jour.</li>
        <li>L’utilisateur garde son mot de passe confidentiel et répond de l’usage de son compte.</li>
        <li>Il faut avoir 16 ans pour créer un compte, et 18 ans pour commander de l’alcool.</li>
        <li>Le compte peut être supprimé à tout moment sur simple demande à <a href={`mailto:${EDITEUR.email}`}>{EDITEUR.email}</a>.</li>
      </ul>

      <h2>3. Comportements interdits</h2>
      <ul>
        <li>passer de fausses commandes ou usurper l’identité d’autrui ;</li>
        <li>publier des contenus illicites, trompeurs, injurieux ou portant atteinte aux droits de tiers ;</li>
        <li>tenter d’accéder aux données d’autres utilisateurs ou de perturber le service ;</li>
        <li>extraire massivement les données du site par des moyens automatisés ;</li>
        <li>contourner la plateforme pour régler une commande passée via Zupone.</li>
      </ul>
      <p>
        Tout manquement peut entraîner la restriction, la suspension ou la fermeture du compte, après
        information de l’intéressé sauf urgence.
      </p>

      <h2>4. Avis et notes</h2>
      <p>
        Les notes attribuées aux livreurs reflètent l’expérience réelle de l’utilisateur. Zupone peut
        retirer une note manifestement abusive. Les notes ne sont pas rémunérées.
      </p>

      <h2>5. Disponibilité</h2>
      <p>
        Zupone s’efforce de maintenir le service accessible mais ne garantit pas une disponibilité
        continue : des interruptions pour maintenance peuvent survenir, annoncées lorsque c’est possible.
      </p>

      <h2>6. Responsabilité</h2>
      <p>
        Zupone répond du bon fonctionnement de la plateforme. Chaque commerçant répond des produits
        qu’il vend et des informations de sa vitrine (prix, allergènes, disponibilité).
      </p>

      <h2>7. Données personnelles</h2>
      <p>
        Voir la <Link href="/confidentialite">politique de confidentialité</Link> et la page{' '}
        <Link href="/cookies">cookies</Link>.
      </p>

      <h2>8. Modification</h2>
      <p>
        Ces conditions peuvent évoluer. Les titulaires d’un compte sont prévenus de toute modification
        substantielle au moins 15 jours avant son entrée en vigueur.
      </p>

      <h2>9. Droit applicable</h2>
      <p>
        Droit français. En cas de litige, une solution amiable est recherchée en priorité ; le
        consommateur peut saisir le médiateur mentionné dans les mentions légales ou la juridiction
        compétente selon les règles de droit commun.
      </p>
    </>
  );
}
