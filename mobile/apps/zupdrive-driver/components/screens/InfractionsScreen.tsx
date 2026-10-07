import React, { useContext, useEffect, useState } from 'react';
import { View, ScrollView, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useDriverInfractions } from '../../hooks/useZupDriveDriver';
import { AuthContext } from '../../lib/auth';

export function InfractionsScreen() {
  const { user } = useContext(AuthContext);
  const driverId = user?.id || '';
  const token = user?.token || '';

  const { infractions, loading, highSeverityCount } = useDriverInfractions(driverId, token);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'HAUTE':
        return '#CC0000';
      case 'MOYENNE':
        return '#FFAA00';
      case 'BASSE':
        return '#00AA00';
      default:
        return '#666';
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case 'HAUTE':
        return 'Haute gravité';
      case 'MOYENNE':
        return 'Gravité moyenne';
      case 'BASSE':
        return 'Basse gravité';
      default:
        return severity;
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Infractions</Text>

        {highSeverityCount > 0 && (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>⚠️ Attention</Text>
            <Text style={styles.warningText}>
              Vous avez {highSeverityCount} infraction(s) de haute gravité. Celles-ci peuvent entraîner une
              suspension de votre compte.
            </Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="large" color="#0066CC" />
        ) : infractions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>✓</Text>
            <Text style={styles.emptyText}>Aucune infraction</Text>
            <Text style={styles.emptySubtext}>Continuez ainsi !</Text>
          </View>
        ) : (
          <FlatList
            data={infractions}
            keyExtractor={(i) => i.id}
            scrollEnabled={false}
            renderItem={({ item: infraction }) => (
              <View style={styles.infractionCard}>
                <View style={styles.infractionHeader}>
                  <Text
                    style={[styles.severityBadge, { color: getSeverityColor(infraction.severity) }]}
                  >
                    {getSeverityLabel(infraction.severity)}
                  </Text>
                  <Text style={styles.infractionType}>{infraction.type}</Text>
                </View>
                <Text style={styles.infractionDescription}>{infraction.description}</Text>
                <View style={styles.infractionFooter}>
                  <Text style={styles.infractionDate}>
                    {new Date(infraction.createdAt).toLocaleDateString('fr-FR')}
                  </Text>
                  {infraction.resolved && <Text style={styles.resolvedBadge}>✓ Résolvée</Text>}
                </View>
              </View>
            )}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1a1a1a',
  },
  warningCard: {
    backgroundColor: '#FFF3CD',
    borderLeftWidth: 4,
    borderLeftColor: '#FFAA00',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#CC8800',
    marginBottom: 6,
  },
  warningText: {
    fontSize: 13,
    color: '#AA6600',
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 6,
  },
  infractionCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  infractionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  severityBadge: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  infractionType: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
    flex: 1,
  },
  infractionDescription: {
    fontSize: 14,
    color: '#1a1a1a',
    marginBottom: 8,
  },
  infractionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infractionDate: {
    fontSize: 12,
    color: '#999',
  },
  resolvedBadge: {
    fontSize: 12,
    color: '#00AA00',
    fontWeight: '600',
  },
});
