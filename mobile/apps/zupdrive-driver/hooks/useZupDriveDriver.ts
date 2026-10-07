/**
 * Hooks personnalisés pour ZupDrive Driver App
 * Intègre les données de Phase 6 (stats, notifications, support, infractions)
 */

import { useEffect, useState, useCallback } from 'react';
import ZupDriveAPI, {
  DriverStats,
  Infraction,
  NotificationAlert,
  SupportTicket,
} from '../services/zupdrive-api';

interface UseDriverStatsResult {
  stats: DriverStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UseDriverAlertsResult {
  alerts: NotificationAlert[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (alertId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

interface UseDriverInfractionsResult {
  infractions: Infraction[];
  loading: boolean;
  error: string | null;
  highSeverityCount: number;
}

interface UseDriverTicketsResult {
  tickets: SupportTicket[];
  openCount: number;
  loading: boolean;
  createTicket: (data: any) => Promise<SupportTicket>;
  refetch: () => Promise<void>;
}

/**
 * Hook pour récupérer les statistiques du chauffeur
 */
export function useDriverStats(driverId: string, token?: string): UseDriverStatsResult {
  const [stats, setStats] = useState<DriverStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const api = new ZupDriveAPI(token);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getDriverStats(driverId);
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [driverId, api]);

  useEffect(() => {
    refetch();
    // Rafraîchir toutes les 30 secondes
    const interval = setInterval(refetch, 30000);
    return () => clearInterval(interval);
  }, [refetch]);

  return { stats, loading, error, refetch };
}

/**
 * Hook pour récupérer les alertes du chauffeur
 */
export function useDriverAlerts(driverId: string, token?: string): UseDriverAlertsResult {
  const [alerts, setAlerts] = useState<NotificationAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const api = new ZupDriveAPI(token);

  const markAsRead = useCallback(
    async (alertId: string) => {
      try {
        await api.markAlertAsRead(alertId);
        setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, read: true } : a)));
      } catch (err) {
        console.error('Erreur lors du marquage:', err);
      }
    },
    [api]
  );

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getUnreadAlerts(driverId);
      setAlerts(data);
    } catch (err) {
      console.error('Erreur lors du chargement des alertes:', err);
    } finally {
      setLoading(false);
    }
  }, [driverId, api]);

  useEffect(() => {
    refetch();
    // Rafraîchir toutes les 60 secondes
    const interval = setInterval(refetch, 60000);
    return () => clearInterval(interval);
  }, [refetch]);

  const unreadCount = alerts.filter((a) => !a.read).length;

  return { alerts, unreadCount, loading, markAsRead, refetch };
}

/**
 * Hook pour récupérer les infractions du chauffeur
 */
export function useDriverInfractions(driverId: string, token?: string): UseDriverInfractionsResult {
  const [infractions, setInfractions] = useState<Infraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const api = new ZupDriveAPI(token);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await api.getDriverInfractions(driverId);
        setInfractions(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setLoading(false);
      }
    })();
  }, [driverId, api]);

  const highSeverityCount = infractions.filter((i) => i.severity === 'HAUTE').length;

  return { infractions, loading, error, highSeverityCount };
}

/**
 * Hook pour gérer les tickets de support du chauffeur
 */
export function useDriverSupport(driverId: string, token?: string): UseDriverTicketsResult {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  const api = new ZupDriveAPI(token);

  const createTicket = useCallback(
    async (data: any) => {
      const ticket = await api.createSupportTicket({
        ...data,
        reporterId: driverId,
      });
      setTickets((prev) => [ticket, ...prev]);
      return ticket;
    },
    [driverId, api]
  );

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getDriverTickets(driverId);
      setTickets(data);
    } catch (err) {
      console.error('Erreur lors du chargement des tickets:', err);
    } finally {
      setLoading(false);
    }
  }, [driverId, api]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const openCount = tickets.filter((t) => ['OUVERT', 'EN_COURS'].includes(t.status)).length;

  return { tickets, openCount, loading, createTicket, refetch };
}

/**
 * Hook pour calculer le prix d'une course
 */
export function usePriceCalculation(token?: string) {
  const api = new ZupDriveAPI(token);

  return useCallback(
    async (region: string, distanceKm: number, durationMin: number) => {
      return api.calculatePrice({
        region,
        distanceKm,
        durationMin,
      });
    },
    [api]
  );
}
