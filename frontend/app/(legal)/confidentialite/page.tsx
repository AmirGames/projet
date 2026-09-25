import type { Metadata } from 'next';
import Link from 'next/link';
import { EDITEUR } from '@/lib/editeur';

export const metadata: Metadata = { title: 'Politique de confidentialité — Zupone' };

export default function Confidentialite() {
  const e = EDITEUR;
  return (
    <>
      <h1>Politique de confidentialité</h1>
      <p>
        {e.raisonSociale} (Zupone) est responsable des traitements décrits ci-dessous, conformément au
        règlement (UE) 2016/679 (RGPD) et à la loi Informatique et Libertés. Chaque commerçant est
        responsable des traitements qu’il réalise pour ses propres besoins.
      </p>

      <h2>Données traitées et finalités</h2>
      <table>
        <thead>
          <tr><th>Finalité</th><th>Données</th><th>Base légale</th><th>Durée</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Gestion du compte</td>
            <td>nom, e-mail, téléphone, mot de passe (chiffré)</td>
            <td>contrat</td>
            <td>jusqu’à suppression, ou 3 ans d’inactivité</td>
          </tr>
          <tr>
            <td>Commandes et livraison</td>
            <td>produits, adresse, coordonnées, instructions, historique</td>
            <td>contrat</td>
            <td>durée de la relation, puis 5 ans (prescription)</td>
          </tr>
          <tr>
            <td>Paiement</td>
            <td>montant, statut ; la carte est traitée par Stripe seul</td>
            <td>contrat</td>
            <td>10 ans pour les pièces comptables</td>
          </tr>
          <tr>
            <td>Suivi en temps réel</td>
            <td>position du livreur pendant la course</td>
            <td>contrat</td>
            <td>durée de la course, puis trace conservée 1 an pour litiges</td>
          </tr>
          <tr>
            <td>Dossier commerçant / livreur</td>
            <td>pièces justificatives, SIRET, coordonnées bancaires</td>
            <td>contrat et obligation légale</td>
            <td>durée de la relation + 5 ans</td>
          </tr>
          <tr>
            <td>Support et réclamations</td>
            <td>messages, pièces jointes</td>
            <td>intérêt légitime</td>
            <td>3 ans après clôture</td>
          </tr>
          <tr>
            <td>Sécurité et prévention de la fraude</td>
            <td>journaux de connexion, adresse IP</td>
            <td>obligation légale / intérêt légitime</td>
            <td>1 an</td>
          </tr>
          <tr>
            <td>Notifications</td>
            <td>abonnement aux notifications push</td>
            <td>consentement</td>
            <td>jusqu’au retrait du consentement</td>
          </tr>
        </tbody>
      </table>

      <h2>Destinataires</h2>
      <ul>
        <li>le commerçant et, en livraison, le livreur, pour ce qui est nécessaire à la commande ;</li>
        <li>Stripe (paiement) ;</li>
        <li>notre hébergeur ({e.hebergeur.nom}) ;</li>
        <li>le service de géocodage Photon (Komoot) pour les suggestions d’adresse, et OpenStreetMap pour l’affichage des cartes ;</li>
        <li>les autorités, sur réquisition légale.</li>
      </ul>
      <p>
        Nous ne vendons aucune donnée. Lorsqu’un prestataire traite des données hors de l’Union
        européenne, le transfert est encadré par les clauses contractuelles types de la Commission
        européenne ou une décision d’adéquation.
      </p>

      <h2>Vos droits</h2>
      <p>
        Vous disposez des droits d’accès, de rectification, d’effacement, de limitation, d’opposition,
        de portabilité et du droit de retirer votre consentement, ainsi que de définir des directives
        sur le sort de vos données après votre décès. Écrivez à{' '}
        <a href={`mailto:${e.emailDonnees}`}>{e.emailDonnees}</a> ; nous répondons sous un mois. Vous
        pouvez aussi saisir la CNIL (<a href="https://www.cnil.fr">cnil.fr</a>).
      </p>

      <h2>Sécurité</h2>
      <p>
        Mots de passe hachés, échanges chiffrés (HTTPS), accès restreint par rôle et journalisé,
        sauvegardes régulières.
      </p>

      <h2>Cookies</h2>
      <p>Voir la page <Link href="/cookies">cookies et traceurs</Link>.</p>
    </>
  );
}
