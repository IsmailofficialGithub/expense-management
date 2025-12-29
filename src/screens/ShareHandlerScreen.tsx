import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Image, Alert, ActivityIndicator, Platform } from 'react-native';
import { Text, Button, Card } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { useShareIntent } from 'expo-share-intent';

export default function ShareHandlerScreen() {
  const navigation = useNavigation<any>();
  const { isAuthenticated } = useAuth();
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntent();
  const [sharedImageUri, setSharedImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hasShareIntent && (shareIntent.type === 'file' || shareIntent.type === 'media') && shareIntent.files && shareIntent.files.length > 0) {
      setSharedImageUri(shareIntent.files[0].path);
      setLoading(false);
    } else if (error) {
      console.error('Share intent error:', error);
      setLoading(false);
    } else if (!hasShareIntent) {
      setLoading(false);
    }
  }, [hasShareIntent, shareIntent, error]);

  const handlePersonalExpense = () => {
    if (!sharedImageUri) {
      Alert.alert('Error', 'No image to share');
      return;
    }

    // Reset share intent after consuming it
    resetShareIntent();

    navigation.navigate('AddPersonalTransaction', {
      sharedImageUri,
    });
  };

  const handleGroupExpense = () => {
    if (!sharedImageUri) {
      Alert.alert('Error', 'No image to share');
      return;
    }

    // Reset share intent after consuming it
    resetShareIntent();

    navigation.navigate('AddExpense', {
      sharedImageUri,
    });
  };

  const handleCancel = () => {
    resetShareIntent();
    navigation.navigate('Main');
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.title}>
              Please Log In
            </Text>
            <Text variant="bodyMedium" style={styles.subtitle}>
              You need to be logged in to create expenses
            </Text>
          </Card.Content>
          <Card.Actions>
            <Button mode="contained" onPress={() => navigation.navigate('Auth')}>
              Go to Login
            </Button>
          </Card.Actions>
        </Card>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#6200EE" />
        <Text style={styles.loadingText}>Loading shared image...</Text>
      </View>
    );
  }

  if (!sharedImageUri) {
    return (
      <View style={styles.container}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.title}>
              No Image Found
            </Text>
            <Text variant="bodyMedium" style={styles.subtitle}>
              No image was shared with the app
            </Text>
          </Card.Content>
          <Card.Actions>
            <Button mode="contained" onPress={handleCancel}>
              Go to Dashboard
            </Button>
          </Card.Actions>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleLarge" style={styles.title}>
            Create Expense from Image
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Choose expense type
          </Text>

          {sharedImageUri && (
            <View style={styles.imagePreviewContainer}>
              <Image
                source={{ uri: sharedImageUri }}
                style={styles.imagePreview}
                resizeMode="cover"
              />
            </View>
          )}
        </Card.Content>

        <Card.Actions style={styles.actions}>
          <Button
            mode="contained"
            onPress={handlePersonalExpense}
            style={styles.button}
            icon="wallet"
          >
            Personal Expense
          </Button>
          <Button
            mode="contained"
            onPress={handleGroupExpense}
            style={styles.button}
            icon="account-group"
          >
            Group Expense
          </Button>
        </Card.Actions>

        <Card.Actions>
          <Button mode="text" onPress={handleCancel}>
            Cancel
          </Button>
        </Card.Actions>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    elevation: 4,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: 'bold',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 16,
    color: '#666',
  },
  imagePreviewContainer: {
    marginTop: 16,
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#e0e0e0',
  },
  imagePreview: {
    width: '100%',
    height: 200,
  },
  actions: {
    flexDirection: 'column',
    padding: 16,
    gap: 12,
  },
  button: {
    width: '100%',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
});
