import React from 'react';
import { RefreshControl, ScrollView, Text } from 'react-native';
import { apiFetch, formatEuros } from '../../lib/api';
import { useChargement } from '../../lib/useChargement';
import { Card, ErrorBox, Loading, Row, ui } from '../ui';

interface Tableau {
  stats: {
    totalRevenue: number | null;
    platformFee: number | null;
    activeOrganizations: number;
    totalUsers: number;
    criticalAlerts: number;
    systemHealth: number;
    monthlyRecurring: number | null;
    growth: number | null;
  };
  recentLogs: { id: string; action: string; target: string; createdAt: string }[];
  // Faux quand le rôle n'ouvre pas les finances : les montants arrivent nuls.
  finances: boolean;
}

const date = (d: string) => new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

export default function DashboardScreen({ token }: { token: string }) {
  const { data, erreur, enCours, recharger } = useChargement(
    () => apiFetch<Tableau>('/api/superowner/dashboard', token),
    [token]
  );

  if (enCours && !data) return <Loading />;
  if (erreur && !data) return <ErrorBox message={erreur} onRetry={recharger} />;
  if (!data) return null;
  const { stats } = data;

  return (
    <ScrollView contentContainerStyle={ui.content} refreshControl={<RefreshControl refreshing={enCours} onRefresh={recharger} />}>
      <Card title="Plateforme">
        <Row label="Organisations actives" value={stats.activeOrganizations} />
        <Row label="Utilisateurs" value={stats.totalUsers} />
        <Row label="Tickets urgents ouverts" value={stats.criticalAlerts} />
        <Row label="Santé du système" value={`${stats.systemHealth} %`} last />
      </Card>
      {data.finances && (
        <Card title="Finances">
          <Row label="Chiffre d’affaires total" value={formatEuros(stats.totalRevenue)} />
          <Row label="Commission plateforme" value={formatEuros(stats.platformFee)} />
          <Row label="Chiffre d’affaires du mois" value={formatEuros(stats.monthlyRecurring)} />
          <Row label="Évolution sur un mois" value={`${stats.growth ?? 0} %`} last />
        </Card>
      )}
      <Card title="Dernières actions d’administration">
        {data.recentLogs.length === 0 ? (
          <Text style={{ color: '#999' }}>Aucune action récente.</Text>
        ) : (
          data.recentLogs.map((l, i) => (
            <Row key={l.id} label={`${l.action}\n${date(l.createdAt)}`} value={l.target.slice(-8)} last={i === data.recentLogs.length - 1} />
          ))
        )}
      </Card>
    </ScrollView>
  );
}
