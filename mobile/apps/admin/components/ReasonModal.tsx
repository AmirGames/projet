import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS } from './ui';

/**
 * Demande une raison avant une action sensible (suspension, refus…).
 * Alert.prompt n'existe que sur iOS : cette fenêtre fonctionne partout.
 */
export default function ReasonModal({
  visible,
  title,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (raison: string) => void;
}) {
  const [raison, setRaison] = useState('');
  // La raison repart de zéro à chaque ouverture (ajustement d'état pendant le rendu).
  const [etaitVisible, setEtaitVisible] = useState(visible);
  if (visible !== etaitVisible) {
    setEtaitVisible(visible);
    if (visible) setRaison('');
  }
  const valide = raison.trim().length >= 3;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.box}>
          <Text style={s.title}>{title}</Text>
          <TextInput
            style={s.input}
            placeholder="Raison (visible par l’intéressé)"
            placeholderTextColor={COLORS.muted}
            value={raison}
            onChangeText={setRaison}
            multiline
          />
          <View style={s.actions}>
            <TouchableOpacity onPress={onCancel} style={s.btn}>
              <Text style={s.cancel}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={!valide}
              onPress={() => onConfirm(raison.trim())}
              style={[s.btn, s.confirm, !valide && { opacity: 0.5 }]}
            >
              <Text style={s.confirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  box: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 10, minHeight: 80, textAlignVertical: 'top', color: COLORS.text },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, marginLeft: 8 },
  cancel: { color: '#666', fontWeight: '600' },
  confirm: { backgroundColor: COLORS.danger },
  confirmText: { color: '#fff', fontWeight: '600' },
});
