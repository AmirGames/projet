import React, { useState } from 'react';
import { Alert, FlatList, Modal, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiFetch } from '../../lib/api';
import { useChargement } from '../../lib/useChargement';
import Chips from '../Chips';
import { COLORS, ErrorBox, Loading } from '../ui';
import { Bouton, s } from './MerchantsScreen';

/**
 * L'équipe d'administration : réservée au superowner (le serveur refuse tout
 * autre compte, voir team.admin.routes). Faire entrer un compte existant,
 * changer son rôle par plateforme, lui retirer une plateforme ou l'équipe.
 * Le réglage fin des permissions de chaque groupe reste sur l'espace web.
 */

type Plateforme = 'EAT' | 'DRIVE';

interface Membre {
  id: string;
  email: string;
  name: string;
  role: string | null;
  acces: { plateforme: Plateforme; plateformeLabel: string; role: string; roleLabel: string }[];
  status: string;
}

interface Equipe {
  admins: Membre[];
  plateformes: { code: Plateforme; label: string }[];
}

interface Role {
  code: string;
  label: string;
  membres: number;
}

/** Un membre à nommer : nouveau (email saisi) ou existant (id connu). */
type Nomination = { plateforme: Plateforme; membre?: Membre };

export default function TeamScreen({ token, monId }: { token: string; monId: string }) {
  const [nomination, setNomination] = useState<Nomination | null>(null);
  const { data, erreur, enCours, recharger } = useChargement(
    () => apiFetch<Equipe>('/api/superowner/admins?limit=100', token),
    [token]
  );

  const agir = async (chemin: string, method: string, body?: unknown) => {
    try {
      await apiFetch(chemin, token, { method, body });
      await recharger();
      return true;
    } catch (e) {
      Alert.alert('Action impossible', e instanceof Error ? e.message : 'Erreur');
      return false;
    }
  };

  const retirerPlateforme = (m: Membre, plateforme: Plateforme, label: string) =>
    Alert.alert(`Retirer ${label} à ${m.name} ?`, 'Ses rôles sur les autres plateformes sont conservés.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: () => agir(`/api/superowner/admins/${m.id}/acces/${plateforme}`, 'DELETE') },
    ]);

  const sortir = (m: Membre) =>
    Alert.alert(`Sortir ${m.name} de l’équipe ?`, 'Le compte est conservé, sans aucun droit d’administration.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Sortir', style: 'destructive', onPress: () => agir(`/api/superowner/admins/${m.id}`, 'DELETE') },
    ]);

  if (enCours && !data) return <Loading />;
  if (erreur && !data) return <ErrorBox message={erreur} onRetry={recharger} />;
  const plateformes = data?.plateformes ?? [];

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={data?.admins ?? []}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12 }}
        refreshControl={<RefreshControl refreshing={enCours} onRefresh={recharger} />}
        ListHeaderComponent={
          <View style={[s.actions, { marginTop: 0, marginBottom: 10 }]}>
            <Bouton label="+ Ajouter un membre" couleur={COLORS.primary} onPress={() => setNomination({ plateforme: 'EAT' })} />
          </View>
        }
        ListEmptyComponent={<Text style={s.vide}>Aucun membre.</Text>}
        renderItem={({ item: m }) => {
          const superowner = m.role === 'SUPEROWNER';
          const reglable = !superowner && m.id !== monId;
          return (
            <View style={s.card}>
              <Text style={s.nom}>{m.name}{m.id === monId ? ' (vous)' : ''}</Text>
              <Text style={s.meta}>{m.email}{m.status !== 'ACTIVE' ? ` · ${m.status}` : ''}</Text>
              {superowner ? (
                <Text style={s.meta}>Superowner — voit tout</Text>
              ) : (
                plateformes.map((p) => {
                  const acces = m.acces.find((a) => a.plateforme === p.code);
                  return (
                    <View key={p.code} style={st.ligne}>
                      <Text style={[s.meta, { flex: 1 }]}>{p.label} : {acces ? acces.roleLabel : '—'}</Text>
                      {reglable && (
                        <TouchableOpacity onPress={() => setNomination({ plateforme: p.code, membre: m })}>
                          <Text style={st.lien}>{acces ? 'Changer' : 'Donner un rôle'}</Text>
                        </TouchableOpacity>
                      )}
                      {reglable && acces && (
                        <TouchableOpacity onPress={() => retirerPlateforme(m, p.code, p.label)}>
                          <Text style={[st.lien, { color: COLORS.danger }]}>Retirer</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
              {reglable && (
                <View style={s.actions}>
                  <Bouton label="Sortir de l’équipe" couleur={COLORS.danger} onPress={() => sortir(m)} />
                </View>
              )}
            </View>
          );
        }}
      />
      {nomination && (
        <NominationModal
          token={token}
          nomination={nomination}
          plateformes={plateformes}
          onCancel={() => setNomination(null)}
          onConfirm={async (plateforme, role, email) => {
            const ok = nomination.membre
              ? await agir(`/api/superowner/admins/${nomination.membre.id}/role`, 'PATCH', { plateforme, role })
              : await agir('/api/superowner/admins', 'POST', { email, plateforme, role });
            if (ok) setNomination(null);
          }}
        />
      )}
    </View>
  );
}

function NominationModal({
  token,
  nomination,
  plateformes,
  onCancel,
  onConfirm,
}: {
  token: string;
  nomination: Nomination;
  plateformes: { code: Plateforme; label: string }[];
  onCancel: () => void;
  onConfirm: (plateforme: Plateforme, role: string, email: string) => Promise<void>;
}) {
  const nouveau = !nomination.membre;
  const [plateforme, setPlateforme] = useState<Plateforme>(nomination.plateforme);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>(nomination.membre?.acces.find((a) => a.plateforme === nomination.plateforme)?.role ?? '');
  const [envoi, setEnvoi] = useState(false);
  const roles = useChargement(
    () => apiFetch<{ roles: Role[] }>(`/api/superowner/roles?plateforme=${plateforme}`, token).then((r) => r.roles),
    [token, plateforme]
  );
  const valide = !!role && (!nouveau || email.trim().includes('@'));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={st.backdrop}>
        <View style={st.box}>
          <Text style={st.titre}>{nouveau ? 'Ajouter un membre' : `Rôle de ${nomination.membre!.name}`}</Text>
          {nouveau && (
            <>
              <TextInput
                style={st.input}
                placeholder="Email d’un compte existant"
                placeholderTextColor={COLORS.muted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Chips
                options={plateformes.map((p) => ({ value: p.code, label: p.label }))}
                value={plateforme}
                onChange={(p) => {
                  setPlateforme(p);
                  setRole('');
                }}
              />
            </>
          )}
          <Text style={[s.meta, { marginTop: 10 }]}>Groupe</Text>
          {roles.enCours && !roles.data ? (
            <Loading />
          ) : roles.erreur ? (
            <Text style={{ color: COLORS.danger }}>{roles.erreur}</Text>
          ) : (
            (roles.data ?? []).map((r) => (
              <TouchableOpacity key={r.code} style={st.option} onPress={() => setRole(r.code)}>
                <Text style={{ color: COLORS.text, fontWeight: r.code === role ? '700' : '400' }}>
                  {r.code === role ? '● ' : '○ '}
                  {r.label} <Text style={s.meta}>({r.membres})</Text>
                </Text>
              </TouchableOpacity>
            ))
          )}
          <View style={st.boutons}>
            <TouchableOpacity onPress={onCancel} style={st.btn}>
              <Text style={{ color: '#666', fontWeight: '600' }}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={!valide || envoi}
              onPress={async () => {
                setEnvoi(true);
                await onConfirm(plateforme, role, email.trim());
                setEnvoi(false);
              }}
              style={[st.btn, { backgroundColor: COLORS.primary }, (!valide || envoi) && { opacity: 0.5 }]}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Enregistrer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  ligne: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  lien: { color: COLORS.primary, fontWeight: '600', fontSize: 13, marginLeft: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  box: { backgroundColor: '#fff', borderRadius: 12, padding: 16, maxHeight: '85%' },
  titre: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 10, color: COLORS.text, marginBottom: 8 },
  option: { paddingVertical: 8 },
  boutons: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, marginLeft: 8 },
});
