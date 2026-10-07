/**
 * WebSocket Middleware
 *
 * Middleware Express pour initialiser et gérer WebSocket
 */

import { Server } from 'http';
import { initializeWebSocket } from '../services/websocket';

export function setupWebSocket(server: Server) {
  const wsService = initializeWebSocket(server);
  console.log('[WebSocket] Service initialized');
  return wsService;
}

// Exporter pour utilisation dans les routes
export { wsService } from '../services/websocket';
export { EventBroadcaster } from '../services/event-broadcaster';

/**
 * USAGE IN EXPRESS APP
 *
 * import { createServer } from 'http';
 * import express from 'express';
 * import { setupWebSocket } from './middleware/websocket-middleware';
 *
 * const app = express();
 * const server = createServer(app);
 *
 * // Setup WebSocket
 * setupWebSocket(server);
 *
 * // Setup routes
 * app.use(routes);
 *
 * // Start server
 * server.listen(3001, () => {
 *   console.log('Server running on port 3001');
 * });
 */

/**
 * USAGE IN SERVICES
 *
 * import { EventBroadcaster } from '../services/event-broadcaster';
 *
 * // Emit course completed event
 * EventBroadcaster.courseCompleted({
 *   userId: 'user-123',
 *   courseId: 'course-789',
 *   amount: 825,
 *   passengerName: 'Jean Dupont',
 *   distance: 5,
 *   duration: 10,
 * });
 *
 * // Emit payout status changed
 * EventBroadcaster.payoutStatusChanged({
 *   userId: 'user-123',
 *   payoutId: 'payout-456',
 *   status: 'COMPLETED',
 *   amount: 250000,
 * });
 *
 * // Emit admin alert
 * EventBroadcaster.complianceAlert({
 *   chauffeurId: 'chauffeur-123',
 *   riskLevel: 'CRITICAL',
 *   reason: 'Fraud indicators detected',
 *   score: 15,
 * });
 */
