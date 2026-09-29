import type { Metadata } from 'next';

// L'adresse porte un code à usage unique le temps d'un instant : qu'aucune
// requête de la page ne le communique ailleurs, et qu'aucun moteur ne l'indexe.
export const metadata: Metadata = {
  title: 'Connexion en cours — ZupEat',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
