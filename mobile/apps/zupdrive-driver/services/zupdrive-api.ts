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
  async getDriverStats(driverId: string): Promise<DriverStats> {
    const response = await this.api.get(`/api/zupdrive/admin/drivers/${driverId}/stats`);
    return response.data;
  }

  /**
   * Récupérer les infractions du chauffeur
   */
  async getDriverInfractions(driverId: string): Promise<Infraction[]> {
    const response = await this.api.get(`/api/zupdrive/admin/drivers/${driverId}/infractions`);
    return response.data;
  }

  /**
   * Récupérer les alertes non lues
   */
  async getUnreadAlerts(driverId: string): Promise<NotificationAlert[]> {
    const response = await this.api.get(`/api/zupdrive/notifications/alerts/unread`, {
      params: { driverId },
    });
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
    reporterId: string;
  }): Promise<SupportTicket> {
    const response = await this.api.post('/api/zupdrive/support/tickets', data);
    return response.data;
  }

  /**
   * Récupérer les tickets du chauffeur
   */
  async getDriverTickets(driverId: string): Promise<SupportTicket[]> {
    const response = await this.api.get('/api/zupdrive/admin/support/tickets', {
      params: { reporterId: driverId },
    });
    return response.data.tickets || [];
  }

  /**
   * Ajouter un message au ticket
   */
  async addTicketMessage(ticketId: string, message: string, authorId: string): Promise<void> {
    await this.api.post(`/api/zupdrive/support/tickets/${ticketId}/messages`, {
      authorId,
      authorType: 'CHAUFFEUR',
      message,
    });
  }

  /**
   * Récupérer les détails complets du ticket (avec messages)
   */
  async getTicketDetail(ticketId: string): Promise<any> {
    const response = await this.api.get(`/api/zupdrive/admin/support/tickets/${ticketId}`);
    return response.data;
  }

  /**
   * Calculer le prix d'une course (pour estimation)
   */
  async calculatePrice(data: {
    region: string;
    distanceKm: number;
    durationMin: number;
  }): Promise<any> {
    const response = await this.api.post('/api/zupdrive/config/calculate-price', data);
    return response.data;
  }

  /**
   * Obtenir les configurations régionales
   */
  async getRegionalConfig(region: string): Promise<any> {
    const response = await this.api.get(`/api/zupdrive/admin/config/regions/${region}`);
    return response.data;
  }
}

export default ZupDriveAPI;
export type { DriverStats, Infraction, NotificationAlert, SupportTicket, DocumentStatus };
