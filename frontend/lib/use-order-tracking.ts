'use client';

import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface OrderUpdate {
  orderId: string;
  status: string;
  timestamp: string;
  message?: string;
  title?: string;
  [key: string]: any;
}

interface DeliveryUpdate {
  orderId: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  eta?: number;
  timestamp: string;
}

export interface StatusNotification {
  status: string;
  title: string;
  message: string;
  timestamp: string;
}

export function useOrderTracking(orderId: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [orderStatus, setOrderStatus] = useState<string>('');
  const [deliveryLocation, setDeliveryLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [notification, setNotification] = useState<StatusNotification | null>(null);

  useEffect(() => {
    if (!orderId) return;

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    const socketInstance = io(API_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketInstance.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      socketInstance.emit('join-order', orderId);
    });

    socketInstance.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    });

    socketInstance.on('order-update', (data: OrderUpdate) => {
      if (data.orderId === orderId) {
        setOrderStatus(data.status);

        // Afficher la notification si elle existe
        if (data.title && data.message) {
          setNotification({
            status: data.status,
            title: data.title,
            message: data.message,
            timestamp: data.timestamp || new Date().toISOString(),
          });

          // Masquer la notification après 5 secondes
          setTimeout(() => {
            setNotification(null);
          }, 5000);
        }

        console.log('Order status updated:', data.status);
      }
    });

    socketInstance.on('delivery-update', (data: DeliveryUpdate) => {
      if (data.orderId === orderId) {
        if (data.location) {
          setDeliveryLocation(data.location);
        }
        if (data.eta !== undefined) {
          setEta(data.eta);
        }
        console.log('Delivery updated:', data);
      }
    });

    socketInstance.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    setSocket(socketInstance);

    return () => {
      if (socketInstance) {
        socketInstance.emit('leave-order', orderId);
        socketInstance.disconnect();
      }
    };
  }, [orderId]);

  const updateOrderStatus = useCallback((status: string) => {
    setOrderStatus(status);
  }, []);

  const updateDeliveryLocation = useCallback((location: { latitude: number; longitude: number }, eta?: number) => {
    setDeliveryLocation(location);
    if (eta !== undefined) {
      setEta(eta);
    }
  }, []);

  return {
    socket,
    orderStatus,
    deliveryLocation,
    eta,
    isConnected,
    notification,
    updateOrderStatus,
    updateDeliveryLocation,
  };
}
