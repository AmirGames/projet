import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Conditions commerçants — Zupone' };

export default function ConditionsCommercants() {
  return (
    <>
      <h1>Conditions générales commerçants</h1>
      <p>
        Ces conditions lient Zupone et tout professionnel qui ouvre une boutique sur la plateforme.
        Elles complètent les <Link href="/cgu">CGU</Link>.
      </p>

      <h2>1. Inscription</h2>
      <p>
        Le commerçant fournit un dossier exact et à jour (identité de l’entreprise, SIRET, TVA le cas
        échéant, coordonnées bancaires, autorisations propres à son activité). Zupone peut refuser ou
        suspendre une boutique dont le dossier est incomplet ou inexact.
      </p>

      <h2>2. Obligations du commerçant</h2>
      <ul>
        <li>il est le vendeur et répond de la conformité, de l’hygiène et de la sécurité des produits ;</li>
        <li>il affiche des prix TTC exacts, les allergènes et toute information obligatoire ;</li>
        <li>il tient à jour ses horaires, stocks et zones de livraison ;</li>
        <li>il accepte ou refuse chaque commande dans le délai prévu ;</li>
        <li>lorsqu’il assure sa propre livraison, il en porte la responsabilité et respecte le droit du travail et des transports.</li>
      </ul>

      <h2>3. Formules et commissions</h2>
      <p>
        Le commerçant souscrit une formule (prix, nombre de boutiques) et paie une commission sur les
        ventes, dont le taux dépend de qui livre (propre livraison ou livreurs de la plateforme). Les
        tarifs en vigueur sont affichés lors de la souscription ; toute hausse est notifiée au moins
        30 jours à l’avance, le commerçant pouvant alors résilier sans frais.
      </p>

      <h2>4. Encaissement et reversement</h2>
      <p>
        Zupone encaisse le paiement des clients pour le compte du commerçant, via Stripe, et lui
        reverse les sommes dues après déduction des commissions et frais. Une facture mensuelle
        détaille chaque ligne.
      </p>

      <h2>5. Données des clients</h2>
      <p>
        Le commerçant n’utilise les données des clients que pour exécuter les commandes. Toute
        prospection commerciale suppose le consentement du client. Il agit en responsable de
        traitement pour ses propres usages et garantit leur conformité au RGPD.
      </p>

      <h2>6. Contenus</h2>
      <p>
        Le commerçant garantit détenir les droits sur les photos, logos et textes qu’il publie, et
        concède à Zupone le droit de les afficher pour la durée de la relation.
      </p>

      <h2>7. Suspension et résiliation</h2>
      <p>
        Chaque partie peut résilier à tout moment avec un préavis de 30 jours. Zupone peut suspendre
        sans préavis une boutique en cas de manquement grave (fraude, produits dangereux, plaintes
        répétées), en motivant sa décision conformément au règlement (UE) 2019/1150.
      </p>

      <h2>8. Classement</h2>
      <p>
        L’ordre d’affichage des commerces dépend principalement de la distance, de l’ouverture et de
        la zone de livraison. Aucun classement payant n’est pratiqué à ce jour.
      </p>

      <h2>9. Réclamations et droit applicable</h2>
      <p>
        Les réclamations passent par le support commerçant. Droit français ; tribunal de commerce du
        siège de Zupone compétent.
      </p>
    </>
  );
}
