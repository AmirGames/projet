export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface User {
  id: string;
  email: string;
  role: 'merchant' | 'customer' | 'delivery' | 'admin';
}

export interface Order {
  id: string;
  orderNumber: string;
  status: 'pending' | 'accepted' | 'preparing' | 'ready' | 'delivering' | 'delivered' | 'cancelled';
  items: OrderItem[];
  total: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  variants?: string[];
}

export interface Store {
  id: string;
  name: string;
  slug: string;
  description: string;
  logo?: string;
  phone: string;
  location: {
    address: string;
    latitude: number;
    longitude: number;
  };
  openingHours: OpeningHour[];
  categories: Category[];
  isOpen: boolean;
}

export interface OpeningHour {
  day: string;
  opens: string;
  closes: string;
}

export interface Category {
  id: string;
  name: string;
  items: MenuItem[];
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image?: string;
  isAvailable: boolean;
  variants?: Variant[];
}

export interface Variant {
  id: string;
  name: string;
  options: string[];
}

export interface Delivery {
  id: string;
  orderId: string;
  status: 'assigned' | 'accepted' | 'in_progress' | 'delivered';
  driver: {
    id: string;
    name: string;
    phone: string;
  };
  currentLocation?: {
    latitude: number;
    longitude: number;
  };
  estimatedArrival: string;
}
