/**
 * ZupDrive Driver API Service
 * Intègre les endpoints backend (Phase 6A-6H) pour l'app chauffeur
 */

import axios, { AxiosInstance } from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface DriverStats {
  id: string;
  name: string;
  status: string;
  rating: number;
  stats: {
    totalCourses: number;
    completedCourses: number;
    completionRate: number;
    cancelledCourses: number;
    avgPrice: number;
    totalEarnings: number;
    highSeverityInfractions: number;
  };
}

interface DocumentStatus {
  type: 'PERMIS' | 'ASSURANCE' | 'INSPECTION' | 'IDENTITE';
  status: 'VALIDE' | 'EXPIREE' | 'EN_ATTENTE';
  expiresAt?: string;
}

interface Infraction {
  id: string;
  type: string;
  severity: 'BASSE' | 'MOYENNE' | 'HAUTE';
  description: string;
  createdAt: string;
  resolved: boolean;
}

interface NotificationAlert {
  id: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

interface SupportTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  status: 'OUVERT' | 'EN_COURS' | 'RESOLU' | 'FERME';
  priority: 'BASSE' | 'MOYENNE' | 'HAUTE' | 'CRITIQUE';
  createdAt: string;
}

class ZupDriveAPI {
  private api: AxiosInstance;

  constructor(token?: string) {
    this.api = axios.create({
      baseURL: API_URL,
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
  }

  /**
   * Récupérer les statistiques du chauffeur
   */
  async getDriverStats(_driverId?: string): Promise<DriverStats> {
    // Le serveur lit le dossier du jeton : aucun identifiant ne part (les routes /admin/* sont réservées à l'équipe).
    const response = await this.api.get('/api/zupdrive/chauffeur/me/stats');
    return response.data.data;
  }

  /**
   * Récupérer les infractions du chauffeur
   */
  async getDriverInfractions(_driverId?: string): Promise<Infraction[]> {
    const response = await this.api.get('/api/zupdrive/chauffeur/me/infractions');
    // Le serveur donne la date de résolution ; l'écran attend un booléen.
    return (response.data.data as Array<Infraction & { resolvedAt?: string }>).map((i) => ({
      ...i,
      resolved: !!i.resolvedAt,
    }));
  }

  /**
   * Récupérer les alertes non lues
   */
  async getUnreadAlerts(_driverId?: string): Promise<NotificationAlert[]> {
    // Le chauffeur est celui du jeton ; l'identifiant n'est plus envoyé.
    const response = await this.api.get('/api/zupdrive/notifications/alerts/unread');
    return response.data;
  }

  /**
   * Marquer une alerte comme lue
   */
  async markAlertAsRead(alertId: string): Promise<void> {
    await this.api.patch(`/api/zupdrive/notifications/alerts/${alertId}/read`);
  }

  /**
   * Créer un ticket de support
   */
  async createSupportTicket(data: {
    category: string;
    priority: string;
    subject: string;
    description: string;
    reporterId?: string;
  }): Promise<SupportTicket> {
    // Le déclarant est le compte du jeton : seuls les champs du ticket partent.
    const { category, priority, subject, description } = data;
    const response = await this.api.post('/api/zupdrive/support/tickets', { category, priority, subject, description });
    return response.data;
  }

  /**
   * Récupérer les tickets du chauffeur
   */
  async getDriverTickets(_driverId?: string): Promise<SupportTicket[]> {
    // Le serveur ne renvoie que les tickets du compte du jeton.
    const response = await this.api.get('/api/zupdrive/support/tickets');
    return response.data.tickets || [];
  }

  /**
   * Ajouter un message au ticket
   */
  async addTicketMessage(ticketId: string, message: string, _authorId?: string): Promise<void> {
    // L'auteur est le compte du jeton, avec le type de son ticket.
    await this.api.post(`/api/zupdrive/support/tickets/${ticketId}/messages`, { message });
  }

  /**
   * Récupérer les détails complets du ticket (avec messages)
   */
  async getTicketDetail(ticketId: string): Promise<any> {
    const response = await this.api.get(`/api/zupdrive/support/tickets/${ticketId}`);
    return response.data;
  }
}

export default ZupDriveAPI;
export type { DriverStats, Infraction, NotificationAlert, SupportTicket, DocumentStatus };
