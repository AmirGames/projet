'use client';


import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Ancienne page des commandes, devenue une simple redirection.
 *
 * Elle appelait /api/orders sans indiquer ni boutique ni organisation, ce que
 * la route refuse : elle ne pouvait donc rien afficher. Les commandes se
 * consultent dans l'espace de la boutique, où la sélection courante est
 * connue.
 */
export default function AnciennesCommandes() {
  const router = useRouter();

  useEffect(() => {
    const orgId = localStorage.getItem('currentOrgId');
    router.replace(orgId ? `/merchant/${orgId}/orders` : '/merchant');
  }, [router]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600" />
    </div>
  );
}
