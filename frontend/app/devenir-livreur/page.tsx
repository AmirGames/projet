import type { Metadata } from 'next';
import { PageDevenir } from '@/components/PageDevenir';

export const metadata: Metadata = {
  title: 'Devenir livreur — Zupone',
  description: 'Livrez les commandes des commerces de proximité, à votre rythme.',
};

export default function DevenirLivreurPage() {
  return (
    <PageDevenir
      badge="Livreur Zupone"
      titre="Livrez près de chez vous, quand vous le voulez"
      accroche="À vélo, en scooter ou en voiture : vous vous connectez quand vous êtes disponible, et les courses des commerces du quartier vous sont proposées."
      cta={{ libelle: 'Créer mon dossier livreur', href: '/driver/signup' }}
      avantages={[
        { icone: '🕒', titre: 'Liberté d’horaires', texte: 'Pas de planning imposé : vous passez en ligne ou en pause d’un geste.' },
        { icone: '📍', titre: 'Courses proches', texte: 'Chaque course est proposée au livreur disponible le plus proche du commerce.' },
        { icone: '💶', titre: 'Rémunération claire', texte: 'Le montant de chaque course est affiché avant acceptation, et vos versements sont suivis dans votre espace.' },
      ]}
      etapes={[
        { titre: 'Créez votre compte', texte: 'Nom, e‑mail, téléphone et type de véhicule.' },
        { titre: 'Envoyez vos pièces', texte: 'Pièce d’identité, statut (auto‑entrepreneur) et documents du véhicule si besoin.' },
        { titre: 'Validation', texte: 'Notre équipe examine votre dossier une seule fois.' },
        { titre: 'Première course', texte: 'Passez en ligne, acceptez une course et remettez-la avec le code à 4 chiffres du client.' },
      ]}
      prerequis={[
        'Avoir 18 ans ou plus',
        'Une pièce d’identité valide et le droit de travailler en France',
        'Un statut d’indépendant (micro‑entreprise par exemple)',
        'Un vélo, un scooter ou une voiture — avec permis et assurance pour les véhicules motorisés',
        'Un smartphone avec connexion internet et localisation',
      ]}
      questions={[
        { question: 'Suis-je salarié de Zupone ?', reponse: 'Non, vous exercez en tant qu’indépendant et restez libre d’accepter ou de refuser les courses.' },
        { question: 'Combien de temps prend la validation ?', reponse: 'Dès que votre dossier est complet, il est examiné par l’équipe ; vous êtes prévenu par notification.' },
        { question: 'Puis-je refuser une course ?', reponse: 'Oui. Une course refusée est simplement proposée au livreur suivant.' },
      ]}
      conditions={{ libelle: 'conditions livreurs', href: '/conditions-livreurs' }}
    />
  );
}
