const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const api = {
  // Auth endpoints
    signup: async (email: string, password: string, name: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, confirmPassword: password }),
    });
    return response.json();
  },

  login: async (email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return response.json();
  },

  refresh: async (refreshToken: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
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
};
