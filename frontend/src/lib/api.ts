/**
 * API Client for ZupOne Backend
 * Handles authentication, requests, and token management
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface AuthResponse {
  message: string;
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    isSuperOwner: boolean;
    isSystemAdmin: boolean;
    emailVerified?: boolean;
  };
  customer?: {
    id: string;
    name: string;
    email: string;
  };
  organization?: {
    id: string;
    name: string;
    slug: string;
  };
  store?: {
    id: string;
    name: string;
    slug: string;
  };
  organizations?: Array<{
    id: string;
    name: string;
    role: string;
    status: string;
  }>;
  driver?: {
    id: string;
    name: string;
    status: string;
  };
}

export interface RolesResponse {
  user: {
    id: string;
    email: string;
    isSuperOwner: boolean;
    isSystemAdmin: boolean;
  };
  roles: {
    customer: {
      active: boolean;
      customerId: string | null;
    };
    driver: {
      active: boolean;
      driverId: string | null;
      status: string | null;
    };
    merchant: {
      active: boolean;
      organizations: Array<{
        id: string;
        name: string;
        role: string;
      }>;
    };
  };
}

export interface ApiError {
  error?: string;
  message?: string;
  code?: string;
  status: number;
}

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  /**
   * Get stored access token
   */
  private getAccessToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('accessToken');
    }
    return null;
  }

  /**
   * Store tokens
   */
  private storeTokens(accessToken: string, refreshToken: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
    }
  }

  /**
   * Clear tokens
   */
  clearTokens() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
  }

  /**
   * Make HTTP request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const token = this.getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: response.statusText,
      }));
      throw {
        status: response.status,
        ...error,
      } as ApiError;
    }

    return response.json();
  }

  // ===== Auth Endpoints =====

  /**
   * Signup - Create new user with customer role
   */
  async signup(
    email: string,
    name: string,
    password: string
  ): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, name, password }),
    });

    this.storeTokens(response.accessToken, response.refreshToken);
    return response;
  }

  /**
   * Login
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    this.storeTokens(response.accessToken, response.refreshToken);
    return response;
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<AuthResponse> {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      throw { status: 401, message: 'No refresh token' } as ApiError;
    }

    const response = await this.request<AuthResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });

    this.storeTokens(response.accessToken, response.refreshToken);
    return response;
  }

  /**
   * Merchant direct registration
   */
  async merchantRegister(data: {
    businessName: string;
    email: string;
    password: string;
    businessType: string;
    phone: string;
    address: string;
    city: string;
    postalCode: string;
    website?: string;
    description: string;
    storeName: string;
    storeSlug: string;
  }): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>(
      '/auth/merchant-register',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );

    this.storeTokens(response.accessToken, response.refreshToken);
    return response;
  }

  /**
   * Driver direct registration
   */
  async driverRegister(data: {
    name: string;
    email: string;
    password: string;
    phone: string;
    vehicleType: string;
    vehiclePlate: string;
  }): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/drivers/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    this.storeTokens(response.accessToken, response.refreshToken);
    return response;
  }

  // ===== User Endpoints =====

  /**
   * Get current user info
   */
  async getMe(): Promise<{ user: any; organizations: any[] }> {
    return this.request('/auth/me');
  }

  /**
   * Get user roles
   */
  async getRoles(): Promise<RolesResponse> {
    return this.request('/auth/me/roles');
  }

  /**
   * Become merchant
   */
  async becomeMerchant(data: {
    businessName: string;
    storeName: string;
    storeSlug: string;
    businessType: string;
    phone: string;
    address: string;
    city: string;
    postalCode: string;
    description: string;
  }): Promise<{
    message: string;
    organization: {
      id: string;
      name: string;
      slug: string;
    };
    store: {
      id: string;
      name: string;
      slug: string;
    };
  }> {
    return this.request('/auth/me/become-merchant', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Become driver
   */
  async becomeDriver(data: {
    name: string;
    email: string;
    phone: string;
    vehicleType: string;
    vehiclePlate: string;
  }): Promise<{
    message: string;
    driver: {
      id: string;
      name: string;
      status: string;
    };
  }> {
    return this.request('/auth/me/become-driver', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Logout
   */
  logout() {
    this.clearTokens();
  }
}

export const api = new ApiClient();
