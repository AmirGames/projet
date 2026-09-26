'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useHydrate } from '@/lib/navigateur';

export interface CartItem {
  id: string; // unique key for this item in cart
  productId: string;
  storeId: string;
  storeName: string;
  name: string;
  price: number; // in cents
  quantity: number;
  variants?: any[];
}

export interface CartStore {
  storeId: string;
  storeName: string;
  items: CartItem[];
}

interface CartContextType {
  cart: CartStore[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (storeId: string, productId: string) => void;
  updateQuantity: (storeId: string, productId: string, quantity: number) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  getDeliveryFee: () => number;
  getTotalWithDelivery: () => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

/**
 * Sa propre clé.
 *
 * Ce contexte range un tableau groupé par boutique, en centimes ; deux autres
 * pages écrivaient sous « cart » une liste à plat en euros. Chacune écrasait
 * les autres, et le panier revenait déformé ou vide.
 */
const CLE = 'zupone-panier-client';

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartStore[]>([]);
  const hydrate = useHydrate();
  const [isHydrated, setIsHydrated] = useState(false);

  // Le panier enregistré, lu une fois dans le navigateur.
  if (hydrate && !isHydrated) {
    setIsHydrated(true);
    const savedCart = localStorage.getItem(CLE);
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (err) {
        console.error('Failed to parse cart from localStorage:', err);
      }
    }
  }

  // Save to localStorage when cart changes
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(CLE, JSON.stringify(cart));
    }
  }, [cart, isHydrated]);

  const addToCart = (item: CartItem) => {
    setCart(prevCart => {
      const storeIndex = prevCart.findIndex(store => store.storeId === item.storeId);

      if (storeIndex === -1) {
        // New store
        return [
          ...prevCart,
          {
            storeId: item.storeId,
            storeName: item.storeName,
            items: [{ ...item, id: `${item.productId}-${Date.now()}` }]
          }
        ];
      } else {
        // Existing store - check if product already exists
        const store = prevCart[storeIndex];
        const productIndex = store.items.findIndex(i => i.productId === item.productId);

        const newCart = [...prevCart];
        if (productIndex === -1) {
          // New product
          newCart[storeIndex].items.push({ ...item, id: `${item.productId}-${Date.now()}` });
        } else {
          // Existing product - increase quantity
          newCart[storeIndex].items[productIndex].quantity += item.quantity;
        }
        return newCart;
      }
    });
  };

  const removeFromCart = (storeId: string, productId: string) => {
    setCart(prevCart =>
      prevCart
        .map(store =>
          store.storeId === storeId
            ? {
                ...store,
                items: store.items.filter(item => item.productId !== productId)
              }
            : store
        )
        .filter(store => store.items.length > 0)
    );
  };

  const updateQuantity = (storeId: string, productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(storeId, productId);
      return;
    }

    setCart(prevCart =>
      prevCart.map(store =>
        store.storeId === storeId
          ? {
              ...store,
              items: store.items.map(item =>
                item.productId === productId ? { ...item, quantity } : item
              )
            }
          : store
      )
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  const getCartTotal = () => {
    return cart.reduce(
      (total, store) =>
        total + store.items.reduce((storeTotal, item) => storeTotal + item.price * item.quantity, 0),
      0
    );
  };

  const getDeliveryFee = () => {
    // For now, simple calculation: €2 per restaurant in order
    return cart.length * 200; // 200 cents = €2
  };

  const getTotalWithDelivery = () => {
    return getCartTotal() + getDeliveryFee();
  };

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        getCartTotal,
        getDeliveryFee,
        getTotalWithDelivery
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
}
