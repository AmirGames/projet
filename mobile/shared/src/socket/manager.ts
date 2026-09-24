import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../constants/api';

export type SocketEvent =
  | 'order:new'
  | 'order:status-changed'
  | 'order:assigned'
  | 'delivery:location-update'
  | 'notification:receive'
  | 'merchant:online'
  | 'merchant:offline';

type EventHandler = (data: any) => void;

class SocketManager {
  private socket: Socket | null = null;
  private handlers: Map<SocketEvent, EventHandler[]> = new Map();
  private isConnected = false;

  connect(accessToken: string) {
    if (this.socket?.connected) return this.socket;

    this.socket = io(SOCKET_URL, {
      auth: {
        token: accessToken,
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      console.log('Socket connected');
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      console.log('Socket disconnected');
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    // Re-register all handlers
    this.handlers.forEach((handlers, event) => {
      handlers.forEach((handler) => {
        this.socket?.on(event, handler);
      });
    });

    return this.socket;
  }

  on(event: SocketEvent, handler: EventHandler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);

    if (this.socket) {
      this.socket.on(event, handler);
    }
  }

  off(event: SocketEvent, handler: EventHandler) {
    if (!this.handlers.has(event)) return;

    const handlers = this.handlers.get(event)!;
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }

    if (this.socket) {
      this.socket.off(event, handler);
    }
  }

  emit(event: string, data?: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  getSocket() {
    return this.socket;
  }

  isReady() {
    return this.isConnected && this.socket?.connected;
  }
}

export const socketManager = new SocketManager();
