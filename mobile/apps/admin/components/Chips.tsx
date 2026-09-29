import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { COLORS } from './ui';

/** Filtres horizontaux (par état, par priorité…). */
export default function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bar} contentContainerStyle={s.content}>
      {options.map((o) => (
        <TouchableOpacity key={o.value} onPress={() => onChange(o.value)} style={[s.chip, o.value === value && s.active]}>
          <Text style={[s.text, o.value === value && s.activeText]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  bar: { flexGrow: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  content: { paddingHorizontal: 8, paddingVertical: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: COLORS.bg, marginHorizontal: 4 },
  active: { backgroundColor: COLORS.primary },
  text: { color: COLORS.text, fontSize: 13 },
  activeText: { color: '#fff', fontWeight: '600' },
});
