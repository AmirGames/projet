import { create } from 'zustand';
import { apiClient } from '@zupone/shared';

interface AuthState {
  isAuthenticated: boolean;
  user: any | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  loading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/auth/login', { email, password });
      const { accessToken, refreshToken, user } = response.data;

      apiClient.setTokens(accessToken, refreshToken);
      set({
        isAuthenticated: true,
        user,
        loading: false,
      });
    } catch (error: any) {
      const message = error.response?.data?.message || 'Login failed';
      set({ error: message, loading: false });
      throw error;
    }
  },

  logout: () => {
    apiClient.clearTokens();
    set({
      isAuthenticated: false,
      user: null,
    });
  },

  setTokens: (accessToken: string, refreshToken: string) => {
    apiClient.setTokens(accessToken, refreshToken);
    set({ isAuthenticated: true });
  },
}));
