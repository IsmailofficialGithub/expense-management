// App.tsx
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { ReduxProvider } from './src/store/Provider';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import AppNavigator from './src/navigation/AppNavigator';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import Toast from './src/components/Toast';
import OfflineIndicator from './src/components/OfflineIndicator';

export default function App() {
  return (
    <ErrorBoundary>
      <ReduxProvider>
        <PaperProvider>
          <NavigationContainer>
            <OfflineIndicator />
            <AppNavigator />
            <Toast />
            <StatusBar style="auto" />
          </NavigationContainer>
        </PaperProvider>
      </ReduxProvider>
    </ErrorBoundary>
  );
}