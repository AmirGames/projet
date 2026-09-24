import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuthStore } from './src/store/authStore';
import { socketManager } from '@zupone/shared';

export default function App() {
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    // Setup Socket.IO when authenticated
    if (isAuthenticated) {
      // Will connect on next screen mount
    }
  }, [isAuthenticated]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RootNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
