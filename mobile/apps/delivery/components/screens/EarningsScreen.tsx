import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { apiFetch, formatEuros } from '../../lib/api';
import { shortId } from '../../lib/deliveries';
import { Card, COLORS, ErrorBox, Loading, Row, ScreenHeader, themedStyles, ui } from '../ui';

interface Earnings {
  total: number;
  today: number;
  week: number;
  month: number;
  deliveryCount: number;
  deliveries: { id: string; orderId: string; deliveredAt: string; earning: number }[];
}

interface Payouts {
  duNonArrete: number;
  enAttenteDeVersement: number;
  verse: number;
  coursesDues: number;
  releves: {
    id: string;
    periodStart: string;
    periodEnd: string;
    deliveryCount: number;
    amount: number;
    status: 'PENDING' | 'PAID' | string;
    methodLibelle?: string | null;
    reference?: string | null;
    paidAt?: string | null;
  }[];
}

const day = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

export default function EarningsScreen({ token, onBack }: { token: string; onBack: () => void }) {
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [payouts, setPayouts] = useState<Payouts | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [e, p] = await Promise.all([
        apiFetch<Earnings>('/api/drivers/earnings', token),
        apiFetch<{ data: Payouts }>('/api/drivers/payouts', token),
      ]);
      setEarnings(e);
      setPayouts(p.data);
    } catch (err: any) {
      setError(err.message || 'Impossible de charger vos revenus');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Revenus 💶" onBack={onBack} />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : (
        <ScrollView
          contentContainerStyle={ui.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Ce mois-ci</Text>
            <Text style={styles.heroValue}>{formatEuros(earnings?.month)}</Text>
            <View style={styles.periods}>
              <View style={styles.period}>
                <Text style={styles.periodValue}>{formatEuros(earnings?.today)}</Text>
                <Text style={styles.periodLabel}>Aujourd’hui</Text>
              </View>
              <View style={styles.period}>
                <Text style={styles.periodValue}>{formatEuros(earnings?.week)}</Text>
                <Text style={styles.periodLabel}>Semaine</Text>
              </View>
              <View style={styles.period}>
                <Text style={styles.periodValue}>{earnings?.deliveryCount ?? 0}</Text>
                <Text style={styles.periodLabel}>Courses</Text>
              </View>
            </View>
          </View>

          {payouts && (
            <Card title="Mes versements">
              <Row
                label={`À venir (${payouts.coursesDues} course${payouts.coursesDues > 1 ? 's' : ''})`}
                value={formatEuros(payouts.duNonArrete)}
              />
              <Row label="Arrêté, virement en cours" value={formatEuros(payouts.enAttenteDeVersement)} />
              <Row label="Déjà versé" value={formatEuros(payouts.verse)} last />
            </Card>
          )}

          {payouts && payouts.releves.length > 0 && (
            <Card title="Relevés">
              {payouts.releves.map((r, i) => (
                <View key={r.id} style={[styles.statement, i === payouts.releves.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.statementTitle}>
                      {day(r.periodStart)} – {day(r.periodEnd)}
                    </Text>
                    <Text style={styles.statementMeta}>
                      {r.deliveryCount} course{r.deliveryCount > 1 ? 's' : ''}
                      {r.status === 'PAID'
                        ? ` · versé${r.paidAt ? ` le ${day(r.paidAt)}` : ''}${r.methodLibelle ? ` · ${r.methodLibelle}` : ''}`
                        : ' · virement en cours'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.statementAmount}>{formatEuros(r.amount)}</Text>
                    <Text style={[styles.statementStatus, { color: r.status === 'PAID' ? COLORS.successText : COLORS.warning }]}>
                      {r.status === 'PAID' ? '✓ Payé' : '⏳ En attente'}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          )}

          <Card title="Dernières courses payées">
            {(earnings?.deliveries || []).length === 0 ? (
              <Text style={styles.empty}>Vos gains apparaîtront après votre première course livrée.</Text>
            ) : (
              earnings!.deliveries.map((d, i, list) => (
                <Row
                  key={d.id}
                  label={`${shortId(d.orderId)} · ${day(d.deliveredAt)}`}
                  value={formatEuros(d.earning)}
                  last={i === list.length - 1}
                />
              ))
            )}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  hero: { backgroundColor: COLORS.card, borderRadius: 12, padding: 16, marginBottom: 12 },
  heroLabel: { fontSize: 13, color: COLORS.secondary },
  heroValue: { fontSize: 44, fontWeight: '600', color: COLORS.text, letterSpacing: -1, marginVertical: 2 },
  periods: { flexDirection: 'row', marginTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10 },
  period: { flex: 1, alignItems: 'center' },
  periodValue: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  periodLabel: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  statement: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  statementTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  statementMeta: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  statementAmount: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  statementStatus: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  empty: { fontSize: 13, color: COLORS.muted, paddingVertical: 8 },
}));
