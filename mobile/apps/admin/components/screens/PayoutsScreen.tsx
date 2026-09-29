import React, { useState } from 'react';
import { Alert, FlatList, RefreshControl, Text, View } from 'react-native';
import { apiFetch, formatEuros } from '../../lib/api';
import { useChargement } from '../../lib/useChargement';
import Chips from '../Chips';
import { Card, COLORS, ErrorBox, Loading, Row } from '../ui';
import { Bouton, s } from './MerchantsScreen';

/**
 * Les versements : relevés des commerçants et des livreurs, et le lot SEPA
 * en attente.
 *
 * Télécharger le fichier SEPA et marquer le lot versé restent sur l'espace
 * web : le fichier s'importe dans la banque depuis un ordinateur, et marquer
 * versé sans l'avoir importé fausserait la comptabilité.
 */

interface ReleveCommercant {
  id: string;
  organization: string;
  amount: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  ibanFin: string | null;
  ibanValide: boolean;
}

interface ReleveLivreur {
  id: string;
  driverName: string;
  amount: number;
  status: string;
  periodStart: string;
  periodEnd: string;
}

interface LotSepa {
  reference: string;
  total: number;
  nombre: number;
  ecartes: { type: string; id: string; nom: string; montant: number; raison: string }[];
  pret: boolean;
}

type Vue = 'commercants' | 'livreurs';
type Etat = 'PENDING' | 'PAID';

const VUES: { value: Vue; label: string }[] = [
  { value: 'commercants', label: 'Commerçants' },
  { value: 'livreurs', label: 'Livreurs' },
];
const ETATS: { value: Etat; label: string }[] = [
  { value: 'PENDING', label: 'À verser' },
  { value: 'PAID', label: 'Versés' },
];

const jour = (d: string) => new Date(d).toLocaleDateString('fr-FR');
const periode = (r: { periodStart: string; periodEnd: string }) => `${jour(r.periodStart)} → ${jour(r.periodEnd)}`;

export default function PayoutsScreen({ token, modifiable }: { token: string; modifiable: boolean }) {
  const [vue, setVue] = useState<Vue>('commercants');
  const [etat, setEtat] = useState<Etat>('PENDING');

  // Le lot peut être indisponible (compte SEPA de la plateforme non réglé) :
  // l'erreur s'affiche dans sa carte sans bloquer les relevés.
  const lot = useChargement(
    () => apiFetch<{ data: LotSepa }>('/api/superowner/versements/sepa', token).then((r) => r.data),
    [token]
  );
  const releves = useChargement<(ReleveCommercant | ReleveLivreur)[]>(
    () =>
      vue === 'commercants'
        ? apiFetch<{ data: ReleveCommercant[] }>(`/api/superowner/merchant-payouts?status=${etat}`, token).then((r) => r.data)
        : apiFetch<{ payouts: ReleveLivreur[] }>(`/api/superowner/payouts?status=${etat}`, token).then((r) => r.payouts),
    [token, vue, etat]
  );

  const recharger = () => {
    lot.recharger();
    releves.recharger();
  };

  const arreter = () =>
    Alert.alert(
      'Arrêter la semaine écoulée ?',
      'Les relevés de la semaine passée sont créés maintenant au lieu de lundi 00 h 00. Une semaine déjà arrêtée n’est jamais reprise.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Arrêter',
          onPress: async () => {
            try {
              const r = await apiFetch<{ data: { commercants: number; livreurs: number; inactif: boolean } }>(
                '/api/superowner/versements/arreter',
                token,
                { method: 'POST', body: {} }
              );
              Alert.alert(
                'Semaine arrêtée',
                r.data.inactif
                  ? 'Les reversements ne sont pas encore actifs pour cette période.'
                  : `${r.data.commercants} relevé(s) commerçant, ${r.data.livreurs} relevé(s) livreur.`
              );
              recharger();
            } catch (e) {
              Alert.alert('Action impossible', e instanceof Error ? e.message : 'Erreur');
            }
          },
        },
      ]
    );

  const entete = (
    <View>
      <Card title="Lot SEPA en attente">
        {lot.enCours && !lot.data ? (
          <Text style={s.meta}>Chargement…</Text>
        ) : lot.erreur ? (
          <Text style={{ color: COLORS.danger }}>{lot.erreur}</Text>
        ) : lot.data ? (
          <>
            <Row label="Référence" value={lot.data.reference} />
            <Row label="Virements" value={lot.data.nombre} />
            <Row label="Total" value={formatEuros(lot.data.total)} last={lot.data.ecartes.length === 0} />
            {lot.data.ecartes.map((e, i) => (
              <Row
                key={e.id}
                label={`⚠️ ${e.nom} (${e.type})\n${e.raison}`}
                value={formatEuros(e.montant)}
                last={i === lot.data!.ecartes.length - 1}
              />
            ))}
          </>
        ) : null}
        <Text style={[s.meta, { marginTop: 8 }]}>
          Le fichier SEPA se télécharge et le lot se marque versé depuis l’espace web.
        </Text>
        {modifiable && (
          <View style={s.actions}>
            <Bouton label="Arrêter la semaine" couleur={COLORS.primary} onPress={arreter} />
          </View>
        )}
      </Card>
      <Chips options={VUES} value={vue} onChange={setVue} />
      <Chips options={ETATS} value={etat} onChange={setEtat} />
    </View>
  );

  if (releves.erreur && !releves.data) return <ErrorBox message={releves.erreur} onRetry={recharger} />;

  return (
    <FlatList
      data={releves.data ?? []}
      keyExtractor={(r) => r.id}
      contentContainerStyle={{ padding: 12 }}
      ListHeaderComponent={entete}
      refreshControl={<RefreshControl refreshing={releves.enCours} onRefresh={recharger} />}
      ListEmptyComponent={releves.enCours ? <Loading /> : <Text style={s.vide}>Aucun relevé.</Text>}
      renderItem={({ item: r }) => (
        <View style={s.card}>
          <Text style={s.nom}>{'organization' in r ? r.organization : r.driverName}</Text>
          <Text style={s.meta}>{periode(r)} · {formatEuros(r.amount)}</Text>
          {'organization' in r && (
            <Text style={[s.meta, !r.ibanValide && { color: COLORS.danger }]}>
              {r.ibanValide ? `IBAN …${r.ibanFin}` : 'IBAN manquant ou invalide'}
            </Text>
          )}
        </View>
      )}
    />
  );
}
