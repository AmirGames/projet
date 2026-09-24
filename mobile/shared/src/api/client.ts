import axios, { AxiosInstance, AxiosError } from 'axios';
import { API_BASE_URL } from '../constants/api';

export interface ApiClientConfig {
  baseURL?: string;
  timeout?: number;
}

class ApiClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor(config?: ApiClientConfig) {
    this.client = axios.create({
      baseURL: config?.baseURL || API_BASE_URL,
      timeout: config?.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Interceptor pour ajouter le token
    this.client.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });

    // Interceptor pour gérer les erreurs 401
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          if (this.refreshToken) {
            try {
              const response = await this.client.post('/auth/refresh', {
                refreshToken: this.refreshToken,
              });
              this.setTokens(response.data.accessToken, response.data.refreshToken);
              return this.client(originalRequest);
            } catch (refreshError) {
              this.clearTokens();
              throw refreshError;
            }
          }
        }
        return Promise.reject(error);
      }
    );
  }

  setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
  }

  get(url: string, config?: any) {
    return this.client.get(url, config);
  }

  post(url: string, data?: any, config?: any) {
    return this.client.post(url, data, config);
  }

  put(url: string, data?: any, config?: any) {
    return this.client.put(url, data, config);
  }

  patch(url: string, data?: any, config?: any) {
    return this.client.patch(url, data, config);
  }

  delete(url: string, config?: any) {
    return this.client.delete(url, config);
  }
}

export const apiClient = new ApiClient();
