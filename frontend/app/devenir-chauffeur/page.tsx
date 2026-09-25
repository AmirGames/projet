import type { Metadata } from 'next';
import { PageDevenir } from '@/components/PageDevenir';

export const metadata: Metadata = {
  title: 'Devenir chauffeur — Zupone',
  description: 'Livrez en voiture les commandes plus volumineuses ou plus lointaines.',
};

export default function DevenirChauffeurPage() {
  return (
    <PageDevenir
      badge="Chauffeur-livreur Zupone"
      titre="Vous avez une voiture ? Prenez le volant pour les commerces du coin"
      accroche="Les courses en voiture couvrent les commandes volumineuses et les distances plus longues. Vous choisissez vos horaires, Zupone vous envoie les courses."
      cta={{ libelle: 'Créer mon dossier chauffeur', href: '/driver/signup' }}
      avantages={[
        { icone: '🚗', titre: 'Courses adaptées', texte: 'Grosses commandes, courses d’épicerie et trajets plus longs, là où le vélo ne suffit pas.' },
        { icone: '🕒', titre: 'À votre rythme', texte: 'Vous vous connectez quand vous voulez, sans engagement horaire.' },
        { icone: '🧭', titre: 'Trajet guidé', texte: 'Adresse du commerce puis du client affichées sur la carte, avec le suivi en direct.' },
      ]}
      etapes={[
        { titre: 'Créez votre compte', texte: 'Choisissez « Voiture » comme type de véhicule.' },
        { titre: 'Documents', texte: 'Permis B, carte grise, assurance et pièce d’identité.' },
        { titre: 'Validation', texte: 'Notre équipe vérifie votre dossier.' },
        { titre: 'En route', texte: 'Passez en ligne et acceptez vos premières courses.' },
      ]}
      prerequis={[
        'Avoir 18 ans ou plus et un permis B valide',
        'Une voiture assurée, avec carte grise à jour',
        'Un statut d’indépendant (micro‑entreprise par exemple)',
        'Un smartphone avec connexion internet et localisation',
      ]}
      questions={[
        { question: 'Est-ce du transport de personnes ?', reponse: 'Non, il s’agit uniquement de livraison de commandes entre commerces et clients.' },
        { question: 'Les frais de carburant sont-ils compris ?', reponse: 'La rémunération de chaque course tient compte de la distance ; les frais du véhicule restent à votre charge en tant qu’indépendant.' },
        { question: 'Puis-je changer de véhicule plus tard ?', reponse: 'Oui, depuis votre profil livreur.' },
      ]}
      conditions={{ libelle: 'conditions livreurs', href: '/conditions-livreurs' }}
    />
  );
}
