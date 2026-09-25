import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Cookies et traceurs — Zupone' };

export default function Cookies() {
  return (
    <>
      <h1>Cookies et traceurs</h1>
      <p>
        Zupone n’utilise <strong>aucun cookie publicitaire ni de mesure d’audience tierce</strong>.
        Les seuls traceurs déposés sont strictement nécessaires au service ; conformément à
        l’article 82 de la loi Informatique et Libertés, ils sont exemptés de consentement.
      </p>

      <h2>Traceurs utilisés</h2>
      <table>
        <thead>
          <tr><th>Nom</th><th>Type</th><th>Rôle</th><th>Durée</th></tr>
        </thead>
        <tbody>
          <tr><td>Cookie de langue</td><td>cookie</td><td>mémoriser la langue choisie</td><td>1 an</td></tr>
          <tr><td>accessToken, refreshToken, driverToken</td><td>stockage local</td><td>maintenir la session connectée</td><td>jusqu’à la déconnexion</td></tr>
          <tr><td>currentOrgId, currentDriverId, userEmail</td><td>stockage local</td><td>retrouver la boutique ou le compte actif</td><td>jusqu’à la déconnexion</td></tr>
          <tr><td>Panier</td><td>stockage local</td><td>conserver le panier entre deux visites</td><td>jusqu’à la commande ou au vidage</td></tr>
          <tr><td>selectedTheme</td><td>stockage local</td><td>mémoriser le thème d’affichage</td><td>persistant</td></tr>
          <tr><td>Cookies Stripe</td><td>cookie tiers</td><td>sécuriser le paiement et prévenir la fraude, uniquement lors du paiement</td><td>selon Stripe</td></tr>
        </tbody>
      </table>

      <h2>Services tiers</h2>
      <p>
        L’affichage des cartes charge des tuiles OpenStreetMap et les suggestions d’adresse
        interrogent Photon (Komoot) : ces services reçoivent votre adresse IP, sans déposer de cookie
        de suivi.
      </p>

      <h2>Les supprimer</h2>
      <p>
        La déconnexion efface les jetons de session. Vous pouvez supprimer à tout moment cookies et
        stockage local depuis les réglages de votre navigateur ; le site vous demandera alors de vous
        reconnecter.
      </p>

      <h2>Évolution</h2>
      <p>
        Si des traceurs soumis à consentement (mesure d’audience, publicité) étaient ajoutés, un
        bandeau vous permettrait de les accepter ou de les refuser aussi facilement, avant tout dépôt.
        Voir aussi la <Link href="/confidentialite">politique de confidentialité</Link>.
      </p>
    </>
  );
}
