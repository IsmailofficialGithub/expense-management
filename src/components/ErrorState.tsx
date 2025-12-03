// src/components/ErrorState.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Icon } from 'react-native-paper';
import { useTheme } from 'react-native-paper';

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  retryLabel?: string;
  icon?: string;
}

export default function ErrorState({ 
  message, 
  onRetry, 
  retryLabel = 'Retry',
  icon = 'alert-circle'
}: ErrorStateProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Icon 
        source={icon} 
        size={64} 
        color={theme.colors.error}
      />
      <Text 
        variant="titleMedium" 
        style={[styles.message, { color: theme.colors.error }]}
      >
        {message}
      </Text>
      <Button
        mode="contained"
        onPress={onRetry}
        icon="refresh"
        style={styles.retryButton}
        buttonColor={theme.colors.primary}
      >
        {retryLabel}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  message: {
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  retryButton: {
    marginTop: 8,
  },
});

