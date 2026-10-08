'use client';


import { jetonAcces } from '@/lib/jeton-session';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { useLocale, useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface CommandeActive {
  id: string;
  status: string;
  deliveryType: 'PICKUP' | 'DELIVERY';
  deliveryStatus: string | null;
  estimatedReadyAt: string | null;
  store: { name: string } | null;
}

/** En attente, refusée ou terminée : rien à suivre. */
const STATUTS_ACTIFS = ['ACCEPTED', 'PREPARING', 'READY'];

const heure = (iso: string, locale: string) =>
  new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

/** La clé de traduction de l'état, côté client. */
function libelle(c: CommandeActive): string {
  if (c.status === 'ACCEPTED') return 'acceptee';
  if (c.status === 'PREPARING') return 'enPreparation';
  if (c.deliveryType === 'PICKUP') return 'preteARetirer';
  if (c.deliveryStatus === 'PICKED_UP') return 'enRoute';
  if (c.deliveryStatus === 'ACCEPTED') return 'livreurEnChemin';
  return 'preteAttenteLivreur';
}

/**
 * Bandeau affiché en haut de l'espace client tant qu'une commande est en
 * cours : dès que le commerçant l'accepte, jusqu'à sa remise au client.
 * Un clic mène au suivi (`/client/orders/[id]`).
 */
export function BandeauCommandeEnCours() {
  const t = useTranslations('bandeauCommande');
  const locale = useLocale();
  const pathname = usePathname();
  const [commandes, setCommandes] = useState<CommandeActive[]>([]);

  const charger = async () => {
    let token: string | null = null;
    try {
      token = jetonAcces();
    } catch {}
    if (!token) return;
    try {
      const reponse = await fetch(`${API_URL}/api/client/me/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!reponse.ok) return;
      const corps = await reponse.json();
      setCommandes(
        ((corps.data || []) as CommandeActive[]).filter(
          (c) => STATUTS_ACTIFS.includes(c.status) && !['DELIVERED', 'FAILED'].includes(c.deliveryStatus ?? '')
        )
      );
    } catch {
      // Le bandeau est un raccourci : une erreur réseau ne doit rien casser.
    }
  };

  useEffectChargement(() => {
    charger();
  }, []);

  useDonneesModifiees('orders', charger);

  if (commandes.length === 0) return null;

  const [premiere] = commandes;
  const href = commandes.length > 1 ? '/client/orders' : `/client/orders/${premiere.id}`;
  // Déjà sur la page de suivi : le bandeau ferait doublon.
  if (pathname === href) return null;

  return (
    <Link
      href={href}
      className="block bg-green-600 hover:bg-green-700 text-white transition"
    >
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
        </span>
        <div className="flex-1 min-w-0">
          {commandes.length > 1 ? (
            <p className="font-semibold">{t('plusieurs', { n: commandes.length })}</p>
          ) : (
            <>
              <p className="font-semibold truncate">
                {premiere.estimatedReadyAt
                  ? t(premiere.deliveryType === 'PICKUP' ? 'preteVers' : 'prepareeVers', {
                      heure: heure(premiere.estimatedReadyAt, locale),
                    })
                  : t(libelle(premiere))}
              </p>
              <p className="text-sm text-green-100 truncate">
                {t(libelle(premiere))}
                {premiere.store?.name ? ` • ${premiere.store.name}` : ''}
              </p>
            </>
          )}
        </div>
        <ChevronRight size={20} className="shrink-0" />
      </div>
    </Link>
  );
}
