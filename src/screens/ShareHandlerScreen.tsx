import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Image, Alert, ActivityIndicator, Dimensions } from 'react-native';
import { Text, Button, Card, useTheme, Surface, IconButton } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { useShareIntent } from 'expo-share-intent';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export default function ShareHandlerScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { isAuthenticated, initialized } = useAuth();
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntent();
  const [sharedImageUri, setSharedImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[ShareHandler] Checking share intent...', {
      hasShareIntent,
      filesCount: shareIntent?.files?.length || 0,
      error,
      initialized,
      shareIntentKeys: shareIntent ? Object.keys(shareIntent) : [],
    });

    if (hasShareIntent && shareIntent.files && shareIntent.files.length > 0) {
      const file = shareIntent.files[0];
      console.log('[ShareHandler] File received:', {
        path: file.path,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        allKeys: Object.keys(file),
      });

      // Try different possible path properties
      let uri = file.path || file.uri || file.url;
      
      // Ensure URI is properly formatted
      if (uri) {
        // On Android, paths might need file:// prefix, but content:// URIs are fine as-is
        if (!uri.startsWith('file://') && !uri.startsWith('content://') && !uri.startsWith('http') && !uri.startsWith('/')) {
          uri = `file://${uri}`;
        }
        
        console.log('[ShareHandler] ✅ Setting image URI:', uri);
        setSharedImageUri(uri);
        setLoading(false);
      } else {
        console.error('[ShareHandler] ❌ No path/uri found in file object. File object:', JSON.stringify(file, null, 2));
        setLoading(false);
      }
    } else if (hasShareIntent && shareIntent.text) {
      // Handle text sharing (not image)
      console.log('[ShareHandler] Text shared (not image):', shareIntent.text);
      setLoading(false);
    } else if (error) {
      console.error('[ShareHandler] ❌ Share intent error:', error);
      setLoading(false);
    } else if (initialized && !hasShareIntent) {
      // If we've initialized and there's no share intent, maybe we were opened normally?
      // Wait a bit just in case it takes time to populate
      console.log('[ShareHandler] No share intent, waiting...');
      const timer = setTimeout(() => {
        if (!hasShareIntent) {
          console.log('[ShareHandler] No share intent after timeout');
          setLoading(false);
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [hasShareIntent, shareIntent, error, initialized]);

  const handlePersonalExpense = () => {
    if (!sharedImageUri) {
      Alert.alert('Error', 'No image to share');
      return;
    }

    const uri = sharedImageUri;
    // We navigate first, then reset to avoid state loss in this screen during transition
    navigation.navigate('AddPersonalTransaction', {
      sharedImageUri: uri,
    });

    // We delay reset slightly or handle it in navigation callback if possible
    // But resetShareIntent usually clears the native bridge state
    setTimeout(() => resetShareIntent(), 500);
  };

  const handleGroupExpense = () => {
    if (!sharedImageUri) {
      Alert.alert('Error', 'No image to share');
      return;
    }

    const uri = sharedImageUri;
    navigation.navigate('AddExpense', {
      sharedImageUri: uri,
    });

    setTimeout(() => resetShareIntent(), 500);
  };

  const handleCancel = () => {
    resetShareIntent();
    navigation.navigate('Main');
  };

  if (!initialized || loading) {
    return (
      <View style={styles.centered}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.primary, opacity: 0.1 }]} />
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.loadingText, { color: theme.colors.onSurfaceVariant }]}>
          Processing shared content...
        </Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.primary, opacity: 0.05 }]} />
        <Surface style={styles.glassCard}>
          <View style={styles.errorIconContainer}>
            <Ionicons name="lock-closed-outline" size={60} color={theme.colors.error} />
          </View>
          <Text variant="headlineSmall" style={styles.title}>Session Required</Text>
          <Text variant="bodyLarge" style={styles.subtitle}>
            Please log in to your account to save this expense.
          </Text>
          <Button
            mode="contained"
            onPress={() => navigation.navigate('Auth')}
            style={styles.actionButton}
            contentStyle={styles.buttonContent}
          >
            Go to Login
          </Button>
          <Button mode="text" onPress={handleCancel} style={styles.textButton}>
            Cancel
          </Button>
        </Surface>
      </View>
    );
  }

  if (!sharedImageUri) {
    return (
      <View style={styles.container}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#6200EE', opacity: 0.05 }]} />
        <Surface style={styles.glassCard}>
          <View style={styles.errorIconContainer}>
            <Ionicons name="image-outline" size={60} color={theme.colors.onSurfaceVariant} />
          </View>
          <Text variant="headlineSmall" style={styles.title}>No Content Found</Text>
          <Text variant="bodyLarge" style={styles.subtitle}>
            We couldn't find any image or file shared with the app.
          </Text>
          <Button
            mode="contained"
            onPress={handleCancel}
            style={styles.actionButton}
            contentStyle={styles.buttonContent}
          >
            Back to Dashboard
          </Button>
        </Surface>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.primaryContainer, opacity: 0.2 }]} />

      <View style={styles.content}>
        <Text variant="headlineMedium" style={styles.headerTitle}>New Expense</Text>
        <Text variant="bodyLarge" style={styles.headerSubtitle}>
          Complete your expense by choosing where to save it.
        </Text>

        <View style={styles.previewContainer}>
          <Surface style={styles.imageCard}>
            <Image
              source={{ uri: sharedImageUri }}
              style={styles.imagePreview}
              resizeMode="cover"
              onError={(error) => {
                console.error('[ShareHandler] Image load error:', error.nativeEvent.error);
                Alert.alert(
                  'Image Error',
                  'Failed to load the shared image. The file might be corrupted or inaccessible.',
                  [{ text: 'OK' }]
                );
              }}
              onLoad={() => {
                console.log('[ShareHandler] Image loaded successfully');
              }}
            />
            <BlurView intensity={30} style={styles.imageOverlay}>
              <IconButton icon="image" iconColor="#fff" size={24} />
            </BlurView>
          </Surface>
        </View>

        <View style={styles.optionsContainer}>
          <Surface style={styles.optionCard}>
            <IconButton
              icon="wallet-outline"
              size={32}
              iconColor={theme.colors.primary}
              style={styles.optionIcon}
            />
            <View style={styles.optionTextContainer}>
              <Text variant="titleMedium">Personal Finance</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Track this as your own personal spending.
              </Text>
            </View>
            <Button
              mode="contained"
              onPress={handlePersonalExpense}
              style={styles.selectButton}
              labelStyle={{ fontSize: 12 }}
            >
              Choose
            </Button>
          </Surface>

          <Surface style={styles.optionCard}>
            <IconButton
              icon="account-group-outline"
              size={32}
              iconColor={theme.colors.secondary}
              style={styles.optionIcon}
            />
            <View style={styles.optionTextContainer}>
              <Text variant="titleMedium">Group Expense</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Split this with your flatmates or friends.
              </Text>
            </View>
            <Button
              mode="contained"
              onPress={handleGroupExpense}
              style={[styles.selectButton, { backgroundColor: theme.colors.secondary }]}
              labelStyle={{ fontSize: 12 }}
            >
              Choose
            </Button>
          </Surface>
        </View>

        <Button
          mode="text"
          onPress={handleCancel}
          style={styles.cancelButton}
          textColor={theme.colors.error}
        >
          Cancel and Discard
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  headerTitle: {
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  headerSubtitle: {
    textAlign: 'center',
    color: '#666',
    marginBottom: 32,
  },
  glassCard: {
    padding: 32,
    borderRadius: 24,
    width: '100%',
    maxWidth: 360,
    elevation: 4,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  errorIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    textAlign: 'center',
    color: '#666',
    marginBottom: 32,
    lineHeight: 22,
  },
  actionButton: {
    width: '100%',
    borderRadius: 12,
    marginBottom: 12,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  textButton: {
    width: '100%',
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    fontWeight: '500',
  },
  previewContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  imageCard: {
    width: width - 48,
    height: 240,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 8,
    backgroundColor: '#000',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    borderRadius: 20,
    overflow: 'hidden',
  },
  optionsContainer: {
    gap: 16,
    marginBottom: 40,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    elevation: 2,
    backgroundColor: '#fff',
  },
  optionIcon: {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    margin: 0,
  },
  optionTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  selectButton: {
    borderRadius: 10,
    minWidth: 80,
  },
  cancelButton: {
    marginTop: 'auto',
    marginBottom: 20,
  },
});