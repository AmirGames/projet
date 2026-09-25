import type { Metadata } from 'next';
import { PageDevenir } from '@/components/PageDevenir';
import { EMAIL_CONTACT } from '@/lib/editeur';

export const metadata: Metadata = {
  title: 'Devenir chauffeur VTC — Zupone',
  description: 'Transportez des passagers avec Zupone en tant que chauffeur VTC indépendant.',
};

// Le transport de personnes n'est pas encore ouvert : la page recueille les
// candidatures par e-mail en attendant l'inscription en ligne.
export default function DevenirChauffeurPage() {
  return (
    <PageDevenir
      badge="Chauffeur VTC Zupone · bientôt"
      titre="Conduisez des passagers dans votre ville"
      accroche="Zupone prépare son service de transport de personnes. Chauffeurs VTC, faites-vous connaître dès maintenant pour faire partie des premiers sur la plateforme."
      cta={{
        libelle: 'Je suis intéressé',
        href: `mailto:${EMAIL_CONTACT}?subject=${encodeURIComponent('Candidature chauffeur VTC')}`,
      }}
      avantages={[
        { icone: '🕒', titre: 'Vous choisissez vos horaires', texte: 'Connectez-vous quand vous êtes disponible, sans planning imposé.' },
        { icone: '📍', titre: 'Courses à proximité', texte: 'Les demandes de trajet sont proposées au chauffeur disponible le plus proche.' },
        { icone: '💶', titre: 'Prix affiché à l’avance', texte: 'Le montant de la course est connu avant que vous l’acceptiez.' },
      ]}
      etapes={[
        { titre: 'Faites-vous connaître', texte: 'Envoyez-nous vos coordonnées et votre ville.' },
        { titre: 'Dossier', texte: 'Carte VTC, permis, assurance, carte grise et statut d’indépendant.' },
        { titre: 'Validation', texte: 'Notre équipe vérifie vos documents et votre véhicule.' },
        { titre: 'Premiers trajets', texte: 'À l’ouverture du service, passez en ligne et acceptez vos courses.' },
      ]}
      prerequis={[
        'Une carte professionnelle VTC en cours de validité',
        'Un permis B depuis au moins 3 ans',
        'Un véhicule conforme aux exigences VTC, inscrit au registre, avec assurance transport de personnes',
        'Un statut d’indépendant (société ou micro‑entreprise) avec numéro SIRET',
        'Un smartphone avec connexion internet et localisation',
      ]}
      questions={[
        { question: 'Quand le service ouvre-t-il ?', reponse: 'Le transport de personnes est en préparation. Les chauffeurs qui se sont fait connaître seront prévenus en premier.' },
        { question: 'Je n’ai pas encore ma carte VTC, puis-je candidater ?', reponse: 'La carte VTC est obligatoire pour transporter des passagers. En attendant, vous pouvez devenir livreur en voiture.' },
        { question: 'Puis-je aussi livrer des commandes ?', reponse: 'Oui, vous pouvez créer un dossier livreur en parallèle depuis la page « Devenir livreur ».' },
      ]}
    />
  );
}
