import { ENTETE_TRANSPORT, renouveler } from "./jeton-session";
import { cheminCommande, jetonDeSuivi, memoriserJetonDeSuivi } from "./suivi-commande";

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
  signup: async (email: string, password: string, name: string, conditionsAcceptees: boolean) => {
    try {
      // Par le site lui-même : le cookie de renouvellement doit être posé ici.
      const response = await fetch(`/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ENTETE_TRANSPORT },
        body: JSON.stringify({ email, password, name, confirmPassword: password, conditionsAcceptees }),
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
      const response = await fetch(`/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ENTETE_TRANSPORT },
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

  // Le renouvellement passe par le cookie httpOnly : voir lib/jeton-session.ts.
  refresh: () => renouveler().then((r) => r.donnees ?? { error: true }),

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
    const corps = await response.json();
    // Le jeton de suivi n'est rendu qu'ici : il ouvre le suivi sans compte.
    memoriserJetonDeSuivi(corps?.order?.id, corps?.order?.trackingToken);
    return corps;
  },

  /**
   * Une commande : avec la session si le client est connecté, sinon avec le
   * jeton de suivi gardé dans ce navigateur. Sans l'un ni l'autre, 404.
   */
  getOrder: async (id: string) => {
    const response = await fetch(`${API_BASE_URL}${cheminCommande(id, jetonDeSuivi(id))}`, {
      headers: getAuthHeaders(),
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

  // User roles endpoints
  getRoles: async () => {
    const response = await fetch(`${API_BASE_URL}/api/auth/me/roles`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Erreur lors du chargement des rôles");
    }
    return response.json();
  },

  becomeMerchant: async (data: any) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/me/become-merchant`, {
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
    const response = await fetch(`${API_BASE_URL}/api/auth/me/become-driver`, {
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
