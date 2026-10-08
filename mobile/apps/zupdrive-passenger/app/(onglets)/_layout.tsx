import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { COLORS } from '../../components/ui';

const icone = (emoji: string) =>
  function Icone() {
    return <Text style={{ fontSize: 20 }}>{emoji}</Text>;
  };

export default function OngletsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        tabBarActiveTintColor: COLORS.primary,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Commander', tabBarIcon: icone('🚗') }} />
      <Tabs.Screen name="historique" options={{ title: 'Mes trajets', tabBarIcon: icone('📋') }} />
      <Tabs.Screen name="profil" options={{ title: 'Profil', tabBarIcon: icone('👤') }} />
    </Tabs>
  );
}
