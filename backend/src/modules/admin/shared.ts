import { exigerPermission } from "../auth/permissions-plateforme.service";

// Helper to safely get string query params
export const getQueryString = (value: unknown, defaultValue: string): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return typeof value[0] === "string" && value[0] ? value[0] : defaultValue;
  return defaultValue;
};

// Helper to safely get numeric query params
export const getQueryNumber = (value: unknown, defaultValue: number): number => {
  const str = getQueryString(value, String(defaultValue));
  const num = parseInt(str, 10);
  return isNaN(num) ? defaultValue : num;
};

// Middleware to check if user is system admin
// Le compte est déjà lu par `authMiddleware`, qui refuse en 401 celui qui
// n'existe plus : ici, un refus veut bien dire « pas administrateur », et non
// « compte introuvable » — c'est ce que les traces laissaient croire.
// Le superowner passe partout ; un membre de l'équipe selon les permissions
// de son groupe, cochées depuis l'espace superowner.
export const isSystemAdmin = exigerPermission("admin");
