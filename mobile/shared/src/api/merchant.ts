import { apiClient } from './client';

export interface MerchantOrder {
  id: string;
  orderNumber: string;
  status: 'pending' | 'accepted' | 'preparing' | 'ready' | 'delivering' | 'delivered';
  customer: {
    name: string;
    phone: string;
  };
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  total: number;
  createdAt: string;
  deliveryAddress?: string;
  pickupTime?: string;
}

export interface MerchantProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  logo?: string;
  openingHours: any;
  zones: any[];
}

class MerchantService {
  async getOrders() {
    const response = await apiClient.get('/merchants/orders');
    return response.data as MerchantOrder[];
  }

  async getOrderDetail(orderId: string) {
    const response = await apiClient.get(`/merchants/orders/${orderId}`);
    return response.data as MerchantOrder;
  }

  async updateOrderStatus(orderId: string, status: string) {
    const response = await apiClient.patch(`/merchants/orders/${orderId}`, { status });
    return response.data as MerchantOrder;
  }

  async getProfile() {
    const response = await apiClient.get('/merchants/profile');
    return response.data as MerchantProfile;
  }

  async updateProfile(profile: Partial<MerchantProfile>) {
    const response = await apiClient.put('/merchants/profile', profile);
    return response.data as MerchantProfile;
  }

  async getCatalog() {
    const response = await apiClient.get('/merchants/catalog');
    return response.data;
  }

  async updateCatalogItem(itemId: string, data: any) {
    const response = await apiClient.patch(`/merchants/catalog/${itemId}`, data);
    return response.data;
  }
}

export const merchantService = new MerchantService();
