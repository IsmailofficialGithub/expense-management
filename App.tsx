// App.tsx
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { installWebAlert } from './src/utils/webAlert';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ReduxProvider } from './src/store/Provider';
import { NavigationContainer, DarkTheme as NavigationDarkTheme, DefaultTheme as NavigationDefaultTheme } from '@react-navigation/native';
import { PaperProvider, MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import AppNavigator from './src/navigation/AppNavigator';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import Toast from './src/components/Toast';
import OfflineIndicator from './src/components/OfflineIndicator';
import NotificationInitializer from './src/components/NotificationInitializer';
import { useUI } from './src/hooks/useUI';
import { useShareIntent } from 'expo-share-intent';

// Combine Paper theme with Navigation theme
const CombinedLightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...NavigationDefaultTheme.colors,
  },
};

const CombinedDarkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    ...NavigationDarkTheme.colors,
  },
};

// Create a wrapper component that can access Redux state
function AppContent() {
  const { theme: userTheme } = useUI();
  const systemTheme = useColorScheme();
  const navigationRef = React.useRef<any>(null);
  // Share intents are Android/iOS only; Platform.OS never changes at runtime, so the hook order stays stable
  const { hasShareIntent } = Platform.OS === 'web' ? { hasShareIntent: false } : useShareIntent();

  // Determine the actual theme to use
  const actualTheme = userTheme === 'auto'
    ? (systemTheme === 'dark' ? 'dark' : 'light')
    : userTheme;

  const paperTheme = actualTheme === 'dark' ? CombinedDarkTheme : CombinedLightTheme;
  const navigationTheme = actualTheme === 'dark' ? NavigationDarkTheme : NavigationDefaultTheme;

  // Handle share intent navigation
  React.useEffect(() => {
    if (hasShareIntent && navigationRef.current) {
      navigationRef.current.navigate('ShareHandler');
    }
  }, [hasShareIntent]);

  // Setup notifications
  React.useEffect(() => {
    const setupNotifications = async () => {
      const { notificationsService } = await import('./src/services/notifications.service');

      // Request permissions
      await notificationsService.requestPermissions();

      // Setup listeners for navigation
      if (navigationRef.current) {
        notificationsService.setupListeners(navigationRef.current);
      }
    };

    setupNotifications();
  }, []);

  return (
    <PaperProvider theme={paperTheme}>
      <NavigationContainer
        ref={navigationRef}
        theme={navigationTheme}
      >
        <OfflineIndicator />
        <NotificationInitializer />
        <AppNavigator />
        <Toast />
        <StatusBar style={actualTheme === 'dark' ? 'light' : 'dark'} />
      </NavigationContainer>
    </PaperProvider>
  );
}

installWebAlert();

// Web: the app is designed for phones, so on wide screens it renders as a centered phone-width column
// instead of stretching every input and button across the whole window.
const webFrame = Platform.OS === 'web'
  ? StyleSheet.create({
      outer: { flex: 1, backgroundColor: '#1f2433', alignItems: 'center' },
      inner: { flex: 1, width: '100%', maxWidth: 480, overflow: 'hidden', boxShadow: '0 0 40px rgba(0,0,0,0.35)' } as any,
    })
  : null;

export default function App() {
  const app = (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ReduxProvider>
          <AppContent />
        </ReduxProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
  if (!webFrame) return app;
  return (
    <View style={webFrame.outer}>
      <View style={webFrame.inner}>{app}</View>
    </View>
  );
}