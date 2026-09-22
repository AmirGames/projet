const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const getAuthHeaders = () => {
  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  return {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

export const api = {
  // Auth endpoints
  signup: async (email: string, password: string, name: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, confirmPassword: password }),
      });
      const data = await response.json();
      if (!response.ok) {
        // L'API répond { error, code } : c'est « error » qui porte le texte.
        // Renvoyer error: true affichait une case vide, un booléen ne se
        // rendant pas.
        return { error: data.error || "Erreur d'inscription", code: data.code };
      }
      return data;
    } catch (error) {
      return { error: "Serveur injoignable. Vérifiez votre connexion." };
    }
  },

  login: async (email: string, password: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { error: data.error || "Erreur de connexion", code: data.code };
      }
      return data;
    } catch (error) {
      return { error: "Serveur injoignable. Vérifiez votre connexion." };
    }
  },

  refresh: async (refreshToken: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    return response.json();
  },

  getMe: async () => {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: getAuthHeaders(),
    });
    return response.json();
  },

  // Organization endpoints
  createOrg: async (name: string, slug: string, token: string) => {
    const response = await fetch(`${API_BASE_URL}/api/organizations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, slug }),
    });
    return response.json();
  },

  getOrg: async (id: string, token: string) => {
    const response = await fetch(`${API_BASE_URL}/api/organizations/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.json();
  },

  // Store endpoints
  createStore: async (orgId: string, name: string, slug: string, token: string) => {
    const response = await fetch(`${API_BASE_URL}/api/stores`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orgId, name, slug }),
    });
    return response.json();
  },

  getStore: async (id: string) => {
    const response = await fetch(`${API_BASE_URL}/api/stores/${id}`);
    return response.json();
  },

  updateStore: async (id: string, data: any, token: string) => {
    const response = await fetch(`${API_BASE_URL}/api/stores/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  // Product endpoints
  getProducts: async (storeId: string) => {
    const response = await fetch(
      `${API_BASE_URL}/api/products/store/${storeId}`
    );
    return response.json();
  },

  searchProducts: async (storeId: string, query: string) => {
    const response = await fetch(
      `${API_BASE_URL}/api/products/search/${storeId}?q=${query}`
    );
    return response.json();
  },

  createProduct: async (
    storeId: string,
    sku: string,
    name: string,
    price: number,
    stock: number,
    token: string
  ) => {
    const response = await fetch(`${API_BASE_URL}/api/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        storeId,
        sku,
        name,
        price,
        stock,
        status: "ACTIVE",
      }),
    });
    return response.json();
  },

  // Category endpoints
  getCategories: async (storeId: string) => {
    const response = await fetch(
      `${API_BASE_URL}/api/categories/store/${storeId}`
    );
    return response.json();
  },

  createCategory: async (storeId: string, name: string, token: string) => {
    const response = await fetch(`${API_BASE_URL}/api/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ storeId, name }),
    });
    return response.json();
  },

  // Order endpoints
  createOrder: async (
    storeId: string,
    customerName: string,
    customerEmail: string,
    customerPhone: string,
    deliveryType: string,
    totalAmount: number
  ) => {
    const response = await fetch(`${API_BASE_URL}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId,
        customerName,
        customerEmail,
        customerPhone,
        deliveryType,
        totalAmount,
      }),
    });
    return response.json();
  },

  getOrders: async (storeId: string, token: string) => {
    const response = await fetch(
      `${API_BASE_URL}/api/orders/store/${storeId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.json();
  },

  updateOrderStatus: async (id: string, status: string, token: string) => {
    const response = await fetch(`${API_BASE_URL}/api/orders/${id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });
    return response.json();
  },

  deleteProduct: async (id: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    const response = await fetch(`${API_BASE_URL}/api/products/${id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
    return response.json();
  },

  deleteCategory: async (id: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    const response = await fetch(`${API_BASE_URL}/api/categories/${id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
    return response.json();
  },

  // Admin endpoints
  adminGetStats: async (token: string) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.json();
  },

  adminGetMerchants: async (token: string, status?: string) => {
    const url = new URL(`${API_BASE_URL}/api/admin/merchants`);
    if (status) url.searchParams.append('status', status);
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.json();
  },

  adminGetMerchant: async (orgId: string, token: string) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/merchants/${orgId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.json();
  },

  adminUpdateMerchant: async (orgId: string, data: any, token: string) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/merchants/${orgId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  adminGetTickets: async (token: string, status?: string) => {
    const url = new URL(`${API_BASE_URL}/api/admin/tickets`);
    if (status) url.searchParams.append('status', status);
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.json();
  },

  adminUpdateTicket: async (ticketId: string, data: any, token: string) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  adminGetConfig: async (token: string) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/config`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.json();
  },

  adminUpdateConfig: async (data: any, token: string) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  adminGetCommissions: async (token: string, period?: string) => {
    const url = new URL(`${API_BASE_URL}/api/admin/commissions`);
    if (period) url.searchParams.append('period', period);
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.json();
  },

  adminGetAuditLogs: async (token: string) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.json();
  },

  // User roles endpoints
  getRoles: async () => {
    const response = await fetch(`${API_BASE_URL}/api/user/roles`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Erreur lors du chargement des rôles");
    }
    return response.json();
  },

  becomeMerchant: async (data: any) => {
    const response = await fetch(`${API_BASE_URL}/api/user/become-merchant`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Erreur lors de la création du commerce");
    }
    return response.json();
  },

  becomeDriver: async (data: any) => {
    const response = await fetch(`${API_BASE_URL}/api/user/become-driver`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Erreur lors de la création du profil livreur");
    }
    return response.json();
  },
};

export const apiClient = api;
