import type { Metadata } from 'next';
import { PageDevenir } from '@/components/PageDevenir';

export const metadata: Metadata = {
  title: 'Devenir commerçant — Zupone',
  description: 'Mettez votre commerce en ligne et recevez des commandes livrées.',
};

export default function DevenirCommercantPage() {
  return (
    <PageDevenir
      badge="Commerçant Zupone"
      titre="Votre commerce en ligne, en quelques minutes"
      accroche="Restaurant, boulangerie, épicerie, fleuriste… Créez votre boutique, publiez votre catalogue et recevez des commandes livrées par des livreurs du quartier."
      cta={{ libelle: 'Créer ma boutique', href: '/merchant/register' }}
      avantages={[
        { icone: '🏪', titre: 'Votre vitrine', texte: 'Une boutique à votre nom, avec votre catalogue, vos photos et vos prix.' },
        { icone: '🔔', titre: 'Commandes en direct', texte: 'Chaque commande arrive instantanément ; vous l’acceptez et suivez sa préparation.' },
        { icone: '🛵', titre: 'Livraison incluse', texte: 'Un livreur est automatiquement envoyé dès que la commande est prête.' },
      ]}
      etapes={[
        { titre: 'Créez votre compte', texte: 'Nom du commerce, type d’établissement et adresse.' },
        { titre: 'Complétez le dossier', texte: 'SIRET, justificatifs et coordonnées bancaires pour vos versements.' },
        { titre: 'Montez le catalogue', texte: 'Produits, horaires par service et zones de livraison sur la carte.' },
        { titre: 'Ouvrez', texte: 'Après validation, votre boutique est visible par les clients.' },
      ]}
      prerequis={[
        'Un commerce déclaré avec un numéro SIRET',
        'Une adresse physique où les livreurs récupèrent les commandes',
        'Un IBAN professionnel pour recevoir vos versements',
        'Un appareil (téléphone, tablette ou ordinateur) pour recevoir les commandes',
      ]}
      questions={[
        { question: 'Combien ça coûte ?', reponse: 'La création de la boutique est gratuite ; les formules et commissions sont détaillées dans votre espace commerçant.' },
        { question: 'Mes clients doivent-ils créer un compte ?', reponse: 'Non, ils peuvent commander sans compte.' },
        { question: 'Puis-je fermer temporairement ma boutique ?', reponse: 'Oui, vous gérez vos horaires et pouvez suspendre les commandes à tout moment.' },
      ]}
      conditions={{ libelle: 'conditions commerçants', href: '/conditions-commercants' }}
    />
  );
}
