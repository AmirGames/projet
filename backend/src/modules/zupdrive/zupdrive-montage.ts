import type { Application, Router } from "express";
import zupdriveChauffeurRouter from "./chauffeur.routes";
import zupdriveAdminRouter from "./chauffeur.admin.routes";
import zupdriveCoursesRouter from "./course-drive.routes";
import zupdriveSocieteRouter from "./societe.routes";
import zupdrivePaymentRouter from "./zupdrive-payment.routes";
import zupdriveRealtimeRouter from "./zupdrive-realtime.routes";
import zupdriveAdminDashboardRouter from "./zupdrive-admin-dashboard.routes";
import zupdriveDriverManagementRouter from "./zupdrive-driver-management.routes";
import zupdriveNotificationsRouter from "./zupdrive-notifications.routes";
import zupdriveSupportRouter from "./zupdrive-support.routes";

export interface MontageRouteur {
  prefixe: string;
  routeur: Router;
}

/**
 * Les routeurs ZupDrive et leur préfixe, dans l'ordre de montage.
 *
 * L'ordre compte : chauffeur.admin pose un garde sur tout /api/zupdrive/admin (il ne laisse
 * passer que les chemins que ROUTES.zupdrive attribue à une section) ; un routeur dont les
 * chemins relèvent d'une autre section se monte donc AVANT lui. Le test zupdrive-montage
 * vérifie qu'aucune route n'est servie deux fois et que chaque route exige un jeton.
 *
 * Le webhook d'accusés de notification n'est pas ici : il lit le corps brut et se monte
 * avant le lecteur JSON (voir app.ts).
 */
export const MONTAGE_ZUPDRIVE: MontageRouteur[] = [
  { prefixe: "/api/zupdrive/chauffeur", routeur: zupdriveChauffeurRouter },
  // /drivers et /infractions : section « chauffeurs » ; avant le garde de chauffeur.admin.
  { prefixe: "/api/zupdrive/admin", routeur: zupdriveDriverManagementRouter },
  { prefixe: "/api/zupdrive/admin", routeur: zupdriveAdminRouter },
  { prefixe: "/api/zupdrive/courses", routeur: zupdriveCoursesRouter },
  { prefixe: "/api/zupdrive/societe", routeur: zupdriveSocieteRouter },
  { prefixe: "/api/zupdrive/payment", routeur: zupdrivePaymentRouter },
  { prefixe: "/api/zupdrive/realtime", routeur: zupdriveRealtimeRouter },
  { prefixe: "/api/zupdrive/admin/dashboard", routeur: zupdriveAdminDashboardRouter },
  // Alertes du chauffeur (/alerts/*) et administration (/admin/*). L'accusé du fournisseur est dans app.ts.
  { prefixe: "/api/zupdrive/notifications", routeur: zupdriveNotificationsRouter },
  // Tickets du compte connecté (/tickets) et administration (/admin/*, section « courses-drive »).
  { prefixe: "/api/zupdrive/support", routeur: zupdriveSupportRouter },
];

export function monterZupDrive(app: Application): void {
  for (const { prefixe, routeur } of MONTAGE_ZUPDRIVE) app.use(prefixe, routeur);
}
