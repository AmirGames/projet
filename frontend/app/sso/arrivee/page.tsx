'use client';

import { useEffect, useState } from 'react';
import { accueilConnecte, cheminSur } from '@/lib/sso';
import { ENTETE_TRANSPORT, poserJeton } from '@/lib/jeton-session';


/**
 * L'arrivée d'une session transmise par zupone.com (voir lib/sso.ts).
 *
 * Le code reçu dans l'adresse est échangé contre les jetons de ce domaine,
 * rangés sous les mêmes clés qu'une connexion par formulaire, puis
 * l'utilisateur repart vers la page qu'il voulait. Sans code (personne de
 * connecté) ou si l'échange échoue, il y repart aussi : la page lui demandera
 * de se connecter, comme avant.
 */
export default function ArriveeSso() {
  const [message, setMessage] = useState('Connexion en cours…');

  useEffect(() => {
    const parametres = new URLSearchParams(window.location.search);
    const code = parametres.get('code');
    const suite = cheminSur(parametres.get('suite'), accueilConnecte());
    // Personne de connecté : retour à la page quittée (la connexion), pas à
    // la page réservée qui y renverrait aussitôt.
    const depart = cheminSur(parametres.get('depart'), suite);

    // Le code ne reste pas dans l'adresse : ni dans l'historique, ni dans ce
    // que la page pourrait transmettre en quittant.
    window.history.replaceState(null, '', '/sso/arrivee');

    const repartir = () => window.location.replace(suite);

    if (!code) {
      window.location.replace(depart);
      return;
    }

    (async () => {
      try {
        // Par le site lui-même : le cookie de renouvellement doit être posé ici.
        const reponse = await fetch('/api/sso/echanger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...ENTETE_TRANSPORT },
          body: JSON.stringify({ code }),
        });
        if (!reponse.ok) throw new Error(String(reponse.status));

        const session = await reponse.json();
        poserJeton(session.accessToken);
        localStorage.setItem('isSuperOwner', session.user?.isSuperOwner ? 'true' : 'false');
        if (session.organization?.id) localStorage.setItem('currentOrgId', session.organization.id);
        if (session.driver?.id) {
          localStorage.setItem('currentDriverId', session.driver.id);
          localStorage.setItem('driverUser', JSON.stringify(session.user));
        }
        repartir();
      } catch {
        setMessage('Connexion impossible, redirection…');
        window.location.replace(depart);
      }
    })();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white text-slate-600">
      <p>{message}</p>
    </main>
  );
}
