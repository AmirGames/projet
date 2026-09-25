import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Conditions livreurs — Zupone' };

export default function ConditionsLivreurs() {
  return (
    <>
      <h1>Conditions générales livreurs</h1>
      <p>
        Ces conditions lient Zupone et les livreurs indépendants qui réalisent des courses via la
        plateforme. Elles complètent les <Link href="/cgu">CGU</Link>.
      </p>

      <h2>1. Statut</h2>
      <p>
        Le livreur exerce en tant que travailleur indépendant (micro-entrepreneur ou société). Il n’est
        lié par aucun lien de subordination : il choisit librement ses périodes de connexion, peut
        refuser une course sans pénalité et peut travailler pour d’autres plateformes.
      </p>

      <h2>2. Validation du dossier</h2>
      <p>
        Avant toute course, le livreur fournit : pièce d’identité, justificatif d’immatriculation,
        droit de travailler en France, et selon le véhicule permis, carte grise et assurance adaptée.
        Zupone valide le dossier et peut le refuser s’il est incomplet ou non conforme.
      </p>

      <h2>3. Réalisation des courses</h2>
      <ul>
        <li>le prix de chaque course est affiché avant acceptation ;</li>
        <li>le livreur remet la commande en l’état, dans le respect du code de la route ;</li>
        <li>il peut être demandé une preuve de remise (photo, code) ;</li>
        <li>la localisation n’est partagée que pendant une course ou une période de disponibilité.</li>
      </ul>

      <h2>4. Rémunération</h2>
      <p>
        Les sommes dues sont reversées périodiquement ; le détail des versements est consultable dans
        l’espace livreur. Le livreur s’acquitte lui-même de ses cotisations sociales et impôts.
      </p>

      <h2>5. Notes</h2>
      <p>
        Les clients peuvent noter les livraisons. Les notes ne sont jamais la seule base d’une
        désactivation, qui est toujours motivée et peut être contestée auprès du support.
      </p>

      <h2>6. Assurance et sécurité</h2>
      <p>
        Le livreur justifie d’une assurance responsabilité civile professionnelle et d’une assurance
        de son véhicule couvrant l’usage professionnel. Il peut signaler tout incident via
        l’application.
      </p>

      <h2>7. Fin de la relation</h2>
      <p>
        Le livreur peut clôturer son compte à tout moment. Zupone peut désactiver un compte en cas de
        fraude, de mise en danger ou de manquement grave, après en avoir exposé les motifs.
      </p>
    </>
  );
}
