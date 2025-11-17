// src/components/OfflineIndicator.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
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