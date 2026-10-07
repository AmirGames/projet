/**
 * WebSocket Service
 *
 * Gestion des connexions WebSocket et diffusion d'événements en temps réel
 * - Connexions par utilisateur
 * - Broadcast d'événements
 * - Heartbeat pour garder les connexions vivantes
 * - Reconnexion automatique côté client
 */

import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';

interface WebSocketMessage {
  type: string;
  data?: Record<string, any>;
  timestamp: string;
}

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  chauffeurId?: string;
  isAlive?: boolean;
}

class WebSocketService {
  private wss: WebSocketServer;
  private userConnections: Map<string, Set<AuthenticatedWebSocket>> = new Map();
  private connectionCount = 0;

  constructor(server: any) {
    this.wss = new WebSocketServer({
      server,
      perMessageDeflate: false, // Disable compression for lower latency
    });

    this.setupConnectionHandler();
    this.setupHeartbeat();
  }

  /**
   * Configurer le gestionnaire de connexion
   */
  private setupConnectionHandler() {
    this.wss.on('connection', (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
      // Authentifier la connexion
      this.authenticateConnection(ws, req);

      if (!ws.userId) {
        ws.close(1008, 'Unauthorized');
        return;
      }

      this.connectionCount++;
      console.log(`[WS] User connected: ${ws.userId} (Total: ${this.connectionCount})`);

      // Enregistrer la connexion
      if (!this.userConnections.has(ws.userId)) {
        this.userConnections.set(ws.userId, new Set());
      }
      this.userConnections.get(ws.userId)!.add(ws);

      // Gérer les messages
      ws.on('message', (data: Buffer) => this.handleMessage(ws, data));

      // Gérer la fermeture
      ws.on('close', () => this.handleClose(ws));

      // Gérer les erreurs
      ws.on('error', (error) => {
        console.error(`[WS] Error for ${ws.userId}:`, error.message);
      });

      // Heartbeat
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Envoyer un message de bienvenue
      this.sendToUser(ws.userId, {
        type: 'CONNECTED',
        data: { userId: ws.userId },
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Authentifier la connexion WebSocket
   */
  private authenticateConnection(ws: AuthenticatedWebSocket, req: IncomingMessage) {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      console.warn('[WS] Connection attempt without token');
      return;
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
      ws.userId = decoded.userId;
      ws.chauffeurId = decoded.chauffeurId;
      console.log(`[WS] Authenticated: ${ws.userId}`);
    } catch (error) {
      console.error('[WS] Token verification failed:', error);
    }
  }

  /**
   * Gérer les messages reçus du client
   */
  private handleMessage(ws: AuthenticatedWebSocket, data: Buffer) {
    try {
      const message = JSON.parse(data.toString()) as WebSocketMessage;

      switch (message.type) {
        case 'PING':
          ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
          break;

        case 'SUBSCRIBE':
          // Le client peut s'abonner à des événements spécifiques
          console.log(`[WS] ${ws.userId} subscribing to ${message.data?.channel}`);
          break;

        case 'UNSUBSCRIBE':
          console.log(`[WS] ${ws.userId} unsubscribing from ${message.data?.channel}`);
          break;

        default:
          console.warn(`[WS] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('[WS] Error parsing message:', error);
    }
  }

  /**
   * Gérer la fermeture de connexion
   */
  private handleClose(ws: AuthenticatedWebSocket) {
    if (!ws.userId) return;

    this.connectionCount--;
    const connections = this.userConnections.get(ws.userId);
    if (connections) {
      connections.delete(ws);
      if (connections.size === 0) {
        this.userConnections.delete(ws.userId);
      }
    }

    console.log(`[WS] User disconnected: ${ws.userId} (Total: ${this.connectionCount})`);
  }

  /**
   * Configurer le heartbeat (ping/pong)
   */
  private setupHeartbeat() {
    setInterval(() => {
      this.wss.clients.forEach((ws: any) => {
        if (!ws.isAlive) {
          ws.terminate();
          return;
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // Every 30 seconds
  }

  /**
   * Envoyer un message à un utilisateur spécifique
   */
  public sendToUser(userId: string, message: WebSocketMessage) {
    const connections = this.userConnections.get(userId);
    if (!connections) return;

    const payload = JSON.stringify({
      ...message,
      timestamp: message.timestamp || new Date().toISOString(),
    });

    connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }

  /**
   * Envoyer un message à plusieurs utilisateurs
   */
  public sendToUsers(userIds: string[], message: WebSocketMessage) {
    userIds.forEach((userId) => this.sendToUser(userId, message));
  }

  /**
   * Broadcast à tous les clients
   */
  public broadcastAll(message: WebSocketMessage) {
    const payload = JSON.stringify({
      ...message,
      timestamp: message.timestamp || new Date().toISOString(),
    });

    this.wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }

  /**
   * Broadcast à tous les admins
   */
  public broadcastAdmins(message: WebSocketMessage) {
    // TODO: Filtrer les connexions admin (rôle ADMIN_ZUPDRIVE)
    // Pour l'instant, broadcast à tous
    this.broadcastAll(message);
  }

  /**
   * Obtenir le nombre de connexions actives
   */
  public getConnectionCount(): number {
    return this.connectionCount;
  }

  /**
   * Obtenir le nombre de connexions pour un utilisateur
   */
  public getUserConnectionCount(userId: string): number {
    return this.userConnections.get(userId)?.size || 0;
  }
}

// Export singleton
export let wsService: WebSocketService;

export function initializeWebSocket(server: any): WebSocketService {
  wsService = new WebSocketService(server);
  return wsService;
}

export { WebSocketService };

/**
 * EVENT TYPES BROADCAST
 *
 * COURSE_COMPLETED
 * ├─ { courseId, amount, passengerName, durationMinutes }
 * └─ To: Driver
 *
 * EARNING_UPDATED
 * ├─ { todayEarnings, weekEarnings, coursesToday }
 * └─ To: Driver
 *
 * RATING_RECEIVED
 * ├─ { rating, comment, passengerName, courseId }
 * └─ To: Driver
 *
 * PAYOUT_STATUS_CHANGED
 * ├─ { payoutId, status, amount, reason }
 * └─ To: Driver
 *
 * NOTIFICATION_CREATED
 * ├─ { notificationId, type, title, message, priority }
 * └─ To: Driver or Admin
 *
 * COMPLIANCE_ALERT
 * ├─ { chauffeurId, riskLevel, reason }
 * └─ To: Admin
 *
 * DRIVER_STATUS_CHANGED
 * ├─ { chauffeurId, status, reason }
 * └─ To: Admin
 *
 * DASHBOARD_UPDATE
 * ├─ { activeDrivers, totalCourses, totalEarnings, alertCount }
 * └─ To: Admin (broadcast)
 */
