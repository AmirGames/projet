/**
 * ZupDrive Driver Dashboard Screen
 * Affiche les stats, alertes, infractions et support
 */

import React, { useContext } from 'react';
import { View, ScrollView, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useDriverStats, useDriverAlerts, useDriverInfractions } from '../../hooks/useZupDriveDriver';
import { AuthContext } from '../../lib/auth'; // À adapter selon votre structure

export default function DriverDashboardScreen() {
  const { user } = useContext(AuthContext);
  const driverId = user?.id || '';
  const token = user?.token || '';

  const { stats, loading: statsLoading } = useDriverStats(driverId, token);
  const { alerts, unreadCount } = useDriverAlerts(driverId, token);
  const { infractions, highSeverityCount } = useDriverInfractions(driverId, token);

  if (statsLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0066CC" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* En-tête avec infos principales */}
      <View style={styles.headerCard}>
        <Text style={styles.title}>Tableau de bord</Text>
        <Text style={styles.subtitle}>{stats?.name || 'Chauffeur'}</Text>
      </View>

      {/* Cards de statistiques */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Courses</Text>
          <Text style={styles.statValue}>{stats?.stats.totalCourses || 0}</Text>
          <Text style={styles.statSubtitle}>
            {stats?.stats.completionRate.toFixed(1) || 0}% complétées
          </Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Note</Text>
          <Text style={styles.statValue}>{stats?.rating.toFixed(1) || 'N/A'}</Text>
          <Text style={styles.statSubtitle}>★★★★☆</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Revenus</Text>
          <Text style={styles.statValue}>€{(stats?.stats.totalEarnings / 100).toFixed(0)}</Text>
          <Text style={styles.statSubtitle}>Total</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Status</Text>
          <Text
            style={[
              styles.statValue,
              {
                color: stats?.status === 'VALIDE' ? '#00AA00' : stats?.status === 'SUSPENDU' ? '#CC0000' : '#FFAA00',
              },
            ]}
          >
            {stats?.status === 'VALIDE' ? '✓' : stats?.status === 'SUSPENDU' ? '⚠' : '○'}
          </Text>
          <Text style={styles.statSubtitle}>{stats?.status || 'N/A'}</Text>
        </View>
      </View>

      {/* Alertes */}
      {unreadCount > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Alertes ({unreadCount})</Text>
            <TouchableOpacity>
              <Text style={styles.link}>Voir tout</Text>
            </TouchableOpacity>
          </View>

          {alerts.slice(0, 3).map((alert) => (
            <View
              key={alert.id}
              style={[
                styles.alertCard,
                {
                  borderLeftColor:
                    alert.severity === 'CRITICAL'
                      ? '#CC0000'
                      : alert.severity === 'WARNING'
                      ? '#FFAA00'
                      : '#0066CC',
                },
              ]}
            >
              <Text style={styles.alertTitle}>{alert.title}</Text>
              <Text style={styles.alertMessage}>{alert.message}</Text>
              <Text style={styles.alertDate}>{new Date(alert.createdAt).toLocaleDateString('fr-FR')}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Infractions */}
      {highSeverityCount > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>⚠️ Infractions graves ({highSeverityCount})</Text>
          </View>

          <View style={styles.warningCard}>
            <Text style={styles.warningText}>Vous avez {highSeverityCount} infraction(s) de haute gravité.</Text>
            <Text style={styles.warningSubtext}>
              Veuillez consulter la section Support pour plus de détails.
            </Text>
            <TouchableOpacity style={styles.warningButton}>
              <Text style={styles.warningButtonText}>Consulter les infractions</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Actions rapides */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions</Text>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>📞 Contacter le support</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>📄 Voir mes documents</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>⚙️ Paramètres</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  headerCard: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    elevation: 2,
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0066CC',
  },
  statSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  link: {
    fontSize: 14,
    color: '#0066CC',
    fontWeight: '500',
  },
  alertCard: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  alertMessage: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
  },
  alertDate: {
    fontSize: 11,
    color: '#999',
  },
  warningCard: {
    backgroundColor: '#FFF3CD',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FFAA00',
  },
  warningText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#CC8800',
    marginBottom: 8,
  },
  warningSubtext: {
    fontSize: 13,
    color: '#AA6600',
    marginBottom: 12,
  },
  warningButton: {
    backgroundColor: '#FFAA00',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  warningButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  actionButton: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#0066CC',
  },
});
