// src/components/OfflineIndicator.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Animated, Dimensions, Platform } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useUI } from '../hooks/useUI';

const { width } = Dimensions.get('window');

export default function OfflineIndicator() {
  const { isOnline } = useUI();
  const [isVisible, setIsVisible] = useState(!isOnline);
  const slideAnim = React.useRef(new Animated.Value(-60)).current;

  useEffect(() => {
    if (!isOnline) {
      // Show offline banner
      setIsVisible(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else if (isVisible) {
      // Hide offline banner
      Animated.timing(slideAnim, {
        toValue: -60,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setIsVisible(false);
      });
    }
  }, [isOnline]);

  if (!isVisible && isOnline) return null;

  // Web: small pill instead of the full-width phone banner.
  if (Platform.OS === 'web') {
    return (
      <View pointerEvents="none" style={styles.webPill}>
        <Text style={styles.webPillText}>{isOnline ? 'Back online' : 'No internet'}</Text>
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.content}>
        <ActivityIndicator size="small" color="#fff" />
        <Text style={styles.text}>
          {isOnline ? 'Back Online' : 'No Internet Connection'}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  webPill: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(244, 67, 54, 0.92)',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 12,
    zIndex: 10000,
  },
  webPillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F44336',
    paddingTop: 40,
    paddingBottom: 12,
    paddingHorizontal: 16,
    zIndex: 10000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 10,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 12,
  },
});