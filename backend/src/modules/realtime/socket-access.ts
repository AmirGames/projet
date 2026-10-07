import { db } from '../../services/db';
import { SsoService } from '../auth/sso.service';
import type { JwtPayload } from '../auth/auth.service';
import { membreVoitBoutique } from '../auth/autorisation-boutique';
import { nettoyerPermissions } from '../auth/permissions-plateforme.service';

/** Lu sans cache : une connexion ouverte ne conserve pas des droits retirés. */
export async function compteSocket(jeton: JwtPayload | undefined) {
  if (!jeton || (jeton.exp !== undefined && jeton.exp * 1000 <= Date.now())) return null;
  if (!jeton.sid && process.env.NODE_ENV !== 'test') return null;
  if (jeton.sid && !(await SsoService.sessionActive(jeton.sid, { sansCache: true }))) return null;
  const compte = await db.user.findUnique({
    where: { id: jeton.userId },
    select: {
      id: true, email: true, emailVerified: true, passwordChangedAt: true, status: true,
      isSuperOwner: true, isSystemAdmin: true,
      accesEquipe: { select: { plateforme: true, role: true } },
    },
  });
  if (!compte || (compte.status && compte.status !== 'ACTIVE')) return null;
  if (compte.passwordChangedAt &&
      (jeton.iat === undefined || jeton.iat < Math.floor(compte.passwordChangedAt.getTime() / 1000))) return null;
  return compte;
}

export type CompteSocket = NonNullable<Awaited<ReturnType<typeof compteSocket>>>;

export async function permissionEat(compte: CompteSocket, section: string) {
  if (compte.isSuperOwner) return true;
  if (!compte.isSystemAdmin) return false;
  const acces = compte.accesEquipe.find((a) => a.plateforme === 'EAT');
  if (!acces) return false;
  const role = await db.platformRole.findUnique({
    where: { plateforme_code: { plateforme: 'EAT', code: acces.role } },
    select: { permissions: true },
  });
  return !!nettoyerPermissions(role?.permissions)[section];
}

export async function accesCommande(compte: CompteSocket, orderId: string) {
  const commande = await db.order.findUnique({
    where: { id: orderId },
    select: {
      customerEmail: true,
      storeId: true,
      store: { select: { orgId: true } },
      delivery: { select: { driver: { select: { userId: true } } } },
    },
  });
  if (!commande) return false;
  if (await permissionEat(compte, 'billing')) return true;
  if (compte.emailVerified && commande.customerEmail?.toLowerCase() === compte.email.toLowerCase()) return true;
  if (commande.delivery?.driver?.userId === compte.id) return true;
  // Même règle que le HTTP : un employé limité à la boutique A n'écoute pas B.
  const membership = await db.membership.findFirst({
    where: { userId: compte.id, orgId: commande.store.orgId }, select: { role: true, storeIds: true },
  });
  return !!membership && membreVoitBoutique(membership, commande.storeId);
}

export async function accesSalon(compte: CompteSocket, salon: string) {
  if (salon.startsWith('compte-')) return salon === `compte-${compte.id}`;
  if (salon.startsWith('user-')) return compte.emailVerified && salon === `user-${compte.email.toLowerCase()}`;
  if (salon.startsWith('order-')) return accesCommande(compte, salon.slice(6));
  if (salon === 'support-livreurs') return permissionEat(compte, 'driver-support');
  // Ce flux mélange toutes les sections et plateformes : seule l'identité
  // globale du superowner autorise ses identifiants d'organisations et objets.
  if (salon === 'plateforme') return compte.isSuperOwner;
  return false;
}
