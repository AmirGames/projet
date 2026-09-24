import { create } from 'zustand';
import { merchantService, type MerchantOrder } from '@zupone/shared';

interface OrderState {
  orders: MerchantOrder[];
  selectedOrder: MerchantOrder | null;
  loading: boolean;
  error: string | null;
  fetchOrders: () => Promise<void>;
  fetchOrderDetail: (id: string) => Promise<void>;
  updateOrderStatus: (id: string, status: string) => Promise<void>;
  addOrder: (order: MerchantOrder) => void;
  updateOrder: (id: string, updates: Partial<MerchantOrder>) => void;
}

export const useOrderStore = create<OrderState>((set) => ({
  orders: [],
  selectedOrder: null,
  loading: false,
  error: null,

  fetchOrders: async () => {
    set({ loading: true, error: null });
    try {
      const orders = await merchantService.getOrders();
      set({ orders, loading: false });
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to fetch orders';
      set({ error: message, loading: false });
    }
  },

  fetchOrderDetail: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const order = await merchantService.getOrderDetail(id);
      set({ selectedOrder: order, loading: false });
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to fetch order';
      set({ error: message, loading: false });
    }
  },

  updateOrderStatus: async (id: string, status: string) => {
    try {
      const order = await merchantService.updateOrderStatus(id, status);
      set((state) => ({
        orders: state.orders.map((o) => (o.id === id ? order : o)),
        selectedOrder: state.selectedOrder?.id === id ? order : state.selectedOrder,
      }));
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to update order';
      set({ error: message });
      throw error;
    }
  },

  addOrder: (order: MerchantOrder) => {
    set((state) => ({
      orders: [order, ...state.orders],
    }));
  },

  updateOrder: (id: string, updates: Partial<MerchantOrder>) => {
    set((state) => ({
      orders: state.orders.map((o) => (o.id === id ? { ...o, ...updates } : o)),
    }));
  },
}));
