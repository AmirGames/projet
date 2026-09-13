export const API_MESSAGES = {
  SUCCESS: "Succès",
  ERROR: "Erreur",
  UNAUTHORIZED: "Non autorisé",
  FORBIDDEN: "Accès refusé",
  NOT_FOUND: "Non trouvé",
  CONFLICT: "Conflit",
  VALIDATION_ERROR: "Erreur de validation",
};

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
};

export const CACHE_TTL = {
  SHORT: 5 * 60 * 1000, // 5 minutes
  MEDIUM: 15 * 60 * 1000, // 15 minutes
  LONG: 60 * 60 * 1000, // 1 hour
};

export const ORDER_STATUS = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  PREPARING: "PREPARING",
  READY: "READY",
  PICKED_UP: "PICKED_UP",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
};

export const USER_ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  MERCHANT: "MERCHANT",
  DRIVER: "DRIVER",
  CUSTOMER: "CUSTOMER",
};
