// API Configuration
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
export const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:3001';

export const API_ENDPOINTS = {
  // Auth
  AUTH_LOGIN: '/auth/login',
  AUTH_LOGOUT: '/auth/logout',
  AUTH_REGISTER: '/auth/register',
  AUTH_REFRESH: '/auth/refresh',

  // Merchant
  MERCHANT_ORDERS: '/merchants/orders',
  MERCHANT_ORDER_DETAIL: '/merchants/orders/:id',
  MERCHANT_PROFILE: '/merchants/profile',
  MERCHANT_CATALOG: '/merchants/catalog',

  // Customer
  CUSTOMER_STORES: '/stores',
  CUSTOMER_STORE_DETAIL: '/stores/:slug',
  CUSTOMER_ORDERS: '/customers/orders',
  CUSTOMER_ORDER_DETAIL: '/customers/orders/:id',

  // Delivery
  DELIVERY_ACTIVE_DELIVERIES: '/deliveries/active',
  DELIVERY_DELIVERY_DETAIL: '/deliveries/:id',
  DELIVERY_ACCEPT: '/deliveries/:id/accept',
  DELIVERY_COMPLETE: '/deliveries/:id/complete',
};
