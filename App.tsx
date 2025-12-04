// App.tsx
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
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
  
  // Determine the actual theme to use
  const actualTheme = userTheme === 'auto' 
    ? (systemTheme === 'dark' ? 'dark' : 'light')
    : userTheme;
  
  const paperTheme = actualTheme === 'dark' ? CombinedDarkTheme : CombinedLightTheme;
  const navigationTheme = actualTheme === 'dark' ? NavigationDarkTheme : NavigationDefaultTheme;

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

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ReduxProvider>
          <AppContent />
        </ReduxProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}