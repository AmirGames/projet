import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from './logger';
import { verifyToken } from '../middleware/auth';
import { AuthenticatedSocket } from '../types/socket';

export let io: SocketIOServer;

export function initializeSocket(httpServer: HTTPServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: [process.env.FRONTEND_URL || 'http://localhost:3000'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const decoded = verifyToken(token);
      socket.userId = decoded.userId;
      socket.userRole = decoded.role;
      socket.organizationId = decoded.orgId;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info('User connected', { userId: socket.userId, socketId: socket.id });

    socket.on('join-order', (orderId: string) => {
      socket.join(`order-${orderId}`);
      logger.info('User joined order room', { orderId, socketId: socket.id });
    });

    socket.on('leave-order', (orderId: string) => {
      socket.leave(`order-${orderId}`);
      logger.info('User left order room', { orderId, socketId: socket.id });
    });

    socket.on('disconnect', () => {
      logger.info('User disconnected', { userId: socket.userId, socketId: socket.id });
    });

    socket.on('error', (error) => {
      logger.error('Socket error', { error, userId: socket.userId });
    });
  });

  return io;
}

export function emitOrderUpdate(orderId: string, status: string, data?: any) {
  io.to(`order-${orderId}`).emit('order-update', {
    orderId,
    status,
    timestamp: new Date().toISOString(),
    ...data,
  });
}

export function emitDeliveryUpdate(orderId: string, data: any) {
  io.to(`order-${orderId}`).emit('delivery-update', {
    orderId,
    timestamp: new Date().toISOString(),
    ...data,
  });
}
